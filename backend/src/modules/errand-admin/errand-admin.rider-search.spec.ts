jest.mock('../errand/errand.service', () => ({ ErrandService: class {} }));

import { ErrandAdminService } from './errand-admin.service';

function setup() {
  const rider = {
    id: 'rider-1', regionId: 'region-a', verifyStatus: 'approved',
    User: { id: 'cm-user-1', uid: 42, publicUid: 87654321, nickname: '星落', phone: '13800138000' },
  };
  const prisma: any = {
    regionRider: {
      findMany: jest.fn().mockResolvedValue([rider]),
      count: jest.fn().mockResolvedValue(1),
      findUnique: jest.fn().mockResolvedValue(rider),
    },
  };
  const scope = { getAdminContext: jest.fn().mockResolvedValue({ isSuperAdmin: false, regionIds: ['region-a'] }) };
  return { service: new ErrandAdminService(prisma, scope as any), prisma };
}

describe('admin rider UID and keyword search', () => {
  it.each(['87654321', ' UID：87654321 ', 'uid 87654321'])('matches the displayed public UID for %s within the admin region', async keyword => {
    const f = setup();
    const result = await f.service.getRiders({ keyword, auditStatus: 'approved', status: 'online', riderType: 'official' }, 'admin-a');
    const args = f.prisma.regionRider.findMany.mock.calls[0][0];

    expect(args.where).toMatchObject({
      regionId: { in: ['region-a'] }, verifyStatus: 'approved', status: 'online', riderType: 'official',
      OR: expect.arrayContaining([{ User: { is: { OR: [
        { publicUid: 87654321 },
        { publicUid: null, uid: 87654321 },
      ] } } }]),
    });
    expect(args.include.User.select).toMatchObject({ uid: true, publicUid: true });
    expect(f.prisma.regionRider.count).toHaveBeenCalledWith({ where: args.where });
    expect(result.list[0].User).toMatchObject({ uid: 42, publicUid: 87654321 });
  });

  it.each([' 蒋雨杨 ', ' 星落 ', ' 13800138000 '])('searches rider and linked-user contact fields for %s', async keyword => {
    const f = setup();
    await f.service.getRiders({ keyword }, 'admin-a');
    const where = f.prisma.regionRider.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { realName: { contains: keyword.trim() } },
      { phone: { contains: keyword.trim() } },
      { User: { is: { nickname: { contains: keyword.trim() } } } },
      { User: { is: { phone: { contains: keyword.trim() } } } },
    ]);
  });

  it.each(['13800138000', '2147483648', '99999999999999999999', '1e8', '-42', '0'])('does not send %s as an invalid integer UID to Prisma', async keyword => {
    const f = setup();
    await f.service.getRiders({ keyword }, 'admin-a');
    const where = f.prisma.regionRider.findMany.mock.calls[0][0].where;
    expect(JSON.stringify(where)).not.toContain('publicUid');
  });

  it('treats a whitespace-only keyword as an unfiltered query', async () => {
    const f = setup();
    await f.service.getRiders({ keyword: '  ' }, 'admin-a');
    expect(f.prisma.regionRider.findMany.mock.calls[0][0].where).toEqual({ regionId: { in: ['region-a'] } });
  });

  it('rejects UID searches in another administrator region before querying riders', async () => {
    const f = setup();
    await expect(f.service.getRiders({ keyword: '87654321', regionId: 'region-b' }, 'admin-a'))
      .rejects.toThrow('无权访问该区域骑手');
    expect(f.prisma.regionRider.findMany).not.toHaveBeenCalled();
  });

  it('returns both UID fields in the detail so it agrees with the list display', async () => {
    const f = setup();
    const detail = await f.service.getRiderDetail('rider-1', 'admin-a');
    expect(f.prisma.regionRider.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      include: { User: { select: expect.objectContaining({ uid: true, publicUid: true }) } },
    }));
    expect(detail.User.publicUid).toBe(87654321);
  });
});
