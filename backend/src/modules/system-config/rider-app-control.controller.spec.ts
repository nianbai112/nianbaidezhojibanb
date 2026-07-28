import {
  RiderAppConfigPublicController,
  SystemConfigController,
} from './system-config.controller';

describe('rider App control controllers', () => {
  it('exposes the safe rider App bootstrap config without an admin session', async () => {
    const response = {
      success: true,
      data: {
        enabled: true,
        maintenance: { enabled: false },
        version: { latest: '1.0.0', minimum: '1.0.0' },
      },
    };
    const service = { getRiderAppControlConfig: jest.fn().mockResolvedValue(response) };
    const controller = new RiderAppConfigPublicController(service as any);

    await expect(controller.getConfig()).resolves.toEqual(response);
  });

  it('delegates an audited admin save with the current operator and IP', async () => {
    const service = {
      saveRiderAppControlConfig: jest.fn().mockResolvedValue({ success: true }),
    };
    const controller = new SystemConfigController(service as any, {} as any, {} as any);
    const dto = { enabled: false };

    await expect(controller.saveRiderAppControlConfig(
      dto,
      'admin-1',
      { ip: '127.0.0.1' } as any,
    )).resolves.toEqual({ success: true });
    expect(service.saveRiderAppControlConfig).toHaveBeenCalledWith(
      dto,
      'admin-1',
      '127.0.0.1',
    );
  });
});
