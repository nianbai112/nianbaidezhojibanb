import { Injectable, NotFoundException, BadRequestException, Optional } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { WsNativeGateway } from '../websocket/ws-native.gateway';
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

@Injectable()
export class ErrandService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly wsNative?: WsNativeGateway,
  ) {}

  /** 骑手端订单视图（snake_case 字段，兼容骑手 App 展示） */
  private toRiderOrder(row: any, user?: any) {
    if (!row) return null;
    return {
      id: row.id,
      order_no: row.orderNo,
      title: row.title,
      status: row.status,
      type: row.type,
      description: row.description || '',
      delivery_fee: row.payAmount,
      pay_amount: row.payAmount,
      tip: row.tip,
      pickup_address: row.pickupAddress,
      pickup_contact: row.pickupContact || '',
      pickup_phone: row.pickupPhone || '',
      delivery_address: row.deliverAddress,
      delivery_contact: row.deliverContact || '',
      delivery_phone: row.deliverPhone || '',
      user_id: row.userId,
      rider_id: row.riderId || '',
      region_id: row.regionId || '',
      created_at: row.createdAt,
      accept_time: row.acceptTime,
      pickup_time: row.pickupTime,
      deliver_time: row.deliverTime,
      complete_time: row.completeTime,
      user: user || row.User || null,
      remark: row.remark || '',
    };
  }

  /** 新订单进池 / 退回池时，实时推送给该区域已订阅的骑手 */
  private notifyRegionNewOrder(order: any) {
    if (!this.wsNative || !order?.regionId) return;
    try {
      this.wsNative.pushToRegion(order.regionId, {
        event: 'new_errand_order',
        type: 'new_errand_order',
        data: this.toRiderOrder(order),
      });
    } catch {
      // 推送失败不影响主流程
    }
  }

  /** 订单状态变化时推送给下单用户 */
  private notifyUserOrderUpdate(order: any) {
    if (!this.wsNative || !order?.userId) return;
    try {
      this.wsNative.pushToUser(order.userId, {
        event: 'orderUpdate',
        type: 'orderUpdate',
        data: { order_id: order.id, order_no: order.orderNo, status: order.status, kind: 'errand' },
      });
    } catch {
      // 推送失败不影响主流程
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

  private cleanRegionId(value: any) {
    if (value === undefined || value === null) return ''
    const text = String(value).trim()
    if (!text || text === 'NaN' || text === 'null' || text === 'undefined' || text === '0') return ''
    return text
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

  async createOrder(userId: string, dto: any) {
    const orderNo = `ERR${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const tasks = Array.isArray(dto?.tasks) ? dto.tasks : []
    const firstTask = tasks[0] || {}
    const type = this.normalizeServiceType(dto?.service_type ?? dto?.type)
    const addressId = dto?.address_id ?? dto?.addressId
    const savedAddress = addressId
      ? await this.prisma.address.findFirst({ where: { id: String(addressId), userId } })
      : null
    const regionId = this.cleanRegionId(dto?.region_id ?? dto?.regionId) || this.cleanRegionId(savedAddress?.regionId) || undefined

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
    const taskSizeIds: string[] = tasks.reduce((ids: string[], task: any) => {
      const itemSizeId = this.cleanRegionId(task?.item_size_id)
      if (itemSizeId && !ids.includes(itemSizeId)) ids.push(itemSizeId)
      return ids
    }, [])
    const sizeRows = taskSizeIds.length
      ? await this.prisma.errandItemSize.findMany({ where: { id: { in: taskSizeIds } } })
      : []
    const sizeFeeMap = new Map(sizeRows.map(row => [row.id, this.numberValue(row.price, 0)]))
    const taskSizeFee = tasks.reduce((sum: number, task: any) => {
      const itemSizeId = this.cleanRegionId(task?.item_size_id)
      return sum + this.numberValue(sizeFeeMap.get(itemSizeId), 0)
    }, 0)
    const basePrice = this.numberValue(
      dto?.price ?? extended.baseFees?.[miniServiceType] ?? config?.basePrice,
      0,
    )
    const tip = this.numberValue(dto?.tip_amount ?? dto?.tip ?? 0, 0)
    const couponDiscount = this.numberValue(dto?.coupon_discount ?? dto?.couponDiscount ?? 0, 0)
    const orderPrice = Math.max(basePrice + taskSizeFee, 0)
    const payAmount = Math.max(orderPrice + tip - couponDiscount, 0)
    const imageUrls = tasks.flatMap((task: any) => Array.isArray(task?.image_urls) ? task.image_urls : [])

    const order = await this.prisma.errandOrder.create({
      data: {
        orderNo,
        userId,
        regionId,
        type,
        title: dto?.title || this.serviceTitle(type),
        description,
        pickupAddress,
        pickupContact: dto?.pickup_contact || firstTask.pickup_contact || null,
        pickupPhone: dto?.pickup_phone || firstTask.pickup_phone || null,
        deliverAddress,
        deliverContact: dto?.deliver_contact || savedAddress?.name || null,
        deliverPhone: dto?.deliver_phone || savedAddress?.phone || null,
        deliverLat: savedAddress?.latitude ?? dto?.deliver_lat ?? null,
        deliverLng: savedAddress?.longitude ?? dto?.deliver_lng ?? null,
        weight: dto?.weight ? this.numberValue(dto.weight) : null,
        distance: dto?.distance ? this.numberValue(dto.distance) : null,
        price: orderPrice,
        tip,
        couponDiscount,
        payAmount,
        images: imageUrls.length ? imageUrls : undefined,
        remark: JSON.stringify({
          source: 'mini_program',
          service_type: dto?.service_type,
          base_price: basePrice,
          item_size_fee: taskSizeFee,
          address_id: addressId || null,
          delivery_time: dto?.delivery_time || null,
          tasks,
        }),
      },
    });
    return { success: true, message: '下单成功', data: order };
  }

  async payOrder(userId: string, dto: any) {
    const { orderId, payChannel } = dto;
    const order = await this.prisma.errandOrder.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('订单不存在');
    if (order.userId !== userId) throw new BadRequestException('无权支付该订单');
    if (order.status !== 'pending_pay') throw new BadRequestException('订单状态不允许支付');
    const paid = await this.prisma.errandOrder.update({
      where: { id: orderId },
      data: { status: 'pending_accept', payChannel, payTime: new Date() },
    });
    this.notifyRegionNewOrder(paid);
    return paid;
  }

  async acceptOrder(orderId: string, userId: string) {
    // 条件更新保证并发抢单时只有一个骑手成功
    const result = await this.prisma.errandOrder.updateMany({
      where: { id: orderId, status: 'pending_accept' },
      data: { riderId: userId, status: 'accepted', acceptTime: new Date() },
    });
    if (result.count === 0) {
      const order = await this.prisma.errandOrder.findUnique({
        where: { id: orderId },
        select: { riderId: true, status: true },
      });
      if (!order) throw new NotFoundException('订单不存在');
      // 自己重复点击接单按幂等处理
      if (order.riderId === userId && order.status === 'accepted') {
        return this.prisma.errandOrder.findUnique({ where: { id: orderId } });
      }
      throw new BadRequestException('手慢了，订单已被接走或不可接单');
    }
    const accepted = await this.prisma.errandOrder.findUnique({ where: { id: orderId } });
    this.notifyUserOrderUpdate(accepted);
    return accepted;
  }

  async updateRiderStatus(orderId: string, userId: string, dto: any) {
    const status = String(dto?.status || '');
    // 目标状态 -> 允许的当前状态；同时记录对应时间戳
    const transitions: Record<string, { from: string[]; data: Record<string, any> }> = {
      in_progress: { from: ['accepted'], data: { status: 'in_progress', pickupTime: new Date() } },
      arrived: { from: ['in_progress'], data: { status: 'arrived', deliverTime: new Date() } },
      completed: { from: ['in_progress', 'arrived'], data: { status: 'completed', completeTime: new Date() } },
    };
    const transition = transitions[status];
    if (!transition) throw new BadRequestException('不支持的订单状态');
    const result = await this.prisma.errandOrder.updateMany({
      where: { id: orderId, riderId: userId, status: { in: transition.from } },
      data: transition.data,
    });
    if (result.count === 0) {
      const order = await this.prisma.errandOrder.findUnique({
        where: { id: orderId },
        select: { riderId: true, status: true },
      });
      if (!order) throw new NotFoundException('订单不存在');
      if (order.riderId !== userId) throw new BadRequestException('无权操作该订单');
      // 重复提交同一状态按幂等处理
      if (order.status === status) {
        return this.prisma.errandOrder.findUnique({ where: { id: orderId } });
      }
      throw new BadRequestException('订单当前状态不允许该操作');
    }
    const updated = await this.prisma.errandOrder.findUnique({ where: { id: orderId } });
    // 完成订单：配送费入账到骑手余额（条件更新保证只入账一次）
    if (status === 'completed' && updated) {
      await this.prisma.regionRider.update({
        where: { userId },
        data: {
          balance: { increment: updated.payAmount },
          totalOrders: { increment: 1 },
          todayOrders: { increment: 1 },
        },
      }).catch(() => undefined);
    }
    this.notifyUserOrderUpdate(updated);
    return updated;
  }

  /** 骑手端订单详情：本人订单（下单人/骑手）或待接单池内订单可查看 */
  async getOrderDetailForRider(orderId: string, userId: string) {
    const order = await this.prisma.errandOrder.findUnique({
      where: { id: orderId },
      include: { User: { select: { id: true, nickname: true, avatar: true } } },
    });
    if (!order) throw new NotFoundException('订单不存在');
    const isParty = order.userId === userId || order.riderId === userId;
    if (!isParty) {
      if (order.status !== 'pending_accept') throw new BadRequestException('无权查看该订单');
      const rider = await this.prisma.regionRider.findUnique({ where: { userId } });
      if (!rider || rider.verifyStatus !== 'approved') throw new BadRequestException('无权查看该订单');
    }
    return this.toRiderOrder(order, order.User);
  }

  async refundOrder(orderId: string, userId: string, dto: any) {
    return this.prisma.errandOrder.update({ where: { id: orderId }, data: { refundStatus: 'refunding' } });
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
    const tasks = rows.flatMap(row => {
      const remark = this.parseOrderRemark(row)
      return Array.isArray(remark.tasks) ? remark.tasks : []
    })
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
      const miniType = internalErrandTypeToMini(row.type)
      const details = (Array.isArray(remark.tasks) ? remark.tasks : []).map((task: any) => {
        const itemSize = itemSizeMap.get(this.cleanRegionId(task?.item_size_id))
        const pickupPoint = pickupPointMap.get(this.cleanRegionId(task?.pickup_point_id))
        return {
          ...task,
          item_size_name: itemSize?.name || '',
          item_size_fee: itemSize ? this.numberValue((itemSize as any).price, 0) : 0,
          pickup_point_name: pickupPoint?.name || '',
          pickup_point_address: pickupPoint?.address || '',
          image_urls: Array.isArray(task?.image_urls) ? task.image_urls : [],
        }
      })
      const riderUser = row.RegionRider?.User || row.rider?.User || null
      const user = row.User || row.user || null
      return {
        id: row.id,
        order_no: row.orderNo,
        orderNo: row.orderNo,
        service_type: miniType,
        type: row.type,
        status: miniErrandStatus(row.status),
        raw_status: row.status,
        title: row.title,
        description: row.description || '',
        total_amount: this.numberValue(row.payAmount, 0).toFixed(2),
        pay_amount: this.numberValue(row.payAmount, 0),
        price: this.numberValue(row.price, 0),
        tip: this.numberValue(row.tip, 0),
        delivery_time: remark.delivery_time || row.deliverTime || row.createdAt,
        delivery_address: row.deliverAddress,
        pickup_address: row.pickupAddress,
        details,
        images: row.images || [],
        user: user
          ? {
              id: user.id,
              nickname: user.nickname || '用户',
              avatar: user.avatar || '/static/logo.jpg',
            }
          : null,
        rider: row.RegionRider
          ? {
              id: row.RegionRider.id,
              user_id: row.RegionRider.userId,
              real_name: row.RegionRider.realName,
              phone: row.RegionRider.phone,
              avatar: riderUser?.avatar || '/static/logo.jpg',
              nickname: riderUser?.nickname || row.RegionRider.realName || '骑手',
            }
          : {
              avatar: '/static/logo.jpg',
              nickname: '待接单',
            },
        created_at: row.createdAt,
        updated_at: row.updatedAt,
      }
    })
  }

  async getUserOrders(userId: string, query: any) {
    const { page = 1, limit = 20, filter_type } = query;
    const regionId = this.cleanRegionId(query?.region_id ?? query?.regionId)
    const pageNo = Number(page) || 1
    const pageSize = Number(limit || query?.pageSize || 20) || 20
    const filterType = String(filter_type || '').trim()
    const where: any = {}
    if (regionId) where.regionId = regionId
    if (filterType === 'pending_orders') {
      where.status = 'pending_accept'
      where.riderId = null
    } else if (filterType === 'my_accepted_orders') {
      where.riderId = userId
    } else if (filterType === 'my_orders' || !filterType) {
      where.userId = userId
    } else {
      where.userId = userId
      const normalizedType = this.normalizeServiceType(filterType)
      if (normalizedType) where.type = normalizedType
    }
    const [rows, total, rider] = await Promise.all([
      this.prisma.errandOrder.findMany({
        where,
        skip: (pageNo - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          User: { select: { id: true, nickname: true, avatar: true, phone: true } },
          RegionRider: {
            include: {
              User: { select: { id: true, nickname: true, avatar: true } },
            },
          },
        },
      }),
      this.prisma.errandOrder.count({ where }),
      this.prisma.regionRider.findFirst({
        where: { userId, ...(regionId ? { regionId } : {}) },
        select: { id: true, verifyStatus: true, status: true },
      }),
    ])
    return {
      success: true,
      is_rider: !!rider && rider.verifyStatus === 'approved',
      orders: await this.formatMiniOrders(rows),
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
    return { success: true, orders: await this.formatMiniOrders(rows) };
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
    const order = await this.prisma.errandOrder.findUnique({ where: { id: order_id } });
    if (!order) throw new NotFoundException('订单不存在');
    if (order.userId !== userId) throw new NotFoundException('无权操作该订单');
    return this.prisma.errandOrder.update({
      where: { id: order_id },
      data: { status: 'completed', completeTime: new Date() },
    });
  }

  async getDeliveryOrdersList(userId: string, query: any) {
    const { status, page = 1, pageSize = 10 } = query || {};
    const take = Math.min(Number(pageSize) || 10, 50);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

    let where: any;
    if (status === 'pending_accept' || status === 'awaiting_delivery') {
      // 待接单池：本区域已支付待接的订单
      const rider = await this.prisma.regionRider.findUnique({ where: { userId } });
      if (!rider || rider.verifyStatus !== 'approved' || !rider.regionId) {
        return { orders: [], total: 0, page: Number(page), pageSize: take };
      }
      where = { status: 'pending_accept', regionId: rider.regionId };
    } else if (status === 'active' || status === 'in_progress_all') {
      where = { riderId: userId, status: { in: ['accepted', 'in_progress', 'arrived'] } };
    } else if (status) {
      where = { riderId: userId, status };
    } else {
      where = { riderId: userId };
    }

    const [rows, total] = await Promise.all([
      this.prisma.errandOrder.findMany({
        where,
        include: { User: { select: { id: true, nickname: true, avatar: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.errandOrder.count({ where }),
    ]);
    return {
      orders: rows.map((row) => this.toRiderOrder(row, row.User)),
      total,
      page: Number(page),
      pageSize: take,
    };
  }

  async updateDeliveryOrder(orderId: string, userId: string, dto: any) {
    return this.prisma.errandOrder.update({ where: { id: orderId }, data: dto });
  }

  async returnToPool(orderId: string, userId: string, dto: any) {
    // 只有当前接单骑手能把自己的订单退回大厅，且只允许未完成的订单
    const result = await this.prisma.errandOrder.updateMany({
      where: { id: orderId, riderId: userId, status: { in: ['accepted', 'in_progress'] } },
      data: { riderId: null, status: 'pending_accept', acceptTime: null, pickupTime: null },
    });
    if (result.count === 0) throw new BadRequestException('订单不存在或当前状态不允许退回');
    const returned = await this.prisma.errandOrder.findUnique({ where: { id: orderId } });
    this.notifyRegionNewOrder(returned);
    this.notifyUserOrderUpdate(returned);
    return returned;
  }

  async getRiderInfo(userId: string) {
    const rider = await this.prisma.regionRider.findUnique({ where: { userId } });
    if (!rider) return null;
    let regionName = '';
    if (rider.regionId) {
      const region = await this.prisma.region.findUnique({
        where: { id: rider.regionId },
        select: { name: true },
      });
      regionName = region?.name || '';
    }
    return {
      ...rider,
      region_name: regionName,
      real_name: rider.realName,
      rider_bio: rider.riderBio || '',
      rider_type: rider.riderType,
      is_official: rider.riderType === 'official',
      region_id: rider.regionId,
    };
  }

  async updateRiderInfo(userId: string, dto: any) {
    // 只允许骑手改自己的基础资料和接单状态，防止任意字段写入（如余额）
    const data: any = {};
    if (dto?.real_name !== undefined || dto?.realName !== undefined) {
      data.realName = String(dto.real_name ?? dto.realName ?? '').trim().slice(0, 32);
    }
    if (dto?.phone !== undefined) {
      data.phone = String(dto.phone || '').trim().slice(0, 20);
    }
    if (dto?.rider_bio !== undefined || dto?.riderBio !== undefined) {
      data.riderBio = String(dto.rider_bio ?? dto.riderBio ?? '').slice(0, 200);
    }
    if (dto?.status !== undefined) {
      const status = String(dto.status);
      if (!['online', 'offline', 'busy'].includes(status)) {
        throw new BadRequestException('不支持的接单状态');
      }
      data.status = status;
    }
    if (!Object.keys(data).length) return this.getRiderInfo(userId);
    await this.prisma.regionRider.update({ where: { userId }, data });
    return this.getRiderInfo(userId);
  }

  async getOrderStats(userId: string) {
    const startOfDay = new Date(new Date().setHours(0, 0, 0, 0));
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const [total, today, month, todayIncome, monthIncome] = await Promise.all([
      this.prisma.errandOrder.count({ where: { riderId: userId, status: 'completed' } }),
      this.prisma.errandOrder.count({ where: { riderId: userId, status: 'completed', completeTime: { gte: startOfDay } } }),
      this.prisma.errandOrder.count({ where: { riderId: userId, status: 'completed', completeTime: { gte: startOfMonth } } }),
      this.prisma.errandOrder.aggregate({
        where: { riderId: userId, status: 'completed', completeTime: { gte: startOfDay } },
        _sum: { payAmount: true },
      }),
      this.prisma.errandOrder.aggregate({
        where: { riderId: userId, status: 'completed', completeTime: { gte: startOfMonth } },
        _sum: { payAmount: true },
      }),
    ]);
    return {
      total,
      today,
      month,
      today_orders: today,
      month_orders: month,
      today_income: Number(todayIncome._sum.payAmount || 0),
      month_income: Number(monthIncome._sum.payAmount || 0),
    };
  }

  async applyRider(userId: string, dto: any) {
    return this.prisma.regionRider.create({ data: { userId, regionId: dto.region_id, realName: dto.real_name, idCard: dto.id_card, phone: dto.phone } });
  }

  async updateLocation(userId: string, dto: any) {
    return this.prisma.regionRider.update({ where: { userId }, data: { lat: dto.lat, lng: dto.lng, locationUpdatedAt: new Date() } });
  }

  async getRiderLocation(riderId: string) {
    return this.prisma.regionRider.findUnique({ where: { id: riderId }, select: { lat: true, lng: true, locationUpdatedAt: true } });
  }

  async requestTransfer(orderId: string, userId: string, dto: any) {
    return this.prisma.transferRequest.create({ data: { orderId, fromRiderId: userId, toRiderId: dto.target_rider_id } });
  }

  async getTransferRequests(userId: string) {
    return this.prisma.transferRequest.findMany({ where: { toRiderId: userId, status: 'pending' } });
  }

  async respondToTransfer(transferId: string, userId: string, dto: any) {
    return this.prisma.transferRequest.update({ where: { id: transferId }, data: { status: dto.action } });
  }

  async getRegionRiders() {
    return this.prisma.regionRider.findMany({ where: { status: 'online' } });
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
    const { scalar, extended } = splitErrandConfigPayload(dto)
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
    if (keyword) where.name = { contains: String(keyword).trim(), mode: 'insensitive' };
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
    return this.prisma.errandItemSize.create({
      data: {
        ...dto,
        applyTo: this.normalizeApplyTo(dto.applyTo) || 'all',
        weightMin: dto.weightMin === '' ? null : dto.weightMin,
        weightMax: dto.weightMax === '' ? null : dto.weightMax,
        price: this.numberValue(dto.price, 0),
        sortOrder: Number(dto.sortOrder || 0),
      },
    });
  }

  async updateItemSize(id: string, dto: any) {
    const data: any = { ...dto };
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
        { name: { contains: String(keyword).trim(), mode: 'insensitive' } },
        { address: { contains: String(keyword).trim(), mode: 'insensitive' } },
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
    return this.prisma.errandPickupPoint.create({
      data: {
        ...dto,
        type: this.normalizePickupPointType(dto.type) || 'pickup',
        latitude: dto.latitude === '' ? null : dto.latitude,
        longitude: dto.longitude === '' ? null : dto.longitude,
        isOpen: dto.isOpen ?? true,
      },
    });
  }

  async updatePickupPoint(id: string, dto: any) {
    const data: any = { ...dto };
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
      this.prisma.errandOrder.count({ where: { ...where, status: { in: ['refunding', 'refunded'] } } }),
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
