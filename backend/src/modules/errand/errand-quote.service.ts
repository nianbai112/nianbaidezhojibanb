import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import {
  errandExtendedConfigKey,
  normalizeErrandExtendedConfig,
} from './errand-config.util';
import {
  normalizeErrandOrderTakingPolicy,
  resolveErrandReceiverType,
} from './errand-order-taking-policy';

export type ErrandQuoteResult = {
  baseFee: number;
  sizeFee: number;
  distanceFee: number;
  weightFee: number;
  timeFee: number;
  riderSurcharge: number;
  tip: number;
  couponDiscount: number;
  memberDiscount: number;
  distanceMeters: number;
  payAmount: number;
  quotedAt: string;
  pricingSnapshot: Record<string, unknown>;
};

type Coordinate = { latitude: number; longitude: number };

@Injectable()
export class ErrandQuoteService {
  private readonly maxTaskCount = 10;

  constructor(private readonly prisma: PrismaService) {}

  async quote(userId: string, dto: Record<string, any>): Promise<ErrandQuoteResult> {
    const tasks = Array.isArray(dto?.tasks) ? dto.tasks : [];
    const serviceType = this.miniServiceType(dto?.service_type ?? dto?.type);
    const internalType = this.internalServiceType(serviceType);
    this.validateTasks(internalType, tasks);

    if (
      internalType === 'universal' &&
      tasks.some((task: any) => this.number(task?.budget ?? task?.budget_amount, 0) > 0)
    ) {
      throw new BadRequestException({
        code: 'ERRAND_ADVANCE_PAYMENT_DISABLED',
        message: '暂不支持接单者垫资',
      });
    }

    const addressId = this.cleanId(dto?.address_id ?? dto?.addressId);
    const savedAddress = addressId
      ? await this.prisma.address.findFirst({ where: { id: addressId, userId } })
      : null;
    if (addressId && !savedAddress) throw new BadRequestException('收货地址不存在');

    const regionId =
      this.cleanId(dto?.region_id ?? dto?.regionId) ||
      this.cleanId(savedAddress?.regionId);
    if (!regionId) throw new BadRequestException('region_id 必填');

    const region = await this.prisma.region.findUnique({
      where: { id: regionId },
      select: { id: true },
    });
    if (!region) throw new BadRequestException('区域不存在');

    const config = await this.prisma.errandConfig.findUnique({ where: { regionId } });
    if (config?.isOpen === false) throw new BadRequestException('当前区域暂未开放跑腿服务');

    const extendedRow = await this.prisma.config
      .findUnique({ where: { key: errandExtendedConfigKey(regionId) } })
      .catch(() => null);
    const extended = normalizeErrandExtendedConfig(
      extendedRow?.value,
      this.number(config?.basePrice, 0),
    );
    const switchKey = ['express_pickup', 'express_send'].includes(serviceType)
      ? 'express'
      : serviceType === 'food_delivery'
        ? 'food'
        : 'custom';
    if (extended.serviceSwitches?.[switchKey] === false) {
      throw new BadRequestException('当前跑腿类型暂未开放');
    }

    const tip = this.number(dto?.tip_amount ?? dto?.tip, 0);
    if (!Number.isFinite(tip) || tip < 0 || tip > 100) {
      throw new BadRequestException('小费金额无效');
    }

    const weight = this.optionalNumber(dto?.weight);
    if (weight !== null && weight < 0) throw new BadRequestException('重量无效');
    const maxWeight = this.number(config?.maxWeight, 20);
    if (weight !== null && maxWeight > 0 && weight > maxWeight) {
      throw new BadRequestException(`重量不能超过${maxWeight}kg`);
    }

    const sizeIds = this.uniqueIds(tasks.map((task: any) => task?.item_size_id ?? task?.itemSizeId));
    const sizeRows = sizeIds.length
      ? await this.prisma.errandItemSize.findMany({ where: { id: { in: sizeIds } } })
      : [];
    const sizeMap = new Map(sizeRows.map((row: any) => [String(row.id), row]));
    for (const sizeId of sizeIds) {
      const row: any = sizeMap.get(sizeId);
      if (!row) throw new BadRequestException('规格不存在或已删除');
      if (String(row.regionId) !== regionId) {
        throw new BadRequestException('规格不属于当前区域');
      }
      if (!this.sizeAppliesTo(row.applyTo, internalType)) {
        throw new BadRequestException('规格不适用于当前跑腿类型');
      }
    }
    const sizeFee = this.money(
      tasks.reduce((sum: number, task: any) => {
        const row: any = sizeMap.get(this.cleanId(task?.item_size_id ?? task?.itemSizeId));
        return sum + this.number(row?.price, 0);
      }, 0),
    );

    const pickupPointIds = this.uniqueIds(
      tasks.map((task: any) => task?.pickup_point_id ?? task?.pickupPointId),
    );
    const pickupRows = pickupPointIds.length
      ? await this.prisma.errandPickupPoint.findMany({ where: { id: { in: pickupPointIds } } })
      : [];
    const pickupMap = new Map(pickupRows.map((row: any) => [String(row.id), row]));
    for (const pointId of pickupPointIds) {
      const row: any = pickupMap.get(pointId);
      if (!row) throw new BadRequestException('取件点不存在或已删除');
      if (String(row.regionId) !== regionId) {
        throw new BadRequestException('取件点不属于当前区域');
      }
      if (row.isOpen === false) throw new BadRequestException('取件点已停用');
    }

    const routePoints: Coordinate[] = [];
    for (const task of tasks) {
      const pointId = this.cleanId(task?.pickup_point_id ?? task?.pickupPointId);
      if (!pointId) continue;
      const row: any = pickupMap.get(pointId);
      const point = this.coordinate(row?.latitude, row?.longitude, '取件点');
      if (!point) throw new BadRequestException('取件点未配置坐标');
      const previous = routePoints[routePoints.length - 1];
      if (!previous || previous.latitude !== point.latitude || previous.longitude !== point.longitude) {
        routePoints.push(point);
      }
    }
    if (!routePoints.length) {
      const pickup = this.coordinate(
        dto?.pickup_lat ?? dto?.pickupLat,
        dto?.pickup_lng ?? dto?.pickupLng,
        '取件地址',
      );
      if (pickup) routePoints.push(pickup);
    }

    const deliveryPoint = this.coordinate(
      savedAddress?.latitude ?? dto?.deliver_lat ?? dto?.deliverLat,
      savedAddress?.longitude ?? dto?.deliver_lng ?? dto?.deliverLng,
      '送达地址',
    );
    if (deliveryPoint) routePoints.push(deliveryPoint);

    const distanceRate = this.number(config?.distancePrice, 0);
    if (distanceRate > 0 && pickupPointIds.length && !deliveryPoint) {
      throw new BadRequestException('送达地址缺少坐标，无法计算配送距离');
    }
    const distanceMeters = Math.round(this.routeDistanceMeters(routePoints));
    const maxDistance = this.number(config?.maxDistance, 10);
    if (maxDistance > 0 && distanceMeters > maxDistance * 1000) {
      throw new BadRequestException(`配送距离不能超过${maxDistance}km`);
    }

    const baseFee = this.money(
      extended.baseFees?.[serviceType] ?? config?.basePrice ?? 0,
    );
    const distanceFee = this.money((distanceMeters / 1000) * distanceRate);
    const weightRate = this.number(config?.weightPrice, 0);
    const weightFee = this.money((weight ?? 0) * weightRate);
    const requestedTime = this.requestedTime(dto);
    const isScheduled = String(dto?.delivery_mode ?? dto?.deliveryMode ?? '') === 'scheduled';
    const isNight = requestedTime
      ? requestedTime.getHours() >= 22 || requestedTime.getHours() < 6
      : false;
    const timeFee = this.money(
      (isScheduled ? this.number(config?.timePrice, 0) : 0) +
      (isNight ? this.number(config?.nightPrice, 0) : 0),
    );
    const takingPolicy = normalizeErrandOrderTakingPolicy(
      extended.orderTakingPolicy || extended.order_taking_policy,
    );
    const receiverType = resolveErrandReceiverType(dto, takingPolicy);
    const riderSurcharge = this.money(
      receiverType === 'approved_rider'
        ? takingPolicy.approvedRiderSurchargeAmount
        : 0,
    );
    const safeTip = this.money(tip);
    const payAmount = this.money(
      baseFee + sizeFee + distanceFee + weightFee + timeFee + riderSurcharge + safeTip,
    );
    const quotedAt = new Date().toISOString();

    return {
      baseFee,
      sizeFee,
      distanceFee,
      weightFee,
      timeFee,
      riderSurcharge,
      tip: safeTip,
      couponDiscount: 0,
      memberDiscount: 0,
      distanceMeters,
      payAmount,
      quotedAt,
      pricingSnapshot: {
        version: 1,
        regionId,
        serviceType,
        receiverType,
        taskCount: tasks.length,
        sizeIds,
        pickupPointIds,
        weight,
        distanceMeters,
        rates: {
          baseFee,
          distancePerKm: distanceRate,
          weightPerKg: weightRate,
          scheduled: this.number(config?.timePrice, 0),
          night: this.number(config?.nightPrice, 0),
          approvedRiderSurcharge: this.number(takingPolicy.approvedRiderSurchargeAmount, 0),
        },
        components: {
          baseFee,
          sizeFee,
          distanceFee,
          weightFee,
          timeFee,
          riderSurcharge,
          tip: safeTip,
        },
        quotedAt,
      },
    };
  }

  private validateTasks(type: string, tasks: any[]) {
    if (tasks.length > this.maxTaskCount) {
      throw new BadRequestException(`一次最多提交${this.maxTaskCount}个任务`);
    }
    if (['pickup', 'meal'].includes(type) && tasks.length === 0) {
      throw new BadRequestException(type === 'pickup' ? '请至少添加1个取件任务' : '请至少添加1个取餐任务');
    }
    tasks.forEach((task, index) => {
      if (!task || typeof task !== 'object' || Array.isArray(task)) {
        throw new BadRequestException(`任务${index + 1}信息格式错误`);
      }
    });
  }

  private sizeAppliesTo(value: unknown, type: string) {
    const applyTo = this.internalServiceType(String(value || 'all'));
    return applyTo === 'all' || applyTo === type;
  }

  private miniServiceType(value: unknown) {
    const normalized = String(value || '').trim();
    const map: Record<string, string> = {
      pickup: 'express_pickup',
      deliver: 'express_send',
      meal: 'food_delivery',
      universal: 'custom_task',
    };
    return map[normalized] || normalized || 'custom_task';
  }

  private internalServiceType(value: unknown) {
    const normalized = String(value || '').trim();
    const map: Record<string, string> = {
      express_pickup: 'pickup',
      express_send: 'deliver',
      food_delivery: 'meal',
      custom_task: 'universal',
      express: 'pickup',
      food: 'meal',
      all: 'all',
    };
    return map[normalized] || normalized || 'universal';
  }

  private requestedTime(dto: Record<string, any>) {
    const value = dto?.delivery_time ?? dto?.deliveryTime;
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new BadRequestException('配送时间无效');
    return date;
  }

  private coordinate(latValue: unknown, lngValue: unknown, label: string): Coordinate | null {
    const absentLat = latValue === undefined || latValue === null || latValue === '';
    const absentLng = lngValue === undefined || lngValue === null || lngValue === '';
    if (absentLat && absentLng) return null;
    const latitude = Number(latValue);
    const longitude = Number(lngValue);
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      throw new BadRequestException(`${label}坐标无效`);
    }
    return { latitude, longitude };
  }

  private routeDistanceMeters(points: Coordinate[]) {
    let meters = 0;
    for (let index = 1; index < points.length; index += 1) {
      meters += this.haversineMeters(points[index - 1], points[index]);
    }
    return meters;
  }

  private haversineMeters(from: Coordinate, to: Coordinate) {
    const radians = (degrees: number) => degrees * Math.PI / 180;
    const lat1 = radians(from.latitude);
    const lat2 = radians(to.latitude);
    const deltaLat = radians(to.latitude - from.latitude);
    const deltaLng = radians(to.longitude - from.longitude);
    const a =
      Math.sin(deltaLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private uniqueIds(values: unknown[]) {
    return [...new Set(values.map(value => this.cleanId(value)).filter(Boolean))];
  }

  private cleanId(value: unknown) {
    if (value === undefined || value === null) return '';
    const text = String(value).trim();
    return ['NaN', 'null', 'undefined', '0'].includes(text) ? '' : text;
  }

  private optionalNumber(value: unknown) {
    if (value === undefined || value === null || value === '') return null;
    const number = Number(value);
    if (!Number.isFinite(number)) throw new BadRequestException('数值格式无效');
    return number;
  }

  private number(value: unknown, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  private money(value: unknown) {
    return Math.round(this.number(value, 0) * 100) / 100;
  }
}
