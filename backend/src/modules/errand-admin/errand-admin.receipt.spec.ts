import 'reflect-metadata'
jest.mock('../errand/errand.service', () => ({ ErrandService: class {} }))
jest.mock('../errand/errand-lifecycle.service', () => ({ ErrandLifecycleService: class {} }))

import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { ErrandAdminController } from './errand-admin.controller'
import { ErrandAdminService } from './errand-admin.service'
import { ConfirmErrandReceiptDto } from './dto/errand-admin.dto'

describe('管理员代确认收货入口', () => {
  const setup = () => {
    const order = { id: 'p', type: 'purchase', userId: 'buyer', regionId: 'region-a', status: 'arrived' }
    const prisma: any = { errandOrder: { findUnique: jest.fn().mockResolvedValue(order) } }
    const scope: any = { getAdminContext: jest.fn().mockResolvedValue({ isSuperAdmin: false, regionIds: ['region-a'] }) }
    const lifecycle: any = { confirmReceipt: jest.fn().mockResolvedValue({
      ...order, status: 'completed', receiptConfirmedAt: new Date('2026-10-09T01:00:00Z'),
      receiptConfirmedBy: 'admin', receiptCode: '123456',
    }) }
    const service = new ErrandAdminService(prisma, scope, undefined, lifecycle)
    return { order, prisma, scope, lifecycle, service }
  }

  it('要求跑腿管理权限，不能只凭查看权限调用', () => {
    expect(Reflect.getMetadata('admin_permissions', ErrandAdminController.prototype.confirmReceipt)).toEqual(['errand:config'])
    expect(Reflect.getMetadata('path', ErrandAdminController.prototype.confirmReceipt)).toBe('admin/errand/orders/:id/confirm-receipt')
  })

  it('按真实订单区域授权，并以管理员身份进入原有收货结算流程', async () => {
    const { service, scope, lifecycle } = setup()
    const result = await service.confirmReceipt('p', { reason: '  已电话核实用户收到商品  ' }, 'admin-a')
    expect(scope.getAdminContext).toHaveBeenCalledWith('admin-a')
    expect(lifecycle.confirmReceipt).toHaveBeenCalledWith('p', 'admin-a', 'admin', undefined, { adminReason: '已电话核实用户收到商品' })
    expect(result).toEqual(expect.objectContaining({ success: true, orderId: 'p', receiptConfirmedBy: 'admin' }))
    expect(result).not.toHaveProperty('receiptCode')
  })

  it('拒绝跨区域管理员操作', async () => {
    const { service, order, lifecycle } = setup()
    order.regionId = 'region-b'
    await expect(service.confirmReceipt('p', { reason: '核实已收到' }, 'admin-a')).rejects.toThrow('无权操作该区域跑腿订单')
    expect(lifecycle.confirmReceipt).not.toHaveBeenCalled()
  })

  it('拒绝通过代买入口确认普通跑腿订单', async () => {
    const { service, order, lifecycle } = setup()
    order.type = 'delivery'
    await expect(service.confirmReceipt('p', { reason: '已核实收到' }, 'admin-a')).rejects.toThrow('仅支持代买订单')
    expect(lifecycle.confirmReceipt).not.toHaveBeenCalled()
  })

  it('允许超级管理员处理其他区域', async () => {
    const { service, order, scope, lifecycle } = setup()
    order.regionId = 'region-b'
    scope.getAdminContext.mockResolvedValue({ isSuperAdmin: true, regionIds: [] })
    await service.confirmReceipt('p', { reason: '核实已收到' }, 'admin-a')
    expect(lifecycle.confirmReceipt).toHaveBeenCalled()
  })

  it.each(['', '   ', 'x'.repeat(501), null, 123])('拒绝无效原因 %p', async (reason) => {
    const { service, prisma, lifecycle } = setup()
    await expect(service.confirmReceipt('p', { reason } as any, 'admin-a')).rejects.toThrow('1 至 500 字')
    expect(prisma.errandOrder.findUnique).not.toHaveBeenCalled()
    expect(lifecycle.confirmReceipt).not.toHaveBeenCalled()
  })

  it('拒绝缺少管理员身份和不存在的订单', async () => {
    const { service, prisma, lifecycle } = setup()
    await expect(service.confirmReceipt('p', { reason: '核实已收到' }, '')).rejects.toThrow('需要管理员身份')
    prisma.errandOrder.findUnique.mockResolvedValue(null)
    await expect(service.confirmReceipt('p', { reason: '核实已收到' }, 'admin-a')).rejects.toThrow('订单不存在')
    expect(lifecycle.confirmReceipt).not.toHaveBeenCalled()
  })

  it('已完成订单仍委托原有幂等流程，保留原确认来源', async () => {
    const { service, order, lifecycle } = setup()
    order.status = 'completed'
    lifecycle.confirmReceipt.mockResolvedValue({ ...order, receiptConfirmedBy: 'user', receiptConfirmedAt: new Date() })
    const result = await service.confirmReceipt('p', { reason: '页面已核实' }, 'admin-a')
    expect(result.receiptConfirmedBy).toBe('user')
    expect(lifecycle.confirmReceipt).toHaveBeenCalledTimes(1)
  })

  it('保留原流程的状态/退款/售后阻断，不能由后台绕过', async () => {
    const { service, lifecycle } = setup()
    lifecycle.confirmReceipt.mockRejectedValue(new Error('订单售后处理中，暂不能确认收货'))
    await expect(service.confirmReceipt('p', { reason: '核实已收到' }, 'admin-a')).rejects.toThrow('订单售后处理中')
  })

  it('DTO 去除原因空白并拒绝额外区域/伪造来源字段', async () => {
    const valid = plainToInstance(ConfirmErrandReceiptDto, { reason: ' 核实已收到 ' })
    expect(await validate(valid, { whitelist: true, forbidNonWhitelisted: true })).toEqual([])
    expect(valid.reason).toBe('核实已收到')
    const invalid = plainToInstance(ConfirmErrandReceiptDto, { reason: '  ', regionId: 'region-b', source: 'system' })
    const errors = await validate(invalid, { whitelist: true, forbidNonWhitelisted: true })
    expect(errors.map(e => e.property).sort()).toEqual(['reason', 'regionId', 'source'])
  })
})
