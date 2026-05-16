import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { AiRuntimeService } from '../ai-runtime/ai-runtime.service';

@Injectable()
export class AiAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiRuntime: AiRuntimeService,
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

  private formatLogMessage(detail: any) {
    if (!detail) return '';
    if (typeof detail === 'string') return detail;
    return detail.message || detail.error || detail.content || detail.summary || JSON.stringify(detail);
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
          status: log.action === 'error' || log.action === 'failed' ? 'failed' : 'success',
          targetType: log.targetType,
          targetId: log.targetId,
          message: this.formatLogMessage(log.detail),
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
        targetPostId: targetPostId || null,
        publishAt: publishAt ? new Date(publishAt) : undefined,
        status: 'pending',
      },
    });

    await this.logOperation(operatorId, 'create', 'ai_task', task.id, ip);
    return { success: true, data: task };
  }

  async updateTask(id: string, data: any, operatorId: string, ip: string) {
    const task = await this.prisma.botPostTask.findUnique({ where: { id } });
    if (!task) throw new NotFoundException('任务不存在');

    const updateData: any = {
      title: data.title ?? data.name,
      content: data.content ?? data.description,
      aiPrompt: data.aiPrompt ?? data.prompt,
      regionId: data.regionId || null,
      type: data.type,
      targetPostId: data.targetPostId || null,
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

    return { success: true };
  }

  async generateTaskDraft(id: string, operatorId: string) {
    const task = await this.getTaskWithBot(id);
    const generated = await this.generateTaskContent(task);
    const updated = await this.prisma.botPostTask.update({
      where: { id },
      data: {
        content: generated,
        aiPrompt: this.getTaskContentPrompt(task) || task.aiPrompt,
        aiResult: generated,
        isAiGenerated: true,
        failReason: null,
      },
    });
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
    const task = await this.getTaskWithBot(id);
    if (['completed', 'cancelled'].includes(task.status)) {
      throw new BadRequestException('任务已结束，不能重复执行');
    }

    await this.prisma.botPostTask.update({
      where: { id },
      data: { status: 'running', failReason: null },
    });

    try {
      const normalizedType = this.normalizeTaskType(task.type);
      const generatedContent = await this.ensureTaskContent(task);
      let targetId = '';
      let createdCount = 0;

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
        const created = await this.prisma.$transaction(async (tx) => {
          const rows = [];
          for (const content of comments) {
            rows.push(await tx.comment.create({
              data: {
                postId: task.targetPostId!,
                userId: task.bot.userId,
                content,
                status: 'active',
                auditStatus: 'approved',
                auditReason: 'AI任务生成，已通过',
              },
            }));
          }
          await tx.post.update({
            where: { id: task.targetPostId! },
            data: { commentCount: { increment: rows.length } },
          });
          return rows;
        });
        targetId = created[0]?.id || task.targetPostId;
        createdCount = created.length;
      } else {
        throw new BadRequestException(`暂不支持执行 ${task.type} 类型的AI任务`);
      }

      const updated = await this.prisma.botPostTask.update({
        where: { id },
        data: {
          status: 'completed',
          content: generatedContent,
          aiResult: generatedContent,
          isAiGenerated: true,
          publishedPostId: targetId || null,
          reviewedBy: operatorId || task.reviewedBy,
          reviewedAt: new Date(),
          failReason: null,
        },
      });
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
      const message = error?.message || 'AI任务执行失败';
      await this.prisma.botPostTask.update({
        where: { id },
        data: { status: 'failed', failReason: message },
      }).catch(() => {});
      await this.prisma.botActionLog.create({
        data: {
          botId: task.botId,
          action: 'task_failed',
          targetType: 'ai_task',
          targetId: id,
          detail: { operatorId, error: message },
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
    if (action) where.action = action;
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
          status: l.action === 'error' || l.action === 'failed' ? 'failed' : 'success',
          targetType: l.targetType,
          targetId: l.targetId,
          detail: l.detail,
          message: this.formatLogMessage(l.detail),
          createdAt: l.createdAt,
        })),
        total,
        page: Number(page),
        pageSize: Number(pageSize),
      },
    };
  }

  // ==================== 配置管理 ====================

  async getConfig() {
    const config = await this.prisma.config.findUnique({ where: { key: 'ai_ops_config' } });
    const runtimeConfig = await this.aiRuntime.getSafeConfig();
    const safe = this.sanitizeConfig(config?.value);
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
    const existing = await this.prisma.config.findUnique({ where: { key: 'ai_ops_config' } });
    const existingConfig = this.mergeConfig(existing?.value);
    const incoming = this.mergeConfig(data);
    if (!data.apiKey || String(data.apiKey).includes('*')) {
      incoming.apiKey = existingConfig.apiKey || '';
    }

    await this.prisma.config.upsert({
      where: { key: 'ai_ops_config' },
      update: { value: incoming, updatedAt: new Date() },
      create: { key: 'ai_ops_config', value: incoming, group: 'ai' },
    });

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
