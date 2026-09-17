import { poolErrandProjection, poolShopProjection, publicErrandProjection } from './errand-privacy';

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
    delivery_time: '2026-08-29T10:30:00.000Z',
    fallback_to_rider_enabled: true,
    fallback_release_at: '2026-08-29T10:20:00.000Z',
    receiver_settlement_note: '兜底单，按原价结算',
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
    expect(value).toEqual(expect.objectContaining({
      delivery_time: '2026-08-29T10:30:00.000Z',
      fallback_to_rider_enabled: true,
      receiver_settlement_note: '兜底单，按原价结算',
    }));
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


describe('shop pending-pool privacy', () => {
  it('retains the public pickup and delivery fee while hiding buyer identity, room, and contents', () => {
    const projected = poolShopProjection({
      id: 'shop-1', type: 'delivery', merchant_name: '一食堂', merchant_address: '东门商业街',
      delivery_address: '女生宿舍 308室', delivery_phone: '13800138000', delivery_contact: '张同学',
      user: { id: 'private-user', nickname: 'private-nickname' },
      delivery_latitude: 30.123, delivery_longitude: 120.456,
      details: [{ description: 'private-goods' }], remarks: 'private-remark',
      platform_delivery_fee: '3.00', receipt_code: '123456', total_amount: '20.00',
      pickup_latitude: 29.5, pickup_longitude: 106.5,
    })
    expect(projected).toMatchObject({ id: 'shop-1', merchant_name: '一食堂', platform_delivery_fee: '3.00', task_count: 1, total_amount: '20.00', latitude: 29.5, longitude: 106.5 })
    for (const secret of ['308', '13800138000', '张同学', 'private-', '30.123', '123456']) {
      expect(JSON.stringify(projected)).not.toContain(secret)
    }
  })
})
