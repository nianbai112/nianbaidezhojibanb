import { BadRequestException, Injectable, Logger, Optional, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { AiRuntimeService } from '../ai-runtime/ai-runtime.service';
import { WechatTokenService } from '../wechat/wechat-token.service';
import { normalizeRiderAppControlConfig } from './rider-app-control.config';

const SECRET_PATTERN = /secret|password|token|cert|private|securityJsCode|apiV3Key|accessKey|secretKey|secretId|apiKey|webServiceKey|appCode|app_code|ukey|pass$/i;
const SECRET_MASK = '******';

@Injectable()
export class SystemConfigService {
  private readonly logger = new Logger(SystemConfigService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiRuntime: AiRuntimeService,
    @Optional() @Inject(forwardRef(() => WechatTokenService))
    private readonly wechatToken?: WechatTokenService,
  ) {}

  private getDefaultLoginPageConfig() {
    return {
      heroMode: 'image',
      heroImageUrl: '',
      heroVideoUrl: '',
      mascotImageUrl: '',
      featureTextList: ['校园社区', '代取快递', '二手闲置', '互助帮忙'],
    };
  }

  private normalizeLoginPageConfig(value: any) {
    const raw = value && typeof value === 'object' ? value : {};
    const heroMode = raw.heroMode === 'video' ? 'video' : 'image';
    const cleanUrl = (input: any, label: string) => {
      const url = String(input || '').trim();
      if (url && !/^https?:\/\//i.test(url)) throw new BadRequestException(`${label}必须是上传后的远程地址`);
      return url;
    };
    const config = {
      heroMode,
      heroImageUrl: cleanUrl(raw.heroImageUrl, '登录背景图'),
      heroVideoUrl: cleanUrl(raw.heroVideoUrl, '登录背景视频'),
      mascotImageUrl: cleanUrl(raw.mascotImageUrl, '吉祥物图片'),
      featureTextList: (Array.isArray(raw.featureTextList) ? raw.featureTextList : String(raw.featureTextList || raw.feature_text_list || '').split(/[·,，、|\n]/))
        .map((item: any) => String(item || '').trim()).filter(Boolean).slice(0, 8),
    };
    if (config.heroMode === 'video' && !config.heroVideoUrl) {
      throw new BadRequestException('视频模式必须上传登录背景视频');
    }
    if (!config.featureTextList.length) config.featureTextList = this.getDefaultLoginPageConfig().featureTextList;
    return config;
  }

  async getLoginPageConfig() {
    const config = await this.prisma.config.findUnique({ where: { key: 'login_page_config' } });
    return { success: true, data: { ...this.getDefaultLoginPageConfig(), ...(config?.value as Record<string, any> || {}) } };
  }

  /** 小程序 API 域名（Config 表 key: platform.api_base_url，后台可改，小程序启动时拉取） */
  async getPublicApiConfig() {
    const config = await this.prisma.config.findUnique({ where: { key: 'platform.api_base_url' } });
    const apiBaseUrl =
      (config?.value as any)?.apiBaseUrl ||
      process.env.PUBLIC_API_BASE_URL ||
      'https://yuntingzhe.cn/api';
    return { success: true, data: { apiBaseUrl } };
  }

  async saveLoginPageConfig(dto: any, operatorId?: string, ip?: string) {
    const before = await this.prisma.config.findUnique({ where: { key: 'login_page_config' } });
    const value = this.normalizeLoginPageConfig({ ...this.getDefaultLoginPageConfig(), ...(before?.value as Record<string, any> || {}), ...dto });
    const item = await this.prisma.config.upsert({
      where: { key: 'login_page_config' },
      update: { value, group: 'login_page', desc: '小程序登录页视觉配置', updatedBy: operatorId },
      create: { key: 'login_page_config', value, group: 'login_page', desc: '小程序登录页视觉配置', createdBy: operatorId, updatedBy: operatorId },
    });
    await this.logConfigChange(operatorId, 'UPDATE_LOGIN_PAGE_CONFIG', 'config', 'login_page_config', 'config', {
      before: before?.value || null,
      after: value,
    }, ip);
    return { success: true, data: item.value };
  }

  async getRiderAppControlConfig() {
    const item = await this.prisma.config.findUnique({ where: { key: 'rider_app_control' } });
    return {
      success: true,
      data: normalizeRiderAppControlConfig(item?.value),
    };
  }

  async saveRiderAppControlConfig(dto: any, operatorId?: string, ip?: string) {
    const before = await this.prisma.config.findUnique({ where: { key: 'rider_app_control' } });
    const value = normalizeRiderAppControlConfig(dto);
    const item = await this.prisma.config.upsert({
      where: { key: 'rider_app_control' },
      update: {
        value,
        group: 'rider_app',
        desc: '骑手 App 运行控制配置',
        updatedBy: operatorId,
      },
      create: {
        key: 'rider_app_control',
        value,
        group: 'rider_app',
        desc: '骑手 App 运行控制配置',
        createdBy: operatorId,
        updatedBy: operatorId,
      },
    });
    await this.logConfigChange(
      operatorId,
      'UPDATE_RIDER_APP_CONTROL',
      'rider_app',
      'rider_app_control',
      'config',
      { before: before?.value || null, after: value },
      ip,
    );
    return { success: true, data: normalizeRiderAppControlConfig(item.value) };
  }

  async getConfigs(group?: string, regionId?: string) {
    const where: any = {};
    if (group) where.group = group;

    const globalConfigs = await this.prisma.config.findMany({
      where: { ...where, group: { not: null } },
    });

    let regionConfigs: any[] = [];
    if (regionId) {
      regionConfigs = await this.prisma.config.findMany({
        where: { ...where, key: { startsWith: `region:${regionId}:` } },
      });
    }

    const merged = new Map();
    for (const c of globalConfigs) {
      merged.set(c.key, this.maskSecrets(c));
    }
    for (const c of regionConfigs) {
      merged.set(c.key.replace(`region:${regionId}:`, ''), this.maskSecrets(c));
    }

    return { success: true, data: Array.from(merged.values()) };
  }

  async getConfigByKey(key: string, regionId?: string) {
    const searchKey = regionId ? `region:${regionId}:${key}` : key;
    const config = await this.prisma.config.findUnique({ where: { key: searchKey } });
    if (!config && regionId) {
      const global = await this.prisma.config.findUnique({ where: { key } });
      return { success: true, data: global ? this.maskSecrets(global) : null };
    }
    return { success: true, data: config ? this.maskSecrets(config) : null };
  }

  async updateConfigs(configs: any[], operatorId?: string, ip?: string) {
    if (!Array.isArray(configs)) {
      return { code: 400, message: 'configs 必须是数组' };
    }

    // AUD-P1-167: 记录变更前的配置值用于审计
    const beforeValues: Record<string, any> = {};
    for (const c of configs) {
      const existing = await this.prisma.config.findUnique({ where: { key: c.key } });
      if (existing) {
        beforeValues[c.key] = this.maskSecrets(existing).value;
      }
    }

    for (const c of configs) {
      await this.prisma.config.upsert({
        where: { key: c.key },
        update: { value: c.value, group: c.group, desc: c.desc ?? c.description, isEnabled: c.isEnabled ?? true, updatedBy: operatorId },
        create: { key: c.key, value: c.value, group: c.group, desc: c.desc ?? c.description, isEnabled: c.isEnabled ?? true, createdBy: operatorId, updatedBy: operatorId },
      });
    }

    // AUD-P1-169: 微信配置变更后清理 token 缓存
    const wechatKeys = ['miniapp', 'wechat_official', 'wechat_pay'];
    const hasWechatChange = configs.some(c => wechatKeys.includes(c.key));
    if (hasWechatChange && this.wechatToken) {
      await this.wechatToken.clearAllTokenCache().catch(e => {
        this.logger.warn(`清理微信 token 缓存失败: ${e.message}`);
      });
    }

    // AUD-P1-167: 写入操作日志
    await this.logConfigChange(operatorId, 'UPDATE_CONFIGS', 'config', configs.map(c => c.key).join(','), 'config', {
      keys: configs.map(c => c.key),
      before: beforeValues,
      after: configs.reduce((acc, c) => { acc[c.key] = this.maskValue(c.key, c.value); return acc; }, {} as Record<string, any>),
    }, ip);

    return { success: true };
  }

  async resetGroup(group: string, operatorId?: string, ip?: string) {
    if (!group) return { code: 400, message: '缺少 group' };

    // AUD-P1-167: 记录重置前的配置
    const beforeConfigs = await this.prisma.config.findMany({ where: { group } });

    await this.prisma.config.deleteMany({ where: { group } });

    // AUD-P1-169: 微信配置组重置后清理 token 缓存
    const wechatGroups = ['miniapp', 'wechat_official', 'wechat_pay'];
    if (wechatGroups.includes(group) && this.wechatToken) {
      await this.wechatToken.clearAllTokenCache().catch(e => {
        this.logger.warn(`清理微信 token 缓存失败: ${e.message}`);
      });
    }

    // AUD-P1-167: 写入操作日志
    await this.logConfigChange(operatorId, 'RESET_CONFIG_GROUP', 'config', group, 'config_group', {
      group,
      deletedKeys: beforeConfigs.map(c => c.key),
      deletedCount: beforeConfigs.length,
    }, ip);

    return { success: true };
  }

  async getNamedConfig(key: string) {
    if (key === 'robot') {
      const aiOps = await this.prisma.config.findUnique({ where: { key: 'ai_ops_config' } });
      if (aiOps?.value) {
        return { success: true, data: this.aiOpsToLegacyRobotConfig(this.maskSecrets(aiOps).value) };
      }
    }
    const config = await this.prisma.config.findUnique({ where: { key } });
    return { success: true, data: config ? this.maskSecrets(config).value : this.defaultConfig(key) };
  }

  async setNamedConfig(key: string, value: any, operatorId?: string, ip?: string) {
    // 记录变更前的值
    const before = await this.prisma.config.findUnique({ where: { key } });
    const beforeValue = before?.value ? this.maskSecrets(before).value : null;

    if (key === 'robot') {
      const currentAiOps = await this.prisma.config.findUnique({ where: { key: 'ai_ops_config' } });
      const merged = this.mergeAiOpsConfigValue(currentAiOps?.value, this.legacyRobotToAiOpsConfig(value || {}));
      const item = await this.prisma.config.upsert({
        where: { key: 'ai_ops_config' },
        update: { value: merged, group: 'ai_ops_config', updatedBy: operatorId },
        create: { key: 'ai_ops_config', value: merged, group: 'ai_ops_config', createdBy: operatorId, updatedBy: operatorId },
      });
      await this.mirrorLegacyRobotConfig(merged, operatorId);

      // 写入操作日志
      await this.logConfigChange(operatorId, 'UPDATE_NAMED_CONFIG', 'config', key, 'config', {
        key, before: beforeValue, after: this.maskSecrets(item).value,
      }, ip);

      return { success: true, data: this.aiOpsToLegacyRobotConfig(this.maskSecrets(item).value) };
    }

    const current = await this.prisma.config.findUnique({ where: { key } });
    const legacyRobot = key === 'ai_ops_config'
      ? await this.prisma.config.findUnique({ where: { key: 'robot' } }).catch(() => null)
      : null;
    const incoming = key === 'ai_ops_config'
      ? this.mergePlainValue(this.legacyRobotToAiOpsConfig(legacyRobot?.value), value || {})
      : value;
    const merged = key === 'ai_ops_config'
      ? this.mergeAiOpsConfigValue(current?.value, incoming)
      : this.mergeSecretValue(current?.value, incoming);
    const item = await this.prisma.config.upsert({
      where: { key },
      update: { value: merged, group: key, updatedBy: operatorId },
      create: { key, value: merged, group: key, createdBy: operatorId, updatedBy: operatorId },
    });
    if (key === 'ai_ops_config') await this.mirrorLegacyRobotConfig(merged, operatorId);

    // 写入操作日志
    await this.logConfigChange(operatorId, 'UPDATE_NAMED_CONFIG', 'config', key, 'config', {
      key, before: beforeValue, after: this.maskSecrets(item).value,
    }, ip);

    return { success: true, data: this.maskSecrets(item).value };
  }

  async testAiConfig() {
    const result = await this.aiRuntime.testConnection().catch((error: any) => ({
      ok: false,
      missing: [error?.message || 'AI连接测试失败'],
    }));
    return {
      success: Boolean((result as any).ok),
      message: (result as any).ok ? 'AI 模型连接正常' : ((result as any).missing || ['AI 配置不可用']).join('；'),
      data: result,
    };
  }

  async testAiGenerate() {
    const text = await this.aiRuntime.generateText(
      '请生成一句校园本地生活平台的测试文案，不超过20字。',
      { systemPrompt: '你是校园本地生活平台的运营助手，只输出一句中文。' },
    );
    return { success: true, data: { text } };
  }

  async sensitiveWordsStats() {
    const [total, active, categories, strict, audit, tip] = await Promise.all([
      this.prisma.sensitiveWord.count(),
      this.prisma.sensitiveWord.count({ where: { status: 1 } }),
      this.prisma.sensitiveWord.groupBy({ by: ['category'] }).then(r => r.length),
      this.prisma.sensitiveWord.count({ where: { level: 'strict' } }),
      this.prisma.sensitiveWord.count({ where: { level: 'audit' } }),
      this.prisma.sensitiveWord.count({ where: { level: 'tip' } }),
    ]);
    return { total, active, categories, strict, audit, tip };
  }

  async sensitiveWords(query: any) {
    const { page = 1, pageSize = 20, keyword, category, level, status } = query;
    const where: any = {};
    if (keyword) where.word = { contains: keyword };
    if (category) where.category = category;
    if (level) where.level = level;
    if (status !== undefined && status !== '') where.status = Number(status);
    const [list, total] = await Promise.all([
      this.prisma.sensitiveWord.findMany({
        where,
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.sensitiveWord.count({ where }),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  async createSensitiveWord(dto: any, operatorId?: string) {
    const item = await this.prisma.sensitiveWord.create({
      data: {
        word: dto.word,
        category: dto.category || 'other',
        level: dto.level || 'audit',
        replaceWord: dto.replaceWord,
        status: dto.status ?? 1,
        createdBy: operatorId,
        updatedBy: operatorId,
      },
    });
    return { success: true, data: item };
  }

  async updateSensitiveWord(id: string, dto: any, operatorId?: string) {
    const item = await this.prisma.sensitiveWord.update({
      where: { id },
      data: { ...dto, updatedBy: operatorId },
    });
    return { success: true, data: item };
  }

  async deleteSensitiveWord(id: string) {
    await this.prisma.sensitiveWord.delete({ where: { id } });
    return { success: true };
  }

  async batchSensitiveWords(words: string[] = [], operatorId?: string, category?: string, level?: string, replaceWord?: string) {
    const uniqueWords = [...new Set(words.map((w) => String(w).trim()).filter(Boolean))];
    if (uniqueWords.length === 0) return { code: 400, message: '没有可导入的敏感词' };
    const beforeCount = await this.prisma.sensitiveWord.count();
    await this.prisma.sensitiveWord.createMany({
      data: uniqueWords.map((word) => ({
        word,
        category: category || 'other',
        level: level || 'audit',
        replaceWord: replaceWord || null,
        status: 1,
        createdBy: operatorId,
        updatedBy: operatorId,
      })),
      skipDuplicates: true,
    });
    const afterCount = await this.prisma.sensitiveWord.count();
    const inserted = afterCount - beforeCount;
    const skipped = uniqueWords.length - inserted;
    return { success: true, inserted, skipped, total: uniqueWords.length };
  }

  async advertisements(query: any) {
    const { page = 1, pageSize = 20, position, status, regionId } = query;
    const where: any = {};
    if (position) where.position = position;
    if (status !== undefined && status !== '') where.status = Number(status);
    if (regionId) where.regionId = String(regionId);
    const [list, total] = await Promise.all([
      this.prisma.advertisement.findMany({
        where,
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.advertisement.count({ where }),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  async createAdvertisement(dto: any, operatorId?: string) {
    const item = await this.prisma.advertisement.create({ data: this.normalizeAdData(dto, operatorId) });
    return { success: true, data: item };
  }

  async updateAdvertisement(id: string, dto: any, operatorId?: string) {
    const item = await this.prisma.advertisement.update({ where: { id }, data: this.normalizeAdData(dto, operatorId, true) });
    return { success: true, data: item };
  }

  async deleteAdvertisement(id: string) {
    await this.prisma.advertisement.delete({ where: { id } });
    return { success: true };
  }

  private maskSecrets(config: any) {
    return { ...config, value: this.maskSecretValue(config.value) };
  }

  private maskSecretValue(value: any, fieldName = ''): any {
    if (Array.isArray(value)) {
      return value.map((item) => this.maskSecretValue(item));
    }
    if (!value || typeof value !== 'object') {
      if (fieldName && SECRET_PATTERN.test(fieldName)) return value ? SECRET_MASK : '';
      return value;
    }
    const result: Record<string, any> = {};
    for (const [key, item] of Object.entries(value)) {
      result[key] = SECRET_PATTERN.test(key) ? (item ? SECRET_MASK : '') : this.maskSecretValue(item, key);
    }
    return result;
  }

  private mergeSecretValue(current: any, incoming: any) {
    if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) return incoming;
    const base = current && typeof current === 'object' && !Array.isArray(current) ? { ...current } : {};
    const next = { ...incoming };
    for (const key of Object.keys(next)) {
      if (SECRET_PATTERN.test(key) && next[key] === SECRET_MASK) {
        next[key] = base[key] ?? '';
      } else if (SECRET_PATTERN.test(key) && next[key] && typeof next[key] === 'object' && next[key].isConfigured) {
        next[key] = base[key] ?? '';
      } else if (
        next[key] &&
        typeof next[key] === 'object' &&
        !Array.isArray(next[key]) &&
        base[key] &&
        typeof base[key] === 'object'
      ) {
        next[key] = this.mergeSecretValue(base[key], next[key]);
      }
    }
    for (const key of Object.keys(base)) {
      if (!(key in next) && SECRET_PATTERN.test(key)) {
        next[key] = base[key] ?? '';
      }
    }
    return next;
  }

  private mergePlainValue(baseValue: any, incomingValue: any) {
    const result = baseValue && typeof baseValue === 'object' && !Array.isArray(baseValue)
      ? { ...baseValue }
      : {};
    const incoming = incomingValue && typeof incomingValue === 'object' && !Array.isArray(incomingValue)
      ? incomingValue
      : {};
    for (const [key, value] of Object.entries(incoming)) {
      if (
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        result[key] &&
        typeof result[key] === 'object' &&
        !Array.isArray(result[key])
      ) {
        result[key] = this.mergePlainValue(result[key], value);
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  private mergeAiOpsConfigValue(current: any, incoming: any) {
    const defaults = this.getDefaultAiOpsConfig();
    const base = this.mergePlainValue(defaults, current || {});
    const merged = this.mergePlainValue(base, incoming || {});
    return this.mergeSecretValue(base, merged);
  }

  private legacyRobotToAiOpsConfig(value: any) {
    const robot = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const result: any = {};
    if (robot.postDailyLimit !== undefined) {
      result.riskControl = { ...(result.riskControl || {}), maxPostsPerDay: Number(robot.postDailyLimit) || 0 };
      result.safetyConfig = { ...(result.safetyConfig || {}), botDailyPostLimit: Number(robot.postDailyLimit) || 0 };
    }
    if (robot.commentDailyLimit !== undefined) {
      result.riskControl = { ...(result.riskControl || {}), maxCommentsPerDay: Number(robot.commentDailyLimit) || 0 };
      result.safetyConfig = { ...(result.safetyConfig || {}), botDailyCommentLimit: Number(robot.commentDailyLimit) || 0 };
    }
    if (robot.defaultInterval !== undefined) {
      result.riskControl = { ...(result.riskControl || {}), minInterval: Number(robot.defaultInterval) || 0 };
    }
    if (robot.autoAudit !== undefined) {
      result.contentSafetyEnabled = Boolean(robot.autoAudit);
      result.reviewBeforePost = Boolean(robot.autoAudit);
      result.safetyConfig = { ...(result.safetyConfig || {}), aiContentRequireReview: Boolean(robot.autoAudit) };
    }
    return result;
  }

  private aiOpsToLegacyRobotConfig(value: any) {
    const ops = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const risk = ops.riskControl || {};
    const safety = ops.safetyConfig || {};
    return {
      postDailyLimit: Number(risk.maxPostsPerDay ?? safety.botDailyPostLimit ?? 10),
      commentDailyLimit: Number(risk.maxCommentsPerDay ?? safety.botDailyCommentLimit ?? 50),
      defaultInterval: Number(risk.minInterval ?? 60),
      autoAudit: Boolean(ops.contentSafetyEnabled ?? ops.reviewBeforePost ?? safety.aiContentRequireReview ?? false),
      enabledRegions: Array.isArray(ops.enabledRegions) ? ops.enabledRegions : [],
    };
  }

  private async mirrorLegacyRobotConfig(aiOpsValue: any, operatorId?: string) {
    const robotValue = this.aiOpsToLegacyRobotConfig(aiOpsValue);
    await this.prisma.config.upsert({
      where: { key: 'robot' },
      update: { value: robotValue, group: 'ai', updatedBy: operatorId },
      create: { key: 'robot', value: robotValue, group: 'ai', createdBy: operatorId, updatedBy: operatorId },
    }).catch(() => undefined);
  }

  private defaultConfig(key: string) {
    if (key === 'ai') {
      return { enabled: false, provider: 'openai', apiKey: '', apiEndpoint: '', model: '', temperature: 0.7, maxTokens: 2000 };
    }
    if (key === 'robot') {
      return { postDailyLimit: 10, commentDailyLimit: 50, defaultInterval: 60, autoAudit: false, enabledRegions: [] };
    }
    if (key === 'ai_ops_config') {
      return this.getDefaultAiOpsConfig();
    }
    return null;
  }

  getDefaultAiOpsConfig() {
    return {
      // 基础信息
      regionId: '',
      enabled: false,
      onlyNewRegion: false,
      onlyTestEnv: false,
      operationMode: 'standard',
      remark: '',
      // 内容冷启动配置
      coldStart: {
        enabled: true,
        dailyTotal: 20,
        minBatchPerHour: 1,
        maxBatchPerHour: 3,
        minPerBatch: 2,
        maxPerBatch: 5,
        disabledTimeRanges: [],
        newRegionFirstCount: 10,
        deduplication: true,
        sensitiveWordFilter: true,
        contentRatio: {
          campusLife: 30,
          secondHand: 15,
          errand: 10,
          merchantReview: 15,
          circleTopic: 20,
          activity: 10
        }
      },
      // AI笔记生成配置
      noteGeneration: {
        enabled: true,
        titleMinLength: 8,
        titleMaxLength: 30,
        contentMinLength: 50,
        contentMaxLength: 500,
        generateTimeout: 30,
        autoAttachImage: true,
        imageCountMin: 1,
        imageCountMax: 4,
        autoPublish: false,
        requireReview: true,
        defaultStatus: 'pending',
        toneRatio: {
          student: 40,
          merchantRecommend: 15,
          campusRoast: 15,
          helpMutual: 15,
          lifeShare: 15
        }
      },
      // AI评论配置
      commentConfig: {
        enabled: true,
        minCommentsPerPost: 2,
        maxCommentsPerPost: 8,
        commentInterval: 30,
        lowHeatComments: 2,
        midHeatComments: 5,
        highHeatComments: 8,
        allowConsecutive: false,
        allowBotInteraction: false,
        commentMinLength: 5,
        commentMaxLength: 50,
        commentStyle: {
          realStudent: 40,
          shortInteraction: 25,
          questionStyle: 15,
          approvalStyle: 10,
          supplementInfo: 10
        }
      },
      // 机器人配置
      botConfig: {
        totalBotLimit: 100,
        perRegionBotLimit: 20,
        defaultPassword: '',
        nicknamePrefix: '萌友',
        avatarGenerateMethod: 'random',
        autoFollow: true,
        minFollowsPerNote: 2,
        maxFollowsPerNote: 8,
        minFollowPerNChars: 100,
        maxFollowPerNChars: 300,
        charUnit: 100
      },
      // 热度规则配置
      heatRules: {
        enabled: true,
        likeWeight: 1.0,
        viewWeight: 0.1,
        commentWeight: 2.0,
        favoriteWeight: 1.5,
        shareWeight: 3.0,
        newPostBaseHeat: 10,
        decayPeriodHours: 72,
        lowHeatThreshold: 20,
        midHeatThreshold: 50,
        highHeatThreshold: 100
      },
      // 商家/二手/跑腿专项配置
      businessConfig: {
        merchant: {
          newMerchantBaseViews: 50,
          newMerchantBaseFavorites: 5,
          newMerchantBaseComments: 3,
          enableReviewCopywriting: true
        },
        secondHand: {
          baseViews: 30,
          baseInquiries: 3,
          autoComments: true,
          enableRecommendCopywriting: true
        },
        errand: {
          exposureBoost: true,
          simulateCompletedOrders: false,
          generateDemandContent: true,
          safetyTipsGeneration: true
        }
      },
      // 安全与审核
      safetyConfig: {
        aiContentRequireReview: true,
        sensitiveWordFilter: true,
        deduplication: true,
        botBehaviorRateLimit: true,
        botDailyPostLimit: 5,
        botDailyCommentLimit: 20,
        botDailyLikeLimit: 50,
        autoPauseOnAnomaly: true,
        manualPauseAll: false
      }
    };
  }

  // ============ 共享敏感词检查 (AUD-P1-152) ============

  /**
   * 共享内容安全检查 — 供所有用户内容入口（发帖/评论/私信/群聊）调用。
   * 返回命中的敏感词（含 level/category），null 表示通过。
   * strict: 直接拒绝 | audit: 转人工/提示 | tip: 仅记录
   */
  async checkSensitiveWord(text: string): Promise<{ word: string; level: string; category: string } | null> {
    const content = String(text || '').toLowerCase();
    if (!content) return null;
    try {
      const words = await this.prisma.sensitiveWord.findMany({
        where: { status: 1 },
        select: { word: true, level: true, category: true },
        take: 1000,
      });
      return words.find((item) => {
        const w = String(item.word || '').trim().toLowerCase();
        return Boolean(w && content.includes(w));
      }) || null;
    } catch {
      return null; // DB异常不阻塞发布，但应记日志（调用方处理）
    }
  }

  // ============ 存储配置 ============

  async getStorageConfig() {
    const config = await this.prisma.config.findUnique({ where: { key: 'storage' } });
    if (!config) {
      return {
        success: true,
        data: { ...this.getDefaultStorageConfig(), saved: false },
      };
    }
    return { success: true, data: { ...(this.maskSecrets(config).value as Record<string, any>), saved: true } };
  }

  async saveStorageConfig(dto: any, operatorId?: string, ip?: string) {
    // AUD-P1-168: 验证存储 provider 是否已实现
    const provider = dto.provider || 'local';
    const supportedProviders = ['local', 'cos'];
    if (!supportedProviders.includes(provider)) {
      return {
        success: false,
        message: `存储方式「${provider}」暂不支持，当前仅支持: ${supportedProviders.join(', ')}`,
      };
    }

    const current = await this.prisma.config.findUnique({ where: { key: 'storage' } });
    const merged = this.mergeSecretValue(current?.value, dto);

    // AUD-P1-168: 只保存已实现的 provider 配置
    const cleanConfig: Record<string, any> = {
      provider,
      domain: merged.domain || '',
      uploadPrefix: merged.uploadPrefix || '',
    };

    if (provider === 'local') {
      cleanConfig.local = merged.local || { uploadDir: 'uploads', accessUrl: '' };
    } else if (provider === 'cos') {
      cleanConfig.cos = merged.cos || {};
      // 保留 COS 密钥（如果前端传了 ****** 则使用数据库中的值）
      if (current?.value) {
        const dbValue = current.value as Record<string, any>;
        if (dbValue.cos) {
          for (const key of ['secretId', 'secretKey']) {
            if (cleanConfig.cos[key] === '******' || !cleanConfig.cos[key]) {
              cleanConfig.cos[key] = dbValue.cos[key] || '';
            }
          }
        }
      }
    }

    await this.prisma.config.upsert({
      where: { key: 'storage' },
      update: { value: cleanConfig, group: 'storage', updatedBy: operatorId },
      create: { key: 'storage', value: cleanConfig, group: 'storage', createdBy: operatorId, updatedBy: operatorId },
    });

    // AUD-P1-167: 记录操作日志
    await this.logConfigChange(operatorId, 'UPDATE_STORAGE', 'config', 'storage', 'storage_config', {
      provider,
      before: current?.value ? { provider: (current.value as any).provider } : null,
      after: { provider },
    }, ip);

    return { success: true, message: '存储配置已保存' };
  }

  async testStorageConfig(dto: any) {
    const { provider, ...config } = dto;

    if (!provider) {
      return { success: false, message: '请先选择存储方式' };
    }

    // 获取完整配置（包括数据库中已保存的敏感字段）
    const dbConfig = await this.prisma.config.findUnique({ where: { key: 'storage' } });
    const dbValue = (dbConfig?.value || {}) as Record<string, any>;

    // 合并配置：前端传入的值优先，如果是 ****** 则使用数据库中的值
    const fullConfig = this.mergeTestConfig(dbValue, config, provider);

    try {
      switch (provider) {
        case 'cos':
          return await this.testCosConnection(fullConfig);
        case 'local':
          return await this.testLocalConnection(fullConfig);
        case 'oss':
          return { success: false, message: '阿里云 OSS 支持正在开发中，敬请期待' };
        case 's3':
          return { success: false, message: 'AWS S3 支持正在开发中，敬请期待' };
        case 'minio':
          return { success: false, message: 'MinIO 支持正在开发中，敬请期待' };
        default:
          return { success: false, message: '不支持的存储方式' };
      }
    } catch (e: any) {
      return { success: false, message: e.message || '连接测试失败' };
    }
  }

  private mergeTestConfig(dbValue: Record<string, any>, frontConfig: any, provider: string): Record<string, any> {
    const result: Record<string, any> = { ...frontConfig };
    const providerConfig = dbValue[provider] || {};

    // 对于敏感字段，如果前端传入的是 ******，则使用数据库中的值
    const secretFields = ['secretId', 'secretKey', 'accessKeyId', 'accessKeySecret', 'accessKey', 'apiKey'];

    if (result && typeof result === 'object') {
      for (const key of Object.keys(result)) {
        if (secretFields.includes(key) && result[key] === '******') {
          result[key] = providerConfig[key] || '';
        }
      }
    }

    return result;
  }

  private async testCosConnection(config: Record<string, any>) {
    const secretId = config.secretId || '';
    const secretKey = config.secretKey || '';
    const bucket = config.bucket || '';
    const region = config.region || '';

    if (!secretId || !secretKey) {
      return { success: false, message: '请填写 SecretId 和 SecretKey' };
    }
    if (!bucket) {
      return { success: false, message: '请填写 Bucket' };
    }
    if (!region) {
      return { success: false, message: '请填写 Region' };
    }

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const COS = require('cos-nodejs-sdk-v5');
    const cos = new COS({ SecretId: secretId, SecretKey: secretKey });

    const headResult = await new Promise<{ err?: any }>((resolve) => {
      cos.headBucket({
        Bucket: bucket,
        Region: region,
      }, (err: any) => {
        resolve(err ? { err } : {});
      });
    });

    if (!headResult.err) {
      return { success: true, message: 'COS 连接测试成功！存储桶存在且密钥有效' };
    }

    if (this.isCosPermissionDenied(headResult.err)) {
      return this.testCosUploadPermission(cos, bucket, region);
    }

    return { success: false, message: this.formatCosError(headResult.err, 'COS 连接测试失败') };
  }

  private isCosPermissionDenied(err: any): boolean {
    const code = String(err?.code || err?.name || '');
    const message = String(err?.message || err?.error || '');
    return err?.statusCode === 403 || ['AccessDenied', 'Forbidden'].includes(code) || /Forbidden|AccessDenied/i.test(message);
  }

  private formatCosError(err: any, prefix = 'COS 测试失败'): string {
    const code = String(err?.code || err?.name || '');
    const message = String(err?.message || err?.error || code || '未知错误');
    const errorMap: Record<string, string> = {
      NoSuchBucket: '存储桶不存在或 Bucket 名称填写错误',
      AccessDenied: '密钥权限不足，请确认 CAM 授权包含 COS 访问权限',
      Forbidden: '密钥无权访问当前存储桶，请确认 SecretId/SecretKey、Bucket、Region 是否属于同一个腾讯云账号',
      InvalidAccessKeyId: 'SecretId 错误或密钥已被禁用',
      SignatureDoesNotMatch: 'SecretKey 错误，签名校验失败',
      InvalidRegion: '所属地域 Region 填写错误',
    };
    return `${prefix}: ${errorMap[code] || message}${code ? `（${code}）` : ''}`;
  }

  private async testCosUploadPermission(cos: any, bucket: string, region: string) {
    const key = `storage-test/.lingmeng-test-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`;

    return new Promise((resolve) => {
      cos.putObject({
        Bucket: bucket,
        Region: region,
        Key: key,
        Body: Buffer.from('lingmeng storage connection test'),
        ContentType: 'text/plain',
      }, (putErr: any) => {
        if (putErr) {
          resolve({ success: false, message: this.formatCosError(putErr, 'COS 上传测试失败') });
          return;
        }

        cos.deleteObject({ Bucket: bucket, Region: region, Key: key }, () => {
          resolve({
            success: true,
            message: 'COS 上传测试成功。当前密钥可能没有 HeadBucket 权限，但真实上传权限可用。',
          });
        });
      });
    });
  }

  private async testLocalConnection(config: Record<string, any>) {
    const uploadDir = config.uploadDir || 'uploads';
    const fs = require('fs');
    const path = require('path');

    const fullPath = path.resolve(process.cwd(), uploadDir);

    try {
      if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
        return { success: true, message: `本地目录已创建: ${fullPath}` };
      }
      return { success: true, message: `本地目录存在: ${fullPath}` };
    } catch (e: any) {
      return { success: false, message: `目录检查失败: ${e.message}` };
    }
  }

  private getDefaultStorageConfig() {
    return {
      provider: 'local',
      domain: '',
      uploadPrefix: '',
      cos: { secretId: '', secretKey: '', bucket: '', region: '' },
      oss: { accessKeyId: '', accessKeySecret: '', bucket: '', endpoint: '', region: '' },
      s3: { accessKey: '', secretKey: '', bucket: '', region: '', endpoint: '', pathStyle: false },
      minio: { accessKey: '', secretKey: '', bucket: '', endpoint: '', region: '', pathStyle: true },
      local: { uploadDir: 'uploads', accessUrl: '' },
      limits: {
        maxImageSize: 10,
        maxVideoSize: 100,
        maxFileSize: 20,
        allowedImageFormats: 'jpg,png,gif,webp',
        allowedVideoFormats: 'mp4,mov,avi',
        allowedFileFormats: 'pdf,doc,docx,xls,xlsx'
      },
      imageCompression: true,
      imageWatermark: false
    };
  }

  // ============ 高德地图配置 ============

  async getAmapConfig() {
    const config = await this.prisma.config.findUnique({ where: { key: 'amap' } });
    if (!config) {
      return {
        success: true,
        data: {
          webServiceKey: '',
          jsApiKey: '',
          securityJsCode: '',
          serviceHost: '',
          defaultCity: '全国',
          defaultLongitude: null,
          defaultLatitude: null
        }
      };
    }
    return { success: true, data: this.maskSecrets(config).value };
  }

  async getFeieConfig() {
    const config = await this.prisma.config.findUnique({ where: { key: 'feie' } });
    if (!config) return { success: true, data: { enabled: false, user: '', ukey: '' } };
    return { success: true, data: this.maskSecrets(config).value };
  }

  async saveFeieConfig(dto: any, operatorId?: string, ip?: string) {
    const current = await this.prisma.config.findUnique({ where: { key: 'feie' } });
    const merged = this.mergeSecretValue(current?.value, {
      enabled: Boolean(dto?.enabled),
      user: String(dto?.user || '').trim(),
      ukey: String(dto?.ukey || '').trim(),
    });
    if (merged.enabled && (!merged.user || !merged.ukey)) {
      throw new BadRequestException('开启飞鹅云前请填写 USER 与 UKEY');
    }
    await this.prisma.config.upsert({
      where: { key: 'feie' },
      update: { value: merged, group: 'thirdParty', desc: '飞鹅云打印配置', updatedBy: operatorId },
      create: { key: 'feie', value: merged, group: 'thirdParty', desc: '飞鹅云打印配置', createdBy: operatorId, updatedBy: operatorId },
    });
    await this.logConfigChange(operatorId, 'UPDATE_FEIE_CONFIG', 'config', 'feie', 'config', {
      before: current ? this.maskSecrets(current).value : null,
      after: this.maskValue('feie', merged),
    }, ip);
    return { success: true, data: this.maskSecretValue(merged) };
  }

  async getAmapRuntimeConfig() {
    const config = await this.prisma.config.findUnique({ where: { key: 'amap' } });
    const value = (config?.value as Record<string, any>) || {};
    const serviceHost = String(value.serviceHost || '').trim();

    return {
      success: true,
      data: {
        jsApiKey: value.jsApiKey || value.key || process.env.AMAP_KEY || '',
        securityJsCode: serviceHost
          ? ''
          : value.securityJsCode || value.securityCode || process.env.AMAP_SECURITY_CODE || '',
        serviceHost,
        defaultCity: value.defaultCity || '全国',
        defaultLongitude: value.defaultLongitude ?? null,
        defaultLatitude: value.defaultLatitude ?? null,
      },
    };
  }

  async saveAmapConfig(dto: any, operatorId?: string, ip?: string) {
    const current = await this.prisma.config.findUnique({ where: { key: 'amap' } });
    const merged = this.mergeSecretValue(current?.value, dto);
    await this.prisma.config.upsert({
      where: { key: 'amap' },
      update: {
        value: merged,
        group: 'thirdParty',
        desc: '高德地图配置',
        updatedBy: operatorId
      },
      create: {
        key: 'amap',
        value: merged,
        group: 'thirdParty',
        desc: '高德地图配置',
        createdBy: operatorId,
        updatedBy: operatorId
      }
    });
    if (operatorId) {
      try {
        await this.prisma.adminOperationLog.create({
          data: {
            accountId: operatorId,
            action: 'update_config',
            module: 'system',
            targetId: 'amap',
            targetType: 'config',
            detail: { message: '更新了高德地图配置' },
            ip: ip || null
          }
        });
      } catch {}
    }
    return { success: true };
  }

  async testAmapWebKey() {
    const config = await this.prisma.config.findUnique({ where: { key: 'amap' } });
    const value = config?.value as any;
    const webServiceKey = value?.webServiceKey;
    if (!webServiceKey) {
      return { success: false, message: '未配置 Web服务 Key' };
    }
    try {
      const axios = require('axios');
      const res = await axios.get('https://restapi.amap.com/v3/config/district', {
        params: {
          key: webServiceKey,
          keywords: '中国',
          subdistrict: 0
        },
        timeout: 5000
      });
      if (res.data?.status === '1') {
        return { success: true, message: 'Web服务 Key 测试成功' };
      }
      return { success: false, message: res.data?.info || '测试失败' };
    } catch (e: any) {
      return { success: false, message: e.message || '测试失败' };
    }
  }

  async testAmapJsKey() {
    const config = await this.prisma.config.findUnique({ where: { key: 'amap' } });
    const value = config?.value as any;
    const jsApiKey = value?.jsApiKey;
    if (!jsApiKey) {
      return { success: false, message: '未配置 JS API Key' };
    }
    return { success: true, message: 'JS API Key 已配置，请在前端地图组件中验证' };
  }

  async amapGeocode(address: string, city?: string) {
    const config = await this.prisma.config.findUnique({ where: { key: 'amap' } });
    const value = config?.value as any;
    const webServiceKey = value?.webServiceKey;
    if (!webServiceKey) {
      return { success: false, message: '未配置高德 Web服务 Key' };
    }
    try {
      const axios = require('axios');
      const res = await axios.get('https://restapi.amap.com/v3/geocode/geo', {
        params: {
          key: webServiceKey,
          address,
          city: city || ''
        },
        timeout: 5000
      });
      if (res.data?.status === '1' && res.data.geocodes?.length) {
        const geo = res.data.geocodes[0];
        const [lng, lat] = (geo.location || '').split(',').map(Number);
        return {
          success: true,
          data: {
            longitude: lng,
            latitude: lat,
            formattedAddress: this.normalizeAmapText(geo.formatted_address),
            province: this.normalizeAmapText(geo.addressComponent?.province),
            city: this.normalizeAmapText(geo.addressComponent?.city),
            district: this.normalizeAmapText(geo.addressComponent?.district),
            adcode: this.normalizeAmapText(geo.adcode)
          }
        };
      }
      return { success: false, message: res.data?.info || '地理编码失败' };
    } catch (e: any) {
      return { success: false, message: e.message || '请求失败' };
    }
  }

  async amapRegeocode(longitude: number, latitude: number) {
    const config = await this.prisma.config.findUnique({ where: { key: 'amap' } });
    const value = config?.value as any;
    const webServiceKey = value?.webServiceKey;
    if (!webServiceKey) {
      return { success: false, message: '未配置高德 Web服务 Key' };
    }
    try {
      const axios = require('axios');
      const res = await axios.get('https://restapi.amap.com/v3/geocode/regeo', {
        params: {
          key: webServiceKey,
          location: `${longitude},${latitude}`
        },
        timeout: 5000
      });
      if (res.data?.status === '1') {
        const addr = res.data.regeocode;
        return {
          success: true,
          data: {
            formattedAddress: this.normalizeAmapText(addr.formatted_address),
            province: this.normalizeAmapText(addr.addressComponent?.province),
            city: this.normalizeAmapText(addr.addressComponent?.city),
            district: this.normalizeAmapText(addr.addressComponent?.district),
            adcode: this.normalizeAmapText(addr.addressComponent?.adcode)
          }
        };
      }
      return { success: false, message: res.data?.info || '逆地理编码失败' };
    } catch (e: any) {
      return { success: false, message: e.message || '请求失败' };
    }
  }

  async amapWalkingDistance(origin: { longitude: number; latitude: number }, destination: { longitude: number; latitude: number }) {
    const config = await this.prisma.config.findUnique({ where: { key: 'amap' } });
    const webServiceKey = (config?.value as any)?.webServiceKey;
    if (!webServiceKey) return null;
    try {
      const axios = require('axios');
      const res = await axios.get('https://restapi.amap.com/v3/distance', {
        params: {
          key: webServiceKey,
          origins: `${origin.longitude},${origin.latitude}`,
          destination: `${destination.longitude},${destination.latitude}`,
          type: 3,
        },
        timeout: 5000,
      });
      const distance = Number(res.data?.results?.[0]?.distance);
      return res.data?.status === '1' && Number.isFinite(distance) && distance >= 0 ? Math.round(distance) : null;
    } catch {
      return null;
    }
  }

  async amapPlaceSearch(keywords: string, city?: string) {
    const config = await this.prisma.config.findUnique({ where: { key: 'amap' } });
    const value = config?.value as any;
    const webServiceKey = value?.webServiceKey;
    if (!webServiceKey) {
      return { success: false, message: '未配置高德 Web服务 Key' };
    }
    try {
      const axios = require('axios');
      const res = await axios.get('https://restapi.amap.com/v3/place/text', {
        params: {
          key: webServiceKey,
          keywords,
          city: city || value?.defaultCity || '',
          offset: 10
        },
        timeout: 5000
      });
      if (res.data?.status === '1') {
        return {
          success: true,
          data: (res.data.pois || []).map((poi: any) => {
            const [lng, lat] = (poi.location || '').split(',').map(Number);
            return {
              name: this.normalizeAmapText(poi.name),
              address: this.normalizeAmapText(poi.address),
              longitude: lng,
              latitude: lat,
              province: this.normalizeAmapText(poi.pname),
              city: this.normalizeAmapText(poi.cityname),
              district: this.normalizeAmapText(poi.adname),
              adcode: this.normalizeAmapText(poi.adcode),
              type: this.normalizeAmapText(poi.type)
            };
          })
        };
      }
      return { success: false, message: res.data?.info || '搜索失败' };
    } catch (e: any) {
      return { success: false, message: e.message || '请求失败' };
    }
  }

  private normalizeAmapText(value: any): string {
    if (Array.isArray(value)) {
      return value
        .filter((item) => item !== undefined && item !== null && String(item).trim())
        .map((item) => String(item).trim())
        .join(' ');
    }
    if (value === undefined || value === null) return '';
    return String(value).trim();
  }

  private normalizeAdData(dto: any, operatorId?: string, partial = false) {
    const data: any = {};
    const keys = ['name', 'image', 'linkType', 'linkValue', 'position', 'regionId', 'priority', 'status'];
    for (const key of keys) {
      if (dto[key] !== undefined) data[key] = key === 'regionId' && dto[key] !== null ? String(dto[key]) : dto[key];
    }
    if (dto.startTime !== undefined) data.startTime = dto.startTime ? new Date(dto.startTime) : null;
    if (dto.endTime !== undefined) data.endTime = dto.endTime ? new Date(dto.endTime) : null;
    if (!partial) data.createdBy = operatorId;
    data.updatedBy = operatorId;
    return data;
  }

  /**
   * AUD-P1-167: 记录配置变更操作日志
   */
  private async logConfigChange(
    accountId: string | undefined,
    action: string,
    module: string,
    targetId: string,
    targetType: string,
    detail: any,
    ip?: string,
  ) {
    if (!accountId) return;
    try {
      await this.prisma.adminOperationLog.create({
        data: {
          accountId,
          action,
          module,
          targetId,
          targetType,
          detail: detail || null,
          ip: ip || null,
        },
      });
    } catch (e: any) {
      this.logger.warn(`Failed to log config change: ${e.message}`);
    }
  }

  /**
   * 脱敏辅助方法
   */
  private maskValue(key: string, value: any): any {
    if (!value) return value;
    if (typeof value === 'object') {
      const masked: any = {};
      for (const [k, v] of Object.entries(value)) {
        if (SECRET_PATTERN.test(k)) {
          masked[k] = SECRET_MASK;
        } else {
          masked[k] = v;
        }
      }
      return masked;
    }
    return SECRET_PATTERN.test(key) ? SECRET_MASK : value;
  }
}
