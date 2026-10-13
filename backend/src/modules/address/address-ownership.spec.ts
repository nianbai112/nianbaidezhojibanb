import { AddressService } from './address.service';
import { AddressController } from './address.controller';

describe('address detail ownership', () => {
  it('scopes both private address IDs and specified-address aliases to the current user', async () => {
    const privateAddress = { id: 'private', userId: 'owner', specifiedAddressId: 'shared-building', fullAddress: '女生宿舍 301' };
    const prisma: any = {
      address: { findFirst: jest.fn(async ({ where }) => where.userId === privateAddress.userId ? privateAddress : null) },
      region: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const service = new AddressService(prisma);
    for (const id of ['private', 'shared-building']) {
      await expect(service.getDetail(id, 'stranger')).rejects.toThrow('地址不存在');
      expect(prisma.address.findFirst).toHaveBeenCalledWith({ where: { id, userId: 'stranger' } });
      expect(prisma.address.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({ where: { userId: 'stranger', specifiedAddressId: id } }));
    }
    await expect(service.getDetail('private', 'owner')).resolves.toMatchObject({ data: { second_level_address: '301' } });
  });

  it('prefers an exact owned address ID over another address using it as an alias', async () => {
    const prisma: any = { address: { findFirst: jest.fn().mockResolvedValue({ id: 'exact', fullAddress: '宿舍 101' }) } };
    await expect(new AddressService(prisma).getDetail('exact', 'owner')).resolves.toMatchObject({ data: { second_level_address: '101' } });
    expect(prisma.address.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.address.findFirst).toHaveBeenCalledWith({ where: { id: 'exact', userId: 'owner' } });
  });

  it('keeps public region-address selection and fails closed when the private lookup fails', async () => {
    const prisma: any = { address: { findFirst: jest.fn().mockResolvedValue(null) }, region: { findUnique: jest.fn().mockResolvedValue({ id: 'campus', name: '测试学校', address: '校园公共地址' }) } };
    const service = new AddressService(prisma);
    await expect(service.getDetail('campus', 'owner')).resolves.toMatchObject({ data: { id: 'campus' } });
    prisma.region.findUnique.mockClear();
    prisma.address.findFirst.mockRejectedValue(new Error('database unavailable'));
    await expect(service.getDetail('campus', 'owner')).rejects.toThrow('database unavailable');
    expect(prisma.region.findUnique).not.toHaveBeenCalled();
  });

  it('passes the authenticated user into the service instead of trusting the address ID alone', async () => {
    const service: any = { getDetail: jest.fn() };
    await new AddressController(service, {} as any).getSpecifiedDetail('private', 'owner');
    expect(service.getDetail).toHaveBeenCalledWith('private', 'owner');
  });
});
