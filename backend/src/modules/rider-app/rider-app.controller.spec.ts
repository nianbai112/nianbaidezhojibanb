import { RequestMethod } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AdminGuard, AdminPermissionGuard } from '../../guards/admin.guard';
import { JwtGuard } from '../../guards/jwt.guard';
import { RiderAppController } from './rider-app.controller';

describe('RiderAppController', () => {
  it('passes client context to phone code and login operations', async () => {
    const service = {
      sendPhoneCode: jest.fn().mockResolvedValue({ success: true }),
      loginPhone: jest.fn().mockResolvedValue({ token: 'token', allowed: true }),
    };
    const controller = new RiderAppController(service as any, {} as any);
    const req = {
      ip: '127.0.0.1',
      headers: { 'user-agent': 'rider-app', 'x-forwarded-for': '203.0.113.8, 10.0.0.1' },
    } as any;

    await controller.sendPhoneCode({ phone: '13800138000' }, req);
    await controller.loginPhone({ phone: '13800138000', code: '123456' }, req);

    expect(service.sendPhoneCode).toHaveBeenCalledWith({ phone: '13800138000' }, '203.0.113.8');
    expect(service.loginPhone).toHaveBeenCalledWith(
      { phone: '13800138000', code: '123456' },
      '203.0.113.8',
      'rider-app',
    );
  });

  it('passes whitelisted password-login input and client context to the service', async () => {
    const service = {
      loginPassword: jest.fn().mockResolvedValue({ accessToken: 'token', allowed: true }),
    };
    const controller = new RiderAppController(service as any, {} as any);
    const dto = {
      username: 'campus.test',
      password: 'Campus2026!',
      device: { model: 'LM Phone', token: 'untrusted' },
    };
    const req = {
      ip: '127.0.0.1',
      headers: { 'user-agent': 'rider-app', 'x-forwarded-for': '203.0.113.8, 10.0.0.1' },
    } as any;

    await controller.loginPassword(dto, req);

    expect(service.loginPassword).toHaveBeenCalledWith(dto, '203.0.113.8', 'rider-app');
  });

  it('exposes password login as a five-per-minute throttled public route', () => {
    const handler = RiderAppController.prototype.loginPassword;

    expect(Reflect.getMetadata('path', handler)).toBe('rider-app/login/password');
    expect(Reflect.getMetadata('method', handler)).toBe(RequestMethod.POST);
    expect(Reflect.getMetadata('__guards__', handler)).toEqual([ThrottlerGuard]);
    expect(Reflect.getMetadata('THROTTLER:TTLauth', handler)).toBe(60000);
    expect(Reflect.getMetadata('THROTTLER:LIMITauth', handler)).toBe(5);
  });

  it('returns the current authenticated rider session', async () => {
    const service = { getSession: jest.fn().mockResolvedValue({ allowed: true }) };
    const controller = new RiderAppController(service as any, {} as any);

    await expect(controller.getSession('user-1')).resolves.toEqual({ allowed: true });
    expect(service.getSession).toHaveBeenCalledWith('user-1');
  });

  it('delegates order and location operations with the authenticated user id', async () => {
    const service = {
      getOrders: jest.fn().mockResolvedValue({ orders: [] }),
      acceptOrder: jest.fn().mockResolvedValue({ success: true }),
      updateLocation: jest.fn().mockResolvedValue({ success: true }),
      updateLocationBatch: jest.fn().mockResolvedValue({ success: true, accepted_client_ids: ['point-1'] }),
    };
    const controller = new RiderAppController(service as any, {} as any);

    await controller.getOrders('user-1', { status: 'accepted' });
    await controller.acceptOrder('order-1', 'user-1');
    await controller.updateLocation('user-1', { lat: 30, lng: 120 });
    await controller.updateLocationBatch('user-1', { points: [{ client_id: 'point-1' }] });

    expect(service.getOrders).toHaveBeenCalledWith('user-1', { status: 'accepted' });
    expect(service.acceptOrder).toHaveBeenCalledWith('user-1', 'order-1');
    expect(service.updateLocation).toHaveBeenCalledWith('user-1', { lat: 30, lng: 120 });
    expect(service.updateLocationBatch).toHaveBeenCalledWith('user-1', {
      points: [{ client_id: 'point-1' }],
    });
  });

  it('delegates delivery exception reports with the authenticated user id', async () => {
    const service = { reportException: jest.fn().mockResolvedValue({ success: true }) };
    const controller = new RiderAppController(service as any, {} as any);
    const dto = { type: 'address_issue', description: '地址信息有误' };

    await controller.reportException('order-1', 'user-1', dto);

    expect(service.reportException).toHaveBeenCalledWith('user-1', 'order-1', dto);
  });

  it('delegates password credential admin operations with admin and client context', async () => {
    const credential = {
      getSafeConfig: jest.fn().mockResolvedValue({ configured: false }),
      saveConfig: jest.fn().mockResolvedValue({ configured: true }),
      resetLock: jest.fn().mockResolvedValue({ configured: true }),
      listRiderOptions: jest.fn().mockResolvedValue([]),
    };
    const controller = new RiderAppController({} as any, credential as any);
    const req = {
      ip: '127.0.0.1',
      headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.2' },
    } as any;

    await controller.getPasswordLoginConfig();
    await controller.savePasswordLoginConfig({ username: 'campus.test' }, 'admin-1', req);
    await controller.resetPasswordLoginLock('admin-1', req);
    await controller.listPasswordLoginRiders('测试');

    expect(credential.getSafeConfig).toHaveBeenCalledTimes(1);
    expect(credential.saveConfig).toHaveBeenCalledWith({ username: 'campus.test' }, 'admin-1', '203.0.113.9');
    expect(credential.resetLock).toHaveBeenCalledWith('admin-1', '203.0.113.9');
    expect(credential.listRiderOptions).toHaveBeenCalledWith('测试');
  });

  it.each([
    ['getPasswordLoginConfig', 'admin/rider-app/password-login', RequestMethod.GET],
    ['savePasswordLoginConfig', 'admin/rider-app/password-login', RequestMethod.PUT],
    ['resetPasswordLoginLock', 'admin/rider-app/password-login/reset-lock', RequestMethod.POST],
    ['listPasswordLoginRiders', 'admin/rider-app/password-login/rider-options', RequestMethod.GET],
  ])('guards %s with rider-app config permission', (method, path, requestMethod) => {
    const handler = (RiderAppController.prototype as any)[method];
    expect(Reflect.getMetadata('path', handler)).toBe(path);
    expect(Reflect.getMetadata('method', handler)).toBe(requestMethod);
    expect(Reflect.getMetadata('__guards__', handler)).toEqual(expect.arrayContaining([JwtGuard, AdminGuard, AdminPermissionGuard]));
    expect(Reflect.getMetadata('admin_permissions', handler)).toEqual(['rider-app:config']);
  });
});
