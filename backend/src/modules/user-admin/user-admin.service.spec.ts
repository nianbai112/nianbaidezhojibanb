import { BadRequestException } from '@nestjs/common';
import { UserAdminService } from './user-admin.service';

describe('UserAdminService growth experience', () => {
  const createService = () => {
    const prisma: any = {
      adminOperationLog: { create: jest.fn().mockResolvedValue({}) },
      userExperience: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const redis: any = {
      delPattern: jest.fn().mockResolvedValue(undefined),
      getLock: jest.fn().mockResolvedValue(true),
      releaseLock: jest.fn().mockResolvedValue(undefined),
    };
    const growthService: any = {
      awardExperience: jest.fn().mockResolvedValue({
        record: { id: 'exp1' },
        currentExp: 25,
        currentLevel: { levelName: '区域新芽' },
      }),
    };
    return { service: new UserAdminService(prisma, redis, growthService), prisma, growthService };
  };

  it('requires a real region when manually adjusting experience', async () => {
    const { service, growthService } = createService();

    await expect(service.addExperience({
      userId: 'u1',
      changeAmount: 10,
      reason: '运营奖励',
    } as any, 'admin-1')).rejects.toBeInstanceOf(BadRequestException);

    expect(growthService.awardExperience).not.toHaveBeenCalled();
  });

  it('passes the selected region to the growth ledger when manually adjusting experience', async () => {
    const { service, growthService } = createService();

    await service.addExperience({
      userId: 'u1',
      regionId: 'region-a',
      changeAmount: 10,
      reason: '运营奖励',
    } as any, 'admin-1', '127.0.0.1');

    expect(growthService.awardExperience).toHaveBeenCalledWith({
      userId: 'u1',
      regionId: 'region-a',
      amount: 10,
      reason: '运营奖励',
      source: 'admin_adjust',
    });
  });

  it('filters experience records by region', async () => {
    const { service, prisma } = createService();

    await service.getExperienceList({ regionId: 'region-a', page: 1, pageSize: 20 } as any);

    expect(prisma.userExperience.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { regionId: 'region-a' },
    }));
    expect(prisma.userExperience.count).toHaveBeenCalledWith({
      where: { regionId: 'region-a' },
    });
  });
});
