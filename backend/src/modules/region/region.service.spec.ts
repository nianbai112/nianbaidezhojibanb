import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { RegionService } from './region.service';

const createPrismaMock = () => ({
  region: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  noteSettings: {
    findUnique: jest.fn(),
  },
  secondHandRegionSetting: {
    findUnique: jest.fn(),
  },
  errandConfig: {
    findUnique: jest.fn(),
  },
});

describe('RegionService.updateManagerSettings', () => {
  it('allows the bound region manager user to update mini-program region settings', async () => {
    const prisma = createPrismaMock();
    prisma.region.findUnique.mockResolvedValue({
      id: 'region-1',
      managerUserId: 'user-1',
      settings: {},
    });
    prisma.region.update.mockResolvedValue({
      id: 'region-1',
      name: '新区域',
      managerUserId: 'user-1',
      settings: {},
    });
    const service = new RegionService(prisma as any);

    await service.updateManagerSettings('region-1', 'user-1', {
      name: '新区域',
      manager_name: '负责人',
      manager_phone: '13800000000',
      status: 1,
      show_carousel: 0,
      latitude: '30.1',
      longitude: '120.2',
    });

    expect(prisma.region.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'region-1' },
      data: expect.objectContaining({
        name: '新区域',
        managerName: '负责人',
        managerPhone: '13800000000',
        isOpen: true,
        showCarousel: false,
        latitude: 30.1,
        longitude: 120.2,
      }),
    }));
  });

  it('rejects users who are not the region manager', async () => {
    const prisma = createPrismaMock();
    prisma.region.findUnique.mockResolvedValue({
      id: 'region-1',
      managerUserId: 'manager-user',
    });
    const service = new RegionService(prisma as any);

    await expect(service.updateManagerSettings('region-1', 'other-user', {}))
      .rejects.toThrow(ForbiddenException);
  });

  it('rejects missing regions', async () => {
    const prisma = createPrismaMock();
    prisma.region.findUnique.mockResolvedValue(null);
    const service = new RegionService(prisma as any);

    await expect(service.updateManagerSettings('region-1', 'user-1', {}))
      .rejects.toThrow(NotFoundException);
  });
});

describe('RegionService publish presentation', () => {
  it('returns regional publish decoration without changing the errand business switch', async () => {
    const prisma = createPrismaMock();
    prisma.noteSettings.findUnique.mockResolvedValue({ allowTextNote: true });
    prisma.secondHandRegionSetting.findUnique.mockResolvedValue({ enableSecondHand: true });
    prisma.errandConfig.findUnique.mockResolvedValue({ isOpen: false });
    prisma.region.findUnique.mockResolvedValue({
      settings: {
        publishMenu: {
          title: '今天想分享什么？',
          heroImage: 'https://cdn.example.com/hero.png',
          entries: {
            note: {
              title: '发校园笔记',
              image: 'https://cdn.example.com/note.png',
            },
          },
        },
      },
    });
    const service = new RegionService(prisma as any);

    const result = await (service as any).getPublishConfig('region-1');

    expect(result.publishMenu).toMatchObject({
      title: '今天想分享什么？',
      heroImage: 'https://cdn.example.com/hero.png',
      entries: {
        note: {
          title: '发校园笔记',
          image: 'https://cdn.example.com/note.png',
        },
      },
    });
    expect(result.errandServiceEnabled).toBe(false);
  });
});
