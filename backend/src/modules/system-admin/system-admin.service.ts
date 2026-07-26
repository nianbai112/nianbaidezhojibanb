import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { RedisService } from '../../common/services/redis.service';
import {
  EmailConfigDto, EmailTestDto,
  WebsiteInfoDto,
  WechatTemplateQueryDto, CreateWechatTemplateDto, UpdateWechatTemplateDto, BatchToggleTemplateDto,
  MiniappPageQueryDto, CreateMiniappPageDto, UpdateMiniappPageDto,
  UploadFileQueryDto, BatchDeleteFilesDto,
} from './dto/system-admin.dto';
import * as nodemailer from 'nodemailer';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

const SECRET_MASK = '******';
const SECRET_FIELD_PATTERN = /secret|password|token|cert|private|securityJsCode|apiV3Key|accessKey|secretKey|secretId|apiKey|webServiceKey|pass$/i;

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string),
  );

@Injectable()
export class SystemAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  // ==================== 邮箱配置 ====================

  async getEmailConfig() {
    let cfg = await this.prisma.emailConfig.findFirst();
    if (!cfg) {
      cfg = await this.prisma.emailConfig.create({
        data: { host: 'smtp.qq.com', port: 465, secure: true, user: '', pass: '' },
      });
    }
    return { ...cfg, pass: cfg.pass ? '******' : '' };
  }

  async saveEmailConfig(dto: EmailConfigDto) {
    const existing = await this.prisma.emailConfig.findFirst();
    const pass = dto.pass === '******' && existing ? existing.pass : dto.pass;
    if (existing) {
      return this.prisma.emailConfig.update({ where: { id: existing.id }, data: { ...dto as any, pass } });
    }
    return this.prisma.emailConfig.create({ data: { ...dto as any, pass } });
  }

  async testEmail(dto: EmailTestDto) {
    const cfg = await this.prisma.emailConfig.findFirst();
    if (!cfg || !cfg.user) throw new BadRequestException('请先配置邮箱');

    const transporter = nodemailer.createTransport({
      host: cfg.host, port: cfg.port, secure: cfg.secure,
      auth: { user: cfg.user, pass: cfg.pass },
      connectionTimeout: cfg.timeout || 10000,
    });

    try {
      const info = await transporter.sendMail({
        from: cfg.fromEmail || cfg.user,
        to: dto.toEmail,
        subject: dto.subject || '测试邮件',
        html: dto.content
          ? `<p>${escapeHtml(String(dto.content))}</p>${cfg.emailSignature || ''}`
          : `<p>这是一封测试邮件</p>${cfg.emailSignature || ''}`,
      });
      return { success: true, messageId: info.messageId, response: info.response };
    } catch (e: any) {
      throw new BadRequestException(`发送失败: ${e.message}`);
    }
  }

  // ==================== 网站信息 ====================

  async getWebsiteInfo() {
    const cfg = await this.prisma.config.findUnique({ where: { key: 'website_info' } });
    return cfg?.value || {};
  }

  async saveWebsiteInfo(dto: WebsiteInfoDto) {
    await this.prisma.config.upsert({
      where: { key: 'website_info' },
      create: { key: 'website_info', value: dto as any, group: 'system' },
      update: { value: dto as any },
    });
    await this.redis.del('cache:website_info');
    return { success: true };
  }

  // ==================== 微信模板消息 ====================

  async getTemplateList(q: WechatTemplateQueryDto) {
    const page = q.page || 1, pageSize = q.pageSize || 20;
    const where: any = {};
    if (q.platformType) where.platformType = q.platformType;
    if (q.templateType) where.templateType = q.templateType;

    const [list, total] = await Promise.all([
      this.prisma.wechatTemplateConfig.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.wechatTemplateConfig.count({ where }),
    ]);
    return { list, total, page, pageSize };
  }

  async createTemplate(dto: CreateWechatTemplateDto) {
    return this.prisma.wechatTemplateConfig.create({ data: this.normalizeWechatTemplateDto(dto) as any });
  }

  async updateTemplate(id: string, dto: UpdateWechatTemplateDto) {
    const tpl = await this.prisma.wechatTemplateConfig.findUnique({ where: { id } });
    if (!tpl) throw new NotFoundException('模板不存在');
    return this.prisma.wechatTemplateConfig.update({ where: { id }, data: this.normalizeWechatTemplateDto(dto) as any });
  }

  async deleteTemplate(id: string) {
    const tpl = await this.prisma.wechatTemplateConfig.findUnique({ where: { id } });
    if (!tpl) throw new NotFoundException('模板不存在');
    return this.prisma.wechatTemplateConfig.delete({ where: { id } });
  }

  async batchToggleTemplate(dto: BatchToggleTemplateDto) {
    await this.prisma.wechatTemplateConfig.updateMany({
      where: { id: { in: dto.ids } },
      data: { enabled: dto.enabled },
    });
    return { success: true };
  }

  private normalizeWechatTemplateDto<T extends CreateWechatTemplateDto | UpdateWechatTemplateDto>(dto: T): T {
    const data: Record<string, any> = { ...dto };
    if (data.platformType === 'miniapp') data.platformType = 'miniprogram';
    if (data.pageTemplate && !data.defaultPage) data.defaultPage = data.pageTemplate;
    return data as T;
  }

  // ==================== 小程序页面路径 ====================

  scanMiniappPagesFromSource() {
    const sourceDir = this.resolveMiniappSourceDir();
    const appJsonPath = path.join(sourceDir, 'app.json');
    if (!fs.existsSync(appJsonPath)) {
      throw new NotFoundException(`未找到小程序 app.json，请配置 MINI_PROGRAM_SOURCE_DIR，当前路径: ${sourceDir}`);
    }

    const appConfig = this.readJsonFile(appJsonPath) || {};
    const tabbarPages = new Set((appConfig.tabBar?.list || []).map((item: any) => item.pagePath).filter(Boolean));
    const list: any[] = [];

    const pushPage = (fullPath: string, packageName: string, kind: string, index: number) => {
      const pageJson = this.readJsonFile(path.join(sourceDir, `${fullPath}.json`)) || {};
      list.push({
        id: fullPath,
        title: pageJson.navigationBarTitleText || this.inferMiniappPageTitle(fullPath),
        packageName,
        group: packageName === 'main' ? '主包' : packageName,
        kind,
        path: fullPath,
        fullPath,
        tabbar: tabbarPages.has(fullPath),
        source: 'app.json',
        sortOrder: index,
      });
    };

    (appConfig.pages || []).forEach((pagePath: string, index: number) => {
      pushPage(pagePath, 'main', '主包页面', index);
    });

    const subPackages = appConfig.subPackages || appConfig.subpackages || [];
    subPackages.forEach((pkg: any) => {
      const root = String(pkg.root || '').replace(/^\/|\/$/g, '');
      (pkg.pages || []).forEach((pagePath: string, index: number) => {
        pushPage(`${root}/${pagePath}`.replace(/\/+/g, '/'), root, '分包页面', index);
      });
    });

    return {
      list,
      total: list.length,
      packages: this.groupByPackage(list),
      sourceDir,
      appJsonPath,
    };
  }

  async getPageList(q: MiniappPageQueryDto) {
    const page = q.page || 1, pageSize = q.pageSize || 50;
    const where: any = {};
    if (q.packageName) where.packageName = q.packageName;
    if (q.keyword) where.path = { contains: q.keyword };

    const [list, total] = await Promise.all([
      this.prisma.miniappPage.findMany({ where, orderBy: [{ packageName: 'asc' }, { sortOrder: 'asc' }], skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.miniappPage.count({ where }),
    ]);

    // Group by package
    const packages: Record<string, any[]> = {};
    for (const p of list) {
      if (!packages[p.packageName]) packages[p.packageName] = [];
      packages[p.packageName].push(p);
    }

    return { list, total, page, pageSize, packages };
  }

  private resolveMiniappSourceDir() {
    const candidates = [
      process.env.MINI_PROGRAM_SOURCE_DIR,
      process.env.MINIAPP_SOURCE_DIR,
      '/Users/nianbaidediannao/Desktop/前端文件',
      path.resolve(process.cwd(), '../前端文件'),
    ].filter(Boolean) as string[];
    return candidates.find((dir) => fs.existsSync(path.join(dir, 'app.json'))) || candidates[0];
  }

  private readJsonFile(filePath: string) {
    try {
      if (!fs.existsSync(filePath)) return null;
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      return null;
    }
  }

  private groupByPackage(list: any[]) {
    return list.reduce((acc, item) => {
      const key = item.packageName || 'main';
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {} as Record<string, any[]>);
  }

  private inferMiniappPageTitle(fullPath: string) {
    const known: Record<string, string> = {
      'pages/tabbar/index/index': '首页',
      'pages/tabbar/containers/containers': '圈子',
      'pages/tabbar/news/news': '消息',
      'pages/tabbar/auth/PersonalHomepage': '我的',
      'pages/auth/login': '登录',
      'pages/regions/regions': '区域选择',
      'pages/auth/StudentCertification/StudentCertification': '学生认证',
      'pages/regions/RegionalConfiguration/RegionalConfiguration': '区域配置',
      'pages/B/contacts': '通讯录',
      'pagesB/post/createPost': '发布笔记',
      'pagesB/post/post': '笔记详情',
      'pagesB/mall/index/index': '商城首页',
      'pagesB/mall/product/list': '商城商品列表',
      'pagesB/mall/product/detail': '商城商品详情',
      'pagesB/mall/order/list': '商城订单',
      'pagesB/mall/order/checkout': '商城结算',
      'pagesB/mall/refund/list': '商城售后',
    };
    if (known[fullPath]) return known[fullPath];
    const parts = fullPath.split('/').filter(Boolean);
    const leaf = parts[parts.length - 1] || fullPath;
    return leaf
      .replace(/[-_]/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .trim() || fullPath;
  }

  async createPage(dto: CreateMiniappPageDto) {
    return this.prisma.miniappPage.create({ data: dto as any });
  }

  async updatePage(id: string, dto: UpdateMiniappPageDto) {
    const pg = await this.prisma.miniappPage.findUnique({ where: { id } });
    if (!pg) throw new NotFoundException('页面不存在');
    return this.prisma.miniappPage.update({ where: { id }, data: dto as any });
  }

  async deletePage(id: string) {
    const pg = await this.prisma.miniappPage.findUnique({ where: { id } });
    if (!pg) throw new NotFoundException('页面不存在');
    return this.prisma.miniappPage.delete({ where: { id } });
  }

  // ==================== 文件管理 ====================

  async getFileList(q: UploadFileQueryDto) {
    const page = q.page || 1, pageSize = q.pageSize || 20;
    const where: any = {};
    if (q.fileType) where.fileType = q.fileType === 'document' ? 'file' : q.fileType;
    if (q.scene) where.scene = q.scene;
    if (q.userId) where.userId = q.userId;
    if (q.keyword) where.fileName = { contains: q.keyword };

    const [list, total] = await Promise.all([
      this.prisma.uploadRecord.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.uploadRecord.count({ where }),
    ]);
    return {
      list: list.map((item) => ({
        ...item,
        originalName: item.fileName,
        uploaderType: ['admin', 'config', 'ad', 'region', 'qrcode'].includes(item.scene || '') ? 'admin' : 'user',
        size: item.fileSize,
        metadata: {},
      })),
      total,
      page,
      pageSize,
    };
  }

  async deleteFile(id: string) {
    const f = await this.prisma.uploadRecord.findUnique({ where: { id } });
    if (!f) throw new NotFoundException('文件不存在');
    return this.prisma.uploadRecord.delete({ where: { id } });
  }

  async batchDeleteFiles(dto: BatchDeleteFilesDto) {
    await this.prisma.uploadRecord.deleteMany({ where: { id: { in: dto.ids } } });
    return { success: true };
  }

  // ==================== 系统配置分组 ====================

  async getConfigByGroup(group: string) {
    const configs = await this.prisma.config.findMany({ where: { group } });
    const result: Record<string, any> = {};
    for (const c of configs) {
      result[c.key] = this.maskConfigValue(c.value);
    }
    return result;
  }

  async saveConfigGroup(group: string, configs: Record<string, any>) {
    for (const [key, value] of Object.entries(configs)) {
      // Merge secrets for sensitive fields
      if (typeof value === 'object' && value !== null) {
        const existing = await this.prisma.config.findUnique({ where: { key } });
        if (existing?.value) {
          const merged: any = { ...(existing.value as any) };
          for (const [k, v] of Object.entries(value)) {
            if (v === SECRET_MASK) continue;
            if (
              v &&
              typeof v === 'object' &&
              !Array.isArray(v) &&
              merged[k] &&
              typeof merged[k] === 'object'
            ) {
              merged[k] = this.mergeMaskedConfigValue(merged[k], v);
              continue;
            }
            merged[k] = v;
          }
          await this.prisma.config.upsert({ where: { key }, create: { key, value: merged, group }, update: { value: merged } });
          continue;
        }
      }
      await this.prisma.config.upsert({ where: { key }, create: { key, value, group }, update: { value } });
    }
    return { success: true };
  }

  private maskConfigValue(value: any, fieldName = ''): any {
    if (Array.isArray(value)) return value.map((item) => this.maskConfigValue(item));
    if (!value || typeof value !== 'object') {
      if (fieldName && SECRET_FIELD_PATTERN.test(fieldName)) return value ? SECRET_MASK : '';
      return value;
    }
    const result: Record<string, any> = {};
    for (const [key, item] of Object.entries(value)) {
      result[key] = SECRET_FIELD_PATTERN.test(key) ? (item ? SECRET_MASK : '') : this.maskConfigValue(item, key);
    }
    return result;
  }

  private mergeMaskedConfigValue(current: Record<string, any>, incoming: Record<string, any>) {
    const merged: Record<string, any> = { ...current };
    for (const [key, value] of Object.entries(incoming)) {
      if (value === SECRET_MASK && SECRET_FIELD_PATTERN.test(key)) continue;
      if (
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        merged[key] &&
        typeof merged[key] === 'object'
      ) {
        merged[key] = this.mergeMaskedConfigValue(merged[key], value as Record<string, any>);
      } else {
        merged[key] = value;
      }
    }
    return merged;
  }

  async getWechatAccessToken(platform: 'miniapp' | 'official', incoming: Record<string, any> = {}) {
    const configKey = platform === 'official' ? 'wechat_official' : 'miniapp';
    let savedConfig = await this.prisma.config.findUnique({ where: { key: configKey } })
    if (!savedConfig && platform === 'official') {
      savedConfig = await this.prisma.config.findUnique({ where: { key: 'official' } })
    }
    const saved = ((savedConfig?.value || {}) as Record<string, any>);
    const appId = String(incoming.appId || saved.appId || '').trim();
    const incomingSecret = incoming.appSecret === '******' || incoming.secret === '******' ? '' : (incoming.appSecret || incoming.secret);
    const appSecret = String(incomingSecret || saved.appSecret || saved.secret || '').trim();
    if (!appId || !appSecret) {
      throw new BadRequestException('请先填写 AppID 和密钥');
    }

    const cacheKey = `wechat_access_token_${platform}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return { accessToken: cached, fromCache: true };
    }

    const { data } = await axios.get('https://api.weixin.qq.com/cgi-bin/token', {
      params: { grant_type: 'client_credential', appid: appId, secret: appSecret },
      timeout: 10000,
    });
    if (!data?.access_token) {
      throw new BadRequestException(data?.errmsg || '获取 AccessToken 失败');
    }

    const ttl = Math.max(Number(data.expires_in || 7200) - 300, 60);
    await this.redis.set(cacheKey, data.access_token, ttl);
    await this.saveConfigGroup(configKey, {
      [configKey]: {
        ...saved,
        ...incoming,
        appId,
        appSecret,
        accessToken: data.access_token,
        accessTokenExpiresIn: data.expires_in,
        accessTokenFetchedAt: new Date().toISOString(),
      },
    });
    return { accessToken: data.access_token, expiresIn: data.expires_in, fromCache: false };
  }

  // ==================== 微信文章图片提取 ====================

  async extractArticleImages(url: string) {
    try {
      // 该功能仅用于提取微信公众号文章图片，白名单限定目标域名，防止 SSRF
      let parsed: URL;
      try {
        parsed = new URL(String(url || ''));
      } catch {
        throw new BadRequestException('链接格式错误');
      }
      if (parsed.protocol !== 'https:' || parsed.hostname !== 'mp.weixin.qq.com') {
        throw new BadRequestException('仅支持微信公众号文章链接（https://mp.weixin.qq.com/...）');
      }
      return new Promise((resolve, reject) => {
        // hostname 写死为白名单域名，仅路径来自入参
        https.get({
          hostname: 'mp.weixin.qq.com',
          path: parsed.pathname + parsed.search,
          headers: { 'User-Agent': 'Mozilla/5.0' },
        }, (res: any) => {
          let data = '';
          res.on('data', (chunk: string) => data += chunk);
          res.on('end', () => {
            const images: string[] = [];
            const regex = /data-src="([^"]+)"/g;
            let match;
            while ((match = regex.exec(data)) !== null) {
              if (!images.includes(match[1])) images.push(match[1]);
            }
            const titleMatch = data.match(/<title>([^<]+)<\/title>/);
            resolve({ title: titleMatch?.[1] || '', total: images.length, images });
          });
        }).on('error', reject);
      });
    } catch (e: any) {
      if (e instanceof BadRequestException) throw e;
      throw new BadRequestException('获取文章失败: ' + e.message);
    }
  }
}
