import { PATH_METADATA } from '@nestjs/common/constants';
import { LoginPageConfigPublicController, SystemConfigController } from './system-config.controller';

describe('LoginPageConfigPublicController', () => {
  it('exposes the login page visual config without an admin session', async () => {
    const service = { getLoginPageConfig: jest.fn().mockResolvedValue({ success: true, data: { heroMode: 'image' } }) };
    const controller = new LoginPageConfigPublicController(service as any);

    await expect(controller.getLoginPageConfig()).resolves.toEqual({ success: true, data: { heroMode: 'image' } });
    expect(service.getLoginPageConfig).toHaveBeenCalledTimes(1);
  });

  it('exposes the same all-user capability config through the public controller', async () => {
    const config = { enabled: true, allowGuestBrowsing: false, hideDelivery: true, placeholderText: '' };
    const service = { getAppReviewMode: jest.fn().mockResolvedValue({ success: true, data: config }) };
    const controller = new LoginPageConfigPublicController(service as any);

    await expect(controller.getPublicAppReviewMode()).resolves.toEqual({ success: true, data: config });
    expect(service.getAppReviewMode).toHaveBeenCalledTimes(1);
  });

  it('keeps legacy capability URLs while exposing the new all-user URLs', () => {
    expect(Reflect.getMetadata(
      PATH_METADATA,
      LoginPageConfigPublicController.prototype.getPublicAppReviewMode,
    )).toEqual(['platform/app-capabilities', 'platform/app-review-mode']);
    expect(Reflect.getMetadata(
      PATH_METADATA,
      SystemConfigController.prototype.getAppReviewMode,
    )).toEqual(['admin/config/app-capabilities', 'admin/config/app-review-mode']);
    expect(Reflect.getMetadata(
      PATH_METADATA,
      SystemConfigController.prototype.saveAppReviewMode,
    )).toEqual(['admin/config/app-capabilities', 'admin/config/app-review-mode']);
  });
});
