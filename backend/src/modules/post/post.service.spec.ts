import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PostService } from './post.service';
import { PrismaService } from '../../common/services/prisma.service';
import { RedisService } from '../../common/services/redis.service';
import { NotifyService } from '../notify/notify.service';
import { AiRuntimeService } from '../ai-runtime/ai-runtime.service';
import { QrcodeModerationService } from '../ai-runtime/qrcode-moderation.service';
import { UserAccessPolicyService } from '../../common/services/user-access-policy.service';
import { InteractionPermissionService } from '../../common/services/interaction-permission.service';
import { MembershipService } from '../membership/membership.service';
import { GrowthService } from '../growth/growth.service';

const makeMockPrisma = () => {
  const mock: any = {
    post: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      count: jest.fn().mockResolvedValue(0),
    },
    like: {
      upsert: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
    },
    favorite: { findFirst: jest.fn().mockResolvedValue(null) },
    browseHistory: { create: jest.fn().mockResolvedValue({}) },
    follow: { findMany: jest.fn().mockResolvedValue([]) },
    user: { findUnique: jest.fn().mockResolvedValue({ nickname: '测试用户' }) },
    block: { upsert: jest.fn(), findFirst: jest.fn().mockResolvedValue(null) },
    report: { create: jest.fn() },
    postCollaborator: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      upsert: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({}),
      count: jest.fn().mockResolvedValue(0),
    },
    postSquat: {
      upsert: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    postDislike: {
      upsert: jest.fn().mockResolvedValue({}),
    },
    postVote: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({ id: 'vote-1' }),
    },
    postVoteOption: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({}),
    },
    postVoteRecord: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({}),
    },
    config: { findUnique: jest.fn().mockResolvedValue(null) },
    anonymousIdentity: {
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
    },
  };
  mock.$transaction = jest.fn(async (arg: any) => (typeof arg === 'function' ? arg(mock) : Promise.all(arg)));
  return mock;
};

const makeMockRedis = () => ({
  get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue(undefined), del: jest.fn(), incr: jest.fn(),
  getJson: jest.fn().mockResolvedValue(null), setJson: jest.fn().mockResolvedValue(undefined), delPattern: jest.fn().mockResolvedValue(0),
  expire: jest.fn(), getLock: jest.fn(), releaseLock: jest.fn(),
  lpush: jest.fn(), brpop: jest.fn(), hset: jest.fn(), hget: jest.fn(),
  hdel: jest.fn(), hgetall: jest.fn(), zadd: jest.fn(), zincrby: jest.fn().mockResolvedValue(undefined),
  zrevrange: jest.fn(), zrem: jest.fn(), getClient: jest.fn(),
});

const makeMockNotify = () => ({
  createAndDispatch: jest.fn().mockResolvedValue({}),
  createAndDispatchInteraction: jest.fn().mockResolvedValue({}),
});

const makeMockAiRuntime = () => ({
  moderateContent: jest.fn().mockResolvedValue({
    decision: 'approve',
    reason: '测试默认通过',
    labels: [],
    score: 0,
  }),
});

const makeMockQrcodeModeration = () => ({
  reviewImages: jest.fn().mockResolvedValue(null),
});

const makeMockUserAccessPolicy = () => ({
  assertCanCreateContent: jest.fn().mockResolvedValue(undefined),
  assertCanInteract: jest.fn().mockResolvedValue(undefined),
  assertNoBlockBetween: jest.fn().mockResolvedValue(undefined),
  assertStudentProtectedAction: jest.fn().mockResolvedValue(undefined),
});

const makeMockInteractionPermission = () => ({
  assertAllowed: jest.fn().mockResolvedValue({ allowed: true }),
});

const makeMockMembership = () => ({
  hasBenefit: jest.fn().mockResolvedValue(true),
});

const makeMockGrowth = () => ({
  getContentBoostByUserIds: jest.fn().mockResolvedValue(new Map()),
});

describe('PostService', () => {
  let service: PostService;
  let prisma: any;
  let notifyService: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostService,
        { provide: PrismaService, useValue: makeMockPrisma() },
        { provide: RedisService, useValue: makeMockRedis() },
        { provide: NotifyService, useValue: makeMockNotify() },
        { provide: AiRuntimeService, useValue: makeMockAiRuntime() },
        { provide: QrcodeModerationService, useValue: makeMockQrcodeModeration() },
        { provide: UserAccessPolicyService, useValue: makeMockUserAccessPolicy() },
        { provide: InteractionPermissionService, useValue: makeMockInteractionPermission() },
        { provide: MembershipService, useValue: makeMockMembership() },
        { provide: GrowthService, useValue: makeMockGrowth() },
      ],
    }).compile();
    service = module.get<PostService>(PostService);
    prisma = module.get(PrismaService);
    notifyService = module.get(NotifyService);
  });

  // ============ detail ============
  describe('detail', () => {
    it('should throw NotFoundException for missing post', async () => {
      await expect(service.detail('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  // ============ like/unlike ============
  describe('like/unlike', () => {
    const publishedPost = {
      id: 'p1',
      userId: 'author',
      title: '测试',
      regionId: 'r1',
      status: 'PUBLISHED',
      deletedAt: null,
    };

    it('should increment likeCount only when creating a new like', async () => {
      prisma.post.findUnique.mockResolvedValue(publishedPost);
      prisma.like.findUnique.mockResolvedValue(null);
      const result = await service.like('p1', 'u1');
      expect(result).toMatchObject({ liked: true, changed: true });
      expect(prisma.like.create).toHaveBeenCalledWith({ data: { userId: 'u1', targetType: 'post', targetId: 'p1' } });
      expect(prisma.post.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { likeCount: { increment: 1 } } });
    });

    it('should not increment likeCount for repeated like', async () => {
      prisma.post.findUnique.mockResolvedValue(publishedPost);
      prisma.like.findUnique.mockResolvedValue({ id: 'like-1' });
      const result = await service.like('p1', 'u1');
      expect(result).toMatchObject({ liked: true, changed: false });
      expect(prisma.like.create).not.toHaveBeenCalled();
      expect(prisma.post.update).not.toHaveBeenCalledWith({ where: { id: 'p1' }, data: { likeCount: { increment: 1 } } });
    });

    it('should decrement likeCount only when a like existed', async () => {
      prisma.post.findUnique.mockResolvedValue(publishedPost);
      prisma.like.deleteMany.mockResolvedValue({ count: 1 });
      const result = await service.unlike('p1', 'u1');
      expect(result).toMatchObject({ liked: false, changed: true });
      expect(prisma.post.updateMany).toHaveBeenCalledWith({
        where: { id: 'p1', likeCount: { gt: 0 } },
        data: { likeCount: { decrement: 1 } },
      });
    });

    it('should not decrement likeCount when no like existed', async () => {
      prisma.post.findUnique.mockResolvedValue(publishedPost);
      prisma.like.deleteMany.mockResolvedValue({ count: 0 });
      const result = await service.unlike('p1', 'u1');
      expect(result).toMatchObject({ liked: false, changed: false });
      expect(prisma.post.updateMany).not.toHaveBeenCalled();
    });
  });

  // ============ remove ============
  describe('remove', () => {
    it('should throw ForbiddenException for non-owner', async () => {
      prisma.post.findUnique.mockResolvedValue({ id: 'p1', userId: 'other' });
      await expect(service.remove('p1', 'me')).rejects.toThrow(ForbiddenException);
    });
  });

  // ============ like/unlike ============
  describe('like/unlike', () => {
    it('should increment likeCount only when a like record is created', async () => {
      prisma.post.findUnique.mockResolvedValue({ id: 'p1', userId: 'author', status: 'PUBLISHED', deletedAt: null });
      const result = await service.like('p1', 'u1');
      expect(result.changed).toBe(true);
      expect(prisma.like.create).toHaveBeenCalledWith({ data: { userId: 'u1', targetType: 'post', targetId: 'p1' } });
      expect(prisma.post.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { likeCount: { increment: 1 } } });
    });

    it('should not increment likeCount when duplicate create races', async () => {
      prisma.post.findUnique.mockResolvedValue({ id: 'p1', userId: 'author', status: 'PUBLISHED', deletedAt: null });
      prisma.like.create.mockRejectedValueOnce({ code: 'P2002' });
      const result = await service.like('p1', 'u1');
      expect(result.changed).toBe(false);
      expect(prisma.post.update).not.toHaveBeenCalled();
    });

    it('should decrement likeCount only when a like record is deleted', async () => {
      prisma.post.findUnique.mockResolvedValue({ id: 'p1', userId: 'author', status: 'PUBLISHED', deletedAt: null });
      prisma.like.deleteMany.mockResolvedValueOnce({ count: 1 });
      const result = await service.unlike('p1', 'u1');
      expect(result.changed).toBe(true);
      expect(prisma.post.updateMany).toHaveBeenCalledWith({
        where: { id: 'p1', likeCount: { gt: 0 } },
        data: { likeCount: { decrement: 1 } },
      });
    });
  });

  // ============ dislikePost ============
  describe('dislikePost', () => {
    it('should create dislike record', async () => {
      const result = await service.dislikePost('u1', { target_id: 'p1' });
      expect(result.success).toBe(true);
      expect(result.disliked).toBe(true);
      expect(prisma.postDislike.upsert).toHaveBeenCalled();
    });

    it('should throw if no target_id', async () => {
      await expect(service.dislikePost('u1', {})).rejects.toThrow(BadRequestException);
    });
  });

  // ============ squatPost ============
  describe('squatPost', () => {
    it('should create squat record', async () => {
      prisma.post.findUnique.mockResolvedValue({ id: 'p1' });
      const result = await service.squatPost('p1', 'u1');
      expect(result.isSquatting).toBe(true);
      expect(prisma.postSquat.upsert).toHaveBeenCalled();
    });

    it('should dispatch owner squat notifications through the interaction anti-spam path', async () => {
      prisma.post.findUnique.mockResolvedValue({
        id: 'p1',
        userId: 'owner1',
        regionId: 'r1',
        title: '九成新台灯',
        status: 'PUBLISHED',
        deletedAt: null,
      });
      prisma.user.findUnique.mockResolvedValue({ nickname: '阿泽' });

      await service.squatPost('p1', 'u1');

      expect(notifyService.createAndDispatchInteraction).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'owner1',
          regionId: 'r1',
          type: 'SQUAT',
          scene: 'post_squat',
          title: '有人蹲了你的帖子',
          content: '阿泽 蹲了你的帖子',
          data: expect.objectContaining({
            postId: 'p1',
            fromUserId: 'u1',
            direction: 'inbound',
            targetType: 'post',
            targetTitle: '九成新台灯',
          }),
          linkType: 'post',
          linkValue: 'p1',
        }),
        expect.objectContaining({
          actorId: 'u1',
          cooldownMs: 24 * 60 * 60 * 1000,
        }),
      );
      expect(notifyService.createAndDispatch).not.toHaveBeenCalled();
    });

    it('should throw for missing post', async () => {
      prisma.post.findUnique.mockResolvedValue(null);
      await expect(service.squatPost('x', 'u1')).rejects.toThrow(NotFoundException);
    });
  });

  // ============ checkSquat ============
  describe('checkSquat', () => {
    it('should return false when not squatting', async () => {
      const result = await service.checkSquat('p1', 'u1');
      expect(result.isSquatting).toBe(false);
    });

    it('should return true when squatting', async () => {
      prisma.postSquat.findUnique.mockResolvedValue({ id: 's1' });
      const result = await service.checkSquat('p1', 'u1');
      expect(result.isSquatting).toBe(true);
    });
  });

  // ============ mySquats ============
  describe('mySquats', () => {
    it('should return paginated list', async () => {
      prisma.postSquat.findMany.mockResolvedValue([{ id: 's1', postId: 'p1', userId: 'u1', createdAt: new Date() }]);
      prisma.postSquat.count.mockResolvedValue(1);
      prisma.post.findMany.mockResolvedValue([{ id: 'p1', title: 'Test', content: '...', user: { id: 'u2', nickname: 'A', avatar: null } }]);
      const result = await service.mySquats('u1', {});
      expect(result.list).toHaveLength(1);
      expect(result.list[0]).toHaveProperty('postTitle');
      expect(result.total).toBe(1);
    });
  });

  // ============ vote ============
  describe('vote', () => {
    it('should throw if no vote_id', async () => {
      await expect(service.vote('u1', {})).rejects.toThrow(BadRequestException);
    });

    it('should throw if no option', async () => {
      await expect(service.vote('u1', { vote_id: 'v1' })).rejects.toThrow(BadRequestException);
    });

    it('should create vote record', async () => {
      prisma.postVote.findUnique.mockResolvedValue({
        id: 'v1', maxSelect: 1, allowAdd: false,
        options: [{ id: 'opt1', text: 'A' }],
      });
      const result = await service.vote('u1', { vote_id: 'v1', option_ids: ['opt1'] });
      expect(result.success).toBe(true);
      expect(prisma.postVoteRecord.upsert).toHaveBeenCalled();
    });

    it('should reject invalid option', async () => {
      prisma.postVote.findUnique.mockResolvedValue({
        id: 'v1', maxSelect: 1,
        options: [{ id: 'opt1', text: 'A' }],
      });
      await expect(
        service.vote('u1', { vote_id: 'v1', option_ids: ['invalid'] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject exceeding maxSelect', async () => {
      prisma.postVote.findUnique.mockResolvedValue({
        id: 'v1', maxSelect: 1,
        options: [{ id: 'opt1', text: 'A' }, { id: 'opt2', text: 'B' }],
      });
      await expect(
        service.vote('u1', { vote_id: 'v1', option_ids: ['opt1', 'opt2'] }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ============ unvote ============
  describe('unvote', () => {
    it('should delete vote record', async () => {
      const result = await service.unvote('u1', { vote_id: 'v1' });
      expect(result.voted).toBe(false);
      expect(prisma.postVoteRecord.deleteMany).toHaveBeenCalledWith({ where: { voteId: 'v1', userId: 'u1' } });
    });

    it('should throw if no vote_id', async () => {
      await expect(service.unvote('u1', {})).rejects.toThrow(BadRequestException);
    });
  });

  // ============ getVoteStats ============
  describe('getVoteStats', () => {
    it('should return empty stats for no vote', async () => {
      const result = await service.getVoteStats('p1');
      expect(result.totalVotes).toBe(0);
      expect(result.options).toEqual([]);
    });

    it('should return vote stats with counts', async () => {
      prisma.postVote.findUnique.mockResolvedValue({
        id: 'v1', title: '测试', maxSelect: 1,
        options: [{ id: 'opt1', text: 'A', sortOrder: 0 }, { id: 'opt2', text: 'B', sortOrder: 1 }],
      });
      prisma.postVoteRecord.findMany.mockResolvedValue([
        { optionIds: ['opt1'] },
        { optionIds: ['opt1'] },
        { optionIds: ['opt2'] },
      ]);
      const result = await service.getVoteStats('p1');
      expect(result.totalVotes).toBe(3);
      expect(result.options[0].count).toBe(2);
      expect(result.options[1].count).toBe(1);
    });
  });

  // ============ createVoteOptions ============
  describe('createVoteOptions', () => {
    it('should throw if no options', async () => {
      await expect(
        service.createVoteOptions('u1', { vote_id: 'v1' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create options', async () => {
      prisma.postVote.findUnique.mockResolvedValue({ id: 'v1', postId: 'p1' });
      prisma.post.findUnique.mockResolvedValue({ id: 'p1', userId: 'u1' });
      const result = await service.createVoteOptions('u1', {
        vote_id: 'v1',
        options: [{ text: '选项A' }, { text: '选项B' }],
      });
      expect(result.success).toBe(true);
      expect(result.count).toBe(2);
    });
  });

  // ============ upsertVoteSettings ============
  describe('upsertVoteSettings', () => {
    it('should throw if no post_id', async () => {
      await expect(service.upsertVoteSettings('u1', {})).rejects.toThrow(BadRequestException);
    });

    it('should throw if post not found', async () => {
      prisma.post.findUnique.mockResolvedValue(null);
      await expect(
        service.upsertVoteSettings('u1', { post_id: 'x' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if not owner', async () => {
      prisma.post.findUnique.mockResolvedValue({ id: 'p1', userId: 'other' });
      await expect(
        service.upsertVoteSettings('u1', { post_id: 'p1' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should upsert vote settings', async () => {
      prisma.post.findUnique.mockResolvedValue({ id: 'p1', userId: 'u1' });
      const result = await service.upsertVoteSettings('u1', {
        post_id: 'p1', title: '投票标题', max_select: 3,
      });
      expect(result.success).toBe(true);
      expect(result.voteId).toBe('vote-1');
    });
  });

  // ============ simulateActions ============
  describe('simulateActions', () => {
    it('should reject in production', async () => {
      const prevEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      await expect(
        service.simulateActions('u1', { post_id: 'p1', action: 'view' }),
      ).rejects.toThrow(ForbiddenException);
      process.env.NODE_ENV = prevEnv;
    });

    it('should reject invalid count', async () => {
      process.env.NODE_ENV = 'development';
      prisma.post.findUnique.mockResolvedValue({ id: 'p1' });
      await expect(
        service.simulateActions('u1', { post_id: 'p1', action: 'view', count: 200 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should accept view simulation', async () => {
      process.env.NODE_ENV = 'development';
      prisma.post.findUnique.mockResolvedValue({ id: 'p1' });
      const result = await service.simulateActions('u1', { post_id: 'p1', action: 'view', count: 5 });
      expect(result.success).toBe(true);
    });
  });

  // ============ co-creators ============
  describe('co-creators', () => {
    it('should create pending co-creator invites', async () => {
      prisma.post.findUnique.mockResolvedValue({ userId: 'author' });
      const result = await service.inviteCoCreators('p1', 'author', {
        user_ids: ['u1'],
        invite_message: '一起写',
      });
      expect(result).toMatchObject({ success: true, count: 1 });
      expect(prisma.postCollaborator.upsert).toHaveBeenCalledWith(expect.objectContaining({
        where: { postId_userId: { postId: 'p1', userId: 'u1' } },
        create: expect.objectContaining({
          postId: 'p1',
          userId: 'u1',
          inviterId: 'author',
          status: 'pending',
          inviteMessage: '一起写',
        }),
      }));
      expect(prisma.post.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { isCoCreate: true } });
    });

    it('should accept an existing co-creator invite', async () => {
      prisma.postCollaborator.findUnique.mockResolvedValue({ id: 'c1', postId: 'p1', userId: 'u1', status: 'pending' });
      const result = await service.respondCoCreatorInvite('p1', 'u1', { action: 'accept' });
      expect(result).toMatchObject({ success: true, accepted: true });
      expect(prisma.postCollaborator.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { postId_userId: { postId: 'p1', userId: 'u1' } },
        data: expect.objectContaining({
          status: 'accepted',
          rejectedAt: null,
          operatorId: 'u1',
        }),
      }));
    });
  });

  // ============ myCoCreatorInvites ============
  describe('myCoCreatorInvites', () => {
    it('should return paginated invites', async () => {
      prisma.postCollaborator.findMany.mockResolvedValue([
        { id: 'c1', postId: 'p1', userId: 'u1', createdAt: new Date(),
          post: { id: 'p1', title: 'Test', content: 'abc', user: { id: 'u2', nickname: 'A', avatar: null } } },
      ]);
      prisma.postCollaborator.count.mockResolvedValue(1);
      const result = await service.myCoCreatorInvites('u1', {});
      expect(result.data.list).toHaveLength(1);
      expect(result.data.pagination.total).toBe(1);
    });
  });

  describe('regional anonymous identities', () => {
    it('never accepts an identity belonging to another region', async () => {
      prisma.config.findUnique.mockResolvedValue({ value: { allow_anonymous_notes: 1 } });
      const regionAIdentity = { id: 'anonymous-a', regionId: 'region-a', name: '树洞同学', avatar: '/a.png' };
      prisma.anonymousIdentity.findUnique.mockResolvedValue(regionAIdentity);
      prisma.anonymousIdentity.findFirst.mockImplementation(({ where }: any) =>
        Promise.resolve(where?.regionId === 'region-a' ? regionAIdentity : null),
      );

      await expect((service as any).resolveAnonymousPostPayload('region-b', { anonymous_id: 'anonymous-a' }))
        .rejects.toThrow(BadRequestException);
      expect(prisma.anonymousIdentity.findFirst).toHaveBeenCalledWith({
        where: { id: 'anonymous-a', regionId: 'region-b' },
      });
    });

    it('randomly selects only from the post region pool', async () => {
      prisma.config.findUnique.mockResolvedValue({ value: { allow_anonymous_notes: 1 } });
      prisma.anonymousIdentity.count.mockResolvedValue(1);
      prisma.anonymousIdentity.findFirst.mockResolvedValue({ id: 'anonymous-a', regionId: 'region-a', name: '树洞同学', avatar: '/a.png' });

      await expect((service as any).resolveAnonymousPostPayload('region-a', { is_anonymous: true }))
        .resolves.toMatchObject({ anonymousIdentityId: 'anonymous-a', anonymousName: '树洞同学' });
      expect(prisma.anonymousIdentity.count).toHaveBeenCalledWith({ where: { regionId: 'region-a' } });
      expect(prisma.anonymousIdentity.findFirst).toHaveBeenCalledWith(expect.objectContaining({
        where: { regionId: 'region-a' },
      }));
    });

    it('keeps the real author out of the mini-program response', () => {
      const response = (service as any).formatMiniPost({
        id: 'post-1', userId: 'real-user-1', regionId: 'region-a', type: 'TEXT', status: 'PUBLISHED',
        content: '匿名内容', isAnonymous: true, anonymousIdentityId: 'anonymous-a',
        anonymousName: '树洞同学', anonymousAvatar: '/a.png',
        user: { id: 'real-user-1', nickname: '真实姓名', avatar: '/real.png' }, media: [], topics: [],
      });

      expect(response).toMatchObject({ userId: '', user_id: '', nickname: '树洞同学', isAnonymous: true });
      expect(JSON.stringify(response)).not.toContain('real-user-1');
      expect(JSON.stringify(response)).not.toContain('真实姓名');
    });
  });

  it('keeps malformed angle-bracket text inert in generated cover summaries', () => {
    expect((service as any).compactCoverText('A <broken value> B', 72)).toBe('A ＜broken value＞ B');
  });
});
