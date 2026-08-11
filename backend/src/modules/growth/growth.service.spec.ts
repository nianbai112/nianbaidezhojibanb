import { GrowthService } from './growth.service';

describe('GrowthService', () => {
  const createService = (overrides: Record<string, any> = {}) => {
    const prisma: any = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'u1' }),
      },
      userExperience: {
        findFirst: jest.fn().mockResolvedValue({ afterExp: 680, afterLevel: '校园达人' }),
        create: jest.fn(),
      },
      userLevel: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'lv1', regionId: null, levelNumber: 1, levelName: '校园新芽', requiredExp: 0, levelIcon: '/uploads/lv1-small.png', levelBadgeImage: '/uploads/lv1-badge.png' },
          { id: 'lv4', regionId: null, levelNumber: 4, levelName: '校园达人', requiredExp: 500, levelIcon: '/uploads/lv4-small.png', levelBadgeImage: '/uploads/lv4-badge.png' },
          { id: 'lv5', regionId: null, levelNumber: 5, levelName: '人气同学', requiredExp: 1000, levelIcon: '/uploads/lv5-small.png', levelBadgeImage: '/uploads/lv5-badge.png' },
        ]),
      },
      ...overrides,
    };
    return { service: new GrowthService(prisma), prisma };
  };

  it('returns the current level with editable name and configured display assets', async () => {
    const { service } = createService();

    const summary = await service.getUserGrowthSummary('u1', 'region-a');

    expect(summary.currentExp).toBe(680);
    expect(summary.currentLevel!.levelNumber).toBe(4);
    expect(summary.currentLevel!.levelName).toBe('校园达人');
    expect(summary.currentLevel!.levelIcon).toBe('/api/uploads/lv4-small.png');
    expect(summary.currentLevel!.levelBadgeImage).toBe('/api/uploads/lv4-badge.png');
    expect((summary.currentLevel as any).levelMedalImage).toBeUndefined();
    expect(summary.nextLevel!.levelNumber).toBe(5);
    expect(summary.progress).toBe(36);
    expect(summary.expToNextLevel).toBe(320);
  });

  it('uses the first configured level as the current level for zero-experience users', async () => {
    const { service } = createService({
      userExperience: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      userLevel: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'lv1', regionId: null, levelNumber: 1, levelName: '校园新芽', requiredExp: 20, levelIcon: '/uploads/lv1-small.png' },
          { id: 'lv2', regionId: null, levelNumber: 2, levelName: '活跃同学', requiredExp: 100 },
        ]),
      },
    });

    const summary = await service.getUserGrowthSummary('u1', 'region-a');

    expect(summary.currentExp).toBe(0);
    expect(summary.currentLevel!.levelNumber).toBe(1);
    expect(summary.currentLevel!.levelName).toBe('校园新芽');
    expect(summary.currentLevel!.levelIcon).toBe('/api/uploads/lv1-small.png');
    expect(summary.nextLevel!.levelNumber).toBe(2);
    expect(summary.progress).toBe(0);
  });

  it('does not report max level while the growth path has only one active level', async () => {
    const { service } = createService({
      userExperience: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
      userLevel: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'lv1', regionId: null, levelNumber: 1, levelName: '校园新芽', requiredExp: 0 },
        ]),
      },
    });

    const summary = await service.getUserGrowthSummary('u1', 'region-a');

    expect(summary.levelConfigIncomplete).toBe(true);
    expect(summary.maxLevel).toBe(false);
    expect(summary.progress).toBe(0);
  });

  it('prefers region-specific level assets over global level assets', async () => {
    const { service } = createService({
      userExperience: {
        findFirst: jest.fn().mockResolvedValue({ afterExp: 80 }),
        create: jest.fn(),
      },
      userLevel: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'global-lv1', regionId: null, levelNumber: 1, levelName: '通用新芽', requiredExp: 0, levelIcon: '/uploads/global-lv1.png' },
          { id: 'region-lv1', regionId: 'region-a', levelNumber: 1, levelName: '云阳新芽', requiredExp: 0, levelIcon: '/uploads/region-lv1.png' },
          { id: 'global-lv2', regionId: null, levelNumber: 2, levelName: '通用同学', requiredExp: 100 },
          { id: 'region-lv2', regionId: 'region-a', levelNumber: 2, levelName: '云阳同学', requiredExp: 60 },
        ]),
      },
    });

    const summary = await service.getUserGrowthSummary('u1', 'region-a');

    expect(summary.currentLevel!.levelNumber).toBe(2);
    expect(summary.currentLevel!.levelName).toBe('云阳同学');
    expect(summary.levels.map((level: any) => level.levelName)).toEqual(['云阳新芽', '云阳同学']);
  });

  it('awards experience and records before and after level names', async () => {
    const { service, prisma } = createService();
    prisma.userExperience.create.mockResolvedValue({ id: 'exp1', afterExp: 1030 });

    const result: any = await service.awardExperience({
      userId: 'u1',
      regionId: 'region-a',
      amount: 350,
      reason: '每日签到',
      source: 'region_signin',
      sourceId: 'signin-1',
    });

    expect(prisma.userExperience.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u1',
        changeAmount: 350,
        beforeExp: 680,
        afterExp: 1030,
        beforeLevel: '校园达人',
        afterLevel: '人气同学',
        reason: '每日签到',
      }),
    });
    expect(result.currentLevel!.levelNumber).toBe(5);
  });

  it('keeps experience isolated by region when building summaries', async () => {
    const { service, prisma } = createService({
      userExperience: {
        findFirst: jest.fn().mockResolvedValue({ afterExp: 120, afterLevel: '云阳同学', regionId: 'region-a' }),
        create: jest.fn(),
      },
    });

    const summary = await service.getUserGrowthSummary('u1', 'region-a');

    expect(prisma.userExperience.findFirst).toHaveBeenCalledWith({
      where: { userId: 'u1', regionId: 'region-a' },
      orderBy: { createdAt: 'desc' },
    });
    expect(summary.currentExp).toBe(120);
  });

  it('does not award duplicate experience for the same regional source event', async () => {
    const duplicate = { id: 'exp-existing', afterExp: 700, regionId: 'region-a', source: 'region_signin', sourceId: 'signin-1' };
    const { service, prisma } = createService({
      userExperience: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(duplicate)
          .mockResolvedValueOnce({ afterExp: 700, regionId: 'region-a' }),
        create: jest.fn(),
      },
    });

    const result: any = await service.awardExperience({
      userId: 'u1',
      regionId: 'region-a',
      amount: 20,
      reason: '每日签到',
      source: 'region_signin',
      sourceId: 'signin-1',
    });

    expect(prisma.userExperience.create).not.toHaveBeenCalled();
    expect(result.record).toBe(duplicate);
    expect(result.currentExp).toBe(700);
  });

  it('returns only configured, executable level entitlements', async () => {
    const { service } = createService({
      userLevel: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'lv1', regionId: null, levelNumber: 1, levelName: '校园新芽', requiredExp: 0 },
          { id: 'lv2', regionId: null, levelNumber: 2, levelName: '活跃同学', requiredExp: 100, levelTitleId: 'title-1', contentBoostWeight: 3 },
        ]),
      },
      userExperience: {
        findFirst: jest.fn().mockResolvedValue({ afterExp: 120 }),
        create: jest.fn(),
      },
    });

    const summary: any = await service.getUserGrowthSummary('u1', 'region-a');

    expect(summary.currentEntitlements.map((item: any) => item.key)).toEqual(['level_identity', 'level_title', 'content_boost']);
    expect(summary.currentEntitlements[2].value).toBe(3);
  });

  it('uses the configured benefit icon and ignores disabled benefits', async () => {
    const { service } = createService({
      userLevel: { findMany: jest.fn().mockResolvedValue([
        { id: 'lv1', regionId: null, levelNumber: 1, levelName: '校园新芽', requiredExp: 0 },
        { id: 'lv2', regionId: null, levelNumber: 2, levelName: '活跃同学', requiredExp: 100, levelBenefits: JSON.stringify([
          { id: 'identity', type: 'identity', enabled: true, name: '活跃身份', icon: '/uploads/identity.png' },
          { id: 'boost', type: 'content_boost', enabled: false, value: 9 },
        ]) },
      ]) },
      userExperience: { findFirst: jest.fn().mockResolvedValue({ afterExp: 120 }), create: jest.fn() },
    });

    const summary: any = await service.getUserGrowthSummary('u1', 'region-a');

    expect(summary.currentEntitlements).toEqual([expect.objectContaining({ key: 'level_identity', label: '活跃身份', icon: '/api/uploads/identity.png' })]);
  });

  it('grants the configured level title exactly once on upgrade', async () => {
    const userTitleRecord = { upsert: jest.fn().mockResolvedValue({ id: 'record-1' }) };
    const { service, prisma } = createService({
      userTitle: { findFirst: jest.fn().mockResolvedValue({ id: 'title-1' }) },
      userTitleRecord,
      userExperience: {
        findFirst: jest.fn().mockResolvedValue({ afterExp: 90 }),
        create: jest.fn().mockResolvedValue({ id: 'exp-1' }),
      },
      userLevel: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'lv1', regionId: null, levelNumber: 1, levelName: '校园新芽', requiredExp: 0 },
          { id: 'lv2', regionId: null, levelNumber: 2, levelName: '活跃同学', requiredExp: 100, levelTitleId: 'title-1' },
        ]),
      },
    });

    await service.awardExperience({ userId: 'u1', regionId: 'region-a', amount: 10 });

    expect(prisma.userTitle.findFirst).toHaveBeenCalled();
    expect(userTitleRecord.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId_titleId: { userId: 'u1', titleId: 'title-1' } },
    }));
  });
});
