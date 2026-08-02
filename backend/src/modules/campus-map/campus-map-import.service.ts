import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import * as childProcess from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(childProcess.execFile);
const IMPORT_GROUP = 'campus_map_import';
const CAD_CONVERTER_CONFIG_KEY = 'campus_map_cad_converter';
const MAX_IMPORT_BYTES = 80 * 1024 * 1024;
const SUPPORTED_EXTENSIONS = new Set(['.dxf', '.dwg', '.geojson', '.json', '.png', '.jpg', '.jpeg']);

type ImportStatus = 'queued' | 'processing' | 'draft_ready' | 'needs_converter' | 'failed';
type CadPoint = { x: number; y: number };
type RawCadFeature = {
  entityType: string;
  kind: 'point' | 'line' | 'polygon' | 'text';
  layer: string;
  title?: string;
  points: CadPoint[];
};

type ImportDraft = {
  editorMode: 'image';
  baseSource: 'cad-vector' | 'image';
  title: string;
  mapWidth: number;
  mapHeight: number;
  bbox: number[];
  coordinateSystem: Record<string, any>;
  imageMap?: Record<string, any> | null;
  pois: Array<Record<string, any>>;
  areas: Array<Record<string, any>>;
  routes: Array<Record<string, any>>;
  semanticCategories: Array<Record<string, any>>;
};

type ImportReport = {
  summary: string[];
  warnings: string[];
  layers: Array<{
    name: string;
    role: string;
    featureCount: number;
    importedCount: number;
  }>;
};

export type CampusMapImportJob = {
  id: string;
  regionId: string;
  status: ImportStatus;
  progress: number;
  message: string;
  source: {
    fileName: string;
    fileExt: string;
    fileSize: number;
    mimeType: string;
    url: string;
    path: string;
  };
  report: ImportReport;
  draft: ImportDraft | null;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
};

type ConverterCandidate = {
  path: string;
  source: 'env' | 'admin_config' | 'auto' | 'path';
  exists: boolean;
  executable: boolean;
  reason?: string;
};

export type CampusMapConverterStatus = {
  ready: boolean;
  path: string;
  source: ConverterCandidate['source'] | 'missing';
  message: string;
  checkedAt: string;
  platform: string;
  envConfigured: boolean;
  adminConfigured: boolean;
  candidates: ConverterCandidate[];
  instructions: string[];
};

class CampusMapNeedsConverterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CampusMapNeedsConverterError';
  }
}

@Injectable()
export class CampusMapImportService implements OnModuleInit {
  private readonly logger = new Logger(CampusMapImportService.name);
  private readonly activeJobAborters = new Map<string, AbortController>();
  // ponytail: process-local only; multi-instance converters need a dedicated job table with database claims.
  private readonly regionWriteTails = new Map<string, Promise<void>>();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      await this.recoverInterruptedJobs();
    } catch (error: any) {
      this.logger.warn(`校园地图导入任务恢复失败: ${error?.message || error}`);
    }
  }

  async createImport(regionId: string, file: Express.Multer.File, adminId?: string) {
    const normalizedRegionId = this.normalizeRegionId(regionId);
    this.validateImportFile(file);

    const now = new Date().toISOString();
    const jobId = `cad_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const fileExt = path.extname(file.originalname || '').toLowerCase();
    const safeName = `${jobId}${fileExt}`;
    const relativePath = path.posix.join('uploads', 'campus-map-imports', normalizedRegionId, jobId, safeName);
    const absolutePath = path.join(this.projectRoot(), relativePath);

    await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true });
    if (file.buffer) {
      await fs.promises.writeFile(absolutePath, file.buffer);
    } else if ((file as any).path) {
      await fs.promises.copyFile((file as any).path, absolutePath);
    } else {
      throw new BadRequestException('上传文件内容为空，无法导入 CAD');
    }

    const job: CampusMapImportJob = {
      id: jobId,
      regionId: normalizedRegionId,
      status: 'queued',
      progress: 0,
      message: '文件已上传，等待后端转换',
      source: {
        fileName: this.safeDisplayName(file.originalname || safeName),
        fileExt,
        fileSize: Number(file.size || 0),
        mimeType: String(file.mimetype || ''),
        url: `/${relativePath}`,
        path: absolutePath,
      },
      report: { summary: [], warnings: [], layers: [] },
      draft: null,
      createdAt: now,
      updatedAt: now,
      createdBy: adminId,
    };

    await this.saveJob(job);
    if (process.env.NODE_ENV !== 'test') {
      setImmediate(() => {
        this.processImportJob(normalizedRegionId, jobId).catch((error) => {
          this.logger.error(`校园地图 CAD 导入任务失败: ${jobId}`, error?.stack || error);
        });
      });
    }
    return this.publicJob(job);
  }

  async listImports(regionId: string) {
    const jobs = await this.readJobs(this.normalizeRegionId(regionId));
    return jobs.map((job) => this.publicJob(job));
  }

  async getImport(regionId: string, jobId: string) {
    const job = await this.findJob(this.normalizeRegionId(regionId), jobId);
    return this.publicJob(job);
  }

  async retryImportJob(regionId: string, jobId: string, adminId?: string) {
    const normalizedRegionId = this.normalizeRegionId(regionId);
    const job = await this.findJob(normalizedRegionId, jobId);
    if (!['needs_converter', 'failed'].includes(job.status)) {
      return this.publicJob(job);
    }

    const queued = await this.updateJob(normalizedRegionId, jobId, {
      status: 'queued',
      progress: 0,
      message: '已重新提交转换任务，正在等待后端处理',
      draft: null,
      report: { summary: [], warnings: [], layers: [] },
      createdBy: job.createdBy || adminId,
    }, adminId);

    if (process.env.NODE_ENV !== 'test') {
      setImmediate(() => {
        this.processImportJob(normalizedRegionId, jobId).catch((error) => {
          this.logger.error(`校园地图 CAD 导入任务重试失败: ${jobId}`, error?.stack || error);
        });
      });
    }
    return queued;
  }

  async deleteImportJob(regionId: string, jobId: string, adminId?: string) {
    const normalizedRegionId = this.normalizeRegionId(regionId);
    const job = await this.findJob(normalizedRegionId, jobId);
    this.activeJobAborters.get(this.jobKey(normalizedRegionId, jobId))?.abort();

    await this.withRegionWrite(normalizedRegionId, async () => {
      const jobs = (await this.readJobs(normalizedRegionId)).filter((item) => item.id !== jobId);
      await this.saveJobs(normalizedRegionId, jobs, adminId || job.createdBy);
    });
    await this.removeImportFiles(job);
    return { id: jobId, deleted: true };
  }

  async getConverterStatus(): Promise<CampusMapConverterStatus> {
    const configuredPath = await this.readConfiguredConverterPath();
    return this.resolveConverterStatus(configuredPath);
  }

  async saveConverterConfig(dto: { converterPath?: string | null }, adminId?: string) {
    const converterPath = this.normalizeConfiguredConverterPath(dto?.converterPath);
    await this.prisma.config.upsert({
      where: { key: CAD_CONVERTER_CONFIG_KEY },
      create: {
        key: CAD_CONVERTER_CONFIG_KEY,
        value: { converterPath },
        group: IMPORT_GROUP,
        desc: '校园地图 DWG 转 DXF 转换器路径配置',
        isEnabled: true,
        createdBy: adminId,
        updatedBy: adminId,
      },
      update: {
        value: { converterPath },
        group: IMPORT_GROUP,
        desc: '校园地图 DWG 转 DXF 转换器路径配置',
        isEnabled: true,
        updatedBy: adminId,
      },
    });
    const status = await this.resolveConverterStatus(converterPath);
    return {
      converterPath,
      status,
    };
  }

  async processImportJob(regionId: string, jobId: string) {
    const normalizedRegionId = this.normalizeRegionId(regionId);
    const key = this.jobKey(normalizedRegionId, jobId);
    const aborter = new AbortController();
    this.activeJobAborters.set(key, aborter);

    try {
      const queued = await this.findJob(normalizedRegionId, jobId);
      await this.updateJob(normalizedRegionId, jobId, {
        status: 'processing',
        progress: 0,
        message: '正在转换并解析图纸，请等待当前步骤完成',
      });
      const result = await this.convertSourceToDraft(queued, aborter.signal);
      if (!(await this.jobExists(normalizedRegionId, jobId))) return null;
      return this.updateJob(normalizedRegionId, jobId, {
        status: 'draft_ready',
        progress: 100,
        message: '转换完成，可应用到地图工作台',
        draft: result.draft,
        report: result.report,
      });
    } catch (error: any) {
      if (aborter.signal.aborted || !(await this.jobExists(normalizedRegionId, jobId))) return null;
      const status: ImportStatus = error instanceof CampusMapNeedsConverterError ? 'needs_converter' : 'failed';
      return this.updateJob(normalizedRegionId, jobId, {
        status,
        progress: 0,
        message: error?.message || 'CAD 转换失败',
        report: {
          summary: [],
          warnings: [error?.message || 'CAD 转换失败'],
          layers: [],
        },
      });
    } finally {
      this.activeJobAborters.delete(key);
    }
  }

  convertDxfTextToDraft(text: string, sourceName = 'campus-map.dxf') {
    const rawFeatures = this.parseDxf(text);
    return this.rawFeaturesToDraft(rawFeatures, sourceName);
  }

  convertGeoJsonToDraft(value: any, sourceName = 'campus-map.geojson') {
    const collection = this.asFeatureCollection(value);
    const rawFeatures = this.geoJsonFeaturesToRawFeatures(collection.features || []);
    return this.rawFeaturesToDraft(rawFeatures, sourceName);
  }

  private async convertSourceToDraft(job: CampusMapImportJob, signal?: AbortSignal) {
    const ext = job.source.fileExt;
    if (ext === '.dxf') {
      const text = await fs.promises.readFile(job.source.path, 'utf8');
      return this.convertDxfTextToDraft(text, job.source.fileName);
    }
    if (ext === '.geojson' || ext === '.json') {
      const raw = await fs.promises.readFile(job.source.path, 'utf8');
      return this.convertGeoJsonToDraft(JSON.parse(raw), job.source.fileName);
    }
    if (ext === '.dwg') {
      const dxfPath = await this.convertDwgToDxf(job.source.path, signal);
      const text = await fs.promises.readFile(dxfPath, 'utf8');
      return this.convertDxfTextToDraft(text, job.source.fileName);
    }
    if (['.png', '.jpg', '.jpeg'].includes(ext)) {
      return this.imageToDraft(job);
    }
    throw new BadRequestException(`暂不支持 ${ext || '未知'} 格式，请上传 DXF、DWG、GeoJSON 或校园底图图片`);
  }

  private imageToDraft(job: CampusMapImportJob): { draft: ImportDraft; report: ImportReport } {
    return {
      draft: {
        editorMode: 'image',
        baseSource: 'image',
        title: job.source.fileName.replace(/\.[^.]+$/, ''),
        mapWidth: 1200,
        mapHeight: 800,
        bbox: [0, 0, 1200, 800],
        coordinateSystem: { type: 'image', unit: 'pixel', origin: 'top-left', source: 'uploaded-image' },
        imageMap: { imageUrl: job.source.url, width: 1200, height: 800, opacity: 1 },
        pois: [],
        areas: [],
        routes: [],
        semanticCategories: this.semanticCategories(),
      },
      report: {
        summary: ['已作为校园底图导入，可继续手动绘制建筑、路线和点位'],
        warnings: ['图片无法自动识别建筑轮廓，如需自动生成建筑请上传 DXF/DWG 图纸'],
        layers: [],
      },
    };
  }

  private async convertDwgToDxf(sourcePath: string, signal?: AbortSignal) {
    const converter = await this.findOdaConverter();
    if (!converter) {
      throw new CampusMapNeedsConverterError('服务器未检测到 ODA File Converter，DWG 无法自动转 DXF；请安装 ODA 或先把 DWG 导出为 DXF 后上传');
    }

    const sourceDir = path.dirname(sourcePath);
    const outputDir = path.join(sourceDir, 'converted-dxf');
    await fs.promises.mkdir(outputDir, { recursive: true });
    await execFileAsync(converter, [sourceDir, outputDir, 'ACAD2018', 'DXF', '0', '1'], { timeout: 120000, signal });

    const expected = path.join(outputDir, `${path.basename(sourcePath, path.extname(sourcePath))}.dxf`);
    if (fs.existsSync(expected)) return expected;
    const files = await fs.promises.readdir(outputDir);
    const dxf = files.find((file) => file.toLowerCase().endsWith('.dxf'));
    if (!dxf) {
      throw new BadRequestException('DWG 已调用转换器，但没有生成 DXF 文件，请检查图纸是否损坏或含有不可识别对象');
    }
    return path.join(outputDir, dxf);
  }

  private async findOdaConverter() {
    const status = await this.getConverterStatus();
    return status.ready ? status.path : '';
  }

  private async readConfiguredConverterPath() {
    const record = await this.prisma.config.findUnique({ where: { key: CAD_CONVERTER_CONFIG_KEY } });
    const value = record?.value && typeof record.value === 'object' && !Array.isArray(record.value) ? record.value as any : {};
    return this.normalizeConfiguredConverterPath(value.converterPath || value.path || '');
  }

  private normalizeConfiguredConverterPath(value?: string | null) {
    const next = String(value || '').trim();
    if (!next) return '';
    if (next.includes('\0') || next.includes('\n') || next.includes('\r')) {
      throw new BadRequestException('转换器路径格式不正确');
    }
    if (!path.isAbsolute(next)) {
      throw new BadRequestException('转换器路径必须使用服务器绝对路径');
    }
    if (next.length > 500) {
      throw new BadRequestException('转换器路径过长');
    }
    return next;
  }

  private resolveConverterStatus(configuredPath = ''): CampusMapConverterStatus {
    const candidates = this.converterCandidates(configuredPath);
    const checked = candidates.map((candidate) => this.inspectConverterCandidate(candidate));
    const ready = checked.find((candidate) => candidate.exists && candidate.executable);
    return {
      ready: !!ready,
      path: ready?.path || '',
      source: ready?.source || 'missing',
      message: ready
        ? `已检测到 ODA File Converter：${ready.path}`
        : '服务器未检测到可执行的 ODA File Converter，DWG 无法自动转 DXF',
      checkedAt: new Date().toISOString(),
      platform: process.platform,
      envConfigured: !!String(process.env.ODA_FILE_CONVERTER || '').trim(),
      adminConfigured: !!configuredPath,
      candidates: checked,
      instructions: this.converterInstallInstructions(),
    };
  }

  private converterCandidates(configuredPath = '') {
    const candidates: Array<{ path: string; source: ConverterCandidate['source'] }> = [
      { path: String(process.env.ODA_FILE_CONVERTER || '').trim(), source: 'env' },
      { path: configuredPath, source: 'admin_config' },
      { path: '/usr/bin/ODAFileConverter', source: 'auto' },
      { path: '/usr/local/bin/ODAFileConverter', source: 'auto' },
      { path: '/opt/ODAFileConverter/ODAFileConverter', source: 'auto' },
      { path: '/opt/oda/ODAFileConverter', source: 'auto' },
      { path: '/opt/ODA/ODAFileConverter', source: 'auto' },
      { path: '/snap/bin/ODAFileConverter', source: 'auto' },
      { path: '/Applications/ODAFileConverter.app/Contents/MacOS/ODAFileConverter', source: 'auto' },
      { path: '/opt/homebrew/bin/ODAFileConverter', source: 'auto' },
      ...this.pathEnvironmentCandidates(),
    ];

    const seen = new Set<string>();
    return candidates
      .map((candidate) => ({ ...candidate, path: String(candidate.path || '').trim() }))
      .filter((candidate) => candidate.path && !seen.has(candidate.path) && seen.add(candidate.path));
  }

  private pathEnvironmentCandidates() {
    return String(process.env.PATH || '')
      .split(path.delimiter)
      .map((item) => item.trim())
      .filter(Boolean)
      .map((dir) => ({ path: path.join(dir, 'ODAFileConverter'), source: 'path' as const }));
  }

  private inspectConverterCandidate(candidate: { path: string; source: ConverterCandidate['source'] }): ConverterCandidate {
    const exists = fs.existsSync(candidate.path);
    let executable = false;
    let reason = exists ? '' : 'not_found';
    if (exists) {
      try {
        fs.accessSync(candidate.path, fs.constants.X_OK);
        executable = true;
      } catch {
        reason = 'not_executable';
      }
    }
    return { ...candidate, exists, executable, reason };
  }

  private converterInstallInstructions() {
    return [
      '生产服务器安装 ODA File Converter 后，优先在后端 .env 配置 ODA_FILE_CONVERTER=/绝对路径/ODAFileConverter',
      'Linux 常见路径：/usr/bin/ODAFileConverter、/usr/local/bin/ODAFileConverter、/opt/ODAFileConverter/ODAFileConverter',
      '如果服务器已安装但路径不同，可在后台保存转换器绝对路径；保存后重新转换失败的 DWG 导入任务',
      '临时方案：把 DWG 在 CAD 软件中另存为 DXF 后上传，后端可直接解析 DXF',
    ];
  }

  private parseDxf(text: string): RawCadFeature[] {
    const pairs = this.toDxfPairs(text);
    const features: RawCadFeature[] = [];
    for (let index = 0; index < pairs.length; index += 1) {
      const pair = pairs[index];
      if (pair.code !== 0) continue;
      const type = String(pair.value || '').trim().toUpperCase();
      if (type === 'LINE') {
        const { entity, nextIndex } = this.collectEntityPairs(pairs, index + 1);
        const line = this.parseLineEntity(entity);
        if (line) features.push(line);
        index = nextIndex - 1;
      } else if (type === 'LWPOLYLINE') {
        const { entity, nextIndex } = this.collectEntityPairs(pairs, index + 1);
        const polyline = this.parseLwPolylineEntity(entity);
        if (polyline) features.push(polyline);
        index = nextIndex - 1;
      } else if (type === 'POLYLINE') {
        const parsed = this.parsePolylineEntity(pairs, index);
        if (parsed.feature) features.push(parsed.feature);
        index = parsed.nextIndex - 1;
      } else if (type === 'TEXT' || type === 'MTEXT') {
        const { entity, nextIndex } = this.collectEntityPairs(pairs, index + 1);
        const textFeature = this.parseTextEntity(type, entity);
        if (textFeature) features.push(textFeature);
        index = nextIndex - 1;
      } else if (type === 'POINT') {
        const { entity, nextIndex } = this.collectEntityPairs(pairs, index + 1);
        const point = this.parsePointEntity(entity);
        if (point) features.push(point);
        index = nextIndex - 1;
      }
    }
    return features;
  }

  private toDxfPairs(text: string) {
    const lines = String(text || '').replace(/\r/g, '').split('\n');
    const pairs: Array<{ code: number; value: string }> = [];
    for (let index = 0; index < lines.length - 1; index += 2) {
      const code = Number(String(lines[index]).trim());
      const value = String(lines[index + 1] || '').trim();
      if (Number.isFinite(code)) pairs.push({ code, value });
    }
    return pairs;
  }

  private collectEntityPairs(pairs: Array<{ code: number; value: string }>, startIndex: number) {
    const entity: Array<{ code: number; value: string }> = [];
    let index = startIndex;
    while (index < pairs.length && pairs[index].code !== 0) {
      entity.push(pairs[index]);
      index += 1;
    }
    return { entity, nextIndex: index };
  }

  private parseLineEntity(entity: Array<{ code: number; value: string }>): RawCadFeature | null {
    const layer = this.entityText(entity, 8) || 'default';
    const start = this.entityPoint(entity, 10, 20);
    const end = this.entityPoint(entity, 11, 21);
    if (!start || !end) return null;
    return { entityType: 'LINE', kind: 'line', layer, points: [start, end] };
  }

  private parsePointEntity(entity: Array<{ code: number; value: string }>): RawCadFeature | null {
    const layer = this.entityText(entity, 8) || 'default';
    const point = this.entityPoint(entity, 10, 20);
    if (!point) return null;
    return { entityType: 'POINT', kind: 'point', layer, points: [point] };
  }

  private parseLwPolylineEntity(entity: Array<{ code: number; value: string }>): RawCadFeature | null {
    const layer = this.entityText(entity, 8) || 'default';
    const closedFlag = Number(this.entityText(entity, 70) || 0);
    const points = this.repeatedPoints(entity, 10, 20);
    if (points.length < 2) return null;
    const isClosed = Boolean(closedFlag & 1) || this.isClosed(points);
    return { entityType: 'LWPOLYLINE', kind: isClosed && points.length >= 3 ? 'polygon' : 'line', layer, points: this.closeIfNeeded(points, isClosed) };
  }

  private parsePolylineEntity(pairs: Array<{ code: number; value: string }>, startIndex: number) {
    const { entity } = this.collectEntityPairs(pairs, startIndex + 1);
    const layer = this.entityText(entity, 8) || 'default';
    const closedFlag = Number(this.entityText(entity, 70) || 0);
    const points: CadPoint[] = [];
    let index = startIndex + 1 + entity.length;
    while (index < pairs.length) {
      const type = String(pairs[index].value || '').trim().toUpperCase();
      if (pairs[index].code === 0 && type === 'VERTEX') {
        const collected = this.collectEntityPairs(pairs, index + 1);
        const point = this.entityPoint(collected.entity, 10, 20);
        if (point) points.push(point);
        index = collected.nextIndex;
        continue;
      }
      if (pairs[index].code === 0 && type === 'SEQEND') {
        index += 1;
      }
      break;
    }
    const isClosed = Boolean(closedFlag & 1) || this.isClosed(points);
    const feature = points.length >= 2
      ? { entityType: 'POLYLINE', kind: isClosed && points.length >= 3 ? 'polygon' as const : 'line' as const, layer, points: this.closeIfNeeded(points, isClosed) }
      : null;
    return { feature, nextIndex: index };
  }

  private parseTextEntity(entityType: string, entity: Array<{ code: number; value: string }>): RawCadFeature | null {
    const layer = this.entityText(entity, 8) || 'default';
    const point = this.entityPoint(entity, 10, 20);
    const title = this.cleanCadText(this.entityText(entity, 1) || this.entityText(entity, 3) || '');
    if (!point || !title) return null;
    return { entityType, kind: 'text', layer, title, points: [point] };
  }

  private entityText(entity: Array<{ code: number; value: string }>, code: number) {
    return entity.find((item) => item.code === code)?.value || '';
  }

  private entityPoint(entity: Array<{ code: number; value: string }>, xCode: number, yCode: number): CadPoint | null {
    const x = Number(this.entityText(entity, xCode));
    const y = Number(this.entityText(entity, yCode));
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
  }

  private repeatedPoints(entity: Array<{ code: number; value: string }>, xCode: number, yCode: number) {
    const points: CadPoint[] = [];
    for (let index = 0; index < entity.length; index += 1) {
      if (entity[index].code !== xCode) continue;
      const x = Number(entity[index].value);
      let y: number | null = null;
      for (let yIndex = index + 1; yIndex < entity.length; yIndex += 1) {
        if (entity[yIndex].code === xCode) break;
        if (entity[yIndex].code === yCode) {
          y = Number(entity[yIndex].value);
          break;
        }
      }
      if (Number.isFinite(x) && Number.isFinite(y)) points.push({ x, y: Number(y) });
    }
    return points;
  }

  private geoJsonFeaturesToRawFeatures(features: any[]) {
    const raw: RawCadFeature[] = [];
    features.forEach((feature, index) => {
      const properties = feature?.properties || {};
      const layer = String(properties.layer || properties.Layer || properties.category || 'geojson');
      const title = String(properties.title || properties.name || properties.Text || `对象 ${index + 1}`);
      const geometry = feature?.geometry;
      if (!geometry) return;
      if (geometry.type === 'Point' && Array.isArray(geometry.coordinates)) {
        raw.push({ entityType: 'GEOJSON_POINT', kind: 'point', layer, title, points: [{ x: Number(geometry.coordinates[0]), y: Number(geometry.coordinates[1]) }] });
      } else if (geometry.type === 'LineString') {
        raw.push({ entityType: 'GEOJSON_LINE', kind: 'line', layer, title, points: this.coordinatesToPoints(geometry.coordinates) });
      } else if (geometry.type === 'Polygon') {
        raw.push({ entityType: 'GEOJSON_POLYGON', kind: 'polygon', layer, title, points: this.closeIfNeeded(this.coordinatesToPoints(geometry.coordinates?.[0] || []), true) });
      }
    });
    return raw.filter((item) => item.points.length);
  }

  private rawFeaturesToDraft(rawFeatures: RawCadFeature[], sourceName: string): { draft: ImportDraft; report: ImportReport } {
    if (!rawFeatures.length) {
      throw new BadRequestException('没有在图纸中识别到可导入的线、区域或文字标注');
    }

    const normalization = this.createCoordinateNormalizer(rawFeatures);
    const normalizedFeatures = rawFeatures.map((feature) => ({
      ...feature,
      points: feature.points.map((point) => normalization.normalize(point)),
    }));
    const bbox = this.calculateBBox(normalizedFeatures.flatMap((feature) => feature.points));
    const width = Math.max(100, Math.ceil(bbox[2] - bbox[0]));
    const height = Math.max(100, Math.ceil(bbox[3] - bbox[1]));
    const toRatio = (point: CadPoint) => ({
      xRatio: this.roundRatio((point.x - bbox[0]) / Math.max(1, bbox[2] - bbox[0])),
      yRatio: this.roundRatio(1 - (point.y - bbox[1]) / Math.max(1, bbox[3] - bbox[1])),
    });

    const pois: Array<Record<string, any>> = [];
    const areas: Array<Record<string, any>> = [];
    const routes: Array<Record<string, any>> = [];
    const layerStats = new Map<string, { name: string; role: string; featureCount: number; importedCount: number }>();
    const addLayerStat = (layer: string, role: string, imported: boolean) => {
      const key = layer || 'default';
      const current = layerStats.get(key) || { name: key, role, featureCount: 0, importedCount: 0 };
      current.featureCount += 1;
      if (imported) current.importedCount += 1;
      if (current.role === 'other') current.role = role;
      layerStats.set(key, current);
    };

    normalizedFeatures.forEach((feature, index) => {
      const role = this.inferFeatureRole(feature);
      const semantic = this.inferSemantic(feature.title || feature.layer || '');
      const title = this.cleanCadText(feature.title || feature.layer || `${role.label} ${index + 1}`);
      if (feature.kind === 'polygon' && feature.points.length >= 4) {
        areas.push({
          id: `area_import_${areas.length + 1}`,
          title,
          category: role.category,
          semanticType: semantic.type,
          icon: semantic.icon,
          color: semantic.color,
          sourceLayer: feature.layer,
          points: feature.points.slice(0, -1).map(toRatio),
        });
        addLayerStat(feature.layer, role.role, true);
      } else if (feature.kind === 'line' && feature.points.length >= 2) {
        routes.push({
          id: `route_import_${routes.length + 1}`,
          title,
          category: role.category,
          semanticType: semantic.type,
          icon: semantic.icon,
          color: semantic.color,
          sourceLayer: feature.layer,
          points: feature.points.map(toRatio),
        });
        addLayerStat(feature.layer, role.role, true);
      } else if ((feature.kind === 'point' || feature.kind === 'text') && feature.points.length) {
        const usefulTitle = this.isUsefulText(title) ? title : `${role.label} ${pois.length + 1}`;
        pois.push({
          id: `poi_import_${pois.length + 1}`,
          title: usefulTitle,
          category: semantic.poiCategory,
          semanticType: semantic.type,
          icon: semantic.icon,
          color: semantic.color,
          sourceLayer: feature.layer,
          ...toRatio(feature.points[0]),
        });
        addLayerStat(feature.layer, role.role, true);
      } else {
        addLayerStat(feature.layer, role.role, false);
      }
    });

    const warnings: string[] = [];
    if (!areas.length) warnings.push('未识别到闭合建筑/区域轮廓，可在工作台继续手动绘制');
    if (!pois.length) warnings.push('未识别到可用文字标注，建筑名称需要运营者手动补充');
    warnings.push('CAD 坐标已转为可编辑草稿，发布前建议至少添加 2 个坐标校准点');
    if (normalization.note) warnings.push(normalization.note);

    return {
      draft: {
        editorMode: 'image',
        baseSource: 'cad-vector',
        title: sourceName.replace(/\.[^.]+$/, ''),
        mapWidth: width,
        mapHeight: height,
        bbox,
        coordinateSystem: {
          type: 'cad-vector',
          unit: 'meter',
          origin: { x: bbox[0], y: bbox[1] },
          source: sourceName,
          normalizationNote: normalization.note || '',
        },
        imageMap: null,
        pois,
        areas,
        routes,
        semanticCategories: this.semanticCategories(),
      },
      report: {
        summary: [
          `识别 ${areas.length} 个区域、${routes.length} 条路线、${pois.length} 个点位/文字候选`,
          `画布尺寸 ${width} x ${height}`,
        ],
        warnings,
        layers: Array.from(layerStats.values()).sort((a, b) => b.importedCount - a.importedCount),
      },
    };
  }

  private inferFeatureRole(feature: RawCadFeature) {
    const text = `${feature.layer} ${feature.title || ''}`.toLowerCase();
    if (/(road|route|center|line|道路|路线|路|车行|人行)/i.test(text)) return { role: 'road', category: 'walk', label: '路线' };
    if (/(gate|entrance|出入口|入口|校门|门)/i.test(text)) return { role: 'entrance', category: 'entrance', label: '出入口' };
    if (/(green|landscape|tree|grass|绿|景观|草|树)/i.test(text)) return { role: 'landscape', category: 'service', label: '绿化' };
    if (/(water|river|lake|pond|水|河|湖|池)/i.test(text)) return { role: 'water', category: 'service', label: '水系' };
    if (/(bound|redline|site|boundary|范围|红线|边界|围墙)/i.test(text)) return { role: 'boundary', category: 'service', label: '边界' };
    if (feature.kind === 'line') return { role: 'road', category: 'walk', label: '路线' };
    if (feature.kind === 'polygon') return { role: 'building', category: 'teaching', label: '建筑' };
    return { role: 'poi', category: 'building', label: '点位' };
  }

  private inferSemantic(text: string) {
    const normalized = String(text || '').toLowerCase();
    const categories = this.semanticCategories();
    const matched = categories.find((item) => {
      const keywords = Array.isArray(item.keywords) ? item.keywords : [];
      return keywords.some((keyword: string) => normalized.includes(String(keyword).toLowerCase()));
    }) || categories.find((item) => item.type === 'building')!;
    return matched;
  }

  private semanticCategories() {
    return [
      { type: 'library', label: '图书馆', poiCategory: 'building', icon: 'book', color: '#2563eb', keywords: ['图书馆', '图文', '阅览', 'library', 'book'] },
      { type: 'canteen', label: '食堂', poiCategory: 'service', icon: 'bowl', color: '#f97316', keywords: ['食堂', '餐厅', 'canteen', 'dining', '饭堂'] },
      { type: 'dorm', label: '宿舍', poiCategory: 'building', icon: 'bed', color: '#7c3aed', keywords: ['宿舍', '公寓', '寝室', 'dorm', 'apartment'] },
      { type: 'teaching', label: '教学楼', poiCategory: 'building', icon: 'school', color: '#0f766e', keywords: ['教学', '教室', '学院', '实训', '楼', 'teaching', 'class'] },
      { type: 'office', label: '行政楼', poiCategory: 'building', icon: 'briefcase', color: '#475569', keywords: ['行政', '办公', 'office', 'admin'] },
      { type: 'sports', label: '运动场', poiCategory: 'service', icon: 'ball', color: '#16a34a', keywords: ['操场', '体育', '运动', '球场', 'sports', 'playground'] },
      { type: 'gate', label: '校门', poiCategory: 'entrance', icon: 'gate', color: '#dc2626', keywords: ['校门', '大门', '入口', '出入口', 'gate', 'entrance'] },
      { type: 'express', label: '快递点', poiCategory: 'service', icon: 'package', color: '#ca8a04', keywords: ['快递', '驿站', 'express', 'package'] },
      { type: 'shop', label: '超市商店', poiCategory: 'merchant', icon: 'shop', color: '#0891b2', keywords: ['超市', '商店', '便利', 'shop', 'store'] },
      { type: 'clinic', label: '医务室', poiCategory: 'service', icon: 'cross', color: '#e11d48', keywords: ['医务', '医院', '卫生', 'clinic', 'hospital'] },
      { type: 'toilet', label: '厕所', poiCategory: 'service', icon: 'toilet', color: '#64748b', keywords: ['厕所', '卫生间', 'toilet', 'wc'] },
      { type: 'parking', label: '停车场', poiCategory: 'service', icon: 'parking', color: '#334155', keywords: ['停车', '车库', 'parking'] },
      { type: 'bus', label: '公交站', poiCategory: 'service', icon: 'bus', color: '#0284c7', keywords: ['公交', '校车', 'bus', 'station'] },
      { type: 'service', label: '服务点', poiCategory: 'service', icon: 'star', color: '#9333ea', keywords: ['服务', '中心', 'service'] },
      { type: 'building', label: '建筑', poiCategory: 'building', icon: 'building', color: '#2563eb', keywords: ['building', '建筑'] },
    ];
  }

  private createCoordinateNormalizer(features: RawCadFeature[]) {
    const xs = features.flatMap((feature) => feature.points.map((point) => point.x)).filter((value) => Number.isFinite(value));
    const largeXs = xs.filter((value) => Math.abs(value) > 10000000);
    if (largeXs.length < Math.max(1, xs.length * 0.4)) {
      return { normalize: (point: CadPoint) => ({ ...point }), note: '' };
    }
    const sorted = largeXs.slice().sort((a, b) => Math.abs(a) - Math.abs(b));
    const median = sorted[Math.floor(sorted.length / 2)];
    const sign = median < 0 ? -1 : 1;
    const prefix = Math.trunc(Math.abs(median) / 1000000) * 1000000 * sign;
    return {
      normalize: (point: CadPoint) => ({
        x: Math.abs(point.x) > 10000000 ? point.x - prefix : point.x,
        y: point.y,
      }),
      note: `检测到 CAD X 坐标存在 ${prefix} 分带前缀，已在草稿中自动扣除`,
    };
  }

  private calculateBBox(points: CadPoint[]) {
    const usable = points.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
    if (!usable.length) return [0, 0, 100, 100];
    let minX = usable[0].x;
    let maxX = usable[0].x;
    let minY = usable[0].y;
    let maxY = usable[0].y;
    usable.forEach((point) => {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    });
    if (Math.abs(maxX - minX) < 1) {
      minX -= 50;
      maxX += 50;
    }
    if (Math.abs(maxY - minY) < 1) {
      minY -= 50;
      maxY += 50;
    }
    return [Number(minX.toFixed(3)), Number(minY.toFixed(3)), Number(maxX.toFixed(3)), Number(maxY.toFixed(3))];
  }

  private coordinatesToPoints(coordinates: any[]) {
    return (coordinates || [])
      .map((coordinate) => ({ x: Number(coordinate?.[0]), y: Number(coordinate?.[1]) }))
      .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  }

  private closeIfNeeded(points: CadPoint[], closed: boolean) {
    if (!closed || !points.length) return points;
    return this.isClosed(points) ? points : [...points, { ...points[0] }];
  }

  private isClosed(points: CadPoint[]) {
    if (points.length < 3) return false;
    const first = points[0];
    const last = points[points.length - 1];
    return Math.abs(first.x - last.x) < 0.001 && Math.abs(first.y - last.y) < 0.001;
  }

  private cleanCadText(value: string) {
    return String(value || '')
      .replace(/\\P/g, ' ')
      .replace(/[{}]/g, '')
      .replace(/\\[A-Za-z0-9]+;/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private isUsefulText(value: string) {
    const text = String(value || '').trim();
    if (!text) return false;
    if (/^H\s*=/.test(text)) return false;
    if (/^\d+(\.\d+)?\s*(m|米)?$/i.test(text)) return false;
    if (/^\d+\s*F$/i.test(text)) return false;
    return true;
  }

  private asFeatureCollection(value: any) {
    if (value?.type === 'FeatureCollection' && Array.isArray(value.features)) return value;
    if (Array.isArray(value?.features)) return { type: 'FeatureCollection', features: value.features };
    throw new BadRequestException('GeoJSON 格式不正确，请上传 FeatureCollection');
  }

  private roundRatio(value: number) {
    return Number(Math.max(0, Math.min(1, value)).toFixed(6));
  }

  private validateImportFile(file: Express.Multer.File) {
    if (!file) throw new BadRequestException('请上传 CAD 图纸或 GeoJSON 文件');
    if (Number(file.size || 0) <= 0) throw new BadRequestException('上传文件为空');
    if (Number(file.size || 0) > MAX_IMPORT_BYTES) throw new BadRequestException('CAD 文件不能超过 80MB，请先清理图纸或联系平台处理');
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(ext)) {
      throw new BadRequestException('仅支持 DXF、DWG、GeoJSON、JSON 或 PNG/JPG 校园底图导入');
    }
  }

  private safeDisplayName(name: string) {
    return path.basename(String(name || 'campus-map')).replace(/[^\w.\-\u4e00-\u9fa5]/g, '_').slice(0, 120);
  }

  private projectRoot() {
    return process.cwd();
  }

  private normalizeRegionId(regionId?: string) {
    return String(regionId || '').trim() || 'global';
  }

  private importsKey(regionId: string) {
    return `campus_map_imports_${this.normalizeRegionId(regionId)}`;
  }

  private jobKey(regionId: string, jobId: string) {
    return `${this.normalizeRegionId(regionId)}:${jobId}`;
  }

  private async readJobs(regionId: string): Promise<CampusMapImportJob[]> {
    const record = await this.prisma.config.findUnique({ where: { key: this.importsKey(regionId) } });
    const value = record?.value && typeof record.value === 'object' && !Array.isArray(record.value) ? record.value as any : {};
    return Array.isArray(value.jobs) ? value.jobs : [];
  }

  private async recoverInterruptedJobs() {
    const records = await this.prisma.config.findMany({
      where: {
        group: IMPORT_GROUP,
        key: { startsWith: 'campus_map_imports_' },
        isEnabled: true,
      },
      select: { key: true, value: true, updatedBy: true },
    });
    for (const record of records) {
      const value = record?.value && typeof record.value === 'object' && !Array.isArray(record.value)
        ? record.value as any
        : {};
      const jobs = Array.isArray(value.jobs) ? value.jobs as CampusMapImportJob[] : [];
      if (!jobs.some((job) => job.status === 'queued' || job.status === 'processing')) continue;
      const regionId = this.normalizeRegionId(value.regionId || record.key.replace(/^campus_map_imports_/, ''));
      const recoveredAt = new Date().toISOString();
      const recovered = jobs.map((job) => ['queued', 'processing'].includes(job.status)
        ? {
            ...job,
            status: 'failed' as const,
            progress: 0,
            message: '服务重启导致转换中断，请在后台点击重试',
            updatedAt: recoveredAt,
          }
        : job);
      await this.saveJobs(regionId, recovered, record.updatedBy || undefined);
    }
  }

  private async findJob(regionId: string, jobId: string) {
    const job = (await this.readJobs(regionId)).find((item) => item.id === jobId);
    if (!job) throw new NotFoundException('校园地图导入任务不存在');
    return job;
  }

  private async jobExists(regionId: string, jobId: string) {
    return (await this.readJobs(regionId)).some((item) => item.id === jobId);
  }

  private async removeImportFiles(job: CampusMapImportJob) {
    const importsRoot = path.resolve(this.projectRoot(), 'uploads', 'campus-map-imports');
    const sourceDir = path.resolve(path.dirname(job.source.path));
    if (!sourceDir.startsWith(`${importsRoot}${path.sep}`)) return;
    await fs.promises.rm(sourceDir, { recursive: true, force: true });
  }

  private async saveJob(job: CampusMapImportJob) {
    await this.withRegionWrite(job.regionId, async () => {
      const jobs = await this.readJobs(job.regionId);
      const nextJobs = [job, ...jobs.filter((item) => item.id !== job.id)].slice(0, 20);
      await this.saveJobs(job.regionId, nextJobs, job.createdBy);
    });
  }

  private async updateJob(regionId: string, jobId: string, patch: Partial<CampusMapImportJob>, adminId?: string) {
    return this.withRegionWrite(regionId, async () => {
      const jobs = await this.readJobs(regionId);
      const index = jobs.findIndex((item) => item.id === jobId);
      if (index < 0) throw new NotFoundException('校园地图导入任务不存在');
      const updated = {
        ...jobs[index],
        ...patch,
        updatedAt: new Date().toISOString(),
      } as CampusMapImportJob;
      jobs[index] = updated;
      await this.saveJobs(regionId, jobs, adminId || updated.createdBy);
      return this.publicJob(updated);
    });
  }

  private async withRegionWrite<T>(regionId: string, operation: () => Promise<T>): Promise<T> {
    const key = this.normalizeRegionId(regionId);
    const previous = this.regionWriteTails.get(key) || Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.catch(() => undefined).then(() => gate);
    this.regionWriteTails.set(key, tail);
    await previous.catch(() => undefined);
    try {
      return await operation();
    } finally {
      release();
      if (this.regionWriteTails.get(key) === tail) this.regionWriteTails.delete(key);
    }
  }

  private async saveJobs(regionId: string, jobs: CampusMapImportJob[], adminId?: string) {
    const key = this.importsKey(regionId);
    await this.prisma.config.upsert({
      where: { key },
      create: {
        key,
        value: { regionId, jobs },
        group: IMPORT_GROUP,
        desc: `区域 ${regionId} 校园地图 CAD 导入任务`,
        isEnabled: true,
        createdBy: adminId,
        updatedBy: adminId,
      },
      update: {
        value: { regionId, jobs },
        group: IMPORT_GROUP,
        desc: `区域 ${regionId} 校园地图 CAD 导入任务`,
        isEnabled: true,
        updatedBy: adminId,
      },
    });
  }

  private publicJob(job: CampusMapImportJob) {
    return {
      ...job,
      source: {
        fileName: job.source.fileName,
        fileExt: job.source.fileExt,
        fileSize: job.source.fileSize,
        mimeType: job.source.mimeType,
        url: job.source.url,
      },
    };
  }
}
