import { createHash } from 'crypto';
import { PUBLIC_ACTIVITY_STATUSES, lockActivity, lockActivityOrder, settleActivityPayment, settleActivityRefund } from './activity-settlement';
import { canStartWechatPayment } from '../../common/payment-client';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { isMiniappOpenid } from '../../common/wechat-identity';
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
    const saleStart=pkg.saleStartAt?new Date(pkg.saleStartAt).getTime():0;
    const activityEnd=pkg.activity?.endAt?new Date(pkg.activity.endAt).getTime():0;
    const signupStart=pkg.activity?.signStartAt?new Date(pkg.activity.signStartAt).getTime():0;
    const signupEnd=pkg.activity?.signEndAt?new Date(pkg.activity.signEndAt).getTime():0;
    const canPurchase=pkg.isActive!==false&&availableTickets>0&&(!saleStart||now>=saleStart)&&(!saleEnd||now<=saleEnd)&&(!activityEnd||now<activityEnd)&&(!signupStart||now>=signupStart)&&(!signupEnd||now<=signupEnd)&&(!pkg.activity||['upcoming','signup','ongoing'].includes(pkg.activity.status));

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
    const cover = activity.cover || '';
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

  async getActivities(query: any, userId?: string) {
    const page = this.toInt(query.page, 1);
    const size = this.toInt(query.size || query.limit || query.pageSize, 10, 1, 50);
    const { region_id, regionId, club_id, clubId, status } = query;
    const where: any = {};
    const queryRegionId = region_id || regionId;
    if (queryRegionId) where.OR = [{ regionId: queryRegionId }, { regionId: null }];
    if (club_id || clubId) where.clubId = club_id || clubId;
    where.status = { in: PUBLIC_ACTIVITY_STATUSES };
    if (status && PUBLIC_ACTIVITY_STATUSES.includes(status)) where.status = status;
    if (query.keyword) where.title = { contains: String(query.keyword).trim().slice(0,100) };
    if (query.my_participation === 'true' || query.my_participation === true) {
      if (!userId) throw new ForbiddenException('请先登录查看本人活动');
      where.joins = { some: { userId, status: 'joined' } };
    }

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
    if (!activity || !PUBLIC_ACTIVITY_STATUSES.includes(activity.status)) throw new NotFoundException('活动不存在');
    const userOrders = orders as any[];
    const formatted = this.formatActivity(activity, { orders: userOrders, includePackages: true });
    return {
      ...formatted,
      is_join: userOrders.some((order: any) => order.payStatus === 'paid' || order.orderStatus === 'joined'),
      can_checkin: activity.clubId && userId ? (await this.readableClub(activity.clubId,userId)).canManage : false,
    };
  }

  async getParticipants(activityId: string, query: any) {
    const page = this.toInt(query.page, 1);
    const size = this.toInt(query.size || query.limit || query.pageSize, 20, 1, 50);
    const activity = await this.prisma.activity.findUnique({where:{id:activityId}});
    if (!activity || !PUBLIC_ACTIVITY_STATUSES.includes(activity.status)) throw new NotFoundException('活动不存在');
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
    const activityId = String(dto.activity_id || dto.activityId || '').trim();
    const packageId = String(dto.package_id || dto.packageId || '').trim();
    const quantity = Number(dto.purchase_quantity ?? dto.quantity ?? 1);
    const requestKey = String(dto.request_key || '').trim();
    if (!activityId || !/^[a-zA-Z0-9_-]{16,100}$/.test(requestKey)) throw new BadRequestException('缺少有效活动编号或提交标识');
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) throw new BadRequestException('购票数量必须为 1–99 的整数');
    const orderNo = `ACT${createHash('sha256').update(`${userId}:${requestKey}`).digest('hex').slice(0, 36)}`;
    const activity = await this.prisma.activity.findUnique({ where: { id: activityId } });
    if (!activity) throw new NotFoundException('活动不存在');
    await this.userAccess.assertStudentProtectedAction(userId, activity.regionId, '报名活动');
    const member = activity.visibility !== 'member_only' || await this.membershipService.hasBenefit(userId, 'member_only_activity');
    const order = await this.prisma.$transaction(async tx => {
      await lockActivity(tx, activityId);
      const existing = await tx.activityOrder.findUnique({ where: { orderNo } });
      if (existing) {
        if (existing.activityId !== activityId || String(existing.packageId || '') !== packageId || existing.quantity !== quantity) throw new BadRequestException('同一提交标识不能用于另一份购票内容');
        return existing;
      }
      const current = await tx.activity.findUnique({ where: { id: activityId }, include: { packages: { orderBy: { sortOrder: 'asc' } } } });
      const now = new Date();
      if (!current || !['upcoming','signup','ongoing'].includes(current.status) || current.endAt <= now || (current.signStartAt && current.signStartAt > now) || (current.signEndAt && current.signEndAt < now)) throw new BadRequestException('活动不在可报名时段');
      if (!member) throw new BadRequestException('该活动仅限具有对应权益的会员报名');
      const pkg = packageId ? current.packages.find(p => p.id === packageId) : null;
      if (packageId && !pkg) throw new BadRequestException('票种不属于本活动');
      if (!packageId && current.packages.length) throw new BadRequestException('请明确选择活动票种');
      if (pkg && (!pkg.isActive || (pkg.saleStartAt && pkg.saleStartAt > now) || (pkg.saleEndAt && pkg.saleEndAt < now))) throw new BadRequestException('票种不在售卖时段');
      const user = await tx.user.findUnique({ where: { id: userId }, include: { profile: true } });
      if (!user || user.status !== 'ACTIVE') throw new BadRequestException('账号不可报名');
      if (pkg && ['1','2','MALE','FEMALE','male','female'].includes(String(pkg.genderLimit)) && this.formatGender(user.profile?.gender) !== this.formatGender(pkg.genderLimit)) throw new BadRequestException('本人资料不符合该票种性别条件');
      const pending = await tx.activityOrder.aggregate({ where: { activityId, orderStatus: 'pending' }, _sum: { quantity: true } });
      if (current.maxPeople && current.joinCount + Number(pending._sum.quantity || 0) + quantity > current.maxPeople) throw new BadRequestException('活动剩余名额不足');
      if (pkg) {
        const reserved = await tx.activityOrder.aggregate({ where: { activityId, packageId, orderStatus: 'pending' }, _sum: { quantity: true } });
        if (pkg.availableTickets - Number(reserved._sum.quantity || 0) < quantity) throw new BadRequestException('票种剩余数量不足');
        const owned = await tx.activityOrder.aggregate({ where: { userId, activityId, packageId, orderStatus: { in: ['pending','paid','joined','completed'] } }, _sum: { quantity: true } });
        if (pkg.limitPerUser && Number(owned._sum.quantity || 0) + quantity > pkg.limitPerUser) throw new BadRequestException('已达到本票种累计限购数量');
      }
      const price = Number(pkg ? pkg.price : current.fee || 0);
      if (!Number.isFinite(price) || price < 0) throw new BadRequestException('活动价格配置不合法');
      const originalAmount = Math.round(price * 100) * quantity / 100;
      const benefit = originalAmount > 0 ? await this.resolveActivityMemberBenefit(userId, originalAmount, quantity) : null;
      const amount = benefit?.amount ?? originalAmount, subsidyAmount = Math.max(0, originalAmount - amount);
      if (amount > 0 && !canStartWechatPayment(user.openid)) throw new BadRequestException('当前账号或客户端无法发起微信支付');
      const created = await tx.activityOrder.create({ data: { orderNo, userId, activityId, packageId: pkg?.id || null, quantity, amount, payStatus: 'unpaid', orderStatus: 'pending', payChannel: amount > 0 ? 'wx_pay' : 'free' } });
      if (benefit?.benefitKey) {
        await this.membershipService.consumeBenefitWithDb(userId, benefit.benefitKey, { targetType:'activity_order',targetId:created.id,quantity:benefit.quantity||1,amount:subsidyAmount,metadata:{activityId,packageId:pkg?.id||null,originalAmount,paidAmount:amount} },tx);
        if (subsidyAmount > 0) await tx.subsidyLedger.create({data:{subsidyNo:this.subsidyNo(),sourceType:'membership',benefitKey:benefit.benefitKey,orderType:'activity_order',orderId:created.id,orderNo:created.orderNo,userId,payerType:'platform',receiverType:'platform',amount:subsidyAmount,status:'pending',description:'会员活动票价补贴'}});
      }
      if (amount <= 0) await settleActivityPayment(tx, created.id, 0);
      return created;
    });
    try { return await this.continueOrderPayment(userId, order.id); }
    catch (error: any) {
      // No usable payment session was returned; release reservations. A late channel success is refunded by settlement.
      await this.cancelMyOrder(userId,order.id).catch(()=>undefined);
      return {success:true,requires_payment:false,order_id:order.id,order_no:order.orderNo,order:await this.getMyOrder(userId,order.id),payment_error:String(error?.message||'暂时无法发起支付，请在本人订单中继续')};
    }
  }

  async getMyOrder(userId: string, orderId: string) {
    const order = await this.prisma.activityOrder.findUnique({ where: { id: orderId }, include: { activity: true, package: true, tickets: true } });
    if (!order || order.userId !== userId) throw new NotFoundException('本人活动订单不存在');
    return this.formatOrder(order);
  }

  async continueOrderPayment(userId: string, orderId: string) {
    const order = await this.getMyOrder(userId, orderId);
    if (order.orderStatus !== 'pending' || order.payStatus === 'paid') return {success:true,requires_payment:false,order_id:order.id,order_no:order.orderNo,order};
    if (Number(order.amount) <= 0) throw new BadRequestException('免费订单确认中，请刷新');
    if (!['upcoming','signup','ongoing'].includes(order.activity?.status) || new Date(order.activity.endAt)<=new Date()) throw new BadRequestException('活动已结束或取消，不可继续付款');
    const user = await this.prisma.user.findUnique({where:{id:userId},select:{openid:true}});
    if (!user || !canStartWechatPayment(user.openid)) throw new BadRequestException('当前账号或客户端无法发起微信支付');
    const payment = await this.paymentService.wxUnifiedOrder({bizType:'activity_order',bizId:order.id,orderNo:order.orderNo,amount:Number(order.amount),description:order.activity?.title||'活动购票',openid:user.openid,userId});
    return {success:true,requires_payment:true,order_id:order.id,order_no:order.orderNo,order,payment_params:payment,paymentInfo:payment};
  }

  async cancelMyOrder(userId: string, orderId: string) {
    await this.getMyOrder(userId, orderId);
    await this.prisma.$transaction(async tx=>{
      const order=await lockActivityOrder(tx,orderId);
      if(order.userId!==userId)throw new NotFoundException('本人订单不存在');
      if(order.orderStatus==='cancelled')return;
      if(order.orderStatus!=='pending'||order.payStatus==='paid')throw new BadRequestException('仅未付款订单可以取消');
      await tx.activityOrder.update({where:{id:order.id},data:{orderStatus:'cancelled',refundReason:'用户取消未付款订单'}});
      await this.membershipService.restoreBenefitUsagesForTarget('activity_order',order.id,tx);
      await tx.subsidyLedger.updateMany({where:{orderType:'activity_order',orderId:order.id},data:{status:'cancelled'}});
    });
    return this.getMyOrder(userId,orderId);
  }

  async refundMyOrder(userId: string, orderId: string, dto: any) {
    const reason=String(dto?.reason||'').trim();
    if(!reason||reason.length>200)throw new BadRequestException('退款原因须为 1–200 字');
    await this.getMyOrder(userId,orderId);
    await this.prisma.$transaction(async tx=>{
      const row=await lockActivityOrder(tx,orderId);
      if(row.userId!==userId)throw new NotFoundException('本人订单不存在');
      if(row.refundStatus==='pending'||row.orderStatus==='pending_refund'||row.orderStatus==='refunded')return;
      if(row.orderStatus!=='paid'||row.payStatus!=='paid')throw new BadRequestException('当前订单不能申请退款');
      if(await tx.activityTicket.count({where:{orderId,ticketStatus:{not:'valid'}}}))throw new BadRequestException('票券已使用或失效，不能申请整单退款');
      await tx.activityOrder.update({where:{id:orderId},data:{refundStatus:'pending',refundReason:reason}});
      await tx.activityTicket.updateMany({where:{orderId,ticketStatus:'valid'},data:{ticketStatus:'refund_pending'}});
    });
    return this.getMyOrder(userId,orderId);
  }

  async checkInTicket(userId: string, activityId: string, code: string) {
    if(!code||code.length>100)throw new BadRequestException('请输入有效票券码');
    return this.prisma.$transaction(async tx=>{
      await lockActivity(tx,activityId);
      const activity=await tx.activity.findUnique({where:{id:activityId},include:{club:true}});
      if(!activity?.clubId||!activity.club)throw new BadRequestException('该活动未配置社团核销权限');
      const member=await tx.activityClubMember.findUnique({where:{clubId_userId:{clubId:activity.clubId,userId}}});
      if(activity.club.leaderId!==userId&&activity.club.adminUserId!==userId&&!['leader','admin'].includes(member?.role||''))throw new ForbiddenException('仅本社团负责人可以核销');
      if(!['signup','ongoing'].includes(activity.status)||activity.endAt<new Date())throw new BadRequestException('活动当前不可核销');
      const ticket=await tx.activityTicket.findFirst({where:{activityId,ticketNumber:code},include:{order:true}});
      if(!ticket||ticket.order.orderStatus!=='paid'||ticket.order.payStatus!=='paid')throw new BadRequestException('票券不存在或订单不可用');
      if(ticket.ticketStatus!=='valid')throw new BadRequestException('票券已核销或失效');
      const updated=await tx.activityTicket.updateMany({where:{id:ticket.id,ticketStatus:'valid'},data:{ticketStatus:'used',checkInTime:new Date(),checkedInBy:userId}});
      if(updated.count!==1)throw new BadRequestException('票券已由其他操作核销');
      return {success:true,ticket_id:ticket.id,ticket_status:'used'};
    });
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
    return this.prisma.$transaction(async tx => (await settleActivityPayment(tx, orderId)).order);
  }
  async expirePendingPayment(orderId: string) {
    const existing=await this.prisma.activityOrder.findUnique({where:{id:orderId}});
    if(!existing)return false;
    return this.prisma.$transaction(async tx=>{
      const order=await lockActivityOrder(tx,orderId);
      if(order.orderStatus!=='pending'||order.payStatus==='paid')return false;
      await tx.activityOrder.update({where:{id:orderId},data:{orderStatus:'cancelled',refundReason:'支付超时已确认关闭'}});
      await this.membershipService.restoreBenefitUsagesForTarget('activity_order',orderId,tx);
      await tx.subsidyLedger.updateMany({where:{orderType:'activity_order',orderId},data:{status:'cancelled'}});
      return true;
    });
  }
  async joinFreeActivity(userId: string, activityId: string) {
    const activity=await this.prisma.activity.findUnique({where:{id:activityId},include:{packages:true}});
    if(!activity||activity.packages.length||Number(activity.fee||0)>0)throw new BadRequestException('该活动须选择票种并通过购票流程报名');
    return this.createOrderWithPayment(userId,{activity_id:activityId,quantity:1,request_key:'free_'+createHash('sha256').update(activityId).digest('hex')});
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
      status_str: ({pending:'待支付',paid:'已报名',cancelled:'已取消',pending_refund:'退款处理中',refunded:'已退款'} as any)[order.orderStatus] || order.orderStatus,
      can_refund: order.orderStatus==='paid' && !['pending','processing','partial_refunded'].includes(order.refundStatus) && (order.tickets||[]).every((t:any)=>t.ticketStatus==='valid'),
    };
  }

  private async readableClub(clubId: string, userId?: string) {
    const club = await this.prisma.activityClub.findUnique({ where: { id: clubId } });
    if (!club) throw new NotFoundException('社团不存在');
    const member = userId ? await this.prisma.activityClubMember.findUnique({ where: { clubId_userId: { clubId, userId } } }) : null;
    const canManage = !!userId && (club.leaderId === userId || club.adminUserId === userId || ['leader', 'admin'].includes(member?.role || ''));
    if (club.status !== 'active' && !canManage) throw new NotFoundException('社团暂未开放');
    return { club, canManage, member };
  }

  async getClubDetail(clubId: string, userId?: string) {
    const { club, canManage, member } = await this.readableClub(clubId, userId);
    const [memberCount, activityCount] = await Promise.all([
      this.prisma.activityClubMember.count({ where: { clubId } }),
      this.prisma.activity.count({ where: { clubId, visibility: 'public', status: { in: ['upcoming', 'signup', 'ongoing', 'ended'] } } }),
    ]);
    return { ...club, canManage, is_admin: canManage, is_member: !!member, memberCount, activityCount };
  }

  async getClubMembers(clubId: string, query: any, userId?: string) {
    await this.readableClub(clubId, userId);
    const page = this.toInt(query.page, 1), size = this.toInt(query.size || query.limit, 20, 1, 50);
    const where = { clubId };
    const [list, total] = await Promise.all([
      this.prisma.activityClubMember.findMany({ where, include: { user: { select: { id: true, nickname: true, avatar: true } } }, skip: (page - 1) * size, take: size, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
      this.prisma.activityClubMember.count({ where }),
    ]);
    return { list, total, page, size };
  }

  async getClubOrders(clubId: string, query: any, userId: string) {
    const { canManage } = await this.readableClub(clubId, userId);
    if (!canManage) throw new ForbiddenException('仅社团负责人可查看报名订单');
    const page = this.toInt(query.page, 1), size = this.toInt(query.size || query.limit, 20, 1, 50);
    const where: any = { activity: { clubId } };
    if (query.pay_status && ['unpaid', 'paid', 'refunded'].includes(String(query.pay_status))) where.payStatus = String(query.pay_status);
    if (query.order_status && ['pending', 'confirmed', 'cancelled', 'completed', 'refunded'].includes(String(query.order_status))) where.orderStatus = String(query.order_status);
    const [rows, total] = await Promise.all([
      this.prisma.activityOrder.findMany({ where, include: { activity: true, package: true, user: { select: { id: true, nickname: true, avatar: true } } }, skip: (page - 1) * size, take: size, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }),
      this.prisma.activityOrder.count({ where }),
    ]);
    return { list: rows.map((row) => this.formatOrder(row)), total, page, size };
  }

}
