import { SearchService } from './search.service';

describe('SearchService', () => {
  const createPrisma = () => ({
    post: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    user: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
  });

  it('builds provider-safe text filters for post search', (done) => {
    const prisma = createPrisma();
    const service = new SearchService(prisma as any);

    (service.globalSearch({ keyword: '云', type: 'posts', page: 1, limit: 10 }) as any).then(() => {
      const where = (prisma.post.findMany.mock.calls as any)[0][0].where;
      expect(where.OR).toEqual([
        { title: { contains: '云' } },
        { content: { contains: '云' } },
      ]);
      expect(where.OR[0].title).not.toHaveProperty('mode');
      expect(where.OR[1].content).not.toHaveProperty('mode');
      done();
    }).catch(done);
  });

  it('applies real post filters for sort, content type, and publish time', (done) => {
    const prisma = createPrisma();
    const service = new SearchService(prisma as any);

    (service.globalSearch({
      keyword: '云',
      type: 'posts',
      page: 1,
      limit: 10,
      sort: 'likes',
      content_type: 'video',
      publish_time: 'week',
    }) as any).then(() => {
      const args = (prisma.post.findMany.mock.calls as any)[0][0];
      expect(args.where.type).toBe('VIDEO');
      expect(args.where.createdAt.gte).toBeInstanceOf(Date);
      expect(args.orderBy).toEqual([{ likeCount: 'desc' }, { createdAt: 'desc' }]);
      done();
    }).catch(done);
  });

  it('builds provider-safe nested filters for user search', (done) => {
    const prisma = createPrisma();
    const service = new SearchService(prisma as any);

    (service.globalSearch({ keyword: '云', type: 'users', page: 1, limit: 10 }) as any).then(() => {
      const where = (prisma.user.findMany.mock.calls as any)[0][0].where;
      expect(where.AND[0].OR).toEqual([
        { nickname: { contains: '云' } },
        { profile: { is: { bio: { contains: '云' } } } },
        { profile: { is: { school: { contains: '云' } } } },
        { profile: { is: { region: { contains: '云' } } } },
      ]);
      expect(where.AND[0].OR[0].nickname).not.toHaveProperty('mode');
      expect(where.AND[0].OR[1].profile.is.bio).not.toHaveProperty('mode');
      expect(where.AND[0].OR[2].profile.is.school).not.toHaveProperty('mode');
      expect(where.AND[0].OR[3].profile.is.region).not.toHaveProperty('mode');
      done();
    }).catch(done);
  });
});
