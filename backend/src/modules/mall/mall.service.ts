import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../../common/services/prisma.service";

@Injectable()
export class MallService {
  constructor(private readonly prisma: PrismaService) {}

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
    if (keyword) where.name = { contains: keyword, mode: "insensitive" };

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

      // 创建订单
      const orderNo = `MALL${Date.now()}${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
      const freightAmount = dto.freight_amount || 0;
      const discountAmount = dto.discount_amount || 0;
      const payAmount = productAmount + Number(freightAmount) - Number(discountAmount);

      const order = await tx.mallOrder.create({
        data: {
          orderNo,
          userId,
          merchantId: merchant_id,
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
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.mallOrder.findUnique({ where: { id } });
      if (!order) throw new NotFoundException("订单不存在");
      if (order.userId !== userId)
        throw new BadRequestException("无权操作该订单");
      if (order.status !== "pending_pay")
        throw new BadRequestException(`订单状态为 ${order.status}，无法支付`);

      return tx.mallOrder.update({
        where: { id },
        data: {
          status: "paid",
          payTime: new Date(),
          payChannel: dto?.payment_method || "balance",
        },
      });
    });
  }

  async cancelOrder(id: string, userId: string, dto?: any) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.mallOrder.findUnique({
        where: { id },
        include: { items: true },
      });
      if (!order) throw new NotFoundException("订单不存在");
      if (order.userId !== userId)
        throw new BadRequestException("无权操作该订单");
      const cancellableStatuses = ["pending_pay", "paid"];
      if (!cancellableStatuses.includes(order.status))
        throw new BadRequestException(`订单状态为 ${order.status}，无法取消`);

      // 恢复库存
      for (const item of order.items) {
        await tx.mallProduct.update({
          where: { id: item.productId },
          data: {
            stock: { increment: item.quantity },
            saleCount: { decrement: item.quantity },
          },
        });
      }

      return tx.mallOrder.update({
        where: { id },
        data: {
          status: "cancelled",
          cancelTime: new Date(),
          cancelReason: dto?.cancel_reason || "用户取消",
        },
      });
    });
  }

  async addFavorite(userId: string, dto: any) {
    const { product_id } = dto;
    if (!product_id) throw new BadRequestException("product_id 必填");

    // 校验商品存在性
    const product = await this.prisma.mallProduct.findUnique({
      where: { id: product_id },
    });
    if (!product) throw new NotFoundException("商品不存在");

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
    if (!reason) throw new BadRequestException("退款原因必填");
    if (!refund_amount) throw new BadRequestException("退款金额必填");

    // 校验订单存在性和所有权
    const order = await this.prisma.mallOrder.findUnique({
      where: { id: order_id },
    });
    if (!order) throw new NotFoundException("订单不存在");
    if (order.userId !== userId) throw new BadRequestException("无权操作该订单");

    const refundNo = `REF${Date.now()}${Math.random().toString(36).substr(2, 4).toUpperCase()}`;

    return this.prisma.mallRefund.create({
      data: {
        orderId: order_id,
        orderItemId: order_item_id,
        refundNo,
        refundType: refund_type,
        amount: refund_amount,
        quantity: refund_quantity,
        reason,
        description,
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

    if (targetStatus === "received") {
      return this.receiveOrder(id, userId);
    }

    const order = await this.prisma.mallOrder.findUnique({
      where: { id },
    });
    if (!order) throw new NotFoundException("订单不存在");
    if (order.userId !== userId) throw new BadRequestException("无权操作该订单");

    return this.prisma.mallOrder.update({
      where: { id },
      data: {
        status: targetStatus,
        completeTime: targetStatus === "completed" ? new Date() : undefined,
      },
    });
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
