import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PostController } from './post.controller';
import { PostService } from './post.service';
import { JwtGuard } from '../../guards/jwt.guard';
import { OptionalAuthGuard } from '../../guards/optional-auth.guard';
import { TransformInterceptor } from '../../interceptors/transform.interceptor';
import { getMiniProgramGlobalPrefixExcludes, miniProgramApiCompatMiddleware } from '../../common/middleware/mini-program-api-compat';

describe('post vote routes behind the mini-program API proxy', () => {
  let app: INestApplication;
  const stats = { totalVotes: 0, options: [] };
  const service = { getVoteStats: jest.fn(async () => stats), getVoteMeta: jest.fn(async (_post: string, user?: string) => ({ user_votes: user ? ['o1'] : [] })), vote: jest.fn(), unvote: jest.fn(), createVoteOptions: jest.fn(), upsertVoteSettings: jest.fn() };
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [PostController], providers: [{ provide: PostService, useValue: service }] })
      .overrideGuard(JwtGuard).useValue({ canActivate: () => { throw new UnauthorizedException(); } })
      .overrideGuard(OptionalAuthGuard).useValue({ canActivate: (ctx: any) => { const req = ctx.switchToHttp().getRequest(); if (req.headers.authorization === 'Bearer session') req.user = { sub: 'u1' }; return true; } }).compile();
    app = module.createNestApplication();
    app.use(miniProgramApiCompatMiddleware);
    app.useGlobalInterceptors(new TransformInterceptor());
    app.setGlobalPrefix('/api/v1', { exclude: [...getMiniProgramGlobalPrefixExcludes(), 'api/{*path}'] });
    await app.init();
  });
  afterAll(async () => { await app.close(); });
  it.each(['/post-votes', '/api/post-votes'])('serves public statistics and guest metadata at %s without response nesting', async prefix => {
    const res = await request(app.getHttpServer()).get(`${prefix}/stats`).query({ post_id: 'p1' }).expect(200);
    expect(res.body).toEqual(stats);
    const meta = await request(app.getHttpServer()).get(`${prefix}/meta`).query({ post_id: 'p1' }).expect(200);
    expect(meta.body).toEqual({ user_votes: [] });
    expect(service.getVoteStats).toHaveBeenLastCalledWith('p1');
    await request(app.getHttpServer()).get(`${prefix}/meta`).query({ post_id: 'p1' }).set('Authorization','Bearer session').expect(200);
    expect(service.getVoteMeta).toHaveBeenLastCalledWith('p1','u1');
  });
  it.each(['/post-votes', '/api/post-votes'])('keeps every write route protected at %s', async prefix => {
    for (const suffix of ['vote','unvote','create-options','settings/upsert']) {
      await request(app.getHttpServer()).post(`${prefix}/${suffix}`).send({ post_id:'p1' }).expect(401);
    }
    for (const method of ['vote','unvote','createVoteOptions','upsertVoteSettings'] as const) expect(service[method]).not.toHaveBeenCalled();
  });
  it('preserves the empty metadata response for a post without a poll', async () => {
    service.getVoteMeta.mockResolvedValueOnce(null as any);
    const response = await request(app.getHttpServer()).get('/post-votes/meta').query({ post_id:'plain-post' }).expect(200);
    expect(response.text).toBe('');
  });
});
