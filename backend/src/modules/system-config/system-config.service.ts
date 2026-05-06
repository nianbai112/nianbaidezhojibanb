import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';

const SECRET_PATTERN = /key|secret|password|token|cert|private/i;

@Injectable()
export class SystemConfigService {
  constructor(private readonly prisma: PrismaService) {}

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
    for (const c of configs) {
      await this.prisma.config.upsert({
        where: { key: c.key },
        update: { value: c.value, group: c.group, desc: c.desc ?? c.description, isEnabled: c.isEnabled ?? true, updatedBy: operatorId },
        create: { key: c.key, value: c.value, group: c.group, desc: c.desc ?? c.description, isEnabled: c.isEnabled ?? true, createdBy: operatorId, updatedBy: operatorId },
      });
    }
    return { success: true };
  }

  async resetGroup(group: string, operatorId?: string, ip?: string) {
    if (!group) return { code: 400, message: '缺少 group' };
    await this.prisma.config.deleteMany({ where: { group } });
    return { success: true };
  }

  async getNamedConfig(key: string) {
    const config = await this.prisma.config.findUnique({ where: { key } });
    return { success: true, data: config ? this.maskSecrets(config).value : this.defaultConfig(key) };
  }

  async setNamedConfig(key: string, value: any, operatorId?: string, ip?: string) {
    const current = await this.prisma.config.findUnique({ where: { key } });
    const merged = this.mergeSecretValue(current?.value, value);
    const item = await this.prisma.config.upsert({
      where: { key },
      update: { value: merged, group: key, updatedBy: operatorId },
      create: { key, value: merged, group: key, createdBy: operatorId, updatedBy: operatorId },
    });
    return { success: true, data: this.maskSecrets(item).value };
  }

  testAiConfig() {
    const configured = Boolean(process.env.AI_API_KEY || process.env.OPENAI_API_KEY || process.env.DEEPSEEK_API_KEY);
    return {
      success: configured,
      message: configured ? 'AI 环境变量已配置' : 'AI_API_KEY/OPENAI_API_KEY/DEEPSEEK_API_KEY 未配置',
    };
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

  async batchSensitiveWords(words: string[] = [], operatorId?: string) {
    const uniqueWords = [...new Set(words.map((w) => String(w).trim()).filter(Boolean))];
    if (uniqueWords.length === 0) return { code: 400, message: '没有可导入的敏感词' };
    await this.prisma.sensitiveWord.createMany({
      data: uniqueWords.map((word) => ({ word, category: 'other', level: 'audit', status: 1, createdBy: operatorId, updatedBy: operatorId })),
      skipDuplicates: true,
    });
    return { success: true, count: uniqueWords.length };
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
    const value = typeof config.value === 'object' ? { ...config.value } : config.value;
    if (value && typeof value === 'object') {
      for (const key of Object.keys(value)) {
        if (SECRET_PATTERN.test(key)) {
          value[key] = value[key] ? { isConfigured: true } : { isConfigured: false };
        }
      }
    }
    return { ...config, value };
  }

  private mergeSecretValue(current: any, incoming: any) {
    if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) return incoming;
    const base = current && typeof current === 'object' && !Array.isArray(current) ? { ...current } : {};
    const next = { ...incoming };
    for (const key of Object.keys(next)) {
      if (SECRET_PATTERN.test(key) && next[key] && typeof next[key] === 'object' && next[key].isConfigured) {
        next[key] = base[key] ?? '';
      }
    }
    return next;
  }

  private defaultConfig(key: string) {
    if (key === 'ai') {
      return { enabled: false, provider: 'openai', apiKey: '', apiEndpoint: '', model: '', temperature: 0.7, maxTokens: 2000 };
    }
    if (key === 'robot') {
      return { postDailyLimit: 10, commentDailyLimit: 50, defaultInterval: 60, autoAudit: false, enabledRegions: [] };
    }
    return null;
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
}
