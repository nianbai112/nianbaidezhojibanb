import { AddressService } from './address.service';
import { hasDeliveryCoordinates, joinAddressParts } from './address-location';

const payload = (extra: any = {}) => ({ contact: '测试同学', phone: '13800000000', full_address: '测试大学东校区 测试大学东校区', dormitory_number: '2栋503', region_id: 'school', specified_address_id: 'school', ...extra });
function setup(current: any = null) {
  const prisma: any = {
    address: {
      create: jest.fn(async ({ data }) => ({ id: 'saved', ...data })),
      findUnique: jest.fn().mockResolvedValue(current), update: jest.fn(async ({ data }) => ({ ...current, ...data })),
      updateMany: jest.fn(), findMany: jest.fn().mockResolvedValue(current ? [current] : []),
    },
    region: { findUnique: jest.fn().mockResolvedValue({ id: 'school', name: '测试大学东校区', address: '测试大学东校区' }) },
  };
  prisma.$transaction = jest.fn(async (work) => work(prisma));
  return { prisma, service: new AddressService(prisma) };
}

describe('收货地址地图位置', () => {
  test('代买地址缺少坐标时不写入，其他业务保留无坐标指定地址兼容', async () => {
    const { service, prisma } = setup();
    await expect(service.addAddress('user', payload({ require_location: true }))).rejects.toThrow('地图位置');
    expect(prisma.address.create).not.toHaveBeenCalled();
    await expect(service.addAddress('user', payload())).resolves.toMatchObject({ latitude: null, longitude: null });
  });
  test.each([
    { latitude: 91, longitude: 106 }, { latitude: 30, longitude: 181 },
    { latitude: 'bad', longitude: 106 }, { latitude: true, longitude: 106 },
    { latitude: 30, longitude: null }, { latitude: ' ', longitude: 106 },
  ])('拒绝不完整或非法坐标 %p', async (coordinates) => {
    const { service, prisma } = setup();
    await expect(service.addAddress('user', payload(coordinates))).rejects.toThrow();
    expect(prisma.address.create).not.toHaveBeenCalled();
  });
  test('保存实际地图坐标、清理重复地址，合法的零坐标不会被当成空值', async () => {
    const { service, prisma } = setup();
    const saved = await service.addAddress('user', payload({ latitude: '0', longitude: '106', require_location: true }));
    expect(saved).toMatchObject({ full_address: '测试大学东校区', detail: '测试大学东校区 2栋503', latitude: 0, longitude: 106 });
    expect(prisma.address.create.mock.calls[0][0].data.latitude).toBe(0);
    expect(hasDeliveryCoordinates(saved)).toBe(true);
  });
  test('给旧地址补坐标后保留联系人、门牌和区域，并支持显式取消指定地址关联', async () => {
    const current = { id: 'old', userId: 'user', name: '测试同学', phone: '13800000000', fullAddress: '测试大学东校区', dormitoryNumber: '2栋503', regionId: 'school', specifiedAddressId: 'school', latitude: null, longitude: null };
    const { service } = setup(current);
    await expect(service.updateAddress('old', 'user', { latitude: 30, longitude: 106, require_location: true, specified_address_id: null })).resolves.toMatchObject({ id: 'old', latitude: 30, longitude: 106, regionId: 'school', name: '测试同学', dormitory_number: '2栋503', specified_address_id: null });
    await expect(service.updateAddress('old', 'other', { latitude: 30, longitude: 106 })).rejects.toThrow('地址不存在');
  });
  test('读取旧重复地址和三级地址时不会重复拼接学校名称', async () => {
    const { service } = setup({ id: 'old', userId: 'user', fullAddress: '测试大学东校区 测试大学东校区', dormitoryNumber: '2栋503', specifiedAddressId: 'school' });
    const result = await service.getAddresses('user', 'school');
    expect(result.addresses[0].full_address).toBe('测试大学东校区');
    expect(result.addresses[0].specified_address?.third_level_address).toBe('');
    expect(result.specified_addresses[0].children[0].children[0].full_address).toBe('测试大学东校区');
    expect(joinAddressParts(['1栋', '11栋', '101', '1101'])).toBe('1栋 11栋 101 1101');
    expect(joinAddressParts(['1 号楼 1 单元 101 室'])).toBe('1 号楼 1 单元 101 室');
  });
});
