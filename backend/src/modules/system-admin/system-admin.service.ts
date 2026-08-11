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
import { get as httpsGet } from 'https';

const SECRET_MASK = '******';
const SECRET_FIELD_PATTERN = /secret|password|token|cert|private|securityJsCode|apiV3Key|accessKey|secretKey|secretId|apiKey|webServiceKey|appCode|app_code|pass$/i;
const MINIAPP_PAGE_MANIFEST_FILE = 'miniapp-page-manifest.json';
const AGREEMENT_DOCUMENT_TYPES = [
  { type: 'TERMS_OF_SERVICE', title: '用户协议', scene: 'login', isRequired: true },
  { type: 'PRIVACY_POLICY', title: '隐私政策', scene: 'login', isRequired: true },
  { type: 'CONTENT_RULES', title: '社区内容规范', scene: 'post', isRequired: true },
  { type: 'PAYMENT_RULES', title: '支付与退款规则', scene: 'payment', isRequired: true },
  { type: 'PINNING_SERVICE', title: '付费置顶服务说明', scene: 'paid_pinning', isRequired: true },
  { type: 'DORM_SHOP_RULES', title: '宿舍小店经营规范', scene: 'dorm_shop', isRequired: true },
  { type: 'RIDER_RULES', title: '骑手服务规范', scene: 'rider', isRequired: true },
  { type: 'MERCHANT_RULES', title: '商家入驻与经营规范', scene: 'merchant', isRequired: true },
  { type: 'REGION_AGENT_RULES', title: '区域合作入驻规则', scene: 'city_agent', isRequired: true },
];

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
        text: String(dto.content || '这是一封测试邮件'),
      });
      return { success: true, messageId: info.messageId, response: info.response };
    } catch (e: any) {
      throw new BadRequestException(`发送失败: ${e.message}`);
    }
  }

  // ==================== 网站信息 ====================

  async getWebsiteInfo() {
    const cached = await this.redis.getJson<Record<string, any>>('cache:website_info').catch(() => null);
    if (cached) return cached;
    const cfg = await this.prisma.config.findUnique({ where: { key: 'website_info' } });
    const result = (cfg?.value || {}) as Record<string, any>;
    await this.redis.setJson('cache:website_info', result, 5 * 60).catch(() => undefined);
    return result;
  }

  async saveWebsiteInfo(dto: WebsiteInfoDto) {
    const existing = await this.prisma.config.findUnique({ where: { key: 'website_info' } });
    const current = (existing?.value || {}) as Record<string, any>;
    const next = { ...current, ...(dto as any) };
    await this.prisma.config.upsert({
      where: { key: 'website_info' },
      create: { key: 'website_info', value: next as any, group: 'website' },
      update: { value: next as any, group: existing?.group || 'website' },
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
    if (sourceDir && fs.existsSync(appJsonPath)) return this.buildMiniappPageScan(sourceDir, appJsonPath, 'source');

    const manifest = this.readMiniappPageManifest();
    if (manifest) {
      const list = this.normalizeMiniappPageList(manifest.list || []);
      return {
        list,
        total: list.length,
        packages: this.groupByPackage(list),
        sourceDir: manifest.sourceDir || '',
        appJsonPath: manifest.appJsonPath || '',
        manifestPath: manifest.manifestPath,
        sourceType: 'manifest',
        message: '服务器未找到小程序源码，已使用更新包内置页面路径清单',
      };
    }

    return {
      list: [],
      total: 0,
      packages: {},
      sourceDir,
      appJsonPath,
      sourceType: 'none',
      message: '未找到小程序源码或内置页面路径清单',
    };
  }

  private buildMiniappPageScan(sourceDir: string, appJsonPath: string, sourceType: 'source' | 'manifest') {
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

    const enhancedList = this.withMiniappSupplementalPages(list);
    return {
      list: enhancedList,
      total: enhancedList.length,
      packages: this.groupByPackage(enhancedList),
      sourceDir,
      appJsonPath,
      sourceType,
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
      '/www/wwwroot/lingmeng-miniapp',
      '/www/wwwroot/lingmeng/miniapp',
      '/www/wwwroot/lingmeng/frontend',
      '/www/wwwroot/lingmeng/前端文件',
      '/Users/nianbaidediannao/Desktop/前端文件',
      path.resolve(process.cwd(), '../前端文件'),
    ].map((item) => String(item || '').trim()).filter(Boolean);
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

  private readMiniappPageManifest() {
    for (const manifestPath of this.miniappPageManifestCandidates()) {
      const payload = this.readJsonFile(manifestPath);
      const list = Array.isArray(payload) ? payload : payload?.list;
      if (Array.isArray(list)) {
        return {
          ...payload,
          list,
          manifestPath,
        };
      }
    }
    return null;
  }

  private miniappPageManifestCandidates() {
    const candidates = [
      process.env.MINIAPP_PAGE_MANIFEST_PATH,
      path.resolve(process.cwd(), MINIAPP_PAGE_MANIFEST_FILE),
      path.resolve(process.cwd(), 'backend', MINIAPP_PAGE_MANIFEST_FILE),
      path.resolve(process.cwd(), 'dist', MINIAPP_PAGE_MANIFEST_FILE),
      path.resolve(__dirname, MINIAPP_PAGE_MANIFEST_FILE),
      path.resolve(__dirname, '../../../', MINIAPP_PAGE_MANIFEST_FILE),
      path.resolve(__dirname, '../../../../', MINIAPP_PAGE_MANIFEST_FILE),
    ].map((item) => String(item || '').trim()).filter(Boolean);
    return Array.from(new Set(candidates));
  }

  private normalizeMiniappPageList(list: any[]) {
    const normalized = list.map((item, index) => {
      const fullPath = String(item.fullPath || item.path || '').replace(/^\/+/, '');
      const packageName = item.packageName || (fullPath.includes('/') ? fullPath.split('/')[0] : 'main');
      return {
        id: item.id || fullPath,
        title: item.title || this.inferMiniappPageTitle(fullPath),
        packageName,
        group: item.group || (packageName === 'main' ? '主包' : packageName),
        kind: item.kind || (packageName === 'main' ? '主包页面' : '分包页面'),
        path: fullPath,
        fullPath,
        tabbar: Boolean(item.tabbar),
        source: item.source || 'manifest',
        sortOrder: Number.isFinite(Number(item.sortOrder)) ? Number(item.sortOrder) : index,
      };
    }).filter((item) => item.fullPath);
    return this.withMiniappSupplementalPages(normalized);
  }

  private withMiniappSupplementalPages(list: any[]) {
    const supplemental = [
      { title: '活动中心', fullPath: 'pagesA/selection/list/list', group: '营销活动', kind: '常用入口', query: 'tabIndex=0' },
      { title: '活动详情', fullPath: 'pagesA/selection/activity/activity', group: '营销活动', kind: '常用入口', query: 'id=' },
      { title: '分享有礼', fullPath: 'pagesA/news/SharingCourtesy/SharingCourtesy', group: '营销活动', kind: '常用入口' },
      { title: '领券中心', fullPath: 'pagesA/coupon/coupon', group: '优惠券', kind: '常用入口' },
      { title: '我的票夹', fullPath: 'pagesA/ticket-wallet/ticket-wallet', group: '优惠券', kind: '常用入口' },
      { title: '跑腿下单', fullPath: 'pagesA/RunningErrands/RunningErrands', group: '跑腿', kind: '常用入口' },
      { title: '跑腿首页', fullPath: 'pages/tabbar/RunErrands/RunErrands', group: '跑腿', kind: 'Tabbar' },
      { title: '学生认证', fullPath: 'pages/auth/StudentCertification/StudentCertification', group: '用户中心', kind: '常用入口' },
      { title: '认证审核中', fullPath: 'pages/auth/StudentPending/StudentPending', group: '用户中心', kind: '常用入口' },
      { title: '用户引导', fullPath: 'pages/auth/UserGuidance/UserGuidance', group: '用户中心', kind: '常用入口' },
    ];
    const byPath = new Map<string, any>();
    list.forEach((item, index) => {
      const fullPath = String(item.fullPath || item.path || '').replace(/^\/+/, '');
      if (!fullPath) return;
      byPath.set(fullPath, {
        ...item,
        id: item.id || fullPath,
        path: fullPath,
        fullPath,
        sortOrder: Number.isFinite(Number(item.sortOrder)) ? Number(item.sortOrder) : index,
      });
    });
    supplemental.forEach((item, index) => {
      const existing = byPath.get(item.fullPath);
      const packageName = item.fullPath.includes('/') ? item.fullPath.split('/')[0] : 'main';
      const base = {
        id: item.fullPath,
        packageName,
        tabbar: item.kind === 'Tabbar',
        source: 'supplemental',
        sortOrder: list.length + index,
        path: item.fullPath,
        ...item,
      };
      byPath.set(item.fullPath, existing ? { ...existing, ...base, source: existing.source || base.source } : base);
    });
    return Array.from(byPath.values()).sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
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
      'pages/B/circle-manage': '圈主管理',
      'pagesB/post/createPost': '发布笔记',
      'pagesB/post/post': '笔记详情',
      'pagesB/mall/index/index': '商城首页',
      'pagesB/mall/product/list': '商城商品列表',
      'pagesB/mall/product/detail': '商城商品详情',
      'pagesB/mall/order/list': '商城订单',
      'pagesB/mall/order/checkout': '商城结算',
      'pagesB/mall/refund/list': '商城售后',
      'pagesA/DormShopOwner/DormShopOwner': '宿舍小店店主',
      'pages/tabbar/RunErrands/RunErrands': '跑腿首页',
      'pagesA/RunningErrands/RunningErrands': '跑腿下单',
      'pagesA/selection/list/list': '活动中心',
      'pagesA/selection/activity/activity': '活动详情',
      'pagesA/news/SharingCourtesy/SharingCourtesy': '分享有礼',
      'pagesA/coupon/coupon': '领券中心',
      'pagesA/ticket-wallet/ticket-wallet': '我的票夹',
      'pages/auth/StudentPending/StudentPending': '认证审核中',
      'pages/auth/UserGuidance/UserGuidance': '用户引导',
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

  private mediaKind(fileType?: string | null, mimeType?: string | null) {
    const text = `${fileType || ''} ${mimeType || ''}`.toLowerCase();
    if (text.includes('image')) return 'image';
    if (text.includes('video')) return 'video';
    if (text.includes('audio')) return 'audio';
    return 'file';
  }

  private sizeText(size?: number | null) {
    const value = Number(size || 0);
    if (value >= 1024 * 1024 * 1024) return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`;
    if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(2)} MB`;
    if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${value} B`;
  }

  private sceneText(scene?: string | null) {
    const map: Record<string, string> = {
      post: '帖子内容',
      posts: '帖子内容',
      message: '聊天消息',
      messages: '聊天消息',
      avatar: '用户头像',
      admin: '后台上传',
      config: '系统配置',
      ad: '广告资源',
      region: '区域装修',
      qrcode: '二维码',
      'marketing-popup': '首页权益卡片',
      'share-invite': '分享有礼',
    };
    return map[String(scene || '')] || scene || '未标记';
  }

  private adminRoleLabel(roles: any[] = []) {
    const normalizedRoles = Array.isArray(roles) ? roles : [];
    if (normalizedRoles.some((item) => ['super_admin', 'SUPER_ADMIN'].includes(item?.role?.code || item?.code))) {
      return '超级管理员';
    }
    const names = normalizedRoles
      .map((item) => item?.role?.name || item?.name)
      .filter(Boolean);
    return names.length ? Array.from(new Set(names)).join('、') : '后台管理员';
  }

  private compactText(parts: Array<string | null | undefined>) {
    return parts.map((item) => String(item || '').trim()).filter(Boolean).join(' · ');
  }

  async getFileList(q: UploadFileQueryDto) {
    const page = q.page || 1, pageSize = q.pageSize || 20;
    const where: any = {};
    const type = String(q.fileType || q.type || '').trim();
    if (type) {
      if (['image', 'video', 'audio'].includes(type)) where.fileType = { startsWith: type };
      else where.fileType = type === 'document' ? 'file' : type;
    }
    if (q.scene) where.scene = q.scene;
    if (q.userId) where.userId = q.userId;
    if (q.keyword) where.fileName = { contains: q.keyword };
    const dateRange = Array.isArray(q.date) ? q.date : [];
    const startDate = q.startDate || dateRange[0];
    const endDate = q.endDate || dateRange[1];
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const [list, total] = await Promise.all([
      this.prisma.uploadRecord.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.uploadRecord.count({ where }),
    ]);
    const userIds = Array.from(new Set(list.map((item) => item.userId).filter(Boolean) as string[]));
    const [users, admins] = await Promise.all([
      userIds.length
        ? this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, uid: true, nickname: true, avatar: true, phone: true } }).catch(() => [])
        : Promise.resolve([]),
      userIds.length
        ? this.prisma.adminAccount.findMany({
            where: { id: { in: userIds } },
            select: {
              id: true,
              username: true,
              realName: true,
              avatar: true,
              phone: true,
              roles: { include: { role: true } },
            },
          }).catch(() => [])
        : Promise.resolve([]),
    ]);
    const userMap = new Map(users.map((item) => [item.id, item]));
    const adminMap = new Map(admins.map((item) => [item.id, item]));
    return {
      list: list.map((item) => ({
        ...item,
        originalName: item.fileName,
        uploaderType: ['admin', 'config', 'ad', 'region', 'qrcode', 'marketing-popup', 'share-invite'].includes(item.scene || '') ? 'admin' : 'user',
        uploader: (() => {
          const user = userMap.get(item.userId || '');
          if (user) {
            const displayName = user.nickname || `用户 ${user.uid || item.userId}`;
            return {
              type: 'user',
              id: item.userId,
              uid: user.uid,
              name: displayName,
              displayName,
              roleLabel: '小程序用户',
              avatar: user.avatar || '',
              phone: user.phone || '',
              account: user.uid || item.userId || '',
              subtitle: this.compactText([user.phone, user.uid ? String(user.uid) : item.userId]),
            };
          }
          const admin = adminMap.get(item.userId || '');
          if (admin) {
            const roleLabel = this.adminRoleLabel((admin as any).roles);
            const account = admin.username || item.userId || '';
            return {
              type: 'admin',
              id: item.userId,
              name: roleLabel,
              displayName: roleLabel,
              roleLabel,
              realName: admin.realName || '',
              avatar: admin.avatar || '',
              phone: admin.phone || '',
              account,
              subtitle: this.compactText([admin.realName, account, item.userId]),
            };
          }
          const fallbackType = ['admin', 'config', 'ad', 'region', 'qrcode', 'marketing-popup', 'share-invite'].includes(item.scene || '') ? 'admin' : 'user';
          const displayName = fallbackType === 'admin' ? '后台管理员' : (item.userId ? `上传人 ${item.userId.slice(0, 8)}` : '未知上传人');
          return {
            type: fallbackType,
            id: item.userId || '',
            name: displayName,
            displayName,
            roleLabel: fallbackType === 'admin' ? '后台管理员' : '小程序用户',
            avatar: '',
            phone: '',
            account: item.userId || '',
            subtitle: item.userId || '',
          };
        })(),
        size: item.fileSize,
        sizeText: this.sizeText(item.fileSize),
        mediaKind: this.mediaKind(item.fileType, item.mimeType),
        sceneText: this.sceneText(item.scene),
        metadata: {},
      })),
      total,
      page,
      pageSize,
    };
  }

  async deleteFile(id: string) {
    const record = await this.prisma.uploadRecord.findUnique({ where: { id } });
    if (!record) throw new NotFoundException('文件不存在');

    // AUD-P1-066: 删除数据库记录前先删除真实存储对象（本地/COS）
    await this.deleteStorageObject(record).catch((err) => {
      // 对象删除失败时保留记录，避免"记录已删但文件还在"的隐私泄露
      throw new BadRequestException(`文件对象删除失败: ${err.message}`);
    });

    return this.prisma.uploadRecord.delete({ where: { id } });
  }

  async batchDeleteFiles(dto: BatchDeleteFilesDto) {
    const records = await this.prisma.uploadRecord.findMany({
      where: { id: { in: dto.ids } },
    });

    // AUD-P1-066: 先删真实文件再删记录
    const errors: string[] = [];
    for (const record of records) {
      try {
        await this.deleteStorageObject(record);
      } catch (err: any) {
        errors.push(`${record.fileName}: ${err.message}`);
      }
    }

    if (errors.length > 0) {
      throw new BadRequestException(`部分文件删除失败: ${errors.slice(0, 5).join('; ')}`);
    }

    await this.prisma.uploadRecord.deleteMany({ where: { id: { in: dto.ids } } });
    return { success: true, deleted: dto.ids.length };
  }

  /**
   * AUD-P1-066: 删除真实存储对象（本地文件或 COS 对象）
   * hash 格式为 "key:path/to/file.jpg"，从 url 可回退推导存储路径
   */
  private async deleteStorageObject(record: { hash?: string | null; url: string; fileName: string }): Promise<void> {
    // 解析 hash 获取存储 key
    let storageKey: string | null = null;
    if (record.hash) {
      const parts = record.hash.split(':');
      if (parts.length >= 2 && parts[0] === 'key') {
        storageKey = parts.slice(1).join(':');
      }
    }

    if (!storageKey) {
      // 从 url 回退推导 key（去除域名/前缀部分）
      try {
        const urlObj = new URL(record.url.startsWith('http') ? record.url : `http://localhost${record.url}`);
        storageKey = urlObj.pathname.replace(/^\//, '');
      } catch {
        throw new Error('无法解析文件存储路径');
      }
    }

    // 读取存储配置判断 provider
    const storageConfig = await this.prisma.config.findUnique({
      where: { key: 'storage' },
      select: { value: true },
    }).catch(() => null);

    const provider = (storageConfig?.value as any)?.provider || 'local';

    if (provider === 'cos') {
      // COS: 异步删除（不阻塞，失败只记日志）
      const cos = require('cos-nodejs-sdk-v5');
      const cosConfig = (storageConfig?.value as any)?.cos || {};
      if (cosConfig.SecretId && cosConfig.SecretKey && cosConfig.Bucket && cosConfig.Region) {
        const client = new cos({
          SecretId: cosConfig.SecretId,
          SecretKey: cosConfig.SecretKey,
        });
        await new Promise<void>((resolve, reject) => {
          client.deleteObject({
            Bucket: cosConfig.Bucket,
            Region: cosConfig.Region,
            Key: storageKey!,
          }, (err: any) => {
            if (err) reject(err);
            else resolve();
          });
        });
      } else {
        throw new Error('COS 配置不完整，无法删除对象');
      }
    } else {
      // 本地存储: 直接删除文件
      const uploadDir = (storageConfig?.value as any)?.uploadDir || 'uploads';
      const filePath = path.resolve(process.cwd(), uploadDir, storageKey);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      // 文件不存在也视为成功（可能已被其他方式清理）
    }
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

  private getAgreementDefinition(type: any) {
    const normalized = String(type || '').trim().toUpperCase();
    const def = AGREEMENT_DOCUMENT_TYPES.find((item) => item.type === normalized);
    if (!def) throw new BadRequestException('不支持的协议类型');
    return def;
  }

  async listAgreementDocuments(query: any = {}) {
    const regionId = String(query.regionId || query.region_id || '').trim();
    const types = AGREEMENT_DOCUMENT_TYPES.map((item) => item.type);
    const docs = await this.prisma.richTextContent.findMany({
      where: {
        type: { in: types },
        OR: regionId ? [{ regionId }, { regionId: null }] : [{ regionId: null }],
      },
      orderBy: [{ sortOrder: 'asc' }, { updatedAt: 'desc' }],
    });
    const list = AGREEMENT_DOCUMENT_TYPES.map((def, index) => {
      const regionDoc = regionId ? docs.find((doc) => doc.type === def.type && doc.regionId === regionId) : null;
      const globalDoc = docs.find((doc) => doc.type === def.type && !doc.regionId);
      const doc = regionDoc || globalDoc;
      return {
        id: doc?.id || '',
        type: def.type,
        title: doc?.title || def.title,
        content: doc?.content || '',
        regionId: doc?.regionId || (regionId || null),
        version: doc?.version || '1.0.0',
        scene: doc?.scene || def.scene,
        isRequired: doc?.isRequired ?? def.isRequired,
        isShow: doc?.isShow ?? true,
        sortOrder: doc?.sortOrder ?? index,
        publishedAt: doc?.publishedAt || null,
        updatedAt: doc?.updatedAt || null,
        exists: !!doc,
        inherited: !!regionDoc ? false : !!regionId && !!globalDoc,
      };
    });
    return { list, total: list.length, types: AGREEMENT_DOCUMENT_TYPES };
  }

  async saveAgreementDocument(type: string, dto: any) {
    const def = this.getAgreementDefinition(type);
    const regionId = String(dto.regionId || dto.region_id || '').trim() || null;
    const title = String(dto.title || def.title).trim();
    const content = String(dto.content || '').trim();
    if (!title) throw new BadRequestException('请输入协议标题');
    if (!content) throw new BadRequestException('请输入协议内容');
    const existing = await this.prisma.richTextContent.findFirst({
      where: { type: def.type, regionId },
      select: { id: true },
    });
    const sortOrder = Number(dto.sortOrder ?? dto.sort_order);
    const data = {
      regionId,
      type: def.type,
      title,
      content,
      version: String(dto.version || '1.0.0').trim() || '1.0.0',
      scene: String(dto.scene || def.scene).trim() || def.scene,
      isRequired: dto.isRequired ?? dto.is_required ?? def.isRequired,
      isShow: dto.isShow ?? dto.is_show ?? true,
      sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
      publishedAt: dto.publishedAt || dto.published_at ? new Date(dto.publishedAt || dto.published_at) : new Date(),
    };
    const saved = existing
      ? await this.prisma.richTextContent.update({ where: { id: existing.id }, data })
      : await this.prisma.richTextContent.create({ data });
    return { success: true, data: saved };
  }

  async listAgreementConsents(query: any = {}) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize || query.limit) || 20));
    const where: any = {};
    if (query.type || query.code) where.code = String(query.type || query.code).trim().toUpperCase();
    if (query.regionId || query.region_id) where.regionId = String(query.regionId || query.region_id).trim();
    const keyword = String(query.keyword || '').trim();
    if (keyword) {
      where.user = {
        OR: [
          { nickname: { contains: keyword } },
          { phone: { contains: keyword } },
        ],
      };
    }
    const [list, total] = await Promise.all([
      this.prisma.userAgreementConsent.findMany({
        where,
        include: {
          user: { select: { id: true, uid: true, nickname: true, avatar: true, phone: true } },
          document: { select: { id: true, title: true } },
        },
        orderBy: { acceptedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.userAgreementConsent.count({ where }),
    ]);
    return { list, total, page, pageSize };
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
    const requestPath = this.trustedWechatArticlePath(url);
    return new Promise((resolve, reject) => {
      const request = httpsGet({
        protocol: 'https:',
        hostname: 'mp.weixin.qq.com',
        port: 443,
        path: requestPath,
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 10000,
      }, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(new BadRequestException(`获取文章失败: HTTP ${res.statusCode || 0}`));
          return;
        }
        let data = '';
        let bytes = 0;
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          bytes += Buffer.byteLength(chunk);
          if (bytes > 2 * 1024 * 1024) {
            request.destroy(new BadRequestException('文章内容过大'));
            return;
          }
          data += chunk;
        });
        res.on('end', () => {
          const images: string[] = [];
          const regex = /data-src="([^"]{1,2048})"/g;
          let match;
          while ((match = regex.exec(data)) !== null) {
            if (!images.includes(match[1])) images.push(match[1]);
          }
          const titleMatch = data.match(/<title>([^<]{1,500})<\/title>/);
          resolve({ title: titleMatch?.[1] || '', total: images.length, images });
        });
      });
      request.on('error', reject);
      request.on('timeout', () => request.destroy(new BadRequestException('获取文章超时')));
    });
  }

  private trustedWechatArticlePath(value: unknown) {
    try {
      const url = new URL(String(value || ''));
      if (url.protocol !== 'https:' || url.hostname !== 'mp.weixin.qq.com' || url.port || url.username || url.password) {
        throw new Error('untrusted');
      }
      return `${url.pathname}${url.search}`;
    } catch {
      throw new BadRequestException('文章链接不可信，仅支持微信公众号 HTTPS 链接');
    }
  }
}
