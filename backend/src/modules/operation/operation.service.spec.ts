import { OperationService } from './operation.service';

describe('OperationService regional titles', () => {
  const createService = (overrides: Record<string, any> = {}) => {
    const prisma: any = {
      userTitleRecord: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        update: jest.fn(),
      },
      ...overrides,
    };
    const userAccess: any = {
      assertCurrentRegionStudentProtectedAction: jest.fn().mockResolvedValue(undefined),
    };
    const service = new OperationService(
      prisma,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      userAccess,
    );
    return { service, prisma, userAccess };
  };

  it('prefers the wearing title from the selected region over the global title', async () => {
    const { service, prisma } = createService();
    prisma.userTitleRecord.findMany.mockResolvedValue([
      {
        titleId: 'global-title',
        isWearing: true,
        title: { id: 'global-title', regionId: null, name: '通用称号', type: 'title', isEnabled: true },
      },
      {
        titleId: 'region-title',
        isWearing: true,
        title: { id: 'region-title', regionId: 'region-a', name: '区域称号', type: 'title', isEnabled: true },
      },
    ]);

    const title = await service.getCurrentTitle('user-1', 'region-a');

    expect(prisma.userTitleRecord.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        userId: 'user-1',
        isWearing: true,
      }),
    }));
    expect(title?.title_id).toBe('region-title');
  });

  it('wears only one title inside the same region scope', async () => {
    const { service, prisma } = createService();
    prisma.userTitleRecord.findUnique.mockResolvedValue({
      userId: 'user-1',
      titleId: 'region-title',
      title: { id: 'region-title', regionId: 'region-a', name: '区域称号', type: 'title', isEnabled: true },
    });
    prisma.userTitleRecord.update.mockResolvedValue({
      userId: 'user-1',
      titleId: 'region-title',
      isWearing: true,
      title: { id: 'region-title', regionId: 'region-a', name: '区域称号', type: 'title', isEnabled: true },
    });

    await service.wearTitle('region-title', 'user-1');

    expect(prisma.userTitleRecord.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        title: { is: { regionId: 'region-a' } },
      },
      data: { isWearing: false },
    });
  });

  it('returns anonymous identities only from the requested region', async () => {
    const { service, prisma } = createService({
      anonymousIdentity: {
        count: jest.fn().mockResolvedValue(1),
        findFirst: jest.fn().mockResolvedValue({ id: 'anonymous-a', regionId: 'region-a', name: '树洞同学', avatar: '/a.png' }),
      },
    });

    await expect(service.getRandomAnonymous('region-a')).resolves.toMatchObject({
      id: 'anonymous-a', nickname: '树洞同学', avatar_url: '/a.png', regionId: 'region-a',
    });
    expect(prisma.anonymousIdentity.count).toHaveBeenCalledWith({ where: { regionId: 'region-a' } });
    expect(prisma.anonymousIdentity.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { regionId: 'region-a' },
    }));
  });
});

describe('OperationService post-share claims', () => {
  const createService = () => {
    const prisma: any = {
      postShareLink: { findUnique: jest.fn() },
      postShareVisit: { findFirst: jest.fn() },
      user: { findUnique: jest.fn() },
      shareInvite: { create: jest.fn() },
    };
    const service = new OperationService(prisma, {} as any, {} as any, {} as any, {} as any, {} as any);
    return { service, prisma };
  };

  it('rejects an account that existed before the post-share visit', async () => {
    const { service, prisma } = createService();
    const createdAt = new Date('2026-07-22T08:00:00.000Z');
    prisma.postShareLink.findUnique.mockResolvedValue({
      id: 'link-1',
      code: 'Ab3K9x',
      sharerId: 'inviter-1',
      regionId: 'region-1',
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      post: { id: 'post-1', status: 'PUBLISHED', deletedAt: null },
    });
    prisma.postShareVisit.findFirst.mockResolvedValue({ openedAt: new Date('2026-07-22T09:00:00.000Z') });
    prisma.user.findUnique.mockResolvedValue({ id: 'existing-user', createdAt });

    await expect(service.claimPostShare('existing-user', 'Ab3K9x', { deviceId: 'device-a' }))
      .rejects.toThrow('仅限首次注册用户');
    expect(prisma.shareInvite.create).not.toHaveBeenCalled();
  });
});

describe('OperationService second-hand membership refresh', () => {
  it('consumes the benefit and refreshes the item in one transaction', async () => {
    const item = { id: 'item-1', userId: 'user-1', regionId: 'region-a', title: '闲置', images: [], price: 1 };
    const refreshed = { ...item, createdAt: new Date(), wantCount: 1, status: 'ON_SALE' };
    const tx: any = { secondHand: { update: jest.fn().mockResolvedValue(refreshed) } };
    const prisma: any = {
      secondHand: { findUnique: jest.fn().mockResolvedValue(item) },
      $transaction: jest.fn((fn: any) => fn(tx)),
    };
    const membership: any = { consumeBenefitWithDb: jest.fn().mockResolvedValue({}) };
    const service = new OperationService(prisma, {} as any, {} as any, membership, {} as any, {} as any);

    await expect(service.updateMySecondHandProductStatus('item-1', 'user-1', { action: 'refresh' }))
      .resolves.toEqual(expect.objectContaining({ success: true }));

    expect(membership.consumeBenefitWithDb).toHaveBeenCalledWith('user-1', 'second_hand_refresh_quota', expect.objectContaining({
      targetType: 'second_hand', targetId: 'item-1',
    }), tx);
    expect(tx.secondHand.update).toHaveBeenCalled();
  });
});
