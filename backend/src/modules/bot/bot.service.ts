import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';

@Injectable()
export class BotService {
  constructor(private readonly prisma: PrismaService) {}

  async bots(query: any) {
    const { page = 1, pageSize = 20, status, keyword, regionId } = query;
    const where: any = {};
    if (status !== undefined && status !== '') where.status = this.normalizeBotStatus(status);
    if (regionId) where.regionId = String(regionId);
    if (keyword) where.user = { nickname: { contains: keyword } };
    const [list, total] = await Promise.all([
      this.prisma.botAccount.findMany({
        where,
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        include: { user: { select: { id: true, nickname: true, avatar: true } }, persona: true },
      }),
      this.prisma.botAccount.count({ where }),
    ]);
    return { list: list.map((b) => this.formatBot(b)), total, page: +page, pageSize: +pageSize };
  }

  async getBot(id: string) {
    const bot = await this.prisma.botAccount.findUnique({
      where: { id },
      include: { user: { select: { id: true, nickname: true, avatar: true } }, persona: true },
    });
    if (!bot) throw new NotFoundException('机器人不存在');
    return { success: true, data: this.formatBot(bot) };
  }

  async createBot(dto: any) {
    const { nickname, avatar, personaId, regionId, tags, dailyLimit = 10 } = dto;
    const user = await this.prisma.user.create({
      data: { openid: `bot_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, nickname, avatar, userType: 4 },
    });
    const bot = await this.prisma.botAccount.create({
      data: { userId: user.id, personaId: personaId ? String(personaId) : undefined, regionId: regionId ? String(regionId) : undefined, tags, dailyLimit, status: 'active' },
      include: { user: { select: { id: true, nickname: true, avatar: true } }, persona: true },
    });
    return { success: true, data: this.formatBot(bot) };
  }

  async updateBot(id: string, dto: any) {
    const { nickname, avatar, personaId, regionId, tags, dailyLimit, status } = dto;
    const data: any = {};
    if (personaId !== undefined) data.personaId = personaId ? String(personaId) : null;
    if (regionId !== undefined) data.regionId = regionId ? String(regionId) : null;
    if (tags !== undefined) data.tags = tags;
    if (dailyLimit !== undefined) data.dailyLimit = dailyLimit;
    if (status !== undefined) data.status = this.normalizeBotStatus(status);
    const bot = await this.prisma.botAccount.update({ where: { id }, data, include: { user: true, persona: true } });
    if (nickname !== undefined || avatar !== undefined) {
      await this.prisma.user.update({
        where: { id: bot.userId },
        data: { ...(nickname !== undefined ? { nickname } : {}), ...(avatar !== undefined ? { avatar } : {}) },
      });
    }
    const latest = await this.prisma.botAccount.findUnique({ where: { id }, include: { user: { select: { id: true, nickname: true, avatar: true } }, persona: true } });
    return { success: true, data: this.formatBot(latest) };
  }

  async updateBotStatus(id: string, status: string) {
    const bot = await this.prisma.botAccount.update({ where: { id }, data: { status: this.normalizeBotStatus(status) }, include: { user: true, persona: true } });
    return { success: true, data: this.formatBot(bot) };
  }

  async deleteBot(id: string) {
    const bot = await this.prisma.botAccount.findUnique({ where: { id } });
    if (bot) {
      await this.prisma.botAccount.delete({ where: { id } });
      await this.prisma.user.delete({ where: { id: bot.userId } });
    }
    return { success: true };
  }

  async personas(query: any) {
    const { page = 1, pageSize = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.botPersona.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize }),
      this.prisma.botPersona.count(),
    ]);
    return { list: list.map((t) => this.formatTask(t)), total, page: +page, pageSize: +pageSize };
  }

  async createPersona(dto: any) {
    const item = await this.prisma.botPersona.create({ data: dto });
    return { success: true, data: item };
  }

  async updatePersona(id: string, dto: any) {
    const item = await this.prisma.botPersona.update({ where: { id }, data: dto });
    return { success: true, data: item };
  }

  async tasks(query: any) {
    const { page = 1, pageSize = 20, status, botId } = query;
    const where: any = {};
    if (status) where.status = status;
    if (botId) where.botId = botId;
    const [list, total] = await Promise.all([
      this.prisma.botPostTask.findMany({
        where,
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        include: { bot: { include: { user: { select: { nickname: true, avatar: true } } } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.botPostTask.count({ where }),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  async createTask(dto: any) {
    const item = await this.prisma.botPostTask.create({ data: dto });
    return { success: true, data: item };
  }

  async createPostTask(dto: any) {
    const item = await this.prisma.botPostTask.create({
      data: {
        botId: String(dto.robotId || dto.botId),
        type: 'post',
        title: dto.title,
        content: dto.content,
        regionId: dto.regionId ? String(dto.regionId) : undefined,
        circleId: dto.circleId ? String(dto.circleId) : undefined,
        topicId: Array.isArray(dto.topicIds) && dto.topicIds[0] ? String(dto.topicIds[0]) : dto.topicId ? String(dto.topicId) : undefined,
        mediaUrls: dto.images || dto.mediaUrls || [],
        publishAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
        status: dto.autoPublish ? 'approved' : 'pending',
        isAiGenerated: Boolean(dto.isAiGenerated ?? true),
      },
    });
    return { success: true, data: item };
  }

  async createCommentTask(dto: any) {
    const comments = Array.isArray(dto.comments) ? dto.comments : [];
    const robotIds = Array.isArray(dto.robotIds) ? dto.robotIds : comments.map((c: any) => c.robotId);
    const tasks = [];
    for (const robotId of robotIds) {
      const matched = comments.find((c: any) => String(c.robotId) === String(robotId));
      tasks.push(await this.prisma.botPostTask.create({
        data: {
          botId: String(robotId),
          type: 'comment',
          targetPostId: String(dto.postId),
          content: matched?.content || dto.direction || '',
          publishAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
          status: 'pending',
          isAiGenerated: true,
          aiPrompt: dto.direction,
        },
      }));
    }
    return { success: true, data: { count: tasks.length, tasks } };
  }

  async updateTask(id: string, dto: any) {
    const item = await this.prisma.botPostTask.update({ where: { id }, data: dto });
    return { success: true, data: item };
  }

  async approveTask(id: string, reviewerId: string) {
    const item = await this.prisma.botPostTask.update({
      where: { id },
      data: { status: 'approved', reviewedBy: reviewerId, reviewedAt: new Date() },
    });
    return { success: true, data: item };
  }

  async runTask(id: string) {
    const task = await this.prisma.botPostTask.findUnique({ where: { id }, include: { bot: { include: { user: true } } } });
    if (!task) return { code: 404, message: '任务不存在' };
    if (task.status !== 'approved' && task.status !== 'pending') return { code: 400, message: '任务状态不可执行' };

    try {
      let postId: string | null = null;
      if (task.type === 'post') {
        const post = await this.prisma.post.create({
          data: {
            userId: task.bot.userId,
            regionId: task.regionId,
            title: task.title || undefined,
            content: task.content || '',
            status: 'PUBLISHED',
            auditStatus: 'approved',
            type: Array.isArray(task.mediaUrls) && task.mediaUrls.length > 0 ? 'IMAGE' : 'TEXT',
            media: Array.isArray(task.mediaUrls) && task.mediaUrls.length > 0
              ? { create: task.mediaUrls.map((url: string, index: number) => ({ type: 'IMAGE', url, sortOrder: index })) }
              : undefined,
          },
        });
        postId = post.id;
      } else if (task.type === 'comment' && task.targetPostId) {
        const comment = await this.prisma.comment.create({
          data: {
            postId: task.targetPostId,
            userId: task.bot.userId,
            content: task.content || '',
            status: 'active',
            auditStatus: 'approved',
          },
        });
        postId = comment.id;
      }

      await this.prisma.botPostTask.update({
        where: { id },
        data: { status: 'completed', publishedPostId: postId },
      });
      await this.prisma.botActionLog.create({
        data: { botId: task.botId, action: `create_${task.type}`, targetType: task.type, targetId: postId || undefined },
      });
      return { success: true, data: { publishedPostId: postId } };
    } catch (err: any) {
      await this.prisma.botPostTask.update({
        where: { id },
        data: { status: 'failed', failReason: err.message },
      });
      return { code: 500, message: err.message };
    }
  }

  async cancelTask(id: string) {
    const item = await this.prisma.botPostTask.update({ where: { id }, data: { status: 'cancelled' } });
    return { success: true, data: item };
  }

  async promptTemplates(query: any) {
    const { page = 1, pageSize = 20, type } = query;
    const where: any = {};
    if (type) where.type = type;
    const [list, total] = await Promise.all([
      this.prisma.aiPromptTemplate.findMany({ where, skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: 'desc' } }),
      this.prisma.aiPromptTemplate.count({ where }),
    ]);
    return { list: list.map((t) => this.formatPrompt(t)), total, page: +page, pageSize: +pageSize };
  }

  async createPromptTemplate(dto: any) {
    const item = await this.prisma.aiPromptTemplate.create({
      data: {
        name: dto.name,
        type: dto.type,
        template: dto.content || dto.template || '',
        variables: dto.variables || [],
        isEnabled: dto.status !== undefined ? dto.status === 1 : dto.isEnabled ?? true,
      },
    });
    return { success: true, data: this.formatPrompt(item) };
  }

  async updatePromptTemplate(id: string, dto: any) {
    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.content !== undefined || dto.template !== undefined) data.template = dto.content ?? dto.template;
    if (dto.variables !== undefined) data.variables = dto.variables;
    if (dto.status !== undefined) data.isEnabled = dto.status === 1;
    if (dto.isEnabled !== undefined) data.isEnabled = dto.isEnabled;
    const item = await this.prisma.aiPromptTemplate.update({ where: { id }, data });
    return { success: true, data: this.formatPrompt(item) };
  }

  async deletePromptTemplate(id: string) {
    await this.prisma.aiPromptTemplate.delete({ where: { id } });
    return { success: true };
  }

  formatGeneratedPost(content: string) {
    const lines = content.split('\n').map((line) => line.trim()).filter(Boolean);
    const titleLine = lines.find((line) => /^标题[:：]/.test(line)) || lines[0] || '';
    const title = titleLine.replace(/^标题[:：]\s*/, '').slice(0, 80);
    const body = lines.filter((line) => line !== titleLine).join('\n') || content;
    return { success: true, data: { title, content: body } };
  }

  formatGeneratedComments(content: string, robotIds: string[], count: number) {
    const lines = content
      .split('\n')
      .map((line) => line.replace(/^\d+[.、)]\s*/, '').trim())
      .filter(Boolean)
      .slice(0, count);
    while (lines.length < count) lines.push('看起来不错，想了解更多细节。');
    const comments = lines.map((line, index) => ({ robotId: robotIds[index] || robotIds[0], content: line }));
    return { success: true, data: { comments } };
  }

  async actionLogs(query: any) {
    const { page = 1, pageSize = 20, botId } = query;
    const where: any = {};
    if (botId) where.botId = botId;
    const [list, total] = await Promise.all([
      this.prisma.botActionLog.findMany({
        where,
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.botActionLog.count({ where }),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  private normalizeBotStatus(status: string | number) {
    if (status === 1 || status === '1' || status === 'active') return 'active';
    if (status === 0 || status === '0' || status === 'disabled') return 'disabled';
    return String(status);
  }

  private formatBot(bot: any) {
    if (!bot) return bot;
    return {
      ...bot,
      nickname: bot.user?.nickname,
      avatar: bot.user?.avatar,
      status: bot.status === 'active' ? 1 : 0,
      robotId: bot.id,
      regionId: bot.regionId,
      persona: bot.persona?.name,
      description: bot.persona?.bio,
    };
  }

  private formatTask(task: any) {
    return {
      ...task,
      robotId: task.botId,
      robotNickname: task.bot?.user?.nickname,
      status: task.status === 'completed' ? 'success' : task.status,
      resultTitle: task.title,
      resultContent: task.content,
      resultImages: task.mediaUrls || [],
      errorMessage: task.failReason,
      scheduledAt: task.publishAt,
      postId: task.targetPostId,
    };
  }

  private formatPrompt(template: any) {
    return {
      ...template,
      content: template.template,
      status: template.isEnabled ? 1 : 0,
    };
  }
}
