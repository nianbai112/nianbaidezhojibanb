import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { OperationController } from './operation.controller';
import { OperationService } from './operation.service';
import { JwtGuard } from '../../guards/jwt.guard';
import { OptionalAuthGuard } from '../../guards/optional-auth.guard';
import { TransformInterceptor } from '../../interceptors/transform.interceptor';
import { getMiniProgramGlobalPrefixExcludes, miniProgramApiCompatMiddleware } from '../../common/middleware/mini-program-api-compat';

describe('public agreement routes behind the API proxy', () => {
  let app: INestApplication;
  const document = { id: 'policy-1', type: 'PRIVACY_POLICY', title: '隐私政策', content: '<p>已发布的测试正文</p>' };
  const service = { getAgreementDocument: jest.fn(async () => ({ code: 200, data: document })), acceptAgreement: jest.fn() };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [OperationController],
      providers: [{ provide: OperationService, useValue: service }],
    }).overrideGuard(JwtGuard).useValue({ canActivate: () => { throw new UnauthorizedException(); } })
      .overrideGuard(OptionalAuthGuard).useValue({ canActivate: () => true }).compile();
    app = module.createNestApplication();
    app.use(miniProgramApiCompatMiddleware);
    app.useGlobalInterceptors(new TransformInterceptor());
    app.setGlobalPrefix('/api/v1', { exclude: [...getMiniProgramGlobalPrefixExcludes(), 'api/{*path}'] });
    await app.init();
  });

  afterAll(async () => { await app?.close(); });

  it.each(['/agreements/PRIVACY_POLICY', '/api/agreements/PRIVACY_POLICY'])(
    'serves the published document anonymously at %s with the campus preserved', async path => {
      const response = await request(app.getHttpServer()).get(path).query({ region_id: 'campus-1' }).expect(200);
      expect(response.body.data).toEqual(document);
      expect(service.getAgreementDocument).toHaveBeenLastCalledWith('PRIVACY_POLICY', expect.objectContaining({ region_id: 'campus-1' }));
    },
  );

  it.each(['/agreements/consent', '/api/agreements/consent'])(
    'still requires login to record consent at %s', async path => {
      await request(app.getHttpServer()).post(path).send({ type: 'PRIVACY_POLICY' }).expect(401);
      expect(service.acceptAgreement).not.toHaveBeenCalled();
    },
  );
});
