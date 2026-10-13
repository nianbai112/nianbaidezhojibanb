import { WelfareService } from './welfare.service';

const businessUid = 87654321;
const person = (patch: any = {}) => ({ id: 'user-a', uid: 42, publicUid: businessUid, nickname: '小林', avatar: null, ...patch });
const entry = (patch: any = {}) => ({
  id: 'entry-a', campaignId: 'campaign-a', userId: 'user-a', nickname: '报名时的昵称',
  outcome: 'won', claimCode: 'private-claim-code', requestKey: 'private-request-key', ...patch,
});

function matches(row: any, where: any): boolean {
  return Object.entries(where).every(([key, value]: [string, any]) => {
    if (key === 'OR') return value.some((part: any) => matches(row, part));
    if (value && typeof value === 'object') {
      if ('in' in value) return value.in.includes(row[key]);
      if ('contains' in value) return String(row[key] ?? '').includes(value.contains);
    }
    return row[key] === value;
  });
}

function fixture(options: { users?: any[]; entries?: any[]; regionIds?: string[] } = {}) {
  const users = options.users || [person()];
  const entries = options.entries || [entry()];
  const reserved = { id: 'reserved-a', userId: 'user-a', user: users[0], assignedBy: 'admin-a' };
  const campaign: any = {
    id: 'campaign-a', regionId: 'region-a', status: 'published', mode: 'scheduled', drawnAt: null,
    prizes: [{ id: 'prize-a', name: '奖品', quantity: 1, kind: 'physical',
      reservedUsers: [reserved], verifiers: [{ userId: 'user-a', user: users[0] }] }],
  };
  const db: any = {
    user: { findMany: jest.fn(async ({ where, select, take }: any) => users.filter(user => matches(user, where)).slice(0, take)
      .map(user => Object.fromEntries(Object.keys(select).map(key => [key, user[key]])))) },
    welfareCampaign: {
      findUnique: jest.fn(async () => campaign),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    welfareEntry: {
      findMany: jest.fn(async ({ where, skip = 0, take }: any) => entries.filter(row => matches(row, where)).slice(skip, skip + take)),
      count: jest.fn(async ({ where }: any) => entries.filter(row => matches(row, where)).length),
      findFirst: jest.fn(async ({ where }: any) => entries.find(row => matches(row, where)) || null),
    },
    welfarePrize: { findUnique: jest.fn(async () => ({ id: 'prize-a', campaignId: campaign.id, campaign, name: '奖品', quantity: 1, reservedUsers: [] })) },
    welfarePrizeReserved: {
      findMany: jest.fn(async () => [reserved]), findFirst: jest.fn(async () => null),
      create: jest.fn(async () => reserved),
    },
    welfareDraw: { findUnique: jest.fn(async () => null) },
    adminOperationLog: { create: jest.fn() },
  };
  db.$transaction = async (run: any) => run(db);
  const scope: any = { getAdminContext: jest.fn(async () => ({ isSuperAdmin: false, regionIds: options.regionIds || ['region-a'] })) };
  return { db, campaign, service: new WelfareService(db, scope, {} as any, {} as any) };
}

describe('福利后台按小程序 UID 定位用户', () => {
  it.each(['87654321', ' UID：87654321 ', 'uid 87654321'])('内定候选精确查找业务 UID：%s', async keyword => {
    const { db, service } = fixture();
    const result = await service.getEntriesForReserved('campaign-a', 'admin-a', keyword);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ entryId: 'entry-a', userId: 'user-a', user: { id: 'user-a', uid: businessUid, publicUid: businessUid } });
    expect(db.user.findMany.mock.calls[0][0].where).toEqual({ OR: [{ publicUid: businessUid }, { publicUid: null, uid: businessUid }] });
    expect(db.welfareEntry.findMany.mock.calls[0][0].where).toEqual({ campaignId: 'campaign-a', userId: { in: ['user-a'] } });
  });

  it('超过 100 个数字昵称和其他活动记录不会淹没或混入 UID 目标', async () => {
    const fakeNames = Array.from({ length: 105 }, (_, index) => entry({ id: `noise-${index}`, userId: `other-${index}`, nickname: `用户${businessUid}` }));
    const { service } = fixture({ entries: [...fakeNames, entry({ id: 'another-campaign', campaignId: 'campaign-b' }), entry()] });
    const result = await service.getEntriesForReserved('campaign-a', 'admin-a', String(businessUid));
    expect(result.map(row => row.entryId)).toEqual(['entry-a']);
  });

  it('业务 UID 存在时，输入内部自增号不能匹配该用户', async () => {
    const { service } = fixture();
    expect(await service.getEntriesForReserved('campaign-a', 'admin-a', '42')).toEqual([]);
    expect((await service.adminEntries('campaign-a', 'admin-a', { keyword: '42' })).total).toBe(0);
  });

  it('没有业务 UID 的旧账号仍可用原数字 UID 查找和显示', async () => {
    const { service } = fixture({ users: [person({ publicUid: null })] });
    const result = await service.getEntriesForReserved('campaign-a', 'admin-a', '42');
    expect(result[0].user).toMatchObject({ id: 'user-a', uid: 42, publicUid: null });
  });

  it.each([' 报名时的昵称 ', 'entry-a', 'user-a'])('保留昵称、报名编号及内部 ID 定位：%s', async keyword => {
    const { service } = fixture();
    expect((await service.getEntriesForReserved('campaign-a', 'admin-a', keyword)).map(row => row.entryId)).toEqual(['entry-a']);
    expect((await service.adminEntries('campaign-a', 'admin-a', { keyword })).list.map(row => row.id)).toEqual(['entry-a']);
  });

  it.each(['13800138000', '2147483648', '99999999999999999999', '1e8', '-42', '0'])('无效或超出数据库整数范围的 %s 不送入 UID 字段', async keyword => {
    const { db, service } = fixture();
    expect(await service.getEntriesForReserved('campaign-a', 'admin-a', keyword)).toEqual([]);
    expect(db.user.findMany).not.toHaveBeenCalled();
  });

  it('空白搜索保留原列表，查不到的 UID 不退回全量列表', async () => {
    const { service } = fixture();
    expect(await service.getEntriesForReserved('campaign-a', 'admin-a', '   ')).toHaveLength(1);
    expect(await service.getEntriesForReserved('campaign-a', 'admin-a', '99999999')).toEqual([]);
  });

  it('报名和中奖记录同时应用 UID、状态和分页，列表和总数口径一致', async () => {
    const { db, service } = fixture({ entries: [entry(), entry({ id: 'lost-entry', outcome: 'lost' }), entry({ id: 'outside-campaign', campaignId: 'campaign-b' })] });
    const result = await service.adminEntries('campaign-a', 'admin-a', { keyword: businessUid, outcome: 'won', page: 1, size: 1 });
    expect(result).toMatchObject({ total: 1, page: 1, size: 1, list: [{ id: 'entry-a', user: { uid: businessUid } }] });
    expect(result.list[0]).not.toHaveProperty('claimCode');
    expect(result.list[0]).not.toHaveProperty('requestKey');
    expect(db.welfareEntry.count.mock.calls[0][0].where).toEqual(db.welfareEntry.findMany.mock.calls[0][0].where);
    expect((await service.adminEntries('campaign-a', 'admin-a', { keyword: businessUid, outcome: 'won', page: 2, size: 1 })).list).toEqual([]);
  });

  it('删除账号保留历史报名记录，用户信息为空且不报错', async () => {
    const { service } = fixture({ users: [] });
    expect((await service.adminEntries('campaign-a', 'admin-a', {})).list[0]).toMatchObject({ id: 'entry-a', user: null });
    expect((await service.getEntriesForReserved('campaign-a', 'admin-a'))[0].user).toBeNull();
  });

  it.each(['reserved', 'records'])('跨校区 %s 搜索在用户查询前拒绝', async kind => {
    const { db, service } = fixture({ regionIds: ['region-b'] });
    const result = kind === 'reserved'
      ? service.getEntriesForReserved('campaign-a', 'admin-b', String(businessUid))
      : service.adminEntries('campaign-a', 'admin-b', { keyword: businessUid });
    await expect(result).rejects.toThrow('无权管理该校区活动');
    expect(db.user.findMany).not.toHaveBeenCalled();
    expect(db.welfareEntry.findMany).not.toHaveBeenCalled();
    expect(db.welfareEntry.count).not.toHaveBeenCalled();
  });

  it('内定列表、新增结果及后台详情展示同一业务 UID', async () => {
    const { service } = fixture();
    expect((await service.getReservedUsers('prize-a', 'admin-a')).reservedUsers[0].user?.uid).toBe(businessUid);
    expect((await service.addReservedUser('prize-a', 'user-a', 'admin-a')).user?.uid).toBe(businessUid);
    const detail = await service.adminDetail('campaign-a', 'admin-a');
    expect(detail.prizes[0].reservedUsers[0].user?.uid).toBe(businessUid);
    expect(detail.prizes[0].verifiers[0].user?.uid).toBe(businessUid);
  });

  it('公开活动详情仍不暴露内定用户、核销员和业务 UID', async () => {
    const { service } = fixture();
    const publicDetail = await service.publicDetail('campaign-a');
    expect(publicDetail.prizes[0]).not.toHaveProperty('reservedUsers');
    expect(publicDetail.prizes[0]).not.toHaveProperty('verifiers');
    expect(JSON.stringify(publicDetail)).not.toContain(String(businessUid));
  });
});
