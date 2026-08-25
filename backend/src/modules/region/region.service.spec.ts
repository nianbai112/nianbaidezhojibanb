import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { RegionService } from './region.service';

const createPrismaMock = () => ({
  region: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  regionContentItem: {
    findMany: jest.fn().mockResolvedValue([]),
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

  it('merges normalized stack flow style without overwriting other region settings', async () => {
    const prisma = createPrismaMock();
    const existingSettings = {
      features: { existing: true },
      stack_flow_style: { cardBg: '#111111', accentColor: '#222222' },
    };
    prisma.region.findUnique.mockResolvedValue({
      id: 'region-1',
      managerUserId: 'user-1',
      settings: existingSettings,
    });
    prisma.region.update.mockImplementation(async ({ data }: any) => ({
      id: 'region-1',
      managerUserId: 'user-1',
      settings: data.settings,
    }));
    const service = new RegionService(prisma as any);

    await service.updateManagerSettings('region-1', 'user-1', {
      stack_flow_style: {
        enabled: 0,
        card_bg: '#123456',
        paperBg: 'rgba(1,2,3,.4)',
      },
    });

    expect(prisma.region.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        settings: {
          features: { existing: true },
          stack_flow_style: {
            enabled: false,
            cardBg: '#123456',
            paperBg: 'rgba(1,2,3,.4)',
            accentColor: '#222222',
          },
        },
      }),
    }));
  });

  it('rejects unsafe stack flow colors before updating the region', async () => {
    const prisma = createPrismaMock();
    prisma.region.findUnique.mockResolvedValue({
      id: 'region-1',
      managerUserId: 'user-1',
      settings: {},
    });
    prisma.region.update.mockResolvedValue({
      id: 'region-1',
      managerUserId: 'user-1',
      settings: {},
    });
    const service = new RegionService(prisma as any);

    await expect(service.updateManagerSettings('region-1', 'user-1', {
      stackFlowStyle: { cardBg: 'red;position:fixed' },
    })).rejects.toThrow(BadRequestException);
    expect(prisma.region.update).not.toHaveBeenCalled();
  });
});

describe('RegionService stack flow detail', () => {
  it('returns the normalized stack flow style through all compatibility fields', async () => {
    const prisma = createPrismaMock();
    prisma.region.findUnique.mockResolvedValue({
      id: 'region-1',
      name: '测试区域',
      isOpen: true,
      settings: {
        features: { existing: true },
        stack_flow_style: {
          enabled: false,
          card_bg: '#123456',
          badgeBg: 'rgba(1,2,3,.4)',
        },
      },
    });
    const service = new RegionService(prisma as any);

    const result = await service.detail('region-1');

    const expected = {
      enabled: false,
      cardBg: '#123456',
      badgeBg: 'rgba(1,2,3,.4)',
    };
    expect(result.stack_flow_style).toEqual(expected);
    expect(result.stackFlowStyle).toEqual(expected);
    expect(result.settings.stack_flow_style).toEqual(expected);
    expect(result.settings.features).toEqual({ existing: true });
  });
});

describe('RegionService home navigation links', () => {
  it('builds every supported kingkong jump protocol from region configuration', async () => {
    const prisma = createPrismaMock();
    prisma.region.findUnique.mockResolvedValue({
      id: 'region-1',
      name: '测试区域',
      showCarousel: false,
      showAnnouncement: false,
      showKingkong: true,
      banners: [],
      notices: [],
      navs: [],
      homeNavLayoutConfig: [
        { id: 'internal', name: '校园地图', linkType: 'internal', path: 'campusMap/index/index', enabled: true },
        { id: 'web', name: '官网', linkType: 'webview', path: 'HTTPS://example.com', enabled: true },
        { id: 'legacy-web', name: '旧网页', linkType: 'web', path: 'https://legacy.example.com', enabled: true },
        { id: 'miniapp', name: '其他小程序', linkType: 'miniapp', appId: 'wx123', path: 'pages/home/index', query: 'from=home', enabled: true },
        { id: 'miniapp-half', name: '半屏小程序', linkType: 'miniapp_half', appId: 'wx456', path: 'pages/shop/index', enabled: true },
        { id: 'image', name: '查看大图', linkType: 'image', path: 'https://cdn.example.com/map.png', enabled: true },
        { id: 'tel', name: '拨打电话', linkType: 'tel', path: '13800138000', query: 'from=home', enabled: true },
        { id: 'none', name: '仅展示', linkType: 'none', path: '', enabled: true },
      ],
    });
    const service = new RegionService(prisma as any);

    const result = await service.getHomePageContent({ region_id: 'region-1', page: 1, limit: 20 });

    expect(result.items.map((item: any) => [item.id, item.link_url])).toEqual([
      ['internal', 'internal:campusMap/index/index'],
      ['web', 'https://example.com'],
      ['legacy-web', 'https://legacy.example.com'],
      ['miniapp', 'miniapp:wx123|pages/home/index?from=home'],
      ['miniapp-half', 'miniapp_half:wx456|pages/shop/index'],
      ['image', 'img:https://cdn.example.com/map.png'],
      ['tel', 'tel:13800138000'],
      ['none', ''],
    ]);
  });

  it('recovers kingkong entries from a legacy numeric-key object', async () => {
    const prisma = createPrismaMock();
    prisma.region.findUnique.mockResolvedValue({
      id: 'region-1',
      name: '测试区域',
      showCarousel: false,
      showAnnouncement: false,
      showKingkong: true,
      banners: [],
      notices: [],
      navs: [],
      homeNavLayoutConfig: {
        0: { id: 'run', name: '跑腿', linkType: 'internal', path: 'pages/tabbar/RunErrands/RunErrands', enabled: true },
        title: { text: '灵萌圈友' },
        showLayoutSwitch: true,
      },
    });
    const service = new RegionService(prisma as any);

    const result = await service.getHomePageContent({ region_id: 'region-1', page: 1, limit: 20 });

    expect(result.items).toEqual([
      expect.objectContaining({ id: 'run', title: '跑腿', link_url: 'internal:pages/tabbar/RunErrands/RunErrands' }),
    ]);
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
