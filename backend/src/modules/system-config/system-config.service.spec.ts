import { SystemConfigService } from './system-config.service';

jest.mock('axios', () => ({ get: jest.fn() }));
const axios = require('axios');

describe('SystemConfigService storage config', () => {
  it('preserves existing COS secrets when masked fields are omitted by the admin UI', async () => {
    const prisma = {
      config: {
        findUnique: jest.fn().mockResolvedValue({
          value: {
            provider: 'cos',
            cos: {
              secretId: 'old-secret-id',
              secretKey: 'old-secret-key',
              bucket: 'old-bucket',
              region: 'ap-chongqing',
            },
          },
        }),
        upsert: jest.fn().mockResolvedValue({}),
      },
      adminOperationLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new SystemConfigService(prisma as any, {} as any);

    await service.saveStorageConfig({
      provider: 'cos',
      cos: {
        bucket: 'new-bucket',
        region: 'ap-shanghai',
      },
    }, 'admin-1', '127.0.0.1');

    expect(prisma.config.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({
        value: expect.objectContaining({
          cos: expect.objectContaining({
            secretId: 'old-secret-id',
            secretKey: 'old-secret-key',
            bucket: 'new-bucket',
            region: 'ap-shanghai',
          }),
        }),
      }),
    }));
  });

  it('stores a public login background config with video and poster', async () => {
    const prisma = {
      config: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({ value: {} }),
      },
      adminOperationLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new SystemConfigService(prisma as any, {} as any);

    await expect(service.saveLoginPageConfig({
      heroMode: 'video',
      heroImageUrl: 'https://cdn.example.com/login-poster.jpg',
      heroVideoUrl: 'https://cdn.example.com/login.mp4',
      featureTextList: ['校园社区', '互助帮忙'],
    }, 'admin-1', '127.0.0.1')).resolves.toMatchObject({ success: true });

    expect(prisma.config.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { key: 'login_page_config' },
      update: expect.objectContaining({
        value: expect.objectContaining({
          heroMode: 'video',
          heroImageUrl: 'https://cdn.example.com/login-poster.jpg',
          heroVideoUrl: 'https://cdn.example.com/login.mp4',
          featureTextList: ['校园社区', '互助帮忙'],
        }),
      }),
    }));
  });

  it('uses the configured Web service key for a walking distance query', async () => {
    const prisma = { config: { findUnique: jest.fn().mockResolvedValue({ value: { webServiceKey: 'amap-key' } }) } };
    axios.get.mockResolvedValue({ data: { status: '1', results: [{ distance: '680' }] } });
    const service = new SystemConfigService(prisma as any, {} as any);

    await expect(service.amapWalkingDistance(
      { longitude: 114, latitude: 30 }, { longitude: 114.01, latitude: 30.01 },
    )).resolves.toBe(680);
    expect(axios.get).toHaveBeenCalledWith('https://restapi.amap.com/v3/distance', expect.objectContaining({
      params: expect.objectContaining({ key: 'amap-key', type: 3, origins: '114,30', destination: '114.01,30.01' }),
    }));
  });
});
