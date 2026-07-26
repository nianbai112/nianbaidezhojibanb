import { SystemConfigService } from './system-config.service';

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
});
