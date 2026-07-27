import { poolErrandProjection, publicErrandProjection } from './errand-privacy';

describe('errand privacy projections', () => {
  const orderWithSecrets = {
    id: 'order-1',
    order_no: 'ERR-1',
    service_type: 'express_pickup',
    raw_status: 'pending_accept',
    region_id: 'region-1',
    delivery_address: '1号宿舍楼 308室',
    delivery_contact: '张同学',
    delivery_phone: '13800138000',
    pickup_address: '东门菜鸟驿站 3号柜',
    latitude: 30.123,
    longitude: 120.456,
    total_amount: '8.00',
    details: [{ code: 'PICKUP-8899', pickup_code: 'PICKUP-8899', description: '文件' }],
    tasks: [{ code: 'PICKUP-8899' }],
    user: { id: 'user-1', phone: '13800138000' },
    rider: { id: 'rider-1', phone: '13900139000' },
  };

  it('never exposes contact data or pickup code in a pool order', () => {
    const value = poolErrandProjection(orderWithSecrets);
    const serialized = JSON.stringify(value);

    expect(serialized).not.toContain('13800138000');
    expect(serialized).not.toContain('PICKUP-8899');
    expect(serialized).not.toContain('30.123');
    expect(value).not.toHaveProperty('delivery_phone');
  });

  it('keeps the public completed feed anonymous and coarse', () => {
    const value = publicErrandProjection({ ...orderWithSecrets, raw_status: 'completed' });
    const serialized = JSON.stringify(value);

    expect(value).toMatchObject({ service_type: 'express_pickup', status: 'completed' });
    expect(serialized).not.toContain('张同学');
    expect(serialized).not.toContain('宿舍楼');
    expect(serialized).not.toContain('user-1');
  });
});
