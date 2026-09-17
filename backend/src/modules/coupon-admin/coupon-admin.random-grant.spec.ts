import { CouponAdminService } from './coupon-admin.service'

describe('random coupon batch issuance', () => {
  const dto = { batchId: 'c5a03589-cb39-42f2-95ba-a459a37ec204', count: 2, reason: '开学福利' }
  function setup() {
    const coupon = { id: 'coupon', name: '福利券', status: 'active', startAt: new Date('2020-01-01'), endAt: new Date('2099-01-01'), totalCount: 10, receivedCount: 0, limitPerUser: 1 }
    const tx = {
      coupon: { updateMany: jest.fn().mockResolvedValue({ count: 1 }), findUnique: jest.fn().mockResolvedValue(coupon) },
      user: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'a', uid: 101, publicUid: 9001, _count: { coupons: 0 } }, { id: 'b', uid: 102, publicUid: null, _count: { coupons: 0 } },
          { id: 'limited', _count: { coupons: 1 } },
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      couponReceive: { createMany: jest.fn().mockResolvedValue({ count: 2 }) },
      adminOperationLog: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({}) },
    }
    const prisma = { $transaction: jest.fn(async (fn, _options?: any) => fn(tx)) }
    return { tx, coupon, prisma, service: new CouponAdminService(prisma as any) }
  }
  it('issues once per eligible recipient and records the exact batch atomically', async () => {
    const { tx, prisma, service } = setup()
    expect(await service.randomGrant('coupon', dto, 'admin')).toEqual({ batchId: dto.batchId, count: 2, repeated: false, recipients: [
      { userId: 'a', uid: 9001, status: 'success' }, { userId: 'b', uid: 102, status: 'success' },
    ] })
    expect(tx.user.findMany.mock.calls[0][0].where).toEqual({ status: 'ACTIVE', deletedAt: null, userType: 1, systemRole: null })
    expect(tx.couponReceive.createMany).toHaveBeenCalledWith({ data: [
      { userId: 'a', couponId: 'coupon', status: 'unused' }, { userId: 'b', couponId: 'coupon', status: 'unused' },
    ] })
    expect(tx.adminOperationLog.create.mock.calls[0][0].data.detail.userIds).toEqual(['a', 'b'])
    expect(tx.adminOperationLog.create.mock.calls[0][0].data.detail.recipients).toEqual([
      { userId: 'a', uid: 9001, status: 'success' }, { userId: 'b', uid: 102, status: 'success' },
    ])
    expect(prisma.$transaction.mock.calls[0][1]).toEqual({ isolationLevel: 'ReadCommitted', timeout: 60000 })
  })
  it('replays a committed batch without writing receipts or drawing again', async () => {
    const { tx, service } = setup()
    const recipients = [{ userId: 'a', uid: 9001, status: 'success' }, { userId: 'b', uid: 102, status: 'success' }]
    tx.adminOperationLog.findUnique.mockResolvedValue({ action: 'GRANT_COUPON', accountId: 'admin', detail: { couponId: 'coupon', count: 2, reason: dto.reason, recipients } })
    expect(await service.randomGrant('coupon', dto, 'admin')).toEqual({ batchId: dto.batchId, count: 2, repeated: true, recipients })
    expect(tx.user.findMany).not.toHaveBeenCalled()
    expect(tx.couponReceive.createMany).not.toHaveBeenCalled()
    await expect(service.randomGrant('coupon', { ...dto, count: 3 }, 'admin')).rejects.toThrow('批次编号已使用')
  })
  it.each(['inactive', 'expired', 'future', 'stock', 'users', 'status-change'])('rejects %s without creating receipts', async mode => {
    const { tx, coupon, service } = setup()
    if (mode === 'inactive') coupon.status = 'inactive'
    if (mode === 'expired') coupon.endAt = new Date('2020-01-01')
    if (mode === 'future') coupon.startAt = new Date('2098-01-01')
    if (mode === 'stock') coupon.totalCount = 1
    if (mode === 'users') tx.user.findMany.mockResolvedValue([{ id: 'a', uid: 101, publicUid: 9001, _count: { coupons: 0 } }])
    if (mode === 'status-change') tx.user.updateMany.mockResolvedValue({ count: 1 })
    await expect(service.randomGrant('coupon', dto, 'admin')).rejects.toThrow()
    expect(tx.couponReceive.createMany).not.toHaveBeenCalled()
    expect(tx.adminOperationLog.create).not.toHaveBeenCalled()
  })
  it('samples unique recipients when there are more users than slots', async () => {
    const { tx, service } = setup()
    tx.user.findMany.mockResolvedValue(Array.from({ length: 50 }, (_, i) => ({ id: String(i), _count: { coupons: 0 } })))
    await service.randomGrant('coupon', dto, 'admin')
    const rows = tx.couponReceive.createMany.mock.calls[0][0].data
    expect(rows).toHaveLength(2)
    expect(new Set(rows.map((row: any) => row.userId)).size).toBe(2)
  })
  it.each([0, -1, 1.5, 1001, NaN])('rejects invalid count %s', async count => {
    const { service, prisma } = setup()
    await expect(service.randomGrant('coupon', { ...dto, count }, 'admin')).rejects.toThrow()
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })
})
