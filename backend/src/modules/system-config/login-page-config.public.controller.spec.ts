import { LoginPageConfigPublicController } from './system-config.controller';

describe('LoginPageConfigPublicController', () => {
  it('exposes the login page visual config without an admin session', async () => {
    const service = { getLoginPageConfig: jest.fn().mockResolvedValue({ success: true, data: { heroMode: 'image' } }) };
    const controller = new LoginPageConfigPublicController(service as any);

    await expect(controller.getLoginPageConfig()).resolves.toEqual({ success: true, data: { heroMode: 'image' } });
    expect(service.getLoginPageConfig).toHaveBeenCalledTimes(1);
  });
});
