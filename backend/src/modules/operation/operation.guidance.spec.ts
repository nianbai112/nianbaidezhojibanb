import { OperationService } from './operation.service';

const definition = { id: 'tag-1', regionId: 'campus-a', tagName: '摄影', tagColor: '#123456', textColor: null, isActive: true };

function createService() {
  const events: string[] = [];
  let savedTags = [{ name: '摄影', color: '#123456' }];
  const tx = {
    user: {
      update: jest.fn().mockResolvedValue({ id: 'user-1' }),
      findUnique: jest.fn().mockResolvedValue({ id: 'user-1', nickname: '同学', profile: { regionId: 'campus-a' } }),
    },
    userProfile: { upsert: jest.fn() },
    userTag: {
      findMany: jest.fn().mockImplementation(async () => savedTags),
      deleteMany: jest.fn().mockImplementation(async () => { savedTags = []; return { count: 1 }; }),
      createMany: jest.fn().mockImplementation(async (args: any) => { savedTags = args.data.map((tag: any) => ({ name: tag.name, color: tag.color })); return { count: savedTags.length }; }),
    },
    userTagDefinition: { findMany: jest.fn().mockResolvedValue([definition]) },
  };
  const prisma: any = { ...tx, $transaction: jest.fn().mockImplementation(async (callback: (client: any) => Promise<unknown>) => {
    const result = await callback(tx);
    events.push('commit');
    return result;
  }) };
  const redis: any = { delPattern: jest.fn().mockImplementation(async (pattern: string) => { events.push(pattern); return 1; }) };
  const service = new OperationService(prisma, {} as any, {} as any, {} as any, {} as any, {} as any, redis);
  return { service, prisma, tx, redis, events };
}

describe('guidance save selection and cache contract', () => {
  it('keeps stored tags when the request omits tags and returns matching nested/top-level selections', async () => {
    const { service, tx, events } = createService();
    const response = await service.saveUserGuidanceInfo('user-1', { region_id: 'campus-a', nickname: '同学' });
    expect(tx.userTag.deleteMany).not.toHaveBeenCalled();
    expect(tx.userTag.createMany).not.toHaveBeenCalled();
    expect(response.data).toMatchObject({ selected_tags: ['tag-1'], selection_unresolved: false });
    expect(response.data.user).toMatchObject({ selected_tags: ['tag-1'], selection_unresolved: false });
    expect(events).toEqual(['commit', 'user:profile:user-1:*', 'user:profile:v2:user-1:*']);
  });

  it('replaces explicitly submitted tags and recovers IDs from the actual stored rows', async () => {
    const { service, tx } = createService();
    const response = await service.saveUserGuidanceInfo('user-1', { region_id: 'campus-a', selected_tags: ['tag-1'] });
    expect(tx.userTag.deleteMany).toHaveBeenCalledTimes(1);
    expect(tx.userTag.createMany.mock.calls[0][0].data).toEqual([{ userId: 'user-1', name: '摄影', color: '#123456' }]);
    expect(response.data.user).toMatchObject({ selected_tags: ['tag-1'], selection_unresolved: false });
  });

  it('treats an explicitly empty selection as a clear operation', async () => {
    const { service, tx } = createService();
    const response = await service.saveUserGuidanceInfo('user-1', { region_id: 'campus-a', selected_tags: [] });
    expect(tx.userTag.deleteMany).toHaveBeenCalledTimes(1);
    expect(response.data).toMatchObject({ selected_tags: [], selection_unresolved: false });
    expect(response.data.user).toMatchObject({ selected_tags: [], selection_unresolved: false });
  });

  it('preserves unresolved old tags and exposes the same warning in both response levels', async () => {
    const { service, tx } = createService();
    tx.userTagDefinition.findMany.mockResolvedValue([definition, { ...definition, id: 'global-tag', regionId: null }]);
    const response = await service.saveUserGuidanceInfo('user-1', { region_id: 'campus-a', nickname: '同学' });
    expect(response.data).toMatchObject({ selected_tags: [], selection_unresolved: true });
    expect(response.data.user).toMatchObject({ selected_tags: [], selection_unresolved: true });
    expect(tx.userTag.deleteMany).not.toHaveBeenCalled();
  });

  it('does not clear any profile cache if the transaction fails', async () => {
    const { service, tx, redis } = createService();
    tx.user.findUnique.mockRejectedValue(new Error('transaction failed'));
    await expect(service.saveUserGuidanceInfo('user-1', { region_id: 'campus-a', nickname: '同学' })).rejects.toThrow('transaction failed');
    expect(redis.delPattern).not.toHaveBeenCalled();
  });

  it('rejects invalid definitions before writing or invalidating cache', async () => {
    const { service, tx, prisma, redis } = createService();
    tx.userTagDefinition.findMany.mockResolvedValue([]);
    await expect(service.saveUserGuidanceInfo('user-1', { region_id: 'campus-a', selected_tags: ['foreign'] })).rejects.toThrow('部分标签无效');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(redis.delPattern).not.toHaveBeenCalled();
  });

  it('rejects two same-name selections that the legacy unique key cannot store', async () => {
    const { service, tx, prisma } = createService();
    tx.userTagDefinition.findMany.mockResolvedValue([definition, { ...definition, id: 'global-tag', regionId: null, tagColor: '#654321' }]);
    await expect(service.saveUserGuidanceInfo('user-1', { region_id: 'campus-a', selected_tags: ['tag-1', 'global-tag'] })).rejects.toThrow('同名标签只能选择一个');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not report a committed save as failed solely because cache invalidation is unavailable', async () => {
    const { service, redis } = createService();
    redis.delPattern.mockRejectedValue(new Error('cache unavailable'));
    await expect(service.saveUserGuidanceInfo('user-1', { region_id: 'campus-a', nickname: '同学' })).resolves.toMatchObject({ success: true });
    expect(redis.delPattern).toHaveBeenCalledTimes(2);
  });
});
