import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PostService, assertCommunityPostAccessible } from './post.service';
import { CommentService } from '../comment/comment.service';
const setup = () => {
  const p: any = { post: { findUnique: jest.fn().mockResolvedValue({ id: 'p', userId: 'owner', status: 'PUBLISHED', regionId: 'r', favoriteCount: 1 }), findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0), updateMany: jest.fn().mockResolvedValue({ count: 1 }) }, block: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) }, favorite: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0), createMany: jest.fn().mockResolvedValue({ count: 1 }), deleteMany: jest.fn().mockResolvedValue({ count: 1 }) }, postSquat: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) }, comment: { groupBy: jest.fn().mockResolvedValue([]), findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) }, userMembership: { findMany: jest.fn().mockResolvedValue([]) }, config: { findUnique: jest.fn().mockResolvedValue(null) }, like: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) }, follow: { findMany: jest.fn().mockResolvedValue([{ followingId: 'author' }]) } };
  p.$transaction = jest.fn((work: any) => work(p));
  const access: any = { assertCanInteract: jest.fn(), assertStudentProtectedAction: jest.fn() };
  const redis: any = { getJson: jest.fn().mockResolvedValue(null), setJson: jest.fn() };
  const post = new PostService(p, redis, {} as any, {} as any, {} as any, access, {} as any, {} as any, {} as any);
  const comment = new CommentService(p, redis, {} as any, {} as any, {} as any, access, {} as any);
  return { p, post, comment, access };
};
describe('community read boundaries', () => {
  it('deleted/unpublished/blocked posts fail before any comments are read', async () => {
    for (const row of [null, { userId: 'owner', deletedAt: new Date() }, { userId: 'owner', status: 'PENDING' }]) {
      const h = setup(); h.p.post.findUnique.mockResolvedValue(row);
      await expect(h.comment.getCommentsV2('p', {}, 'viewer')).rejects.toThrow();
      expect(h.p.comment.findMany).not.toHaveBeenCalled();
    }
    const h = setup(); h.p.block.findFirst.mockResolvedValue({ id: 'block' });
    await expect(h.comment.getCommentsV2('p', {}, 'viewer')).rejects.toThrow(ForbiddenException);
    expect(h.p.comment.findMany).not.toHaveBeenCalled();
  });
  it('owner may view pending, guests cannot; infrastructure failures do not silently permit access', async () => {
    const h = setup(); await expect(assertCommunityPostAccessible(h.p, { userId: 'owner', status: 'PENDING' }, 'owner')).resolves.toBeUndefined();
    await expect(assertCommunityPostAccessible(h.p, { userId: 'owner', status: 'PENDING' })).rejects.toThrow(ForbiddenException);
    await expect(assertCommunityPostAccessible(h.p, null)).rejects.toThrow(NotFoundException);
    h.p.block.findFirst.mockRejectedValue(new Error('database unavailable'));
    await expect(assertCommunityPostAccessible(h.p, { userId: 'owner' }, 'viewer')).rejects.toThrow('database unavailable');
  });
  it('anonymous owner gets management booleans without a public author id; anonymous comment owner can delete own row', async () => {
    const h = setup(); h.p.post.findUnique.mockResolvedValue({ id: 'p', userId: 'owner', isAnonymous: true, status: 'PUBLISHED' });
    h.p.comment.findMany.mockResolvedValue([{ id: 'c', userId: 'viewer', isAnonymous: true, user: { id: 'viewer', nickname: 'private' }, content: 'hello', replies: [] }]);
    const response = await h.comment.getCommentsV2('p', {}, 'viewer');
    expect(response.AuthorId).toBe(''); expect(response.canManageComments).toBe(false);
    expect(response.list[0]).toMatchObject({ user_id: '', canDelete: true, canPin: false }); expect(response.list[0].user.id).toBe('');
    const owner = await h.comment.getCommentsV2('p', {}, 'owner'); expect(owner.canManageComments).toBe(true); expect(owner.list[0].canPin).toBe(true);
  });
  it('subscriptions never leak deleted or anonymous authors and retain unavailable ids for unsubscribe', async () => {
    const h = setup(); h.p.postSquat.findMany.mockResolvedValue([{ id: 's1', postId: 'gone' }, { id: 's2', postId: 'anon' }]); h.p.postSquat.count.mockResolvedValue(2);
    h.p.post.findMany.mockResolvedValue([{ id: 'gone', userId: 'secret', title: 'deleted secret', deletedAt: new Date() }, { id: 'anon', userId: 'secret', regionId: 'r', isAnonymous: true, user: { id: 'secret', nickname: 'real name' }, title: 'public', status: 'PUBLISHED' }]);
    const response = await h.post.mySquats('viewer', {});
    expect(response.list[0]).toMatchObject({ unavailable: true, postId: 'gone', postTitle: '' });
    expect(JSON.stringify(response)).not.toContain('secret'); expect(JSON.stringify(response)).not.toContain('real name'); expect(response.list[1].postUser.id).toBe('');
  });
  it('favorite and unfavorite are unique idempotent and update count only inside same transaction', async () => {
    const h = setup(); expect(await h.post.setFavorite('p', 'viewer', true)).toMatchObject({ favorited: true, changed: true, favorite_count: 1 });
    expect(h.p.favorite.createMany).toHaveBeenCalledWith({ data: [{ userId: 'viewer', targetType: 'post', targetId: 'p' }], skipDuplicates: true });
    expect(h.p.post.updateMany).toHaveBeenCalledWith({ where: { id: 'p' }, data: { favoriteCount: { increment: 1 } } });
    h.p.favorite.createMany.mockResolvedValue({ count: 0 }); h.p.post.updateMany.mockClear(); await h.post.setFavorite('p', 'viewer', true); expect(h.p.post.updateMany).not.toHaveBeenCalled();
    h.p.favorite.deleteMany.mockResolvedValue({ count: 0 }); await h.post.setFavorite('p', 'viewer', false); expect(h.p.post.updateMany).not.toHaveBeenCalled();
    h.p.favorite.createMany.mockRejectedValue(new Error('write failed')); await expect(h.post.setFavorite('p', 'viewer', true)).rejects.toThrow('write failed'); expect(h.p.post.updateMany).not.toHaveBeenCalled();
  });
  it('favorites are private and apply region/public/block filters before pagination and counting', async () => {
    const h = setup(); await expect(h.post.myPosts('viewer', { user_id: 'other', type: 'favorited' })).rejects.toThrow(ForbiddenException);
    h.p.block.findMany.mockResolvedValue([{ userId: 'blocked', blockedId: 'viewer' }]);
    await h.post.myPosts('viewer', { type: 'favorited', region_id: 'r', page: 2, pageSize: 10 });
    const where = { userId: 'viewer', targetType: 'post', post: { is: { status: 'PUBLISHED', auditStatus: 'approved', deletedAt: null, regionId: 'r', userId: { notIn: ['blocked'] } } } };
    expect(h.p.favorite.findMany).toHaveBeenCalledWith(expect.objectContaining({ where, skip: 10, take: 10 })); expect(h.p.favorite.count).toHaveBeenCalledWith({ where });
  });
  it('votes enforce access and identical retry is idempotent while changed retry is forbidden', async () => {
    const h = setup(); h.p.postVote = { findUnique: jest.fn().mockResolvedValue({ id: 'v', postId: 'p', options: [{ id: 'a' }, { id: 'b' }], maxSelect: 1, allowAdd: false }) };
    h.p.postVoteRecord = { findUnique: jest.fn().mockResolvedValue({ optionIds: ['a'] }), upsert: jest.fn() };
    expect(await h.post.vote('viewer', { vote_id: 'v', option_ids: ['a', 'a'] })).toMatchObject({ voted: true, option_ids: ['a'] }); expect(h.p.postVoteRecord.upsert).not.toHaveBeenCalled();
    await expect(h.post.vote('viewer', { vote_id: 'v', option_ids: ['b'] })).rejects.toThrow('不允许修改');
    h.p.post.findUnique.mockResolvedValue({ userId: 'owner', status: 'PENDING' });
    await expect(h.post.vote('viewer', { vote_id: 'v', option_ids: ['a'] })).rejects.toThrow(ForbiddenException);
    await expect(h.post.getVoteStats('p', 'viewer')).rejects.toThrow(ForbiddenException);
  });
  it('votes retry serialization failure a finite number of times and never hide database failures', async () => {
    const h = setup(); h.p.$transaction.mockRejectedValue({ code: 'P2034' });
    await expect(h.post.vote('viewer', { vote_id: 'v', option_ids: ['a'] })).rejects.toMatchObject({ code: 'P2034' }); expect(h.p.$transaction).toHaveBeenCalledTimes(3);
  });
  it('reply pagination checks parent post access before reading children', async () => {
    const h = setup(); h.p.comment.findUnique = jest.fn().mockResolvedValue({ id: 'root', postId: 'p', status: 'active', auditStatus: 'approved', post: { userId: 'owner', deletedAt: new Date() } });
    await expect(h.comment.getReplies('root', { page: 5 }, 'viewer')).rejects.toThrow(NotFoundException); expect(h.p.comment.findMany).not.toHaveBeenCalled();
  });

});
describe('anonymous author relationship privacy', () => {
 it('follow feed excludes anonymous author posts before pagination and count', async () => { const h = setup(); await h.post.nearbyFollowed('r', { type: 'followed' }, 'viewer'); expect(h.p.post.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: { in: ['author'] }, isAnonymous: false }) })); expect(h.p.post.count).toHaveBeenCalledWith({ where: expect.objectContaining({ isAnonymous: false }) }); });
 it('another persons author timeline excludes anonymous posts while owner retains their own', async () => { const h = setup(); await h.post.myPosts('viewer', { user_id: 'author', type: 'all' }); expect(h.p.post.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: 'author', isAnonymous: false, status: 'PUBLISHED' }) })); await h.post.myPosts('author', { type: 'all' }); expect(h.p.post.findMany.mock.calls[1][0].where).not.toHaveProperty('isAnonymous'); });
 it('liked timeline filters published approved unblocked posts in SQL, not after pagination', async () => { const h = setup(); h.p.block.findMany.mockResolvedValue([{ userId: 'blocked', blockedId: 'viewer' }]); await h.post.myPosts('viewer', { user_id: 'author', type: 'liked', region_id: 'r' }); expect(h.p.like.findMany.mock.calls[0][0].where.post.is).toMatchObject({ status: 'PUBLISHED', auditStatus: 'approved', deletedAt: null, regionId: 'r', userId: { notIn: ['blocked'] } }); expect(h.p.like.count.mock.calls[0][0].where).toEqual(h.p.like.findMany.mock.calls[0][0].where); });
});
