import { Injectable, BadRequestException, ForbiddenException, NotFoundException, Optional } from '@nestjs/common'
import { PrismaService } from '../../common/services/prisma.service'
import { AdminDataScopeService } from '../../common/services/admin-data-scope.service'
import { ErrandService } from '../errand/errand.service'
import {
  RiderQueryDto, AuditRiderDto, RiderStatusDto,
  DeliveryOrderQueryDto, AssignOrderDto, CancelOrderDto,
  UpdateFeeConfigDto,
  UpdatePageConfigDto,
  UpdateRewardPunishDto,
} from './dto/errand-admin.dto'
import {
  ERRAND_EXTENDED_CONFIG_GROUP,
  buildMiniErrandConfig,
  errandExtendedConfigKey,
  mergeErrandExtendedConfig,
  normalizeErrandExtendedConfig,
  splitErrandConfigPayload,
} from '../errand/errand-config.util'

@Injectable()
export class ErrandAdminService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly adminDataScope?: AdminDataScopeService,
    @Optional() private readonly errandService?: ErrandService,
  ) {}

  private async adminRegionIds(operatorId?: string): Promise<string[] | undefined> {
    if (!operatorId || !this.adminDataScope) return undefined
    const scope = await this.adminDataScope.getAdminContext(operatorId)
    return scope.isSuperAdmin ? undefined : scope.regionIds
  }

  private async assertOrderRegion(regionId: string | null | undefined, operatorId?: string) {
    const regionIds = await this.adminRegionIds(operatorId)
    if (regionIds !== undefined && (!regionId || !regionIds.includes(regionId))) {
      throw new ForbiddenException('无权操作该区域跑腿订单')
    }
  }

  private async assertRequestedRegion(regionId: string | undefined, operatorId?: string) {
    const regionIds = await this.adminRegionIds(operatorId)
    const value = String(regionId || '').trim()
    if (regionIds !== undefined && (!value || value === 'global' || !regionIds.includes(value))) {
      throw new ForbiddenException('无权访问该区域跑腿配置')
    }
  }

  private resolveConfigRegionId(regionId?: string) {
    const value = typeof regionId === 'string' ? regionId.trim() : ''
    return value || 'global'
  }

  private normalizeOrderStatus(status?: string) {
    const value = String(status || '').trim()
    if (!value) return ''
    const map: Record<string, string> = {
      PENDING_PAY: 'pending_pay',
      PENDING_ACCEPT: 'pending_accept',
      ACCEPTED: 'accepted',
      IN_PROGRESS: 'in_progress',
      ARRIVED: 'arrived',
      COMPLETED: 'completed',
      CANCELLED: 'cancelled',
      REFUNDING: 'refunding',
      REFUNDED: 'refunded',
    }
    return map[value] || value.toLowerCase()
  }

  private normalizeOrderType(type?: string) {
    const value = String(type || '').trim()
    const map: Record<string, string> = {
      express_pickup: 'pickup',
      pickup: 'pickup',
      express_send: 'deliver',
      deliver: 'deliver',
      food_delivery: 'meal',
      meal: 'meal',
      custom_task: 'universal',
      universal: 'universal',
    }
    return map[value] || value || ''
  }

  private normalizeRiderStatus(status?: string) {
    const value = String(status || '').trim()
    const map: Record<string, string> = {
      available: 'online',
      online: 'online',
      offline: 'offline',
      busy: 'busy',
    }
    return value ? (map[value.toLowerCase()] || value.toLowerCase()) : ''
  }

  private numberValue(value: any, fallback = 0) {
    const n = Number(value)
    return Number.isFinite(n) ? n : fallback
  }

  private normalizeRiderType(value?: string) {
    const text = String(value || '').trim().toLowerCase()
    const map: Record<string, string> = {
      official: 'official',
      platform: 'official',
      full_time: 'official',
      part_time: 'part_time',
      campus_part_time: 'part_time',
      '兼职': 'part_time',
      '官方': 'official',
    }
    return map[text] || 'part_time'
  }

  private deliveryDisplayModeForRider(rider?: any, explicit?: string | null) {
    const saved = String(explicit || '').trim()
    if (saved) return saved
    return this.normalizeRiderType(rider?.riderType) === 'official' ? 'live_map' : 'status_nodes'
  }

  private deliveryNodeLabel(nodeType: string) {
    const map: Record<string, string> = {
      accepted: '骑手已接单',
      in_progress: '骑手已取货',
      arrived: '骑手已送达',
      completed: '订单已完成',
      cancelled: '订单已取消',
      admin_assigned: '后台已派单',
      returned_pool: '订单退回接单池',
    }
    return map[nodeType] || '配送状态更新'
  }

  private async recordDeliveryNode(client: any, params: any) {
    const nodeType = String(params?.nodeType || '').trim()
    if (!nodeType) return null
    return client.deliveryOrderNode.create({
      data: {
        orderId: params.orderId,
        orderType: params.orderType || 'errand',
        nodeType,
        nodeLabel: params.nodeLabel || this.deliveryNodeLabel(nodeType),
        operatorId: params.operatorId || null,
        operatorType: params.operatorType || 'admin',
        riderType: this.normalizeRiderType(params.riderType),
        displayMode: params.displayMode || 'status_nodes',
        remark: params.remark || null,
      },
    }).catch(() => null)
  }

  private cleanId(value: any) {
    if (value === undefined || value === null) return ''
    const text = String(value).trim()
    if (!text || text === 'NaN' || text === 'null' || text === 'undefined' || text === '0') return ''
    return text
  }

  private omitPersistedMeta<T extends Record<string, any>>(dto: T): Omit<T, 'id' | 'regionId' | 'createdAt' | 'updatedAt'> {
    const { id, regionId, createdAt, updatedAt, ...payload } = dto || ({} as T)
    return payload
  }

  private parseOrderRemark(row: any) {
    if (!row?.remark) return {}
    try {
      const parsed = JSON.parse(row.remark)
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      return {}
    }
  }

  private taskTypeLabel(task: any, rowType?: string) {
    const value = String(task?.task_type || rowType || '').trim()
    const map: Record<string, string> = {
      express_pickup: '取件任务',
      pickup: '取件任务',
      food_delivery: '取餐任务',
      meal: '取餐任务',
      express_send: '寄件任务',
      deliver: '寄件任务',
      custom_task: '万能任务',
      universal: '万能任务',
    }
    return map[value] || '跑腿任务'
  }

  private formatOrderTask(task: any, index: number, rowType?: string, maps: any = {}) {
    const itemSizeId = this.cleanId(task?.item_size_id)
    const pickupPointId = this.cleanId(task?.pickup_point_id)
    const itemSize = maps.itemSizeMap?.get(itemSizeId)
    const pickupPoint = maps.pickupPointMap?.get(pickupPointId)
    const images = Array.isArray(task?.image_urls) ? task.image_urls : []
    return {
      ...task,
      taskNo: index + 1,
      typeLabel: this.taskTypeLabel(task, rowType),
      itemSizeName: itemSize?.name || task?.item_size_name || '',
      pickupPointName: pickupPoint?.name || task?.pickup_point_name || '',
      pickupPointAddress: pickupPoint?.address || task?.pickup_point_address || task?.pickup_address || '',
      imageUrls: images,
    }
  }

  private taskRowToPayload(task: any) {
    return {
      task_type: task.taskType,
      item_size_id: task.itemSizeId || '',
      pickup_point_id: task.pickupPointId || '',
      express_company: task.expressCompany || '',
      platform: task.platform || '',
      code: task.code || '',
      description: task.description || '',
      item_description: task.itemDescription || '',
      pickup_address: task.pickupAddress || '',
      recipient_address: task.recipientAddress || '',
      budget_amount: this.numberValue(task.budgetAmount, 0),
      computed_fee: this.numberValue(task.computedFee, 0),
      image_urls: Array.isArray(task.imageUrls) ? task.imageUrls : [],
      metadata: task.metadata || {},
    }
  }

  private rawOrderTasks(row: any) {
    const relationTasks = Array.isArray(row?.tasks) && row.tasks.length ? row.tasks : []
    if (relationTasks.length) return relationTasks.map((task: any) => this.taskRowToPayload(task))
    const remark = this.parseOrderRemark(row)
    return Array.isArray(remark.tasks) ? remark.tasks : []
  }

  private formatOrderTasks(row: any, maps: any = {}) {
    const rawTasks = this.rawOrderTasks(row)
    return rawTasks.map((task: any, index: number) => this.formatOrderTask(task, index, row?.type, maps))
  }

  private taskSummary(tasks: any[]) {
    if (!tasks.length) return '无明细任务'
    const counts = tasks.reduce((acc: Record<string, number>, task: any) => {
      const label = task.typeLabel || '跑腿任务'
      acc[label] = (acc[label] || 0) + 1
      return acc
    }, {})
    return Object.entries(counts).map(([label, count]) => `${label} ${count} 个`).join('，')
  }

  private async getExtendedConfig(regionId: string, basePrice = 0) {
    const saved = await this.prisma.config.findUnique({
      where: { key: errandExtendedConfigKey(regionId) },
    }).catch(() => null)
    return normalizeErrandExtendedConfig(saved?.value, basePrice)
  }

  private async saveExtendedConfig(regionId: string, value: any, basePrice = 0) {
    const current = await this.prisma.config.findUnique({
      where: { key: errandExtendedConfigKey(regionId) },
    }).catch(() => null)
    const normalized = mergeErrandExtendedConfig(current?.value, value, basePrice)
    await this.prisma.config.upsert({
      where: { key: errandExtendedConfigKey(regionId) },
      update: { value: normalized, group: ERRAND_EXTENDED_CONFIG_GROUP },
      create: {
        key: errandExtendedConfigKey(regionId),
        value: normalized,
        group: ERRAND_EXTENDED_CONFIG_GROUP,
        desc: '跑腿扩展运营配置',
      },
    })
    return normalized
  }

  private formatOrder(row: any) {
    const user = row.User || row.user || null
    const rider = row.RegionRider || row.rider || null
    const remarkData = this.parseOrderRemark(row)
    const tasks = this.formatOrderTasks(row)
    return {
      ...row,
      user,
      rider,
      remarkData,
      tasks,
      taskCount: tasks.length,
      taskSummary: this.taskSummary(tasks),
      userName: user?.nickname || '',
      userPhone: user?.phone || '',
      riderName: rider?.realName || '',
      riderPhone: rider?.phone || '',
      riderType: this.normalizeRiderType(rider?.riderType),
      riskLevel: rider?.riskLevel || 'normal',
      violationCount: rider?.violationCount || 0,
      deliveryDisplayMode: this.deliveryDisplayModeForRider(rider, row.deliveryDisplayMode),
      serviceType: row.type,
      amount: Number(row.payAmount ?? row.price ?? 0),
      price: Number(row.price ?? 0),
      payAmount: Number(row.payAmount ?? 0),
      tip: Number(row.tip ?? 0),
    }
  }

  // ==================== Rider ====================

  async getRiders(query: RiderQueryDto, operatorId?: string) {
    const { page = 1, pageSize = 20, keyword, auditStatus, status, regionId } = query
    const riderType = this.normalizeRiderType((query as any).riderType)
    const where: any = {}
    if (auditStatus) where.verifyStatus = auditStatus
    if (status) where.status = this.normalizeRiderStatus(status)
    if ((query as any).riderType) where.riderType = riderType
    const scopedRegionIds = await this.adminRegionIds(operatorId)
    if (regionId) {
      if (scopedRegionIds !== undefined && !scopedRegionIds.includes(regionId)) throw new ForbiddenException('无权访问该区域骑手')
      where.regionId = regionId
    } else if (scopedRegionIds !== undefined) where.regionId = { in: scopedRegionIds }
    if (keyword) {
      where.OR = [
        { realName: { contains: keyword } },
        { phone: { contains: keyword } },
        { User: { is: { nickname: { contains: keyword } } } },
      ]
    }

    const [list, total] = await Promise.all([
      this.prisma.regionRider.findMany({
        where,
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: 'desc' },
        include: { User: { select: { id: true, nickname: true, avatar: true, phone: true } } },
      }),
      this.prisma.regionRider.count({ where }),
    ])
    return { list, total, page: +page, pageSize: +pageSize }
  }

  async getRiderDetail(id: string, operatorId?: string) {
    const r = await this.prisma.regionRider.findUnique({
      where: { id },
      include: { User: { select: { id: true, nickname: true, avatar: true, phone: true } } },
    })
    if (!r) throw new NotFoundException('骑手不存在')
    await this.assertOrderRegion(r.regionId, operatorId)
    return r
  }

  async auditRider(id: string, dto: AuditRiderDto, operatorId?: string) {
    const rider = await this.prisma.regionRider.findUnique({ where: { id }, select: { regionId: true } })
    if (!rider) throw new NotFoundException('骑手不存在')
    await this.assertOrderRegion(rider.regionId, operatorId)
    const data: any = { verifyStatus: dto.status }
    return this.prisma.regionRider.update({ where: { id }, data })
  }

  async updateRiderStatus(id: string, dto: RiderStatusDto, operatorId?: string) {
    const rider = await this.prisma.regionRider.findUnique({ where: { id }, select: { regionId: true } })
    if (!rider) throw new NotFoundException('骑手不存在')
    await this.assertOrderRegion(rider.regionId, operatorId)
    const data: any = {}
    if (dto.status !== undefined) data.status = this.normalizeRiderStatus(dto.status)
    if (dto.riderType !== undefined) data.riderType = this.normalizeRiderType(dto.riderType)
    if (dto.riskLevel !== undefined) data.riskLevel = String(dto.riskLevel || 'normal').trim() || 'normal'
    if (!Object.keys(data).length) throw new BadRequestException('没有可更新的骑手信息')
    return this.prisma.regionRider.update({ where: { id }, data })
  }

  async getRiderRecords(id: string, query: any, operatorId?: string) {
    const { page = 1, pageSize = 20 } = query
    const rider = await this.prisma.regionRider.findFirst({
      where: { OR: [{ id }, { userId: id }] },
      select: { userId: true, regionId: true },
    })
    if (!rider) throw new NotFoundException('骑手不存在')
    await this.assertOrderRegion(rider.regionId, operatorId)
    const where: any = { riderId: rider.userId }
    const [list, total] = await Promise.all([
      this.prisma.errandOrder.findMany({
        where,
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: 'desc' },
        include: { User: { select: { id: true, nickname: true } } },
      }),
      this.prisma.errandOrder.count({ where }),
    ])
    return { list, total, page: +page, pageSize: +pageSize }
  }

  // ==================== Order ====================

  async getOrders(query: DeliveryOrderQueryDto, operatorId?: string) {
    const { page = 1, pageSize = 20, orderNo, status, type, userId, riderId, regionId, startDate, endDate } = query as any
    const where: any = {}
    const keyword = String((query as any).keyword || orderNo || '').trim()
    const riderKeyword = String((query as any).rider || '').trim()
    if (keyword) {
      where.OR = [
        { orderNo: { contains: keyword } },
        { title: { contains: keyword } },
        { description: { contains: keyword } },
        { User: { is: { nickname: { contains: keyword } } } },
        { User: { is: { phone: { contains: keyword } } } },
      ]
    }
    if (status) where.status = this.normalizeOrderStatus(status)
    const orderType = this.normalizeOrderType(type)
    if (orderType) where.type = orderType
    if (userId) where.userId = userId
    if (riderId) where.riderId = riderId
    const scopedRegionIds = await this.adminRegionIds(operatorId)
    if (regionId) {
      if (scopedRegionIds !== undefined && !scopedRegionIds.includes(regionId)) throw new ForbiddenException('无权访问该区域跑腿订单')
      where.regionId = regionId
    } else if (scopedRegionIds !== undefined) {
      where.regionId = { in: scopedRegionIds }
    }
    if (riderKeyword) {
      where.AND = [
        ...(where.AND || []),
        {
          OR: [
            { RegionRider: { is: { realName: { contains: riderKeyword } } } },
            { RegionRider: { is: { phone: { contains: riderKeyword } } } },
          ],
        },
      ]
    }
    if (startDate || endDate) {
      where.createdAt = {}
      if (startDate) where.createdAt.gte = new Date(startDate)
      if (endDate) where.createdAt.lte = new Date(String(endDate).includes('T') ? endDate : `${endDate}T23:59:59.999Z`)
    }

    const [list, total] = await Promise.all([
      this.prisma.errandOrder.findMany({
        where,
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          User: { select: { id: true, nickname: true, phone: true, avatar: true } },
          RegionRider: { select: { id: true, userId: true, realName: true, phone: true, riderType: true, riskLevel: true, violationCount: true } },
          tasks: { orderBy: { sortOrder: 'asc' } },
        },
      }),
      this.prisma.errandOrder.count({ where }),
    ])
    return { list: list.map(row => this.formatOrder(row)), total, page: +page, pageSize: +pageSize }
  }

  async handleRiskEvent(id: string, operatorId?: string) {
    const event = await this.prisma.deliveryRiskEvent.findUnique({ where: { id } })
    if (!event || !['errand', 'shop'].includes(event.orderType)) throw new NotFoundException('风险事件不存在')
    if (event.orderType === 'shop') {
      const order = await this.prisma.order.findUnique({
        where: { id: event.orderId },
        select: { id: true, merchant: { select: { regionId: true } } },
      })
      if (!order) throw new NotFoundException('商城订单不存在')
      await this.assertOrderRegion(order.merchant?.regionId, operatorId)
    } else {
      const order = await this.prisma.errandOrder.findUnique({ where: { id: event.orderId }, select: { id: true, regionId: true } })
      if (!order) throw new NotFoundException('跑腿订单不存在')
      await this.assertOrderRegion(order.regionId, operatorId)
    }
    const updated = await this.prisma.deliveryRiskEvent.updateMany({
      where: { id, handled: false },
      data: { handled: true, handledBy: operatorId || null, handledAt: new Date() },
    })
    if (updated.count !== 1) throw new BadRequestException('该风险事件已处理')
    return { success: true }
  }

  async getOrderDetail(id: string, operatorId?: string) {
    const o = await this.prisma.errandOrder.findUnique({
      where: { id },
      include: {
        User: { select: { id: true, nickname: true, phone: true, avatar: true } },
        RegionRider: { select: { id: true, userId: true, realName: true, phone: true, riderType: true, riskLevel: true, violationCount: true, lat: true, lng: true, locationUpdatedAt: true } },
        tasks: { orderBy: { sortOrder: 'asc' } },
      },
    })
    if (!o) throw new NotFoundException('订单不存在')
    await this.assertOrderRegion(o.regionId, operatorId)
    const rawTasks = this.rawOrderTasks(o)
    const itemSizeIds: string[] = Array.from(new Set(rawTasks.map((task: any) => this.cleanId(task?.item_size_id)).filter(Boolean)))
    const pickupPointIds: string[] = Array.from(new Set(rawTasks.map((task: any) => this.cleanId(task?.pickup_point_id)).filter(Boolean)))
    const [itemSizes, pickupPoints, deliveryNodes, riskEvents, appeal, refundAttempts, settlementItem, liabilities, review] = await Promise.all([
      itemSizeIds.length ? this.prisma.errandItemSize.findMany({ where: { id: { in: itemSizeIds } } }) : [],
      pickupPointIds.length ? this.prisma.errandPickupPoint.findMany({ where: { id: { in: pickupPointIds } } }) : [],
      this.prisma.deliveryOrderNode.findMany({ where: { orderId: id, orderType: 'errand' }, orderBy: { createdAt: 'asc' } }).catch(() => []),
      this.prisma.deliveryRiskEvent.findMany({ where: { orderId: id, orderType: 'errand' }, orderBy: { createdAt: 'desc' } }).catch(() => []),
      this.prisma.orderAppeal.findFirst({ where: { orderId: id, orderType: { in: ['errand', 'errand_order'] } }, orderBy: { createdAt: 'desc' } }).catch(() => null),
      this.prisma.paymentRefund.findMany({
        where: { payment: { is: { bizType: 'errand_order', bizId: id } } },
        orderBy: { createdAt: 'desc' },
      }).catch(() => []),
      this.prisma.riderSettlementItem.findUnique({
        where: { orderType_orderId: { orderType: 'errand', orderId: id } },
        include: { settlement: true },
      }).catch(() => null),
      this.prisma.riderLiability.findMany({ where: { orderId: id }, orderBy: { createdAt: 'desc' } }).catch(() => []),
      this.prisma.errandReview.findUnique({ where: { orderId: id } }).catch(() => null),
    ])
    const tasks = this.formatOrderTasks(o, {
      itemSizeMap: new Map(itemSizes.map((item: any) => [item.id, item])),
      pickupPointMap: new Map(pickupPoints.map((point: any) => [point.id, point])),
    })
    const hasOpenRisk = riskEvents.some((event: any) => !event.handled)
    const refundStatus = String((o as any).refundStatus || 'none')
    const latestRefund = refundAttempts[0]
    return {
      ...this.formatOrder(o),
      tasks,
      taskCount: tasks.length,
      taskSummary: this.taskSummary(tasks),
      deliveryNodes,
      riskEvents,
      appeal,
      appealHold: appeal && !['resolved', 'rejected', 'closed', 'cancelled'].includes(String(appeal.status)),
      refundAttempts,
      settlementItem,
      liabilities,
      review,
      allowedActions: {
        assign: o.status === 'pending_accept' && !o.riderId && !['refunding', 'refunded'].includes(refundStatus),
        cancel: ['pending_pay', 'pending_accept'].includes(o.status) && !['refunding', 'refunded'].includes(refundStatus),
        retryRefund: refundStatus === 'refunding' && !!latestRefund && ['failed', 'abnormal', 'closed'].includes(String(latestRefund.status).toLowerCase()),
        handleRisk: hasOpenRisk,
      },
    }
  }

  async cancelOrder(id: string, dto: CancelOrderDto, operatorId?: string) {
    const order = await this.prisma.errandOrder.findUnique({ where: { id } })
    if (!order) throw new NotFoundException('订单不存在')
    await this.assertOrderRegion(order.regionId, operatorId)
    if (!this.errandService) throw new BadRequestException('跑腿订单取消服务不可用')
    return this.errandService.cancelOrder(id, order.userId, dto)
  }

  async assignOrder(id: string, dto: AssignOrderDto, operatorId?: string) {
    if (!dto.riderId) throw new BadRequestException('请选择骑手')
    const currentOrder = await this.prisma.errandOrder.findUnique({ where: { id } })
    if (!currentOrder) throw new NotFoundException('订单不存在')
    await this.assertOrderRegion(currentOrder.regionId, operatorId)
    const rider = await this.prisma.regionRider.findFirst({
      where: { OR: [{ id: dto.riderId }, { userId: dto.riderId }] },
    })
    if (!rider) throw new NotFoundException('骑手不存在')
    if (rider.verifyStatus !== 'approved') throw new BadRequestException('骑手未通过审核')
    if (rider.regionId !== currentOrder.regionId) throw new BadRequestException('骑手与订单不在同一区域')
    if (rider.status !== 'online') throw new BadRequestException('骑手当前不在线或正在配送')
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.errandOrder.updateMany({
        where: {
          id,
          regionId: currentOrder.regionId,
          status: 'pending_accept',
          riderId: null,
          refundStatus: { notIn: ['refunding', 'refunded'] },
        },
        data: {
          riderId: rider.userId,
          status: 'accepted',
          acceptTime: new Date(),
          deliveryDisplayMode: this.deliveryDisplayModeForRider(rider),
        },
      })
      if (claimed.count !== 1) throw new BadRequestException('订单状态已变化，请刷新后重试')
      await this.recordDeliveryNode(tx, {
        orderId: id,
        nodeType: 'admin_assigned',
        nodeLabel: '后台已派单',
        operatorId: rider.userId,
        riderType: rider.riderType,
        displayMode: this.deliveryDisplayModeForRider(rider),
      })
      await tx.regionRider.update({ where: { userId: rider.userId }, data: { status: 'busy' } })
      return tx.errandOrder.findUniqueOrThrow({ where: { id } })
    })
  }

  async getOrderTimeline(id: string, operatorId?: string) {
    const order = await this.prisma.errandOrder.findUnique({
      where: { id },
      select: {
        id: true, orderNo: true, status: true, regionId: true,
        createdAt: true, acceptTime: true, pickupTime: true,
        deliverTime: true, completeTime: true, cancelTime: true,
        cancelReason: true,
      },
    })
    if (!order) throw new NotFoundException('订单不存在')
    await this.assertOrderRegion(order.regionId, operatorId)
    const deliveryNodes = await this.prisma.deliveryOrderNode.findMany({
      where: { orderId: id, orderType: 'errand' },
      orderBy: { createdAt: 'asc' },
    }).catch(() => [])
    return { ...order, deliveryNodes }
  }

  async getAbnormalOrders(query: DeliveryOrderQueryDto, operatorId?: string) {
    const { page = 1, pageSize = 20, regionId, startDate, endDate } = query as any
    const pageNumber = Math.max(1, Number(page) || 1)
    const size = Math.max(1, Math.min(100, Number(pageSize) || 20))
    const offset = (pageNumber - 1) * size
    const keyword = String((query as any).keyword || (query as any).orderNo || '').trim()
    const [errandRiskEvents, shopRiskEvents] = await Promise.all([
      this.prisma.deliveryRiskEvent.findMany({
        where: { orderType: 'errand', handled: false },
        select: { orderId: true },
        distinct: ['orderId'],
      }).catch(() => []),
      this.prisma.deliveryRiskEvent.findMany({
        where: { orderType: 'shop', handled: false },
        orderBy: { createdAt: 'desc' },
      }).catch(() => []),
    ])
    const riskOrderIds = errandRiskEvents.map((event: any) => event.orderId).filter(Boolean)
    const where: any = {
      OR: [
        { status: { in: ['cancelled', 'refunding', 'refunded'] } },
        ...(riskOrderIds.length ? [{ id: { in: riskOrderIds } }] : []),
      ],
    }
    const scopedRegionIds = await this.adminRegionIds(operatorId)
    if (regionId) {
      if (scopedRegionIds !== undefined && !scopedRegionIds.includes(regionId)) throw new ForbiddenException('无权访问该区域跑腿订单')
      where.regionId = regionId
    } else if (scopedRegionIds !== undefined) where.regionId = { in: scopedRegionIds }
    if (keyword) {
      where.AND = [
        ...(where.AND || []),
        {
          OR: [
            { orderNo: { contains: keyword } },
            { title: { contains: keyword } },
            { description: { contains: keyword } },
            { User: { is: { nickname: { contains: keyword } } } },
            { User: { is: { phone: { contains: keyword } } } },
          ],
        },
      ]
    }
    if (startDate || endDate) {
      where.createdAt = {}
      if (startDate) where.createdAt.gte = new Date(startDate)
      if (endDate) where.createdAt.lte = new Date(String(endDate).includes('T') ? endDate : `${endDate}T23:59:59.999Z`)
    }
    const shopRiskOrderIds = Array.from(new Set(shopRiskEvents.map((event: any) => event.orderId).filter(Boolean)))
    const shopWhere: any = { id: { in: shopRiskOrderIds } }
    if (scopedRegionIds !== undefined || regionId) {
      const allowedRegionIds = regionId ? [regionId] : scopedRegionIds
      shopWhere.merchant = { is: { regionId: { in: allowedRegionIds } } }
    }
    if (keyword) {
      shopWhere.OR = [
        { orderNo: { contains: keyword } },
        { receiverName: { contains: keyword } },
        { receiverPhone: { contains: keyword } },
        { merchant: { is: { name: { contains: keyword } } } },
        { user: { is: { nickname: { contains: keyword } } } },
      ]
    }
    if (startDate || endDate) {
      shopWhere.createdAt = {}
      if (startDate) shopWhere.createdAt.gte = new Date(startDate)
      if (endDate) shopWhere.createdAt.lte = new Date(String(endDate).includes('T') ? endDate : `${endDate}T23:59:59.999Z`)
    }
    const [shopOrders, errandTotal] = await Promise.all([
      shopRiskOrderIds.length
        ? this.prisma.order.findMany({
            where: shopWhere,
            orderBy: { createdAt: 'desc' },
            include: {
              user: { select: { id: true, nickname: true, phone: true, avatar: true } },
              merchant: { select: { id: true, name: true, regionId: true } },
            },
          })
        : [],
      this.prisma.errandOrder.count({ where }),
    ])
    const shopRisksByOrder = new Map<string, any[]>()
    for (const event of shopRiskEvents) {
      const events = shopRisksByOrder.get(event.orderId) || []
      events.push(event)
      shopRisksByOrder.set(event.orderId, events)
    }
    const shopRows = shopOrders.map((row: any) => {
      const events = shopRisksByOrder.get(row.id) || []
      return {
        ...row,
        orderType: 'shop',
        title: row.merchant?.name || '外卖配送订单',
        user: row.user || null,
        price: Number(row.payAmount || 0),
        openRiskEvents: events,
        abnormalReason: events.map((event: any) => event.description || event.eventType).filter(Boolean).join('；') || '配送异常',
      }
    })
    const shopPageRows = shopRows.slice(offset, offset + size)
    const remaining = size - shopPageRows.length
    const errandSkip = Math.max(0, offset - shopRows.length)
    const list = remaining > 0
      ? await this.prisma.errandOrder.findMany({
          where,
          skip: errandSkip,
          take: remaining,
          orderBy: { createdAt: 'desc' },
          include: {
            User: { select: { id: true, nickname: true, phone: true, avatar: true } },
            RegionRider: { select: { id: true, userId: true, realName: true, phone: true, riderType: true, riskLevel: true, violationCount: true } },
            tasks: { orderBy: { sortOrder: 'asc' } },
          },
        })
      : []
    const openRiskEvents = list.length
      ? await this.prisma.deliveryRiskEvent.findMany({
          where: { orderType: 'errand', handled: false, orderId: { in: list.map((row: any) => row.id) } },
          orderBy: { createdAt: 'asc' },
        }).catch(() => [])
      : []
    const risksByOrder = new Map<string, any[]>()
    for (const event of openRiskEvents) {
      const events = risksByOrder.get(event.orderId) || []
      events.push(event)
      risksByOrder.set(event.orderId, events)
    }
    return {
      list: [...shopPageRows, ...list.map(row => {
        const events = risksByOrder.get(row.id) || []
        return {
          ...this.formatOrder(row),
          orderType: 'errand',
          openRiskEvents: events,
          abnormalReason: events.map(event => event.description || event.eventType).filter(Boolean).join('；') || row.cancelReason || '订单状态异常',
        }
      })],
      total: shopRows.length + errandTotal,
      page: pageNumber,
      pageSize: size,
    }
  }

  // ==================== Fee Config ====================

  async getFeeConfig(regionId?: string, operatorId?: string) {
    await this.assertRequestedRegion(regionId, operatorId)
    const configRegionId = this.resolveConfigRegionId(regionId)
    let config = await this.prisma.errandConfig.findUnique({ where: { regionId: configRegionId } })
    if (!config) {
      config = await this.prisma.errandConfig.create({ data: { regionId: configRegionId } as any })
    }
    const extended = await this.getExtendedConfig(configRegionId, this.numberValue(config.basePrice, 0))
    return {
      ...config,
      ...extended,
      miniConfig: buildMiniErrandConfig(config, extended),
    }
  }

  async updateFeeConfig(regionId: string | undefined, dto: UpdateFeeConfigDto, operatorId?: string) {
    await this.assertRequestedRegion(regionId, operatorId)
    const configRegionId = this.resolveConfigRegionId(regionId)
    const cleanDto = this.omitPersistedMeta(dto as any)
    const { scalar, extended } = splitErrandConfigPayload(cleanDto)
    const config = await this.prisma.errandConfig.upsert({
      where: { regionId: configRegionId },
      update: scalar as any,
      create: { regionId: configRegionId, ...scalar } as any,
    })
    if (Object.keys(extended).length) {
      await this.saveExtendedConfig(configRegionId, extended, this.numberValue(config.basePrice, 0))
    }
    return this.getFeeConfig(configRegionId)
  }

  // ==================== Page Config ====================

  async getPageConfig(regionId?: string, operatorId?: string) {
    await this.assertRequestedRegion(regionId, operatorId)
    const configRegionId = this.resolveConfigRegionId(regionId)
    let config = await this.prisma.errandPageConfig.findUnique({ where: { regionId: configRegionId } })
    if (!config) {
      config = await this.prisma.errandPageConfig.create({ data: { regionId: configRegionId } })
    }
    return config
  }

  async updatePageConfig(regionId: string | undefined, dto: UpdatePageConfigDto, operatorId?: string) {
    await this.assertRequestedRegion(regionId, operatorId)
    const configRegionId = this.resolveConfigRegionId(regionId)
    const payload = this.omitPersistedMeta(dto as any)
    return this.prisma.errandPageConfig.upsert({
      where: { regionId: configRegionId },
      update: payload as any,
      create: { regionId: configRegionId, ...payload },
    })
  }

  // ==================== Reward/Punish ====================

  async getRewardPunish(regionId?: string, operatorId?: string) {
    await this.assertRequestedRegion(regionId, operatorId)
    const configRegionId = this.resolveConfigRegionId(regionId)
    let config = await this.prisma.errandRewardPunish.findUnique({ where: { regionId: configRegionId } })
    if (!config) {
      config = await this.prisma.errandRewardPunish.create({ data: { regionId: configRegionId } })
    }
    return config
  }

  async updateRewardPunish(regionId: string | undefined, dto: UpdateRewardPunishDto, operatorId?: string) {
    await this.assertRequestedRegion(regionId, operatorId)
    const configRegionId = this.resolveConfigRegionId(regionId)
    const payload = this.omitPersistedMeta(dto as any)
    return this.prisma.errandRewardPunish.upsert({
      where: { regionId: configRegionId },
      update: payload as any,
      create: { regionId: configRegionId, ...payload },
    })
  }
}
