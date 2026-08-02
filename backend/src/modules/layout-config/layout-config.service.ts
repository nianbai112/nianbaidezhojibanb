import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { AiRuntimeService } from '../ai-runtime/ai-runtime.service';

@Injectable()
export class LayoutConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiRuntime: AiRuntimeService,
  ) {}

  private getDefaultLayout(pageType: string): any {
    const defaults: Record<string, any> = {
      home: {
        // 默认只放运营位内容组件；动态模块（feed/榜单/商家）由页面内置内容承载，
        // 避免未配置时画布/真机出现一屏占位条
        components: [
          { id: 'banner', type: 'banner', enabled: true, config: { autoplay: true, interval: 3000, images: [] }, order: 0 },
          { id: 'grid-menu', type: 'grid-menu', enabled: true, config: { columns: 4, items: [] }, order: 1 },
          { id: 'announcement', type: 'announcement', enabled: true, config: { items: [] }, order: 2 },
        ],
        settings: {
          showAuthGuide: true,
          showDistanceTip: true,
          forceCertification: false,
        },
      },
      message: {
        // 消息页原生内容（会话列表）已完整，默认不放占位模块
        components: [],
        settings: {
          showUnreadCount: true,
          showMessagePreview: true,
        },
      },
      profile: {
        // 我的页原生内容（用户卡/菜单）已完整，默认不放占位模块
        components: [],
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

    // 查找已发布的配置与草稿
    const [published, draft] = await Promise.all([
      this.prisma.config.findUnique({
        where: { key: `${key}_published` },
      }),
      this.prisma.config.findUnique({
        where: { key: `${key}_draft` },
      }),
    ]);

    // 管理端编辑器语义：草稿比已发布更新时优先返回草稿，
    // 否则自动保存/手动保存的草稿在切页或刷新后会被已发布配置覆盖（静默丢稿）。
    // 注意：此接口仅供后台编辑器使用；小程序端走 getPublishedLayout，不受影响。
    if (draft?.value && published?.value) {
      const draftNewer = new Date(draft.updatedAt).getTime() > new Date(published.updatedAt).getTime();
      if (draftNewer) {
        return {
          success: true,
          data: {
            config: draft.value,
            status: 'draft',
            version: (draft.value as any)?.version || 1,
            publishedAt: published.updatedAt,
          },
        };
      }
    }

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

  /**
   * 小程序端公开读取：只返回已发布配置。
   * 无已发布配置时回退默认布局（status='default'），不返回草稿。
   * 返回前剥离 disabled 组件并按 order 排序，C 端拿到即可直接渲染。
   */
  async getPublishedLayout(pageType: string, regionId: string) {
    if (!/^[a-z][a-z0-9-]{0,31}$/.test(pageType)) {
      throw new BadRequestException('无效的页面类型');
    }
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(regionId)) {
      throw new BadRequestException('无效的区域ID');
    }

    const normalize = (config: any) => ({
      ...config,
      components: (Array.isArray(config?.components) ? config.components : [])
        .filter((c: any) => c && c.enabled !== false)
        .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0)),
    });

    const published = await this.prisma.config.findUnique({
      where: { key: `layout_${pageType}_${regionId}_published` },
    });

    if (published?.value) {
      return {
        success: true,
        data: {
          config: normalize(published.value),
          status: 'published',
          version: (published.value as any)?.version || 1,
          publishedAt: published.updatedAt,
        },
      };
    }

    return {
      success: true,
      data: {
        config: normalize(this.getDefaultLayout(pageType)),
        status: 'default',
        version: 0,
      },
    };
  }

  /**
   * tmagic 活动页公开读取：key = tmagic.page.<slug>。
   * 不存在时返回 data:null（不抛错，小程序端据此不渲染）。
   */
  async getTmagicPage(slug: string) {
    if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(slug)) {
      throw new BadRequestException('无效的页面标识');
    }

    const row = await this.prisma.config.findUnique({
      where: { key: `tmagic.page.${slug}` },
    });

    return { success: true, data: row?.value ?? null };
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

    // 写入版本历史（版本号 = 当前最大版本 + 1）
    await this.snapshotVersion(pageType, regionId, draft.value, operatorId, '发布');

    // 删除草稿
    await this.prisma.config.delete({ where: { key: draftKey } }).catch(() => {});

    // 记录操作日志
    await this.logOperation(operatorId, 'publish', 'layout', `${pageType}:${regionId}`, ip);

    return { success: true, message: '布局已发布' };
  }

  /** 快照当前配置为一个版本，只保留最近 20 个 */
  private async snapshotVersion(pageType: string, regionId: string, config: any, operatorId: string, note: string) {
    try {
      const latest = await this.prisma.layoutVersion.findFirst({
        where: { pageType, regionId },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      const version = (latest?.version || 0) + 1;
      await this.prisma.layoutVersion.create({
        data: { pageType, regionId, version, config, note, createdBy: operatorId },
      });
      // 裁剪旧版本，保留最近 20 个
      const olds = await this.prisma.layoutVersion.findMany({
        where: { pageType, regionId },
        orderBy: { version: 'desc' },
        skip: 20,
        select: { id: true },
      });
      if (olds.length) {
        await this.prisma.layoutVersion.deleteMany({ where: { id: { in: olds.map((o) => o.id) } } });
      }
      return version;
    } catch (e) {
      // 版本快照失败不阻断发布主流程
      console.error('布局版本快照失败', e);
      return 0;
    }
  }

  async rollback(pageType: string, regionId: string, versionId: string, operatorId: string, ip: string) {
    const publishedKey = `layout_${pageType}_${regionId}_published`;

    const target = await this.prisma.layoutVersion.findUnique({ where: { id: versionId } });
    if (!target || target.pageType !== pageType || target.regionId !== regionId) {
      throw new NotFoundException('目标版本不存在');
    }

    // 将目标版本配置写回发布槽
    await this.prisma.config.upsert({
      where: { key: publishedKey },
      update: { value: target.config as any, updatedAt: new Date() },
      create: { key: publishedKey, value: target.config as any, group: 'layout' },
    });

    // 回滚本身也记录为一个新版本，保证历史可审计
    await this.snapshotVersion(pageType, regionId, target.config, operatorId, `回滚自 v${target.version}`);

    // 记录操作日志
    await this.logOperation(operatorId, 'rollback', 'layout', `${pageType}:${regionId}`, ip);

    return { success: true, message: `已回滚到 v${target.version}` };
  }

  async getVersions(pageType: string, regionId: string, page: number, pageSize: number) {
    const publishedKey = `layout_${pageType}_${regionId}_published`;
    const draftKey = `layout_${pageType}_${regionId}_draft`;

    const [published, draft, total, versions] = await Promise.all([
      this.prisma.config.findUnique({ where: { key: publishedKey } }),
      this.prisma.config.findUnique({ where: { key: draftKey } }),
      this.prisma.layoutVersion.count({ where: { pageType, regionId } }),
      this.prisma.layoutVersion.findMany({
        where: { pageType, regionId },
        orderBy: { version: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: { id: true, version: true, note: true, createdBy: true, createdAt: true },
      }),
    ]);

    // 当前线上版本 = 版本表中最新一条（发布时同步快照）
    const latestVersion = versions.length ? versions[0].version : 0;

    const list: any[] = [];
    if (draft?.value) {
      list.push({
        id: draftKey,
        version: null,
        status: 'draft',
        note: '未发布草稿',
        createdAt: draft.updatedAt,
      });
    }
    for (const v of versions) {
      list.push({
        ...v,
        status: v.version === latestVersion && published ? 'published' : 'archived',
      });
    }

    return {
      success: true,
      data: {
        list,
        total,
        page,
        pageSize,
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

  // ==================== AI 生成布局 ====================

  /** 各页面类型允许 AI 使用的组件清单（与 admin layoutSchemas 对齐） */
  private aiWidgetCatalog(pageType: string): string {
    const catalogs: Record<string, string> = {
      home: [
        'navbar(顶部导航 {title})', 'search(搜索框 {placeholder})',
        'banner(轮播图 {images:[{image,linkUrl}],autoplay,interval})',
        'grid-menu(金刚区 {columns:3-5,items:[{icon,text,linkUrl}]})',
        'announcement(公告 {items:[{text,linkUrl}]})',
        'module-title(模块标题 {title,showMore,moreText})',
        'text(文本 {content,fontSize,color,align,bold})',
        'image(图片 {image,linkUrl})',
        'button(按钮 {text,linkUrl,background,color,radius})',
        'filter-tabs(筛选标签 {filterLinkKey,items:[{label}]})',
        'hot-posts(热门精选 {limit}，与 feed 互斥)',
        'feed(信息流 {style:waterfall|list|grid,filterLinkKey}，与 hot-posts 互斥)',
        'divider(分割线 {})',
      ].join('\n'),
      message: ['private-chat(私信入口)', 'group-chat(群聊入口)', 'system-notice(系统通知)', 'customer-service(客服入口)', 'official-notice(官方公告)'].join('\n'),
      profile: ['user-card(用户卡片 {showAvatar,showName})', 'wallet(钱包入口)', 'orders(订单入口)', 'certification(认证入口)', 'merchant-entry(商家入口)', 'rider-entry(骑手入口)', 'share-earn(分享赚)', 'sign-in(每日签到)', 'settings(设置入口)'].join('\n'),
    };
    return catalogs[pageType] || catalogs.home;
  }

  /** AI 根据自然语言描述生成页面布局（返回未落库的布局草稿） */
  async aiGenerateLayout(pageType: string, prompt: string, adminId: string, regionId: string) {
    const text = String(prompt || '').trim();
    if (!text) throw new BadRequestException('请输入页面描述');
    if (text.length > 500) throw new BadRequestException('描述过长（500 字以内）');

    const systemPrompt = [
      '你是小程序页面装修助手。根据用户的自然语言描述，输出一个页面布局 JSON。',
      '只允许使用下列组件类型（含各自 config 字段）：',
      this.aiWidgetCatalog(pageType),
      '输出契约（严格遵守）：',
      '- 只输出 JSON，不要输出任何解释、markdown 代码块',
      '- 结构：{"components":[{"type":"组件类型","enabled":true,"order":0,"config":{...}}],"settings":{}}',
      '- components 数量 2~8 个，order 从 0 递增',
      '- 互斥组件（hot-posts 与 feed）最多选一个',
      '- 图片字段 image 一律留空字符串，不编造 URL',
      '- 文案使用中文，贴合校园场景',
    ].join('\n');

    const raw = await this.aiRuntime.generateText(text, {
      systemPrompt,
      type: 'layout-generate',
      adminId,
      regionId,
    });

    const match = String(raw || '').match(/\{[\s\S]*\}/);
    if (!match) {
      throw new BadRequestException('AI 未返回有效布局，请换个描述重试');
    }
    let parsed: any;
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      throw new BadRequestException('AI 返回的 JSON 无法解析，请重试');
    }

    // 清洗：只保留已知类型、补 id/order、限制数量
    const known = new Set([
      'navbar', 'search', 'banner', 'grid-menu', 'announcement', 'module-title', 'filter-tabs',
      'text', 'image', 'button', 'divider', 'hot-posts', 'ranking', 'recommend-merchant', 'feed',
      'private-chat', 'group-chat', 'system-notice', 'customer-service', 'official-notice',
      'user-card', 'wallet', 'orders', 'certification', 'merchant-entry', 'rider-entry', 'share-earn', 'sign-in', 'settings',
    ]);
    const components = (Array.isArray(parsed?.components) ? parsed.components : [])
      .filter((c: any) => c && known.has(c.type))
      .slice(0, 8)
      .map((c: any, i: number) => ({
        id: `${c.type}_ai_${Date.now()}_${i}`,
        type: c.type,
        enabled: c.enabled !== false,
        order: i,
        config: c.config && typeof c.config === 'object' ? c.config : {},
        style: {},
      }));

    if (!components.length) {
      throw new BadRequestException('AI 生成的组件均不可用，请换个描述重试');
    }

    return {
      success: true,
      data: {
        components,
        settings: parsed.settings && typeof parsed.settings === 'object' ? parsed.settings : {},
      },
    };
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
