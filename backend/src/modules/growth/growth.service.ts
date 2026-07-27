import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { RedisService } from '../../common/services/redis.service';

type GrowthDb = PrismaService | any;

type AwardExperienceInput = {
  userId: string;
  regionId?: string | null;
  amount: number;
  reason?: string;
  source?: string;
  sourceId?: string;
  metadata?: any;
};

@Injectable()
export class GrowthService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly redis?: RedisService,
  ) {}

  private publicAssetUrl(value: any) {
    const text = String(value || '').trim();
    if (!text) return '';
    if (/^(https?:)?\/\//i.test(text) || /^data:/i.test(text)) return text;
    const base = (process.env.PUBLIC_BASE_URL || process.env.PUBLIC_API_URL || process.env.APP_URL || '').replace(/\/+$/, '');
    const withBase = (path: string) => (base ? `${base}${path}` : path);
    if (text.startsWith('/api/uploads/')) return withBase(text);
    if (text.startsWith('api/uploads/')) return withBase(`/${text}`);
    if (text.startsWith('/uploads/')) return base ? withBase(text) : `/api${text}`;
    if (text.startsWith('uploads/')) return base ? withBase(`/${text}`) : `/api/${text}`;
    return text;
  }

  private normalizeRegionId(regionId?: string | null) {
    const text = String(regionId || '').trim();
    return text || null;
  }

  private formatLevel(level: any) {
    if (!level) return null;
    const levelIcon = this.publicAssetUrl(level.levelIcon || level.level_icon || level.iconUrl || level.icon);
    const levelBadgeImage = this.publicAssetUrl(level.levelBadgeImage || level.level_badge_image || level.badgeImage || level.badge_image);
    return {
      id: level.id,
      regionId: level.regionId || null,
      region_id: level.regionId || null,
      levelNumber: level.levelNumber || 0,
      level_number: level.levelNumber || 0,
      levelName: level.levelName || '',
      level_name: level.levelName || '',
      levelPrefix: level.levelPrefix || '',
      level_prefix: level.levelPrefix || '',
      requiredExp: Number(level.requiredExp || 0),
      required_exp: Number(level.requiredExp || 0),
      levelIcon,
      level_icon: levelIcon,
      icon: levelIcon,
      icon_url: levelIcon,
      levelBadgeImage,
      level_badge_image: levelBadgeImage,
      badgeImage: levelBadgeImage,
      badge_image: levelBadgeImage,
      backgroundColor: level.backgroundColor || '',
      background_color: level.backgroundColor || '',
      textColor: level.textColor || '',
      text_color: level.textColor || '',
      borderColor: level.borderColor || '',
      border_color: level.borderColor || '',
      levelDescription: level.levelDescription || '',
      level_description: level.levelDescription || '',
      levelTitleId: level.levelTitleId || '',
      level_title_id: level.levelTitleId || '',
      contentBoostWeight: Math.max(0, Number(level.contentBoostWeight || 0)),
      content_boost_weight: Math.max(0, Number(level.contentBoostWeight || 0)),
      levelBenefits: this.getLevelBenefits(level),
      level_benefits: this.getLevelBenefits(level),
    };
  }

  private getLevelBenefits(level: any) {
    let benefits: any[] = [];
    try { benefits = Array.isArray(level?.levelBenefits) ? level.levelBenefits : JSON.parse(level?.levelBenefits || '[]'); } catch { benefits = []; }
    if (!Array.isArray(benefits) || !benefits.length) {
      benefits = [{ id: 'identity', type: 'identity', enabled: true }];
      if (level?.levelTitleId) benefits.push({ id: 'title', type: 'title', enabled: true, titleId: level.levelTitleId });
      if (Number(level?.contentBoostWeight || 0) > 0) benefits.push({ id: 'content_boost', type: 'content_boost', enabled: true, value: level.contentBoostWeight });
    }
    const defaults: Record<string, any> = {
      identity: { label: '等级身份展示', description: '已在个人主页和成长中心展示' },
      title: { label: '专属等级称号', description: '升级后自动发放，可在我的称号中佩戴' },
      content_boost: { label: '内容轻量加权', description: '公开笔记在推荐流获得额外排序权重' },
    };
    return benefits.filter((item) => item && defaults[item.type]).map((item, index) => ({
      key: String(item.id || item.type || index), type: item.type, enabled: item.enabled !== false,
      label: String(item.name || defaults[item.type].label), description: String(item.description || defaults[item.type].description),
      icon: this.publicAssetUrl(item.icon), titleId: String(item.titleId || ''),
      value: item.type === 'content_boost' ? Math.max(0, Math.min(20, Math.trunc(Number(item.value || 0)))) : undefined,
      sortOrder: Number(item.sortOrder || index),
    })).sort((a, b) => a.sortOrder - b.sortOrder);
  }

  private chooseRegionLevels(levels: any[] = [], regionId?: string | null) {
    const sorted = [...levels].sort((a, b) => {
      const aRegion = regionId && a.regionId === regionId ? 0 : 1;
      const bRegion = regionId && b.regionId === regionId ? 0 : 1;
      if ((a.levelNumber || 0) !== (b.levelNumber || 0)) return (a.levelNumber || 0) - (b.levelNumber || 0);
      return aRegion - bRegion;
    });
    const byLevel = new Map<number, any>();
    for (const level of sorted) {
      const key = Number(level.levelNumber || 0);
      if (!key) continue;
      if (!byLevel.has(key) || (regionId && level.regionId === regionId)) {
        byLevel.set(key, level);
      }
    }
    return [...byLevel.values()].sort((a, b) => (a.requiredExp || 0) - (b.requiredExp || 0));
  }

  private async loadActiveLevels(db: GrowthDb, regionId?: string | null) {
    const normalizedRegionId = this.normalizeRegionId(regionId);
    const where = normalizedRegionId
      ? { isActive: true, OR: [{ regionId: normalizedRegionId }, { regionId: null }] }
      : { isActive: true };
    const levels = await db.userLevel.findMany({
      where,
      orderBy: [{ levelNumber: 'asc' }, { requiredExp: 'asc' }],
    });
    return this.chooseRegionLevels(levels, normalizedRegionId);
  }

  private latestExperienceWhere(userId: string, regionId?: string | null) {
    return { userId, regionId: this.normalizeRegionId(regionId) };
  }

  private async findLatestExperience(db: GrowthDb, userId: string, regionId?: string | null) {
    return db.userExperience.findFirst({
      where: this.latestExperienceWhere(userId, regionId),
      orderBy: { createdAt: 'desc' },
    });
  }

  private async findDuplicateExperience(db: GrowthDb, input: AwardExperienceInput) {
    const source = String(input.source || '').trim();
    const sourceId = String(input.sourceId || '').trim();
    if (!source || !sourceId) return null;
    return db.userExperience.findFirst({
      where: {
        userId: input.userId,
        regionId: this.normalizeRegionId(input.regionId),
        source,
        sourceId,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private resolveLevel(levels: any[], exp: number) {
    let current: any = null;
    let next: any = null;
    for (const level of levels) {
      if (exp >= Number(level.requiredExp || 0)) {
        current = level;
      } else if (!next) {
        next = level;
      }
    }
    if (!current && levels.length) {
      current = levels[0];
      next = levels[1] || null;
    }
    return { current, next };
  }

  private buildSummary(currentExp: number, levels: any[]) {
    const { current, next } = this.resolveLevel(levels, currentExp);
    const levelConfigIncomplete = levels.length < 2;
    const rawCurrentRequired = Number(current?.requiredExp || 0);
    const currentRequired = rawCurrentRequired <= currentExp ? rawCurrentRequired : 0;
    const nextRequired = Number(next?.requiredExp || currentExp);
    const span = Math.max(1, nextRequired - currentRequired);
    const progress = levelConfigIncomplete ? 0 : next ? Math.max(0, Math.min(100, Math.round(((currentExp - currentRequired) / span) * 100))) : 100;
    const expToNextLevel = next ? Math.max(0, nextRequired - currentExp) : 0;
    const currentLevel = this.formatLevel(current);
    const nextLevel = this.formatLevel(next);
    const currentEntitlements = this.buildEntitlements(current);
    return {
      currentExp,
      current_exp: currentExp,
      currentLevel,
      current_level: currentLevel,
      currentLevelRequiredExp: currentRequired,
      current_level_required_exp: currentRequired,
      nextLevel,
      next_level: nextLevel,
      nextRequiredExp: nextRequired,
      next_required_exp: nextRequired,
      progress,
      progressPercent: progress,
      progress_percent: progress,
      expToNextLevel,
      exp_to_next_level: expToNextLevel,
      maxLevel: !levelConfigIncomplete && !next,
      max_level: !levelConfigIncomplete && !next,
      levelConfigIncomplete,
      level_config_incomplete: levelConfigIncomplete,
      currentEntitlements,
      current_entitlements: currentEntitlements,
      levels: levels.map((level) => this.formatLevel(level)).filter(Boolean),
    };
  }

  private buildEntitlements(level: any) {
    if (!level) return [];
    return this.getLevelBenefits(level).filter((item) => item.enabled && (item.type !== 'content_boost' || (item.value || 0) > 0) && (item.type !== 'title' || item.titleId)).map((item) => ({
      key: item.type === 'identity' ? 'level_identity' : item.type === 'title' ? 'level_title' : 'content_boost', type: item.type, label: item.label,
      description: item.type === 'content_boost' && !item.description ? `公开笔记在推荐流获得 +${item.value} 排位权重` : item.description,
      icon: item.icon, value: item.value, titleId: item.titleId,
    }));
  }

  private async grantLevelTitle(db: GrowthDb, userId: string, regionId: string | null, level: any) {
    const titleId = String(this.getLevelBenefits(level).find((item) => item.enabled && item.type === 'title')?.titleId || level?.levelTitleId || '').trim();
    if (!titleId || !db.userTitle || !db.userTitleRecord) return null;
    const title = await db.userTitle.findFirst({
      where: {
        id: titleId,
        isEnabled: true,
        OR: [{ regionId }, { regionId: null }],
      },
      select: { id: true },
    });
    if (!title) return null;
    return db.userTitleRecord.upsert({
      where: { userId_titleId: { userId, titleId: title.id } },
      create: { userId, titleId: title.id },
      update: {},
    });
  }

  async getContentBoostByUserIds(userIds: string[], regionId?: string | null, db: GrowthDb = this.prisma) {
    const ids = [...new Set((userIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
    if (!ids.length) return new Map<string, number>();
    const normalizedRegionId = this.normalizeRegionId(regionId);
    const [levels, records] = await Promise.all([
      this.loadActiveLevels(db, normalizedRegionId),
      db.userExperience.findMany({
        where: { userId: { in: ids }, regionId: normalizedRegionId },
        select: { userId: true, afterExp: true, createdAt: true },
        orderBy: [{ userId: 'asc' }, { createdAt: 'desc' }],
      }),
    ]);
    const latest = new Map<string, number>();
    for (const record of records) if (!latest.has(record.userId)) latest.set(record.userId, Number(record.afterExp || 0));
    return new Map(ids.map((userId) => {
      const level = this.resolveLevel(levels, latest.get(userId) || 0).current;
      const benefit = this.getLevelBenefits(level).find((item) => item.enabled && item.type === 'content_boost');
      return [userId, Math.max(0, Math.min(20, Math.trunc(Number(benefit?.value ?? level?.contentBoostWeight ?? 0))))];
    }));
  }

  async getUserGrowthSummary(userId: string, regionId?: string | null, db: GrowthDb = this.prisma) {
    if (!userId) throw new BadRequestException('用户ID不能为空');
    const normalizedRegionId = this.normalizeRegionId(regionId);
    const [latest, levels] = await Promise.all([
      this.findLatestExperience(db, userId, normalizedRegionId),
      this.loadActiveLevels(db, normalizedRegionId),
    ]);
    const currentLevel = this.resolveLevel(levels, Number(latest?.afterExp || 0)).current;
    await this.grantLevelTitle(db, userId, normalizedRegionId, currentLevel);
    return {
      regionId: normalizedRegionId,
      region_id: normalizedRegionId,
      ...this.buildSummary(Number(latest?.afterExp || 0), levels),
    };
  }

  async awardExperience(input: AwardExperienceInput, db: GrowthDb = this.prisma) {
    const amount = Math.trunc(Number(input.amount || 0));
    if (!input.userId) throw new BadRequestException('用户ID不能为空');
    const normalizedRegionId = this.normalizeRegionId(input.regionId);
    if (!Number.isFinite(amount) || amount === 0) {
      return this.getUserGrowthSummary(input.userId, normalizedRegionId, db);
    }
    const user = await db.user.findUnique({ where: { id: input.userId }, select: { id: true } });
    if (!user) throw new NotFoundException('用户不存在');

    const duplicate = await this.findDuplicateExperience(db, { ...input, regionId: normalizedRegionId });
    const duplicateSource = String(duplicate?.source || '').trim();
    const duplicateSourceId = String(duplicate?.sourceId || duplicate?.source_id || '').trim();
    if (duplicate && duplicateSource === String(input.source || '').trim() && duplicateSourceId === String(input.sourceId || '').trim()) {
      return {
        record: duplicate,
        ...(await this.getUserGrowthSummary(input.userId, normalizedRegionId, db)),
        source: input.source || '',
        sourceId: input.sourceId || '',
        source_id: input.sourceId || '',
        duplicate: true,
      };
    }

    const [latest, levels] = await Promise.all([
      this.findLatestExperience(db, input.userId, normalizedRegionId),
      this.loadActiveLevels(db, normalizedRegionId),
    ]);
    const beforeExp = Number(latest?.afterExp || 0);
    const afterExp = Math.max(0, beforeExp + amount);
    const beforeLevel = this.resolveLevel(levels, beforeExp).current;
    const afterLevel = this.resolveLevel(levels, afterExp).current;

    const record = await db.userExperience.create({
      data: {
        userId: input.userId,
        regionId: normalizedRegionId,
        changeAmount: amount,
        reason: input.reason || input.source || '成长值变动',
        source: input.source || null,
        sourceId: input.sourceId || null,
        metadata: input.metadata || undefined,
        beforeLevel: beforeLevel?.levelName || '无等级',
        afterLevel: afterLevel?.levelName || '无等级',
        beforeExp,
        afterExp,
      },
    });
    await this.grantLevelTitle(db, input.userId, normalizedRegionId, afterLevel);

    await this.redis?.delPattern?.(`user:profile:v2:${input.userId}:*`).catch(() => undefined);
    await this.redis?.delPattern?.(`user:profile:${input.userId}:*`).catch(() => undefined);
    await this.redis?.delPattern?.('post:feed:*').catch(() => undefined);

    return {
      record,
      regionId: normalizedRegionId,
      region_id: normalizedRegionId,
      ...this.buildSummary(afterExp, levels),
      source: input.source || '',
      sourceId: input.sourceId || '',
      source_id: input.sourceId || '',
    };
  }
}
