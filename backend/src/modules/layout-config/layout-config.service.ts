import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';

@Injectable()
export class LayoutConfigService {
  constructor(private readonly prisma: PrismaService) {}

  private getDefaultLayout(pageType: string): any {
    const defaults: Record<string, any> = {
      home: {
        components: [
          { id: 'navbar', type: 'navbar', enabled: true, config: { showBack: false, title: '首页' }, order: 0 },
          { id: 'search', type: 'search', enabled: true, config: { placeholder: '搜索校园生活' }, order: 1 },
          { id: 'banner', type: 'banner', enabled: true, config: { autoplay: true, interval: 3000 }, order: 2 },
          { id: 'grid-menu', type: 'grid-menu', enabled: true, config: { columns: 4, items: [] }, order: 3 },
          { id: 'announcement', type: 'announcement', enabled: true, config: {} , order: 4 },
          { id: 'hot-posts', type: 'hot-posts', enabled: true, config: { limit: 5 }, order: 5 },
          { id: 'ranking', type: 'ranking', enabled: true, config: { types: ['user', 'post'] }, order: 6 },
          { id: 'recommend-merchant', type: 'recommend-merchant', enabled: true, config: { limit: 6 }, order: 7 },
          { id: 'feed', type: 'feed', enabled: true, config: { style: 'waterfall' }, order: 8 },
        ],
        settings: {
          showAuthGuide: true,
          showDistanceTip: true,
          forceCertification: false,
        },
      },
      message: {
        components: [
          { id: 'private-chat', type: 'private-chat', enabled: true, config: {}, order: 0 },
          { id: 'group-chat', type: 'group-chat', enabled: true, config: {}, order: 1 },
          { id: 'system-notice', type: 'system-notice', enabled: true, config: {}, order: 2 },
          { id: 'customer-service', type: 'customer-service', enabled: true, config: {}, order: 3 },
          { id: 'official-notice', type: 'official-notice', enabled: true, config: {}, order: 4 },
        ],
        settings: {
          showUnreadCount: true,
          showMessagePreview: true,
        },
      },
      profile: {
        components: [
          { id: 'user-card', type: 'user-card', enabled: true, config: { showAvatar: true, showName: true }, order: 0 },
          { id: 'wallet', type: 'wallet', enabled: true, config: {}, order: 1 },
          { id: 'orders', type: 'orders', enabled: true, config: { types: ['mall', 'errand', 'groupbuy'] }, order: 2 },
          { id: 'certification', type: 'certification', enabled: true, config: {}, order: 3 },
          { id: 'merchant-entry', type: 'merchant-entry', enabled: true, config: {}, order: 4 },
          { id: 'rider-entry', type: 'rider-entry', enabled: true, config: {}, order: 5 },
          { id: 'share-earn', type: 'share-earn', enabled: true, config: {}, order: 6 },
          { id: 'sign-in', type: 'sign-in', enabled: true, config: {}, order: 7 },
          { id: 'settings', type: 'settings', enabled: true, config: {}, order: 8 },
        ],
        settings: {
          showEditProfile: true,
          showQrcode: true,
        },
      },
    };
    return defaults[pageType] || { components: [], settings: {} };
  }

  async getLayout(pageType: string, regionId: string) {
    const key = `layout_${pageType}_${regionId}`;

    // 查找已发布的配置
    const published = await this.prisma.config.findUnique({
      where: { key: `${key}_published` },
    });

    if (published?.value) {
      return {
        success: true,
        data: {
          config: published.value,
          status: 'published',
          version: (published.value as any)?.version || 1,
          publishedAt: published.updatedAt,
        },
      };
    }

    // 查找草稿
    const draft = await this.prisma.config.findUnique({
      where: { key: `${key}_draft` },
    });

    if (draft?.value) {
      return {
        success: true,
        data: {
          config: draft.value,
          status: 'draft',
          version: (draft.value as any)?.version || 1,
        },
      };
    }

    // 返回默认配置
    return {
      success: true,
      data: {
        config: this.getDefaultLayout(pageType),
        status: 'default',
        version: 0,
      },
    };
  }

  async saveDraft(pageType: string, regionId: string, config: any, operatorId: string, ip: string) {
    // 验证配置
    this.validateConfig(pageType, config);

    const key = `layout_${pageType}_${regionId}_draft`;

    await this.prisma.config.upsert({
      where: { key },
      update: { value: config, updatedAt: new Date() },
      create: { key, value: config, group: 'layout' },
    });

    // 记录操作日志
    await this.logOperation(operatorId, 'save_draft', 'layout', `${pageType}:${regionId}`, ip);

    return { success: true, message: '草稿已保存' };
  }

  async preview(pageType: string, regionId: string, config: any) {
    this.validateConfig(pageType, config);
    return { success: true, data: { config } };
  }

  async publish(pageType: string, regionId: string, operatorId: string, ip: string) {
    const draftKey = `layout_${pageType}_${regionId}_draft`;
    const publishedKey = `layout_${pageType}_${regionId}_published`;

    // 查找草稿
    const draft = await this.prisma.config.findUnique({
      where: { key: draftKey },
    });

    if (!draft?.value) {
      throw new BadRequestException('没有待发布的草稿');
    }

    // 发布草稿
    await this.prisma.config.upsert({
      where: { key: publishedKey },
      update: { value: draft.value, updatedAt: new Date() },
      create: { key: publishedKey, value: draft.value, group: 'layout' },
    });

    // 删除草稿
    await this.prisma.config.delete({ where: { key: draftKey } }).catch(() => {});

    // 记录操作日志
    await this.logOperation(operatorId, 'publish', 'layout', `${pageType}:${regionId}`, ip);

    return { success: true, message: '布局已发布' };
  }

  async rollback(pageType: string, regionId: string, versionId: string, operatorId: string, ip: string) {
    // 回滚功能：重新发布指定版本
    const publishedKey = `layout_${pageType}_${regionId}_published`;

    const published = await this.prisma.config.findUnique({
      where: { key: publishedKey },
    });

    if (!published?.value) {
      throw new NotFoundException('没有已发布的版本');
    }

    // 记录操作日志
    await this.logOperation(operatorId, 'rollback', 'layout', `${pageType}:${regionId}`, ip);

    return { success: true, message: '已回滚到指定版本' };
  }

  async getVersions(pageType: string, regionId: string, page: number, pageSize: number) {
    const publishedKey = `layout_${pageType}_${regionId}_published`;
    const draftKey = `layout_${pageType}_${regionId}_draft`;

    const [published, draft] = await Promise.all([
      this.prisma.config.findUnique({ where: { key: publishedKey } }),
      this.prisma.config.findUnique({ where: { key: draftKey } }),
    ]);

    const versions = [];
    if (published?.value) {
      versions.push({
        id: publishedKey,
        version: 1,
        status: 'published',
        config: published.value,
        createdAt: published.updatedAt,
      });
    }
    if (draft?.value) {
      versions.push({
        id: draftKey,
        version: 1,
        status: 'draft',
        config: draft.value,
        createdAt: draft.updatedAt,
      });
    }

    return {
      success: true,
      data: {
        list: versions,
        total: versions.length,
        page: 1,
        pageSize: 10,
      },
    };
  }

  private validateConfig(pageType: string, config: any) {
    if (!config || typeof config !== 'object') {
      throw new BadRequestException('配置格式无效');
    }
    if (!Array.isArray(config.components)) {
      throw new BadRequestException('配置必须包含 components 数组');
    }
    // 可以添加更多验证逻辑
  }

  private async logOperation(operatorId: string, action: string, module: string, targetId: string, ip: string) {
    try {
      await this.prisma.adminOperationLog.create({
        data: {
          accountId: operatorId,
          action,
          module,
          targetId,
          ip: ip || '',
        },
      });
    } catch (e) {
      // 日志记录失败不影响主流程
    }
  }
}
