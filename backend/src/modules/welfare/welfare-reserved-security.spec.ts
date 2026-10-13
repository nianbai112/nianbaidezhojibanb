import { WelfareService } from './welfare.service';

function fixture(regionIds = ['region-a']) {
  const campaign = { id: 'campaign-a', regionId: 'region-a', status: 'published', drawnAt: null };
  const db: any = {
    welfareCampaign: {
      findUnique: jest.fn(async () => campaign),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    welfarePrize: { findUnique: jest.fn(async () => ({ id: 'prize-a', campaignId: campaign.id, campaign, quantity: 1, reservedUsers: [] })) },
    welfarePrizeReserved: { findMany: jest.fn(async () => []), findFirst: jest.fn(), create: jest.fn(), delete: jest.fn() },
    welfareEntry: { findMany: jest.fn(async () => []), findFirst: jest.fn() },
    user: { findMany: jest.fn(async () => []) },
  };
  db.$transaction = async (run: any) => run(db);
  const scope: any = { getAdminContext: jest.fn(async () => ({ isSuperAdmin: false, regionIds })) };
  return { db, campaign, service: new WelfareService(db, scope, {} as any, {} as any) };
}

describe('welfare reservation administration boundaries', () => {
  it.each(['list', 'entries', 'add', 'remove'])('denies cross-campus %s before reading participants or modifying reservations', async action => {
    const { db, service } = fixture(['region-b']);
    const call = action === 'list' ? service.getReservedUsers('prize-a', 'admin-b')
      : action === 'entries' ? service.getEntriesForReserved('campaign-a', 'admin-b')
      : action === 'add' ? service.addReservedUser('prize-a', 'user-a', 'admin-b')
      : service.removeReservedUser('prize-a', 'user-a', 'admin-b');
    await expect(call).rejects.toThrow('无权管理该校区活动');
    for (const fn of Object.values(db.welfarePrizeReserved)) expect(fn).not.toHaveBeenCalled();
    expect(db.welfareEntry.findMany).not.toHaveBeenCalled();
    expect(db.welfareEntry.findFirst).not.toHaveBeenCalled();
    expect(db.user.findMany).not.toHaveBeenCalled();
  });

  it('joins bounded participant profiles by user ID and tolerates deleted accounts', async () => {
    const { db, service } = fixture();
    db.welfareEntry.findMany.mockResolvedValue([{ id: 'e1', userId: 'u1', nickname: 'Student' }, { id: 'e2', userId: 'deleted', nickname: 'Former student' }]);
    db.user.findMany.mockResolvedValue([{ id: 'u1', uid: 1, nickname: 'Student', avatar: null }]);
    const result = await service.getEntriesForReserved('campaign-a', 'admin-a', 'Student');
    expect(result[0].user).toMatchObject({ id: 'u1' });
    expect(result[1].user).toBeNull();
    expect(db.welfareEntry.findMany.mock.calls[0][0]).toMatchObject({ where: { campaignId: 'campaign-a', OR: [{ nickname: { contains: 'Student' } }, { id: 'Student' }, { userId: 'Student' }] }, take: 100 });
    expect(db.welfareEntry.findMany.mock.calls[0][0].select).not.toHaveProperty('user');
    expect(db.user.findMany).toHaveBeenCalledWith({ where: { id: { in: ['u1', 'deleted'] } }, select: { id: true, uid: true, publicUid: true, nickname: true, avatar: true } });
  });

  it('rejects missing participant IDs before any transaction', async () => {
    const { db, service } = fixture();
    await expect(service.addReservedUser('prize-a', undefined as any, 'admin-a')).rejects.toThrow('请选择报名用户');
    expect(db.welfarePrize.findUnique).not.toHaveBeenCalled();
  });

  it('serializes edits with the campaign draw lock and rejects finished campaigns', async () => {
    const { db, campaign, service } = fixture();
    campaign.status = 'finished';
    await expect(service.addReservedUser('prize-a', 'user-a', 'admin-a')).rejects.toThrow('活动已开奖');
    expect(db.welfareCampaign.updateMany).toHaveBeenCalledWith({ where: { id: 'campaign-a' }, data: { version: { increment: 1 } } });
    expect(db.welfarePrizeReserved.create).not.toHaveBeenCalled();
  });
});
