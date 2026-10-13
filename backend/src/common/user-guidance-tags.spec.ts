import { readUserGuidanceTags, resolveUserGuidanceTags } from './user-guidance-tags';

const tag = { name: '摄影', color: '#123456' };
const local = { id: 'local-id', regionId: 'campus-a', tagName: '摄影', tagColor: '#123456', textColor: null, isActive: true };

describe('legacy user tag selection recovery', () => {
  it('returns the actual definition ID only for an exact unique name/color match', () => {
    expect(resolveUserGuidanceTags([tag], [local], 'campus-a')).toEqual({ selected_tags: ['local-id'], selection_unresolved: false });
  });

  it('does not guess between a global and campus definition with the same stored name/color', () => {
    expect(resolveUserGuidanceTags([tag], [local, { ...local, id: 'global-id', regionId: null }], 'campus-a'))
      .toEqual({ selected_tags: [], selection_unresolved: true });
  });

  it.each([
    { ...local, tagName: ' 摄影' },
    { ...local, tagColor: '#ABCDEF' },
    { ...local, isActive: false },
    { ...local, regionId: 'campus-b' },
  ])('does not restore an edited, inactive or foreign definition: %j', definition => {
    expect(resolveUserGuidanceTags([tag], [definition], 'campus-a')).toEqual({ selected_tags: [], selection_unresolved: true });
  });

  it('uses the same textColor fallback as the existing persistence format', () => {
    expect(resolveUserGuidanceTags([tag], [{ ...local, tagColor: null, textColor: '#123456' }], 'campus-a'))
      .toEqual({ selected_tags: ['local-id'], selection_unresolved: false });
  });

  it('keeps resolvable selections but marks a missing old tag for explicit user review', () => {
    expect(resolveUserGuidanceTags([tag, { name: '已下架', color: null }], [local], 'campus-a'))
      .toEqual({ selected_tags: ['local-id'], selection_unresolved: true });
  });

  it('without a selected campus only considers global definitions', () => {
    expect(resolveUserGuidanceTags([tag], [local])).toEqual({ selected_tags: [], selection_unresolved: true });
    expect(resolveUserGuidanceTags([tag], [local, { ...local, id: 'global-id', regionId: null }]))
      .toEqual({ selected_tags: ['global-id'], selection_unresolved: false });
  });

  it('does not query definitions when the user has no stored tags', async () => {
    const client: any = { userTag: { findMany: jest.fn().mockResolvedValue([]) }, userTagDefinition: { findMany: jest.fn() } };
    expect(await readUserGuidanceTags(client, 'user-1', 'campus-a')).toEqual({ selected_tags: [], selection_unresolved: false });
    expect(client.userTagDefinition.findMany).not.toHaveBeenCalled();
  });

  it('loads only the current user and enabled current-campus/global definitions', async () => {
    const client: any = { userTag: { findMany: jest.fn().mockResolvedValue([tag]) }, userTagDefinition: { findMany: jest.fn().mockResolvedValue([local]) } };
    expect(await readUserGuidanceTags(client, 'user-1', 'campus-a')).toEqual({ selected_tags: ['local-id'], selection_unresolved: false });
    expect(client.userTag.findMany.mock.calls[0][0].where).toEqual({ userId: 'user-1' });
    expect(client.userTagDefinition.findMany.mock.calls[0][0].where).toEqual({ isActive: true, OR: [{ regionId: 'campus-a' }, { regionId: null }] });
  });
});
