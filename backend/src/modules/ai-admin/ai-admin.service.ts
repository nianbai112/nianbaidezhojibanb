import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';

@Injectable()
export class AiAdminService {
  constructor(private readonly prisma: PrismaService) {}

  private async logOperation(operatorId: string, action: string, module: string, targetId: string, ip: string) {
    try {
      await this.prisma.adminOperationLog.create({
        data: { accountId: operatorId, action, module, targetId, ip: ip || '' },
      });
    } catch (e) {
      // 日志失败不影响主流程
    }
  }

  // ==================== 机器人管理 ====================

  async getBots(query: any) {
    const { page = 1, pageSize = 20, status, regionId } = query;
    const where: any = {};
    if (status) where.status = status;
    if (regionId) where.regionId = regionId;

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

    return {
      success: true,
      data: {
        list: list.map(b => ({
          id: b.userId,
          nickname: b.user?.nickname,
          avatar: b.user?.avatar,
          status: b.user?.status,
          regionId: b.regionId,
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
        personaId,
        regionId,
        dailyLimit: dailyLimit || 10,
        status: 'active',
      },
    });

    await this.logOperation(operatorId, 'create', 'bot', user.id, ip);
    return { success: true, data: { ...user, botAccount: bot } };
  }

  async updateBot(id: string, data: any, operatorId: string, ip: string) {
    const bot = await this.prisma.botAccount.findUnique({ where: { userId: id } });
    if (!bot) throw new NotFoundException('机器人不存在');

    if (data.nickname || data.avatar) {
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
        personaId: data.personaId,
        regionId: data.regionId,
        dailyLimit: data.dailyLimit,
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
      data: { status },
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
          bot: { include: { user: { select: { id: true, nickname: true } } } },
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
          regionId: t.regionId,
          createdAt: t.createdAt,
        })),
        total,
        page: Number(page),
        pageSize: Number(pageSize),
      },
    };
  }

  async createTask(data: any, operatorId: string, ip: string) {
    const { type, title, content, botId, regionId, config } = data;

    if (!type) throw new BadRequestException('任务类型不能为空');

    const task = await this.prisma.botPostTask.create({
      data: {
        type: type || 'post',
        title,
        content,
        botId: botId || '',
        regionId,
        status: 'pending',
      },
    });

    await this.logOperation(operatorId, 'create', 'ai_task', task.id, ip);
    return { success: true, data: task };
  }

  async updateTask(id: string, data: any, operatorId: string, ip: string) {
    const task = await this.prisma.botPostTask.findUnique({ where: { id } });
    if (!task) throw new NotFoundException('任务不存在');

    const updated = await this.prisma.botPostTask.update({
      where: { id },
      data: {
        title: data.title,
        content: data.content,
        regionId: data.regionId,
      },
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

  // ==================== 日志管理 ====================

  async getLogs(query: any) {
    const { page = 1, pageSize = 20, botId, status, startDate, endDate } = query;
    const where: any = {};
    if (botId) where.botId = botId;
    if (status) where.status = status;
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
          targetType: l.targetType,
          targetId: l.targetId,
          detail: l.detail,
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
    return {
      success: true,
      data: config?.value || {
        enabled: false,
        postGenerateEnabled: true,
        commentGenerateEnabled: true,
        interactionEnabled: true,
        coldStartEnabled: true,
        riskControl: {
          maxPostsPerDay: 50,
          maxCommentsPerDay: 200,
          maxLikesPerDay: 500,
          minInterval: 30,
        },
      },
    };
  }

  async saveConfig(data: any, operatorId: string, ip: string) {
    await this.prisma.config.upsert({
      where: { key: 'ai_ops_config' },
      update: { value: data, updatedAt: new Date() },
      create: { key: 'ai_ops_config', value: data, group: 'ai' },
    });

    await this.logOperation(operatorId, 'save', 'ai_config', 'global', ip);
    return { success: true };
  }

  // ==================== 人设管理 ====================

  async getPersonas(query: any) {
    const { page = 1, pageSize = 20 } = query;

    const [list, total] = await Promise.all([
      this.prisma.botPersona.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: Number(pageSize),
      }),
      this.prisma.botPersona.count(),
    ]);

    return { success: true, data: { list, total, page: Number(page), pageSize: Number(pageSize) } };
  }

  async createPersona(data: any, operatorId: string, ip: string) {
    if (!data.name) throw new BadRequestException('人设名称不能为空');

    const persona = await this.prisma.botPersona.create({
      data: {
        name: data.name,
        avatar: data.avatar,
        gender: data.gender || 'UNKNOWN',
        ageRange: data.ageRange,
        style: data.style,
        bio: data.bio,
        prompt: data.prompt,
      },
    });

    await this.logOperation(operatorId, 'create', 'persona', persona.id, ip);
    return { success: true, data: persona };
  }

  async updatePersona(id: string, data: any, operatorId: string, ip: string) {
    const persona = await this.prisma.botPersona.findUnique({ where: { id } });
    if (!persona) throw new NotFoundException('人设不存在');

    const updated = await this.prisma.botPersona.update({
      where: { id },
      data: {
        name: data.name,
        avatar: data.avatar,
        gender: data.gender,
        ageRange: data.ageRange,
        style: data.style,
        bio: data.bio,
        prompt: data.prompt,
      },
    });

    await this.logOperation(operatorId, 'update', 'persona', id, ip);
    return { success: true, data: updated };
  }
}
