import { ShopService } from './shop.service';
import { ForbiddenException } from '@nestjs/common';

describe('region merchant business-state synchronization', () => {
  const create = () => {
    const rows = ['approved', 'closed', 'pending', 'rejected'].map((status, index) => ({ id: String(index), regionId: 'region-a', status }));
    const prisma = { region: { findUnique: jest.fn().mockResolvedValue({ managerUserId: 'manager' }) }, merchant: { updateMany: jest.fn(async ({ where, data }) => { let count = 0; for (const row of rows) if (row.regionId === where.regionId && (!where.status || where.status.in.includes(row.status))) { Object.assign(row, data); count++; } return { count }; }) } };
    return { rows, prisma, service: new ShopService(prisma as any, {} as any, {} as any) };
  };
  it('cannot approve pending/rejected merchants while synchronizing open state', async () => {
    const { service, rows, prisma } = create();
    await expect(service.syncToRegion('region-a', 'manager', { is_open: 0 })).resolves.toEqual({ success: true, updated: 2 });
    expect(rows.map(row => row.status)).toEqual(['approved', 'approved', 'pending', 'rejected']);
    expect(prisma.merchant.updateMany).toHaveBeenCalledWith({ where: { regionId: 'region-a', status: { in: ['approved', 'closed'] } }, data: { status: 'approved' } });
  });
  it('does not rewrite rejected or pending state when closing a campus', async () => {
    const { service, rows } = create(); await service.syncToRegion('region-a', 'manager', { is_open: 1 });
    expect(rows.map(row => row.status)).toEqual(['closed', 'closed', 'pending', 'rejected']);
  });
  it('retains region manager permission and rejects malformed schedules before writes', async () => {
    const { service, prisma } = create();
    await expect(service.syncToRegion('region-a', 'ordinary', { is_open: 0 })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.syncToRegion('region-a', 'manager', { business_hours: '25:00-26:00' })).rejects.toThrow();
    expect(prisma.merchant.updateMany).not.toHaveBeenCalled();
  });
});
