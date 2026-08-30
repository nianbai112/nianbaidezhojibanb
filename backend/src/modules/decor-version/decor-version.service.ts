import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { AdminService } from '../admin/admin.service';

/**
 * 装修版本服务：为三个小程序装修编辑器（首页/消息页/我的页）提供
 * 版本快照 / 版本列表 / 一键回滚，覆盖 regions 字段 + tabbar。
 *
 * 存储：复用 prisma config 表（避免 migration），key 模式：
 *   decorver_{regionId}_{version}
 * value = { regionId, version, note, operatorId, savedAt, snapshot }
 * snapshot = { regionPayload?, tabbarConfig? }
 *   - regionPayload：与 PUT /admin/regions/:id 相同的字段子集（snake/camel 均可）
 *   - tabbarConfig：与 PUT /admin/regions/tabbar 的 config 相同
 */
@Injectable()
export class DecorVersionService {
  private static readonly MAX_VERSIONS = 20;

  constructor(
    private readonly prisma: PrismaService,
    private readonly adminService: AdminService,
  ) {}

  private keyOf(regionId: string, version: number) {
    return `decorver_${regionId}_${version}`;
  }

  private assertRegionId(regionId: string) {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(String(regionId || ''))) {
      throw new BadRequestException('无效的区域ID');
    }
  }

  /** 存一个新版本（version = 当前最大 + 1），只保留最近 20 个 */
  async createSnapshot(regionId: string, snapshot: any, note: string, operatorId: string) {
    this.assertRegionId(regionId);
    if (!snapshot || typeof snapshot !== 'object') {
      throw new BadRequestException('快照内容无效');
    }

    const existing = await this.prisma.config.findMany({
      where: { key: { startsWith: `decorver_${regionId}_` } },
      select: { key: true },
    });
    const maxVersion = existing.reduce((max, row) => {
      const v = parseInt(row.key.slice(`decorver_${regionId}_`.length), 10);
      return Number.isFinite(v) && v > max ? v : max;
    }, 0);
    const version = maxVersion + 1;

    const value = {
      regionId,
      version,
      note: String(note || '').slice(0, 500),
      operatorId: operatorId || '',
      savedAt: new Date().toISOString(),
      snapshot,
    };
    await this.prisma.config.create({
      data: { key: this.keyOf(regionId, version), value, group: 'decorver' },
    });

    // 裁剪旧版本，保留最近 20 个
    const all = await this.prisma.config.findMany({
      where: { key: { startsWith: `decorver_${regionId}_` } },
      select: { key: true },
    });
    const sorted = all
      .map((row) => ({ key: row.key, v: parseInt(row.key.slice(`decorver_${regionId}_`.length), 10) || 0 }))
      .sort((a, b) => b.v - a.v);
    const stale = sorted.slice(DecorVersionService.MAX_VERSIONS).map((r) => r.key);
    if (stale.length) {
      await this.prisma.config.deleteMany({ where: { key: { in: stale } } });
    }

    return { success: true, data: { version } };
  }

  /** 最近 20 个版本（version/time/note/operator） */
  async listVersions(regionId: string) {
    this.assertRegionId(regionId);
    const rows = await this.prisma.config.findMany({
      where: { key: { startsWith: `decorver_${regionId}_` } },
      select: { key: true, value: true, createdAt: true },
    });
    const list = rows
      .map((row) => {
        const v: any = row.value || {};
        return {
          version: typeof v.version === 'number' ? v.version : parseInt(row.key.slice(`decorver_${regionId}_`.length), 10) || 0,
          savedAt: v.savedAt || row.createdAt,
          note: v.note || '',
          operatorId: v.operatorId || '',
        };
      })
      .sort((a, b) => b.version - a.version)
      .slice(0, DecorVersionService.MAX_VERSIONS);
    return { success: true, data: { list } };
  }

  /** 取某版本快照 */
  async getVersion(regionId: string, version: number) {
    this.assertRegionId(regionId);
    const row = await this.prisma.config.findUnique({
      where: { key: this.keyOf(regionId, version) },
    });
    if (!row?.value) throw new NotFoundException('目标版本不存在');
    return { success: true, data: row.value };
  }

  /**
   * 回滚：把目标版本快照回写到 regions 字段 + tabbar，
   * 复用 AdminService.updateRegion / saveRegionTabBar 的现有写入链路。
   * 回滚本身也记录为一个新版本，保证历史可审计。
   */
  async rollback(regionId: string, version: number, operatorId: string, ip: string) {
    this.assertRegionId(regionId);
    const row = await this.prisma.config.findUnique({
      where: { key: this.keyOf(regionId, version) },
    });
    if (!row?.value) throw new NotFoundException('目标版本不存在');

    const snapshot = (row.value as any).snapshot || {};
    const written: string[] = [];

    // 1) regions 字段（hero/金刚区/轮播/开关/tabs/消息页/我的页配置等）
    if (snapshot.regionPayload && typeof snapshot.regionPayload === 'object' && Object.keys(snapshot.regionPayload).length) {
      await this.adminService.updateRegion(regionId, snapshot.regionPayload, operatorId);
      written.push('regions');
    }

    // 2) 底部导航
    if (snapshot.tabbarConfig && typeof snapshot.tabbarConfig === 'object') {
      await this.adminService.saveRegionTabBar({ regionId, config: snapshot.tabbarConfig }, operatorId, ip);
      written.push('tabbar');
    }

    // 3) 回滚本身记录为新版本
    const result = await this.createSnapshot(
      regionId,
      snapshot,
      `回滚自 v${version}`,
      operatorId,
    );

    // 4) 操作日志（失败不阻断）
    try {
      await this.prisma.adminOperationLog.create({
        data: {
          accountId: operatorId || '',
          action: 'rollback',
          module: 'decor_version',
          targetId: `${regionId}:v${version}`,
          ip: ip || '',
        },
      });
    } catch { /* 日志失败不影响主流程 */ }

    return {
      success: true,
      message: `已回滚到 v${version}`,
      data: { version: (result.data as any).version, written },
    };
  }
}
