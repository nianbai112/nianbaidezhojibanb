import { OperationService } from './operation.service';

describe('OperationService online growth signin', () => {
  it('honors a one-minute configuration after two server-confirmed heartbeats', async () => {
    const now = new Date();
    const tx: any = {
      punchInRecord: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'signin-1' }),
      },
      onlineSigninSession: { update: jest.fn().mockResolvedValue({}) },
      userExperience: { findFirst: jest.fn(), create: jest.fn() },
      userLevel: { findMany: jest.fn() },
      user: { findUnique: jest.fn() },
    };
    const prisma: any = {
      config: { findUnique: jest.fn().mockResolvedValue({ value: { online_minutes: 1, daily_base_exp: 5 } }) },
      punchInRecord: { findUnique: jest.fn().mockResolvedValue(null), findMany: jest.fn() },
      onlineSigninSession: {
        findUnique: jest.fn().mockResolvedValue({ id: 'session-1', accruedSeconds: 0, lastHeartbeatAt: new Date(now.getTime() - 60_000) }),
        upsert: jest.fn().mockResolvedValue({ id: 'session-1', accruedSeconds: 60 }),
      },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const growth = {
      awardExperience: jest.fn().mockResolvedValue({ currentExp: 100, progress: 100, currentLevel: { levelNumber: 2, levelName: '活跃同学' } }),
    };
    const service = new OperationService(prisma, {} as any, {} as any, {} as any, growth as any, {} as any);

    const result: any = await service.onlineSigninHeartbeat('region-a', 'user-a');

    expect(result.newly_completed).toBe(true);
    expect(result.reward.exp_earned).toBe(5);
    expect(growth.awardExperience).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-a',
      regionId: 'region-a',
      amount: 5,
      source: 'online_growth_signin',
      sourceId: 'signin-1',
    }), tx);
    expect(tx.onlineSigninSession.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ accruedSeconds: 60 }) }));
  });
});
