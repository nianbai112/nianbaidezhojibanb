import { mallFen, mallFreightFen, mallPromotionFen, mallPromotionLimits, mallAssertPromotionQuota, mallQuantity, mallRequestOrderNo } from './mall-checkout';
import { canStartWechatPayment } from '../../common/payment-client';
import { isMiniappOpenid } from '../../common/wechat-identity';
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { PrismaService } from "../../common/services/prisma.service";
import { RedisService } from "../../common/services/redis.service";
import { WalletService } from "../../common/services/wallet.service";
import { MembershipService } from "../membership/membership.service";
import { UserAccessPolicyService } from "../../common/services/user-access-policy.service";
import { PaymentService } from "../payment/payment.service";
import { errandCampaignDayKey, reserveErrandCampaignBudget, releaseErrandCampaignBudget, resolveActiveCouponCampaign } from "../errand/errand-transaction-guards";

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
    return new Date(`${errandCampaignDayKey(new Date())}T00:00:00+08:00`);
  }

  private async resolveCouponCampaign(tx: any, couponId: string) {
    return resolveActiveCouponCampaign(tx, couponId);
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

  private async resolveUserCoupon(tx: any, userId: string, userCouponId: any, amount: number, merchant: any, reserve = true) {
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
    const campaignTime = new Date();
    if (reserve) await reserveErrandCampaignBudget(tx, campaign, userId, discountAmount, campaignTime);
    await this.assertCampaignRules(tx, campaign, userId, coupon.id, discountAmount);
    return {
      discountAmount,
      receive,
      coupon,
      campaign,
      campaignTime,
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
    const page = Math.max(1, Math.floor(Number(query.page) || 1)), limit = Math.min(100, Math.max(1, Math.floor(Number(query.limit) || 20)));
    const where: any = { status: 'on_sale', merchant: { status: 'approved', isShow: true } };
    if (query.region_id) where.merchant.regionId = String(query.region_id);
    if (query.category_id) where.categoryId = String(query.category_id);
    if (query.merchant_id) where.merchantId = String(query.merchant_id);
    if (query.keyword) where.name = { contains: String(query.keyword).slice(0, 100) };
    const orderBy: any = query.sort_by === 'sales' ? [{saleCount:'desc'}, {id:'asc'}] : query.sort_by === 'price_asc' ? [{price:'asc'}, {id:'asc'}] : query.sort_by === 'price_desc' ? [{price:'desc'}, {id:'asc'}] : [{createdAt:'desc'}, {id:'asc'}];
    const [list, total] = await Promise.all([this.prisma.mallProduct.findMany({where,skip:(page-1)*limit,take:limit,orderBy,include:{skus:true,merchant:{select:{id:true,name:true,regionId:true,status:true}}}}),this.prisma.mallProduct.count({where})]);
    return { list, total, page, pageSize: limit };
  }
  async getProductDetail(id: string, query: any = {}) {
    const product = await this.prisma.mallProduct.findFirst({where:{id,status:'on_sale',merchant:{status:'approved',isShow:true,...(query.region_id ? {regionId:String(query.region_id)} : {})}},include:{skus:true,merchant:true}});
    if (!product) throw new NotFoundException('商品不存在或暂不可购买');
    return product;
  }
  async getMerchants(query: any) {
    const page = Math.max(1,Math.floor(Number(query.page)||1)), limit=Math.min(100,Math.max(1,Math.floor(Number(query.limit)||20)));
    const where:any={status:'approved',isShow:true}; if(query.region_id)where.regionId=String(query.region_id);
    const [list,total]=await Promise.all([this.prisma.mallMerchant.findMany({where,skip:(page-1)*limit,take:limit,orderBy:{createdAt:'desc'}}),this.prisma.mallMerchant.count({where})]);
    return {list,total,page,pageSize:limit};
  }

  async getMerchantDetail(id: string) {
    const merchant = await this.prisma.mallMerchant.findUnique({
      where: { id, status: "approved", isShow: true },
    });
    if (!merchant) throw new NotFoundException("商家不存在");
    return merchant;
  }

  async addToCart(userId: string, dto: any) {
    const quantity = mallQuantity(dto.quantity ?? 1);
    return this.prisma.$transaction(async tx => {
      const product = await tx.mallProduct.findUnique({where:{id:String(dto.product_id || '')},include:{skus:true,merchant:true}});
      if (!product || product.status !== 'on_sale' || product.merchant.status !== 'approved' || !product.merchant.isShow) throw new BadRequestException('商品暂不可购买');
      if (dto.region_id && product.merchant.regionId !== dto.region_id) throw new BadRequestException('商品不属于当前校区');
      await this.userAccess.assertStudentProtectedAction(userId, product.merchant.regionId, '添加商城购物车');
      const sku = dto.sku_id ? product.skus.find(row => row.id === dto.sku_id) : null;
      if (product.skus.length && !sku || dto.sku_id && !sku) throw new BadRequestException('请选择有效商品规格');
      const current = await tx.mallCart.findFirst({where:{userId,productId:product.id,skuId:sku?.id || null}});
      const next = (current?.quantity || 0) + quantity;
      if (next > 999 || next > product.stock || sku && next > sku.stock) throw new BadRequestException('库存不足');
      return current ? tx.mallCart.update({where:{id:current.id},data:{quantity:next}}) : tx.mallCart.create({data:{userId,productId:product.id,skuId:sku?.id || null,quantity}});
    }, {isolationLevel:'Serializable'});
  }

  async getCart(userId: string) {
    const items = await this.prisma.mallCart.findMany({
      where: { userId },
      include: { product: { include: { skus: true, merchant: true } } },
      orderBy: { createdAt: "desc" },
    });

    // 按商户分组
    const merchantMap = new Map();
    for (const item of items) {
      const merchantId = item.product.merchantId;
      if (!merchantMap.has(merchantId)) {
        merchantMap.set(merchantId, {
          merchant_id: merchantId,
          merchant_name: item.product.merchant.name,
          region_id: item.product.merchant.regionId,
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
        price: sku ? sku.price : item.product.price,
        quantity: item.quantity,
        stock: sku ? Math.min(sku.stock, item.product.stock) : item.product.stock,
        available: item.product.status === "on_sale" && item.product.merchant.status === "approved" && item.product.merchant.isShow && (!item.product.skus.length || !!sku),
        is_checked: item.selected ? 1 : 0,
      });
    }

    return { merchants: Array.from(merchantMap.values()) };
  }

  async removeCartItem(id: string, userId: string) {
    await this.prisma.mallCart.deleteMany({ where: { id, userId } });
    return { success: true };
  }

  private async checkout(tx: any, userId: string, dto: any, reserve: boolean) {
    const merchant = await tx.mallMerchant.findUnique({where:{id:String(dto.merchant_id || '')}});
    if (!merchant || merchant.status !== 'approved' || !merchant.isShow) throw new BadRequestException('店铺暂不可下单');
    if (!dto.region_id || String(merchant.regionId || '') !== String(dto.region_id)) throw new BadRequestException('店铺不属于当前校区');
    await this.userAccess.assertStudentProtectedAction(userId, merchant.regionId, '提交商城订单');
    const address = await tx.address.findFirst({where:{id:String(dto.address_id || ''),userId,regionId:merchant.regionId}});
    if (!address || !address.name || !address.phone || !address.detail) throw new BadRequestException('请选择当前校区的有效收货地址');
    if (dto.delivery_type && dto.delivery_type !== 'express') throw new BadRequestException('当前商城只支持配送订单');
    if (!Array.isArray(dto.items) || !dto.items.length || dto.items.length > 100) throw new BadRequestException('请选择1至100项商品');
    const orderItems: any[] = []; const seen = new Set<string>(); let productFen = 0, totalQuantity = 0, weightGrams=0, volumeCm3=0, weightKnown=true, volumeKnown=true;
    for (const item of dto.items) {
      const quantity = mallQuantity(item.quantity), id = String(item.product_id || ''), skuId = String(item.sku_id || '');
      if (seen.has(id + ':' + skuId)) throw new BadRequestException('请合并重复商品'); seen.add(id + ':' + skuId);
      const product = await tx.mallProduct.findUnique({where:{id},include:{skus:true}});
      if (!product || product.merchantId !== merchant.id || product.status !== 'on_sale') throw new BadRequestException('订单包含其它店铺或已下架商品');
      const sku = skuId ? product.skus.find((row:any) => row.id === skuId) : null;
      if (product.skus.length && !sku || skuId && !sku) throw new BadRequestException('商品规格已变化，请重新选择');
      if (quantity > product.stock || sku && quantity > sku.stock) throw new BadRequestException('商品库存不足');
      const unitFen = mallFen(sku ? sku.price : product.price); if (unitFen <= 0) throw new BadRequestException('商品价格配置无效');
      productFen += unitFen * quantity; totalQuantity += quantity;
      const grams=sku?.weightGrams??product.weightGrams,cm3=sku?.volumeCm3??product.volumeCm3;
      if(!Number.isSafeInteger(grams)||grams<=0)weightKnown=false;else weightGrams+=grams*quantity;
      if(!Number.isSafeInteger(cm3)||cm3<=0)volumeKnown=false;else volumeCm3+=cm3*quantity;
      if (reserve) {
        if (sku && (await tx.mallProductSku.updateMany({where:{id:sku.id,productId:id,stock:{gte:quantity}},data:{stock:{decrement:quantity}}})).count !== 1) throw new ConflictException('规格库存不足，请刷新');
        if ((await tx.mallProduct.updateMany({where:{id,merchantId:merchant.id,status:'on_sale',stock:{gte:quantity}},data:{stock:{decrement:quantity},saleCount:{increment:quantity}}})).count !== 1) throw new ConflictException('商品库存不足，请刷新');
      }
      orderItems.push({productId:id,productName:product.name,productImage:product.mainImage || (Array.isArray(product.images) ? product.images[0] : '') || null,skuId:sku?.id || null,skuName:sku?.skuName || null,price:unitFen/100,quantity});
    }
    const freightFen = mallFreightFen(await tx.mallFreightTemplate.findMany({where:{merchantId:merchant.id,isDefault:true}}),totalQuantity,productFen,{weightGrams:weightKnown?weightGrams:null,volumeCm3:volumeKnown?volumeCm3:null,provinceCode:address.provinceCode,cityCode:address.cityCode,districtCode:address.districtCode});
    if (dto.promotion_id && dto.user_coupon_id) throw new BadRequestException('促销活动与优惠券不能叠加');
    const promotion = dto.promotion_id ? await tx.mallPromotion.findUnique({where:{id:String(dto.promotion_id)}}) : null;
    const limits=promotion?mallPromotionLimits(promotion.rules||{}):null;
    const eligibleFen=limits?.productIds.length?orderItems.filter(row=>limits.productIds.includes(row.productId)).reduce((sum,row)=>sum+mallFen(row.price)*row.quantity,0):productFen;
    if(promotion&&eligibleFen<=0)throw new BadRequestException('当前商品不在活动适用范围');
    const rawPromotionFen = dto.promotion_id ? mallPromotionFen(promotion,merchant.id,eligibleFen) : 0;
    const freightDiscountFen = promotion?.type === 'free_shipping' && eligibleFen >= mallFen((promotion.rules as any)?.min_amount ?? 0) ? freightFen : 0;
    const memberPrice = await this.resolveMallMemberPrice(userId, productFen / 100);
    const couponBenefit = await this.resolveUserCoupon(tx,userId,dto.user_coupon_id,productFen/100,merchant,reserve);
    const memberFen = Math.min(mallFen(memberPrice.discountAmount), productFen);
    const eligibleAfterMember=Math.max(0,eligibleFen-Math.ceil(memberFen*eligibleFen/productFen));
    const promotionFen=Math.min(rawPromotionFen,eligibleAfterMember);
    if(promotion){if(promotionFen+freightDiscountFen<=0)throw new BadRequestException('当前订单未满足活动优惠条件，请取消选择该活动');await mallAssertPromotionQuota(tx,promotion,userId)}
    const offerFen = Math.min(productFen-memberFen, Math.max(promotionFen,mallFen(couponBenefit.discountAmount)));
    // Subsidy ledgers must exactly match the actual discount, so do not silently cap an over-stacked coupon.
    if (mallFen(couponBenefit.discountAmount) > offerFen) throw new BadRequestException('该优惠券与会员价叠加后超过商品金额，请取消优惠券');
    const discountFen = memberFen+offerFen+freightDiscountFen, payFen=productFen+freightFen-discountFen;
    return { merchant,address,orderItems,memberPrice,couponBenefit,promotion,productAmount:productFen/100,freightAmount:freightFen/100,discountAmount:discountFen/100,payAmount:payFen/100,baseDiscountAmount:offerFen/100,promotionDiscount:(promotionFen+freightDiscountFen)/100 };
  }
  async quoteOrder(userId: string, dto: any) {
    return this.prisma.$transaction(async tx => { const q=await this.checkout(tx,userId,dto,false); return {items:q.orderItems,merchant_id:q.merchant.id,address_id:q.address.id,product_amount:q.productAmount,freight_amount:q.freightAmount,discount_amount:q.discountAmount,pay_amount:q.payAmount,member_discount:q.memberPrice.discountAmount,promotion_discount:q.promotionDiscount}; },{isolationLevel:'Serializable'});
  }
  async findOrderByRequest(userId: string, requestId: string) { return this.prisma.mallOrder.findUnique({where:{orderNo:mallRequestOrderNo(userId,requestId)},include:{items:true}}); }
  async submitOrder(userId: string, dto: any) {
    const orderNo=mallRequestOrderNo(userId,dto.request_id);
    return this.runWithLock(`mall:submit:${orderNo}`,'订单正在创建中，请勿重复提交',async () => {
      const existing=await this.prisma.mallOrder.findUnique({where:{orderNo},include:{items:true}}); if(existing)return existing;
      try { return await this.submitOrderUnlocked(userId,dto); }
      catch (error:any) { if(error?.code==='P2002') { const recovered=await this.prisma.mallOrder.findUnique({where:{orderNo},include:{items:true}}); if(recovered)return recovered; } if(error?.code==='P2034')throw new ConflictException('库存或价格已变化，请重新核对结算'); throw error; }
    },45);
  }

  private async submitOrderUnlocked(userId: string, dto: any) {
    const { merchant_id, user_coupon_id, buyer_message } = dto;
    const orderNo = mallRequestOrderNo(userId, dto.request_id);
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.mallOrder.findUnique({where:{orderNo},include:{items:true}}); if(existing)return existing;
      const quote = await this.checkout(tx,userId,dto,true);
      const { merchant,address,orderItems,memberPrice,couponBenefit,productAmount,freightAmount,discountAmount,payAmount,baseDiscountAmount }=quote;
      if (dto.expected_pay_amount === undefined || mallFen(dto.expected_pay_amount) !== mallFen(payAmount)) throw new ConflictException('金额已变化，请刷新报价后重新确认');
      const receiver_name=address.name,receiver_phone=address.phone,receiver_full_address=address.detail,delivery_type='express';
      const order = await tx.mallOrder.create({
        data: {
          orderNo,
          userId,
          merchantId: String(merchant_id),
          status: payAmount === 0 ? "paid" : "pending_pay",
          ...(payAmount === 0 ? { payChannel: 'free', payTime: new Date() } : {}),
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

      if (quote.promotion) await tx.mallPromotionUsage.create({data:{promotionId:quote.promotion.id,orderId:order.id,userId,discountAmount:quote.promotionDiscount,status:payAmount===0?'consumed':'reserved'}});

      // A server-computed zero balance is fulfilled without charging a payment provider or a wallet.
      // The free payment record is auditable, while coupon/member consumption stays in this same transaction.
      if (payAmount === 0) await tx.paymentOrder.create({data:{paymentNo:'FREE'+orderNo,bizType:'mall_order',bizId:order.id,orderNo,userId,amount:0,channel:'free',status:'paid',payTime:new Date()}});

      // 清理购物车
      await tx.mallCart.deleteMany({
        where: {
          userId,
          OR: orderItems.map((i: any) => ({productId:i.productId,skuId:i.skuId})),
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
            createdAt: couponBenefit.campaignTime,
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
        });
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
    }, { isolationLevel: 'Serializable' });
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
    const amount = Number(order.payAmount ?? order.totalAmount ?? 0);

    // AUD-P0-002 + AUD-P1-184: 余额支付 - 原子条件扣款，余额不足或并发透支由数据库约束拒绝
    if (payChannel === "balance") {
      return this.prisma.$transaction(async (tx) => {
        const paymentNo = `PAY${Date.now()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

        const claimed = await tx.mallOrder.updateMany({where:{id,userId,status:'pending_pay',OR:[{payChannel:null},{payChannel:'balance'}]},data:{status:'paid',payTime:new Date(),payChannel:'balance'}});
        if (claimed.count !== 1) throw new ConflictException('订单已支付或已取消，请刷新');
        await tx.mallPromotionUsage.updateMany({where:{orderId:id,status:'reserved'},data:{status:'consumed'}});
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
      if (!user || !canStartWechatPayment(user.openid)) {
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
  // 唯一 paid 例外是用户撤销未发货、具备真实 free 记录的零元单；不退不存在的现金。
  // 有资金 paid/refunding/refunded 订单必须走退款状态机。
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
      const freePaid = operator.type === 'user' && order.status === 'paid' && order.payChannel === 'free' && Number(order.payAmount) === 0 && order.refundStatus === 'none';
      if (freePaid && !await tx.paymentOrder.findFirst({where:{bizType:'mall_order',bizId:id,userId:order.userId,channel:'free',amount:0,status:'paid'}})) throw new BadRequestException('零元订单支付记录不完整，请联系平台核对');
      if (order.status !== "pending_pay" && !freePaid) {
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
        where: { id, status: freePaid ? 'paid' : 'pending_pay', ...(freePaid ? {payChannel:'free',payAmount:0,refundStatus:'none'} : {}) },
        data: { status: "cancelled", cancelTime, cancelReason: reason },
      });
      if (claimed.count !== 1) {
        throw new BadRequestException("订单已被取消或状态已变化，请刷新后重试");
      }

      await tx.mallPromotionUsage.updateMany({where:{orderId:id,status:{in:['reserved','consumed']}},data:{status:'released'}});
      if (freePaid) await tx.paymentOrder.updateMany({where:{bizType:'mall_order',bizId:id,channel:'free',amount:0,status:'paid'},data:{status:'closed'}});

      // 恢复预占库存与销量
      for (const item of order.items) {
        if (item.skuId) await tx.mallProductSku.updateMany({where:{id:item.skuId,productId:item.productId},data:{stock:{increment:item.quantity}}});
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
          });
      }
      const couponLedgers=await tx.subsidyLedger.findMany({where:{sourceType:'coupon',orderType:'mall_order',orderId:order.id,status:{not:'cancelled'}}});
      for(const ledger of couponLedgers){
        const cancelled=await tx.subsidyLedger.updateMany({where:{id:ledger.id,sourceType:'coupon',orderType:'mall_order',orderId:order.id,status:{not:'cancelled'}},data:{status:'cancelled'}});
        if(cancelled.count===1&&ledger.campaignId)await releaseErrandCampaignBudget(tx,{campaignId:ledger.campaignId,userId:order.userId,amount:Number(ledger.amount),dayKey:errandCampaignDayKey(ledger.createdAt)});
      }

      // 恢复会员权益使用与会员价补贴台账
      await this.membershipService.restoreBenefitUsagesForTarget("mall_order", order.id, tx);
      await tx.subsidyLedger
        .updateMany({
          where: { sourceType: "membership", orderType: "mall_order", orderId: order.id },
          data: { status: "cancelled" },
        });

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
    const merchants=await this.prisma.mallMerchant.findMany({where:{status:'approved',isShow:true,...(query.region_id?{regionId:String(query.region_id)}:{}),...(query.merchant_id?{id:String(query.merchant_id)}:{})},select:{id:true}});
    return this.prisma.mallPromotion.findMany({where:{status:'active',startAt:{lte:new Date()},endAt:{gt:new Date()},OR:[{merchantId:null},{merchantId:{in:merchants.map(row=>row.id)}}]},orderBy:{createdAt:'desc'}});
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
    const promotion = await this.prisma.mallPromotion.findFirst({where:{id,status:'active',startAt:{lte:new Date()},endAt:{gt:new Date()}}});
    if (!promotion || promotion.merchantId && !await this.prisma.mallMerchant.findFirst({where:{id:promotion.merchantId,status:'approved',isShow:true}})) throw new NotFoundException('促销活动不存在或已结束');
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
    await this.userAccess.assertCurrentRegionStudentProtectedAction(userId, '评价商品');
    return this.prisma.$transaction(async tx => {
      const order=await tx.mallOrder.findFirst({where:{id:String(dto.order_id||''),userId},include:{items:true}});
      if(!order||!['received','completed'].includes(order.status))throw new BadRequestException('请确认收货后评价本人订单');
      if(!order.items.some(row=>row.productId===dto.product_id))throw new BadRequestException('评价商品不属于该订单');
      const rating=Number(dto.rating); if(!Number.isInteger(rating)||rating<1||rating>5)throw new BadRequestException('评分应为1至5星');
      if(await tx.mallReview.findFirst({where:{orderId:order.id,userId,productId:String(dto.product_id)}}))throw new BadRequestException('该商品已评价');
      const content=String(dto.content||'').trim();if(content.length>2000)throw new BadRequestException('评价最多2000字');
      const images=Array.isArray(dto.images)?dto.images:[];if(images.length>9||images.some((url:any)=>typeof url!=='string'||!/^https:\/\//.test(url)&&!/^\/(?:api\/)?uploads\//.test(url)))throw new BadRequestException('评价图片格式不正确');
      return tx.mallReview.create({data:{userId,orderId:order.id,merchantId:order.merchantId,productId:String(dto.product_id),rating,content,images,isAnonymous:dto.is_anonymous===true}});
    },{isolationLevel:'Serializable'});
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
    const reason=String(dto.reason||'').trim(),quantity=mallQuantity(dto.refund_quantity??1),amountFen=mallFen(dto.refund_amount);
    if(!reason||reason.length>1000||!amountFen)throw new BadRequestException('请填写有效退款原因和金额');
    if(!['refund_only','return_refund'].includes(dto.refund_type||'refund_only'))throw new BadRequestException('退款类型不正确');
    const priority=await this.membershipService.hasBenefit(userId,'refund_priority').catch(()=>false);
    return this.prisma.$transaction(async tx=>{
      const order=await tx.mallOrder.findFirst({where:{id:String(dto.order_id||''),userId},include:{items:true,refunds:true}});
      if(!order||!['paid','shipped','received','completed'].includes(order.status))throw new BadRequestException('当前订单状态不支持申请退款');
      const item=order.items.find(row=>row.id===dto.order_item_id);if(!item)throw new BadRequestException('退款商品不属于该订单');
      const active=order.refunds.filter(row=>['applying','approved','merchant_approved','processing'].includes(row.status));
      if(active.length)throw new BadRequestException('该订单已有处理中退款申请');
      const completed=order.refunds.filter(row=>row.status==='refunded');
      const lineDone=completed.filter(row=>row.orderItemId===item.id);
      if(quantity+lineDone.reduce((n,row)=>n+row.quantity,0)>item.quantity)throw new BadRequestException('退款数量超过剩余可退数量');
      const remaining=mallFen(order.payAmount)-completed.reduce((n,row)=>n+mallFen(row.amount),0);
      if(amountFen>Math.min(remaining,mallFen(item.price)*quantity))throw new BadRequestException('退款金额超过该商品或订单剩余可退金额');
      await tx.mallOrder.update({where:{id:order.id},data:{refundStatus:'refunding'}});
      return tx.mallRefund.create({data:{orderId:order.id,orderItemId:item.id,refundNo:`REF${Date.now()}${Math.random().toString(36).slice(2,8).toUpperCase()}`,refundType:dto.refund_type||'refund_only',amount:amountFen/100,quantity,reason:priority?`[会员优先] ${reason}`:reason,description:String(dto.description||'').slice(0,2000),images:Array.isArray(dto.images)?dto.images.slice(0,9):[],status:'applying'}});
    },{isolationLevel:'Serializable'});
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

    if (dto.merchant_id && !await this.prisma.mallMerchant.findFirst({where:{id:String(dto.merchant_id),status:'approved',isShow:true,...(region_id?{regionId:String(region_id)}:{})}})) throw new BadRequestException('店铺不属于当前校区或暂不可申请');
    return this.prisma.mallDistributor.create({
      data: {
        userId,
        merchantId: dto.merchant_id || null,
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
    return this.prisma.$transaction(async tx => {
      const row=await tx.mallCart.findFirst({where:{id,userId},include:{product:{include:{skus:true,merchant:true}}}});
      if(!row)throw new NotFoundException('购物车项不存在');
      const data:any={};
      if(dto.quantity!==undefined) { const quantity=mallQuantity(dto.quantity),sku=row.product.skus.find(s=>s.id===row.skuId); if(row.product.status!=='on_sale'||row.product.merchant.status!=='approved'||quantity>row.product.stock||row.product.skus.length&&!sku||sku&&quantity>sku.stock)throw new BadRequestException('商品库存或状态已变化'); data.quantity=quantity; }
      if(dto.is_checked!==undefined) { if(![true,false,0,1].includes(dto.is_checked))throw new BadRequestException('选择状态不正确'); data.selected=dto.is_checked===true||dto.is_checked===1; }
      return tx.mallCart.update({where:{id},data});
    },{isolationLevel:'Serializable'});
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
    return this.prisma.$transaction(async tx=>{
      const refund=await tx.mallRefund.findFirst({where:{id,order:{userId}},include:{order:true}});
      if(!refund)throw new NotFoundException('退款记录不存在');
      if(refund.status!=='applying')throw new BadRequestException('只能取消申请中的退款');
      const updated=await tx.mallRefund.updateMany({where:{id,status:'applying'},data:{status:'closed'}});
      if(updated.count!==1)throw new ConflictException('退款状态已变化');
      const previous=await tx.mallRefund.count({where:{orderId:refund.orderId,status:'refunded'}});
      await tx.mallOrder.update({where:{id:refund.orderId},data:{refundStatus:previous?'partial':'none'}});
      return {id,status:'closed'};
    },{isolationLevel:'Serializable'});
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
    return this.prisma.$transaction(async tx=>{
      const order=await tx.mallOrder.findUnique({where:{id},include:{refunds:true}});
      if(!order)throw new NotFoundException('订单不存在');
      const merchant=await tx.mallMerchant.findFirst({where:{id:order.merchantId,userId,status:{in:['approved','closed']}}});
      if(!merchant)throw new BadRequestException('无权操作该订单');
      if(order.status!=='paid'||!['none','partial'].includes(order.refundStatus)||order.refunds.some(row=>['applying','approved','merchant_approved','processing'].includes(row.status)))throw new BadRequestException('订单未支付或有处理中退款，无法发货');
      const trackingNo=String(dto.express_no||dto.tracking_no||dto.trackingNo||'').trim(),trackingCompany=String(dto.express_company||dto.tracking_company||dto.trackingCompany||'').trim();
      if(!trackingNo||trackingNo.length>100||!trackingCompany||trackingCompany.length>100)throw new BadRequestException('请填写物流公司与单号');
      const changed=await tx.mallOrder.updateMany({where:{id,status:'paid',refundStatus:{in:['none','partial']}},data:{status:'shipped',trackingNo,trackingCompany,deliverTime:new Date()}});
      if(changed.count!==1)throw new ConflictException('订单状态已变化');
      return {id,status:'shipped'};
    },{isolationLevel:'Serializable'});
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
