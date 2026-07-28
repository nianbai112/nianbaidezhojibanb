import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { RedisService } from '../../common/services/redis.service';
import { WalletService } from '../../common/services/wallet.service';
import { NotifyService } from '../notify/notify.service';
import { MembershipService } from '../membership/membership.service';
import { UserAccessPolicyService } from '../../common/services/user-access-policy.service';
import { PaymentService } from '../payment/payment.service';
import {
  ERRAND_EXTENDED_CONFIG_GROUP,
  buildMiniErrandConfig,
  defaultErrandMiniPageConfig,
  errandExtendedConfigKey,
  internalErrandTypeToMini,
  mergeErrandExtendedConfig,
  miniErrandStatus,
  normalizeErrandExtendedConfig,
  splitErrandConfigPayload,
} from './errand-config.util';
import {
  addMinutes,
  assessErrandDispatch,
  createErrandReservationOptions,
  enrichErrandOrdersForDispatch,
  estimateErrandDelivery,
  formatEtaRange,
  isSameArea as isSameErrandDispatchArea,
  toBackendDateTime,
} from './errand-dispatch-algorithm';
import { assessErrandRisk } from './errand-risk-engine';
import {
  assessApprovedRiderFallbackEligibility,
  assessErrandOrderTakingEligibility,
  getErrandFallbackReleaseAt,
  normalizeErrandOrderTakingPolicy,
  normalizeErrandReceiverType,
  policyToSnakeCase,
  resolveErrandReceiverType,
} from './errand-order-taking-policy';
import { ErrandQuoteResult, ErrandQuoteService } from './errand-quote.service';
import { ErrandLifecycleService } from './errand-lifecycle.service';
import { poolErrandProjection, publicErrandProjection } from './errand-privacy';

@Injectable()
export class ErrandService {
  private readonly logger = new Logger(ErrandService.name);
  private readonly maxErrandTaskCount = 10;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly notifyService: NotifyService,
    private readonly membershipService: MembershipService,
    private readonly userAccess: UserAccessPolicyService,
    private readonly paymentService: PaymentService,
    private readonly walletService: WalletService,
    private readonly errandQuoteService?: ErrandQuoteService,
    private readonly errandLifecycleService?: ErrandLifecycleService,
  ) {}

  private subsidyNo() {
    return `SUB${Date.now()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  }

  private async createSubsidyLedger(data: any) {
    const amount = this.numberValue(data?.amount, 0);
    if (amount <= 0) return null;
    return this.prisma.subsidyLedger.create({
      data: {
        subsidyNo: this.subsidyNo(),
        payerType: 'platform',
        status: 'pending',
        ...data,
        amount,
      },
    }).catch(() => null);
  }

  private async runWithLock<T>(key: string, message: string, fn: () => Promise<T>, ttlSeconds = 30): Promise<T> {
    const locked = await this.redis.getLock(key, ttlSeconds);
    if (!locked) throw new BadRequestException(message);
    try {
      return await fn();
    } finally {
      await this.redis.releaseLock(key).catch(() => undefined);
    }
  }

  private normalizeServiceType(serviceType?: string) {
    const value = String(serviceType || '').trim()
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
    return map[value] || value || 'universal'
  }

  private normalizeApplyTo(applyTo?: string) {
    const value = String(applyTo || '').trim()
    const map: Record<string, string> = {
      all: 'all',
      express: 'express',
      express_pickup: 'pickup',
      pickup: 'pickup',
      express_send: 'deliver',
      deliver: 'deliver',
      food: 'food',
      food_delivery: 'meal',
      meal: 'meal',
      custom_task: 'universal',
      universal: 'universal',
    }
    return map[value] || value || ''
  }

  private normalizePickupPointType(type?: string) {
    const value = String(type || '').trim()
    const map: Record<string, string> = {
      express: 'express',
      express_pickup: 'pickup',
      pickup: 'pickup',
      express_send: 'deliver',
      deliver: 'deliver',
      food: 'meal',
      food_delivery: 'meal',
      meal: 'meal',
    }
    return map[value] || value || ''
  }

  private boolFilter(value: any) {
    if (value === undefined || value === null || value === '') return undefined
    if (typeof value === 'boolean') return value
    return ['true', '1', 'yes', 'enabled', 'open'].includes(String(value).toLowerCase())
  }

  private serviceTitle(type: string) {
    const map: Record<string, string> = {
      pickup: '帮我取件',
      deliver: '帮我寄件',
      meal: '帮我取餐',
      universal: '万能任务',
    }
    return map[type] || '跑腿任务'
  }

  private numberValue(value: any, fallback = 0) {
    const n = Number(value)
    return Number.isFinite(n) ? n : fallback
  }

  private money(value: any) {
    return Math.round(this.numberValue(value, 0) * 100) / 100
  }

  private dayStart() {
    const date = new Date()
    date.setHours(0, 0, 0, 0)
    return date
  }

  private textValue(value: any, fallback = '') {
    if (value === undefined || value === null) return fallback
    return String(value).trim()
  }

  private truncateText(value: any, max = 180, fallback = '') {
    const text = this.textValue(value, fallback)
    return text.length > max ? text.slice(0, max) : text
  }

  private compactErrandTask(task: any = {}, lean = false) {
    const compact: any = {
      task_type: this.truncateText(task.task_type, 32),
    }
    const assign = (key: string, value: any, max = 60) => {
      const text = this.truncateText(value, max)
      if (text) compact[key] = text
    }
    assign('pickup_point_id', task.pickup_point_id, 48)
    assign('item_size_id', task.item_size_id, 48)
    assign('code', task.code || task.pickup_code, 40)
    assign('express_company', task.express_company, 40)
    assign('platform', task.platform, 40)
    if (!lean) {
      assign('description', task.description || task.item_description, 80)
      assign('recipient_address', task.recipient_address, 120)
      assign('pickup_address', task.pickup_address, 120)
      if (Array.isArray(task.image_urls) && task.image_urls.length) {
        compact.image_count = task.image_urls.length
      }
    }
    return Object.fromEntries(Object.entries(compact).filter(([, value]) => value !== undefined && value !== null && value !== ''))
  }

  private compactRiskAssessment(risk: any = {}) {
    if (!risk || typeof risk !== 'object') return null
    return {
      risk_level: risk.risk_level,
      risk_score: risk.risk_score,
      risk_tags: Array.isArray(risk.risk_tags) ? risk.risk_tags.slice(0, 8) : [],
      required_evidence: Array.isArray(risk.required_evidence) ? risk.required_evidence.slice(0, 6) : [],
      dispatch_constraints: {
        can_dispatch: risk.dispatch_constraints?.can_dispatch !== false,
        allow_stacking: risk.dispatch_constraints?.allow_stacking !== false,
        max_active_orders: risk.dispatch_constraints?.max_active_orders,
        push_scope: risk.dispatch_constraints?.push_scope,
      },
      extra_eta_minutes: risk.extra_eta_minutes || 0,
    }
  }

  private buildMiniOrderRemark(dto: any, tasks: any[], meta: any) {
    const build = (payload: any) => JSON.stringify(payload)
    const riskAssessment = this.compactRiskAssessment(meta.riskAssessment)
    const base = {
      source: 'mini_program',
      service_type: dto?.service_type,
      base_price: meta.basePrice,
      item_size_fee: meta.taskSizeFee,
      approved_rider_surcharge_amount: meta.approvedRiderSurchargeAmount || 0,
      address_id: meta.addressId || null,
      delivery_mode: meta.deliveryMode || dto?.delivery_mode || dto?.deliveryMode || undefined,
      delivery_time: dto?.delivery_time || null,
      estimated_delivery_time: dto?.estimated_delivery_time || dto?.estimatedDeliveryTime || dto?.delivery_time || null,
      eta_notice: dto?.eta_notice || dto?.etaNotice || undefined,
      eta_source: meta.etaSource || undefined,
      receiver_type: meta.requestedReceiverType || meta.receiverType || dto?.receiver_type || dto?.receiverType || undefined,
      requested_receiver_type: meta.requestedReceiverType || meta.receiverType || dto?.receiver_type || dto?.receiverType || undefined,
      final_receiver_type: meta.finalReceiverType || meta.requestedReceiverType || meta.receiverType || undefined,
      fallback_to_rider_enabled: !!meta.fallbackToRiderEnabled,
      ordinary_user_fallback_minutes: meta.ordinaryUserFallbackMinutes || undefined,
      fallback_release_at: meta.fallbackReleaseAt || undefined,
      fallback_upgrade_fee: 0,
      risk_assessment: riskAssessment || undefined,
    }
    const full = build({ ...base, tasks: tasks.map((task) => this.compactErrandTask(task)) })
    if (full.length <= 180) return full

    const lean = build({ ...base, tasks: tasks.map((task) => this.compactErrandTask(task, true)) })
    if (lean.length <= 180) return lean

    const firstTask = tasks[0] ? this.compactErrandTask(tasks[0], true) : null
    const first = build({ ...base, task_count: tasks.length, tasks: firstTask ? [firstTask] : [] })
    if (first.length <= 180) return first

    return build({
      source: 'mini_program',
      service_type: dto?.service_type,
      task_count: tasks.length,
      address_id: meta.addressId || null,
      delivery_mode: meta.deliveryMode || dto?.delivery_mode || dto?.deliveryMode || undefined,
      delivery_time: dto?.delivery_time || null,
      estimated_delivery_time: dto?.estimated_delivery_time || dto?.estimatedDeliveryTime || dto?.delivery_time || null,
      eta_source: meta.etaSource || undefined,
      receiver_type: meta.requestedReceiverType || meta.receiverType || dto?.receiver_type || dto?.receiverType || undefined,
      requested_receiver_type: meta.requestedReceiverType || meta.receiverType || dto?.receiver_type || dto?.receiverType || undefined,
      final_receiver_type: meta.finalReceiverType || meta.requestedReceiverType || meta.receiverType || undefined,
      fallback_to_rider_enabled: !!meta.fallbackToRiderEnabled,
      ordinary_user_fallback_minutes: meta.ordinaryUserFallbackMinutes || undefined,
      fallback_release_at: meta.fallbackReleaseAt || undefined,
      approved_rider_surcharge_amount: meta.approvedRiderSurchargeAmount || 0,
      risk_level: riskAssessment?.risk_level || undefined,
      risk_tags: riskAssessment?.risk_tags?.slice(0, 4) || undefined,
    })
  }

  private parseErrandPayableDate(value: any) {
    if (!value) return null
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
    if (typeof value === 'number') {
      const date = new Date(value)
      return Number.isNaN(date.getTime()) ? null : date
    }
    if (typeof value !== 'string') return null
    const text = value.trim()
    if (!text) return null
    const normalized = text.includes('T') ? text : text.replace(/-/g, '/')
    const date = new Date(normalized)
    return Number.isNaN(date.getTime()) ? null : date
  }

  private assertErrandOrderPayableNow(order: any, now = new Date()) {
    if (!order) throw new BadRequestException('跑腿订单不存在')
    const remark = this.parseOrderRemark(order)
    const current = this.parseErrandPayableDate(now) || new Date()
    const deliveryTime = this.parseErrandPayableDate(remark.delivery_time || order.deliverTime)
    if (deliveryTime && deliveryTime.getTime() <= current.getTime()) {
      throw new BadRequestException('跑腿订单时间已过期，请重新下单')
    }
    const createdAt = this.parseErrandPayableDate(order.createdAt)
    if (createdAt && createdAt.getTime() + 15 * 60 * 1000 <= current.getTime()) {
      throw new BadRequestException('跑腿订单时间已过期，请重新下单')
    }
  }

  private async getRegionDispatchStats(regionId?: string | null) {
    const whereRegion = regionId ? { regionId } : {}
    const riderDeliveryWhere = { in: ['platform_rider', 'rider_delivery'] }
    const [activeRiderCount, activeErrandCount, activeShopCount] = await Promise.all([
      this.prisma.regionRider.count({
        where: {
          ...whereRegion,
          verifyStatus: 'approved',
          status: 'online',
        },
      }),
      this.prisma.errandOrder.count({
        where: {
          ...whereRegion,
          status: { in: ['accepted', 'in_progress', 'arrived'] },
        },
      }),
      this.prisma.order.count({
        where: {
          merchant: whereRegion,
          deliveryMode: riderDeliveryWhere,
          status: 'SHIPPED' as any,
        },
      }).catch(() => 0),
    ])
    const totalActiveOrders = activeErrandCount + activeShopCount
    return {
      activeRiderCount,
      activeOrdersCount: totalActiveOrders,
      averageRiderLoad: activeRiderCount > 0 ? totalActiveOrders / activeRiderCount : 0,
    }
  }

  /**
   * PERF-P0-01: 一次性统计一批骑手的在途单量（跑腿 accepted/in_progress/arrived + 外卖 SHIPPED），
   * 用 2 次 groupBy 取代"每骑手 2 次 count"的 N+1 扇出。返回 userId -> 在途单量 的 Map。
   */
  private async getActiveOrderCountsByRider(riderIds: string[]): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    const ids = Array.from(new Set(riderIds.filter(Boolean)));
    if (!ids.length) return result;
    const [errandGroups, shopGroups] = await Promise.all([
      this.prisma.errandOrder.groupBy({
        by: ['riderId'],
        where: { riderId: { in: ids }, status: { in: ['accepted', 'in_progress', 'arrived'] } },
        _count: { _all: true },
      }).catch(() => [] as any[]),
      this.prisma.order.groupBy({
        by: ['riderId'],
        where: { riderId: { in: ids }, status: 'SHIPPED' as any },
        _count: { _all: true },
      }).catch(() => [] as any[]),
    ]);
    for (const group of errandGroups as any[]) {
      if (!group.riderId) continue;
      result.set(group.riderId, (result.get(group.riderId) || 0) + (group._count?._all || 0));
    }
    for (const group of shopGroups as any[]) {
      if (!group.riderId) continue;
      result.set(group.riderId, (result.get(group.riderId) || 0) + (group._count?._all || 0));
    }
    return result;
  }

  private async getRiderDispatchContext(userId: string, tx: any = this.prisma) {
    const [activeErrandCount, activeShopCount] = await Promise.all([
      tx.errandOrder.count({
        where: {
          riderId: userId,
          status: { in: ['accepted', 'in_progress', 'arrived'] },
        },
      }),
      tx.order.count({
        where: {
          riderId: userId,
          status: 'SHIPPED' as any,
        },
      }).catch(() => 0),
    ])
    return {
      active_orders_count: activeErrandCount + activeShopCount,
      activeOrdersCount: activeErrandCount + activeShopCount,
    }
  }

  private buildDispatchOrderPayload(order: any) {
    const remark = this.parseOrderRemark(order)
    const payload = {
      type: 'errand',
      status: miniErrandStatus(order?.status || 'pending_accept'),
      raw_status: order?.status,
      service_type: internalErrandTypeToMini(order?.type),
      delivery_time: remark.delivery_time || order?.deliverTime || order?.createdAt,
      delivery_address: order?.deliverAddress,
      address: order?.deliverAddress,
      details: this.rawOrderTasks(order),
      tasks: this.rawOrderTasks(order),
    }
    const riskAssessment = remark.risk_assessment || assessErrandRisk(payload)
    return {
      ...payload,
      risk_assessment: riskAssessment,
      errand_risk: riskAssessment,
      dispatch_constraints: riskAssessment?.dispatch_constraints,
    }
  }

  private buildRiskInput(dto: any = {}, tasks: any[] = [], extra: any = {}) {
    return {
      service_type: dto?.service_type || extra.serviceType || internalErrandTypeToMini(this.normalizeServiceType(dto?.type)),
      task_count: Math.max(1, tasks.length || Number(dto?.task_count || 1)),
      tasks,
      delivery_address: extra.deliveryAddress || dto?.delivery_address || dto?.deliver_address || dto?.address || '',
      pickup_address: extra.pickupAddress || dto?.pickup_address || '',
      delivery_distance_meters: dto?.delivery_distance_meters ?? dto?.distance_meters ?? dto?.distance,
      declared_value_yuan: dto?.declared_value_yuan ?? dto?.declaredValueYuan ?? dto?.value_amount ?? dto?.valueAmount,
      fragile: dto?.fragile,
      liquid: dto?.liquid,
      cake: dto?.cake,
      hot: dto?.hot,
      cold: dto?.cold,
      large: dto?.large,
      heavy: dto?.heavy,
      valuable: dto?.valuable,
      prohibited: dto?.prohibited,
      configured_extra_eta_minutes: dto?.configured_extra_eta_minutes ?? dto?.risk_extra_eta_minutes ?? dto?.riskExtraEtaMinutes,
      description: dto?.description,
    }
  }

  async previewOrderRisk(dto: any = {}) {
    const tasks = Array.isArray(dto?.tasks) ? dto.tasks : []
    const risk = assessErrandRisk(this.buildRiskInput(dto, tasks, {
      deliveryAddress: dto?.delivery_address || dto?.deliver_address || dto?.address,
      pickupAddress: dto?.pickup_address,
      serviceType: dto?.service_type,
    }))
    return {
      success: true,
      data: {
        risk_source: 'backend',
        ...risk,
      },
    }
  }

  private async recordErrandLearningSnapshot(eventType: string, payload: any = {}) {
    const key = 'rider_learning_snapshots_v1'
    const snapshot = {
      id: `rls_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      event_type: eventType,
      order_id: payload.orderId || null,
      order_no: payload.orderNo || null,
      region_id: payload.regionId || null,
      service_type: payload.serviceType || null,
      order_status: payload.orderStatus || null,
      rider_id: payload.riderId || null,
      receiver_type: payload.receiverType || null,
      risk: payload.risk?.learning_snapshot || payload.risk || {},
      rider_load: payload.riderLoad ?? null,
      outcome_label: payload.outcomeLabel || null,
      outcome_meta: payload.outcomeMeta || {},
      created_at: new Date().toISOString(),
    }
    const current = await this.prisma.config.findUnique({ where: { key } }).catch(() => null)
    const list = Array.isArray((current?.value as any)?.list) ? (current?.value as any).list : []
    const next = [...list, snapshot].slice(-500)
    await this.prisma.config.upsert({
      where: { key },
      update: { value: { list: next, updated_at: new Date().toISOString() }, group: 'analytics' },
      create: { key, value: { list: next, updated_at: new Date().toISOString() }, group: 'analytics', desc: '骑手算法学习快照' },
    }).catch(() => undefined)
  }

  private isErrandCompletionLate(order: any) {
    const remark = this.parseOrderRemark(order)
    const deadline = this.parseErrandPayableDate(
      remark.estimated_delivery_time ||
        remark.estimatedDeliveryTime ||
        remark.delivery_time ||
        remark.deliveryTime,
    )
    const finishTime = this.parseErrandPayableDate(order?.completeTime || order?.deliverTime)
    return !!deadline && !!finishTime && finishTime.getTime() > deadline.getTime()
  }

  private learningOutcomeForErrandStatus(status: string, order: any) {
    if (status === 'completed') return this.isErrandCompletionLate(order) ? 'timeout' : 'completed'
    if (status === 'cancelled') return 'cancelled'
    if (status === 'accepted') return 'accepted'
    if (status === 'in_progress') return 'picked_up'
    if (status === 'arrived') return 'arrived'
    return status || 'updated'
  }

  async estimateOrderTiming(dto: any = {}) {
    const regionId = this.cleanRegionId(dto?.region_id ?? dto?.regionId)
    const serviceType = String(dto?.service_type || internalErrandTypeToMini(this.normalizeServiceType(dto?.type)) || 'express_pickup')
    const tasks = Array.isArray(dto?.tasks) ? dto.tasks : []
    const deliveryAddress = dto?.delivery_address || dto?.deliver_address || dto?.address || dto?.recipient_address || ''
    const orderLike = {
      type: 'errand',
      status: 'confirmed',
      service_type: serviceType,
      delivery_address: deliveryAddress,
      address: deliveryAddress,
      details: tasks,
      tasks,
    }
    const stats = await this.getRegionDispatchStats(regionId)
    const risk = assessErrandRisk(this.buildRiskInput(dto, tasks, { deliveryAddress, serviceType }))
    const estimate = estimateErrandDelivery({
      now: new Date(),
      serviceType,
      taskCount: Math.max(1, tasks.length || Number(dto?.task_count || 1)),
      sameArea: isSameErrandDispatchArea(orderLike),
      activeRiderCount: stats.activeRiderCount,
      currentRiderLoad: stats.averageRiderLoad,
    })
    if (risk.extra_eta_minutes > 0) {
      estimate.latestAt = addMinutes(estimate.latestAt, risk.extra_eta_minutes)
      estimate.latestBuffer += risk.extra_eta_minutes
      estimate.totalMinutes += risk.extra_eta_minutes
      estimate.notice = [estimate.notice, risk.user_notice].filter(Boolean).join('；')
    }
    const rangeText = formatEtaRange(estimate)
    const latestTime = toBackendDateTime(estimate.latestAt)
    const splitLabel = (label = '') => {
      const [day, time] = String(label).split(/\s+/)
      return { label: day || label, subLabel: time || '' }
    }
    const reservationOptions = createErrandReservationOptions(estimate, { intervalMinutes: 15, count: 24 }).map((item: any) => {
      const label = splitLabel(item.label)
      return {
        label: label.label,
        subLabel: label.subLabel,
        displayLabel: item.label,
        value: item.value,
        mode: 'scheduled',
        estimated_delivery_time: item.value,
        estimate_source: 'backend',
        notice: '',
      }
    })
    return {
      success: true,
      data: {
        estimate_source: 'backend',
        delivery_mode: 'immediate',
        estimated_delivery_time: latestTime,
        delivery_time: latestTime,
        earliest_delivery_time: toBackendDateTime(estimate.earliestAt),
        latest_delivery_time: latestTime,
        estimated_delivery_range_text: rangeText,
        notice: estimate.notice,
        active_rider_count: stats.activeRiderCount,
        average_rider_load: stats.averageRiderLoad,
        risk_source: 'backend',
        risk_level: risk.risk_level,
        risk_score: risk.risk_score,
        risk_tags: risk.risk_tags,
        required_confirmations: risk.required_confirmations,
        required_evidence: risk.required_evidence,
        dispatch_constraints: risk.dispatch_constraints,
        extra_eta_minutes: risk.extra_eta_minutes,
        options: [
          {
            label: '尽快送达',
            subLabel: `预计${rangeText}`,
            displayLabel: `尽快送达 · 预计${rangeText}`,
            value: latestTime,
            mode: 'immediate',
            estimated_delivery_time: latestTime,
            estimate_source: 'backend',
            notice: estimate.notice,
          },
          ...reservationOptions,
        ],
      },
    }
  }

  private taskBudgetAmount(task: any) {
    const raw = this.numberValue(task?.budget ?? task?.budget_amount, NaN)
    if (!Number.isFinite(raw) || raw <= 0) return null
    return raw > 100 ? Math.round(raw) / 100 : raw
  }

  private buildErrandTaskRows(orderId: string, tasks: any[], sizeFeeMap: Map<string, number>) {
    return tasks.map((task: any, index: number) => {
      const itemSizeId = this.cleanRegionId(task?.item_size_id)
      const imageUrls = Array.isArray(task?.image_urls) ? task.image_urls.filter(Boolean).slice(0, 9) : []
      return {
        orderId,
        sortOrder: index,
        taskType: this.truncateText(task?.task_type || 'custom_task', 40, 'custom_task'),
        itemSizeId: itemSizeId || null,
        pickupPointId: this.cleanRegionId(task?.pickup_point_id) || null,
        expressCompany: this.truncateText(task?.express_company, 80) || null,
        platform: this.truncateText(task?.platform, 80) || null,
        code: this.truncateText(task?.code || task?.pickup_code, 80) || null,
        description: this.truncateText(task?.description, 500) || null,
        itemDescription: this.truncateText(task?.item_description, 500) || null,
        pickupAddress: this.truncateText(task?.pickup_address, 500) || null,
        recipientAddress: this.truncateText(task?.recipient_address, 500) || null,
        budgetAmount: this.taskBudgetAmount(task),
        computedFee: this.numberValue(sizeFeeMap.get(itemSizeId), 0),
        imageUrls: imageUrls.length ? imageUrls : undefined,
        metadata: {
          image_count: imageUrls.length,
          location: task?.location || null,
        },
      }
    })
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

  private rawOrderTasks(row: any, taskMap?: Map<string, any[]>) {
    const relationTasks = Array.isArray(row?.tasks) && row.tasks.length
      ? row.tasks
      : taskMap?.get(row?.id) || []
    if (relationTasks.length) return relationTasks.map((task: any) => this.taskRowToPayload(task))
    const remark = this.parseOrderRemark(row)
    return Array.isArray(remark.tasks) ? remark.tasks : []
  }

  private cleanRegionId(value: any) {
    if (value === undefined || value === null) return ''
    const text = String(value).trim()
    if (!text || text === 'NaN' || text === 'null' || text === 'undefined' || text === '0') return ''
    return text
  }

  private omitPersistedMeta<T extends Record<string, any>>(dto: T): Omit<T, 'id' | 'createdAt' | 'updatedAt'> {
    const { id, createdAt, updatedAt, ...payload } = dto || ({} as T)
    return payload
  }

  private hasTaskValue(value: any) {
    return value !== undefined && value !== null && String(value).trim() !== ''
  }

  private validateMultiTaskList(type: string, tasks: any[]) {
    if (!['pickup', 'meal'].includes(type)) return
    const label = type === 'pickup' ? '取件任务' : '取餐任务'
    if (!tasks.length) throw new BadRequestException(`请至少添加1个${label}`)
    if (tasks.length > this.maxErrandTaskCount) {
      throw new BadRequestException(`一次最多提交${this.maxErrandTaskCount}个${label}`)
    }
    tasks.forEach((task, index) => {
      if (!task || typeof task !== 'object' || Array.isArray(task)) {
        throw new BadRequestException(`${label}${index + 1}信息格式错误`)
      }
      const missing: string[] = []
      if (type === 'pickup' && !this.hasTaskValue(task.express_company)) missing.push('快递公司')
      if (type === 'meal' && !this.hasTaskValue(task.platform)) missing.push('外卖平台')
      if (!this.hasTaskValue(task.pickup_point_id)) missing.push(type === 'pickup' ? '取件点' : '取餐点')
      if (!this.hasTaskValue(task.code)) missing.push(type === 'pickup' ? '取件码' : '取餐码')
      if (!this.hasTaskValue(task.item_size_id)) missing.push(type === 'pickup' ? '快递大小' : '餐品大小')
      if (missing.length) throw new BadRequestException(`${label}${index + 1}缺少：${missing.join('、')}`)
    })
  }

  private normalizeRiderStatus(status?: string) {
    const value = String(status || '').trim().toLowerCase()
    const map: Record<string, string> = {
      available: 'online',
      online: 'online',
      receiving: 'online',
      offline: 'offline',
      rest: 'offline',
      busy: 'busy',
      delivering: 'busy',
    }
    return map[value] || value || 'offline'
  }

  private normalizeRiderAccountStatus(verifyStatus?: string) {
    const value = String(verifyStatus || '').trim().toLowerCase()
    if (value === 'approved') return 'normal'
    if (value === 'rejected') return 'rejected'
    if (value === 'banned') return 'banned'
    return 'pending'
  }

  private normalizeMiniOrderStatus(status?: string) {
    const value = String(status || '').trim()
    const map: Record<string, string> = {
      awaiting_delivery: 'pending_accept',
      ReceivedOrder: 'accepted',
      received: 'accepted',
      dispatched: 'accepted',
      picked_up: 'in_progress',
      delivering: 'in_progress',
      delivered: 'completed',
      completed: 'completed',
      confirmed: 'pending_accept',
      paid: 'pending_accept',
    }
    return map[value] || value
  }

  private statusTimeData(nextStatus: string) {
    const now = new Date()
    if (nextStatus === 'accepted') return { acceptTime: now }
    if (nextStatus === 'in_progress') return { pickupTime: now }
    if (nextStatus === 'arrived') return { deliverTime: now }
    if (nextStatus === 'completed') return { completeTime: now }
    if (nextStatus === 'cancelled') return { cancelTime: now }
    return {}
  }

  private normalizeRiderType(value?: string) {
    const text = String(value || '').trim().toLowerCase()
    const map: Record<string, string> = {
      ordinary_user: 'ordinary_user',
      user: 'ordinary_user',
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
        operatorType: params.operatorType || 'rider',
        riderType: this.normalizeRiderType(params.riderType),
        displayMode: params.displayMode || 'status_nodes',
        lat: Number.isFinite(Number(params.lat)) ? Number(params.lat) : null,
        lng: Number.isFinite(Number(params.lng)) ? Number(params.lng) : null,
        address: params.address || null,
        proofImages: Array.isArray(params.proofImages) ? params.proofImages : undefined,
        remark: params.remark || null,
      },
    }).catch((error: any) => {
      this.logger.warn(`记录配送节点失败: ${error?.message || error}`)
      return null
    })
  }

  private async getDeliveryTrack(order: any, nodes?: any[]) {
    const rider = order?.RegionRider || order?.rider || null
    const displayMode = this.deliveryDisplayModeForRider(rider, order?.deliveryDisplayMode)
    const riderType = this.normalizeRiderType(rider?.riderType)
    const deliveryNodes = nodes || await this.prisma.deliveryOrderNode.findMany({
      where: { orderId: order.id, orderType: 'errand' },
      orderBy: { createdAt: 'asc' },
    }).catch(() => [])
    const locationUpdatedAt = rider?.locationUpdatedAt || null
    const locationAgeSeconds = locationUpdatedAt
      ? Math.max(0, Math.floor((Date.now() - new Date(locationUpdatedAt).getTime()) / 1000))
      : null
    const hasFreshLocation = displayMode === 'live_map'
      && riderType === 'official'
      && rider?.lat !== null && rider?.lat !== undefined
      && rider?.lng !== null && rider?.lng !== undefined
      && Number.isFinite(Number(rider?.lat))
      && Number.isFinite(Number(rider?.lng))
      && locationAgeSeconds !== null
      && locationAgeSeconds <= 300
    return {
      display_mode: displayMode,
      rider_type: riderType,
      can_show_live_map: hasFreshLocation,
      estimated_arrival_text: hasFreshLocation ? '骑手正在配送中' : '以骑手更新的配送节点为准',
      location_stale: displayMode === 'live_map' && !hasFreshLocation,
      current_location: hasFreshLocation ? {
        latitude: Number(rider.lat),
        longitude: Number(rider.lng),
        updated_at: locationUpdatedAt,
      } : null,
      nodes: deliveryNodes.map((node: any) => ({
        id: node.id,
        type: node.nodeType,
        label: node.nodeLabel || this.deliveryNodeLabel(node.nodeType),
        time: node.createdAt,
        address: node.address || '',
        remark: node.remark || '',
      })),
    }
  }

  private async requireApprovedRider(userId: string, regionId?: string | null) {
    const rider = await this.prisma.regionRider.findUnique({
      where: { userId },
      include: { User: { select: { id: true, nickname: true, avatar: true, phone: true } } },
    })
    if (!rider) throw new BadRequestException('请先申请成为骑手')
    if (rider.verifyStatus !== 'approved') throw new BadRequestException('骑手账号未通过审核')
    if (regionId && rider.regionId !== regionId) throw new BadRequestException('不能接其他区域的订单')
    return rider
  }

  private publicRiderProfile(rider: any) {
    if (!rider) return null
    const user = rider.User || rider.user || null
    const isAnonymous = !!rider.anonymous
    if (isAnonymous) {
      return {
        id: rider.id,
        rider_id: rider.id,
        user_id: '',
        full_name: '匿名骑手',
        real_name: '匿名骑手',
        name: '匿名骑手',
        phone_number: '',
        phone: '',
        avatar: '/static/logo.jpg',
        nickname: '匿名骑手',
        anonymous: 1,
        is_anonymous: true,
        isAnonymous: true,
        status: this.normalizeRiderStatus(rider.status),
        rating: rider.rating || 5,
        rider_type: this.normalizeRiderType(rider.riderType),
        risk_level: rider.riskLevel || 'normal',
        violation_count: rider.violationCount || 0,
      }
    }
    return {
      id: rider.id,
      rider_id: rider.id,
      user_id: rider.userId,
      full_name: rider.realName || '',
      real_name: rider.realName || '',
      name: rider.realName || user?.nickname || '骑手',
      phone_number: rider.phone || user?.phone || '',
      phone: rider.phone || user?.phone || '',
      avatar: user?.avatar || '/static/logo.jpg',
      nickname: user?.nickname || rider.realName || '骑手',
      anonymous: 0,
      is_anonymous: false,
      isAnonymous: false,
      status: this.normalizeRiderStatus(rider.status),
      rating: rider.rating || 5,
      rider_type: this.normalizeRiderType(rider.riderType),
      risk_level: rider.riskLevel || 'normal',
      violation_count: rider.violationCount || 0,
    }
  }

  private formatRiderInfo(rider: any, privateView = false) {
    if (!rider) return null
    const user = rider.User || rider.user || null
    const publicProfile = this.publicRiderProfile(rider)
    if (!privateView && rider.anonymous) {
      return {
        ...publicProfile,
        region_id: rider.regionId,
        alipay_account: '',
        rider_bio: rider.riderBio || '',
        notification_status: rider.notificationStatus === false ? 0 : 1,
        account_status: this.normalizeRiderAccountStatus(rider.verifyStatus),
        verify_status: rider.verifyStatus,
        riderType: this.normalizeRiderType(rider.riderType),
        riskLevel: rider.riskLevel || 'normal',
        violationCount: rider.violationCount || 0,
        rider_rank: 1,
        total_orders: rider.totalOrders || 0,
        today_orders: rider.todayOrders || 0,
      }
    }
    return {
      ...rider,
      user_id: rider.userId,
      region_id: rider.regionId,
      full_name: rider.realName || '',
      real_name: rider.realName || '',
      phone_number: rider.phone || user?.phone || '',
      phone: rider.phone || user?.phone || '',
      alipay_account: rider.alipayAccount || '',
      rider_bio: rider.riderBio || '',
      notification_status: rider.notificationStatus === false ? 0 : 1,
      anonymous: rider.anonymous ? 1 : 0,
      is_anonymous: !!rider.anonymous,
      isAnonymous: !!rider.anonymous,
      status: this.normalizeRiderStatus(rider.status),
      account_status: this.normalizeRiderAccountStatus(rider.verifyStatus),
      verify_status: rider.verifyStatus,
      rider_type: this.normalizeRiderType(rider.riderType),
      riderType: this.normalizeRiderType(rider.riderType),
      risk_level: rider.riskLevel || 'normal',
      riskLevel: rider.riskLevel || 'normal',
      violation_count: rider.violationCount || 0,
      violationCount: rider.violationCount || 0,
      rider_rank: 1,
      total_orders: rider.totalOrders || 0,
      today_orders: rider.todayOrders || 0,
      avatar: user?.avatar || '/static/logo.jpg',
      nickname: user?.nickname || rider.realName || '骑手',
    }
  }

  private async getExtendedConfig(regionId: string, basePrice = 0) {
    const saved = await this.prisma.config.findUnique({
      where: { key: errandExtendedConfigKey(regionId) },
    }).catch(() => null)
    return normalizeErrandExtendedConfig(saved?.value, basePrice)
  }

  private async getOrderTakingPolicy(regionId?: string | null) {
    const cleanRegionId = this.cleanRegionId(regionId)
    if (!cleanRegionId) return normalizeErrandOrderTakingPolicy({})
    const config = await this.prisma.errandConfig.findUnique({
      where: { regionId: cleanRegionId },
    }).catch(() => null)
    const extended = await this.getExtendedConfig(cleanRegionId, this.numberValue(config?.basePrice, 0))
    return normalizeErrandOrderTakingPolicy(extended.orderTakingPolicy || extended.order_taking_policy)
  }

  private getApprovedRiderSurchargeAmount(receiverType: string, policy: any) {
    if (receiverType !== 'approved_rider') return 0
    const normalized = normalizeErrandOrderTakingPolicy(policy)
    return this.money(normalized.approvedRiderSurchargeAmount)
  }

  private getOrderRequestedReceiverType(order: any, policy: any) {
    const remark = this.parseOrderRemark(order)
    return normalizeErrandReceiverType(
      order?.requested_receiver_type ??
        order?.requestedReceiverType ??
        order?.receiver_type ??
        order?.receiverType ??
        remark.requested_receiver_type ??
        remark.requestedReceiverType ??
        remark.receiver_type ??
        remark.receiverType,
      { ...normalizeErrandOrderTakingPolicy(policy), receiverChoiceEnabled: true },
    )
  }

  private receiverTypeFromOrder(order: any, policy: any) {
    const remark = this.parseOrderRemark(order)
    return normalizeErrandReceiverType(
      order?.receiver_type ?? order?.receiverType ?? remark.receiver_type ?? remark.receiverType,
      policy,
    )
  }

  private displayReceiverTypeFromOrder(order: any) {
    const remark = this.parseOrderRemark(order)
    return normalizeErrandReceiverType(
      order?.receiver_type ?? order?.receiverType ?? remark.receiver_type ?? remark.receiverType,
      { ordinaryUserEnabled: true, receiverChoiceEnabled: true },
    )
  }

  private fallbackReleaseAtFromOrder(order: any, policy: any) {
    const remark = this.parseOrderRemark(order)
    return (
      order?.fallback_release_at ||
      order?.fallbackReleaseAt ||
      remark.fallback_release_at ||
      remark.fallbackReleaseAt ||
      getErrandFallbackReleaseAt(order, policy)
    )
  }

  private filterErrandRowsForApprovedRider(rows: any[], identity: any, now = new Date()) {
    return rows.filter((row) => {
      const eligibility = assessApprovedRiderFallbackEligibility({
        policy: identity.policy,
        order: row,
        now,
      })
      return eligibility.allowed
    })
  }

  private riskAssessmentFromOrder(order: any) {
    const remark = this.parseOrderRemark(order)
    if (remark.risk_assessment || remark.riskAssessment) return remark.risk_assessment || remark.riskAssessment
    return {
      risk_level: remark.risk_level || 'low',
      risk_tags: Array.isArray(remark.risk_tags) ? remark.risk_tags : [],
      dispatch_constraints: { can_dispatch: true },
    }
  }

  private async getOrdinaryOrderCounts(userId: string, tx: any = this.prisma) {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const [activeOrdersCount, todayOrdersCount] = await Promise.all([
      tx.errandOrder.count({ where: { riderId: userId, status: { in: ['accepted', 'in_progress', 'arrived'] } } }),
      tx.errandOrder.count({ where: { riderId: userId, acceptTime: { gte: todayStart } } }),
    ])
    return { activeOrdersCount, todayOrdersCount }
  }

  private async getOrderTakingIdentity(userId: string, query: any = {}) {
    const queryRegionId = this.cleanRegionId(query?.region_id ?? query?.regionId)
    const [rider, user] = await Promise.all([
      this.prisma.regionRider.findUnique({
        where: { userId },
        include: { User: { select: { id: true, nickname: true, avatar: true, phone: true } } },
      }).catch(() => null),
      this.prisma.user.findUnique({
        where: { id: userId },
        include: {
          studentVerify: {
            select: {
              status: true,
              schoolId: true,
              school: { select: { regionId: true } },
            },
          },
        },
      }).catch(() => null),
    ])

    if (rider?.verifyStatus === 'approved') {
      if (queryRegionId && rider.regionId !== queryRegionId) throw new BadRequestException('不能查看其他区域的订单')
      const policy = await this.getOrderTakingPolicy(rider.regionId)
      return {
        role: 'approved_rider',
        receiverType: 'approved_rider',
        regionId: rider.regionId,
        rider,
        user,
        policy,
        canTakeOrders: true,
        reason: '认证骑手可接单',
        counts: await this.getOrdinaryOrderCounts(userId),
      }
    }

    const inferredRegionId = queryRegionId || this.cleanRegionId(rider?.regionId) || this.cleanRegionId(user?.studentVerify?.school?.regionId)
    const policy = await this.getOrderTakingPolicy(inferredRegionId)
    const counts = await this.getOrdinaryOrderCounts(userId)
    const baseEligibility = assessErrandOrderTakingEligibility({
      receiverType: 'ordinary_user',
      policy,
      order: {
        service_type: policy.ordinaryUserTaskTypes?.[0] || 'express_pickup',
        receiver_type: 'ordinary_user',
      },
      risk: { risk_level: 'low', risk_tags: [], dispatch_constraints: { can_dispatch: true } },
      user,
      activeOrdersCount: counts.activeOrdersCount,
      todayOrdersCount: counts.todayOrdersCount,
    })

    return {
      role: 'ordinary_user',
      receiverType: 'ordinary_user',
      regionId: inferredRegionId,
      rider,
      user,
      policy,
      canTakeOrders: baseEligibility.allowed,
      reason: baseEligibility.reason,
      reasonCode: baseEligibility.reasonCode,
      counts,
    }
  }

  private formatOrderTakingIdentity(identity: any) {
    const policy = normalizeErrandOrderTakingPolicy(identity?.policy)
    return {
      role: identity?.role || 'ordinary_user',
      receiver_type: identity?.receiverType || identity?.role || 'ordinary_user',
      is_rider: identity?.role === 'approved_rider',
      can_take_orders: !!identity?.canTakeOrders,
      reason: identity?.reason || '',
      reason_code: identity?.reasonCode || '',
      region_id: identity?.regionId || '',
      order_taking_policy: policyToSnakeCase(policy),
      ordinary_user_enabled: policy.ordinaryUserEnabled,
    }
  }

  private filterErrandRowsForOrderTaking(rows: any[], identity: any, now = new Date()) {
    if (identity?.role === 'approved_rider') return rows
    if (!identity?.canTakeOrders) return []
    return rows.filter((row) => {
      const policy = identity.policy
      const receiverType = this.receiverTypeFromOrder(row, policy)
      const eligibility = assessErrandOrderTakingEligibility({
        receiverType,
        policy,
        order: {
          ...row,
          service_type: internalErrandTypeToMini(row.type),
          receiver_type: receiverType,
        },
        risk: this.riskAssessmentFromOrder(row),
        user: identity.user,
        activeOrdersCount: identity.counts?.activeOrdersCount || 0,
        todayOrdersCount: identity.counts?.todayOrdersCount || 0,
        now,
      })
      return eligibility.allowed
    })
  }

  private async ensureOrdinaryReceiverRecord(tx: any, userId: string, order: any, user: any, existingRider: any) {
    const regionId = this.cleanRegionId(order?.regionId || existingRider?.regionId)
    if (!regionId) throw new BadRequestException('订单区域信息缺失，暂不能普通用户接单')
    if (existingRider) {
      return tx.regionRider.update({
        where: { userId },
        data: { regionId, status: 'busy' },
      })
    }
    return tx.regionRider.create({
      data: {
        userId,
        regionId,
        realName: user?.nickname || '普通用户',
        phone: user?.phone || '未绑定',
        idCard: 'ordinary_user',
        verifyStatus: 'ordinary_user',
        status: 'busy',
        riderType: 'ordinary_user',
      },
    })
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

  private itemSizeApplyToValues(applyTo?: string) {
    const normalized = this.normalizeApplyTo(applyTo)
    if (!normalized || normalized === 'all') return []
    if (normalized === 'express') return ['all', 'pickup', 'deliver', 'express']
    if (normalized === 'food') return ['all', 'meal', 'food']
    return ['all', normalized]
  }

  private pickupPointTypeValues(type?: string) {
    const normalized = this.normalizePickupPointType(type)
    if (!normalized) return []
    if (normalized === 'express') return ['pickup', 'deliver', 'express']
    if (normalized === 'meal') return ['meal', 'food']
    return [normalized]
  }

  private buildAddressText(address?: any) {
    if (!address) return ''
    return [
      address.full_address,
      address.detail,
      address.dormitory_number,
      address.address,
    ].filter(Boolean).join(' ').trim()
  }

  async getConfig(regionId: string) {
    if (!regionId) throw new BadRequestException('region_id 必填');
    const config = await this.prisma.errandConfig.upsert({
      where: { regionId },
      update: {},
      create: { regionId },
    });
    const extended = await this.getExtendedConfig(regionId, this.numberValue(config.basePrice, 0));
    return { success: true, data: buildMiniErrandConfig(config, extended) };
  }

  async getItemSizes(regionId: string, applyTo: string) {
    if (!regionId) throw new BadRequestException('region_id 必填');
    const where: any = { regionId };
    const applyToValues = this.itemSizeApplyToValues(applyTo);
    if (applyToValues.length) {
      where.applyTo = { in: applyToValues };
    }
    const list = await this.prisma.errandItemSize.findMany({ where, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
    return {
      success: true,
      data: list.map(item => ({
        ...item,
        region_id: item.regionId,
        weight_min: item.weightMin,
        weight_max: item.weightMax,
        size_fee: this.numberValue(item.price, 0),
        apply_to: item.applyTo,
        sort_order: item.sortOrder,
      })),
    };
  }

  async getPickupPoints(regionId: string, type: string) {
    if (!regionId) throw new BadRequestException('region_id 必填');
    const types = this.pickupPointTypeValues(type);
    const list = await this.prisma.errandPickupPoint.findMany({
      where: { regionId, isOpen: true, ...(types.length && { type: { in: types } }) },
      orderBy: { createdAt: 'desc' },
    });
    return {
      success: true,
      data: list.map(point => ({
        ...point,
        region_id: point.regionId,
        is_open: point.isOpen ? 1 : 0,
        price: 0,
      })),
    };
  }

  private couponDiscountAmount(coupon: any, amount: number) {
    const value = this.money(coupon?.value);
    if (amount <= 0 || value <= 0) return 0;
    const type = String(coupon?.type || '').toUpperCase();
    if (type === 'DISCOUNT') {
      if (value <= 0 || value >= 10) return 0;
      return this.money(amount - amount * (value / 10));
    }
    return Math.min(value, amount);
  }

  private async resolveCouponCampaign(db: any, couponId: string) {
    const config = await db.config.findUnique({ where: { key: 'marketing_campaigns_config' } }).catch(() => null);
    const value = config?.value as any;
    const list = Array.isArray(value?.list) ? value.list : Array.isArray(value) ? value : [];
    const now = new Date();
    return list.find((item: any) => {
      if (!item || item.status !== 'active') return false;
      if (String(item.couponId || '') !== String(couponId)) return false;
      if (item.startAt && now < new Date(item.startAt)) return false;
      if (item.endAt && now > new Date(item.endAt)) return false;
      return true;
    }) || null;
  }

  private async assertErrandCampaignRules(db: any, campaign: any, userId: string, couponId: string, discountAmount: number) {
    if (!campaign || discountAmount <= 0) return;
    if (campaign.firstOrderOnly) {
      const orderCount = await db.errandOrder.count({
        where: { userId, status: { notIn: ['cancelled', 'refunded'] } },
      });
      if (orderCount > 0) throw new BadRequestException('该活动仅限跑腿首单使用');
    }
    if (campaign.newUserOnly) {
      const user = await db.user.findUnique({ where: { id: userId }, select: { createdAt: true } });
      const days = Number(campaign.newUserDays || 7);
      if (!user || Date.now() - user.createdAt.getTime() > days * 24 * 60 * 60 * 1000) {
        throw new BadRequestException('该活动仅限新用户使用');
      }
    }
    const baseWhere: any = {
      status: { not: 'cancelled' },
      OR: [
        { campaignId: campaign.id },
        { sourceType: 'coupon', sourceId: couponId },
      ],
    };
    const [totalAgg, todayAgg, userAgg] = await Promise.all([
      db.subsidyLedger.aggregate({ where: baseWhere, _sum: { amount: true } }),
      db.subsidyLedger.aggregate({ where: { ...baseWhere, createdAt: { gte: this.dayStart() } }, _sum: { amount: true } }),
      db.subsidyLedger.aggregate({ where: { ...baseWhere, userId }, _sum: { amount: true }, _count: true }),
    ]);
    const totalSpent = Number(totalAgg?._sum?.amount || 0);
    const todaySpent = Number(todayAgg?._sum?.amount || 0);
    const userSpent = Number(userAgg?._sum?.amount || 0);
    if (Number(campaign.totalBudget || 0) > 0 && totalSpent + discountAmount > Number(campaign.totalBudget)) {
      throw new BadRequestException('活动总预算已不足');
    }
    if (Number(campaign.dailyBudget || 0) > 0 && todaySpent + discountAmount > Number(campaign.dailyBudget)) {
      throw new BadRequestException('活动今日预算已不足');
    }
    if (Number(campaign.perUserBudget || 0) > 0 && userSpent + discountAmount > Number(campaign.perUserBudget)) {
      throw new BadRequestException('已达到个人活动补贴上限');
    }
    if (Number(campaign.userLimit || 0) > 0 && Number(userAgg?._count || 0) >= Number(campaign.userLimit)) {
      throw new BadRequestException('已达到个人活动参与次数上限');
    }
  }

  private errandCouponUnavailableReason(coupon: any, amount: number, regionId?: string) {
    if (!coupon || coupon.status !== 'active') return '优惠券已下架';
    const now = new Date();
    if (coupon.startAt && now < coupon.startAt) return '未到可用时间';
    if (coupon.endAt && now > coupon.endAt) return '优惠券已过期';
    const scope = String(coupon.businessScope || 'all').toLowerCase();
    if (!['all', 'errand'].includes(scope)) return '该优惠券不适用于跑腿';
    if (coupon.merchantId) return '商家专属券不能用于跑腿';
    if (coupon.regionId && String(coupon.regionId) !== String(regionId || '')) return '不适用于当前区域';
    if (amount <= 0) return '请先完善订单信息';
    if (Number(coupon.minAmount || 0) > amount) return `满 ¥${Number(coupon.minAmount || 0).toFixed(2)} 可用`;
    if (this.couponDiscountAmount(coupon, amount) <= 0) return '当前金额不可用';
    return '';
  }

  private formatErrandCouponReceive(receive: any, amount: number, regionId?: string) {
    const coupon = receive?.coupon;
    const reason = this.errandCouponUnavailableReason(coupon, amount, regionId);
    const discountAmount = reason ? 0 : this.couponDiscountAmount(coupon, amount);
    const minAmount = this.money(coupon?.minAmount);
    const value = this.money(coupon?.value);
    const type = String(coupon?.type || '').toUpperCase();
    return {
      id: receive.id,
      receive_id: receive.id,
      user_coupon_id: receive.id,
      coupon_id: coupon?.id || receive.couponId,
      name: coupon?.name || '优惠券',
      type: coupon?.type || '',
      value,
      min_amount: minAmount,
      discount_amount: this.money(discountAmount),
      discount_text: type === 'DISCOUNT' ? `${value}折` : `¥${value.toFixed(2)}`,
      threshold_text: minAmount > 0 ? `满 ¥${minAmount.toFixed(2)} 可用` : '无门槛',
      end_at: coupon?.endAt || null,
      usable: !reason,
      reason,
    };
  }

  private async resolveErrandUserCoupon(db: any, userId: string, userCouponId: any, amount: number, regionId?: string) {
    if (!userCouponId) return { discountAmount: 0, receive: null, coupon: null, campaign: null };
    const receive = await db.couponReceive.findFirst({
      where: { id: String(userCouponId), userId },
      include: { coupon: true },
    });
    if (!receive) throw new BadRequestException('优惠券不存在');
    if (receive.status !== 'unused') throw new BadRequestException('优惠券已使用或已失效');
    const reason = this.errandCouponUnavailableReason(receive.coupon, amount, regionId);
    if (reason) throw new BadRequestException(reason);
    const discountAmount = this.couponDiscountAmount(receive.coupon, amount);
    const campaign = await this.resolveCouponCampaign(db, receive.coupon.id);
    await this.assertErrandCampaignRules(db, campaign, userId, receive.coupon.id, discountAmount);
    return { discountAmount, receive, coupon: receive.coupon, campaign };
  }

  private async restoreErrandOrderCoupon(db: any, order: any) {
    const usedCoupon = await db.couponReceive.findFirst({
      where: { userId: order.userId, orderNo: order.orderNo, status: 'used' },
    });
    if (!usedCoupon) return;
    // AUD-P1-065: 原子释放优惠券（只有已使用的才能被释放，防止并发重复释放）
    const released = await db.couponReceive.updateMany({
      where: { id: usedCoupon.id, status: 'used' },
      data: { status: 'unused', usedAt: null, orderNo: null },
    });
    if (released.count === 0) return; // 优惠券已被释放或状态异常，安全跳过
    await db.coupon.update({
      where: { id: usedCoupon.couponId },
      data: { usedCount: { decrement: 1 } },
    }).catch(() => undefined);
    await db.subsidyLedger.updateMany({
      where: { sourceType: 'coupon', orderType: 'errand_order', orderId: order.id },
      data: { status: 'cancelled' },
    }).catch(() => undefined);
  }

  async getAvailableCoupons(userId: string, query: any = {}) {
    const regionId = this.cleanRegionId(query?.region_id ?? query?.regionId);
    const amount = this.money(query?.amount ?? query?.order_amount ?? query?.orderPrice ?? 0);
    const page = Math.max(1, Number(query?.page || 1));
    const limit = Math.max(1, Math.min(50, Number(query?.limit || 50)));
    const receives = await this.prisma.couponReceive.findMany({
      where: { userId, status: 'unused' },
      include: { coupon: true },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });
    const formatted = receives.map(item => this.formatErrandCouponReceive(item, amount, regionId));
    const list = formatted.filter(item => item.usable);
    return {
      success: true,
      data: {
        list,
        usable: list,
        unavailable: formatted.filter(item => !item.usable),
        usable_count: list.length,
        total: formatted.length,
        amount,
      },
    };
  }

  private quoteOrderPrice(quote: ErrandQuoteResult) {
    return this.money(
      quote.baseFee +
      quote.sizeFee +
      quote.distanceFee +
      quote.weightFee +
      quote.timeFee +
      quote.riderSurcharge,
    );
  }

  private async buildOrderQuote(userId: string, dto: any) {
    const calculator = this.errandQuoteService || new ErrandQuoteService(this.prisma);
    const rawQuote = await calculator.quote(userId, dto || {});
    const orderPrice = this.quoteOrderPrice(rawQuote);
    const regionId = this.cleanRegionId(rawQuote.pricingSnapshot?.regionId);
    const couponBenefit = await this.resolveErrandUserCoupon(
      this.prisma,
      userId,
      dto?.coupon_id || dto?.user_coupon_id || dto?.userCouponId,
      orderPrice,
      regionId,
    );
    const memberDiscount = await this.resolveErrandMemberDiscount(userId, orderPrice);
    const couponDiscount = this.money(couponBenefit.discountAmount);
    const memberDiscountAmount = this.money(memberDiscount.amount);
    const payAmount = this.money(Math.max(
      orderPrice + rawQuote.tip - couponDiscount - memberDiscountAmount,
      0,
    ));
    const quote: ErrandQuoteResult = {
      ...rawQuote,
      couponDiscount,
      memberDiscount: memberDiscountAmount,
      payAmount,
      pricingSnapshot: {
        ...rawQuote.pricingSnapshot,
        discounts: {
          coupon: couponDiscount,
          member: memberDiscountAmount,
        },
        orderPrice,
        payAmount,
      },
    };
    return { quote, orderPrice, couponBenefit, memberDiscount };
  }

  async quoteOrder(userId: string, dto: any) {
    const { quote } = await this.buildOrderQuote(userId, dto);
    return { success: true, data: quote };
  }

  async createOrder(userId: string, dto: any) {
    return this.runWithLock(
      `errand:create:${userId}`,
      '跑腿订单正在创建中，请勿重复提交',
      () => this.createOrderUnlocked(userId, dto),
      20,
    );
  }

  private async createOrderUnlocked(userId: string, dto: any) {
    const orderNo = `ERR${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const tasks = Array.isArray(dto?.tasks) ? dto.tasks : []
    const firstTask = tasks[0] || {}
    const type = this.normalizeServiceType(dto?.service_type ?? dto?.type)
    const addressId = dto?.address_id ?? dto?.addressId
    const savedAddress = addressId
      ? await this.prisma.address.findFirst({ where: { id: String(addressId), userId } })
      : null
    const regionId = this.cleanRegionId(dto?.region_id ?? dto?.regionId) || this.cleanRegionId(savedAddress?.regionId) || undefined
    await this.userAccess.assertStudentProtectedAction(userId, regionId, '创建跑腿订单')
    const quoteContext = await this.buildOrderQuote(userId, {
      ...dto,
      region_id: regionId,
    })
    const { quote, couponBenefit, memberDiscount, orderPrice } = quoteContext
    const clientQuoteValue = dto?.client_quote_pay_amount ?? dto?.clientQuotePayAmount
    if (clientQuoteValue !== undefined && clientQuoteValue !== null && clientQuoteValue !== '') {
      const clientQuoteCents = Math.round(this.numberValue(clientQuoteValue, NaN) * 100)
      const serverQuoteCents = Math.round(quote.payAmount * 100)
      if (!Number.isFinite(clientQuoteCents) || clientQuoteCents !== serverQuoteCents) {
        throw new BadRequestException({
          code: 'QUOTE_CHANGED',
          message: '价格已变化，请确认最新报价',
          data: quote,
        })
      }
    }

    const deliverAddress = this.buildAddressText(savedAddress)
      || dto?.deliver_address
      || dto?.delivery_address
      || firstTask.recipient_address
      || '待填写送达地址'
    const pickupAddress = dto?.pickup_address
      || firstTask.pickup_address
      || firstTask.recipient_address
      || (type === 'deliver' ? deliverAddress : '待填写取件地址')
    const description = dto?.description
      || firstTask.description
      || firstTask.item_description
      || this.serviceTitle(type)
    const config = regionId
      ? await this.prisma.errandConfig.findUnique({ where: { regionId } }).catch(() => null)
      : null
    const extended = regionId
      ? await this.getExtendedConfig(regionId, this.numberValue(config?.basePrice, 0))
      : normalizeErrandExtendedConfig({}, this.numberValue(config?.basePrice, 0))
    const miniServiceType = String(dto?.service_type || internalErrandTypeToMini(type))
    if (config && config.isOpen === false) {
      throw new BadRequestException('当前区域暂未开放跑腿服务')
    }
    const serviceSwitchKey = ['express_pickup', 'express_send'].includes(miniServiceType)
      ? 'express'
      : miniServiceType === 'food_delivery'
        ? 'food'
        : 'custom'
    if (regionId && extended.serviceSwitches?.[serviceSwitchKey] === false) {
      throw new BadRequestException('当前跑腿类型暂未开放')
    }
    this.validateMultiTaskList(type, tasks)
    const taskSizeIds: string[] = tasks.reduce((ids: string[], task: any) => {
      const itemSizeId = this.cleanRegionId(task?.item_size_id)
      if (itemSizeId && !ids.includes(itemSizeId)) ids.push(itemSizeId)
      return ids
    }, [])
    const sizeRows = taskSizeIds.length
      ? await this.prisma.errandItemSize.findMany({ where: { id: { in: taskSizeIds } } })
      : []
    const sizeFeeMap = new Map(sizeRows.map(row => [row.id, this.numberValue(row.price, 0)]))
    const taskSizeFee = quote.sizeFee
    const basePrice = quote.baseFee
    const tip = quote.tip
    const orderTakingPolicy = normalizeErrandOrderTakingPolicy(extended.orderTakingPolicy || extended.order_taking_policy)
    const receiverType = resolveErrandReceiverType(dto, orderTakingPolicy)
    const approvedRiderSurchargeAmount = quote.riderSurcharge
    const fallbackReleaseAt = receiverType === 'ordinary_user' && orderTakingPolicy.ordinaryUserFallbackEnabled
      ? new Date(Date.now() + orderTakingPolicy.ordinaryUserFallbackMinutes * 60 * 1000).toISOString()
      : ''
    const couponDiscount = quote.couponDiscount
    const payAmount = quote.payAmount
    const imageUrls = tasks.flatMap((task: any) => Array.isArray(task?.image_urls) ? task.image_urls : [])
	    const riskAssessment = assessErrandRisk(this.buildRiskInput(dto, tasks, {
	      serviceType: miniServiceType,
	      deliveryAddress: deliverAddress,
	      pickupAddress,
	    }))
	    if (riskAssessment.risk_level === 'blocked' || riskAssessment.dispatch_constraints?.can_dispatch === false) {
	      throw new BadRequestException(riskAssessment.user_notice || '该任务超出平台普通跑腿支持范围')
	    }
	    if (receiverType === 'ordinary_user') {
	      const receiverEligibility = assessErrandOrderTakingEligibility({
	        receiverType,
	        policy: orderTakingPolicy,
	        order: { service_type: miniServiceType, receiver_type: receiverType },
	        risk: riskAssessment,
	        user: {},
	        activeOrdersCount: 0,
	        todayOrdersCount: 0,
	      })
	      if (['task_type_not_allowed', 'high_risk_requires_rider', 'risk_blocked'].includes(receiverEligibility.reasonCode)) {
	        throw new BadRequestException(`${receiverEligibility.reason}，请改选认证骑手接单`)
	      }
	    }
    const backendTiming = await this.estimateOrderTiming({
      ...dto,
      region_id: regionId,
      service_type: miniServiceType,
      task_count: Math.max(1, tasks.length),
      delivery_address: deliverAddress,
      pickup_address: pickupAddress,
      tasks,
    }).catch(() => null)
    const backendTimingData = (backendTiming as any)?.data || {}
    const requestedDeliveryMode = String(dto?.delivery_mode || dto?.deliveryMode || 'immediate')
    const backendEstimatedDeliveryTime = backendTimingData.estimated_delivery_time || backendTimingData.delivery_time || ''
    const requestedScheduledTime = dto?.delivery_time || dto?.deliveryTime || ''
    const finalDeliveryTime = requestedDeliveryMode === 'scheduled' && requestedScheduledTime
      ? requestedScheduledTime
      : backendEstimatedDeliveryTime || requestedScheduledTime || null
    const remarkDto = {
      ...dto,
      delivery_mode: requestedDeliveryMode,
      delivery_time: finalDeliveryTime,
      estimated_delivery_time: backendEstimatedDeliveryTime || finalDeliveryTime,
      eta_notice: backendTimingData.notice || dto?.eta_notice || dto?.etaNotice || '',
    }
    const freeOrderPayTime = payAmount === 0 ? new Date() : null

	    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.errandOrder.create({
        data: {
          orderNo,
          userId,
          regionId,
          type,
          title: this.truncateText(dto?.title || this.serviceTitle(type), 80, this.serviceTitle(type)),
          description: this.truncateText(description, 180, this.serviceTitle(type)),
          pickupAddress: this.truncateText(pickupAddress, 180, '待填写取件地址'),
          pickupContact: this.truncateText(dto?.pickup_contact || firstTask.pickup_contact, 60) || null,
          pickupPhone: this.truncateText(dto?.pickup_phone || firstTask.pickup_phone, 40) || null,
          deliverAddress: this.truncateText(deliverAddress, 180, '待填写送达地址'),
          deliverContact: this.truncateText(dto?.deliver_contact || savedAddress?.name, 60) || null,
          deliverPhone: this.truncateText(dto?.deliver_phone || savedAddress?.phone, 40) || null,
          deliverLat: savedAddress?.latitude ?? dto?.deliver_lat ?? null,
          deliverLng: savedAddress?.longitude ?? dto?.deliver_lng ?? null,
          weight: dto?.weight ? this.numberValue(dto.weight) : null,
          distance: quote.distanceMeters / 1000,
          price: orderPrice,
          tip,
          couponDiscount: couponDiscount + memberDiscount.amount,
          payAmount,
          ...(freeOrderPayTime ? {
            status: 'pending_accept',
            payChannel: 'free',
            payTime: freeOrderPayTime,
          } : {}),
          pricingSnapshot: quote.pricingSnapshot as any,
          images: imageUrls.length ? imageUrls : undefined,
	          remark: this.buildMiniOrderRemark(remarkDto, tasks, {
              basePrice,
              taskSizeFee,
	              addressId,
	              deliveryMode: requestedDeliveryMode,
	              etaSource: backendTimingData.estimate_source || 'backend',
	              riskAssessment,
	              receiverType,
	              requestedReceiverType: receiverType,
	              finalReceiverType: receiverType,
	              fallbackToRiderEnabled: receiverType === 'ordinary_user' && orderTakingPolicy.ordinaryUserFallbackEnabled,
	              ordinaryUserFallbackMinutes: orderTakingPolicy.ordinaryUserFallbackMinutes,
	              fallbackReleaseAt,
	              approvedRiderSurchargeAmount,
	            }),
	        },
	      });
      const taskRows = this.buildErrandTaskRows(created.id, tasks, sizeFeeMap)
      if (taskRows.length) {
        await tx.errandOrderTask.createMany({ data: taskRows })
      }
      if (couponBenefit.discountAmount > 0 && couponBenefit.receive && couponBenefit.coupon) {
        const updated = await tx.couponReceive.updateMany({
          where: { id: couponBenefit.receive.id, userId, status: 'unused' },
          data: { status: 'used', usedAt: new Date(), orderNo: created.orderNo },
        });
        if (updated.count !== 1) {
          throw new BadRequestException('优惠券已使用或已失效');
        }
        await tx.coupon.update({
          where: { id: couponBenefit.coupon.id },
          data: { usedCount: { increment: 1 } },
        });
        await tx.subsidyLedger.create({
          data: {
            subsidyNo: this.subsidyNo(),
            sourceType: 'coupon',
            sourceId: couponBenefit.coupon.id,
            benefitKey: couponBenefit.coupon.type,
            campaignId: couponBenefit.campaign?.id || null,
            orderType: 'errand_order',
            orderId: created.id,
            orderNo: created.orderNo,
            userId,
            payerType: couponBenefit.campaign?.payerType || (couponBenefit.coupon.regionId ? 'region' : 'platform'),
            payerId: couponBenefit.coupon.regionId || null,
            receiverType: 'rider',
            amount: couponBenefit.discountAmount,
            status: 'pending',
            description: `${couponBenefit.campaign?.title ? `活动${couponBenefit.campaign.title}，` : ''}跑腿优惠券核销：${couponBenefit.coupon.name}`,
            metadata: {
              couponReceiveId: couponBenefit.receive.id,
              couponName: couponBenefit.coupon.name,
              couponType: couponBenefit.coupon.type,
              campaignTitle: couponBenefit.campaign?.title || null,
              orderPrice,
              tip,
              payAmount,
            },
          },
        }).catch(() => undefined);
      }
      if (memberDiscount.benefitKey) {
        await this.membershipService.consumeBenefitWithDb(userId, memberDiscount.benefitKey, {
          targetType: 'errand_order',
          targetId: created.id,
          amount: memberDiscount.amount,
          metadata: { orderPrice, discountRate: memberDiscount.discountRate },
        }, tx);
        await tx.subsidyLedger.create({
          data: {
            subsidyNo: this.subsidyNo(),
            payerType: 'platform',
            status: 'pending',
            sourceType: 'membership',
            benefitKey: memberDiscount.benefitKey,
            orderType: 'errand_order',
            orderId: created.id,
            orderNo: created.orderNo,
            userId,
            receiverType: 'rider',
            amount: memberDiscount.amount,
            description: '会员跑腿服务费折扣平台补贴',
            metadata: { orderPrice, discountRate: memberDiscount.discountRate, payAmount },
          },
        });
      }
      return created;
    }).catch((error: any) => {
      if (error?.code === 'P2000') {
        throw new BadRequestException('跑腿订单信息太长了，请缩短备注、取件码或地址后再提交')
      }
      throw error
    });
    await this.recordErrandLearningSnapshot('order_created', {
      orderId: order.id,
      orderNo: order.orderNo,
      regionId,
      serviceType: miniServiceType,
      orderStatus: order.status,
      receiverType,
      risk: riskAssessment,
      outcomeLabel: 'created',
      outcomeMeta: {
        delivery_mode: requestedDeliveryMode,
        delivery_time: finalDeliveryTime,
        estimated_delivery_time: backendEstimatedDeliveryTime || finalDeliveryTime,
        eta_source: backendTimingData.estimate_source || 'backend',
      },
    })
    if (order.status === 'pending_accept') {
      await this.notifyAvailableRiders(order).catch(error => {
        this.logger.warn(`0元跑腿订单通知失败 order=${order.id}: ${error?.message || error}`)
      })
    }
    return { success: true, message: '下单成功', data: order };
  }

  private async resolveErrandMemberDiscount(userId: string, orderPrice: number) {
    if (orderPrice <= 0) return { amount: 0, benefitKey: '', discountRate: null }
    const benefits = await this.membershipService.getUserBenefits(userId).catch(() => null)
    const discount = (benefits?.list || []).find((item: any) => item.benefitKey === 'errand_service_discount' && item.discountRate)
    if (!discount) return { amount: 0, benefitKey: '', discountRate: null }
    const rate = Math.max(0, Math.min(10, Number(discount.discountRate || 10)))
    const discounted = Math.round(orderPrice * rate * 10) / 100
    return { amount: Math.max(orderPrice - discounted, 0), benefitKey: 'errand_service_discount', discountRate: rate }
  }

  async payOrder(userId: string, dto: any) {
    return this.runWithLock(
      `errand:order:${dto?.orderId || dto?.order_id || 'unknown'}:pay`,
      '跑腿订单正在支付处理中，请稍后再试',
      () => this.payOrderUnlocked(userId, dto),
      45,
    );
  }

  private async payOrderUnlocked(userId: string, dto: any) {
    const orderId = dto?.orderId || dto?.order_id;
    const payChannel = dto?.payChannel || dto?.pay_channel || dto?.payType || 'balance';
    if (!orderId) throw new BadRequestException('缺少订单ID');
    const order = await this.prisma.errandOrder.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('订单不存在');
    if (order.userId !== userId) throw new BadRequestException('无权支付该订单');
    if (order.status !== 'pending_pay') throw new BadRequestException('订单状态不允许支付');
    const now = new Date();
    this.assertErrandOrderPayableNow(order, now);
    const amount = Number(order.payAmount || 0);
    const paymentNo = `PAY_${Date.now()}_${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    // AUD-P0-003 + AUD-P1-184: 余额支付 - 原子条件扣款，余额不足或并发透支由数据库约束拒绝
    if (payChannel === 'balance') {
      const updated = await this.prisma.$transaction(async (tx) => {
        // 原子条件扣款：balance >= amount 才扣减，扣后真实余额写入流水
        await this.walletService.deductBalanceAtomic(
          userId,
          amount,
          {
            type: 'PAY',
            channel: 'BALANCE',
            description: `跑腿订单支付: ${order.orderNo || orderId}`,
            orderNo: order.orderNo || orderId,
          },
          tx,
        );

        // 创建真实支付单
        await tx.paymentOrder.create({
          data: {
            paymentNo,
            bizType: 'errand_order',
            bizId: order.id,
            orderNo: order.orderNo,
            userId,
            amount,
            channel: 'balance',
            status: 'paid',
            payTime: now,
          },
        });

        // 平台入账流水
        await tx.platformLedger.create({
          data: {
            orderNo: paymentNo,
            orderType: 'errand_order',
            amount,
            type: 'income',
            channel: 'balance',
            status: 'completed',
            description: '跑腿订单余额支付',
          },
        });

        return tx.errandOrder.update({
          where: { id: orderId },
          data: { status: 'pending_accept', payChannel: 'balance', payTime: now },
        });
      });
      await this.notifyAvailableRiders(updated);
      return { success: true, message: '支付成功，等待骑手接单', data: updated };
    }

    // AUD-P0-003: 微信支付 - 必须走支付中心，由回调推进订单状态
    if (payChannel === 'wx_pay' || payChannel === 'wechat') {
      // 微信支付已经由外部 /wxpay/createOrder 入口处理，这里只做转发
      const paymentResult = await this.paymentService.wxUnifiedOrder({
        bizType: 'errand_order',
        bizId: order.id,
        orderNo: order.orderNo || orderId,
        amount,
        description: `跑腿订单-${order.orderNo || orderId}`,
        openid: '', // 由 payment service 自行查询
        userId,
      });
      return {
        success: true,
        message: '已生成微信支付单，请完成支付',
        paymentInfo: paymentResult,
      };
    }

    throw new BadRequestException(`不支持的支付方式: ${payChannel}`);
  }

  async getOrderDetail(orderId: string, userId: string) {
    const order = await this.prisma.errandOrder.findUnique({
      where: { id: orderId },
      include: {
        User: { select: { id: true, nickname: true, avatar: true, phone: true } },
        RegionRider: {
          include: {
            User: { select: { id: true, nickname: true, avatar: true } },
          },
        },
      },
    });
    if (!order) throw new NotFoundException('订单不存在');
    if (order.userId !== userId && order.riderId !== userId) {
      throw new BadRequestException('无权查看该订单');
    }
    const [formatted] = await this.formatMiniOrders([order]);
    const deliveryTrack = await this.getDeliveryTrack(order);
    return { success: true, data: { ...formatted, delivery_track: deliveryTrack } };
  }

  async getRiderDeliveryOrderDetail(orderId: string, userId: string) {
    const errand = await this.prisma.errandOrder.findUnique({
      where: { id: orderId },
      select: { id: true, riderId: true },
    });
    if (errand) {
      if (errand.riderId !== userId) throw new BadRequestException('订单尚未分配给当前骑手');
      return this.getOrderDetail(orderId, userId);
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        merchant: {
          select: {
            id: true, userId: true, name: true, regionId: true, address: true,
            phone: true, logo: true, latitude: true, longitude: true, businessType: true,
          },
        },
        user: { select: { id: true, nickname: true, avatar: true, phone: true } },
        items: true,
      },
    });
    if (!order) throw new NotFoundException('订单不存在');
    if (order.riderId !== userId) throw new BadRequestException('订单尚未分配给当前骑手');
    const [[formatted], deliveryNodes] = await Promise.all([
      this.formatShopOrdersForRider([order]),
      this.prisma.deliveryOrderNode.findMany({
        where: { orderId, orderType: 'shop' }, orderBy: { createdAt: 'asc' },
      }).catch(() => []),
    ]);
    return {
      success: true,
      data: {
        ...formatted,
        delivery_track: {
          display_mode: order.deliveryDisplayMode || 'live_map',
          rider_type: 'official',
          can_show_live_map: false,
          location_stale: true,
          current_location: null,
          nodes: deliveryNodes.map((node: any) => ({
            id: node.id,
            type: node.nodeType,
            label: node.nodeLabel || this.deliveryNodeLabel(node.nodeType),
            time: node.createdAt,
            address: node.address || '',
            remark: node.remark || '',
          })),
        },
      },
    };
  }

  async createReview(userId: string, orderId: string, dto: any) {
    const rating = Number(dto?.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new BadRequestException('评分必须是1到5星');
    }
    const order = await this.prisma.errandOrder.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('订单不存在');
    if (order.userId !== userId) throw new BadRequestException('无权评价该订单');
    if (order.status !== 'completed' || !order.receiptConfirmedAt) {
      throw new BadRequestException('确认收货后才能评价');
    }
    if (String(order.refundStatus || 'none') === 'refunded') {
      throw new BadRequestException('已全额退款订单不能评价');
    }
    if (!order.riderId) throw new BadRequestException('订单没有可评价的骑手');
    const existing = await this.prisma.errandReview.findUnique({ where: { orderId } });
    if (existing) throw new BadRequestException('该订单已评价');

    return this.prisma.errandReview.create({
      data: {
        orderId,
        userId,
        riderId: order.riderId,
        rating,
        tags: Array.isArray(dto?.tags) ? dto.tags.slice(0, 8) : undefined,
        content: String(dto?.content || '').trim().slice(0, 500) || null,
        images: Array.isArray(dto?.images) ? dto.images.filter(Boolean).slice(0, 6) : undefined,
      },
    }).catch((error: any) => {
      if (error?.code === 'P2002') throw new BadRequestException('该订单已评价');
      throw error;
    });
  }

  async getReview(userId: string, orderId: string) {
    const order = await this.prisma.errandOrder.findUnique({ where: { id: orderId }, select: { userId: true, riderId: true } });
    if (!order || (order.userId !== userId && order.riderId !== userId)) {
      throw new NotFoundException('评价不存在');
    }
    return this.prisma.errandReview.findUnique({ where: { orderId } });
  }

  async cancelOrder(orderId: string, userId: string, dto: any) {
    return this.runWithLock(
      `errand:order:${orderId}`,
      '跑腿订单正在处理中，请稍后再试',
      () => this.cancelOrderUnlocked(orderId, userId, dto),
    );
  }

  private async cancelOrderUnlocked(orderId: string, userId: string, dto: any) {
    const order = await this.prisma.errandOrder.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('订单不存在');
    if (order.userId !== userId) throw new BadRequestException('只能取消自己的跑腿订单');
    if (!['pending_pay', 'pending_accept'].includes(order.status)) {
      throw new BadRequestException('订单已被接单或已结束，不能直接取消');
    }
    const reason = String(dto?.reason || dto?.cancel_reason || '用户取消').trim().slice(0, 120);
    const updated = await this.prisma.$transaction(async (tx) => {
      // SEC-P0-B3: 条件更新 —— 取消锁与接单锁 key 不同，必须用带 status/riderId 守卫的 updateMany
      // 防止“取消”与“骑手接单”竞态：骑手已接单(status=accepted, riderId!=null)时取消必须失败，
      // 否则会把在途订单改成 cancelled 并触发全额退款，骑手白跑。
      const claimed = await tx.errandOrder.updateMany({
        where: {
          id: orderId,
          userId,
          riderId: null,
          status: { in: ['pending_pay', 'pending_accept'] },
        },
        data: {
          status: 'cancelled',
          cancelReason: reason || '用户取消',
          cancelTime: new Date(),
          refundStatus: order.status === 'pending_pay' ? order.refundStatus : 'refunding',
        },
      });
      if (claimed.count !== 1) {
        throw new BadRequestException('订单已被接单或已结束，不能直接取消');
      }
      await this.restoreErrandOrderCoupon(tx, order);
      await this.membershipService.restoreBenefitUsagesForTarget('errand_order', order.id, tx);
      await tx.subsidyLedger.updateMany({
        where: { sourceType: 'membership', orderType: 'errand_order', orderId: order.id },
        data: { status: 'cancelled' },
      }).catch(() => undefined);
      return tx.errandOrder.findUniqueOrThrow({
        where: { id: orderId },
        include: {
          User: { select: { id: true, nickname: true, avatar: true, phone: true } },
          RegionRider: {
            include: {
              User: { select: { id: true, nickname: true, avatar: true } },
            },
          },
        },
      });
    });
    const [formatted] = await this.formatMiniOrders([updated]);
    await this.recordErrandLearningSnapshot('order_cancelled', {
      orderId: updated.id,
      orderNo: updated.orderNo,
      regionId: updated.regionId,
      serviceType: internalErrandTypeToMini(updated.type),
      orderStatus: updated.status,
      riderId: updated.riderId,
      receiverType: this.displayReceiverTypeFromOrder(updated),
      risk: this.riskAssessmentFromOrder(updated),
      outcomeLabel: 'cancelled',
      outcomeMeta: {
        cancel_reason: reason || '用户取消',
        before_pay: order.status === 'pending_pay',
      },
    });
    let refundDispatchFailed = false;
    if (order.status !== 'pending_pay') {
      await this.paymentService.refund({
        bizType: 'errand_order', bizId: order.id, amount: Number(order.payAmount || 0),
        reason: reason || '用户取消', operatorId: userId,
      }).catch((error: any) => {
        refundDispatchFailed = true;
        this.logger.warn(`跑腿取消后自动退款发起失败: ${order.id} ${error?.message || ''}`);
      });
    }
    return {
      success: true,
      message: order.status === 'pending_pay'
        ? '订单已取消'
        : refundDispatchFailed ? '订单已取消，退款发起失败，平台将跟进处理' : '订单已取消，退款处理中',
      data: formatted,
    };
  }

  async expirePendingPayment(orderId: string) {
    return this.runWithLock(
      `errand:order:${orderId}`,
      '跑腿订单正在处理中，请稍后再试',
      () => this.prisma.$transaction(async (tx) => {
        const order = await tx.errandOrder.findUnique({ where: { id: orderId } });
        if (!order || order.status !== 'pending_pay') return false;
        const claimed = await tx.errandOrder.updateMany({
          where: { id: orderId, status: 'pending_pay' },
          data: { status: 'cancelled', cancelTime: new Date(), cancelReason: '支付超时自动取消' },
        });
        if (claimed.count !== 1) return false;
        await this.restoreErrandOrderCoupon(tx, order);
        await this.membershipService.restoreBenefitUsagesForTarget('errand_order', order.id, tx);
        await tx.subsidyLedger.updateMany({
          where: { sourceType: 'membership', orderType: 'errand_order', orderId: order.id },
          data: { status: 'cancelled' },
        }).catch(() => undefined);
        return true;
      }),
    );
  }

  async acceptOrder(orderId: string, userId: string) {
    return this.runWithLock(
      `errand:order:${orderId}:accept`,
      '该订单正在被处理，请刷新后再试',
      () => this.acceptOrderUnlocked(orderId, userId),
      20,
    );
  }

  private async acceptOrderUnlocked(orderId: string, userId: string) {
    const errandExists = await this.prisma.errandOrder.findUnique({ where: { id: orderId }, select: { id: true } });
    if (!errandExists) return this.acceptShopOrder(orderId, userId);

    const updated = await this.prisma.$transaction(async (tx) => {
      const order = await tx.errandOrder.findUnique({ where: { id: orderId }, include: { tasks: true } });
      if (!order) throw new NotFoundException('订单不存在');
      if (order.status !== 'pending_accept' || order.riderId || ['refunding', 'refunded'].includes(String(order.refundStatus || 'none'))) {
        throw new BadRequestException('订单已被接走或状态不允许接单');
      }
	      const rider = await tx.regionRider.findUnique({ where: { userId } });
	      if (rider?.verifyStatus === 'approved') {
	        if (rider.status !== 'online') throw new BadRequestException('请先切换为在线状态再接单');
	        if (order.regionId && rider.regionId !== order.regionId) throw new BadRequestException('不能接其他区域的订单');
	        const policy = await this.getOrderTakingPolicy(order.regionId || rider.regionId)
	        const fallbackEligibility = assessApprovedRiderFallbackEligibility({
	          policy,
	          order,
	          now: new Date(),
	        })
	        if (!fallbackEligibility.allowed) {
	          throw new BadRequestException(fallbackEligibility.reason || '该订单暂未进入认证骑手兜底池')
	        }
	        const dispatchContext = await this.getRiderDispatchContext(userId, tx);
	        const dispatchAssessment = assessErrandDispatch({
	          order: this.buildDispatchOrderPayload(order),
	          rider: dispatchContext,
	        });
	        if (!dispatchAssessment.canAccept) {
	          throw new BadRequestException(dispatchAssessment.reasonText || '当前订单预计无法按时送达');
	        }
	        const deliveryDisplayMode = this.deliveryDisplayModeForRider(rider);
	        const claimed = await tx.errandOrder.updateMany({
	          where: { id: orderId, status: 'pending_accept', riderId: null, refundStatus: { notIn: ['refunding', 'refunded'] } },
	          data: { riderId: userId, status: 'accepted', acceptTime: new Date(), deliveryDisplayMode },
	        });
	        if (claimed.count !== 1) throw new BadRequestException('订单状态已变化，请刷新后再接单');
	        const updated = await tx.errandOrder.findUniqueOrThrow({
	          where: { id: orderId },
	          include: {
	            User: { select: { id: true, nickname: true, avatar: true, phone: true } },
	            RegionRider: { include: { User: { select: { id: true, nickname: true, avatar: true } } } },
	          },
	        });
	        await this.recordDeliveryNode(tx, {
	          orderId,
	          nodeType: 'accepted',
	          operatorId: userId,
	          riderType: rider.riderType,
	          displayMode: deliveryDisplayMode,
	        });
	        const riderClaimed = await tx.regionRider.updateMany({
	          where: { userId, verifyStatus: 'approved', status: 'online' },
	          data: { status: 'busy' },
	        });
	        if (riderClaimed.count !== 1) throw new BadRequestException('骑手状态已变化，请刷新后再接单');
	        return updated;
	      }

	      if (rider?.verifyStatus === 'banned') throw new BadRequestException('接单账号当前受限，请联系区域负责人');
	      const policy = await this.getOrderTakingPolicy(order.regionId || rider?.regionId)
	      const receiverType = this.receiverTypeFromOrder(order, policy)
	      const [user, counts] = await Promise.all([
	        tx.user.findUnique({
	          where: { id: userId },
	          include: { studentVerify: { select: { status: true } } },
	        }),
	        this.getOrdinaryOrderCounts(userId, tx),
	      ])
	      const eligibility = assessErrandOrderTakingEligibility({
	        receiverType,
	        policy,
	        order: {
	          ...order,
	          service_type: internalErrandTypeToMini(order.type),
	          receiver_type: receiverType,
	        },
	        risk: this.riskAssessmentFromOrder(order),
	        user,
	        activeOrdersCount: counts.activeOrdersCount,
	        todayOrdersCount: counts.todayOrdersCount,
	        now: new Date(),
	      })
	      if (!eligibility.allowed) throw new BadRequestException(eligibility.reason || '当前暂不能普通用户接单');
	      await this.ensureOrdinaryReceiverRecord(tx, userId, order, user, rider)
	      const claimed = await tx.errandOrder.updateMany({
	        where: { id: orderId, status: 'pending_accept', riderId: null, refundStatus: { notIn: ['refunding', 'refunded'] } },
	        data: { riderId: userId, status: 'accepted', acceptTime: new Date(), deliveryDisplayMode: 'status_nodes' },
	      });
	      if (claimed.count !== 1) throw new BadRequestException('订单状态已变化，请刷新后再接单');
	      const updated = await tx.errandOrder.findUniqueOrThrow({
	        where: { id: orderId },
	        include: {
	          User: { select: { id: true, nickname: true, avatar: true, phone: true } },
	          RegionRider: { include: { User: { select: { id: true, nickname: true, avatar: true } } } },
	        },
	      });
	      await this.recordDeliveryNode(tx, {
	        orderId,
	        nodeType: 'accepted',
	        nodeLabel: '同校用户已接单',
	        operatorId: userId,
	        operatorType: 'ordinary_user',
	        riderType: 'ordinary_user',
	        displayMode: 'status_nodes',
	      });
	      return updated;
	    });
    const [formatted] = await this.formatMiniOrders([updated]);
    await this.recordErrandLearningSnapshot('order_accepted', {
      orderId: updated.id,
      orderNo: updated.orderNo,
      regionId: updated.regionId,
      serviceType: internalErrandTypeToMini(updated.type),
      orderStatus: updated.status,
      riderId: updated.riderId,
      receiverType: this.displayReceiverTypeFromOrder(updated),
      risk: this.riskAssessmentFromOrder(updated),
      outcomeLabel: 'accepted',
      outcomeMeta: {
        accepted_at: updated.acceptTime,
        receiver_type: this.displayReceiverTypeFromOrder(updated),
      },
    });
    return { success: true, message: '接单成功', data: formatted };
  }

  private async acceptShopOrder(orderId: string, userId: string) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: {
          merchant: { select: { id: true, userId: true, name: true, regionId: true, address: true, phone: true, logo: true, latitude: true, longitude: true, businessType: true } },
          user: { select: { id: true, nickname: true, avatar: true, phone: true } },
          items: true,
        },
      });
      if (!order) throw new NotFoundException('订单不存在');
      if (!['platform_rider', 'rider_delivery'].includes((order as any).deliveryMode || 'platform_rider')) {
        throw new BadRequestException('该订单为店主自送，不进入骑手接单');
      }
      if (order.status !== 'PAID' || order.riderId || ['refunding', 'refunded'].includes(String((order as any).refundStatus || 'none'))) {
        throw new BadRequestException('订单已被接走或状态不允许接单');
      }
      if (!(order as any).readyTime) {
        throw new BadRequestException('商家尚未备餐完成');
      }
      if ((order as any).fulfillmentStartTime && new Date((order as any).fulfillmentStartTime) > new Date()) {
        throw new BadRequestException('预约订单尚未到履约时间');
      }
      const rider = await tx.regionRider.findUnique({ where: { userId } });
      if (!rider) throw new BadRequestException('请先申请成为骑手');
      if (rider.verifyStatus !== 'approved') throw new BadRequestException('骑手账号未通过审核');
      if (rider.status !== 'online') throw new BadRequestException('请先切换为在线状态再接单');
      if (order.merchant?.regionId && rider.regionId !== order.merchant.regionId) {
        throw new BadRequestException('不能接其他区域的订单');
      }
      const deliveryDisplayMode = this.deliveryDisplayModeForRider(rider);
      const acceptedAt = new Date();
      const claimed = await tx.order.updateMany({
        where: {
          id: orderId, status: 'PAID', riderId: null, refundStatus: { notIn: ['refunding', 'refunded'] }, readyTime: { not: null },
          OR: [{ fulfillmentStartTime: null }, { fulfillmentStartTime: { lte: acceptedAt } }],
        },
        data: { riderId: userId, status: 'SHIPPED' as any, acceptTime: acceptedAt, deliveryDisplayMode },
      });
      if (claimed.count !== 1) throw new BadRequestException('订单状态已变化，请刷新后重试');
      await tx.orderLog.create({
        data: { orderId, action: 'RIDER_ACCEPT', fromStatus: 'PAID', toStatus: 'SHIPPED', operatorId: userId, operatorType: 'rider', remark: '骑手已接单，前往商家取餐' },
      });
      const accepted = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
        include: {
          merchant: { select: { id: true, userId: true, name: true, regionId: true, address: true, phone: true, logo: true, latitude: true, longitude: true, businessType: true } },
          user: { select: { id: true, nickname: true, avatar: true, phone: true } },
          items: true,
        },
      });
      await this.recordDeliveryNode(tx, {
        orderId, orderType: 'shop', nodeType: 'accepted', operatorId: userId,
        riderType: rider.riderType, displayMode: deliveryDisplayMode, remark: '骑手已接单，前往商家取餐',
      });
      const riderClaimed = await tx.regionRider.updateMany({
        where: { userId, verifyStatus: 'approved', status: 'online' },
        data: { status: 'busy' },
      });
      if (riderClaimed.count !== 1) throw new BadRequestException('骑手状态已变化，请刷新后再接单');
      return accepted;
    });
    await this.notifyShopBuyer(updated, '骑手已接单', '骑手正在前往商家取餐');
    await this.notifyShopMerchant(updated, '骑手已接单', '骑手正在前往取餐，请保持备餐完成状态');
    const [formatted] = await this.formatShopOrdersForRider([updated]);
    return { success: true, message: '接单成功', data: formatted };
  }

  async updateRiderStatus(orderId: string, userId: string, dto: any) {
    return this.runWithLock(
      `errand:order:${orderId}:status`,
      '订单状态正在更新，请稍后再试',
      () => this.updateRiderStatusUnlocked(orderId, userId, dto),
    );
  }

  private async updateRiderStatusUnlocked(orderId: string, userId: string, dto: any) {
    const nextStatus = this.normalizeMiniOrderStatus(dto?.status)
    const allowed = ['in_progress', 'arrived', 'completed']
    if (!allowed.includes(nextStatus)) throw new BadRequestException('不支持的订单状态');
    const order = await this.prisma.errandOrder.findUnique({ where: { id: orderId } });
    if (!order) return this.updateShopOrderRiderStatus(orderId, userId, nextStatus, dto);
    if (nextStatus === 'completed') {
      throw new BadRequestException('骑手只能标记送达，不能确认完成');
    }
    const lifecycle = this.errandLifecycleService || new ErrandLifecycleService(this.prisma)
    const updated = await lifecycle.riderTransition(orderId, userId, {
      ...dto,
      status: nextStatus,
    })
    await this.recordErrandLearningSnapshot(`order_${nextStatus}`, {
      orderId: updated.id,
      orderNo: updated.orderNo,
      regionId: updated.regionId,
      serviceType: internalErrandTypeToMini(updated.type),
      orderStatus: updated.status,
      riderId: updated.riderId,
      receiverType: this.displayReceiverTypeFromOrder(updated),
      risk: this.riskAssessmentFromOrder(updated),
      outcomeLabel: this.learningOutcomeForErrandStatus(nextStatus, updated),
      outcomeMeta: {
        late: false,
        status_updated_at: new Date().toISOString(),
      },
    });
    const [formatted] = await this.formatMiniOrders([updated]);
    return { success: true, message: '订单状态已更新', data: formatted };
  }

  async confirmReceipt(orderId: string, userId: string) {
    return this.runWithLock(
      `errand:order:${orderId}:confirm-receipt`,
      '订单正在确认收货，请稍后再试',
      async () => {
        const lifecycle = this.errandLifecycleService || new ErrandLifecycleService(this.prisma)
        const updated = await lifecycle.confirmReceipt(orderId, userId, 'user')
        await this.recordErrandLearningSnapshot('order_completed', {
          orderId: updated.id,
          orderNo: updated.orderNo,
          regionId: updated.regionId,
          serviceType: internalErrandTypeToMini(updated.type),
          orderStatus: updated.status,
          riderId: updated.riderId,
          receiverType: this.displayReceiverTypeFromOrder(updated),
          risk: this.riskAssessmentFromOrder(updated),
          outcomeLabel: this.learningOutcomeForErrandStatus('completed', updated),
          outcomeMeta: {
            receipt_confirmed_by: 'user',
            status_updated_at: new Date().toISOString(),
          },
        })
        const [formatted] = await this.formatMiniOrders([updated])
        return { success: true, message: '确认收货成功', data: formatted }
      },
    )
  }

  private async updateShopOrderRiderStatus(orderId: string, userId: string, nextStatus: string, dto: any = {}) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('订单不存在');
    if (order.riderId !== userId) throw new BadRequestException('无权操作该订单');
    if (['refunding', 'refunded'].includes(String(order.refundStatus || 'none'))) {
      throw new BadRequestException('订单退款处理中，不能继续配送');
    }
    if (!['in_progress', 'arrived'].includes(nextStatus)) {
      throw new BadRequestException('外卖送达后等待用户确认收货');
    }
    const where = nextStatus === 'in_progress'
      ? { id: orderId, riderId: userId, status: 'SHIPPED' as any, pickupTime: null, refundStatus: { notIn: ['refunding', 'refunded'] } }
      : { id: orderId, riderId: userId, status: 'SHIPPED' as any, pickupTime: { not: null }, refundStatus: { notIn: ['refunding', 'refunded'] } };
    const data: any = nextStatus === 'in_progress'
      ? { pickupTime: new Date() }
      : { status: 'DELIVERED' as any, deliverTime: new Date() };
    const updated = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.order.updateMany({ where, data });
      if (claimed.count !== 1) throw new BadRequestException('订单状态已变化，请刷新后重试');
      await tx.orderLog.create({
        data: {
          orderId, action: nextStatus === 'in_progress' ? 'RIDER_PICKED_UP' : 'RIDER_DELIVERED',
          fromStatus: 'SHIPPED', toStatus: nextStatus === 'in_progress' ? 'SHIPPED' : 'DELIVERED',
          operatorId: userId, operatorType: 'rider', remark: nextStatus === 'in_progress' ? '骑手已取餐，正在配送' : '骑手已送达，等待用户确认收货',
        },
      });
      const row = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
        include: {
          merchant: { select: { id: true, userId: true, name: true, regionId: true, address: true, phone: true, logo: true, latitude: true, longitude: true, businessType: true } },
          user: { select: { id: true, nickname: true, avatar: true, phone: true } },
          items: true,
        },
      });
      await this.recordDeliveryNode(tx, {
        orderId, orderType: 'shop', nodeType: nextStatus, operatorId: userId,
        displayMode: row.deliveryDisplayMode,
        lat: dto?.lat ?? dto?.latitude,
        lng: dto?.lng ?? dto?.longitude,
        address: dto?.address,
        proofImages: dto?.proof_images ?? dto?.proofImages,
        remark: dto?.remark || (nextStatus === 'in_progress' ? '骑手已取餐，正在配送' : '骑手已送达，等待用户确认收货'),
      });
      return row;
    });
    if (nextStatus === 'arrived') {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const [errandTotal, shopTotal, errandToday, shopToday, activeErrand, activeShop] = await Promise.all([
        this.prisma.errandOrder.count({ where: { riderId: userId, status: 'completed' } }),
        this.prisma.order.count({ where: { riderId: userId, status: { in: ['DELIVERED', 'RECEIVED', 'COMPLETED'] as any } } }),
        this.prisma.errandOrder.count({ where: { riderId: userId, status: 'completed', completeTime: { gte: todayStart } } }),
        this.prisma.order.count({ where: { riderId: userId, status: { in: ['DELIVERED', 'RECEIVED', 'COMPLETED'] as any }, deliverTime: { gte: todayStart } } }),
        this.prisma.errandOrder.count({ where: { riderId: userId, status: { in: ['accepted', 'in_progress', 'arrived'] } } }),
        this.prisma.order.count({ where: { riderId: userId, status: 'SHIPPED' as any } }),
      ]);
      await this.prisma.regionRider.update({
        where: { userId },
        data: {
          totalOrders: errandTotal + shopTotal,
          todayOrders: errandToday + shopToday,
          status: activeErrand + activeShop > 0 ? 'busy' : 'online',
        },
      }).catch(() => null);
    }
    await this.notifyShopBuyer(
      updated,
      nextStatus === 'in_progress' ? '骑手已取餐' : '订单已送达',
      nextStatus === 'in_progress' ? '骑手已取餐，正在为您配送' : '骑手已送达，请确认收货',
    );
    await this.notifyShopMerchant(
      updated,
      nextStatus === 'in_progress' ? '骑手已取餐' : '订单已送达',
      nextStatus === 'in_progress' ? '骑手已取餐，正在配送' : '骑手已送达，等待用户确认收货',
    );
    const [formatted] = await this.formatShopOrdersForRider([updated]);
    return { success: true, message: '订单状态已更新', data: formatted };
  }

  private async notifyShopBuyer(order: any, title: string, content: string) {
    if (!order?.userId || typeof (this.notifyService as any)?.createAndDispatch !== 'function') return;
    await this.notifyService.createAndDispatch({
      userId: order.userId,
      regionId: order.merchant?.regionId || undefined,
      type: 'delivery',
      scene: 'takeaway_delivery_status',
      title,
      content,
      data: { orderId: order.id, orderNo: order.orderNo, merchantId: order.merchantId, status: order.status },
      linkType: 'page',
      linkValue: `/pagesA/order/order-detail/order-detail?id=${order.id}`,
      channelMask: { inApp: true, websocket: true },
    }).catch(() => undefined);
  }

  private async notifyShopMerchant(order: any, title: string, content: string) {
    const merchant = order?.merchant;
    if (!merchant?.userId || typeof (this.notifyService as any)?.createAndDispatch !== 'function') return;
    await this.notifyService.createAndDispatch({
      userId: merchant.userId,
      regionId: merchant.regionId || undefined,
      type: 'delivery',
      scene: 'takeaway_rider_status',
      title,
      content,
      data: { orderId: order.id, orderNo: order.orderNo, merchantId: order.merchantId, status: order.status },
      linkType: 'page',
      linkValue: `/pagesA/MerchantManagement/Order?merchant_id=${merchant.id || order.merchantId}`,
      channelMask: { inApp: true, websocket: true },
    }).catch(() => undefined);
  }

  async refundOrder(orderId: string, userId: string, dto: any) {
    // AUD-P0-003: 退款必须先校验订单归属、支付状态、可退金额，再走统一退款服务
    const order = await this.prisma.errandOrder.findUnique({
      where: { id: orderId },
    });
    if (!order) throw new NotFoundException('订单不存在');
    if (order.userId !== userId) throw new BadRequestException('无权操作该订单');

    // 用户自助退款仅限尚未被接走的已支付订单，配送异常走申诉/运营处置。
    if (order.status !== 'pending_accept' || order.riderId) {
      throw new BadRequestException('仅未接单的已支付订单可自助退款');
    }

    if (order.refundStatus && order.refundStatus !== 'none') {
      throw new BadRequestException('已有退款在处理中');
    }

    const amount = Number(order.payAmount || 0);
    const claimed = await this.prisma.errandOrder.updateMany({
      where: { id: order.id, userId, status: 'pending_accept', riderId: null, refundStatus: 'none' },
      data: { refundStatus: 'refunding', refundAmount: amount },
    });
    if (claimed.count !== 1) throw new BadRequestException('订单状态已变化，请刷新后重试');
    try {
      await this.paymentService.refund({
        bizType: 'errand_order', bizId: order.id, amount,
        reason: dto?.reason || '用户申请退款', operatorId: userId,
      });
    } catch (error) {
      await this.prisma.errandOrder.updateMany({
        where: { id: order.id, refundStatus: 'refunding' },
        data: { refundStatus: 'none', refundAmount: null },
      });
      throw error;
    }

    return { success: true, message: '退款申请已提交' };
  }

  private parseOrderRemark(row: any) {
    if (!row?.remark) return {}
    try {
      return JSON.parse(row.remark)
    } catch {
      return {}
    }
  }

  private async formatMiniOrders(rows: any[]) {
    const orderIds = rows.map(row => row?.id).filter(Boolean)
    const shouldLoadTasks = rows.some(row => !Array.isArray(row?.tasks))
    const taskRows = shouldLoadTasks && orderIds.length
      ? await this.prisma.errandOrderTask.findMany({
          where: { orderId: { in: orderIds } },
          orderBy: [{ orderId: 'asc' }, { sortOrder: 'asc' }],
        })
      : []
    const taskMap = taskRows.reduce((map, task: any) => {
      const list = map.get(task.orderId) || []
      list.push(task)
      map.set(task.orderId, list)
      return map
    }, new Map<string, any[]>())
    const tasks = rows.flatMap(row => this.rawOrderTasks(row, taskMap))
    const itemSizeIds = Array.from(new Set(tasks.map((task: any) => this.cleanRegionId(task?.item_size_id)).filter(Boolean)))
    const pickupPointIds = Array.from(new Set(tasks.map((task: any) => this.cleanRegionId(task?.pickup_point_id)).filter(Boolean)))
    const [itemSizes, pickupPoints] = await Promise.all([
      itemSizeIds.length ? this.prisma.errandItemSize.findMany({ where: { id: { in: itemSizeIds } } }) : [],
      pickupPointIds.length ? this.prisma.errandPickupPoint.findMany({ where: { id: { in: pickupPointIds } } }) : [],
    ])
    const itemSizeMap = new Map(itemSizes.map(item => [item.id, item]))
    const pickupPointMap = new Map(pickupPoints.map(point => [point.id, point]))

    return rows.map(row => {
      const remark = this.parseOrderRemark(row)
      const rawTasks = this.rawOrderTasks(row, taskMap)
	      const miniType = internalErrandTypeToMini(row.type)
	      const refundStatus = row.refundStatus || 'none'
	      const displayStatus = ['refunding', 'refunded'].includes(String(refundStatus))
	        ? String(refundStatus)
	        : miniErrandStatus(row.status)
	      const receiverType = this.displayReceiverTypeFromOrder(row)
	      const requestedReceiverType = this.getOrderRequestedReceiverType(row, {
	        ordinaryUserEnabled: true,
	        receiverChoiceEnabled: true,
	      })
      const details = rawTasks.map((task: any) => {
        const itemSize = itemSizeMap.get(this.cleanRegionId(task?.item_size_id))
        const pickupPoint = pickupPointMap.get(this.cleanRegionId(task?.pickup_point_id))
        const itemSizeFee = itemSize ? this.numberValue((itemSize as any).price, 0) : 0
        return {
          ...task,
          name: task?.description || task?.item_description || task?.express_company || this.serviceTitle(row.type),
          task_type: task?.task_type || miniType,
          computed_fee: this.numberValue(task?.computed_fee ?? itemSizeFee, 0).toFixed(2),
          item_size_name: itemSize?.name || '',
          item_size_fee: itemSizeFee,
          pickup_point_name: pickupPoint?.name || '',
          pickup_point_address: pickupPoint?.address || task?.pickup_address || '',
          pickup_address: pickupPoint?.address || task?.pickup_address || '',
          image_urls: Array.isArray(task?.image_urls) ? task.image_urls : [],
        }
      })
      const user = row.User || row.user || null
      const payAmount = this.numberValue(row.payAmount, 0)
      const rider = row.RegionRider ? this.publicRiderProfile(row.RegionRider) : null
      const finalReceiverType = row.riderId
        ? (row.RegionRider?.riderType === 'ordinary_user' || row.RegionRider?.verifyStatus === 'ordinary_user' ? 'ordinary_user' : 'approved_rider')
        : requestedReceiverType
      const fallbackToRiderEnabled = requestedReceiverType === 'ordinary_user' && remark.fallback_to_rider_enabled === true
      const fallbackReleaseAt = this.fallbackReleaseAtFromOrder(row, {
        ordinaryUserEnabled: true,
        receiverChoiceEnabled: true,
        ordinaryUserFallbackEnabled: fallbackToRiderEnabled,
        ordinaryUserFallbackMinutes: Number(remark.ordinary_user_fallback_minutes || 10),
      })
      const fallbackTriggered = requestedReceiverType === 'ordinary_user' && finalReceiverType === 'approved_rider'
      const deliveryDisplayMode = this.deliveryDisplayModeForRider(row.RegionRider, row.deliveryDisplayMode)
      return {
        id: row.id,
        order_id: row.id,
        delivery_order_id: row.id,
        order_no: row.orderNo,
        orderNo: row.orderNo,
        service_type: miniType,
        subType: miniType,
        type: 'errand',
        raw_type: row.type,
        region_id: row.regionId || '',
        status: displayStatus,
        raw_status: row.status,
	        refund_status: refundStatus,
	        refund_amount: this.numberValue(row.refundAmount, 0).toFixed(2),
        receipt_confirm_deadline: row.receiptConfirmDeadline || null,
        receipt_confirmed_at: row.receiptConfirmedAt || null,
        receipt_confirmed_by: row.receiptConfirmedBy || '',
        settlement_eligible_at: row.settlementEligibleAt || null,
        payment_status: row.status === 'pending_pay' ? 'unpaid' : 'paid',
        title: row.title,
        description: row.description || '',
        total_amount: payAmount.toFixed(2),
        pay_amount: payAmount,
        amount: payAmount,
        price: this.numberValue(row.price, 0),
        tip: this.numberValue(row.tip, 0),
        platform_delivery_fee: (this.numberValue(row.price, 0) + this.numberValue(row.tip, 0)).toFixed(2),
        base_delivery_fee: this.numberValue(row.price, 0).toFixed(2),
        potential_fee_bonus: '0.00',
        potential_fee_penalty: '0.00',
        price_adjustment_fee: '0.00',
        delivery_time: remark.delivery_time || row.deliverTime || row.createdAt,
        delivery_address: row.deliverAddress,
        address: row.deliverAddress,
        delivery_contact: row.deliverContact || user?.nickname || '用户',
        delivery_phone: row.deliverPhone || user?.phone || '',
        recipient_name: row.deliverContact || user?.nickname || '用户',
        mobile: row.deliverPhone || user?.phone || '',
        pickup_address: row.pickupAddress,
        pickup_latitude: row.pickupLat,
        pickup_longitude: row.pickupLng,
        delivery_latitude: row.deliverLat,
        delivery_longitude: row.deliverLng,
        delivery_proof_required: Array.isArray(remark?.risk_assessment?.required_evidence)
          && remark.risk_assessment.required_evidence.length > 0,
        latitude: row.deliverLat,
        longitude: row.deliverLng,
        details,
        tasks: details,
        images: row.images || [],
        user: user
          ? {
              id: user.id,
              nickname: user.nickname || '用户',
              avatar: user.avatar || '/static/logo.jpg',
              phone: user.phone || '',
            }
          : null,
	        rider,
	        rider_id: row.riderId,
	        rider_type: rider?.rider_type || 'part_time',
	        receiver_type: receiverType,
	        order_receiver_type: receiverType,
	        requested_receiver_type: requestedReceiverType,
	        final_receiver_type: finalReceiverType,
	        fallback_to_rider_enabled: fallbackToRiderEnabled,
	        fallback_release_at: fallbackReleaseAt,
	        fallback_triggered: fallbackTriggered,
	        fallback_upgrade_fee: 0,
	        receiver_settlement_note: fallbackTriggered || fallbackToRiderEnabled ? '兜底单，按原价结算' : '',
	        delivery_display_mode: deliveryDisplayMode,
        delivery_track_mode: deliveryDisplayMode,
        remarks: row.description || '',
        user_gender: user?.gender || 0,
        created_at: row.createdAt,
        assigned_time: row.acceptTime,
        updated_at: row.updatedAt,
      }
    })
  }

  private async formatShopOrdersForRider(rows: any[]) {
    const riderIds = Array.from(new Set(rows.map((row) => row.riderId).filter(Boolean)));
    const riders = riderIds.length
      ? await this.prisma.regionRider.findMany({
          where: { userId: { in: riderIds } },
          include: { User: { select: { id: true, nickname: true, avatar: true, phone: true } } },
        })
      : [];
    const riderMap = new Map(riders.map((rider: any) => [rider.userId, rider]));
    return rows.map((row) => {
      const merchant = row.merchant || {};
      const user = row.user || {};
      const serviceType = row.businessType === 'dorm_shop' ? 'dorm_shop' : 'food_delivery';
      const deliveryMode = row.deliveryMode || 'platform_rider';
      const displayStatus = ['refunding', 'refunded'].includes(String(row.refundStatus || 'none'))
        ? String(row.refundStatus)
        : row.status === 'PAID'
          ? 'confirmed'
          : row.status === 'SHIPPED'
            ? row.pickupTime ? 'picked_up' : 'accepted'
            : ['DELIVERED', 'RECEIVED', 'COMPLETED'].includes(row.status)
              ? 'completed'
              : 'cancelled';
      const rider = row.riderId ? riderMap.get(row.riderId) : null;
      const items = Array.isArray(row.items) ? row.items : [];
      const description = items.length
        ? items.map((item: any) => `${item.productName} x${item.quantity}`).join('、')
        : `${merchant.name || '商家'}订单`;
      const details = items.map((item: any) => ({
        task_type: serviceType,
        description: item.productName,
        item_size_name: `x${item.quantity}`,
        computed_fee: this.numberValue(item.totalPrice ?? item.price, 0).toFixed(2),
        image_urls: item.productImage ? [item.productImage] : [],
        pickup_point_name: merchant.name || '',
        pickup_address: merchant.address || '',
      }));
      return {
        id: row.id,
        order_id: row.id,
        delivery_order_id: row.id,
        order_no: row.orderNo,
        orderNo: row.orderNo,
        service_type: serviceType,
        subType: serviceType,
        type: 'delivery',
        raw_type: row.businessType,
        delivery_mode: deliveryMode,
        delivery_mode_label: deliveryMode === 'rider_delivery' ? '叫骑手配送' : '平台配送',
        status: displayStatus,
        raw_status: row.status,
        refund_status: row.refundStatus || 'none',
        refund_amount: this.numberValue(row.refundAmount, 0).toFixed(2),
        payment_status: row.status === 'PENDING_PAY' ? 'unpaid' : 'paid',
        title: row.businessType === 'dorm_shop' ? '宿舍小店配送' : '外卖配送',
        description,
        total_amount: this.numberValue(row.payAmount, 0).toFixed(2),
        pay_amount: this.numberValue(row.payAmount, 0),
        amount: this.numberValue(row.payAmount, 0),
        price: this.numberValue(row.freightAmount, 0),
        tip: 0,
        platform_delivery_fee: this.numberValue(row.freightAmount, 0).toFixed(2),
        delivery_time: row.deliverTime || row.createdAt,
        delivery_address: row.receiverAddress,
        address: row.receiverAddress,
        delivery_contact: row.receiverName || user.nickname || '用户',
        delivery_phone: row.receiverPhone || user.phone || '',
        recipient_name: row.receiverName || user.nickname || '用户',
        mobile: row.receiverPhone || user.phone || '',
        pickup_address: merchant.address || merchant.name || '',
        pickup_contact: merchant.name || '',
        pickup_phone: merchant.phone || '',
        merchant_name: merchant.name || '商家',
        merchant_address: merchant.address || '',
        merchant_phone: merchant.phone || '',
        merchant_logo: merchant.logo || '',
        pickup_latitude: this.numberValue(merchant.latitude, 0) || null,
        pickup_longitude: this.numberValue(merchant.longitude, 0) || null,
        delivery_latitude: null,
        delivery_longitude: null,
        delivery_proof_required: false,
        latitude: this.numberValue(merchant.latitude, 0),
        longitude: this.numberValue(merchant.longitude, 0),
        details,
        tasks: details,
        images: items.map((item: any) => item.productImage).filter(Boolean),
        user: user.id
          ? {
              id: user.id,
              nickname: user.nickname || '用户',
              avatar: user.avatar || '/static/logo.jpg',
              phone: user.phone || '',
            }
          : null,
        rider: rider ? this.publicRiderProfile(rider) : null,
        rider_id: row.riderId,
        delivery_display_mode: row.deliveryDisplayMode || 'live_map',
        delivery_track_mode: row.deliveryDisplayMode || 'live_map',
        remarks: row.remark || '',
        created_at: row.createdAt,
        assigned_time: row.acceptTime,
        updated_at: row.updatedAt,
      };
    });
  }

	  async getUserOrders(userId: string, query: any) {
	    const { page = 1, limit = 20, filter_type } = query;
	    const regionId = this.cleanRegionId(query?.region_id ?? query?.regionId)
	    const pageNo = Number(page) || 1
	    const pageSize = Number(limit || query?.pageSize || 20) || 20
	    const filterType = String(filter_type || '').trim()
	    const where: any = {}
	    if (regionId) where.regionId = regionId
	    let identity: any = null
	    if (filterType === 'pending_orders') {
	      identity = await this.getOrderTakingIdentity(userId, { region_id: regionId })
	      if (identity.regionId) where.regionId = identity.regionId
	      where.status = 'pending_accept'
	      where.riderId = null
	      where.refundStatus = { notIn: ['refunding', 'refunded'] }
	    } else if (filterType === 'my_accepted_orders') {
	      where.riderId = userId
    } else if (filterType === 'my_orders' || !filterType) {
      where.userId = userId
    } else {
      where.userId = userId
      const normalizedType = this.normalizeServiceType(filterType)
      if (normalizedType) where.type = normalizedType
    }
	    const include = {
	      User: { select: { id: true, nickname: true, avatar: true, phone: true } },
	      RegionRider: {
	        include: {
	          User: { select: { id: true, nickname: true, avatar: true } },
	        },
	      },
	      tasks: true,
	    }
	    let rows: any[] = []
	    let total = 0
	    if (filterType === 'pending_orders') {
	      const candidates = await this.prisma.errandOrder.findMany({
	        where: identity?.regionId ? where : { id: '__never__' },
	        take: Math.max(pageNo * pageSize * 4, pageSize),
	        orderBy: { createdAt: 'desc' },
	        include,
	      })
	      const filtered = this.filterErrandRowsForOrderTaking(candidates, identity)
	      total = filtered.length
	      rows = filtered.slice((pageNo - 1) * pageSize, pageNo * pageSize)
	    } else {
	      const result = await Promise.all([
	        this.prisma.errandOrder.findMany({
	          where,
	          skip: (pageNo - 1) * pageSize,
	          take: pageSize,
	          orderBy: { createdAt: 'desc' },
	          include,
	        }),
	        this.prisma.errandOrder.count({ where }),
	      ])
	      rows = result[0]
	      total = result[1]
	    }
	    if (!identity) identity = await this.getOrderTakingIdentity(userId, { region_id: regionId }).catch(() => null)
	    const formattedOrders = await this.formatMiniOrders(rows)
	    return {
	      success: true,
	      is_rider: identity?.role === 'approved_rider',
	      can_take_orders: !!identity?.canTakeOrders,
	      receiver_identity: this.formatOrderTakingIdentity(identity || {}),
	      orders: filterType === 'pending_orders'
          ? formattedOrders.map(poolErrandProjection)
          : formattedOrders,
	      pagination: {
        page: pageNo,
        limit: pageSize,
        total,
        has_more: pageNo * pageSize < total,
      },
    };
  }

  async getRegionCompletedOrders(query: any) {
    const { region_id, limit = 20 } = query;
    const regionId = this.cleanRegionId(region_id)
    const rows = await this.prisma.errandOrder.findMany({
      where: { ...(regionId ? { regionId } : {}), status: 'completed' },
      take: Number(limit) || 20,
      orderBy: { completeTime: 'desc' },
      include: {
        User: { select: { id: true, nickname: true, avatar: true, phone: true } },
        RegionRider: {
          include: {
            User: { select: { id: true, nickname: true, avatar: true } },
          },
        },
      },
    });
    const formatted = await this.formatMiniOrders(rows);
    return { success: true, orders: formatted.map(publicErrandProjection) };
  }

  private async notifyAvailableRiders(order: any) {
    const regionId = this.cleanRegionId(order?.regionId);
    if (!regionId) return;

    const riders = await this.prisma.regionRider.findMany({
      where: {
        regionId,
        verifyStatus: 'approved',
        status: 'online',
        notificationStatus: { not: false },
      },
      select: { userId: true },
    });
    if (!riders.length) return;

    const orderForDispatch = await this.prisma.errandOrder.findUnique({
      where: { id: order.id },
      include: { tasks: true },
    }).catch(() => null);
    const dispatchOrder = this.buildDispatchOrderPayload(orderForDispatch || order);
    // PERF-P0-01: 批量计算所有骑手在途单量，避免 N+1 扇出（原来每个骑手 2 次 count，
    // 一次派单 = 2×骑手数 个并发查询；高并发下会瞬间打满连接池）。改为 2 次 groupBy。
    const activeCountByRider = await this.getActiveOrderCountsByRider(
      riders.map((rider) => rider.userId),
    );
    const riderAssessments = riders.map((rider) => {
      const count = activeCountByRider.get(rider.userId) || 0;
      const context = { active_orders_count: count, activeOrdersCount: count };
      const assessment = assessErrandDispatch({ order: dispatchOrder, rider: context });
      return { rider, assessment };
    });
    const sortedAssessments = riderAssessments.sort((a, b) => b.assessment.score - a.assessment.score);
    const recommendedAssessments = sortedAssessments.filter((item) => item.assessment.canAccept);
    const notifyTargets = recommendedAssessments.length ? recommendedAssessments : sortedAssessments;
    const title = '有新的跑腿订单待接单';
    const content = `${this.serviceTitle(order.type)} ${this.numberValue(order.payAmount, 0).toFixed(2)}元，点击查看接单大厅`;
    const results = await Promise.allSettled(notifyTargets.map(({ rider, assessment }) => this.notifyService.createAndDispatch({
      userId: rider.userId,
      regionId,
      type: 'delivery',
      scene: 'new_errand_order',
      title,
      content,
      data: {
        orderId: order.id,
        orderNo: order.orderNo,
        serviceType: internalErrandTypeToMini(order.type),
        amount: this.numberValue(order.payAmount, 0),
        dispatch_source: 'backend',
        dispatch_score: assessment.score,
        dispatch_risk_level: assessment.riskLevel,
        dispatch_reason: assessment.reasonText,
      },
      linkType: 'page',
      linkValue: '/RunErrands?tab=pending_orders',
      channelMask: { inApp: true, websocket: true },
    })));
    const failed = results.filter((item) => item.status === 'rejected').length;
    if (failed) this.logger.warn(`跑腿新单通知部分失败 order=${order.id} failed=${failed}`);
  }

  async getPageConfig(regionId: string) {
    if (!regionId) throw new BadRequestException('region_id 必填');
    const config = await this.prisma.errandPageConfig.upsert({
      where: { regionId },
      update: {},
      create: {
        regionId,
        notice: '急事找同学帮忙，跑腿更快一步',
        orderTips: '请填写清楚取件码、取件点和送达地址',
      },
    });
    const extended = await this.getExtendedConfig(regionId, 0)
    const miniConfig = defaultErrandMiniPageConfig(config, extended)
    return {
      success: true,
      data: [
        {
          id: config.id,
          region_id: regionId,
          regionId,
          config: miniConfig,
          updated_at: config.updatedAt,
        },
      ],
    };
  }

  async receiveOrder(userId: string, dto: any) {
    const { order_id } = dto;
    if (!order_id) throw new NotFoundException('order_id 必填');
    return this.acceptOrder(order_id, userId);
  }

	  async getDeliveryOrdersList(userId: string, query: any) {
	    const page = Number(query?.page || 1) || 1
	    const pageSize = Number(query?.pageSize || query?.limit || 20) || 20
	    const rawStatus = String(query?.status || 'awaiting_delivery')
	    const normalizedStatus = this.normalizeMiniOrderStatus(rawStatus)
	    const type: string = String(query?.type || 'all')
	    const identity = await this.getOrderTakingIdentity(userId, query)
	    const receiverIdentity = this.formatOrderTakingIdentity(identity)
	    const regionId = this.cleanRegionId(identity.regionId)
	    const where: any = regionId ? { regionId } : { id: '__never__' }
	    const includeErrand = type === 'errand' || type === 'all';
	    const includeShopOrders = identity.role === 'approved_rider' && (type === 'all' || type === 'delivery' || type === 'takeaway' || type === 'dorm_shop');
	    if (!includeErrand && !includeShopOrders) {
	      return {
	        success: true,
	        orders: [],
	        is_rider: identity.role === 'approved_rider',
	        can_take_orders: !!identity.canTakeOrders,
	        receiver_identity: receiverIdentity,
	        status_counts: { awaiting_delivery: 0, received: 0, picked_up: 0, delivered: 0 },
	        pagination: { current_page: page, page_size: pageSize, total: 0, total_pages: 0 },
	        total_items: 0,
      }
    }
    if (normalizedStatus === 'pending_accept') {
      where.status = 'pending_accept'
      where.riderId = null
	      where.refundStatus = { notIn: ['refunding', 'refunded'] }
    } else if (normalizedStatus === 'completed') {
      where.status = 'completed'
      where.riderId = userId
    } else if (normalizedStatus === 'accepted') {
      where.status = 'accepted'
      where.riderId = userId
    } else if (normalizedStatus === 'in_progress') {
      where.status = { in: ['in_progress', 'arrived'] }
      where.riderId = userId
    } else {
      where.riderId = userId
    }
	    const riderDeliveryWhere = { in: ['platform_rider', 'rider_delivery'] };
	    const shopWhere: any = { merchant: { regionId }, deliveryMode: riderDeliveryWhere };
    if (type === 'takeaway' || type === 'dorm_shop') shopWhere.businessType = type;
    if (normalizedStatus === 'pending_accept') {
      shopWhere.status = 'PAID';
      shopWhere.riderId = null;
	      shopWhere.refundStatus = { notIn: ['refunding', 'refunded'] };
      shopWhere.readyTime = { not: null };
      shopWhere.OR = [{ fulfillmentStartTime: null }, { fulfillmentStartTime: { lte: new Date() } }];
    } else if (normalizedStatus === 'completed') {
      shopWhere.status = { in: ['DELIVERED', 'RECEIVED', 'COMPLETED'] as any };
      shopWhere.riderId = userId;
    } else if (normalizedStatus === 'accepted') {
      shopWhere.status = 'SHIPPED';
      shopWhere.riderId = userId;
      shopWhere.pickupTime = null;
    } else if (normalizedStatus === 'in_progress') {
      shopWhere.status = 'SHIPPED';
      shopWhere.riderId = userId;
      shopWhere.pickupTime = { not: null };
    } else {
      shopWhere.riderId = userId;
    }
	    const errandInclude = {
	      User: { select: { id: true, nickname: true, avatar: true, phone: true } },
	      RegionRider: { include: { User: { select: { id: true, nickname: true, avatar: true } } } },
	      tasks: true,
	    }
	    let rows: any[] = []
	    let errandTotal = 0
	    let awaitingErrand = 0
	    if (includeErrand && normalizedStatus === 'pending_accept' && identity.role === 'ordinary_user') {
	      const candidates = await this.prisma.errandOrder.findMany({
	        where,
	        take: Math.max(page * pageSize * 4, pageSize),
	        orderBy: { createdAt: 'desc' },
	        include: errandInclude,
	      })
	      const filtered = this.filterErrandRowsForOrderTaking(candidates, identity)
	      awaitingErrand = filtered.length
	      errandTotal = filtered.length
	      rows = filtered.slice((page - 1) * pageSize, page * pageSize)
	    } else if (includeErrand && normalizedStatus === 'pending_accept' && identity.role === 'approved_rider') {
	      const candidates = await this.prisma.errandOrder.findMany({
	        where,
	        take: Math.max(page * pageSize * 4, pageSize),
	        orderBy: { createdAt: 'desc' },
	        include: errandInclude,
	      })
	      const filtered = this.filterErrandRowsForApprovedRider(candidates, identity)
	      awaitingErrand = filtered.length
	      errandTotal = filtered.length
	      rows = filtered.slice((page - 1) * pageSize, page * pageSize)
	    } else {
	      const result = await Promise.all([
	        this.prisma.errandOrder.findMany({
	          where: includeErrand ? where : { id: '__never__' },
	          skip: (page - 1) * pageSize,
	          take: pageSize,
	          orderBy: { createdAt: 'desc' },
	          include: errandInclude,
	        }),
	        this.prisma.errandOrder.count({ where: includeErrand ? where : { id: '__never__' } }),
	        this.prisma.errandOrder.count({ where: includeErrand ? { regionId, status: 'pending_accept', riderId: null, refundStatus: { notIn: ['refunding', 'refunded'] } } : { id: '__never__' } }),
	      ])
	      rows = result[0]
	      errandTotal = result[1]
	      awaitingErrand = result[2]
	    }
    const [shopRows, shopTotal, awaitingShop, receivedErrand, receivedShop, pickedUpErrand, pickedUpShop, deliveredErrand, deliveredShop] = await Promise.all([
	      this.prisma.order.findMany({
	        where: includeShopOrders ? shopWhere : { id: '__never__' },
	        skip: (page - 1) * pageSize,
	        take: pageSize,
	        orderBy: { createdAt: 'desc' },
	        include: {
          merchant: { select: { id: true, name: true, regionId: true, address: true, phone: true, logo: true, latitude: true, longitude: true, businessType: true } },
	          user: { select: { id: true, nickname: true, avatar: true, phone: true } },
	          items: true,
	        },
	      }),
	      this.prisma.order.count({ where: includeShopOrders ? shopWhere : { id: '__never__' } }),
      this.prisma.order.count({ where: includeShopOrders ? { merchant: { regionId }, deliveryMode: riderDeliveryWhere, ...(type === 'takeaway' || type === 'dorm_shop' ? { businessType: type } : {}), status: 'PAID' as any, riderId: null, refundStatus: { notIn: ['refunding', 'refunded'] }, readyTime: { not: null }, OR: [{ fulfillmentStartTime: null }, { fulfillmentStartTime: { lte: new Date() } }] } : { id: '__never__' } }),
	      this.prisma.errandOrder.count({ where: includeErrand ? { regionId, riderId: userId, status: 'accepted' } : { id: '__never__' } }),
      this.prisma.order.count({ where: includeShopOrders ? { merchant: { regionId }, deliveryMode: riderDeliveryWhere, ...(type === 'takeaway' || type === 'dorm_shop' ? { businessType: type } : {}), riderId: userId, status: 'SHIPPED' as any, pickupTime: null } : { id: '__never__' } }),
      this.prisma.errandOrder.count({ where: includeErrand ? { regionId, riderId: userId, status: { in: ['in_progress', 'arrived'] } } : { id: '__never__' } }),
      this.prisma.order.count({ where: includeShopOrders ? { merchant: { regionId }, deliveryMode: riderDeliveryWhere, ...(type === 'takeaway' || type === 'dorm_shop' ? { businessType: type } : {}), riderId: userId, status: 'SHIPPED' as any, pickupTime: { not: null } } : { id: '__never__' } }),
	      this.prisma.errandOrder.count({ where: includeErrand ? { regionId, riderId: userId, status: 'completed' } : { id: '__never__' } }),
	      this.prisma.order.count({ where: includeShopOrders ? { merchant: { regionId }, deliveryMode: riderDeliveryWhere, ...(type === 'takeaway' || type === 'dorm_shop' ? { businessType: type } : {}), riderId: userId, status: { in: ['DELIVERED', 'RECEIVED', 'COMPLETED'] as any } } : { id: '__never__' } }),
	    ])
	    const formattedRows = [
	      ...(await this.formatMiniOrders(rows)),
	      ...(await this.formatShopOrdersForRider(shopRows)),
	    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
	    const dispatchRows = normalizedStatus === 'pending_accept' && identity.role === 'approved_rider'
	      ? enrichErrandOrdersForDispatch(formattedRows, { rider: await this.getRiderDispatchContext(userId) })
	      : formattedRows;
	    const visibleRows = normalizedStatus === 'pending_accept'
        ? dispatchRows.map(row => row.type === 'errand' ? poolErrandProjection(row) : row)
        : dispatchRows;
	    const total = errandTotal + shopTotal;
	    return {
	      success: true,
	      orders: visibleRows.slice(0, pageSize),
	      is_rider: identity.role === 'approved_rider',
	      can_take_orders: !!identity.canTakeOrders,
	      receiver_identity: receiverIdentity,
	      status_counts: {
        awaiting_delivery: awaitingErrand + awaitingShop,
        received: receivedErrand + receivedShop,
        picked_up: pickedUpErrand + pickedUpShop,
        delivered: deliveredErrand + deliveredShop,
      },
      pagination: {
        current_page: page,
        page_size: pageSize,
        total,
        total_pages: Math.ceil(total / pageSize),
      },
      total_items: total,
    };
  }

  async updateDeliveryOrder(orderId: string, userId: string, dto: any) {
    if (dto?.status) {
      return this.updateRiderStatus(orderId, userId, dto)
    }
    throw new BadRequestException('不支持的订单操作');
  }

  async returnToPool(orderId: string, userId: string, dto: any) {
    return this.runWithLock(
      `errand:order:${orderId}:return`,
      '订单正在退回接单池，请稍后再试',
      () => this.returnToPoolUnlocked(orderId, userId, dto),
    );
  }

  private async returnToPoolUnlocked(orderId: string, userId: string, dto: any) {
    const order = await this.prisma.errandOrder.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('订单不存在');
    if (order.riderId !== userId) throw new BadRequestException('无权退回该订单');
    if (['refunding', 'refunded'].includes(String(order.refundStatus || 'none'))) {
      throw new BadRequestException('订单退款处理中，不能退回接单池');
    }
    if (order.status !== 'accepted') throw new BadRequestException('仅未取货订单可退回接单池');
    const updated = await this.prisma.$transaction(async (tx) => {
      const released = await tx.errandOrder.updateMany({
        where: { id: orderId, riderId: userId, status: 'accepted', refundStatus: { notIn: ['refunding', 'refunded'] } },
        data: { riderId: null, status: 'pending_accept', acceptTime: null, pickupTime: null, deliverTime: null },
      });
      if (released.count !== 1) throw new BadRequestException('订单状态已变化，请刷新后重试');
      await this.recordDeliveryNode(tx, {
        orderId, nodeType: 'returned_pool', operatorId: userId,
        displayMode: order.deliveryDisplayMode,
        remark: String(dto?.remark || '').trim() || '骑手退回接单池',
      });
      const [activeErrands, activeShopOrders] = await Promise.all([
        tx.errandOrder.count({ where: { riderId: userId, status: { in: ['accepted', 'in_progress', 'arrived'] } } }),
        tx.order.count({ where: { riderId: userId, status: 'SHIPPED' as any } }),
      ]);
      await tx.regionRider.updateMany({
        where: { userId, verifyStatus: 'approved', status: 'busy' },
        data: { status: activeErrands + activeShopOrders > 0 ? 'busy' : 'online' },
      });
      return tx.errandOrder.findUniqueOrThrow({ where: { id: orderId } });
    });
    return { success: true, message: '订单已退回接单池', data: updated };
  }

  async getRiderInfo(userId: string) {
    const rider = await this.prisma.regionRider.findUnique({
      where: { userId },
      include: { User: { select: { id: true, nickname: true, avatar: true, phone: true } } },
    });
    if (!rider) return null;
    return this.formatRiderInfo(rider, true);
  }

  async updateRiderInfo(userId: string, dto: any) {
    const existing = await this.prisma.regionRider.findUnique({
      where: { userId },
      select: { verifyStatus: true, realName: true, idCard: true },
    });
    if (!existing) throw new NotFoundException('骑手不存在');
    const data: any = {}
    const realName = dto?.real_name ?? dto?.full_name
    const phone = dto?.phone ?? dto?.phone_number
    // SEC-P0-B4: 审核通过的骑手不能通过自助接口篡改实名信息（姓名/身份证）。
    // 只有 realName / idCard 相较现值确实变化时才拦截，避免前端回传原值被误伤。
    if (existing.verifyStatus === 'approved') {
      const nextRealName = realName !== undefined ? String(realName).trim() : undefined
      const nextIdCard = (dto?.id_card !== undefined || dto?.idCard !== undefined)
        ? String(dto?.id_card ?? dto?.idCard).trim()
        : undefined
      if (
        (nextRealName !== undefined && nextRealName !== (existing.realName || '')) ||
        (nextIdCard !== undefined && nextIdCard !== (existing.idCard || ''))
      ) {
        throw new BadRequestException('实名信息已通过审核，如需修改请联系平台重新认证');
      }
    }
    if (realName !== undefined) data.realName = String(realName).trim()
    if (phone !== undefined) data.phone = String(phone).trim()
    if (dto?.id_card !== undefined || dto?.idCard !== undefined) data.idCard = String(dto?.id_card ?? dto?.idCard).trim()
    if (dto?.alipay_account !== undefined || dto?.alipayAccount !== undefined) data.alipayAccount = String(dto?.alipay_account ?? dto?.alipayAccount).trim()
    if (dto?.rider_bio !== undefined || dto?.riderBio !== undefined) data.riderBio = String(dto?.rider_bio ?? dto?.riderBio).trim()
    if (dto?.notification_status !== undefined || dto?.notificationStatus !== undefined) {
      data.notificationStatus = Number(dto?.notification_status ?? dto?.notificationStatus) !== 0
    }
    if (dto?.anonymous !== undefined) data.anonymous = Number(dto.anonymous) === 1 || dto.anonymous === true
    if (dto?.status !== undefined) data.status = this.normalizeRiderStatus(dto.status)
    if (data.status === 'offline') {
      const [activeErrands, activeShopOrders] = await Promise.all([
        this.prisma.errandOrder.count({ where: { riderId: userId, status: { in: ['accepted', 'in_progress', 'arrived'] } } }),
        this.prisma.order.count({ where: { riderId: userId, status: 'SHIPPED' as any } }),
      ]);
      if (activeErrands + activeShopOrders > 0) throw new BadRequestException('还有进行中的订单，完成后才能下线');
    }
    const rider = await this.prisma.regionRider.update({
      where: { userId },
      data,
      include: { User: { select: { id: true, nickname: true, avatar: true, phone: true } } },
    });
    return this.formatRiderInfo(rider, true);
  }

  async getOrderStats(userId: string) {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)
    const [total, today, month] = await Promise.all([
      this.prisma.errandOrder.count({ where: { riderId: userId, status: 'completed' } }),
      this.prisma.errandOrder.count({ where: { riderId: userId, status: 'completed', completeTime: { gte: todayStart } } }),
      this.prisma.errandOrder.count({ where: { riderId: userId, status: 'completed', completeTime: { gte: monthStart } } }),
    ])
    return { total, today, total_orders: total, today_orders: today, month_orders: month };
  }

  async applyRider(userId: string, dto: any) {
    const regionId = this.cleanRegionId(dto?.region_id ?? dto?.regionId)
    const realName = String(dto?.real_name ?? dto?.full_name ?? '').trim()
    const phone = String(dto?.phone ?? dto?.phone_number ?? '').trim()
    const idCard = String(dto?.id_card ?? dto?.idCard ?? '待补充').trim()
    if (!regionId) throw new BadRequestException('请选择申请区域');
    if (!realName) throw new BadRequestException('请输入姓名');
    if (!phone) throw new BadRequestException('请输入手机号');
    // SEC-P0-B4: upsert 的 update 分支会把 approved 骑手打回 pending+offline，
    // 绕过“有进行中订单不能下线”的校验。已认证且有在途订单时禁止重新提交申请。
    const existingRider = await this.prisma.regionRider.findUnique({
      where: { userId },
      select: { verifyStatus: true },
    });
    if (existingRider?.verifyStatus === 'approved') {
      const [activeErrands, activeShopOrders] = await Promise.all([
        this.prisma.errandOrder.count({ where: { riderId: userId, status: { in: ['accepted', 'in_progress', 'arrived'] } } }),
        this.prisma.order.count({ where: { riderId: userId, status: 'SHIPPED' as any } }),
      ]);
      if (activeErrands + activeShopOrders > 0) {
        throw new BadRequestException('还有进行中的订单，完成后才能修改认证信息');
      }
    }
    const rider = await this.prisma.regionRider.upsert({
      where: { userId },
      update: {
        regionId,
        realName,
        phone,
        idCard,
        alipayAccount: dto?.alipay_account ?? dto?.alipayAccount ?? null,
        riderBio: dto?.rider_bio ?? dto?.riderBio ?? null,
        verifyStatus: 'pending',
        status: 'offline',
      },
      create: {
        userId,
        regionId,
        realName,
        phone,
        idCard,
        alipayAccount: dto?.alipay_account ?? dto?.alipayAccount ?? null,
        riderBio: dto?.rider_bio ?? dto?.riderBio ?? null,
        verifyStatus: 'pending',
        status: 'offline',
      },
      include: { User: { select: { id: true, nickname: true, avatar: true, phone: true } } },
    });
    return { success: true, message: '申请已提交，请等待审核', data: this.formatRiderInfo(rider, true) };
  }

  async updateLocation(userId: string, dto: any) {
    const lat = this.numberValue(dto?.lat ?? dto?.latitude, NaN)
    const lng = this.numberValue(dto?.lng ?? dto?.longitude, NaN)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new BadRequestException('定位坐标无效');
    const rider = await this.prisma.regionRider.update({
      where: { userId },
      data: { lat, lng, locationUpdatedAt: new Date() },
      include: { User: { select: { id: true, nickname: true, avatar: true, phone: true } } },
    });
    // SEC-P0-B5: 写入 Redis rider:location，供外卖“就近推送骑手”按距离排序。
    // 原本只有已废弃的 DeliveryService 写这个 key，下线后必须由 errand 补上，否则就近推送退化为按 userId 排序。
    await this.redis
      .hset(
        'rider:location',
        userId,
        JSON.stringify({ lat, lng, time: Date.now() }),
      )
      .catch(() => undefined);
    return { success: true, data: this.formatRiderInfo(rider, true) };
  }

  async getRiderLocation(viewerId: string, riderId: string, orderId?: string) {
    const rider = await this.prisma.regionRider.findFirst({
      where: { OR: [{ id: riderId }, { userId: riderId }] },
      select: { id: true, userId: true, lat: true, lng: true, locationUpdatedAt: true },
    });
    if (!rider) throw new NotFoundException('骑手不存在');
    if (rider.userId !== viewerId) {
      const relatedOrder = await this.prisma.errandOrder.findFirst({
        where: {
          ...(orderId ? { id: orderId } : {}),
          userId: viewerId,
          riderId: rider.userId,
          status: { in: ['accepted', 'in_progress', 'arrived'] },
          refundStatus: { notIn: ['refunding', 'refunded'] },
        },
        select: { id: true },
      });
      if (!relatedOrder) throw new BadRequestException('无权查看骑手位置');
    }
    return {
      lat: rider.lat,
      lng: rider.lng,
      locationUpdatedAt: rider.locationUpdatedAt,
    };
  }

  async requestTransfer(orderId: string, userId: string, dto: any) {
    const order = await this.prisma.errandOrder.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('订单不存在');
    if (order.riderId !== userId) throw new BadRequestException('无权转出该订单');
    if (order.status !== 'accepted') throw new BadRequestException('仅未取货订单可转单');
    const target = await this.prisma.regionRider.findFirst({
      where: { OR: [{ id: dto?.target_rider_id }, { userId: dto?.target_rider_id }] },
    });
    if (!target) throw new NotFoundException('目标骑手不存在');
    if (target.verifyStatus !== 'approved') throw new BadRequestException('目标骑手未通过审核');
    if (target.userId === userId) throw new BadRequestException('不能转给自己');
    if (order.regionId && target.regionId && order.regionId !== target.regionId) {
      const existingRisk = await this.prisma.deliveryRiskEvent.findFirst({
        where: {
          orderId,
          orderType: 'errand',
          eventType: 'cross_region_transfer_attempt',
          handled: false,
        },
        select: { id: true },
      });
      if (!existingRisk) {
        await this.prisma.deliveryRiskEvent.create({
          data: {
            orderId,
            orderType: 'errand',
            riderId: userId,
            eventType: 'cross_region_transfer_attempt',
            eventLevel: 'critical',
            description: `订单 ${order.orderNo || order.id} 尝试从区域 ${order.regionId} 转给区域 ${target.regionId} 的骑手，已拦截。`,
          },
        });
      }
      throw new BadRequestException('目标骑手不属于订单区域');
    }
    return this.prisma.transferRequest.create({ data: { orderId, fromRiderId: userId, toRiderId: target.userId } });
  }

  async getTransferRequests(userId: string) {
    const requests = await this.prisma.transferRequest.findMany({
      where: { toRiderId: userId, status: 'pending' },
      orderBy: { createdAt: 'desc' },
    });
    const orderIds = requests.map(item => item.orderId)
    const riderIds = Array.from(new Set(requests.map(item => item.fromRiderId)))
    const [orders, riders] = await Promise.all([
      orderIds.length ? this.prisma.errandOrder.findMany({ where: { id: { in: orderIds } } }) : [],
      riderIds.length
        ? this.prisma.regionRider.findMany({
            where: { userId: { in: riderIds } },
            include: { User: { select: { id: true, nickname: true, avatar: true, phone: true } } },
          })
        : [],
    ])
    const orderMap = new Map(orders.map(order => [order.id, order]))
    const riderMap = new Map(riders.map(rider => [rider.userId, rider]))
    return {
      success: true,
      total_requests: requests.length,
      requests: requests.map(item => {
        const order = orderMap.get(item.orderId)
        const fromRider = this.publicRiderProfile(riderMap.get(item.fromRiderId))
        return {
          id: item.id,
          order: order ? {
            id: order.id,
            delivery_address: order.deliverAddress,
            delivery_contact: order.deliverContact || '用户',
            delivery_phone: order.deliverPhone || '',
            total_amount: this.numberValue(order.payAmount, 0).toFixed(2),
            delivery_fee: (this.numberValue(order.price, 0) + this.numberValue(order.tip, 0)).toFixed(2),
            items: [{ name: order.title, quantity: 1 }],
          } : null,
          from_rider: {
            name: fromRider?.name || '骑手',
            avatar: fromRider?.avatar || '/static/logo.jpg',
          },
        }
      }),
    };
  }

  async respondToTransfer(transferId: string, userId: string, dto: any) {
    return this.runWithLock(
      `errand:transfer:${transferId}`,
      '转单请求正在处理中，请稍后再试',
      () => this.respondToTransferUnlocked(transferId, userId, dto),
    );
  }

  private async respondToTransferUnlocked(transferId: string, userId: string, dto: any) {
    const action = dto?.action === 'accept' ? 'accepted' : 'rejected'
    const transfer = await this.prisma.transferRequest.findUnique({ where: { id: transferId } });
    if (!transfer) throw new NotFoundException('转单请求不存在');
    if (transfer.toRiderId !== userId) throw new BadRequestException('无权处理该转单请求');
    if (transfer.status !== 'pending') throw new BadRequestException('该转单请求已处理');
    return this.prisma.$transaction(async (tx) => {
      const resolved = await tx.transferRequest.updateMany({
        where: { id: transferId, toRiderId: userId, status: 'pending' }, data: { status: action },
      });
      if (resolved.count !== 1) throw new BadRequestException('该转单请求已处理');
      if (action === 'accepted') {
        const claimed = await tx.regionRider.updateMany({
          where: { userId, verifyStatus: 'approved', status: 'online' }, data: { status: 'busy' },
        });
        if (claimed.count !== 1) throw new BadRequestException('骑手状态已变化，请刷新后再接单');
        const moved = await tx.errandOrder.updateMany({
          where: { id: transfer.orderId, riderId: transfer.fromRiderId, status: 'accepted' },
          data: { riderId: userId, status: 'accepted', acceptTime: new Date() },
        });
        if (moved.count !== 1) throw new BadRequestException('订单状态已变化，无法转单');
        const [activeErrands, activeShopOrders] = await Promise.all([
          tx.errandOrder.count({ where: { riderId: transfer.fromRiderId, status: { in: ['accepted', 'in_progress', 'arrived'] } } }),
          tx.order.count({ where: { riderId: transfer.fromRiderId, status: 'SHIPPED' as any } }),
        ]);
        await tx.regionRider.updateMany({
          where: { userId: transfer.fromRiderId, verifyStatus: 'approved', status: 'busy' },
          data: { status: activeErrands + activeShopOrders > 0 ? 'busy' : 'online' },
        });
        await this.recordDeliveryNode(tx, {
          orderId: transfer.orderId, nodeType: 'accepted', operatorId: userId,
          remark: '骑手接收转单',
        });
      }
      return { success: true, data: { ...transfer, status: action } };
    });
  }

  async getRegionRiders(userId?: string) {
    // SEC-P0-B1: 只返回同区域在线骑手，且仅公开字段（不含身份证/支付宝/手机号等敏感信息）。
    // 调用方必须是已认证骑手，用其所属 regionId 限定可见范围，防止跨校区拉全平台骑手实名信息。
    const viewer = userId
      ? await this.prisma.regionRider.findUnique({
          where: { userId },
          select: { regionId: true, verifyStatus: true },
        })
      : null;
    if (!viewer || viewer.verifyStatus !== 'approved') {
      throw new ForbiddenException('仅认证骑手可查看骑手列表');
    }
    const riders = await this.prisma.regionRider.findMany({
      where: {
        status: 'online',
        verifyStatus: 'approved',
        regionId: viewer.regionId,
      },
      include: { User: { select: { id: true, nickname: true, avatar: true } } },
      orderBy: { updatedAt: 'desc' },
    });
    return {
      success: true,
      riders: riders
        .map(rider => this.publicRiderProfile(rider))
        .filter(Boolean)
        .map(profile => ({ ...profile, active_orders_count: 0 })),
    };
  }

  async getMyIncentiveRecords(userId: string, query: any) {
    const { page = 1, pageSize = 20 } = query;
    return this.prisma.incentiveRecord.findMany({ where: { userId }, skip: (page - 1) * pageSize, take: Number(pageSize), orderBy: { createdAt: 'desc' } });
  }

  // ================= 后台管理 (Admin) =================
  async getAdminConfig(regionId: string) {
    if (!regionId) throw new BadRequestException('regionId is required');
    let config = await this.prisma.errandConfig.findUnique({ where: { regionId } });
    if (!config) {
      config = await this.prisma.errandConfig.create({ data: { regionId } });
    }
    const extended = await this.getExtendedConfig(regionId, this.numberValue(config.basePrice, 0));
    return {
      ...config,
      ...extended,
      miniConfig: buildMiniErrandConfig(config, extended),
    };
  }

  async updateAdminConfig(regionId: string, dto: any) {
    if (!regionId) throw new BadRequestException('regionId is required');
    const { scalar, extended } = splitErrandConfigPayload(this.omitPersistedMeta(dto))
    const config = await this.prisma.errandConfig.upsert({
      where: { regionId },
      update: scalar,
      create: { regionId, ...scalar },
    });
    if (Object.keys(extended).length) {
      await this.saveExtendedConfig(regionId, extended, this.numberValue(config.basePrice, 0))
    }
    return this.getAdminConfig(regionId)
  }

  async getAdminItemSizes(query: any) {
    const { page = 1, keyword, regionId } = query;
    const limit = Number(query.pageSize || query.limit || 20);
    const applyTo = this.normalizeApplyTo(query.applyTo);
    const where: any = {};
    if (regionId) where.regionId = regionId;
    if (applyTo) where.applyTo = applyTo;
    if (keyword) where.name = { contains: String(keyword).trim() };
    const [list, total] = await Promise.all([
      this.prisma.errandItemSize.findMany({
        where,
        skip: (Number(page) - 1) * limit,
        take: limit,
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.errandItemSize.count({ where })
    ]);
    return { list, total, page: Number(page), pageSize: limit };
  }

  async createItemSize(dto: any) {
    if (!dto?.regionId) throw new BadRequestException('请选择区域');
    if (!dto?.name) throw new BadRequestException('请输入规格名称');
    const payload: any = this.omitPersistedMeta(dto);
    return this.prisma.errandItemSize.create({
      data: {
        ...payload,
        applyTo: this.normalizeApplyTo(payload.applyTo) || 'all',
        weightMin: payload.weightMin === '' ? null : payload.weightMin,
        weightMax: payload.weightMax === '' ? null : payload.weightMax,
        price: this.numberValue(payload.price, 0),
        sortOrder: Number(payload.sortOrder || 0),
      },
    });
  }

  async updateItemSize(id: string, dto: any) {
    const data: any = this.omitPersistedMeta(dto);
    if ('applyTo' in data) data.applyTo = this.normalizeApplyTo(data.applyTo) || 'all';
    if ('weightMin' in data && data.weightMin === '') data.weightMin = null;
    if ('weightMax' in data && data.weightMax === '') data.weightMax = null;
    if ('price' in data) data.price = this.numberValue(data.price, 0);
    if ('sortOrder' in data) data.sortOrder = Number(data.sortOrder || 0);
    return this.prisma.errandItemSize.update({ where: { id }, data });
  }

  async deleteItemSize(id: string) {
    return this.prisma.errandItemSize.delete({ where: { id } });
  }

  async getAdminPickupPoints(query: any) {
    const { page = 1, keyword, regionId } = query;
    const limit = Number(query.pageSize || query.limit || 20);
    const type = this.normalizePickupPointType(query.type);
    const isOpen = this.boolFilter(query.isOpen);
    const where: any = {};
    if (regionId) where.regionId = regionId;
    if (type) where.type = type;
    if (isOpen !== undefined) where.isOpen = isOpen;
    if (keyword) {
      where.OR = [
        { name: { contains: String(keyword).trim() } },
        { address: { contains: String(keyword).trim() } },
      ];
    }
    const [list, total] = await Promise.all([
      this.prisma.errandPickupPoint.findMany({
        where,
        skip: (Number(page) - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.errandPickupPoint.count({ where })
    ]);
    return { list, total, page: Number(page), pageSize: limit };
  }

  async createPickupPoint(dto: any) {
    if (!dto?.regionId) throw new BadRequestException('请选择区域');
    if (!dto?.name) throw new BadRequestException('请输入取件点名称');
    const payload: any = this.omitPersistedMeta(dto);
    return this.prisma.errandPickupPoint.create({
      data: {
        ...payload,
        type: this.normalizePickupPointType(payload.type) || 'pickup',
        latitude: payload.latitude === '' ? null : payload.latitude,
        longitude: payload.longitude === '' ? null : payload.longitude,
        isOpen: payload.isOpen ?? true,
      },
    });
  }

  async updatePickupPoint(id: string, dto: any) {
    const data: any = this.omitPersistedMeta(dto);
    if ('type' in data) data.type = this.normalizePickupPointType(data.type) || 'pickup';
    if ('latitude' in data && data.latitude === '') data.latitude = null;
    if ('longitude' in data && data.longitude === '') data.longitude = null;
    return this.prisma.errandPickupPoint.update({ where: { id }, data });
  }

  async deletePickupPoint(id: string) {
    return this.prisma.errandPickupPoint.delete({ where: { id } });
  }

  async getAdminStats(regionId: string) {
    const where: any = regionId ? { regionId } : {};
    const todayStart = new Date(new Date().setHours(0, 0, 0, 0));

    const [
      totalOrders,
      todayOrders,
      waitingOrders,
      workingOrders,
      activeRiders,
      allRiders,
      completedOrders,
      cancelledOrders,
      refundingOrders,
      pickupPointCount,
      itemSizeCount,
      incomeResult,
      todayIncomeResult,
      serviceTypeRows,
    ] = await Promise.all([
      this.prisma.errandOrder.count({ where }),
      this.prisma.errandOrder.count({ where: { ...where, createdAt: { gte: todayStart } } }),
      this.prisma.errandOrder.count({ where: { ...where, status: 'pending_accept' } }),
      this.prisma.errandOrder.count({ where: { ...where, status: { in: ['accepted', 'in_progress', 'arrived'] } } }),
      this.prisma.regionRider.count({ where: { ...where, status: 'online' } }),
      this.prisma.regionRider.count({ where }),
      this.prisma.errandOrder.count({ where: { ...where, status: 'completed' } }),
      this.prisma.errandOrder.count({ where: { ...where, status: 'cancelled' } }),
      this.prisma.errandOrder.count({ where: { ...where, refundStatus: { in: ['refunding', 'refunded'] } } }),
      this.prisma.errandPickupPoint.count({ where }),
      this.prisma.errandItemSize.count({ where }),
      this.prisma.errandOrder.aggregate({
        where: { ...where, status: 'completed' },
        _sum: { payAmount: true },
      }),
      this.prisma.errandOrder.aggregate({
        where: { ...where, status: 'completed', completeTime: { gte: todayStart } },
        _sum: { payAmount: true },
      }),
      this.prisma.errandOrder.groupBy({
        by: ['type'],
        where,
        _count: { _all: true },
        _sum: { payAmount: true },
      }),
    ]);

    const totalIncome = incomeResult._sum?.payAmount || 0;
    const todayIncome = todayIncomeResult._sum?.payAmount || 0;
    const completionRate = totalOrders > 0 ? Math.round((completedOrders / totalOrders) * 10000) / 100 : 0;

    // 按天统计近 7 天订单趋势
    const trends = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const start = new Date(d.setHours(0, 0, 0, 0));
      const end = new Date(d.setHours(23, 59, 59, 999));
      const [count, dayIncome] = await Promise.all([
        this.prisma.errandOrder.count({
          where: { ...where, createdAt: { gte: start, lte: end } }
        }),
        this.prisma.errandOrder.aggregate({
          where: { ...where, status: 'completed', completeTime: { gte: start, lte: end } },
          _sum: { payAmount: true },
        }),
      ]);
      trends.push({
        date: start.toISOString().split('T')[0],
        count,
        income: dayIncome._sum?.payAmount || 0,
      });
    }

    return {
      totalOrders,
      todayOrders,
      waitingOrders,
      workingOrders,
      activeRiders,
      allRiders,
      completedOrders,
      cancelledOrders,
      refundingOrders,
      pickupPointCount,
      itemSizeCount,
      totalIncome,
      todayIncome,
      completionRate,
      serviceTypes: serviceTypeRows.map(row => ({
        type: row.type,
        count: row._count._all,
        amount: row._sum.payAmount || 0,
      })),
      trends,
    };
  }
}
