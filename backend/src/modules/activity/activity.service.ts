import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { PaymentService } from '../payment/payment.service';
import { MembershipService } from '../membership/membership.service';
import { UserAccessPolicyService } from '../../common/services/user-access-policy.service';

@Injectable()
export class ActivityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentService: PaymentService,
    private readonly membershipService: MembershipService,
    private readonly userAccess: UserAccessPolicyService,
  ) {}

  private toInt(value: any, fallback: number, min = 1, max = 100) {
    const next = Number.parseInt(String(value ?? ''), 10);
    if (!Number.isFinite(next)) return fallback;
    return Math.min(max, Math.max(min, next));
  }

  private toMoney(value: any) {
    const next = Number(value || 0);
    return Number.isFinite(next) ? next : 0;
  }

  private subsidyNo() {
    return `SUB${Date.now()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  }

  private statusText(status: string, startAt?: Date | string, endAt?: Date | string) {
    const now = Date.now();
    const start = startAt ? new Date(startAt).getTime() : 0;
    const end = endAt ? new Date(endAt).getTime() : 0;
    if (status === 'cancelled') return '已取消';
    if (status === 'ended' || (end && now > end)) return '已结束';
    if (status === 'signup') return '报名中';
    if (status === 'ongoing' || (start && end && now >= start && now <= end)) return '进行中';
    return '未开始';
  }

  private formatActivityTime(activity: any) {
    return {
      start: activity.startAt ? new Date(activity.startAt).toISOString() : '',
      end: activity.endAt ? new Date(activity.endAt).toISOString() : '',
    };
  }

  private formatGender(value: any) {
    if (value === 1 || value === '1' || value === 'MALE' || value === 'male') return 1;
    if (value === 2 || value === '2' || value === 'FEMALE' || value === 'female') return 2;
    return 0;
  }

  private formatPackage(pkg: any, orders: any[] = []) {
    const paidOrders = orders.filter((order) => order.packageId === pkg.id && order.payStatus === 'paid');
    const pendingOrder = orders.find((order) => order.packageId === pkg.id && order.payStatus !== 'paid' && order.orderStatus !== 'cancelled');
    const availableTickets = Number(pkg.availableTickets ?? pkg.stock ?? 0);
    const now = Date.now();
    const saleEnd = pkg.saleEndAt ? new Date(pkg.saleEndAt).getTime() : 0;
    const canPurchase = pkg.isActive !== false && availableTickets > 0 && (!saleEnd || now <= saleEnd);

    return {
      ...pkg,
      price: this.toMoney(pkg.price),
      originalPrice: this.toMoney(pkg.originalPrice),
      availableTickets,
      limitPerUser: pkg.limitPerUser || 99,
      package_name: pkg.name,
      current_price: this.toMoney(pkg.price),
      original_price: this.toMoney(pkg.originalPrice),
      available_tickets: availableTickets,
      package_deadline: pkg.saleEndAt || pkg.activity?.signEndAt || pkg.activity?.endAt || null,
      gender_limit: pkg.genderLimit || '0',
      max_tickets_per_order: pkg.limitPerUser || 99,
      can_purchase: canPurchase,
      user_bought: paidOrders.length > 0,
      user_bought_count: paidOrders.reduce((total, order) => total + Number(order.quantity || 0), 0),
      user_pending_order: !!pendingOrder,
      user_pending_order_number: pendingOrder?.orderNo || null,
    };
  }

  private formatActivity(activity: any, options: { orders?: any[]; includePackages?: boolean } = {}) {
    const cover = activity.cover || '/static/logo.jpg';
    const packages = options.includePackages
      ? (activity.packages || []).map((pkg: any) => this.formatPackage({ ...pkg, activity }, options.orders || []))
      : [];
    const statusText = this.statusText(activity.status, activity.startAt, activity.endAt);
    const joinCount = Number(activity.joinCount || activity._count?.joins || 0);
    const maxPeople = Number(activity.maxPeople || 0);
    const availableParticipants = maxPeople > 0 ? Math.max(maxPeople - joinCount, 0) : 9999;

    return {
      ...activity,
      cover,
      fee: this.toMoney(activity.fee),
      joinCount,
      packages,
      title: activity.title,
      activity_title: activity.title,
      activity_description: activity.description || '',
      activity_image: cover ? [cover] : [],
      activity_location: activity.location || '',
      activity_location_latitude: activity.lat || 0,
      activity_location_longitude: activity.lng || 0,
      activity_time: this.formatActivityTime(activity),
      activity_status: activity.status,
      is_member_only: activity.visibility === 'member_only',
      member_only: activity.visibility === 'member_only',
      status_text: statusText,
      available_participants: availableParticipants,
      participant_count: joinCount,
      recent_participants: (activity.joins || []).slice(0, 5).map((join: any) => ({
        id: join.user?.id,
        nickname: join.user?.nickname || '用户',
        avatar: join.user?.avatar || '/static/logo.jpg',
      })),
      club_id: activity.clubId || null,
      club_name: activity.club?.name || activity.organizer || '',
      club_logo: activity.club?.logo || '/static/logo.jpg',
      club_location: activity.location || '',
      publisher_name: activity.organizer || activity.club?.name || '平台活动',
      publisher_avatar: activity.club?.logo || '/static/logo.jpg',
    };
  }

  async getActivities(query: any) {
    const page = this.toInt(query.page, 1);
    const size = this.toInt(query.size || query.limit || query.pageSize, 10, 1, 50);
    const { region_id, regionId, club_id, clubId, status } = query;
    const where: any = {};
    const queryRegionId = region_id || regionId;
    if (queryRegionId) where.OR = [{ regionId: queryRegionId }, { regionId: null }];
    if (club_id || clubId) where.clubId = club_id || clubId;
    if (status) where.status = status;
    if (!status) where.status = { not: 'cancelled' };

    const [list, total] = await Promise.all([
      this.prisma.activity.findMany({
        where,
        skip: (page - 1) * size,
        take: size,
        orderBy: [{ sortOrder: 'asc' }, { startAt: 'asc' }],
        include: {
          club: { select: { id: true, name: true, logo: true } },
          packages: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
          joins: {
            where: { status: 'joined' },
            take: 5,
            orderBy: { createdAt: 'desc' },
            include: { user: { select: { id: true, nickname: true, avatar: true } } },
          },
          _count: { select: { joins: true, orders: true } },
        },
      }),
      this.prisma.activity.count({ where }),
    ]);

    const activities = list.map((item) => this.formatActivity(item, { includePackages: true }));
    return { activities, list: activities, total, page, size, pageSize: size };
  }

  async getActivityDetail(activityId: string, userId?: string) {
    const [activity, orders] = await Promise.all([
      this.prisma.activity.findUnique({
        where: { id: activityId },
        include: {
          club: { select: { id: true, name: true, logo: true } },
          packages: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
          joins: {
            where: { status: 'joined' },
            take: 5,
            orderBy: { createdAt: 'desc' },
            include: { user: { select: { id: true, nickname: true, avatar: true } } },
          },
          _count: { select: { joins: true, orders: true } },
        },
      }),
      userId
        ? this.prisma.activityOrder.findMany({ where: { userId, activityId } })
        : Promise.resolve([] as any[]),
    ]);
    if (!activity) throw new NotFoundException('活动不存在');
    const userOrders = orders as any[];
    const formatted = this.formatActivity(activity, { orders: userOrders, includePackages: true });
    return {
      ...formatted,
      is_join: userOrders.some((order: any) => order.payStatus === 'paid' || order.orderStatus === 'joined'),
      user_favorited: false,
    };
  }

  async getParticipants(activityId: string, query: any) {
    const page = this.toInt(query.page, 1);
    const size = this.toInt(query.size || query.limit || query.pageSize, 20, 1, 50);
    const where = { activityId, status: 'joined' };
    const [list, total] = await Promise.all([
      this.prisma.activityJoin.findMany({
        where,
        include: { user: { select: { id: true, nickname: true, avatar: true, profile: { select: { gender: true } } } } },
        skip: (page - 1) * size,
        take: size,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.activityJoin.count({ where }),
    ]);
    const participants = (list as any[]).map((join) => ({
      id: join.user.id,
      user_id: join.user.id,
      nickname: join.user.nickname || '用户',
      avatar: join.user.avatar || '/static/logo.jpg',
      gender: this.formatGender(join.user.profile?.gender),
      first_join_time: join.createdAt,
    }));
    return {
      participants,
      list: participants,
      pagination: { current: page, size, total },
      total,
      page,
      size,
    };
  }

  async createOrderWithPayment(userId: string, dto: any) {
    const activityId = dto.activity_id || dto.activityId;
    const packageId = dto.package_id || dto.packageId;
    const quantity = this.toInt(dto.purchase_quantity || dto.quantity, 1, 1, 99);
    if (!activityId) throw new BadRequestException('缺少活动ID');

    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, openid: true } });
    if (!user) throw new BadRequestException('用户不存在');

    const activity = await this.prisma.activity.findUnique({
      where: { id: activityId },
      include: { packages: { where: packageId ? { id: packageId } : { isActive: true }, orderBy: { sortOrder: 'asc' } } },
    });
    if (!activity) throw new NotFoundException('活动不存在');
    await this.userAccess.assertStudentProtectedAction(userId, activity.regionId, '报名活动');
    if (activity.status === 'cancelled' || activity.status === 'ended') throw new BadRequestException('活动已结束');
    if (activity.visibility === 'member_only' && !(await this.membershipService.hasBenefit(userId, 'member_only_activity').catch(() => false))) {
      throw new BadRequestException('该活动为会员专属活动，请先开通会员');
    }

    const pkg = activity.packages[0] || null;
    const originalAmount = pkg ? this.toMoney(pkg.price) * quantity : this.toMoney(activity.fee) * quantity;
    let amount = originalAmount;
    let memberBenefit: any = null;
    if (amount > 0) {
      memberBenefit = await this.resolveActivityMemberBenefit(userId, amount, quantity);
      amount = memberBenefit?.amount ?? amount;
    }
    if (pkg) {
      if (pkg.isActive === false) throw new BadRequestException('该票种已下架');
      if (Number(pkg.availableTickets ?? pkg.stock ?? 0) < quantity) throw new BadRequestException('余票不足');
      if (pkg.limitPerUser && quantity > pkg.limitPerUser) throw new BadRequestException(`单次最多购买${pkg.limitPerUser}张`);
    }

    const orderNo = `ACT${Date.now()}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
    const subsidyAmount = Math.max(originalAmount - amount, 0);
    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.activityOrder.create({
        data: {
          orderNo,
          userId,
          activityId,
          packageId: pkg?.id,
          quantity,
          amount,
          payStatus: amount > 0 ? 'unpaid' : 'paid',
          orderStatus: 'pending',
          payChannel: amount > 0 ? 'wx_pay' : 'free',
          payTime: amount > 0 ? undefined : new Date(),
        },
      });
      if (memberBenefit?.benefitKey) {
        await this.membershipService.consumeBenefitWithDb(userId, memberBenefit.benefitKey, {
          targetType: 'activity_order',
          targetId: created.id,
          quantity: memberBenefit.quantity || 1,
          amount: subsidyAmount,
          metadata: { activityId, packageId: pkg?.id || null, originalAmount, paidAmount: amount },
        }, tx);
        if (subsidyAmount > 0) {
          await tx.subsidyLedger.create({
            data: {
              subsidyNo: this.subsidyNo(),
              sourceType: 'membership',
              benefitKey: memberBenefit.benefitKey,
              orderType: 'activity_order',
              orderId: created.id,
              orderNo: created.orderNo,
              userId,
              payerType: 'platform',
              receiverType: 'platform',
              amount: subsidyAmount,
              status: 'pending',
              description: '会员活动报名/票价平台补贴',
              metadata: { activityId, packageId: pkg?.id || null, originalAmount, paidAmount: amount },
            },
          });
        }
      }
      return created;
    });

    if (amount <= 0) {
      await this.finishPaidActivityOrder(order.id);
      return {
        success: true,
        requires_payment: false,
        order_id: order.id,
        order_no: order.orderNo,
        message: '报名成功',
      };
    }

    if (!user.openid) throw new BadRequestException('用户未绑定微信，无法发起支付');
    let paymentParams: any;
    try {
      paymentParams = await this.paymentService.wxUnifiedOrder({
        bizType: 'activity_order',
        bizId: order.id,
        orderNo: order.orderNo,
        amount,
        description: activity.title || '活动报名',
        openid: user.openid,
        userId,
      });
    } catch (error) {
      await this.prisma.$transaction(async (tx) => {
        await this.membershipService.restoreBenefitUsagesForTarget('activity_order', order.id, tx);
        await tx.subsidyLedger.updateMany({
          where: { sourceType: 'membership', orderType: 'activity_order', orderId: order.id },
          data: { status: 'cancelled' },
        }).catch(() => undefined);
        await tx.activityOrder.update({
          where: { id: order.id },
          data: { orderStatus: 'cancelled', refundReason: '支付发起失败，系统取消' },
        }).catch(() => undefined);
      });
      throw error;
    }
    return {
      success: true,
      requires_payment: true,
      order_id: order.id,
      order_no: order.orderNo,
      member_benefit: memberBenefit,
      payment_params: paymentParams,
      paymentInfo: paymentParams,
    };
  }

  private async resolveActivityMemberBenefit(userId: string, amount: number, quantity: number) {
    const benefits = await this.membershipService.getUserBenefits(userId).catch(() => null);
    const grants = benefits?.list || [];
    const ticket = grants.find((item: any) => item.benefitKey === 'activity_ticket_coupon_monthly' && (item.unlimited || item.remainingQuota >= quantity));
    if (ticket && quantity <= 1) {
      return { benefitKey: 'activity_ticket_coupon_monthly', amount: 0, quantity: 1, label: '会员活动报名券' };
    }
    const discount = grants.find((item: any) => item.benefitKey === 'activity_ticket_discount' && item.discountRate);
    if (discount) {
      const rate = Math.max(0, Math.min(10, Number(discount.discountRate || 10)));
      return { benefitKey: 'activity_ticket_discount', amount: Math.round(amount * rate * 10) / 100, quantity: 1, label: `${rate}折会员票价` };
    }
    return null;
  }

  async finishPaidActivityOrder(orderId: string) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.activityOrder.findUnique({
        where: { id: orderId },
        include: { package: true, activity: true },
      });
      if (!order) throw new NotFoundException('订单不存在');
      if (order.orderStatus === 'paid' || order.orderStatus === 'joined') {
        return order;
      }

      await tx.activityOrder.update({
        where: { id: orderId },
        data: { payStatus: 'paid', orderStatus: 'paid', payTime: new Date(), payChannel: order.payChannel || 'wx_pay' },
      });
      await tx.activityJoin.upsert({
        where: { activityId_userId: { activityId: order.activityId, userId: order.userId } },
        create: { activityId: order.activityId, userId: order.userId, status: 'joined' },
        update: { status: 'joined' },
      });
      await tx.activity.update({
        where: { id: order.activityId },
        data: { joinCount: { increment: order.quantity } },
      });
      if (order.packageId) {
        await tx.activityPackage.update({
          where: { id: order.packageId },
          data: { availableTickets: { decrement: order.quantity } },
        });
      }
      const ticketCount = await tx.activityTicket.count({ where: { orderId: order.id } });
      if (ticketCount === 0) {
        await tx.activityTicket.createMany({
          data: Array.from({ length: order.quantity }).map((_, index) => ({
            orderId: order.id,
            packageId: order.packageId,
            activityId: order.activityId,
            userId: order.userId,
            ticketNumber: `${order.orderNo}-${String(index + 1).padStart(2, '0')}`,
            ticketStatus: 'valid',
          })),
        });
      }
      return order;
    });
  }

  async expirePendingPayment(orderId: string) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.activityOrder.findUnique({ where: { id: orderId } });
      if (!order || order.orderStatus !== 'pending' || order.payStatus === 'paid') return false;
      const claimed = await tx.activityOrder.updateMany({
        where: { id: orderId, orderStatus: 'pending', payStatus: { not: 'paid' } },
        data: { orderStatus: 'cancelled', refundReason: '支付超时自动取消' },
      });
      if (claimed.count !== 1) return false;
      await this.membershipService.restoreBenefitUsagesForTarget('activity_order', order.id, tx);
      await tx.subsidyLedger.updateMany({
        where: { sourceType: 'membership', orderType: 'activity_order', orderId: order.id },
        data: { status: 'cancelled' },
      }).catch(() => undefined);
      return true;
    });
  }

  async joinFreeActivity(userId: string, activityId: string) {
    const activity = await this.prisma.activity.findUnique({ where: { id: activityId } });
    if (!activity) throw new NotFoundException('活动不存在');
    await this.userAccess.assertStudentProtectedAction(userId, activity.regionId, '报名活动');
    if (activity.status === 'cancelled' || activity.status === 'ended') throw new BadRequestException('活动已结束');
    if (activity.visibility === 'member_only' && !(await this.membershipService.hasBenefit(userId, 'member_only_activity').catch(() => false))) {
      throw new BadRequestException('该活动为会员专属活动，请先开通会员');
    }
    const fee = this.toMoney(activity.fee);
    if (fee > 0) throw new BadRequestException('该活动需要购票参加');
    const existing = await this.prisma.activityJoin.findUnique({
      where: { activityId_userId: { activityId, userId } },
    });
    if (existing?.status === 'joined') return { success: true, message: '已报名', joined: true };
    await this.prisma.$transaction([
      this.prisma.activityJoin.upsert({
        where: { activityId_userId: { activityId, userId } },
        create: { activityId, userId, status: 'joined' },
        update: { status: 'joined' },
      }),
      this.prisma.activity.update({ where: { id: activityId }, data: { joinCount: { increment: existing ? 0 : 1 } } }),
    ]);
    return { success: true, message: '报名成功', joined: true };
  }

  async getMyOrders(userId: string, query: any) {
    const page = this.toInt(query.page, 1);
    const size = this.toInt(query.size || query.limit || query.pageSize, 10, 1, 50);
    const [list, total] = await Promise.all([
      this.prisma.activityOrder.findMany({
        where: { userId },
        include: {
          activity: true,
          package: true,
          tickets: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * size,
        take: size,
      }),
      this.prisma.activityOrder.count({ where: { userId } }),
    ]);
    return { list: list.map((order) => this.formatOrder(order)), total, page, size };
  }

  async getMyTickets(userId: string, query: any) {
    const page = this.toInt(query.page, 1);
    const size = this.toInt(query.size || query.limit || query.pageSize, 10, 1, 50);
    const [list, total] = await Promise.all([
      this.prisma.activityTicket.findMany({
        where: { userId },
        include: { order: { include: { activity: true, package: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * size,
        take: size,
      }),
      this.prisma.activityTicket.count({ where: { userId } }),
    ]);
    return {
      list: list.map((ticket) => ({
        ...ticket,
        activity: ticket.order?.activity ? this.formatActivity(ticket.order.activity) : null,
        package: ticket.order?.package || null,
      })),
      total,
      page,
      size,
    };
  }

  private formatOrder(order: any) {
    return {
      ...order,
      amount: this.toMoney(order.amount),
      activity: order.activity ? this.formatActivity(order.activity) : null,
      package: order.package ? this.formatPackage(order.package) : null,
      product_status: order.payStatus === 'paid' ? 2 : 0,
      img: order.activity?.cover || '/static/logo.jpg',
      name: order.activity?.title || '活动',
      status_str: order.payStatus === 'paid' ? '已报名' : '待支付',
    };
  }

  async getClubDetail(clubId: string) {
    const club = await this.prisma.activityClub.findUnique({ where: { id: clubId }, include: { members: { include: { user: { select: { id: true, nickname: true, avatar: true } } } } } });
    if (!club) throw new NotFoundException('社团不存在');
    return club;
  }

  async getClubMembers(clubId: string, query: any) {
    const { page = 1, size = 10 } = query;
    return this.prisma.activityClubMember.findMany({ where: { clubId }, include: { user: { select: { id: true, nickname: true, avatar: true } } }, skip: (page - 1) * size, take: Number(size) });
  }

  async getClubOrders(clubId: string, query: any) {
    const { page = 1, size = 10, status, user_id } = query;
    return this.prisma.activityOrder.findMany({ where: { activityId: clubId, ...(status && { status }), ...(user_id && { userId: user_id }) }, skip: (page - 1) * size, take: Number(size), orderBy: { createdAt: 'desc' } });
  }

}
