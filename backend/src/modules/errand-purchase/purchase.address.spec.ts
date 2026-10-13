import { PurchaseService } from './purchase.service';

function setup(latitude: any = null, longitude: any = null) {
  const address = { id: 'address', userId: 'user', regionId: 'school', name: '测试同学', phone: '13800000000', fullAddress: '测试大学东校区 测试大学东校区', dormitoryNumber: '2栋503', latitude, longitude };
  const shop = { id: 'shop', regionId: 'school', name: '茶店', address: '校内茶店', phone: '', latitude: 30, longitude: 106, enabled: true, opensAt: '00:00', closesAt: '00:00', version: 1 };
  const db: any = {
    config: { findUnique: jest.fn().mockResolvedValue({ value: { enabled: true } }) },
    region: { findUnique: jest.fn().mockResolvedValue({ isOpen: true }) },
    address: { findFirst: jest.fn().mockResolvedValue(address) },
    purchaseSku: { findMany: jest.fn().mockResolvedValue([{ id: 'sku', name: '霸王桶', priceCents: 590, weightGrams: 500, product: { id: 'product', name: '柠檬茶', shopId: 'shop', enabled: true, shop } }]) },
    purchaseModifierGroup: { findMany: jest.fn().mockResolvedValue([]) },
    purchaseCombination: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const access: any = { assertStudentProtectedAction: jest.fn() };
  return { db, address, service: new PurchaseService(db, access, {} as any, {} as any, {} as any, {} as any), body: { regionId: 'school', addressId: 'address', items: [{ skuId: 'sku', quantity: 1 }] } };
}

describe('代买地址报价门槛', () => {
  test.each([[null, null], [null, 106], [91, 106], [30, 181], ['30', 106]])('缺少有效地图坐标时拒绝报价，不用学校中心点兜底 (%p,%p)', async (lat, lng) => {
    const { db, service, body } = setup(lat, lng);
    await expect(service.quote('user', body)).rejects.toThrow('收货地址缺少有效地图位置');
    expect(db.purchaseSku.findMany).not.toHaveBeenCalled();
    expect(db.address.findFirst).toHaveBeenCalledWith({ where: { id: 'address', userId: 'user', regionId: 'school' } });
  });
  test('同一旧地址补齐坐标后可以报价，地址快照没有重复学校名', async () => {
    const { service, body, address } = setup();
    await expect(service.quote('user', body)).rejects.toThrow('地图位置');
    address.latitude = 30; address.longitude = 106;
    const result = await service.quote('user', body);
    expect(result.address).toMatchObject({ id: 'address', address: '测试大学东校区 2栋503', latitude: 30, longitude: 106 });
    expect(result.goodsCents).toBe(590);
    expect(result.fees.distanceMeters).toBe(0);
    expect(result.totalCents).toBeGreaterThanOrEqual(result.goodsCents);
    expect(result.quoteHash).toBeTruthy();
  });
  test('不接受用户提交的坐标覆盖存储中的无效收货地址', async () => {
    const { service, body } = setup();
    await expect(service.quote('user', { ...body, latitude: 30, longitude: 106 })).rejects.toThrow('地图位置');
  });
});
