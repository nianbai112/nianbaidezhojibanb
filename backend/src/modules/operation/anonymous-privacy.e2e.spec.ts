import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../common/services/prisma.service';
import { AiRuntimeService } from '../ai-runtime/ai-runtime.service';
import { GrowthService } from '../growth/growth.service';
import { MembershipService } from '../membership/membership.service';
import { PaymentService } from '../payment/payment.service';
import { UserAccessPolicyService } from '../../common/services/user-access-policy.service';
import { JwtGuard } from '../../guards/jwt.guard';
import { OperationController } from './operation.controller';
import { OperationService } from './operation.service';

describe('Anonymous identity HTTP privacy flow', () => {
  let app: INestApplication;
  const prisma: any = {
    anonymousIdentity: {
      count: jest.fn().mockResolvedValue(1),
      findFirst: jest.fn().mockResolvedValue({ id: 'anonymous-a', regionId: 'region-a', name: '树洞同学', avatar: '/a.png' }),
    },
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [OperationController],
      providers: [
        OperationService,
        { provide: PrismaService, useValue: prisma },
        { provide: AiRuntimeService, useValue: {} },
        { provide: PaymentService, useValue: {} },
        { provide: MembershipService, useValue: {} },
        { provide: GrowthService, useValue: {} },
        { provide: UserAccessPolicyService, useValue: {} },
      ],
    }).overrideGuard(JwtGuard).useValue({ canActivate: () => true }).compile();
    app = module.createNestApplication();
    await app.listen(0, '127.0.0.1');
  });

  afterAll(async () => app?.close());

  it('serves only the requested regional pool through the mini-program endpoint', async () => {
    const address = app.getHttpServer().address();
    const response = await fetch(`http://127.0.0.1:${address.port}/AnonymousIdentity/random?region_id=region-a`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: 'anonymous-a', regionId: 'region-a', nickname: '树洞同学', avatar_url: '/a.png',
    });
    expect(prisma.anonymousIdentity.count).toHaveBeenCalledWith({ where: { regionId: 'region-a' } });
    expect(prisma.anonymousIdentity.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { regionId: 'region-a' },
    }));
  });
});
