import { RiderAppController } from './rider-app.controller';

describe('RiderAppController', () => {
  it('passes client context to phone code and login operations', async () => {
    const service = {
      sendPhoneCode: jest.fn().mockResolvedValue({ success: true }),
      loginPhone: jest.fn().mockResolvedValue({ token: 'token', allowed: true }),
    };
    const controller = new RiderAppController(service as any);
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

  it('returns the current authenticated rider session', async () => {
    const service = { getSession: jest.fn().mockResolvedValue({ allowed: true }) };
    const controller = new RiderAppController(service as any);

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
    const controller = new RiderAppController(service as any);

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
    const controller = new RiderAppController(service as any);
    const dto = { type: 'address_issue', description: '地址信息有误' };

    await controller.reportException('order-1', 'user-1', dto);

    expect(service.reportException).toHaveBeenCalledWith('user-1', 'order-1', dto);
  });
});
