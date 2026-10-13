import { UserService } from './user.service';

function createService(cached: any) {
  const service: any = Object.create(UserService.prototype);
  service.profileCacheTtl = 60;
  service.redis = { getJson: jest.fn().mockResolvedValue(cached), setJson: jest.fn().mockResolvedValue(undefined) };
  service.prisma = {
    userTag: { findMany: jest.fn().mockResolvedValue([{ name: '摄影', color: '#123456' }]) },
    userTagDefinition: { findMany: jest.fn().mockResolvedValue([{ id: 'tag-1', regionId: 'campus-a', tagName: '摄影', tagColor: '#123456', textColor: null, isActive: true }]) },
  };
  return service;
}

describe('self profile cached guidance selections', () => {
  it('upgrades an old cached self profile using real definitions and the current requested campus', async () => {
    const service = createService({ id: 'user-1', profile: { regionId: 'campus-b' } });
    expect(await service.getProfile('user-1', 'campus-a', 'user-1')).toMatchObject({ selected_tags: ['tag-1'], selection_unresolved: false });
    expect(service.prisma.userTagDefinition.findMany.mock.calls[0][0].where.OR).toEqual([{ regionId: 'campus-a' }, { regionId: null }]);
    expect(service.redis.setJson).toHaveBeenCalledWith('user:profile:v2:user-1:campus-a:user-1', expect.objectContaining({ selected_tags: ['tag-1'] }), 60);
  });

  it('uses the stored profile campus when no campus query was supplied', async () => {
    const service = createService({ id: 'user-1', profile: { regionId: 'campus-a' } });
    expect(await service.getProfile('user-1', undefined, 'user-1')).toMatchObject({ selected_tags: ['tag-1'], selection_unresolved: false });
  });

  it('preserves the unresolved warning in an already enriched cached profile', async () => {
    const cached = { id: 'user-1', selected_tags: [], selection_unresolved: true };
    const service = createService(cached);
    expect(await service.getProfile('user-1', 'campus-a', 'user-1')).toBe(cached);
    expect(service.prisma.userTag.findMany).not.toHaveBeenCalled();
  });

  it('does not load or expose private guidance selection details when viewing someone else', async () => {
    const cached = { id: 'user-1', nickname: '同学' };
    const service = createService(cached);
    expect(await service.getProfile('user-1', 'campus-a', 'viewer-2')).toMatchObject(cached);
    expect(service.prisma.userTag.findMany).not.toHaveBeenCalled();
  });
});
