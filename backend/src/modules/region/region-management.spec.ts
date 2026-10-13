import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { RegionService } from './region.service';
import { buildManagementContentData, decodeManagementLink } from './region-management.helpers';

const actor = { sub: 'manager', roles: ['SUPER_ADMIN'] };
const dto = (extra: any = {}) => ({ category: 'banner', title: '开学公告', image: 'https://images.example/banner.png', type: 'page', target: '/pages/tabbar/index/index', sortOrder: 0, isShow: true, ...extra });
const create = () => {
  const db: any = {
    region: { findUnique: jest.fn().mockResolvedValue({ id: 'r1', managerUserId: 'manager', settings: {} }), update: jest.fn().mockImplementation(async ({ data, where }) => ({ id: where.id, managerUserId: where.managerUserId, ...data })) },
    user: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE', deletedAt: null }) },
    userRole: { findMany: jest.fn().mockResolvedValue([]) },
    regionContentItem: {
      findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(async ({ data }) => ({ id: 'item', ...data })),
      update: jest.fn().mockImplementation(async ({ where, data }) => ({ ...where, ...data })),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  db.$transaction = jest.fn(async (body) => body(db));
  return { db, service: new RegionService(db) };
};

describe('regional management permissions and DTO', () => {
  it('authorizes a bound active manager and keeps hidden items in private management only', async () => {
    const { db, service } = create();
    db.regionContentItem.findMany.mockResolvedValue([{ id: 'hidden', regionId: 'r1', type: 'notice', title: '草稿', isShow: false, link: 'tel:13800000000' }]);
    const result = await service.getManagement('r1', actor);
    expect(result.permissions).toEqual({ canEditSettings: true, canEditContent: true });
    expect(result.items[0]).toEqual(expect.objectContaining({ id: 'hidden', isShow: false, type: 'phone', target: '13800000000' }));
    await service.getContentItems('r1');
    expect(db.regionContentItem.findMany).toHaveBeenLastCalledWith({ where: { regionId: 'r1', isShow: true }, orderBy: { sortOrder: 'asc' } });
  });

  it.each([null, {}, { sub: 'manager', isAdmin: true }])('rejects missing identity and AdminAccount JWT before querying with %s', async (who) => {
    const { db, service } = create();
    await expect(service.addContentItem('r1', dto(), who)).rejects.toThrow(ForbiddenException);
    expect(db.regionContentItem.create).not.toHaveBeenCalled();
  });

  it.each([{ status: 'BANNED' }, { status: 'ACTIVE', deletedAt: new Date() }, null])('does not grant stale account %s any permission', async (user) => {
    const { db, service } = create(); db.user.findUnique.mockResolvedValue(user);
    await expect(service.getManagement('r1', actor)).rejects.toThrow(ForbiddenException);
  });

  it('ignores token/client roles and requires real regional binding', async () => {
    const { db, service } = create(); db.region.findUnique.mockResolvedValue({ id: 'r1', managerUserId: 'other' });
    db.userRole.findMany.mockResolvedValue([{ regionId: 'r2', role: { type: 'SUPER_ADMIN' } }]);
    await expect(service.addContentItem('r1', dto({ userId: 'other', isAdmin: true, roles: ['ADMIN'] }), actor)).rejects.toThrow(ForbiddenException);
    expect(db.regionContentItem.create).not.toHaveBeenCalled();
  });

  it.each([['ADMIN', null], ['SUPER_ADMIN', null], ['ADMIN', 'r1'], ['REGION_ADMIN', 'r1']])('allows %s bound to %s content access but not manager settings', async (role, regionId) => {
    const { db, service } = create(); db.region.findUnique.mockResolvedValue({ id: 'r1', managerUserId: 'other' });
    db.userRole.findMany.mockResolvedValue([{ regionId, role: { type: role } }]);
    const result = await service.getManagement('r1', actor);
    expect(result.permissions).toEqual({ canEditSettings: false, canEditContent: true });
    await expect(service.updateManagerSettings('r1', actor.sub, { name: 'attempt' })).rejects.toThrow(ForbiddenException);
  });

  it.each([['REGION_ADMIN', null], ['REGION_ADMIN', 'r2'], ['USER', 'r1'], ['MERCHANT', null]])('does not elevate %s with scope %s', async (role, regionId) => {
    const { db, service } = create(); db.region.findUnique.mockResolvedValue({ id: 'r1', managerUserId: 'other' });
    db.userRole.findMany.mockResolvedValue([{ regionId, role: { type: role } }]);
    await expect(service.getManagement('r1', actor)).rejects.toThrow(ForbiddenException);
  });

  it('pins URL region and maps mobile fields without spreading client IDs/privilege fields', async () => {
    const { db, service } = create();
    const result = await service.addContentItem('r1', dto({ regionId: 'victim', id: 'victim-item', createdAt: 'bad', userId: 'owner', isAdmin: true }), actor);
    expect(result.regionId).toBe('r1');
    expect(db.regionContentItem.create).toHaveBeenCalledWith({ data: { regionId: 'r1', type: 'banner', title: '开学公告', image: 'https://images.example/banner.png', content: '', link: 'internal:pages/tabbar/index/index', sortOrder: 0, isShow: true } });
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
  });

  it('reads and updates the content under the URL region; cross-region ids never write', async () => {
    const { db, service } = create();
    await expect(service.updateContentItem('r1', 'r2-item', dto(), actor)).rejects.toThrow(NotFoundException);
    expect(db.regionContentItem.findFirst).toHaveBeenCalledWith({ where: { id: 'r2-item', regionId: 'r1' } });
    expect(db.regionContentItem.update).not.toHaveBeenCalled();
    db.regionContentItem.findFirst.mockResolvedValue({ id: 'i1', regionId: 'r1', ...buildManagementContentData(dto()) });
    await service.updateContentItem('r1', 'i1', dto({ regionId: 'r2' }), actor);
    expect(db.regionContentItem.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'i1', regionId: 'r1' } }));
  });

  it('delete conditions include URL region, refuses missing item, and authorizes every mutation', async () => {
    const { db, service } = create(); db.regionContentItem.deleteMany.mockResolvedValue({ count: 0 });
    await expect(service.deleteContentItem('r1', 'r2-item', actor)).rejects.toThrow(NotFoundException);
    expect(db.regionContentItem.deleteMany).toHaveBeenCalledWith({ where: { id: 'r2-item', regionId: 'r1' } });
    db.region.findUnique.mockResolvedValue({ id: 'r1', managerUserId: 'replacement' });
    db.regionContentItem.deleteMany.mockClear();
    await expect(service.deleteContentItem('r1', 'r1-item', actor)).rejects.toThrow(ForbiddenException);
    expect(db.regionContentItem.deleteMany).not.toHaveBeenCalled();
  });

  it('pins manager write to the same owner and clears chosen color without losing unrelated settings', async () => {
    const { db, service } = create();
    db.region.findUnique.mockResolvedValue({ id: 'r1', managerUserId: 'manager', settings: { other: 'kept', stack_flow_style: { cardBg: '#fff', textColor: '#111' } } });
    await service.updateManagerSettings('r1', 'manager', { name: '区域', stack_flow_style: { cardBg: '' }, latitude: null, longitude: null, managerUserId: 'attacker', isAdmin: true });
    expect(db.region.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'r1', managerUserId: 'manager' }, data: { name: '区域', latitude: null, longitude: null, settings: { other: 'kept', stack_flow_style: { textColor: '#111' } } } }));
    await expect(service.updateManagerSettings('r1', 'manager', {}, true)).rejects.toThrow(ForbiddenException);
  });

  it.each([
    ['page', '/pages/tabbar/index/index', '', 'internal:pages/tabbar/index/index'],
    ['webview', 'https://example.com/page', '', 'https://example.com/page'],
    ['phone', '13800000000', '', 'tel:13800000000'],
    ['contact', '帮助咨询', '', 'contact:帮助咨询'],
    ['miniprogram', 'pages/index/index', 'wx1234567890abcdef', 'miniapp:wx1234567890abcdef|pages/index/index'],
    ['miniprogram-half', 'pages/index/index', 'wx1234567890abcdef', 'miniapp_half:wx1234567890abcdef|pages/index/index'],
  ])('roundtrips jump %s using database schema', (type, target, appId, link) => {
    const value = buildManagementContentData(dto({ category: 'navItem', image: '', icon: 'https://images.example/icon.png', type, target, appId }));
    expect(value).toEqual(expect.objectContaining({ type: 'menu', image: 'https://images.example/icon.png', link }));
    expect(decodeManagementLink(value.link)).toEqual({ type, target: type === 'page' ? target.slice(1) : target, appId });
  });

  it.each([
    { category: 'other' }, { title: '' }, { image: 'http://insecure/image' }, { type: 'page', target: 'javascript:alert(1)' },
    { type: 'page', target: '/pages/../settings' }, { type: 'webview', target: 'http://insecure' }, { type: 'miniprogram', target: 'pages/a', appId: '' },
    { type: 'phone', target: 'invalid' }, { type: 'contact', target: '' }, { isShow: 'true' }, { sortOrder: Infinity }, { sortOrder: 1.5 },
  ])('rejects malformed content %s before write', (change) => { expect(() => buildManagementContentData(dto(change))).toThrow(BadRequestException) });
});
