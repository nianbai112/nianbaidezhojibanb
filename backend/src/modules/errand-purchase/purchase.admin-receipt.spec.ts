import { PurchaseService } from './purchase.service'
import { errandExtendedConfigKey } from '../errand/errand-config.util'
import { purchaseConfigKey } from './purchase.policy'

describe('代买后台收货管理信息', () => {
  const setup = () => {
    const purchase: any = {
      id: 'p', userId: 'buyer', regionId: 'region-a', approvedGoodsCents: 500, serviceCents: 700,
      order: { id: 'p', orderNo: 'DM000001', status: 'arrived', refundStatus: 'none', userId: 'buyer', riderId: 'rider', receiptCode: '123456' },
      stops: [{ id: 'stop', status: 'purchased', auditStatus: 'pending' }], changes: [], refunds: [], events: [],
    }
    const rows: any[] = [{ key: purchaseConfigKey('region-a'), value: { autoReceiptHours: 36 } }]
    const db: any = {
      errandPurchase: { findUnique: jest.fn().mockResolvedValue(purchase), findMany: jest.fn().mockResolvedValue([purchase]), count: jest.fn().mockResolvedValue(1) },
      region: { findUnique: jest.fn().mockResolvedValue({ id: 'region-a' }) },
      printJob: { findMany: jest.fn().mockResolvedValue([]) },
      config: {
        findMany: jest.fn().mockImplementation(async () => rows),
        findUnique: jest.fn().mockImplementation(async ({ where }) => rows.find(row => row.key === where.key) || null),
      },
      orderAppeal: { findFirst: jest.fn().mockResolvedValue(null) },
      deliveryRiskEvent: { findFirst: jest.fn().mockResolvedValue(null) },
      purchaseShop: { findMany: jest.fn().mockResolvedValue([]) },
      purchaseCombination: { findMany: jest.fn().mockResolvedValue([]) },
      printerConfig: { findMany: jest.fn().mockResolvedValue([]) },
    }
    const scope = { assertRegionAccess: jest.fn().mockResolvedValue(undefined) }
    const service: any = Object.create(PurchaseService.prototype)
    service.prisma = db
    service.scope = scope
    return { purchase, rows, db, scope, service }
  }

  it('待确认筛选叠加关键词不丢失 arrived 条件', async () => {
    const { service, db } = setup()
    const data = await service.adminData('admin', 'region-a', { filter: 'awaiting_receipt', keyword: 'DM000001' })
    expect(db.errandPurchase.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {
      regionId: 'region-a', order: { status: 'arrived', OR: [
        { orderNo: { contains: 'DM000001' } }, { title: { contains: 'DM000001' } }, { deliverContact: { contains: 'DM000001' } },
      ] },
    } }))
    expect(data.receiptSettings).toEqual({ enabled: true, autoReceiptHours: 36, scanIntervalMinutes: 10 })
  })

  it('后台详情允许已送达无异常订单确认，凭证待审不改变收货规则', async () => {
    const { service, scope } = setup()
    const detail = await service.detail('p', '', 'admin')
    expect(scope.assertRegionAccess).toHaveBeenCalledWith('admin', 'region-a')
    expect(detail.receiptAction.allowed).toBe(true)
    expect(detail.receiptSettings.autoReceiptHours).toBe(36)
    expect(detail.order).not.toHaveProperty('receiptCode')
  })

  it('普通用户与骑手响应不新增后台操作或配置数据', async () => {
    const { service, db } = setup()
    const buyer = await service.detail('p', 'buyer')
    const rider = await service.detail('p', 'rider')
    for (const detail of [buyer, rider]) {
      expect(detail).not.toHaveProperty('receiptAction')
      expect(detail).not.toHaveProperty('receiptSettings')
    }
    expect(buyer.order.receiptCode).toBe('123456')
    expect(rider.order).not.toHaveProperty('receiptCode')
    expect(db.config.findMany).not.toHaveBeenCalled()
    expect(db.orderAppeal.findFirst).not.toHaveBeenCalled()
  })

  it('后台查看仍遵守区域权限，普通第三方不能查看', async () => {
    const { service, db, scope } = setup()
    scope.assertRegionAccess.mockRejectedValue(new Error('无权访问该区域'))
    await expect(service.detail('p', '', 'admin')).rejects.toThrow('无权访问该区域')
    await expect(service.detail('p', 'stranger')).rejects.toThrow('无权查看')
    expect(db.config.findMany).not.toHaveBeenCalled()
  })

  it.each([
    ['completed', 'none', '订单已确认收货'],
    ['in_progress', 'none', '订单尚未送达或已结束'],
    ['cancelled', 'none', '订单尚未送达或已结束'],
    ['arrived', 'refunding', '订单退款处理中或已退款'],
    ['arrived', 'refunded', '订单退款处理中或已退款'],
  ])('状态 %s / %s 返回明确阻断原因', async (status, refundStatus, reason) => {
    const { service, purchase } = setup()
    Object.assign(purchase.order, { status, refundStatus })
    const detail = await service.detail('p', '', 'admin')
    expect(detail.receiptAction.allowed).toBe(false)
    expect(detail.receiptAction.reason).toContain(reason)
  })

  it('售后处理中及严重风险未处理时隐藏确认动作', async () => {
    const { service, db } = setup()
    db.orderAppeal.findFirst.mockResolvedValueOnce({ id: 'appeal' })
    expect((await service.detail('p', '', 'admin')).receiptAction.reason).toContain('售后处理中')
    db.deliveryRiskEvent.findFirst.mockResolvedValueOnce({ id: 'risk' })
    expect((await service.detail('p', '', 'admin')).receiptAction.reason).toContain('未处理的配送风险')
    expect(db.deliveryRiskEvent.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ handled: false, eventLevel: { in: ['error', 'critical'] } }) }))
  })

  it('差价退款不等于整单退款，保留既有本金审核与返还规则', async () => {
    const { service, purchase } = setup()
    purchase.refunds = [{ status: 'pending', amountCents: 100 }]
    const detail = await service.detail('p', '', 'admin')
    expect(detail.receiptAction.allowed).toBe(true)
    expect(detail.refundPendingCents).toBe(100)
  })

  it('区域没有闭环配置时，展示全局关闭；手动确认仍可进行', async () => {
    const { service, rows } = setup()
    rows.push({ key: errandExtendedConfigKey('global'), value: { autoReceiptEnabled: false } })
    const detail = await service.detail('p', '', 'admin')
    expect(detail.receiptSettings.enabled).toBe(false)
    expect(detail.receiptAction.allowed).toBe(true)
  })

  it('区域开关覆盖全局，兼容下划线格式并给旧设置默认 24 小时', async () => {
    const { service, rows } = setup()
    rows[0].value = {}
    rows.push({ key: errandExtendedConfigKey('global'), value: { autoReceiptEnabled: true } })
    rows.push({ key: errandExtendedConfigKey('region-a'), value: { auto_receipt_enabled: false } })
    const data = await service.adminData('admin', 'region-a')
    expect(data.receiptSettings).toEqual({ enabled: false, autoReceiptHours: 24, scanIntervalMinutes: 10 })
  })

  it('区域已有其他设置但未设置开关时仍继承全局关闭，显式区域开启可覆盖', async () => {
    const { service, rows } = setup()
    rows.push({ key: errandExtendedConfigKey('global'), value: { auto_receipt_enabled: false } })
    const regional = { key: errandExtendedConfigKey('region-a'), value: { closureVersion: 2 } as any }
    rows.push(regional)
    expect((await service.adminData('admin', 'region-a')).receiptSettings.enabled).toBe(false)
    expect((await service.detail('p', '', 'admin')).receiptSettings.enabled).toBe(false)
    regional.value.autoReceiptEnabled = true
    expect((await service.detail('p', '', 'admin')).receiptSettings.enabled).toBe(true)
  })

  it('校区自动收货设置可读但不重写已有订单截止时间', async () => {
    const { service, purchase } = setup()
    purchase.order.receiptConfirmDeadline = new Date('2026-10-10T03:00:00Z')
    const detail = await service.detail('p', '', 'admin')
    expect(detail.order.receiptConfirmDeadline).toEqual(purchase.order.receiptConfirmDeadline)
    expect(detail.receiptSettings.autoReceiptHours).toBe(36)
  })
})
