import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { RedisService } from '../../common/services/redis.service';
import { AiRuntimeService } from '../ai-runtime/ai-runtime.service';

@Injectable()
export class AiAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiRuntime: AiRuntimeService,
    private readonly redis: RedisService,
  ) {}

  private async logOperation(operatorId: string, action: string, module: string, targetId: string, ip: string) {
    try {
      await this.prisma.adminOperationLog.create({
        data: { accountId: operatorId, action, module, targetId, ip: ip || '' },
      });
    } catch (e) {
      // 日志失败不影响主流程
    }
  }

  private getDefaultConfig() {
    return {
      enabled: false,
      provider: 'deepseek',
      apiBaseUrl: '',
      apiKey: '',
      model: 'deepseek-chat',
      operationMode: 'standard',
      postGenerateEnabled: true,
      commentGenerateEnabled: true,
      interactionEnabled: true,
      coldStartEnabled: true,
      reviewBeforePost: true,
      contentSafetyEnabled: true,
      reviewSampleRate: 0,
      quietHoursEnabled: true,
      quietStart: '23:00',
      quietEnd: '07:00',
      riskControl: {
        maxPostsPerDay: 50,
        maxCommentsPerDay: 200,
        maxLikesPerDay: 500,
        minInterval: 30,
        maxTasksPerBotPerDay: 8,
        failurePauseMinutes: 30,
        maxDailyCalls: 0,
        maxDailyTokens: 0,
        maxDailyCost: 0,
        maxMiniProgramCallsPerUserDay: 20,
      },
      scheduling: {
        batchSize: 5,
        taskLookaheadHours: 24,
        autoRetryFailed: false,
        maxRetryTimes: 1,
      },
      remark: '',
    };
  }

  private mergeConfig(value: any = {}) {
    const defaults = this.getDefaultConfig();
    return {
      ...defaults,
      ...(value || {}),
      riskControl: {
        ...defaults.riskControl,
        ...((value || {}).riskControl || {}),
      },
      scheduling: {
        ...defaults.scheduling,
        ...((value || {}).scheduling || {}),
      },
    };
  }

  private mergeConfigOverride(base: any = {}, override: any = {}) {
    const cleanBase = base && typeof base === 'object' && !Array.isArray(base) ? base : {};
    const cleanOverride = override && typeof override === 'object' && !Array.isArray(override) ? override : {};
    return {
      ...cleanBase,
      ...cleanOverride,
      riskControl: {
        ...(cleanBase.riskControl || {}),
        ...(cleanOverride.riskControl || {}),
      },
      scheduling: {
        ...(cleanBase.scheduling || {}),
        ...(cleanOverride.scheduling || {}),
      },
    };
  }

  private legacyRobotToConfig(value: any) {
    const robot = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const result: any = {};
    if (robot.postDailyLimit !== undefined) {
      result.riskControl = { ...(result.riskControl || {}), maxPostsPerDay: Number(robot.postDailyLimit) || 0 };
    }
    if (robot.commentDailyLimit !== undefined) {
      result.riskControl = { ...(result.riskControl || {}), maxCommentsPerDay: Number(robot.commentDailyLimit) || 0 };
    }
    if (robot.defaultInterval !== undefined) {
      result.riskControl = { ...(result.riskControl || {}), minInterval: Number(robot.defaultInterval) || 0 };
    }
    if (robot.autoAudit !== undefined) {
      result.contentSafetyEnabled = Boolean(robot.autoAudit);
      result.reviewBeforePost = Boolean(robot.autoAudit);
    }
    return result;
  }

  private aiConfigToLegacyRobotConfig(value: any) {
    const config = this.mergeConfig(value);
    const risk = config.riskControl || {};
    return {
      postDailyLimit: Number(risk.maxPostsPerDay || 0),
      commentDailyLimit: Number(risk.maxCommentsPerDay || 0),
      defaultInterval: Number(risk.minInterval || 0),
      autoAudit: Boolean(config.contentSafetyEnabled),
      enabledRegions: Array.isArray(config.enabledRegions) ? config.enabledRegions : [],
    };
  }

  private async mirrorLegacyRobotConfig(value: any, operatorId?: string) {
    const robotValue = this.aiConfigToLegacyRobotConfig(value);
    await this.prisma.config.upsert({
      where: { key: 'robot' },
      update: { value: robotValue, group: 'ai', updatedBy: operatorId || null },
      create: { key: 'robot', value: robotValue, group: 'ai', createdBy: operatorId || null, updatedBy: operatorId || null },
    }).catch(() => undefined);
  }

  private sanitizeConfig(config: any) {
    const merged = this.mergeConfig(config);
    const hasApiKey = Boolean(merged.apiKey && !String(merged.apiKey).includes('***'));
    return {
      ...merged,
      apiKey: hasApiKey ? '********' : '',
      hasApiKey,
    };
  }

  private normalizeBotStatus(status: any) {
    if (status === 1 || status === '1' || status === true || status === 'ACTIVE' || status === 'active') return 'active';
    if (status === 0 || status === '0' || status === false || status === 'INACTIVE' || status === 'disabled') return 'disabled';
    if (status === 'paused') return 'paused';
    return String(status || 'active');
  }

  private normalizePersonaPayload(data: any) {
    return {
      name: data.name,
      avatar: data.avatar || null,
      gender: data.gender || 'UNKNOWN',
      ageRange: data.ageRange || null,
      style: data.style || data.speakingStyle || data.personality || null,
      bio: data.bio || data.description || data.background || null,
      prompt: data.prompt || null,
      status: data.status || 'active',
    };
  }

  private formatDateStart(date = new Date()) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private isFailedLog(action?: string | null, detail?: any) {
    const normalizedAction = String(action || '').toLowerCase();
    const normalizedStatus = String(detail?.status || '').toLowerCase();
    return normalizedAction.includes('fail')
      || ['error', 'failed'].includes(normalizedAction)
      || ['error', 'failed'].includes(normalizedStatus)
      || Boolean(detail?.error);
  }

  private formatTechnicalError(message: any) {
    const raw = String(message || '').trim();
    if (!raw) return '';
    const lower = raw.toLowerCase();
    if (lower.includes('fetch failed') || lower.includes('network error')) {
      return 'AI服务连接失败，请检查模型配置、网络或服务商接口状态';
    }
    if (lower.includes('invalid `tx.comment.create()`') || lower.includes('tx.comment.create')) {
      return '发布评论失败：评论数据写入异常，请联系技术处理';
    }
    if (lower.includes('invalid `tx.post.create()`') || lower.includes('tx.post.create')) {
      return '发布笔记失败：笔记数据写入异常，请联系技术处理';
    }
    if (raw.includes('目标帖子不存在')) {
      return '目标帖子不存在，无法发布评论';
    }
    if (lower.includes('api key') || raw.includes('密钥')) {
      return 'AI密钥未配置或不可用，请检查AI配置';
    }
    if (lower.includes('timeout') || raw.includes('超时')) {
      return 'AI服务响应超时，请稍后重试或检查服务商状态';
    }
    return raw.length > 80 ? `${raw.slice(0, 80)}...` : raw;
  }

  private formatLogMessage(detail: any, action?: string | null) {
    if (!detail) return '';
    if (typeof detail === 'string') return this.formatTechnicalError(detail);
    const detailMessage = detail.message || detail.error || detail.content || detail.summary;
    const actionText = String(action || '').toLowerCase();
    if (actionText === 'generate_draft') {
      return detail.title ? `已生成草稿：${detail.title}` : '已生成AI草稿';
    }
    if (actionText === 'create_post') {
      return `已发布 ${Number(detail.createdCount || 1)} 篇笔记`;
    }
    if (actionText === 'create_comment') {
      return `已发布 ${Number(detail.createdCount || 1)} 条评论`;
    }
    if (actionText.includes('fail') || actionText === 'error') {
      return `任务执行失败：${this.formatTechnicalError(detailMessage || '请查看任务详情')}`;
    }
    if (detailMessage) return this.formatTechnicalError(detailMessage);
    return '已记录一次机器人操作';
  }

  private pageParams(query: any) {
    const page = Math.max(1, Number(query?.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query?.pageSize || query?.limit) || 20));
    return { page, pageSize, skip: (page - 1) * pageSize };
  }

  private dateWhere(query: any) {
    if (!query?.startDate && !query?.endDate) return undefined;
    const createdAt: any = {};
    if (query.startDate) createdAt.gte = new Date(query.startDate);
    if (query.endDate) createdAt.lte = new Date(`${query.endDate}T23:59:59.999Z`);
    return createdAt;
  }

  private maskConfigValue(value: any) {
    const merged = this.mergeConfig(value);
    return {
      ...merged,
      apiKey: merged.apiKey ? '********' : '',
    };
  }

  private async nextConfigVersion(configKey: string) {
    const latest = await this.prisma.aiConfigVersion.findFirst({
      where: { configKey },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    return (latest?.version || 0) + 1;
  }

  private toSettingFlag(value: any, fallback: number) {
    if (value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true') return 1;
    if (value === false || value === 0 || value === '0' || String(value).toLowerCase() === 'false') return 0;
    return fallback;
  }

  private async getCommentReviewSettings(regionId?: string | null) {
    if (!regionId) return { approvalType: 'none', aiFailureToManual: true };
    const config = await this.prisma.config.findUnique({
      where: { key: `content.note_settings.${regionId}` },
      select: { value: true },
    }).catch(() => null);
    const settings = (config?.value as any) || {};
    return {
      approvalType: String(settings.comment_approval_type || 'none').toLowerCase(),
      aiFailureToManual: this.toSettingFlag(
        settings.ai_review_failure_to_manual ?? settings.ai_review_failed_to_manual ?? settings.ai_manual_fallback,
        1,
      ) === 1,
    };
  }

  private async writeTaskTimeline(taskId: string, event: string, status?: string, detail?: any, operatorId?: string) {
    await this.prisma.aiTaskTimeline.create({
      data: { taskId, event, status: status || null, detail: detail || undefined, operatorId: operatorId || null },
    }).catch(() => undefined);
  }

  private async attachLatestCallMetrics(taskId: string, extra: Record<string, any> = {}) {
    const call = await this.prisma.aiCallLog.findFirst({
      where: { taskId },
      orderBy: { createdAt: 'desc' },
    }).catch(() => null);
    if (!call) return extra;
    return {
      ...extra,
      provider: call.provider,
      model: call.model,
      tokenInput: call.inputTokens,
      tokenOutput: call.outputTokens,
      costAmount: call.costAmount,
    };
  }

  private async resolveBotAccountId(input?: string) {
    if (!input) throw new BadRequestException('请选择执行机器人');
    const bot = await this.prisma.botAccount.findFirst({
      where: {
        OR: [
          { id: String(input) },
          { userId: String(input) },
        ],
      },
    });
    if (!bot) throw new BadRequestException('机器人不存在，请刷新后重试');
    if (bot.status !== 'active') throw new BadRequestException('该机器人未启用，不能创建执行任务');
    return bot.id;
  }

  private normalizeTaskType(type: any) {
    const normalized = String(type || 'post').trim();
    if (normalized === 'cold_start') return 'post';
    if (normalized === 'interaction' || normalized === 'comment_generate') return 'comment';
    return normalized;
  }

  private async resolveTargetPostIdForTask(type: any, targetPostId: any) {
    if (this.normalizeTaskType(type) !== 'comment') return null;
    const postId = String(targetPostId || '').trim();
    if (!postId) throw new BadRequestException('评论/互动任务必须绑定目标帖子ID');
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, deletedAt: true },
    });
    if (!post || post.deletedAt) throw new BadRequestException('目标帖子不存在或已删除，请重新复制帖子ID');
    return post.id;
  }

  private splitGeneratedItems(text: string, max = 6) {
    return String(text || '')
      .split(/\n+/)
      .map((item) => item.replace(/^[-*•\d.、\s]+/, '').trim())
      .filter(Boolean)
      .slice(0, max);
  }

  private getTaskContentPrompt(task: any) {
    return String(task.aiPrompt || task.content || task.title || '').trim();
  }

  private buildTaskPrompt(task: any) {
    const type = this.normalizeTaskType(task.type);
    const persona = task.bot?.persona;
    const botName = task.bot?.user?.nickname || '校园用户';
    const instruction = this.getTaskContentPrompt(task);
    const base = [
      `执行机器人：${botName}`,
      persona?.name ? `人设：${persona.name}` : '',
      persona?.style ? `说话风格：${persona.style}` : '',
      persona?.bio ? `背景：${persona.bio}` : '',
      instruction ? `运营要求：${instruction}` : '',
    ].filter(Boolean).join('\n');

    if (type === 'comment') {
      return [
        '请生成 1 到 5 条校园小程序评论，每条一行。',
        '要求：像真实用户随手回复，短句、自然、有生活感，不要编号，不要营销腔。',
        base,
      ].join('\n');
    }

    return [
      '请生成一条校园本地生活小程序笔记正文。',
      '要求：真实、自然、像学生或校园用户发布；不要夸张营销；不要出现“作为AI”等字样；可以有轻微口语感。',
      '只输出可直接发布的标题和正文，格式：第一行标题，第二行开始正文。',
      base,
    ].join('\n');
  }

  private buildTaskSystemPrompt(task: any) {
    const personaPrompt = task.bot?.persona?.prompt;
    if (personaPrompt) return personaPrompt;
    return '你是校园本地生活平台的真实用户内容运营助手，内容要自然、可信、适合校园社区。';
  }

  private async getTaskWithBot(id: string) {
    const task = await this.prisma.botPostTask.findUnique({
      where: { id },
      include: {
        bot: {
          include: {
            user: { select: { id: true, nickname: true, avatar: true } },
            persona: true,
          },
        },
      },
    });
    if (!task) throw new NotFoundException('AI任务不存在');
    if (!task.bot) throw new BadRequestException('任务未绑定机器人');
    if (task.bot.status !== 'active') throw new BadRequestException('任务机器人未启用，不能执行');
    return task;
  }

  private mediaUrlsFromTask(task: any): string[] {
    const raw = task.mediaUrls;
    if (Array.isArray(raw)) return raw.map((item) => String(item)).filter(Boolean);
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.map((item) => String(item)).filter(Boolean);
      } catch {
        return raw.split(',').map((item) => item.trim()).filter(Boolean);
      }
    }
    return [];
  }

  private parsePostDraft(text: string, fallbackTitle?: string | null) {
    const lines = String(text || '').split(/\n+/).map((line) => line.trim()).filter(Boolean);
    const first = lines[0] || fallbackTitle || '校园生活分享';
    const title = first.length <= 40 ? first : (fallbackTitle || first.slice(0, 30));
    const content = lines.length > 1 ? lines.slice(1).join('\n') : String(text || '').trim();
    return { title, content: content || title };
  }

  private async generateTaskContent(task: any) {
    const raw = await this.aiRuntime.generateText(this.buildTaskPrompt(task), {
      systemPrompt: this.buildTaskSystemPrompt(task),
      type: this.normalizeTaskType(task.type) === 'comment' ? 'comment_generate' : 'post_generate',
      source: 'admin_task',
      taskId: task.id,
      botId: task.botId,
      regionId: task.regionId || task.bot?.regionId || undefined,
    });
    const normalizedType = this.normalizeTaskType(task.type);
    if (normalizedType === 'comment') {
      return this.splitGeneratedItems(raw, 5).join('\n') || raw.trim();
    }
    return raw.trim();
  }

  private async ensureTaskContent(task: any) {
    const current = String(task.content || '').trim();
    const prompt = String(task.aiPrompt || '').trim();
    if (current && (!prompt || current !== prompt)) return current;
    return this.generateTaskContent(task);
  }

  // ==================== 运营工作台 ====================

  async getDashboard() {
    const todayStart = this.formatDateStart();
    const last7Start = new Date();
    last7Start.setDate(last7Start.getDate() - 6);
    last7Start.setHours(0, 0, 0, 0);

    const configRecord = await this.prisma.config.findUnique({ where: { key: 'ai_ops_config' } });
    const [runtimeConfig] = await Promise.all([this.aiRuntime.getSafeConfig()]);
    const config = {
      ...this.mergeConfig(configRecord?.value),
      provider: runtimeConfig.provider,
      apiBaseUrl: runtimeConfig.apiBaseUrl,
      model: runtimeConfig.model,
      hasApiKey: runtimeConfig.hasApiKey,
      source: runtimeConfig.source,
    };

    const [
      totalBots,
      activeBots,
      pausedBots,
      disabledBots,
      totalPersonas,
      totalTasks,
      pendingTasks,
      approvedTasks,
      runningTasks,
      completedTasks,
      failedTasks,
      todayTasks,
      todayLogs,
      recentTasks,
      recentLogs,
      botPool,
    ] = await Promise.all([
      this.prisma.botAccount.count(),
      this.prisma.botAccount.count({ where: { status: 'active' } }),
      this.prisma.botAccount.count({ where: { status: 'paused' } }),
      this.prisma.botAccount.count({ where: { status: { in: ['disabled', 'inactive', 'INACTIVE'] } } }),
      this.prisma.botPersona.count(),
      this.prisma.botPostTask.count(),
      this.prisma.botPostTask.count({ where: { status: 'pending' } }),
      this.prisma.botPostTask.count({ where: { status: 'approved' } }),
      this.prisma.botPostTask.count({ where: { status: 'running' } }),
      this.prisma.botPostTask.count({ where: { status: 'completed' } }),
      this.prisma.botPostTask.count({ where: { status: 'failed' } }),
      this.prisma.botPostTask.count({ where: { createdAt: { gte: todayStart } } }),
      this.prisma.botActionLog.count({ where: { createdAt: { gte: todayStart } } }),
      this.prisma.botPostTask.findMany({
        take: 8,
        orderBy: { createdAt: 'desc' },
        include: {
          bot: {
            include: {
              user: { select: { id: true, nickname: true, avatar: true } },
              persona: { select: { id: true, name: true } },
            },
          },
        },
      }),
      this.prisma.botActionLog.findMany({
        take: 8,
        orderBy: { createdAt: 'desc' },
        include: {
          bot: { include: { user: { select: { id: true, nickname: true, avatar: true } } } },
        },
      }),
      this.prisma.botAccount.findMany({
        take: 8,
        where: { status: 'active' },
        orderBy: { updatedAt: 'desc' },
        include: {
          user: { select: { id: true, nickname: true, avatar: true } },
          persona: { select: { id: true, name: true } },
          _count: { select: { tasks: true, actionLogs: true } },
        },
      }),
    ]);

    const warnings = [
      !config.enabled ? 'AI运营总开关未开启' : '',
      !config.hasApiKey ? 'AI模型密钥未配置，自动生成会失败' : '',
      activeBots === 0 ? '暂无启用机器人，请先创建或启用机器人' : '',
      totalPersonas === 0 ? '暂无人设，机器人内容会缺少风格约束' : '',
      failedTasks > 0 ? `存在 ${failedTasks} 个失败任务，请查看日志` : '',
      pendingTasks > 20 ? `待执行任务较多：${pendingTasks} 个` : '',
    ].filter(Boolean);

    return {
      success: true,
      data: {
        stats: {
          totalBots,
          activeBots,
          pausedBots,
          disabledBots,
          totalPersonas,
          totalTasks,
          pendingTasks,
          approvedTasks,
          runningTasks,
          completedTasks,
          failedTasks,
          todayTasks,
          todayLogs,
          healthScore: Math.max(0, 100 - warnings.length * 14),
        },
        config: { ...this.sanitizeConfig(config), hasApiKey: config.hasApiKey, source: config.source },
        warnings,
        taskStatus: [
          { key: 'pending', label: '待审核/待执行', value: pendingTasks },
          { key: 'approved', label: '已审核', value: approvedTasks },
          { key: 'running', label: '运行中', value: runningTasks },
          { key: 'completed', label: '已完成', value: completedTasks },
          { key: 'failed', label: '失败', value: failedTasks },
        ],
        recentTasks: recentTasks.map((task) => ({
          id: task.id,
          title: task.title || task.content?.slice(0, 28) || `任务-${task.id.slice(0, 8)}`,
          type: task.type,
          status: task.status,
          botName: task.bot?.user?.nickname || '-',
          botAvatar: task.bot?.user?.avatar || '',
          personaName: task.bot?.persona?.name || '-',
          regionId: task.regionId,
          failReason: task.failReason,
          createdAt: task.createdAt,
        })),
        recentLogs: recentLogs.map((log) => ({
          id: log.id,
          botName: log.bot?.user?.nickname || '-',
          botAvatar: log.bot?.user?.avatar || '',
          action: log.action,
          status: this.isFailedLog(log.action, log.detail) ? 'failed' : 'success',
          targetType: log.targetType,
          targetId: log.targetId,
          message: this.formatLogMessage(log.detail, log.action),
          createdAt: log.createdAt,
        })),
        botPool: botPool.map((bot) => ({
          id: bot.id,
          userId: bot.userId,
          nickname: bot.user?.nickname || '-',
          avatar: bot.user?.avatar || '',
          personaName: bot.persona?.name || '-',
          regionId: bot.regionId,
          dailyLimit: bot.dailyLimit,
          taskCount: bot._count.tasks,
          actionCount: bot._count.actionLogs,
        })),
      },
    };
  }

  // ==================== 机器人管理 ====================

  async getBots(query: any) {
    const { page = 1, pageSize = 20, status, regionId, keyword } = query;
    const where: any = {};
    if (status) where.status = this.normalizeBotStatus(status);
    if (regionId) where.regionId = regionId;
    if (keyword) where.user = { nickname: { contains: String(keyword) } };

    const [list, total] = await Promise.all([
      this.prisma.botAccount.findMany({
        where,
        include: {
          user: { select: { id: true, nickname: true, avatar: true, status: true, createdAt: true } },
          persona: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: Number(pageSize),
      }),
      this.prisma.botAccount.count({ where }),
    ]);

    const regionIds = Array.from(new Set(list.map((b) => b.regionId).filter(Boolean))) as string[];
    const regions = regionIds.length
      ? await this.prisma.region.findMany({ where: { id: { in: regionIds } }, select: { id: true, name: true } })
      : [];
    const regionMap = new Map(regions.map((r) => [r.id, r.name]));

    return {
      success: true,
      data: {
        list: list.map(b => ({
          id: b.userId,
          botAccountId: b.id,
          nickname: b.user?.nickname,
          avatar: b.user?.avatar,
          status: b.status,
          userStatus: b.user?.status,
          regionId: b.regionId,
          regionName: b.regionId ? regionMap.get(b.regionId) || '-' : '全局',
          personaId: b.personaId,
          personaName: b.persona?.name,
          botStatus: b.status,
          dailyLimit: b.dailyLimit,
          createdAt: b.user?.createdAt,
        })),
        total,
        page: Number(page),
        pageSize: Number(pageSize),
      },
    };
  }

  async createBot(data: any, operatorId: string, ip: string) {
    const { nickname, avatar, regionId, personaId, dailyLimit } = data;

    if (!nickname) throw new BadRequestException('机器人昵称不能为空');

    // 创建用户
    const user = await this.prisma.user.create({
      data: {
        openid: `bot_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        nickname,
        avatar: avatar || '/static/default-avatar.png',
        userType: 4,
        status: 'ACTIVE',
      },
    });
    await Promise.all([
      this.prisma.userProfile.upsert({
        where: { userId: user.id },
        update: { bio: data.bio || data.description || '校园 AI 运营账号' },
        create: { userId: user.id, bio: data.bio || data.description || '校园 AI 运营账号' },
      }).catch(() => undefined),
      this.prisma.userSettings.upsert({
        where: { userId: user.id },
        update: {},
        create: { userId: user.id },
      }).catch(() => undefined),
    ]);

    // 创建机器人账号
    const bot = await this.prisma.botAccount.create({
      data: {
        userId: user.id,
        personaId: personaId || null,
        regionId: regionId || null,
        dailyLimit: Number(dailyLimit || 10),
        status: 'active',
      },
    });

    await this.logOperation(operatorId, 'create', 'bot', user.id, ip);
    return { success: true, data: { ...user, botAccount: bot } };
  }

  async updateBot(id: string, data: any, operatorId: string, ip: string) {
    const bot = await this.prisma.botAccount.findUnique({ where: { userId: id } });
    if (!bot) throw new NotFoundException('机器人不存在');

    if ('nickname' in data || 'avatar' in data) {
      await this.prisma.user.update({
        where: { id },
        data: {
          nickname: data.nickname,
          avatar: data.avatar,
        },
      });
    }

    await this.prisma.botAccount.update({
      where: { userId: id },
      data: {
        personaId: data.personaId || null,
        regionId: data.regionId || null,
        dailyLimit: data.dailyLimit !== undefined ? Number(data.dailyLimit) : undefined,
        status: data.status ? this.normalizeBotStatus(data.status) : undefined,
      },
    });

    await this.logOperation(operatorId, 'update', 'bot', id, ip);
    return { success: true };
  }

  async updateBotStatus(id: string, status: string, operatorId: string) {
    const bot = await this.prisma.botAccount.findUnique({ where: { userId: id } });
    if (!bot) throw new NotFoundException('机器人不存在');

    await this.prisma.botAccount.update({
      where: { userId: id },
      data: { status: this.normalizeBotStatus(status) },
    });

    return { success: true };
  }

  // ==================== 任务管理 ====================

  async getTasks(query: any) {
    const { page = 1, pageSize = 20, type, status, regionId } = query;
    const where: any = {};
    if (type) where.type = type;
    if (status) where.status = status;
    if (regionId) where.regionId = regionId;

    const [list, total] = await Promise.all([
      this.prisma.botPostTask.findMany({
        where,
        include: {
          bot: { include: { user: { select: { id: true, nickname: true, avatar: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: Number(pageSize),
      }),
      this.prisma.botPostTask.count({ where }),
    ]);

    return {
      success: true,
      data: {
        list: list.map(t => ({
          id: t.id,
          name: t.title || `任务-${t.id.slice(0, 8)}`,
          type: t.type,
          status: t.status,
          botId: t.botId,
          botName: t.bot?.user?.nickname,
          botAvatar: t.bot?.user?.avatar,
          regionId: t.regionId,
          circleId: t.circleId,
          topicId: t.topicId,
          content: t.content,
          mediaUrls: t.mediaUrls,
          targetPostId: t.targetPostId,
          failReason: t.failReason,
          isAiGenerated: t.isAiGenerated,
          aiPrompt: t.aiPrompt,
          aiResult: t.aiResult,
          publishAt: t.publishAt,
          publishedPostId: t.publishedPostId,
          createdAt: t.createdAt,
        })),
        total,
        page: Number(page),
        pageSize: Number(pageSize),
      },
    };
  }

  async createTask(data: any, operatorId: string, ip: string) {
    const { type, title, content, botId, regionId, publishAt, mediaUrls, targetPostId, circleId, topicId } = data;

    if (!type) throw new BadRequestException('任务类型不能为空');
    const resolvedBotId = await this.resolveBotAccountId(botId);
    const resolvedTargetPostId = await this.resolveTargetPostIdForTask(type, targetPostId);

    const task = await this.prisma.botPostTask.create({
      data: {
        type: type || 'post',
        title: title || data.name || '',
        content: content || data.description || '',
        aiPrompt: content || data.description || '',
        botId: resolvedBotId,
        regionId: regionId || null,
        circleId: circleId || null,
        topicId: topicId || null,
        mediaUrls: Array.isArray(mediaUrls) ? mediaUrls : undefined,
        targetPostId: resolvedTargetPostId,
        publishAt: publishAt ? new Date(publishAt) : undefined,
        status: 'pending',
        source: data.source || 'admin',
        priority: Number(data.priority || 0),
        maxRetryTimes: Number(data.maxRetryTimes || data.maxRetry || 1),
      },
    });

    await this.writeTaskTimeline(task.id, 'created', task.status, { type: task.type, title: task.title }, operatorId);
    await this.logOperation(operatorId, 'create', 'ai_task', task.id, ip);
    return { success: true, data: task };
  }

  async updateTask(id: string, data: any, operatorId: string, ip: string) {
    const task = await this.prisma.botPostTask.findUnique({ where: { id } });
    if (!task) throw new NotFoundException('任务不存在');
    const nextType = data.type ?? task.type;
    const nextTargetPostId = data.targetPostId ?? task.targetPostId;
    const resolvedTargetPostId = await this.resolveTargetPostIdForTask(nextType, nextTargetPostId);

    const updateData: any = {
      title: data.title ?? data.name,
      content: data.content ?? data.description,
      aiPrompt: data.aiPrompt ?? data.prompt,
      regionId: data.regionId || null,
      type: data.type,
      targetPostId: resolvedTargetPostId,
      circleId: data.circleId || null,
      topicId: data.topicId || null,
      publishAt: data.publishAt ? new Date(data.publishAt) : undefined,
    };
    if (Array.isArray(data.mediaUrls)) updateData.mediaUrls = data.mediaUrls;
    if (data.botId) updateData.botId = await this.resolveBotAccountId(data.botId);

    Object.keys(updateData).forEach((key) => updateData[key] === undefined && delete updateData[key]);

    const updated = await this.prisma.botPostTask.update({
      where: { id },
      data: updateData,
    });

    await this.writeTaskTimeline(id, 'updated', updated.status, { fields: Object.keys(updateData) }, operatorId);
    await this.logOperation(operatorId, 'update', 'ai_task', id, ip);
    return { success: true, data: updated };
  }

  async updateTaskStatus(id: string, status: string, operatorId: string) {
    const task = await this.prisma.botPostTask.findUnique({ where: { id } });
    if (!task) throw new NotFoundException('任务不存在');

    await this.prisma.botPostTask.update({
      where: { id },
      data: { status },
    });

    await this.writeTaskTimeline(id, 'status_changed', status, {}, operatorId);
    return { success: true };
  }

  async generateTaskDraft(id: string, operatorId: string) {
    const task = await this.getTaskWithBot(id);
    const generated = await this.generateTaskContent(task);
    const callMetrics = await this.attachLatestCallMetrics(id);
    const updated = await this.prisma.botPostTask.update({
      where: { id },
      data: {
        content: generated,
        aiPrompt: this.getTaskContentPrompt(task) || task.aiPrompt,
        aiResult: generated,
        isAiGenerated: true,
        failReason: null,
        ...callMetrics,
      },
    });
    await this.prisma.aiGeneratedSnapshot.create({
      data: {
        taskId: id,
        botId: task.botId,
        targetType: this.normalizeTaskType(task.type),
        targetId: task.targetPostId || null,
        prompt: this.buildTaskPrompt(task),
        rawResult: generated,
        finalContent: generated,
        mediaUrls: task.mediaUrls || undefined,
      },
    }).catch(() => undefined);
    await this.writeTaskTimeline(id, 'draft_generated', updated.status, { length: generated.length }, operatorId);
    await this.prisma.botActionLog.create({
      data: {
        botId: task.botId,
        action: 'generate_draft',
        targetType: 'ai_task',
        targetId: id,
        detail: { operatorId, type: task.type, title: task.title },
      },
    }).catch(() => {});
    return { success: true, data: updated };
  }

  async runTask(id: string, operatorId: string) {
    const lockKey = `ai:task:run:${id}`;
    const locked = await this.redis.getLock(lockKey, 15 * 60);
    if (!locked) throw new BadRequestException('该 AI 任务正在执行中，请稍后再试');
    try {
      return await this.runTaskUnlocked(id, operatorId);
    } finally {
      await this.redis.releaseLock(lockKey).catch(() => undefined);
    }
  }

  private async runTaskUnlocked(id: string, operatorId: string) {
    const task = await this.getTaskWithBot(id);
    if (['completed', 'cancelled'].includes(task.status)) {
      throw new BadRequestException('任务已结束，不能重复执行');
    }

    await this.prisma.botPostTask.update({
      where: { id },
      data: {
        status: 'running',
        failReason: null,
        startedAt: new Date(),
        lockedAt: new Date(),
        lockedBy: operatorId || 'system',
      },
    });
    await this.writeTaskTimeline(id, 'started', 'running', { operatorId }, operatorId);

    try {
      const normalizedType = this.normalizeTaskType(task.type);
      const generatedContent = await this.ensureTaskContent(task);
      let targetId = '';
      let createdCount = 0;
      let publishedCommentIds: string[] = [];

      if (normalizedType === 'post') {
        const mediaUrls = this.mediaUrlsFromTask(task);
        const draft = this.parsePostDraft(generatedContent, task.title);
        const runtimeConfig = await this.aiRuntime.getRuntimeConfig({ allowDisabled: true });
        const needsReview = Boolean(runtimeConfig.reviewBeforePost && task.status !== 'approved');
        const post = await this.prisma.post.create({
          data: {
            userId: task.bot.userId,
            regionId: task.regionId || task.bot.regionId || null,
            circleId: task.circleId || null,
            title: draft.title,
            content: draft.content,
            status: needsReview ? 'PENDING' : 'PUBLISHED',
            auditStatus: needsReview ? 'pending' : 'approved',
            auditReason: needsReview ? 'AI任务生成，等待人工审核' : 'AI任务生成，已通过',
            type: mediaUrls.length > 0 ? 'IMAGE' : 'TEXT',
            media: mediaUrls.length > 0
              ? { create: mediaUrls.map((url, index) => ({ type: 'IMAGE', url, sortOrder: index })) }
              : undefined,
            topics: task.topicId
              ? { create: [{ topicId: task.topicId }] }
              : undefined,
          } as any,
        });
        targetId = post.id;
        createdCount = 1;
      } else if (normalizedType === 'comment') {
        if (!task.targetPostId) throw new BadRequestException('评论任务必须绑定目标帖子ID');
        const comments = this.splitGeneratedItems(generatedContent, 5);
        if (comments.length === 0) throw new BadRequestException('AI未生成可发布的评论内容');
        const targetPost = await this.prisma.post.findUnique({
          where: { id: task.targetPostId },
          select: { id: true, regionId: true },
        });
        if (!targetPost) throw new BadRequestException('目标帖子不存在，无法发布评论');
        const reviewSettings = await this.getCommentReviewSettings(targetPost.regionId || task.regionId || task.bot.regionId);
        const approvalType = reviewSettings.approvalType;
        const reviews: Array<{
          content: string;
          status: string;
          auditStatus: string;
          auditReason: string;
          aiResult?: any;
        }> = [];
        for (const content of comments) {
          let review = {
            content,
            status: 'active',
            auditStatus: 'approved',
            auditReason: '无需审核',
            aiResult: undefined as any,
          };
          if (['ai', 'llm', 'model'].includes(approvalType)) {
            const result = await this.aiRuntime.moderateContent({
              type: 'comment',
              content,
              regionId: targetPost.regionId || task.regionId || task.bot.regionId,
              approvalType,
              manualFallback: reviewSettings.aiFailureToManual,
            });
            review = {
              content,
              status: result.decision === 'approve' ? 'active' : 'hidden',
              auditStatus: result.decision === 'approve' ? 'approved' : result.decision === 'reject' ? 'rejected' : 'pending',
              auditReason: result.reason || (result.decision === 'approve' ? 'AI审核通过' : 'AI建议人工复核'),
              aiResult: result,
            };
          } else if (!['none', 'auto', 'pass', 'published', 'approved'].includes(approvalType)) {
            review = {
              content,
              status: 'hidden',
              auditStatus: 'pending',
              auditReason: '等待人工审核',
              aiResult: undefined,
            };
          }
          reviews.push(review);
        }
        const created = await this.prisma.$transaction(async (tx) => {
          const rows = [];
          for (const review of reviews) {
            rows.push(await tx.comment.create({
              data: {
                postId: task.targetPostId!,
                userId: task.bot.userId,
                content: review.content,
                status: review.status,
                auditStatus: review.auditStatus,
                auditReason: review.auditReason,
              },
            }));
          }
          const visibleCount = rows.filter((row) => row.status === 'active' && row.auditStatus === 'approved').length;
          if (visibleCount > 0) {
            await tx.post.update({
              where: { id: task.targetPostId! },
              data: { commentCount: { increment: visibleCount } },
            });
          }
          return rows;
        });
        await Promise.all(created.map((comment, index) => {
          const review = reviews[index];
          if (!review?.aiResult) return undefined;
          return this.aiRuntime.recordModeration({
            targetType: 'comment',
            targetId: comment.id,
            userId: task.bot.userId,
            regionId: targetPost.regionId || task.regionId || task.bot.regionId,
            approvalType,
            result: review.aiResult,
            finalStatus: review.auditStatus,
          });
        }));
        targetId = created[0]?.id || task.targetPostId;
        createdCount = created.length;
        publishedCommentIds = created.map((item) => item.id);
      } else {
        throw new BadRequestException(`暂不支持执行 ${task.type} 类型的AI任务`);
      }

      const updated = await this.prisma.botPostTask.update({
        where: { id },
        data: await this.attachLatestCallMetrics(id, {
          status: 'completed',
          content: generatedContent,
          aiResult: generatedContent,
          isAiGenerated: true,
          publishedPostId: targetId || null,
          publishedCommentIds: normalizedType === 'comment' ? publishedCommentIds : undefined,
          reviewedBy: operatorId || task.reviewedBy,
          reviewedAt: new Date(),
          completedAt: new Date(),
          lockedAt: null,
          lockedBy: null,
          failReason: null,
        }),
      });
      await this.prisma.botAccount.update({
        where: { id: task.botId },
        data: { failureCount: 0, lastExecutedAt: new Date(), riskLevel: 'normal' },
      }).catch(() => undefined);
      await this.prisma.aiGeneratedSnapshot.create({
        data: {
          taskId: id,
          botId: task.botId,
          targetType: normalizedType,
          targetId: targetId || null,
          prompt: this.buildTaskPrompt(task),
          rawResult: generatedContent,
          finalContent: generatedContent,
          mediaUrls: task.mediaUrls || undefined,
        },
      }).catch(() => undefined);
      await this.writeTaskTimeline(id, 'completed', 'completed', { targetId, createdCount }, operatorId);
      await this.prisma.botActionLog.create({
        data: {
          botId: task.botId,
          action: normalizedType === 'post' ? 'create_post' : 'create_comment',
          targetType: normalizedType,
          targetId,
          detail: { taskId: id, operatorId, createdCount, originalType: task.type },
        },
      }).catch(() => {});
      return { success: true, data: { task: updated, targetId, createdCount } };
    } catch (error: any) {
      const rawMessage = error?.message || 'AI任务执行失败';
      const message = this.formatTechnicalError(rawMessage);
      await this.prisma.botPostTask.update({
        where: { id },
        data: {
          status: 'failed',
          failReason: message,
          completedAt: new Date(),
          lockedAt: null,
          lockedBy: null,
          retryCount: { increment: 1 },
        },
      }).catch(() => {});
      await this.prisma.botAccount.update({
        where: { id: task.botId },
        data: { failureCount: { increment: 1 }, riskLevel: 'warning' },
      }).catch(() => undefined);
      await this.prisma.aiRiskEvent.create({
        data: {
          eventType: 'task_failed',
          level: 'warning',
          botId: task.botId,
          taskId: id,
          regionId: task.regionId || task.bot.regionId || null,
          detail: { message, rawMessage, operatorId },
        },
      }).catch(() => undefined);
      await this.writeTaskTimeline(id, 'failed', 'failed', { message }, operatorId);
      await this.prisma.botActionLog.create({
        data: {
          botId: task.botId,
          action: 'task_failed',
          targetType: 'ai_task',
          targetId: id,
          detail: { operatorId, error: message, rawError: rawMessage },
        },
      }).catch(() => {});
      throw new BadRequestException(message);
    }
  }

  // ==================== 日志管理 ====================

  async getLogs(query: any) {
    const { page = 1, pageSize = 20, botId, action, startDate, endDate } = query;
    const where: any = {};
    if (botId) where.botId = botId;
    if (action) {
      where.action = ['error', 'failed'].includes(String(action))
        ? { in: ['error', 'failed', 'task_failed'] }
        : action;
    }
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate + 'T23:59:59.999Z');
    }

    const [list, total] = await Promise.all([
      this.prisma.botActionLog.findMany({
        where,
        include: {
          bot: { include: { user: { select: { id: true, nickname: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: Number(pageSize),
      }),
      this.prisma.botActionLog.count({ where }),
    ]);

    return {
      success: true,
      data: {
        list: list.map(l => ({
          id: l.id,
          botId: l.botId,
          botName: l.bot?.user?.nickname,
          action: l.action,
          status: this.isFailedLog(l.action, l.detail) ? 'failed' : 'success',
          targetType: l.targetType,
          targetId: l.targetId,
          detail: l.detail,
          message: this.formatLogMessage(l.detail, l.action),
          createdAt: l.createdAt,
        })),
        total,
        page: Number(page),
        pageSize: Number(pageSize),
      },
    };
  }

  async getCallLogs(query: any) {
    const { page, pageSize, skip } = this.pageParams(query);
    const where: any = {};
    for (const key of ['purpose', 'status', 'provider', 'model', 'taskId', 'botId', 'regionId', 'source']) {
      if (query?.[key]) where[key] = String(query[key]);
    }
    const createdAt = this.dateWhere(query);
    if (createdAt) where.createdAt = createdAt;
    if (query?.keyword) {
      where.OR = [
        { requestId: { contains: String(query.keyword) } },
        { promptPreview: { contains: String(query.keyword) } },
        { responsePreview: { contains: String(query.keyword) } },
        { errorMessage: { contains: String(query.keyword) } },
      ];
    }

    const [list, total] = await Promise.all([
      this.prisma.aiCallLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.aiCallLog.count({ where }),
    ]);
    return {
      success: true,
      data: {
        list: list.map((item) => ({ ...item, costAmount: Number(item.costAmount || 0) })),
        total,
        page,
        pageSize,
      },
    };
  }

  async getModerationRecords(query: any) {
    const { page, pageSize, skip } = this.pageParams(query);
    const where: any = {};
    for (const key of ['targetType', 'targetId', 'decision', 'regionId', 'userId', 'approvalType', 'finalStatus']) {
      if (query?.[key]) where[key] = String(query[key]);
    }
    const createdAt = this.dateWhere(query);
    if (createdAt) where.createdAt = createdAt;

    const [list, total] = await Promise.all([
      this.prisma.aiModerationRecord.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.aiModerationRecord.count({ where }),
    ]);
    return { success: true, data: { list, total, page, pageSize } };
  }

  async getQuotaUsage(query: any) {
    const { page, pageSize, skip } = this.pageParams(query);
    const where: any = {};
    for (const key of ['provider', 'model', 'purpose', 'regionId', 'botId', 'scopeKey']) {
      if (query?.[key]) where[key] = String(query[key]);
    }
    if (query?.startDate || query?.endDate) {
      where.date = {};
      if (query.startDate) where.date.gte = new Date(query.startDate);
      if (query.endDate) where.date.lte = new Date(`${query.endDate}T23:59:59.999Z`);
    }
    const [list, total, summary] = await Promise.all([
      this.prisma.aiQuotaUsage.findMany({
        where,
        orderBy: [{ date: 'desc' }, { updatedAt: 'desc' }],
        skip,
        take: pageSize,
      }),
      this.prisma.aiQuotaUsage.count({ where }),
      this.prisma.aiQuotaUsage.aggregate({
        where,
        _sum: {
          callCount: true,
          successCount: true,
          failedCount: true,
          inputTokens: true,
          outputTokens: true,
          costAmount: true,
        },
      }),
    ]);
    return {
      success: true,
      data: {
        list: list.map((item) => ({ ...item, costAmount: Number(item.costAmount || 0) })),
        total,
        page,
        pageSize,
        summary: {
          callCount: summary._sum.callCount || 0,
          successCount: summary._sum.successCount || 0,
          failedCount: summary._sum.failedCount || 0,
          inputTokens: summary._sum.inputTokens || 0,
          outputTokens: summary._sum.outputTokens || 0,
          costAmount: Number(summary._sum.costAmount || 0),
        },
      },
    };
  }

  async getRiskEvents(query: any) {
    const { page, pageSize, skip } = this.pageParams(query);
    const where: any = {};
    for (const key of ['eventType', 'level', 'status', 'botId', 'taskId', 'regionId', 'targetType', 'targetId']) {
      if (query?.[key]) where[key] = String(query[key]);
    }
    const createdAt = this.dateWhere(query);
    if (createdAt) where.createdAt = createdAt;
    const [list, total] = await Promise.all([
      this.prisma.aiRiskEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.aiRiskEvent.count({ where }),
    ]);
    return { success: true, data: { list, total, page, pageSize } };
  }

  async handleRiskEvent(id: string, body: any, operatorId: string) {
    const event = await this.prisma.aiRiskEvent.findUnique({ where: { id } });
    if (!event) throw new NotFoundException('AI风险事件不存在');
    const updated = await this.prisma.aiRiskEvent.update({
      where: { id },
      data: {
        status: body?.status || 'handled',
        handledBy: operatorId || null,
        handledAt: new Date(),
        detail: { ...((event.detail as any) || {}), handleRemark: body?.remark || '' },
      },
    });
    return { success: true, data: updated };
  }

  async getConfigVersions(query: any) {
    const { page, pageSize, skip } = this.pageParams(query);
    const configKey = String(query?.configKey || 'ai_ops_config');
    const [list, total] = await Promise.all([
      this.prisma.aiConfigVersion.findMany({
        where: { configKey },
        orderBy: { version: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.aiConfigVersion.count({ where: { configKey } }),
    ]);
    return { success: true, data: { list, total, page, pageSize } };
  }

  async rollbackConfigVersion(id: string, operatorId: string) {
    const version = await this.prisma.aiConfigVersion.findUnique({ where: { id } });
    if (!version) throw new NotFoundException('AI配置版本不存在');
    await this.prisma.config.upsert({
      where: { key: version.configKey },
      update: { value: version.value as any, updatedAt: new Date() },
      create: { key: version.configKey, value: version.value as any, group: 'ai' },
    });
    const nextVersion = await this.nextConfigVersion(version.configKey);
    await this.prisma.aiConfigVersion.create({
      data: {
        configKey: version.configKey,
        version: nextVersion,
        value: version.value as any,
        maskedValue: this.maskConfigValue(version.value),
        changedBy: operatorId || null,
        changeReason: `回滚到版本 ${version.version}`,
      },
    }).catch(() => undefined);
    return { success: true };
  }

  async getTaskTimeline(id: string) {
    const [task, list] = await Promise.all([
      this.prisma.botPostTask.findUnique({ where: { id } }),
      this.prisma.aiTaskTimeline.findMany({ where: { taskId: id }, orderBy: { createdAt: 'asc' } }),
    ]);
    if (!task) throw new NotFoundException('AI任务不存在');
    return { success: true, data: { task, list } };
  }

  async retryTask(id: string, operatorId: string) {
    const task = await this.prisma.botPostTask.findUnique({ where: { id } });
    if (!task) throw new NotFoundException('AI任务不存在');
    if (!['failed', 'cancelled'].includes(task.status)) {
      throw new BadRequestException('只有失败或已取消的任务可以重新排队');
    }
    const updated = await this.prisma.botPostTask.update({
      where: { id },
      data: {
        status: 'pending',
        failReason: null,
        cancelledAt: null,
        completedAt: null,
        lockedAt: null,
        lockedBy: null,
      },
    });
    await this.redis.releaseLock(`ai:task:run:${id}`).catch(() => undefined);
    await this.writeTaskTimeline(id, 'retry_queued', updated.status, {}, operatorId);
    return { success: true, data: updated };
  }

  async cancelTask(id: string, operatorId: string) {
    const task = await this.prisma.botPostTask.findUnique({ where: { id } });
    if (!task) throw new NotFoundException('AI任务不存在');
    if (task.status === 'completed') throw new BadRequestException('已完成任务不能取消');
    const updated = await this.prisma.botPostTask.update({
      where: { id },
      data: {
        status: 'cancelled',
        cancelledAt: new Date(),
        completedAt: new Date(),
        lockedAt: null,
        lockedBy: null,
      },
    });
    await this.redis.releaseLock(`ai:task:run:${id}`).catch(() => undefined);
    await this.writeTaskTimeline(id, 'cancelled', updated.status, {}, operatorId);
    return { success: true, data: updated };
  }

  async getRepairStats() {
    const staleTime = new Date(Date.now() - 30 * 60 * 1000);
    const [staleRunningTasks, bots, commentMismatchRows] = await Promise.all([
      this.prisma.botPostTask.count({ where: { status: 'running', startedAt: { lt: staleTime } } }),
      this.prisma.botAccount.findMany({
        include: { user: { include: { profile: true, settings: true } } },
        take: 5000,
      }),
      this.prisma.$queryRaw<Array<{ count: number }>>`
        SELECT COUNT(*)::int AS count
        FROM posts p
        LEFT JOIN (
          SELECT "postId", COUNT(*)::int AS visible_count
          FROM comments
          WHERE "deletedAt" IS NULL AND status = 'active' AND "auditStatus" = 'approved'
          GROUP BY "postId"
        ) c ON c."postId" = p.id
        WHERE COALESCE(p."commentCount", 0) <> COALESCE(c.visible_count, 0)
      `.catch(() => [{ count: 0 }]),
    ]);
    return {
      success: true,
      data: {
        staleRunningTasks,
        commentCountMismatches: Number(commentMismatchRows?.[0]?.count || 0),
        botsMissingProfile: bots.filter(bot => !bot.user?.profile).length,
        botsMissingSettings: bots.filter(bot => !bot.user?.settings).length,
      },
    };
  }

  async repairRunningTasks(operatorId: string) {
    const staleTime = new Date(Date.now() - 30 * 60 * 1000);
    const tasks = await this.prisma.botPostTask.findMany({
      where: { status: 'running', startedAt: { lt: staleTime } },
      select: { id: true, botId: true, regionId: true },
      take: 200,
    });
    for (const task of tasks) {
      await this.prisma.botPostTask.update({
        where: { id: task.id },
        data: {
          status: 'failed',
          failReason: '任务运行超时，已由数据修复面板标记失败',
          completedAt: new Date(),
          lockedAt: null,
          lockedBy: null,
        },
      });
      await this.redis.releaseLock(`ai:task:run:${task.id}`).catch(() => undefined);
      await this.writeTaskTimeline(task.id, 'repair_timeout', 'failed', {}, operatorId);
      await this.prisma.aiRiskEvent.create({
        data: {
          eventType: 'repair_stale_running_task',
          level: 'warning',
          botId: task.botId,
          taskId: task.id,
          regionId: task.regionId || null,
          status: 'handled',
          handledBy: operatorId || null,
          handledAt: new Date(),
          detail: { action: 'mark_failed' },
        },
      }).catch(() => undefined);
    }
    return { success: true, data: { repaired: tasks.length } };
  }

  async repairCommentCounts(operatorId: string) {
    const rows = await this.prisma.$queryRaw<Array<{ id: string; actual: number }>>`
      SELECT p.id, COALESCE(c.visible_count, 0)::int AS actual
      FROM posts p
      LEFT JOIN (
        SELECT "postId", COUNT(*)::int AS visible_count
        FROM comments
        WHERE "deletedAt" IS NULL AND status = 'active' AND "auditStatus" = 'approved'
        GROUP BY "postId"
      ) c ON c."postId" = p.id
      WHERE COALESCE(p."commentCount", 0) <> COALESCE(c.visible_count, 0)
      LIMIT 5000
    `.catch(() => []);
    let repaired = 0;
    for (const item of rows) {
      await this.prisma.post.update({
        where: { id: item.id },
        data: { commentCount: Number(item.actual || 0) },
      }).then(() => { repaired += 1; }).catch(() => undefined);
    }
    await this.prisma.adminOperationLog.create({
      data: { accountId: operatorId || '', action: 'repair_comment_counts', module: 'ai_repair', targetId: 'comments', ip: '' },
    }).catch(() => undefined);
    return { success: true, data: { repaired } };
  }

  async repairBotProfiles(operatorId: string) {
    const bots = await this.prisma.botAccount.findMany({
      include: { user: { include: { profile: true, settings: true } } },
      take: 1000,
    });
    let profiles = 0;
    let settings = 0;
    for (const bot of bots) {
      if (!bot.user?.profile) {
        await this.prisma.userProfile.create({
          data: { userId: bot.userId, bio: '校园 AI 运营账号' },
        }).then(() => { profiles += 1; }).catch(() => undefined);
      }
      if (!bot.user?.settings) {
        await this.prisma.userSettings.create({
          data: { userId: bot.userId },
        }).then(() => { settings += 1; }).catch(() => undefined);
      }
    }
    await this.prisma.adminOperationLog.create({
      data: { accountId: operatorId || '', action: 'repair_bot_profiles', module: 'ai_repair', targetId: 'bots', ip: '' },
    }).catch(() => undefined);
    return { success: true, data: { profiles, settings } };
  }

  // ==================== 配置管理 ====================

  async getConfig() {
    const [config, legacyRobot] = await Promise.all([
      this.prisma.config.findUnique({ where: { key: 'ai_ops_config' } }),
      this.prisma.config.findUnique({ where: { key: 'robot' } }).catch(() => null),
    ]);
    const runtimeConfig = await this.aiRuntime.getSafeConfig();
    const mergedConfig = this.mergeConfigOverride(this.legacyRobotToConfig(legacyRobot?.value), config?.value);
    const safe = this.sanitizeConfig(mergedConfig);
    return {
      success: true,
      data: {
        ...safe,
        provider: safe.provider || runtimeConfig.provider,
        apiBaseUrl: safe.apiBaseUrl || runtimeConfig.apiBaseUrl,
        model: safe.model || runtimeConfig.model,
        hasApiKey: runtimeConfig.hasApiKey,
        source: runtimeConfig.source,
      },
    };
  }

  async saveConfig(data: any, operatorId: string, ip: string) {
    const [existing, legacyAi, legacyRobot] = await Promise.all([
      this.prisma.config.findUnique({ where: { key: 'ai_ops_config' } }),
      this.prisma.config.findUnique({ where: { key: 'ai' } }).catch(() => null),
      this.prisma.config.findUnique({ where: { key: 'robot' } }).catch(() => null),
    ]);
    const existingConfig = this.mergeConfig(this.mergeConfigOverride(this.legacyRobotToConfig(legacyRobot?.value), existing?.value));
    const legacyAiValue = (legacyAi?.value || {}) as any;
    const incoming = this.mergeConfig(this.mergeConfigOverride(this.legacyRobotToConfig(legacyRobot?.value), data));
    if (!data.apiKey || String(data.apiKey).includes('*')) {
      incoming.apiKey = existingConfig.apiKey || legacyAiValue.apiKey || '';
    }
    if (!data.apiBaseUrl && data.apiEndpoint) incoming.apiBaseUrl = data.apiEndpoint;

    await this.prisma.config.upsert({
      where: { key: 'ai_ops_config' },
      update: { value: incoming, updatedAt: new Date() },
      create: { key: 'ai_ops_config', value: incoming, group: 'ai' },
    });
    const version = await this.nextConfigVersion('ai_ops_config');
    await this.prisma.aiConfigVersion.create({
      data: {
        configKey: 'ai_ops_config',
        version,
        value: incoming,
        maskedValue: this.maskConfigValue(incoming),
        changedBy: operatorId || null,
        changeReason: data.changeReason || data.remark || '后台保存 AI 配置',
      },
    }).catch(() => undefined);
    await this.mirrorLegacyRobotConfig(incoming, operatorId);

    await this.logOperation(operatorId, 'save', 'ai_config', 'global', ip);
    return { success: true };
  }

  async testConfig() {
    const [activeBots, personas] = await Promise.all([
      this.prisma.botAccount.count({ where: { status: 'active' } }),
      this.prisma.botPersona.count(),
    ]);
    const missing: string[] = [];
    let runtime: any;
    try {
      runtime = await this.aiRuntime.testConnection();
      missing.push(...(runtime.missing || []));
    } catch (error: any) {
      runtime = { ok: false, error: error?.message || 'AI模型连通性测试失败' };
      missing.push(runtime.error);
    }
    if (activeBots === 0) missing.push('没有启用中的机器人');
    if (personas === 0) missing.push('没有可用人设');

    return {
      success: true,
      data: {
        ok: missing.length === 0 && Boolean(runtime?.ok),
        missing,
        provider: runtime?.provider,
        model: runtime?.model,
        source: runtime?.source,
        sample: runtime?.sample,
        activeBots,
        personas,
      },
    };
  }

  async testGenerate() {
    const text = await this.aiRuntime.generateText(
      '请为校园本地生活小程序生成一条自然的运营笔记草稿，要求不超过80字，语气真实，不要出现广告腔。',
      {
        systemPrompt: '你是校园本地生活平台的内容运营助手，只输出可直接发布的中文内容。',
        type: 'post',
      },
    );
    return {
      success: true,
      data: {
        ok: true,
        sample: text,
      },
    };
  }

  // ==================== 人设管理 ====================

  async getPersonas(query: any) {
    const { page = 1, pageSize = 20 } = query;

    const [list, total] = await Promise.all([
      this.prisma.botPersona.findMany({
        include: { _count: { select: { bots: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: Number(pageSize),
      }),
      this.prisma.botPersona.count(),
    ]);

    return {
      success: true,
      data: {
        list: list.map((p: any) => ({
          ...p,
          botCount: p._count?.bots || 0,
          description: p.bio,
          personality: p.style,
          speakingStyle: p.style,
          background: p.bio,
        })),
        total,
        page: Number(page),
        pageSize: Number(pageSize),
      },
    };
  }

  async createPersona(data: any, operatorId: string, ip: string) {
    if (!data.name) throw new BadRequestException('人设名称不能为空');

    const persona = await this.prisma.botPersona.create({ data: this.normalizePersonaPayload(data) });

    await this.logOperation(operatorId, 'create', 'persona', persona.id, ip);
    return { success: true, data: persona };
  }

  async updatePersona(id: string, data: any, operatorId: string, ip: string) {
    const persona = await this.prisma.botPersona.findUnique({ where: { id } });
    if (!persona) throw new NotFoundException('人设不存在');

    const payload = this.normalizePersonaPayload({ ...persona, ...data });
    const updated = await this.prisma.botPersona.update({ where: { id }, data: payload });

    await this.logOperation(operatorId, 'update', 'persona', id, ip);
    return { success: true, data: updated };
  }
}
