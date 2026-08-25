import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { CommentService } from './comment.service';

const createPrismaMock = () => {
  const tx = {
    comment: {
      create: jest.fn(),
      update: jest.fn(),
    },
    post: {
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  const prisma = {
    config: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    post: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({ nickname: '测试用户' }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    comment: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
      update: jest.fn(),
    },
    anonymousIdentity: {
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    $transaction: jest.fn((handler: any) => (Array.isArray(handler) ? Promise.all(handler) : handler(tx))),
    __tx: tx,
  };

  return prisma;
};

const createRedisMock = () => ({
  getJson: jest.fn().mockResolvedValue(null),
  setJson: jest.fn().mockResolvedValue(undefined),
  delPattern: jest.fn().mockResolvedValue(0),
});

describe('CommentService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let redis: ReturnType<typeof createRedisMock>;
  let service: CommentService;
  let aiRuntime: any;

  beforeEach(() => {
    prisma = createPrismaMock();
    redis = createRedisMock();
    aiRuntime = { moderateContent: jest.fn().mockResolvedValue({ decision: 'approve', reason: '通过', labels: [], score: 0 }), detectSensitiveHit: jest.fn().mockResolvedValue(null) };
    service = new CommentService(
      prisma as any,
      redis as any,
      { createAndDispatch: jest.fn().mockResolvedValue({}) } as any,
      aiRuntime as any,
      { reviewImages: jest.fn().mockResolvedValue(null) } as any,
      {
        assertStudentProtectedAction: jest.fn().mockResolvedValue(undefined),
        assertCanCreateContent: jest.fn().mockResolvedValue(undefined),
        assertCanInteract: jest.fn().mockResolvedValue(undefined),
        assertNoBlockBetween: jest.fn().mockResolvedValue(undefined),
      } as any,
      { assertAllowed: jest.fn().mockResolvedValue({ allowed: true }) } as any,
    );
  });

  it('评论 AI 审核会同时提交图片', async () => {
    prisma.config.findUnique.mockResolvedValue({
      value: { comment_approval_type: 'ai', ai_review_failure_to_manual: 1 },
    });

    await (service as any).resolveCommentReview(
      '你好',
      'region-1',
      ['https://cdn.example.com/comment-risk.jpg'],
      'user-1',
    );

    expect(aiRuntime.moderateContent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'comment',
      content: '你好',
      imageUrls: ['https://cdn.example.com/comment-risk.jpg'],
    }));
  });

  it('only lists visible approved comments and counts top-level total separately', async () => {
    prisma.post.findUnique.mockResolvedValue({
      id: 'p1',
      userId: 'author',
      regionId: 'r1',
      commentCount: 8,
      region: { managerAccountId: 'admin-1' },
    });
    prisma.comment.findMany.mockResolvedValue([]);
    prisma.comment.count.mockResolvedValueOnce(3).mockResolvedValueOnce(8);

    const result = await service.getCommentsV2('p1', {});

    expect(prisma.comment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        postId: 'p1',
        parentId: null,
        status: 'active',
        auditStatus: 'approved',
        deletedAt: null,
      }),
    }));
    expect(result.total).toBe(3);
    expect(result.comment_count).toBe(8);
    expect(result.visible_comment_count).toBe(8);
  });

  it('accepts parentId, validates parent post, and increments count for visible comments', async () => {
    prisma.post.findUnique.mockResolvedValue({ userId: 'author', regionId: 'r1', commentCount: 0, status: 'PUBLISHED', deletedAt: null });
    prisma.comment.count.mockResolvedValue(0);
    prisma.comment.findUnique.mockResolvedValue({
      id: 'c-parent',
      postId: 'p1',
      userId: 'u2',
      status: 'active',
      auditStatus: 'approved',
      deletedAt: null,
    });
    prisma.__tx.comment.create.mockResolvedValue({
      id: 'c1',
      postId: 'p1',
      userId: 'u1',
      parentId: 'c-parent',
      content: 'hello',
      status: 'active',
      auditStatus: 'approved',
      deletedAt: null,
    });

    const result = await service.createComment('p1', 'u1', { content: 'hello', parentId: 'c-parent' });

    expect(result.parentId).toBe('c-parent');
    expect(prisma.__tx.post.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { commentCount: { increment: 1 } },
    });
  });

  it('rejects replies to comments from another post', async () => {
    prisma.post.findUnique.mockResolvedValue({ userId: 'author', regionId: 'r1', commentCount: 0, status: 'PUBLISHED', deletedAt: null });
    prisma.comment.count.mockResolvedValue(0);
    prisma.comment.findUnique.mockResolvedValue({
      id: 'c-parent',
      postId: 'other-post',
      userId: 'u2',
      status: 'active',
      auditStatus: 'approved',
      deletedAt: null,
    });

    await expect(service.createComment('p1', 'u1', { content: 'hello', parentId: 'c-parent' }))
      .rejects.toThrow(BadRequestException);
  });

  it('does not decrement post count when deleting an unapproved comment', async () => {
    prisma.comment.findUnique.mockResolvedValue({
      id: 'c1',
      postId: 'p1',
      userId: 'u1',
      status: 'hidden',
      auditStatus: 'pending',
      deletedAt: null,
      post: { userId: 'author' },
    });

    const result = await service.deleteComment('c1', 'u1');

    expect(result.changed).toBe(true);
    expect(prisma.__tx.comment.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { status: 'deleted', deletedAt: expect.any(Date), isTop: false },
    });
    expect(prisma.__tx.post.updateMany).not.toHaveBeenCalled();
  });

  it('rejects deleting another user comment when requester is not post author', async () => {
    prisma.comment.findUnique.mockResolvedValue({
      id: 'c1',
      postId: 'p1',
      userId: 'u2',
      status: 'active',
      auditStatus: 'approved',
      deletedAt: null,
      post: { userId: 'author' },
    });

    await expect(service.deleteComment('c1', 'u1')).rejects.toThrow(ForbiddenException);
  });

  it('does not allow pending comments to be pinned', async () => {
    prisma.comment.findUnique.mockResolvedValue({
      id: 'c1',
      postId: 'p1',
      userId: 'u2',
      status: 'hidden',
      auditStatus: 'pending',
      deletedAt: null,
      post: { userId: 'author' },
    });

    await expect(service.pinComment('c1', 'author', { pin_status: 1 })).rejects.toThrow(BadRequestException);
  });

  it('does not let a comment borrow an anonymous identity from another region', async () => {
    const regionAIdentity = { id: 'anonymous-a', regionId: 'region-a', name: '树洞同学', avatar: '/a.png' };
    prisma.anonymousIdentity.findUnique.mockResolvedValue(regionAIdentity);
    prisma.anonymousIdentity.findFirst.mockImplementation(({ where }: any) =>
      Promise.resolve(where?.regionId === 'region-a' ? regionAIdentity : null),
    );

    await expect((service as any).resolveAnonymousCommentPayload(
      'region-b',
      { allow_anonymous_comments: 1 },
      { anonymous_id: 'anonymous-a' },
    )).rejects.toThrow(BadRequestException);
    expect(prisma.anonymousIdentity.findFirst).toHaveBeenCalledWith({
      where: { id: 'anonymous-a', regionId: 'region-b' },
    });
  });

  it('keeps the real commenter out of the mini-program response', () => {
    const response = (service as any).formatCommentForMini({
      id: 'comment-1', postId: 'post-1', userId: 'real-user-1', content: '匿名评论',
      status: 'active', auditStatus: 'approved', isAnonymous: true,
      anonymousIdentityId: 'anonymous-a', anonymousName: '树洞同学', anonymousAvatar: '/a.png',
      user: { id: 'real-user-1', nickname: '真实姓名', avatar: '/real.png' }, post: { regionId: 'region-a' },
      mentions: [], createdAt: new Date(), updatedAt: new Date(),
    });

    expect(response).toMatchObject({ userId: '', user_id: '', isAnonymous: true, user: { nickname: '树洞同学', id: '' } });
    expect(JSON.stringify(response)).not.toContain('real-user-1');
    expect(JSON.stringify(response)).not.toContain('真实姓名');
  });
});
