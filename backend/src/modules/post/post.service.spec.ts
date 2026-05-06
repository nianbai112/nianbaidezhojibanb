import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PostService } from './post.service';
import { PrismaService } from '../../common/services/prisma.service';
import { RedisService } from '../../common/services/redis.service';

const makeMockPrisma = () => ({
  post: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
    count: jest.fn().mockResolvedValue(0),
  },
  like: {
    upsert: jest.fn().mockResolvedValue({}),
    deleteMany: jest.fn().mockResolvedValue({}),
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
  },
  favorite: { findFirst: jest.fn().mockResolvedValue(null) },
  block: { upsert: jest.fn() },
  report: { create: jest.fn() },
  postCollaborator: {
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({}),
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
    createMany: jest.fn().mockResolvedValue({}),
  },
  postVoteRecord: {
    findMany: jest.fn().mockResolvedValue([]),
    upsert: jest.fn().mockResolvedValue({}),
    deleteMany: jest.fn().mockResolvedValue({}),
  },
});

const makeMockRedis = () => ({
  get: jest.fn(), set: jest.fn(), del: jest.fn(), incr: jest.fn(),
  expire: jest.fn(), getLock: jest.fn(), releaseLock: jest.fn(),
  lpush: jest.fn(), brpop: jest.fn(), hset: jest.fn(), hget: jest.fn(),
  hdel: jest.fn(), hgetall: jest.fn(), zadd: jest.fn(), zincrby: jest.fn().mockResolvedValue(undefined),
  zrevrange: jest.fn(), zrem: jest.fn(), getClient: jest.fn(),
});

describe('PostService', () => {
  let service: PostService;
  let prisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostService,
        { provide: PrismaService, useValue: makeMockPrisma() },
        { provide: RedisService, useValue: makeMockRedis() },
      ],
    }).compile();
    service = module.get<PostService>(PostService);
    prisma = module.get(PrismaService);
  });

  // ============ detail ============
  describe('detail', () => {
    it('should throw NotFoundException for missing post', async () => {
      await expect(service.detail('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  // ============ remove ============
  describe('remove', () => {
    it('should throw ForbiddenException for non-owner', async () => {
      prisma.post.findUnique.mockResolvedValue({ id: 'p1', userId: 'other' });
      await expect(service.remove('p1', 'me')).rejects.toThrow(ForbiddenException);
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
      prisma.postVote.findUnique.mockResolvedValue({ id: 'v1', post: { userId: 'u1' } });
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

  // ============ myCoCreatorInvites ============
  describe('myCoCreatorInvites', () => {
    it('should return paginated invites', async () => {
      prisma.postCollaborator.findMany.mockResolvedValue([
        { id: 'c1', postId: 'p1', userId: 'u1', createdAt: new Date(),
          post: { id: 'p1', title: 'Test', content: 'abc', user: { id: 'u2', nickname: 'A', avatar: null } } },
      ]);
      prisma.postCollaborator.count.mockResolvedValue(1);
      const result = await service.myCoCreatorInvites('u1', {});
      expect(result.list).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });
});
