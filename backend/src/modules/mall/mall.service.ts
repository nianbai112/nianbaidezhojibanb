import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../../common/services/prisma.service";
import { RedisService } from "../../common/services/redis.service";
import { WalletService } from "../../common/services/wallet.service";
import { MembershipService } from "../membership/membership.service";
import { UserAccessPolicyService } from "../../common/services/user-access-policy.service";
import { PaymentService } from "../payment/payment.service";

@Injectable()
export class MallService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly membershipService: MembershipService,
    private readonly userAccess: UserAccessPolicyService,
    private readonly paymentService: PaymentService,
    private readonly walletService: WalletService,
  ) {}

  private async runWithLock<T>(key: string, message: string, fn: () => Promise<T>, ttlSeconds = 30): Promise<T> {
    const locked = await this.redis.getLock(key, ttlSeconds);
    if (!locked) throw new BadRequestException(message);
    try {
      return await fn();
    } finally {
      await this.redis.releaseLock(key).catch(() => undefined);
    }
  }

  private money(value: any) {
    const n = Number(value || 0);
    return Math.max(0, Math.round(n * 100) / 100);
  }

  private subsidyNo() {
    return `SUB${Date.now()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  }

  private dayStart() {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }

  private async resolveCouponCampaign(tx: any, couponId: string) {
    const config = await tx.config.findUnique({ where: { key: 'marketing_campaigns_config' } }).catch(() => null);
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

  private async assertCampaignRules(tx: any, campaign: any, userId: string, couponId: string, discountAmount: number) {
    if (!campaign || discountAmount <= 0) return;
    if (campaign.firstOrderOnly) {
      const orderCount = await tx.mallOrder.count({
        where: { userId, status: { not: 'cancelled' } },
      });
      if (orderCount > 0) throw new BadRequestException('该活动仅限首单使用');
    }
    if (campaign.newUserOnly) {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { createdAt: true } });
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
      tx.subsidyLedger.aggregate({ where: baseWhere, _sum: { amount: true } }),
      tx.subsidyLedger.aggregate({ where: { ...baseWhere, createdAt: { gte: this.dayStart() } }, _sum: { amount: true } }),
      tx.subsidyLedger.aggregate({ where: { ...baseWhere, userId }, _sum: { amount: true }, _count: true }),
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

  private async resolveUserCoupon(tx: any, userId: string, userCouponId: any, amount: number, merchant: any) {
    if (!userCouponId) return { discountAmount: 0, receive: null, coupon: null };
    const receive = await tx.couponReceive.findFirst({
      where: { id: String(userCouponId), userId },
      include: { coupon: true },
    });
    if (!receive) throw new BadRequestException('优惠券不存在');
    if (receive.status !== 'unused') throw new BadRequestException('优惠券已使用或已失效');
    const coupon = receive.coupon;
    if (!coupon || coupon.status !== 'active') throw new BadRequestException('优惠券已下架');
    const now = new Date();
    if (coupon.startAt && now < coupon.startAt) throw new BadRequestException('优惠券未到可用时间');
    if (coupon.endAt && now > coupon.endAt) throw new BadRequestException('优惠券已过期');
    const scope = String(coupon.businessScope || 'all').toLowerCase();
    if (!['all', 'mall'].includes(scope)) throw new BadRequestException('该优惠券不适用于商城订单');
    if (Number(coupon.minAmount || 0) > amount) throw new BadRequestException(`订单满 ¥${Number(coupon.minAmount).toFixed(2)} 才可使用该券`);
    if (coupon.regionId && String(coupon.regionId) !== String(merchant?.regionId || '')) {
      throw new BadRequestException('该优惠券不适用于当前区域');
    }
    if (coupon.merchantId) {
      throw new BadRequestException('该优惠券为外卖商家专属券，不适用于当前商城订单');
    }
    const discountAmount = this.couponDiscountAmount(coupon, amount);
    const campaign = await this.resolveCouponCampaign(tx, coupon.id);
    await this.assertCampaignRules(tx, campaign, userId, coupon.id, discountAmount);
    return {
      discountAmount,
      receive,
      coupon,
      campaign,
    };
  }

  private async resolveMallMemberPrice(userId: string, amount: number) {
    const grant = await this.membershipService.getActiveBenefitGrant(userId, "mall_member_price").catch(() => null);
    const rate = Number(grant?.discountRate || 0);
    if (!grant || !rate || rate >= 10 || amount <= 0) {
      return { discountAmount: 0, rate: null, grant: null };
    }
    const discountAmount = this.money(amount - amount * (rate / 10));
    return { discountAmount, rate, grant };
  }

  async getBanners(query: any) {
    return this.prisma.mallBanner.findMany({
      where: { isShow: true },
      orderBy: { sortOrder: "asc" },
    });
  }

  async getCategories(query: any) {
    return this.prisma.mallCategory.findMany({
      where: { isShow: true, parentId: null },
      orderBy: { sortOrder: "asc" },
    });
  }

  async getCategoryDetail(id: string) {
    const category = await this.prisma.mallCategory.findUnique({
      where: { id },
    });
    if (!category) throw new NotFoundException("分类不存在");
    return category;
  }

  async getProducts(query: any) {
    const { page = 1, limit = 20, category_id, keyword, merchant_id, sort_by } = query;
    const where: any = { status: "on_sale" };
    if (category_id) where.categoryId = category_id;
    if (merchant_id) where.merchantId = merchant_id;
    if (keyword) where.name = { contains: keyword };

    const orderBy: any = { createdAt: "desc" };
    if (sort_by === "sales") orderBy.saleCount = "desc";
    if (sort_by === "price_asc") orderBy.price = "asc";
    if (sort_by === "price_desc") orderBy.price = "desc";

    const [list, total] = await Promise.all([
      this.prisma.mallProduct.findMany({
        where,
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        orderBy,
        include: { skus: true },
      }),
      this.prisma.mallProduct.count({ where }),
    ]);

    return { list, total, page: Number(page), pageSize: Number(limit) };
  }

  async getProductDetail(id: string) {
    const product = await this.prisma.mallProduct.findUnique({
      where: { id },
      include: { skus: true, merchant: true },
    });
    if (!product) throw new NotFoundException("商品不存在");
    return product;
  }

  async getMerchants(query: any) {
    const { page = 1, limit = 20, region_id, status, my_only, userId } = query;
    const where: any = {};
    if (status) where.status = status;
    else where.status = "approved";
    if (region_id) where.regionId = region_id;
    if (my_only && userId) where.userId = userId;

    const [list, total] = await Promise.all([
      this.prisma.mallMerchant.findMany({
        where,
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.mallMerchant.count({ where }),
    ]);

    return { list, total, page: Number(page), pageSize: Number(limit) };
  }

  async getMerchantDetail(id: string) {
    const merchant = await this.prisma.mallMerchant.findUnique({
      where: { id },
    });
    if (!merchant) throw new NotFoundException("商家不存在");
    return merchant;
  }

  async addToCart(userId: string, dto: any) {
    const { product_id, sku_id, quantity = 1 } = dto;
    if (!product_id) throw new BadRequestException("product_id 必填");

    // 校验商品存在性
    const product = await this.prisma.mallProduct.findUnique({
      where: { id: product_id },
    });
    if (!product) throw new NotFoundException("商品不存在");
    if (product.status !== "on_sale") throw new BadRequestException("商品已下架");

    // 校验库存
    if (product.stock < quantity) {
      throw new BadRequestException("库存不足");
    }

    return this.prisma.mallCart.upsert({
      where: {
        userId_productId_skuId: {
          userId,
          productId: product_id,
          skuId: sku_id || null,
        },
      },
      create: {
        userId,
        productId: product_id,
        skuId: sku_id,
        quantity: quantity,
      },
      update: { quantity: { increment: quantity } },
    });
  }

  async getCart(userId: string) {
    const items = await this.prisma.mallCart.findMany({
      where: { userId },
      include: { product: { include: { skus: true } } },
      orderBy: { createdAt: "desc" },
    });

    // 按商户分组
    const merchantMap = new Map();
    for (const item of items) {
      const merchantId = item.product.merchantId;
      if (!merchantMap.has(merchantId)) {
        merchantMap.set(merchantId, {
          merchant_id: merchantId,
          merchant_name: "",
          checked: false,
          items: [],
        });
      }
      const sku = item.product.skus.find((s) => s.id === item.skuId);
      merchantMap.get(merchantId).items.push({
        cart_id: item.id,
        product_id: item.productId,
        product_name: item.product.name,
        product_image: item.product.mainImage || (Array.isArray(item.product.images) ? item.product.images[0] : ""),
        sku_id: item.skuId,
        sku_name: sku?.skuName || "",
        price: sku?.price || item.product.price,
        quantity: item.quantity,
        stock: sku?.stock || item.product.stock,
        is_checked: item.selected ? 1 : 0,
      });
    }

    return { merchants: Array.from(merchantMap.values()) };
  }

  async removeCartItem(id: string, userId: string) {
    await this.prisma.mallCart.deleteMany({ where: { id, userId } });
    return { success: true };
  }

  async submitOrder(userId: string, dto: any) {
    const productIds = Array.isArray(dto?.items)
      ? dto.items.map((item: any) => String(item?.product_id || '')).filter(Boolean).sort()
      : [];
    return this.runWithLock(
      `mall:submit:${dto?.merchant_id || 'unknown'}:${productIds.join(',') || userId}`,
      '订单正在创建中，请勿重复提交',
      () => this.submitOrderUnlocked(userId, dto),
      45,
    );
  }

  private async submitOrderUnlocked(userId: string, dto: any) {
    const {
      merchant_id,
      items = [],
      address_id,
      receiver_full_address,
      receiver_name,
      receiver_phone,
      user_coupon_id,
      buyer_message,
      delivery_type = "express",
    } = dto;

    if (!merchant_id) throw new BadRequestException("merchant_id 必填");
    if (!items.length) throw new BadRequestException("订单商品不能为空");
    if (!receiver_name) throw new BadRequestException("收货人姓名必填");
    if (!receiver_phone) throw new BadRequestException("收货人电话必填");
    if (!receiver_full_address) throw new BadRequestException("收货地址必填");

    return this.prisma.$transaction(async (tx) => {
      const merchant = await tx.mallMerchant.findUnique({
        where: { id: String(merchant_id) },
      });
      if (!merchant) throw new NotFoundException('商户不存在');
      await this.userAccess.assertStudentProtectedAction(userId, merchant.regionId, '提交商城订单');

      // 校验商品库存并扣减
      let productAmount = 0;
      const orderItems = [];

      for (const item of items) {
        const product = await tx.mallProduct.findUnique({
          where: { id: item.product_id },
        });
        if (!product) throw new NotFoundException(`商品 ${item.product_name} 不存在`);
        if (product.status !== "on_sale") throw new BadRequestException(`商品 ${product.name} 已下架`);
        if (product.stock < item.quantity) throw new BadRequestException(`商品 ${product.name} 库存不足`);

        // 扣减库存
        await tx.mallProduct.update({
          where: { id: item.product_id },
          data: {
            stock: { decrement: item.quantity },
            saleCount: { increment: item.quantity },
          },
        });

        productAmount += Number(item.price) * item.quantity;
        orderItems.push({
          productId: item.product_id,
          productName: item.product_name,
          productImage: item.product_image,
          skuId: item.sku_id,
          skuName: item.sku_name,
          price: item.price,
          quantity: item.quantity,
        });
      }

      const memberPrice = await this.resolveMallMemberPrice(userId, productAmount);
      const couponBenefit = await this.resolveUserCoupon(tx, userId, user_coupon_id, productAmount, merchant);

      // 创建订单
      const orderNo = `MALL${Date.now()}${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
      const freightAmount = dto.freight_amount || 0;
      const baseDiscountAmount = couponBenefit.discountAmount;
      const discountAmount = this.money(baseDiscountAmount + memberPrice.discountAmount);
      const payAmount = this.money(productAmount + Number(freightAmount) - discountAmount);

      const order = await tx.mallOrder.create({
        data: {
          orderNo,
          userId,
          merchantId: String(merchant_id),
          status: "pending_pay",
          totalAmount: payAmount,
          productAmount,
          discountAmount,
          freightAmount,
          payAmount,
          buyerMessage: buyer_message,
          deliveryType: delivery_type,
          receiverName: receiver_name,
          receiverPhone: receiver_phone,
          receiverAddress: receiver_full_address,
          items: {
            create: orderItems,
          },
        },
        include: { items: true },
      });

      // 清理购物车
      await tx.mallCart.deleteMany({
        where: {
          userId,
          productId: { in: items.map((i: any) => i.product_id) },
        },
      });

      if (couponBenefit.discountAmount > 0 && couponBenefit.receive && couponBenefit.coupon) {
        // AUD-P1-065: 原子条件更新 — 只有 status='unused' 且属于当前用户才能核销
        const couponUpdated = await tx.couponReceive.updateMany({
          where: { id: couponBenefit.receive.id, userId, status: 'unused' },
          data: { status: 'used', usedAt: new Date(), orderNo },
        });
        if (couponUpdated.count === 0) {
          throw new BadRequestException('优惠券已被使用或不可用，请重新下单');
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
            orderType: 'mall_order',
            orderId: order.id,
            orderNo,
            userId,
            payerType: couponBenefit.campaign?.payerType || (couponBenefit.coupon.merchantId ? 'merchant' : couponBenefit.coupon.regionId ? 'region' : 'platform'),
            payerId: couponBenefit.coupon.merchantId || couponBenefit.coupon.regionId || null,
            receiverType: 'merchant',
            receiverId: String(merchant_id),
            amount: couponBenefit.discountAmount,
            status: 'pending',
            description: `${couponBenefit.campaign?.title ? `活动${couponBenefit.campaign.title}，` : ''}优惠券核销：${couponBenefit.coupon.name}`,
            metadata: {
              couponReceiveId: couponBenefit.receive.id,
              couponName: couponBenefit.coupon.name,
              couponType: couponBenefit.coupon.type,
              campaignTitle: couponBenefit.campaign?.title || null,
              productAmount,
              freightAmount,
              payAmount,
            },
          },
        }).catch(() => undefined);
      }

      if (memberPrice.discountAmount > 0 && memberPrice.grant) {
        await tx.membershipBenefitUsage.create({
          data: {
            userId,
            grantId: memberPrice.grant.id,
            benefitKey: "mall_member_price",
            benefitName: memberPrice.grant.benefitName,
            category: memberPrice.grant.category,
            targetType: "mall_order",
            targetId: order.id,
            amount: memberPrice.discountAmount,
            quantity: 1,
            metadata: {
              orderNo,
              productAmount,
              discountRate: memberPrice.rate,
              baseDiscountAmount,
            },
          },
        });
        await tx.subsidyLedger.create({
          data: {
            subsidyNo: this.subsidyNo(),
            sourceType: "membership",
            sourceId: memberPrice.grant.id,
            benefitKey: "mall_member_price",
            orderType: "mall_order",
            orderId: order.id,
            orderNo,
            userId,
            payerType: "platform",
            receiverType: "merchant",
            receiverId: merchant_id,
            amount: memberPrice.discountAmount,
            status: "pending",
            description: "会员商城/外卖会员价平台补贴",
            metadata: {
              productAmount,
              discountRate: memberPrice.rate,
              baseDiscountAmount,
              payAmount,
            },
          },
        });
      }

      return order;
    });
  }

  async getMyOrders(userId: string, query: any) {
    const { page = 1, limit = 20, order_status } = query;
    const where: any = { userId };
    if (order_status) where.status = order_status;

    const [list, total] = await Promise.all([
      this.prisma.mallOrder.findMany({
        where,
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        orderBy: { createdAt: "desc" },
        include: { items: true },
      }),
      this.prisma.mallOrder.count({ where }),
    ]);

    return { list, total, page: Number(page), pageSize: Number(limit) };
  }

  async getOrderDetail(id: string, userId: string) {
    const order = await this.prisma.mallOrder.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!order) throw new NotFoundException("订单不存在");
    if (userId && order.userId !== userId) throw new NotFoundException("订单不存在");
    return order;
  }

  async payOrder(id: string, userId: string, dto?: any) {
    return this.runWithLock(
      `mall:order:${id}`,
      '订单正在处理中，请稍后再试',
      () => this.payOrderUnlocked(id, userId, dto),
    );
  }

  private async payOrderUnlocked(id: string, userId: string, dto?: any) {
    // 先查询订单基本信息（事务外读取，避免嵌套事务）
    const order = await this.prisma.mallOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundException("订单不存在");
    if (order.userId !== userId)
      throw new BadRequestException("无权操作该订单");
    if (order.status !== "pending_pay")
      throw new BadRequestException(`订单状态为 ${order.status}，无法支付`);

    const payChannel = dto?.payment_method || dto?.payChannel || "balance";
    const amount = Number(order.payAmount || order.totalAmount || 0);

    // AUD-P0-002 + AUD-P1-184: 余额支付 - 原子条件扣款，余额不足或并发透支由数据库约束拒绝
    if (payChannel === "balance") {
      return this.prisma.$transaction(async (tx) => {
        const paymentNo = `PAY${Date.now()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

        // 原子条件扣款：balance >= amount 才扣减，扣后真实余额写入流水
        await this.walletService.deductBalanceAtomic(
          userId,
          amount,
          {
            type: "PAY",
            channel: "BALANCE",
            description: `商城订单支付: ${order.orderNo || id}`,
            orderNo: order.orderNo || id,
          },
          tx,
        );

        // 创建支付单（真实扣款记录）
        await tx.paymentOrder.create({
          data: {
            paymentNo,
            bizType: "mall_order",
            bizId: order.id,
            orderNo: order.orderNo || id,
            userId,
            amount,
            channel: "balance",
            status: "paid",
            payTime: new Date(),
          },
        });

        return tx.mallOrder.update({
          where: { id },
          data: {
            status: "paid",
            payTime: new Date(),
            payChannel: "balance",
          },
        });
      });
    }

    // AUD-P0-002: 微信支付 - 必须走支付中心（wxUnifiedOrder 内部有独立事务，不能嵌套）
    if (payChannel === "wx_pay" || payChannel === "wechat") {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { openid: true },
      });
      if (!user?.openid) {
        throw new BadRequestException("未绑定微信，无法使用微信支付");
      }

      const paymentResult = await this.paymentService.wxUnifiedOrder({
        bizType: "mall_order",
        bizId: order.id,
        orderNo: order.orderNo || id,
        amount,
        description: `商城订单-${order.orderNo || id}`,
        openid: user.openid,
        userId,
      });
      return {
        success: true,
        message: "已生成微信支付单，请完成支付",
        paymentInfo: paymentResult,
      };
    }

    throw new BadRequestException(`不支持的支付方式: ${payChannel}`);
  }

  // AUD-P1-185: 事务性“待支付订单取消”资源回滚方法。
  // 用户侧取消（MallService.cancelOrder）与后台取消（MallAdminService.updateOrderStatus
  // 的 cancelled 动作）共用此方法，避免两套逻辑分叉导致库存/优惠券/会员权益/补贴账本与
  // 订单状态分叉。它只处理 pending_pay 订单，统一恢复：商品库存与销量、已核销优惠券、
  // 会员权益使用、补贴台账，并写入 AdminOperationLog（后台操作时由调用方写入）。
  // 绝不可用于 paid/refunding/refunded 等资金终态订单（那必须走退款状态机）。
  async cancelPendingPayOrder(
    id: string,
    operator: {
      type: "user" | "admin" | "system";
      userId?: string;
      operatorId?: string;
      reason?: string;
    },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.mallOrder.findUnique({
        where: { id },
        include: { items: true },
      });
      if (!order) throw new NotFoundException("订单不存在");
      if (order.status !== "pending_pay") {
        throw new BadRequestException(
          `订单状态为 [${order.status}]，仅待支付订单可取消并恢复预占资源`,
        );
      }
      if (operator.type === "user") {
        if (!operator.userId || order.userId !== operator.userId) {
          throw new BadRequestException("无权操作该订单");
        }
      }

      const reason =
        operator.reason || (operator.type === "user" ? "用户取消" : operator.type === "admin" ? "后台取消" : "支付超时自动取消");
      const cancelTime = new Date();

      // 用订单状态本身抢占取消权，不能依赖后台路径没有覆盖的 Redis 锁。
      // 同一订单的第二个请求会在这里命中 0 行，绝不能再回滚库存、券或权益。
      const claimed = await tx.mallOrder.updateMany({
        where: { id, status: "pending_pay" },
        data: { status: "cancelled", cancelTime, cancelReason: reason },
      });
      if (claimed.count !== 1) {
        throw new BadRequestException("订单已被取消或状态已变化，请刷新后重试");
      }

      // 恢复预占库存与销量
      for (const item of order.items) {
        await tx.mallProduct.update({
          where: { id: item.productId },
          data: {
            stock: { increment: item.quantity },
            saleCount: { decrement: item.quantity },
          },
        });
      }

      // 恢复已核销优惠券与对应优惠券补贴台账
      const usedCoupon = await tx.couponReceive.findFirst({
        where: { userId: order.userId, orderNo: order.orderNo, status: "used" },
      });
      if (usedCoupon) {
        await tx.couponReceive.update({
          where: { id: usedCoupon.id },
          data: { status: "unused", usedAt: null, orderNo: null },
        });
        await tx.coupon
          .update({
            where: { id: usedCoupon.couponId },
            data: { usedCount: { decrement: 1 } },
          })
          .catch(() => undefined);
        await tx.subsidyLedger
          .updateMany({
            where: { sourceType: "coupon", orderType: "mall_order", orderId: order.id },
            data: { status: "cancelled" },
          })
          .catch(() => undefined);
      }

      // 恢复会员权益使用与会员价补贴台账
      await this.membershipService.restoreBenefitUsagesForTarget("mall_order", order.id, tx);
      await tx.subsidyLedger
        .updateMany({
          where: { sourceType: "membership", orderType: "mall_order", orderId: order.id },
          data: { status: "cancelled" },
        })
        .catch(() => undefined);

      return tx.mallOrder.update({
        where: { id },
        data: {
          status: "cancelled",
          cancelTime,
          cancelReason: reason,
        },
      });
    });
  }

  async expirePendingPayment(id: string) {
    return this.cancelPendingPayOrder(id, { type: "system", reason: "支付超时自动取消" });
  }

  async cancelOrder(id: string, userId: string, dto?: any) {
    return this.runWithLock(
      `mall:order:${id}`,
      "订单正在处理中，请稍后再试",
      () =>
        this.cancelPendingPayOrder(id, {
          type: "user",
          userId,
          reason: dto?.cancel_reason,
        }),
    );
  }

  async addFavorite(userId: string, dto: any) {
    const { product_id } = dto;
    if (!product_id) throw new BadRequestException("product_id 必填");

    // 校验商品存在性
    const product = await this.prisma.mallProduct.findUnique({
      where: { id: product_id },
    });
    if (!product) throw new NotFoundException("商品不存在");
    await this.userAccess.assertCurrentRegionStudentProtectedAction(userId, "收藏商品");

    const existing = await this.prisma.favorite.findFirst({
      where: { userId, targetType: "mall_product", targetId: product_id },
    });
    if (existing) throw new BadRequestException("已收藏该商品");

    return this.prisma.favorite.create({
      data: { userId, targetType: "mall_product", targetId: product_id },
    });
  }

  async getFavorites(userId: string, query: any) {
    const { page = 1, limit = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.favorite.findMany({
        where: { userId, targetType: "mall_product" },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.favorite.count({ where: { userId, targetType: "mall_product" } }),
    ]);
    const products = await this.prisma.mallProduct.findMany({
      where: { id: { in: list.map((item) => item.targetId) } },
      include: { skus: true },
    });
    const productMap = new Map(
      products.map((product) => [product.id, product]),
    );
    return {
      list: list.map((item) => ({
        ...item,
        product: productMap.get(item.targetId) || null,
      })),
      total,
      page: Number(page),
      pageSize: Number(limit),
    };
  }

  async removeFavorite(productId: string, userId: string) {
    const favorite = await this.prisma.favorite.findFirst({
      where: { userId, targetType: "mall_product", targetId: productId },
    });
    if (!favorite) throw new NotFoundException("收藏记录不存在");
    await this.prisma.favorite.delete({ where: { id: favorite.id } });
    return { success: true };
  }

  async checkFavorite(productId: string, userId: string) {
    const favorite = await this.prisma.favorite.findFirst({
      where: { userId, targetType: "mall_product", targetId: productId },
    });
    return { is_favorite: !!favorite };
  }

  async batchRemoveFavorites(userId: string, dto: any) {
    const { product_ids = [] } = dto;
    if (!product_ids.length) throw new BadRequestException("product_ids 不能为空");

    await this.prisma.favorite.deleteMany({
      where: {
        userId,
        targetType: "mall_product",
        targetId: { in: product_ids },
      },
    });
    return { success: true };
  }

  async getAvailablePromotions(query: any) {
    const { region_id, merchant_id, order_amount } = query;
    const where: any = {
      status: "active",
      startAt: { lte: new Date() },
      endAt: { gte: new Date() },
    };
    if (merchant_id) where.merchantId = merchant_id;

    return this.prisma.mallPromotion.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
  }

  async getMerchantPromotions(userId: string, query: any) {
    const merchant = await this.prisma.mallMerchant.findFirst({ where: { userId } });
    if (!merchant) return { list: [], total: 0 };

    const { page = 1, limit = 20 } = query;
    const where = { merchantId: merchant.id };
    const [list, total] = await Promise.all([
      this.prisma.mallPromotion.findMany({
        where,
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.mallPromotion.count({ where }),
    ]);

    return { list, total, page: Number(page), pageSize: Number(limit) };
  }

  async getPromotionDetail(id: string) {
    const promotion = await this.prisma.mallPromotion.findUnique({ where: { id } });
    if (!promotion) throw new NotFoundException("促销活动不存在");
    return promotion;
  }

  async getFreightTemplates(query: any) {
    const { merchant_id } = query;
    const where: any = {};
    if (merchant_id) where.merchantId = merchant_id;

    return this.prisma.mallFreightTemplate.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
  }

  async getFreightTemplateDetail(id: string) {
    const template = await this.prisma.mallFreightTemplate.findUnique({ where: { id } });
    if (!template) throw new NotFoundException("运费模板不存在");
    return template;
  }

  async getProductReviews(productId: string, query: any) {
    const { page = 1, page_size = 10, sort_by, rating } = query;
    const where: any = { productId, status: "active" };
    if (rating) where.rating = Number(rating);

    const orderBy: any = { createdAt: "desc" };
    if (sort_by === "newest") orderBy.createdAt = "desc";
    if (sort_by === "rating_high") orderBy.rating = "desc";
    if (sort_by === "rating_low") orderBy.rating = "asc";

    const [list, total] = await Promise.all([
      this.prisma.mallReview.findMany({
        where,
        skip: (Number(page) - 1) * Number(page_size),
        take: Number(page_size),
        orderBy,
        include: { User: { select: { id: true, nickname: true, avatar: true } } },
      }),
      this.prisma.mallReview.count({ where }),
    ]);

    return {
      list: list.map((review) => ({
        id: review.id,
        rating: review.rating,
        content: review.content,
        images: review.images,
        is_anonymous: review.isAnonymous,
        user_name: review.isAnonymous ? "匿名用户" : review.User?.nickname || "用户",
        user_avatar: review.isAnonymous ? "" : review.User?.avatar || "",
        merchant_reply: review.reply,
        created_at: review.createdAt,
      })),
      total,
      page: Number(page),
      pageSize: Number(page_size),
    };
  }

  async createReview(userId: string, dto: any) {
    await this.userAccess.assertCurrentRegionStudentProtectedAction(userId, "评价商品");
    return this.prisma.mallReview.create({
      data: {
        userId,
        productId: dto.product_id,
        merchantId: dto.merchant_id,
        orderId: dto.order_id,
        rating: dto.rating,
        content: dto.content,
        images: dto.images,
      },
    });
  }

  async applyRefund(userId: string, dto: any) {
    return this.runWithLock(
      `mall:refund:${dto?.order_id || 'unknown'}:${userId}`,
      '退款申请正在处理中，请勿重复提交',
      () => this.applyRefundUnlocked(userId, dto),
      60,
    );
  }

  private async applyRefundUnlocked(userId: string, dto: any) {
    const {
      order_id,
      order_item_id,
      refund_type = "refund_only",
      reason,
      refund_quantity = 1,
      refund_amount,
      description,
      images,
    } = dto;

    if (!order_id) throw new BadRequestException("order_id 必填");
    if (!order_item_id) throw new BadRequestException("order_item_id 必填");
    if (!String(reason || '').trim()) throw new BadRequestException("退款原因必填");

    const amount = Number(refund_amount);
    const quantity = Number(refund_quantity);
    if (!Number.isFinite(amount) || amount <= 0 || Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-8) {
      throw new BadRequestException("退款金额必须是最多两位小数的正数");
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new BadRequestException("退款数量必须是正整数");
    }

    // 校验订单存在性和所有权
    const order = await this.prisma.mallOrder.findUnique({
      where: { id: order_id },
    });
    if (!order) throw new NotFoundException("订单不存在");
    if (order.userId !== userId) throw new BadRequestException("无权操作该订单");
    if (!['paid', 'shipped', 'received', 'completed'].includes(order.status)) {
      throw new BadRequestException("当前订单状态不支持申请退款");
    }

    const orderItem = await this.prisma.mallOrderItem.findFirst({
      where: { id: order_item_id, orderId: order_id },
    });
    if (!orderItem) throw new BadRequestException("退款商品不属于该订单");
    if (quantity > orderItem.quantity) throw new BadRequestException("退款数量超过已购数量");
    const maxAmount = Math.round(Number(orderItem.price) * quantity * 100) / 100;
    if (amount > maxAmount) throw new BadRequestException("退款金额超过该商品可退金额");

    const activeRefund = await this.prisma.mallRefund.findFirst({
      where: { orderId: order_id, status: { in: ['applying', 'approved', 'merchant_approved', 'processing'] } },
      select: { id: true },
    });
    if (activeRefund) throw new BadRequestException("该订单已有处理中退款申请");

    const refundNo = `REF${Date.now()}${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
    const priority = await this.membershipService.hasBenefit(userId, "refund_priority").catch(() => false);

    return this.prisma.mallRefund.create({
      data: {
        orderId: order_id,
        orderItemId: order_item_id,
        refundNo,
        refundType: refund_type,
        amount,
        quantity,
        reason: priority ? `[会员优先] ${reason}` : reason,
        description: priority ? `[会员优先售后] ${description || ""}`.trim() : description,
        images: images || [],
        status: "applying",
      },
    });
  }

  async getMyRefunds(userId: string, query: any) {
    const { page = 1, limit = 20, status } = query;

    const userOrders = await this.prisma.mallOrder.findMany({
      where: { userId },
      select: { id: true },
    });
    const orderIds = userOrders.map((o) => o.id);

    const where: any = { orderId: { in: orderIds } };
    if (status) where.status = status;

    const [list, total] = await Promise.all([
      this.prisma.mallRefund.findMany({
        where,
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        orderBy: { createdAt: "desc" },
        include: { order: { include: { items: true } } },
      }),
      this.prisma.mallRefund.count({ where }),
    ]);

    return { list, total, page: Number(page), pageSize: Number(limit) };
  }

  async applyDistributor(userId: string, dto: any) {
    const { real_name, phone, id_card, inviter_id, region_id } = dto;

    if (!real_name) throw new BadRequestException("real_name 必填");
    if (!phone) throw new BadRequestException("phone 必填");

    // 检查是否已经是分销员
    const existing = await this.prisma.mallDistributor.findUnique({
      where: { userId },
    });
    if (existing) throw new BadRequestException("您已申请过分销员");

    return this.prisma.mallDistributor.create({
      data: {
        userId,
        realName: real_name,
        phone,
        parentId: inviter_id,
        status: "pending",
      },
    });
  }

  async getMyDistributor(userId: string) {
    return this.prisma.mallDistributor.findUnique({ where: { userId } });
  }

  async getMyMerchantApplication(userId: string) {
    return this.prisma.mallMerchant.findFirst({ where: { userId } });
  }

  async applyMerchant(userId: string, dto: any) {
    const {
      region_id,
      merchant_name,
      contact_name,
      contact_phone,
      merchant_logo,
      merchant_cover,
      description,
      contact_address,
      business_license_url,
    } = dto;

    if (!merchant_name) throw new BadRequestException("merchant_name 必填");
    if (!contact_name) throw new BadRequestException("contact_name 必填");
    if (!contact_phone) throw new BadRequestException("contact_phone 必填");

    // 检查是否已申请
    const existing = await this.prisma.mallMerchant.findFirst({
      where: { userId },
    });
    if (existing) throw new BadRequestException("您已申请过商户");

    return this.prisma.mallMerchant.create({
      data: {
        userId,
        regionId: region_id,
        name: merchant_name,
        logo: merchant_logo,
        cover: merchant_cover,
        phone: contact_phone,
        address: contact_address,
        description,
        status: "pending",
      },
    });
  }

  async updateCartItem(id: string, userId: string, dto: any) {
    const cartItem = await this.prisma.mallCart.findFirst({
      where: { id, userId },
    });
    if (!cartItem) throw new NotFoundException("购物车项不存在");

    const data: any = {};
    if (dto.quantity !== undefined) data.quantity = Number(dto.quantity);
    if (dto.is_checked !== undefined) data.selected = dto.is_checked === 1 || dto.is_checked === true;

    return this.prisma.mallCart.update({
      where: { id },
      data,
    });
  }

  async getRefundDetail(id: string, userId?: string) {
    const refund = await this.prisma.mallRefund.findUnique({
      where: { id },
      include: { order: { include: { items: true } } },
    });
    if (!refund) throw new NotFoundException("退款记录不存在");
    if (userId) {
      const order = await this.prisma.mallOrder.findUnique({
        where: { id: refund.orderId },
      });
      if (!order || order.userId !== userId) throw new NotFoundException("退款记录不存在");
    }
    return refund;
  }

  async cancelRefund(id: string, userId: string) {
    return this.runWithLock(
      `mall:refund:cancel:${id}`,
      '退款记录正在处理中，请稍后再试',
      () => this.cancelRefundUnlocked(id, userId),
    );
  }

  private async cancelRefundUnlocked(id: string, userId: string) {
    const refund = await this.prisma.mallRefund.findUnique({
      where: { id },
    });
    if (!refund) throw new NotFoundException("退款记录不存在");

    const order = await this.prisma.mallOrder.findUnique({
      where: { id: refund.orderId },
    });
    if (!order || order.userId !== userId) throw new BadRequestException("无权操作该退款");

    if (refund.status !== "applying") {
      throw new BadRequestException("只能取消申请中的退款");
    }

    return this.prisma.mallRefund.update({
      where: { id },
      data: { status: "closed" },
    });
  }

  async receiveOrder(id: string, userId: string) {
    return this.runWithLock(
      `mall:order:${id}`,
      '订单正在处理中，请稍后再试',
      () => this.receiveOrderUnlocked(id, userId),
    );
  }

  private async receiveOrderUnlocked(id: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.mallOrder.findUnique({ where: { id } });
      if (!order) throw new NotFoundException("订单不存在");
      if (order.userId !== userId) throw new BadRequestException("无权操作该订单");
      if (order.status !== "shipped") throw new BadRequestException("订单状态不正确，无法确认收货");

      return tx.mallOrder.update({
        where: { id },
        data: {
          status: "received",
          receiveTime: new Date(),
        },
      });
    });
  }

  async shipOrder(id: string, userId: string, dto: any) {
    return this.runWithLock(
      `mall:order:${id}`,
      '订单正在处理中，请稍后再试',
      () => this.shipOrderUnlocked(id, userId, dto),
    );
  }

  private async shipOrderUnlocked(id: string, userId: string, dto: any) {
    const order = await this.prisma.mallOrder.findUnique({
      where: { id },
    });
    if (!order) throw new NotFoundException("订单不存在");

    const merchant = await this.prisma.mallMerchant.findUnique({
      where: { id: order.merchantId },
    });
    if (!merchant || merchant.userId !== userId) {
      throw new BadRequestException("无权操作该订单");
    }
    if (order.status !== "paid") {
      throw new BadRequestException(`订单状态为 ${order.status}，无法发货`);
    }

    return this.prisma.mallOrder.update({
      where: { id },
      data: {
        status: "shipped",
        trackingNo: dto.express_no || dto.tracking_no || dto.trackingNo,
        trackingCompany: dto.express_company || dto.tracking_company || dto.trackingCompany,
        deliverTime: new Date(),
      },
    });
  }

  async updateOrderStatus(id: string, userId: string, dto: any) {
    const targetStatus = dto.target_status || dto.status;
    if (!targetStatus) throw new BadRequestException("target_status 必填");

    // AUD-P0-002: 用户端只允许确认收货(received)和取消(cancelled)。其他终态必须由支付中心/退款状态机/商户履约推进。
    if (targetStatus === "received") {
      return this.receiveOrder(id, userId);
    }

    if (targetStatus === "cancelled") {
      return this.cancelOrder(id, userId, dto);
    }

    throw new BadRequestException(
      `用户端不支持将订单状态更新为 "${targetStatus}"。` +
      `已支付订单请通过确认收货完成；退款请联系客服处理。`,
    );
  }

  async getMerchantOrders(userId: string, query: any) {
    const merchant = await this.prisma.mallMerchant.findFirst({
      where: { userId },
    });
    if (!merchant) {
      return { list: [], total: 0, page: Number(query.page || 1), pageSize: Number(query.limit || query.pageSize || 20) };
    }

    const { page = 1, limit, pageSize = limit || 20, order_status } = query;
    const where: any = { merchantId: merchant.id };
    if (order_status) where.status = order_status;

    const [list, total] = await Promise.all([
      this.prisma.mallOrder.findMany({
        where,
        include: { items: true, refunds: true },
        skip: (Number(page) - 1) * Number(pageSize),
        take: Number(pageSize),
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.mallOrder.count({ where }),
    ]);

    return { list, total, page: Number(page), pageSize: Number(pageSize) };
  }

  // ==================== 客服管理 ====================

  async getServiceStaffList(query: any) {
    const { page = 1, pageSize = 20, merchantId, regionId, status } = query;
    const where: any = {};
    if (merchantId) where.merchantId = merchantId;
    if (regionId) where.regionId = regionId;
    if (status) where.status = status;
    where.status = where.status || "active";

    const [list, total] = await Promise.all([
      this.prisma.mallServiceStaff.findMany({
        where,
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.mallServiceStaff.count({ where }),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  async createServiceStaff(dto: any) {
    const { merchantId, regionId, nickname, avatar, phone, wechat, onlineStatus, workTime, status } = dto;
    if (!nickname) throw new BadRequestException("客服昵称不能为空");
    const staff = await this.prisma.mallServiceStaff.create({
      data: {
        merchantId: merchantId || null,
        regionId: regionId || null,
        nickname,
        avatar: avatar || null,
        phone: phone || null,
        wechat: wechat || null,
        onlineStatus: onlineStatus || "offline",
        workTime: workTime || null,
        status: status || "active",
      },
    });
    return { success: true, data: staff };
  }

  async updateServiceStaff(id: string, dto: any) {
    const staff = await this.prisma.mallServiceStaff.findUnique({ where: { id } });
    if (!staff) throw new NotFoundException("客服不存在");

    const data: any = {};
    if (dto.merchantId !== undefined) data.merchantId = dto.merchantId || null;
    if (dto.regionId !== undefined) data.regionId = dto.regionId || null;
    if (dto.nickname !== undefined) data.nickname = dto.nickname;
    if (dto.avatar !== undefined) data.avatar = dto.avatar || null;
    if (dto.phone !== undefined) data.phone = dto.phone || null;
    if (dto.wechat !== undefined) data.wechat = dto.wechat || null;
    if (dto.onlineStatus !== undefined) data.onlineStatus = dto.onlineStatus;
    if (dto.workTime !== undefined) data.workTime = dto.workTime || null;
    if (dto.status !== undefined) data.status = dto.status;

    const updated = await this.prisma.mallServiceStaff.update({ where: { id }, data });
    return { success: true, data: updated };
  }

  async deleteServiceStaff(id: string) {
    const staff = await this.prisma.mallServiceStaff.findUnique({ where: { id } });
    if (!staff) throw new NotFoundException("客服不存在");
    await this.prisma.mallServiceStaff.delete({ where: { id } });
    return { success: true, message: "客服已删除" };
  }
}
