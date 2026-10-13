import { AddressService } from './address.service';

const payload = (extra: Record<string, unknown> = {}) => ({ contact: '合成测试联系人', phone: '13800000000', full_address: '合成测试地址', region_id: 'campus-b', is_default: true, ...extra });
const current = { id: 'address-a', userId: 'owner', name: '原联系人', phone: '13800000000', detail: '旧校区', fullAddress: '旧校区', regionId: 'campus-a', latitude: null, longitude: null, isDefault: false };
function setup(row: any = current) {
  const tx: any = { address: {
    findUnique: jest.fn().mockResolvedValue(row),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    create: jest.fn(async ({ data }) => ({ id: 'created', ...data })),
    update: jest.fn(async ({ data }) => ({ ...row, ...data })),
  } };
  // Root delegates deliberately fail: ownership reads and writes must use the transaction client.
  const outside = jest.fn(() => { throw new Error('address operation escaped transaction'); });
  const prisma: any = { address: { findUnique: outside, updateMany: outside, create: outside, update: outside },
    $transaction: jest.fn(async (work) => work(tx)),
  };
  return { tx, prisma, service: new AddressService(prisma) };
}

describe('用户全局默认地址事务', () => {
  test('新增与修改均在 Serializable 事务内清旧默认并写入，不按校区缩小默认范围', async () => {
    const { tx, prisma, service } = setup();
    await expect(service.addAddress('owner', payload())).resolves.toMatchObject({ is_default: true, regionId: 'campus-b' });
    await expect(service.updateAddress('address-a', 'owner', { is_default: true, region_id: 'campus-b' })).resolves.toMatchObject({ is_default: true, regionId: 'campus-b' });
    expect(tx.address.updateMany.mock.calls).toEqual([
      [{ where: { userId: 'owner' }, data: { isDefault: false } }],
      [{ where: { userId: 'owner' }, data: { isDefault: false } }],
    ]);
    for (const call of prisma.$transaction.mock.calls) expect(call[1]).toEqual({ isolationLevel: 'Serializable', maxWait: 5000, timeout: 10000 });
    expect(prisma.address.create).not.toHaveBeenCalled();
  });
  test.each([null, { ...current, userId: 'someone-else' }])('不存在或异账号地址不能清默认或写入 %p', async (row) => {
    const { tx, prisma, service } = setup(row);
    await expect(service.updateAddress('address-a', 'owner', { is_default: true })).rejects.toThrow('地址不存在');
    expect(tx.address.updateMany).not.toHaveBeenCalled();
    expect(tx.address.update).not.toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
  test('提交冲突会完整重试并重新读取字段，不能复用上次联系人和默认状态', async () => {
    const { tx, prisma, service } = setup();
    tx.address.findUnique.mockResolvedValueOnce({ ...current, isDefault: true })
      .mockResolvedValueOnce({ ...current, name: '并发已修改的联系人', isDefault: false });
    let attempt = 0;
    prisma.$transaction.mockImplementation(async (work: (transaction: any) => Promise<any>) => {
      const saved = await work(tx);
      if (++attempt === 1) throw Object.assign(new Error('serialization conflict'), { code: 'P2034' });
      return saved;
    });
    await expect(service.updateAddress('address-a', 'owner', { phone: '13900000000' })).resolves.toMatchObject({ name: '并发已修改的联系人', phone: '13900000000', is_default: false });
    expect(tx.address.findUnique).toHaveBeenCalledTimes(2);
    expect(tx.address.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });
  test('新增的死锁/序列化冲突最多尝试三次，最后一次成功可正常返回', async () => {
    const { tx, prisma, service } = setup();
    const conflict = Object.assign(new Error('serialization conflict'), { code: 'P2034' });
    tx.address.create.mockRejectedValueOnce(conflict).mockRejectedValueOnce(conflict);
    await expect(service.addAddress('owner', payload())).resolves.toMatchObject({ id: 'created', is_default: true });
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
    expect(tx.address.updateMany).toHaveBeenCalledTimes(3);
  });
  test('超过三次事务冲突返回可重试的 409，不无限循环', async () => {
    const { tx, prisma, service } = setup();
    tx.address.create.mockRejectedValue(Object.assign(new Error('serialization conflict'), { code: 'P2034' }));
    try { await service.addAddress('owner', payload()); throw new Error('expected conflict'); }
    catch (error) {
      expect(error.getStatus()).toBe(409);
      expect(error.getResponse()).toMatchObject({ code: 'ADDRESS_CONCURRENT_UPDATE' });
    }
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
  });
  test('其他数据库错误立即透传，不能重试可能已经完成的业务写入', async () => {
    const { tx, prisma, service } = setup();
    const failed = Object.assign(new Error('write failed'), { code: 'P2003' });
    tx.address.create.mockRejectedValue(failed);
    await expect(service.addAddress('owner', payload())).rejects.toBe(failed);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
  test('普通地址新增和取消默认不清除其他地址的默认值', async () => {
    const { tx, service } = setup({ ...current, isDefault: true });
    await service.addAddress('owner', payload({ is_default: false }));
    await service.updateAddress('address-a', 'owner', { is_default: false });
    expect(tx.address.updateMany).not.toHaveBeenCalled();
    expect(tx.address.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ isDefault: false }) }));
  });
});
