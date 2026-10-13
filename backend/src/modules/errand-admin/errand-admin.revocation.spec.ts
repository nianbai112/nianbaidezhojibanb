jest.mock('../errand/errand.service', () => ({ ErrandService: class {} }));

import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ErrandAdminService } from './errand-admin.service';
import { ErrandAdminController } from './errand-admin.controller';
import { AuditRiderDto, RevokeRiderDto } from './dto/errand-admin.dto';

function setup(overrides: any = {}) {
  let rider = {
    id: 'rider-row', userId: 'rider-user', regionId: 'region-a',
    verifyStatus: 'approved', riderType: 'official', status: 'online',
    balance: 123.45, totalOrders: 20, ...overrides,
  };
  const tx: any = {
    errandAssigneeMutex: { upsert: jest.fn().mockResolvedValue({}) },
    regionRider: {
      findUnique: jest.fn(async () => ({ ...rider })),
      updateMany: jest.fn(async ({ data }: any) => { rider = { ...rider, ...data }; return { count: 1 }; }),
      update: jest.fn(async ({ data }: any) => (rider = { ...rider, ...data })),
    },
    errandOrder: { count: jest.fn().mockResolvedValue(0) },
    order: { count: jest.fn().mockResolvedValue(0) },
    transferRequest: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    adminOperationLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma: any = {
    regionRider: { findUnique: jest.fn(async () => ({ ...rider })) },
    $transaction: jest.fn(async (fn: any) => {
      const before = { ...rider };
      try { return await fn(tx); } catch (error) { rider = before; throw error; }
    }),
  };
  const scope = { getAdminContext: jest.fn().mockResolvedValue({ isSuperAdmin: false, regionIds: ['region-a'] }) };
  return { service: new ErrandAdminService(prisma, scope as any), prisma, tx, scope, current: () => rider };
}

describe('rider certification revocation', () => {
  it('downgrades an approved rider, closes incoming transfers and records the reason atomically', async () => {
    const f = setup();
    await expect(f.service.revokeRider('rider-row', { reason: '  本人申请退出  ' }, 'admin-a')).resolves.toMatchObject({ success: true });
    expect(f.current()).toMatchObject({ verifyStatus: 'revoked', riderType: 'ordinary_user', status: 'offline', balance: 123.45, totalOrders: 20 });
    expect(f.tx.errandAssigneeMutex.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'rider-user' } }));
    expect(f.tx.errandAssigneeMutex.upsert.mock.invocationCallOrder[0]).toBeLessThan(f.tx.regionRider.findUnique.mock.invocationCallOrder[0]);
    expect(f.tx.transferRequest.updateMany).toHaveBeenCalledWith({ where: { toRiderId: 'rider-user', status: 'pending' }, data: { status: 'rejected' } });
    expect(f.tx.adminOperationLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      accountId: 'admin-a', action: 'REVOKE_RIDER', targetId: 'rider-row',
      detail: expect.objectContaining({ reason: '本人申请退出', before: { verifyStatus: 'approved', status: 'online', riderType: 'official' }, after: { verifyStatus: 'revoked', status: 'offline', riderType: 'ordinary_user' } }),
    }) });
  });

  it.each(['accepted', 'in_progress', 'arrived'])('blocks revocation while an errand is %s', async status => {
    const f = setup();
    f.tx.errandOrder.count.mockImplementation(async ({ where }: any) => where.riderId === 'rider-user' && where.status.in.includes(status) ? 1 : 0);
    await expect(f.service.revokeRider('rider-row', { reason: '退出' }, 'admin-a')).rejects.toThrow('未完成订单');
    expect(f.tx.regionRider.updateMany).not.toHaveBeenCalled();
  });

  it('blocks revocation while a takeaway order awaits completion', async () => {
    const f = setup();
    f.tx.order.count.mockImplementation(async ({ where }: any) => where.riderId === 'rider-user' && where.status === 'SHIPPED' ? 1 : 0);
    await expect(f.service.revokeRider('rider-row', { reason: '退出' }, 'admin-a')).rejects.toThrow('未完成订单');
    expect(f.tx.regionRider.updateMany).not.toHaveBeenCalled();
  });

  it.each(['pending', 'rejected', 'revoked', 'ordinary_user', 'banned'])('does not revoke a %s account', async verifyStatus => {
    const f = setup({ verifyStatus });
    await expect(f.service.revokeRider('rider-row', { reason: '退出' }, 'admin-a')).rejects.toThrow('仅已通过');
    expect(f.tx.regionRider.updateMany).not.toHaveBeenCalled();
  });

  it.each(['', '   ', 'x'.repeat(501)])('requires a nonempty bounded reason', async reason => {
    const f = setup();
    await expect(f.service.revokeRider('rider-row', { reason }, 'admin-a')).rejects.toThrow('撤销原因');
    expect(f.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('requires an administrator and scopes the operation to their region', async () => {
    const f = setup({ regionId: 'region-b' });
    await expect(f.service.revokeRider('rider-row', { reason: '退出' }, '')).rejects.toThrow('管理员身份');
    await expect(f.service.revokeRider('rider-row', { reason: '退出' }, 'admin-a')).rejects.toThrow('无权操作');
    expect(f.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rechecks region and approval after acquiring the assignment lock', async () => {
    const f = setup();
    f.tx.regionRider.findUnique.mockResolvedValueOnce({ ...f.current(), regionId: 'region-b' });
    await expect(f.service.revokeRider('rider-row', { reason: '退出' }, 'admin-a')).rejects.toThrow('无权操作');
    f.tx.regionRider.findUnique.mockResolvedValueOnce({ ...f.current(), verifyStatus: 'pending' });
    await expect(f.service.revokeRider('rider-row', { reason: '退出' }, 'admin-a')).rejects.toThrow('仅已通过');
    expect(f.tx.regionRider.updateMany).not.toHaveBeenCalled();
  });

  it('does not report success or create a revocation log when the guarded update loses', async () => {
    const f = setup();
    f.tx.regionRider.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(f.service.revokeRider('rider-row', { reason: '退出' }, 'admin-a')).rejects.toThrow('状态已变化');
    expect(f.tx.adminOperationLog.create).not.toHaveBeenCalled();
  });

  it('rolls back the state change when the required audit log cannot be saved', async () => {
    const f = setup();
    f.tx.adminOperationLog.create.mockRejectedValueOnce(new Error('audit unavailable'));
    await expect(f.service.revokeRider('rider-row', { reason: '退出' }, 'admin-a')).rejects.toThrow('audit unavailable');
    expect(f.current()).toMatchObject({ verifyStatus: 'approved', riderType: 'official', status: 'online' });
  });

  it('prevents the old audit endpoint from revoking or restoring an already revoked account', async () => {
    const f = setup({ verifyStatus: 'revoked', riderType: 'ordinary_user' });
    await expect(f.service.auditRider('rider-row', { status: 'revoked' }, 'admin-a')).rejects.toThrow('专门的撤销');
    await expect(f.service.auditRider('rider-row', { status: 'approved' }, 'admin-a')).rejects.toThrow('重新申请');
    expect(f.tx.regionRider.update).not.toHaveBeenCalled();
  });

  it.each([{ status: 'online' }, { status: 'busy' }, { riderType: 'official' }, { riderType: 'part_time' }])('does not restore rider access via status/type editing: %j', async dto => {
    const f = setup({ verifyStatus: 'revoked', riderType: 'ordinary_user' });
    await expect(f.service.updateRiderStatus('rider-row', dto, 'admin-a')).rejects.toThrow('重新申请并审核');
    expect(f.tx.regionRider.update).not.toHaveBeenCalled();
  });

  it('allows a fresh pending application to be approved again', async () => {
    const f = setup({ verifyStatus: 'pending', riderType: 'part_time', status: 'offline' });
    await expect(f.service.auditRider('rider-row', { status: 'approved' }, 'admin-a')).resolves.toMatchObject({ verifyStatus: 'approved', riderType: 'part_time', status: 'offline' });
  });

  it('rejects empty/oversized reasons and arbitrary states at the HTTP DTO boundary', async () => {
    for (const reason of [undefined, '', '   ', 123, 'x'.repeat(501)]) {
      expect((await validate(plainToInstance(RevokeRiderDto, { reason }))).length).toBeGreaterThan(0);
    }
    expect(await validate(plainToInstance(RevokeRiderDto, { reason: '  本人退出  ' }))).toHaveLength(0);
    expect((await validate(plainToInstance(AuditRiderDto, { status: 'revoked' }))).length).toBeGreaterThan(0);
  });

  it('requires the same rider audit permission as approval', () => {
    const revoke = ErrandAdminController.prototype.revokeRider;
    const audit = ErrandAdminController.prototype.auditRider;
    const keys = Reflect.getMetadataKeys(audit).filter((key: any) => String(key).toLowerCase().includes('permission'));
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) expect(Reflect.getMetadata(key, revoke)).toEqual(Reflect.getMetadata(key, audit));
  });
});
