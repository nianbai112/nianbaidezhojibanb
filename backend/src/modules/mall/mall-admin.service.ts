import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../../common/services/prisma.service";

@Injectable()
export class MallAdminService {
  constructor(private readonly prisma: PrismaService) {}

  // ==================== 操作日志 ====================
  private async logOperation(
    accountId: string | undefined,
    action: string,
    module: string,
    targetId?: string | null,
    targetType?: string,
    detail?: any,
    ip?: string,
  ) {
    if (!accountId) return;
    try {
      await this.prisma.adminOperationLog.create({
        data: {
          accountId,
          action,
          module,
          targetId: targetId || null,
          targetType: targetType || null,
          detail: detail
            ? typeof detail === "string"
              ? { message: detail }
              : detail
            : null,
          ip: ip || null,
        },
      });
    } catch (e: any) {
      // 日志写入失败不影响主流程
    }
  }

  // ==================== 分类管理 ====================

  async getCategories(query: any) {
    const { page = 1, pageSize = 50, keyword, isShow } = query;
    const where: any = {};
    if (keyword) where.name = { contains: keyword };
    if (isShow !== undefined) where.isShow = isShow === "true" || isShow === true;

    const [list, total] = await Promise.all([
      this.prisma.mallCategory.findMany({
        where,
        orderBy: { sortOrder: "asc" },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
      }),
      this.prisma.mallCategory.count({ where }),
    ]);

    return {
      list,
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  async createCategory(dto: any, operatorId?: string, ip?: string) {
    if (!dto.name) throw new BadRequestException("分类名称不能为空");

    const category = await this.prisma.mallCategory.create({
      data: {
        name: dto.name,
        parentId: dto.parentId || null,
        icon: dto.icon,
        sortOrder: dto.sortOrder || 0,
        isShow: dto.isShow !== false,
      },
    });

    await this.logOperation(
      operatorId,
      "create",
      "mall_category",
      category.id,
      "category",
      { name: dto.name },
      ip,
    );

    return { success: true, data: category };
  }

  async updateCategory(
    id: string,
    dto: any,
    operatorId?: string,
    ip?: string,
  ) {
    const category = await this.prisma.mallCategory.findUnique({
      where: { id },
    });
    if (!category) throw new NotFoundException("分类不存在");

    const updated = await this.prisma.mallCategory.update({
      where: { id },
      data: {
        name: dto.name !== undefined ? dto.name : category.name,
        parentId: dto.parentId !== undefined ? dto.parentId : category.parentId,
        icon: dto.icon !== undefined ? dto.icon : category.icon,
        sortOrder: dto.sortOrder !== undefined ? dto.sortOrder : category.sortOrder,
        isShow: dto.isShow !== undefined ? dto.isShow : category.isShow,
      },
    });

    await this.logOperation(
      operatorId,
      "update",
      "mall_category",
      id,
      "category",
      dto,
      ip,
    );

    return { success: true, data: updated };
  }

  async deleteCategory(id: string, operatorId?: string, ip?: string) {
    const category = await this.prisma.mallCategory.findUnique({
      where: { id },
    });
    if (!category) throw new NotFoundException("分类不存在");

    await this.prisma.mallCategory.delete({ where: { id } });

    await this.logOperation(
      operatorId,
      "delete",
      "mall_category",
      id,
      "category",
      { name: category.name },
      ip,
    );

    return { success: true };
  }

  async sortCategories(ids: string[], operatorId?: string, ip?: string) {
    if (!Array.isArray(ids)) throw new BadRequestException("参数格式错误");
    if (ids.length > 500) throw new BadRequestException("分类数量超出限制");
    for (let i = 0; i < ids.length; i++) {
      await this.prisma.mallCategory.update({
        where: { id: ids[i] },
        data: { sortOrder: i },
      });
    }

    await this.logOperation(
      operatorId,
      "sort",
      "mall_category",
      null,
      "category",
      { ids },
      ip,
    );

    return { success: true };
  }

  // ==================== 商品管理 ====================

  async getProducts(query: any) {
    const {
      page = 1,
      pageSize = 20,
      keyword,
      status,
      categoryId,
      merchantId,
      isHot,
      startDate,
      endDate,
    } = query;
    const where: any = {};
    if (keyword) where.name = { contains: keyword };
    if (status) where.status = status;
    if (categoryId) where.categoryId = categoryId;
    if (merchantId) where.merchantId = merchantId;
    if (isHot !== undefined) where.isHot = isHot === "true" || isHot === true;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate + "T23:59:59.999Z");
    }

    const [list, total] = await Promise.all([
      this.prisma.mallProduct.findMany({
        where,
        include: {
          carts: { select: { id: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
      }),
      this.prisma.mallProduct.count({ where }),
    ]);

    return {
      list: list.map((p) => ({
        ...p,
        cartCount: p.carts.length,
        carts: undefined,
      })),
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  async getLowStockProducts(query: any) {
    const { threshold = 10, page = 1, pageSize = 20 } = query;
    const where = { stock: { lte: +threshold }, status: "on_sale" };

    const [list, total] = await Promise.all([
      this.prisma.mallProduct.findMany({
        where,
        orderBy: { stock: "asc" },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
      }),
      this.prisma.mallProduct.count({ where }),
    ]);

    return {
      list,
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  async createProduct(dto: any, operatorId?: string, ip?: string) {
    const name = dto.name || dto.product_name;
    const merchantId = dto.merchantId || dto.merchant_id;
    const categoryId = dto.categoryId || dto.category_id;
    const images = dto.images || dto.product_images || [];
    const mainImage = dto.mainImage || dto.main_image || images?.[0];
    if (!name) throw new BadRequestException("商品名称不能为空");
    if (!merchantId) throw new BadRequestException("商户ID不能为空");

    const product = await this.prisma.mallProduct.create({
      data: {
        merchantId,
        categoryId,
        name,
        subtitle: dto.subtitle || dto.product_subtitle,
        images,
        mainImage,
        detail: dto.detail || dto.description,
        price: dto.price || dto.default_sku?.price || 0,
        originPrice: dto.originPrice || dto.origin_price,
        stock: dto.stock || 0,
        status: dto.status || "on_sale",
        isHot: dto.isHot || false,
        isNew: dto.isNew || dto.is_new || false,
        sortOrder: dto.sortOrder || 0,
        skus: dto.default_sku
          ? {
              create: {
                skuName: dto.default_sku.sku_name || dto.default_sku.skuName || "默认规格",
                price: dto.default_sku.price || dto.price || 0,
                stock: dto.default_sku.stock || dto.stock || 0,
                isDefault: true,
              },
            }
          : undefined,
      },
      include: { skus: true },
    });

    await this.logOperation(
      operatorId,
      "create",
      "mall_product",
      product.id,
      "product",
      { name },
      ip,
    );

    return { success: true, data: product };
  }

  async updateProduct(
    id: string,
    dto: any,
    operatorId?: string,
    ip?: string,
  ) {
    const product = await this.prisma.mallProduct.findUnique({
      where: { id },
    });
    if (!product) throw new NotFoundException("商品不存在");

    const updated = await this.prisma.mallProduct.update({
      where: { id },
      data: {
        categoryId: dto.categoryId !== undefined ? dto.categoryId : dto.category_id !== undefined ? dto.category_id : product.categoryId,
        name: dto.name !== undefined ? dto.name : dto.product_name !== undefined ? dto.product_name : product.name,
        subtitle: dto.subtitle !== undefined ? dto.subtitle : dto.product_subtitle !== undefined ? dto.product_subtitle : product.subtitle,
        images: dto.images !== undefined ? dto.images : dto.product_images !== undefined ? dto.product_images : product.images,
        mainImage: dto.mainImage !== undefined ? dto.mainImage : dto.main_image !== undefined ? dto.main_image : product.mainImage,
        detail: dto.detail !== undefined ? dto.detail : dto.description !== undefined ? dto.description : product.detail,
        price: dto.price !== undefined ? dto.price : product.price,
        originPrice: dto.originPrice !== undefined ? dto.originPrice : dto.origin_price !== undefined ? dto.origin_price : product.originPrice,
        stock: dto.stock !== undefined ? dto.stock : product.stock,
        status: dto.status !== undefined ? dto.status : product.status,
        isHot: dto.isHot !== undefined ? dto.isHot : product.isHot,
        isNew: dto.isNew !== undefined ? dto.isNew : dto.is_new !== undefined ? dto.is_new : product.isNew,
        sortOrder: dto.sortOrder !== undefined ? dto.sortOrder : product.sortOrder,
      },
    });

    await this.logOperation(
      operatorId,
      "update",
      "mall_product",
      id,
      "product",
      dto,
      ip,
    );

    return { success: true, data: updated };
  }

  async deleteProduct(id: string, operatorId?: string, ip?: string) {
    const product = await this.prisma.mallProduct.findUnique({
      where: { id },
    });
    if (!product) throw new NotFoundException("商品不存在");

    await this.prisma.mallProduct.delete({ where: { id } });

    await this.logOperation(
      operatorId,
      "delete",
      "mall_product",
      id,
      "product",
      { name: product.name },
      ip,
    );

    return { success: true };
  }

  async updateProductStatus(
    id: string,
    status: string,
    operatorId?: string,
    ip?: string,
  ) {
    const product = await this.prisma.mallProduct.findUnique({
      where: { id },
    });
    if (!product) throw new NotFoundException("商品不存在");

    const updated = await this.prisma.mallProduct.update({
      where: { id },
      data: { status },
    });

    await this.logOperation(
      operatorId,
      "update_status",
      "mall_product",
      id,
      "product",
      { status },
      ip,
    );

    return { success: true, data: updated };
  }

  // ==================== SKU 管理 ====================

  async getProductSkus(productId: string) {
    const product = await this.prisma.mallProduct.findUnique({
      where: { id: productId },
      include: { skus: true },
    });
    if (!product) throw new NotFoundException("商品不存在");

    return {
      list: product.skus,
      total: product.skus.length,
    };
  }

  async createSku(
    productId: string,
    dto: any,
    operatorId?: string,
    ip?: string,
  ) {
    const product = await this.prisma.mallProduct.findUnique({
      where: { id: productId },
    });
    if (!product) throw new NotFoundException("商品不存在");

    const newSku = await this.prisma.mallProductSku.create({
      data: {
        productId,
        skuName: dto.skuName || dto.sku_name || dto.name || "默认规格",
        price: dto.price || 0,
        stock: dto.stock || 0,
        isDefault: dto.isDefault || dto.is_default || false,
      },
    });

    await this.logOperation(
      operatorId,
      "create_sku",
      "mall_product",
      productId,
      "sku",
      dto,
      ip,
    );

    return { success: true, data: newSku };
  }

  async updateSku(
    skuId: string,
    dto: any,
    operatorId?: string,
    ip?: string,
  ) {
    const sku = await this.prisma.mallProductSku.findUnique({
      where: { id: skuId },
    });
    if (!sku) throw new NotFoundException("SKU不存在");

    const updated = await this.prisma.mallProductSku.update({
      where: { id: skuId },
      data: {
        skuName: dto.skuName !== undefined ? dto.skuName : dto.sku_name !== undefined ? dto.sku_name : sku.skuName,
        price: dto.price !== undefined ? dto.price : sku.price,
        stock: dto.stock !== undefined ? dto.stock : sku.stock,
        isDefault: dto.isDefault !== undefined ? dto.isDefault : dto.is_default !== undefined ? dto.is_default : sku.isDefault,
      },
    });

    await this.logOperation(
      operatorId,
      "update_sku",
      "mall_product",
      sku.productId,
      "sku",
      dto,
      ip,
    );

    return { success: true, data: updated };
  }

  async deleteSku(skuId: string, operatorId?: string, ip?: string) {
    const sku = await this.prisma.mallProductSku.findUnique({
      where: { id: skuId },
    });
    if (!sku) throw new NotFoundException("SKU不存在");

    await this.prisma.mallProductSku.delete({ where: { id: skuId } });

    await this.logOperation(
      operatorId,
      "delete_sku",
      "mall_product",
      sku.productId,
      "sku",
      { skuId },
      ip,
    );

    return { success: true };
  }

  // ==================== 订单管理 ====================

  async getOrders(query: any) {
    const {
      page = 1,
      pageSize = 20,
      keyword,
      status,
      merchantId,
      payStatus,
      startDate,
      endDate,
    } = query;
    const where: any = {};
    if (keyword) {
      where.OR = [
        { orderNo: { contains: keyword } },
        { receiverName: { contains: keyword } },
        { receiverPhone: { contains: keyword } },
      ];
    }
    if (status) where.status = status;
    if (merchantId) where.merchantId = merchantId;
    if (payStatus) where.payStatus = payStatus;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate + "T23:59:59.999Z");
    }

    const [list, total] = await Promise.all([
      this.prisma.mallOrder.findMany({
        where,
        include: {
          User: {
            select: { id: true, nickname: true, avatar: true, phone: true },
          },
          refunds: true,
        },
        orderBy: { createdAt: "desc" },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
      }),
      this.prisma.mallOrder.count({ where }),
    ]);

    return {
      list,
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  async getOrderDetail(id: string) {
    const order = await this.prisma.mallOrder.findUnique({
      where: { id },
      include: {
        User: {
          select: { id: true, nickname: true, avatar: true, phone: true },
        },
        items: true,
        refunds: true,
      },
    });
    if (!order) throw new NotFoundException("订单不存在");
    return order;
  }

  async updateOrderStatus(
    id: string,
    dto: { status: string; reason?: string },
    operatorId?: string,
    ip?: string,
  ) {
    const order = await this.prisma.mallOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundException("订单不存在");

    const updateData: any = { status: dto.status };
    if (dto.status === "cancelled") {
      updateData.cancelTime = new Date();
      updateData.cancelReason = dto.reason;
    }
    if (dto.status === "completed") {
      updateData.completeTime = new Date();
    }

    const updated = await this.prisma.mallOrder.update({
      where: { id },
      data: updateData,
    });

    await this.logOperation(
      operatorId,
      "update_status",
      "mall_order",
      id,
      "order",
      dto,
      ip,
    );

    return { success: true, data: updated };
  }

  async deliverOrder(
    id: string,
    dto: { trackingNo: string; trackingCompany: string; express_no?: string; express_company?: string },
    operatorId?: string,
    ip?: string,
  ) {
    const order = await this.prisma.mallOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundException("订单不存在");

    const updated = await this.prisma.mallOrder.update({
      where: { id },
      data: {
        status: "shipped",
        trackingNo: dto.express_no || dto.trackingNo,
        trackingCompany: dto.express_company || dto.trackingCompany,
        deliverTime: new Date(),
      },
    });

    await this.logOperation(
      operatorId,
      "deliver",
      "mall_order",
      id,
      "order",
      dto,
      ip,
    );

    return { success: true, data: updated };
  }

  async exportOrders(query: any) {
    const {
      keyword,
      status,
      merchantId,
      startDate,
      endDate,
    } = query;
    const where: any = {};
    if (keyword) {
      where.OR = [
        { orderNo: { contains: keyword } },
        { receiverName: { contains: keyword } },
        { receiverPhone: { contains: keyword } },
      ];
    }
    if (status) where.status = status;
    if (merchantId) where.merchantId = merchantId;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate + "T23:59:59.999Z");
    }

    const statusLabels: Record<string, string> = {
      pending_pay: '待付款',
      paid: '已付款',
      shipped: '已发货',
      received: '已收货',
      completed: '已完成',
      cancelled: '已取消',
      refunding: '退款中',
      refunded: '已退款',
    };

    const orders = await this.prisma.mallOrder.findMany({
      where,
      include: {
        User: { select: { nickname: true, phone: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 5000,
    });

    const header = '订单号,用户,收货人,收货电话,收货地址,订单金额,实付金额,状态,快递公司,快递单号,下单时间,支付时间,发货时间';
    const rows = orders.map((o) =>
      [
        o.orderNo,
        o.User?.nickname || '',
        o.receiverName,
        o.receiverPhone,
        `"${(o.receiverAddress || '').replace(/"/g, '""')}"`,
        Number(o.totalAmount),
        Number(o.payAmount),
        statusLabels[o.status] || o.status,
        o.trackingCompany || '',
        o.trackingNo || '',
        o.createdAt?.toISOString() || '',
        o.payTime?.toISOString() || '',
        o.deliverTime?.toISOString() || '',
      ].join(',')
    );

    return { csv: [header, ...rows].join('\n'), count: orders.length };
  }

  // ==================== 退款管理 ====================

  async getRefunds(query: any) {
    const { page = 1, pageSize = 20, keyword, status, startDate, endDate } =
      query;
    const where: any = {};
    if (keyword) {
      where.OR = [
        { refundNo: { contains: keyword } },
        { reason: { contains: keyword } },
      ];
    }
    if (status) where.status = status;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate + "T23:59:59.999Z");
    }

    const [list, total] = await Promise.all([
      this.prisma.mallRefund.findMany({
        where,
        include: {
          order: {
            include: {
              User: {
                select: {
                  id: true,
                  nickname: true,
                  avatar: true,
                  phone: true,
                },
              },
              items: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
      }),
      this.prisma.mallRefund.count({ where }),
    ]);

    return {
      list: list.map((refund) => ({
        ...refund,
        orderNo: refund.order?.orderNo,
        orderItems: refund.order?.items || [],
      })),
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  async getRefundDetail(id: string) {
    const refund = await this.prisma.mallRefund.findUnique({
      where: { id },
      include: {
        order: {
          include: {
            User: {
              select: { id: true, nickname: true, avatar: true, phone: true },
            },
            items: true,
          },
        },
      },
    });
    if (!refund) throw new NotFoundException("退款记录不存在");
    return {
      ...refund,
      orderNo: refund.order?.orderNo,
      orderItems: refund.order?.items || [],
    };
  }

  async reviewRefund(
    id: string,
    dto: { approved?: boolean; status?: string; reason?: string; reject_reason?: string; merchant_reply?: string },
    operatorId?: string,
    ip?: string,
  ) {
    const refund = await this.prisma.mallRefund.findUnique({
      where: { id },
    });
    if (!refund) throw new NotFoundException("退款记录不存在");

    const status = dto.status || "";
    const approved = dto.approved !== undefined
      ? dto.approved
      : status === "approved" || status === "merchant_approved";
    const rejected = status === "rejected" || status === "merchant_rejected";

    const updated = await this.prisma.mallRefund.update({
      where: { id },
      data: {
        status: approved ? "approved" : rejected ? "rejected" : status || refund.status,
        merchantReply: dto.merchant_reply || (approved ? (dto.reason || null) : undefined),
        rejectReason: rejected ? (dto.reason || dto.reject_reason || "商家拒绝退款") : undefined,
        merchantReplyTime: new Date(),
      },
    });

    if (approved) {
      await this.prisma.mallOrder.update({
        where: { id: refund.orderId },
        data: { refundStatus: "refunding" },
      });
    }

    await this.logOperation(
      operatorId,
      "review_refund",
      "mall_refund",
      id,
      "refund",
      dto,
      ip,
    );

    return { success: true, data: updated };
  }

  async finishRefund(
    id: string,
    dto: { transferNo?: string },
    operatorId?: string,
    ip?: string,
  ) {
    const refund = await this.prisma.mallRefund.findUnique({
      where: { id },
    });
    if (!refund) throw new NotFoundException("退款记录不存在");

    const updated = await this.prisma.mallRefund.update({
      where: { id },
      data: { status: "refunded", refundTime: new Date() },
    });

    // 更新订单退款状态
    await this.prisma.mallOrder.update({
      where: { id: refund.orderId },
      data: { refundStatus: "refunded" },
    });

    await this.logOperation(
      operatorId,
      "finish_refund",
      "mall_refund",
      id,
      "refund",
      dto,
      ip,
    );

    return { success: true, data: updated };
  }

  async rejectRefund(
    id: string,
    dto: { reason: string },
    operatorId?: string,
    ip?: string,
  ) {
    const refund = await this.prisma.mallRefund.findUnique({
      where: { id },
    });
    if (!refund) throw new NotFoundException("退款记录不存在");

    const updated = await this.prisma.mallRefund.update({
      where: { id },
      data: {
        status: "rejected",
        rejectReason: dto.reason || "商家拒绝退款",
        merchantReplyTime: new Date(),
      },
    });

    await this.logOperation(
      operatorId,
      "reject_refund",
      "mall_refund",
      id,
      "refund",
      dto,
      ip,
    );

    return { success: true, data: updated };
  }

  // ==================== 评价管理 ====================

  async getReviews(query: any) {
    const {
      page = 1,
      pageSize = 20,
      keyword,
      status,
      rating,
      productId,
      merchantId,
      startDate,
      endDate,
    } = query;
    const where: any = {};
    if (keyword) where.content = { contains: keyword };
    if (status) where.status = status;
    if (rating) where.rating = +rating;
    if (productId) where.productId = productId;
    if (merchantId) where.merchantId = merchantId;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate + "T23:59:59.999Z");
    }

    const [list, total] = await Promise.all([
      this.prisma.mallReview.findMany({
        where,
        include: {
          User: {
            select: { id: true, nickname: true, avatar: true, phone: true },
          },
          product: {
            select: { id: true, name: true, mainImage: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
      }),
      this.prisma.mallReview.count({ where }),
    ]);

    return {
      list: list.map((review) => ({
        ...review,
        userName: review.isAnonymous ? "匿名用户" : review.User?.nickname || "用户",
        userAvatar: review.isAnonymous ? "" : review.User?.avatar || "",
        productName: review.product?.name || "未知商品",
        productImage: review.product?.mainImage || "",
        merchant_reply: review.reply,
      })),
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  async replyReview(
    id: string,
    dto: { reply?: string; merchant_reply?: string },
    operatorId?: string,
    ip?: string,
  ) {
    const review = await this.prisma.mallReview.findUnique({
      where: { id },
    });
    if (!review) throw new NotFoundException("评价不存在");

    const updated = await this.prisma.mallReview.update({
      where: { id },
      data: {
        reply: dto.merchant_reply || dto.reply,
        replyAt: new Date(),
      },
    });

    await this.logOperation(
      operatorId,
      "reply_review",
      "mall_review",
      id,
      "review",
      dto,
      ip,
    );

    return { success: true, data: updated };
  }

  async setReviewVisibility(
    id: string,
    visible: boolean,
    operatorId?: string,
    ip?: string,
  ) {
    const review = await this.prisma.mallReview.findUnique({
      where: { id },
    });
    if (!review) throw new NotFoundException("评价不存在");

    const newStatus = visible ? "active" : "hidden";
    const updated = await this.prisma.mallReview.update({
      where: { id },
      data: { status: newStatus },
    });

    await this.logOperation(
      operatorId,
      "set_visibility",
      "mall_review",
      id,
      "review",
      { visible },
      ip,
    );

    return { success: true, data: updated };
  }

  // ==================== 分销管理 ====================

  async getDistributors(query: any) {
    const { page = 1, pageSize = 20, keyword, status, startDate, endDate } =
      query;
    const where: any = {};
    if (keyword) {
      where.OR = [
        { realName: { contains: keyword } },
        { phone: { contains: keyword } },
      ];
    }
    if (status) where.status = status;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate + "T23:59:59.999Z");
    }

    const [list, total] = await Promise.all([
      this.prisma.mallDistributor.findMany({
        where,
        include: {
          User: {
            select: { id: true, nickname: true, avatar: true, phone: true },
          },
          level: true,
        },
        orderBy: { createdAt: "desc" },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
      }),
      this.prisma.mallDistributor.count({ where }),
    ]);

    return {
      list,
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  async getDistributorDetail(id: string) {
    const distributor = await this.prisma.mallDistributor.findUnique({
      where: { id },
      include: {
        User: {
          select: { id: true, nickname: true, avatar: true, phone: true },
        },
        level: true,
        commissions: true,
        withdrawals: true,
      },
    });
    if (!distributor) throw new NotFoundException("分销员不存在");
    return distributor;
  }

  async reviewDistributor(
    id: string,
    dto: { approved?: boolean; status?: string; reason?: string; remark?: string; review_note?: string },
    operatorId?: string,
    ip?: string,
  ) {
    const distributor = await this.prisma.mallDistributor.findUnique({
      where: { id },
    });
    if (!distributor) throw new NotFoundException("分销员不存在");

    const status = dto.status || "";
    const approved = dto.approved !== undefined ? dto.approved : status === "approved";
    const updated = await this.prisma.mallDistributor.update({
      where: { id },
      data: {
        status: approved ? "approved" : status === "rejected" ? "rejected" : status || distributor.status,
        remark: dto.review_note || dto.reason || dto.remark,
      },
    });

    await this.logOperation(
      operatorId,
      "review_distributor",
      "mall_distributor",
      id,
      "distributor",
      dto,
      ip,
    );

    return { success: true, data: updated };
  }

  async updateDistributorStatus(
    id: string,
    status: string,
    operatorId?: string,
    ip?: string,
  ) {
    const distributor = await this.prisma.mallDistributor.findUnique({
      where: { id },
    });
    if (!distributor) throw new NotFoundException("分销员不存在");

    const updated = await this.prisma.mallDistributor.update({
      where: { id },
      data: { status },
    });

    await this.logOperation(
      operatorId,
      "update_status",
      "mall_distributor",
      id,
      "distributor",
      { status },
      ip,
    );

    return { success: true, data: updated };
  }

  async getCommissionRecords(query: any) {
    const { page = 1, pageSize = 20, distributorId, status, startDate, endDate } =
      query;
    const where: any = {};
    if (distributorId) where.distributorId = distributorId;
    if (status) where.status = status;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate + "T23:59:59.999Z");
    }

    const [list, total] = await Promise.all([
      this.prisma.distributorCommission.findMany({
        where,
        include: {
          distributor: {
            include: {
              User: {
                select: {
                  id: true,
                  nickname: true,
                  avatar: true,
                  phone: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
      }),
      this.prisma.distributorCommission.count({ where }),
    ]);

    return {
      list,
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  // ==================== 促销管理 ====================

  async getPromotions(query: any) {
    const { page = 1, pageSize = 20, keyword, status, merchantId } = query;
    const where: any = {};
    if (keyword) where.name = { contains: keyword };
    if (status) where.status = status;
    if (merchantId) where.merchantId = merchantId;

    const [list, total] = await Promise.all([
      this.prisma.mallPromotion.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
      }),
      this.prisma.mallPromotion.count({ where }),
    ]);

    return { list, total, page: +page, pageSize: +pageSize };
  }

  async getPromotionDetail(id: string) {
    const promotion = await this.prisma.mallPromotion.findUnique({ where: { id } });
    if (!promotion) throw new NotFoundException("促销活动不存在");
    return promotion;
  }

  async createPromotion(dto: any, operatorId?: string, ip?: string) {
    if (!dto.name) throw new BadRequestException("活动名称不能为空");
    if (!dto.type) throw new BadRequestException("活动类型不能为空");
    if (!dto.startAt) throw new BadRequestException("开始时间不能为空");
    if (!dto.endAt) throw new BadRequestException("结束时间不能为空");

    const promotion = await this.prisma.mallPromotion.create({
      data: {
        name: dto.name,
        type: dto.type,
        rules: dto.rules || {},
        startAt: new Date(dto.startAt),
        endAt: new Date(dto.endAt),
        merchantId: dto.merchantId || null,
        status: dto.status || "active",
      },
    });

    await this.logOperation(operatorId, "create", "mall_promotion", promotion.id, "promotion", { name: dto.name }, ip);
    return { success: true, data: promotion };
  }

  async updatePromotion(id: string, dto: any, operatorId?: string, ip?: string) {
    const promotion = await this.prisma.mallPromotion.findUnique({ where: { id } });
    if (!promotion) throw new NotFoundException("促销活动不存在");

    const updated = await this.prisma.mallPromotion.update({
      where: { id },
      data: {
        name: dto.name !== undefined ? dto.name : promotion.name,
        type: dto.type !== undefined ? dto.type : promotion.type,
        rules: dto.rules !== undefined ? dto.rules : promotion.rules,
        startAt: dto.startAt ? new Date(dto.startAt) : promotion.startAt,
        endAt: dto.endAt ? new Date(dto.endAt) : promotion.endAt,
        status: dto.status !== undefined ? dto.status : promotion.status,
      },
    });

    await this.logOperation(operatorId, "update", "mall_promotion", id, "promotion", dto, ip);
    return { success: true, data: updated };
  }

  async deletePromotion(id: string, operatorId?: string, ip?: string) {
    const promotion = await this.prisma.mallPromotion.findUnique({ where: { id } });
    if (!promotion) throw new NotFoundException("促销活动不存在");

    await this.prisma.mallPromotion.delete({ where: { id } });
    await this.logOperation(operatorId, "delete", "mall_promotion", id, "promotion", { name: promotion.name }, ip);
    return { success: true };
  }

  // ==================== 商户审核 ====================

  async reviewMerchant(id: string, dto: { status: string; rejectReason?: string }, operatorId?: string, ip?: string) {
    const merchant = await this.prisma.mallMerchant.findUnique({ where: { id } });
    if (!merchant) throw new NotFoundException("商户不存在");

    const updated = await this.prisma.mallMerchant.update({
      where: { id },
      data: {
        status: dto.status,
        rejectReason: dto.status === "rejected" ? (dto.rejectReason || "审核未通过") : null,
      },
    });

    await this.logOperation(operatorId, "review", "mall_merchant", id, "merchant", dto, ip);
    return { success: true, data: updated };
  }

  async createMerchantCircle(id: string, dto: any, operatorId?: string, ip?: string) {
    const merchant = await this.prisma.mallMerchant.findUnique({ where: { id } });
    if (!merchant) throw new NotFoundException("商户不存在");

    const circle = await this.prisma.circle.create({
      data: {
        name: merchant.name,
        icon: merchant.logo,
        cover: merchant.cover,
        description: merchant.description || `${merchant.name} 的圈子`,
        regionId: merchant.regionId,
        joinType: "OPEN",
        status: "active",
      },
    });

    if (dto.sync_create_checkin_location) {
      await this.prisma.punchInLocation.create({
        data: {
          name: merchant.name,
          address: merchant.address,
          latitude: merchant.latitude,
          longitude: merchant.longitude,
          regionId: merchant.regionId || "",
          status: "PUBLISHED",
        },
      });
    }

    await this.logOperation(operatorId, "create_circle", "mall_merchant", id, "merchant", { circleId: circle.id }, ip);

    return { success: true, data: circle };
  }

  // ==================== 商城概览 ====================

  async getOverview() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [
      totalProducts,
      totalOrders,
      totalMerchants,
      todayOrders,
      todayGMV,
      pendingShip,
      pendingRefund,
      lowStock,
    ] = await Promise.all([
      this.prisma.mallProduct.count(),
      this.prisma.mallOrder.count(),
      this.prisma.mallMerchant.count({ where: { status: "approved" } }),
      this.prisma.mallOrder.count({ where: { createdAt: { gte: today, lt: tomorrow } } }),
      this.prisma.mallOrder.aggregate({
        where: { createdAt: { gte: today, lt: tomorrow }, status: { not: "cancelled" } },
        _sum: { payAmount: true },
      }),
      this.prisma.mallOrder.count({ where: { status: "paid" } }),
      this.prisma.mallRefund.count({ where: { status: "applying" } }),
      this.prisma.mallProduct.count({ where: { stock: { lte: 10 }, status: "on_sale" } }),
    ]);

    const recentOrders = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);

      const [count, amount] = await Promise.all([
        this.prisma.mallOrder.count({
          where: { createdAt: { gte: date, lt: nextDate } },
        }),
        this.prisma.mallOrder.aggregate({
          where: { createdAt: { gte: date, lt: nextDate }, status: { not: "cancelled" } },
          _sum: { payAmount: true },
        }),
      ]);

      recentOrders.push({
        date: `${date.getMonth() + 1}/${date.getDate()}`,
        count,
        amount: Number(amount._sum.payAmount || 0),
      });
    }

    const hotProducts = await this.prisma.mallProduct.findMany({
      where: { status: "on_sale" },
      orderBy: { saleCount: "desc" },
      take: 10,
      select: { id: true, name: true, saleCount: true, price: true },
    });

    return {
      totalProducts,
      totalOrders,
      totalMerchants,
      todayOrders,
      todayGMV: Number(todayGMV._sum.payAmount || 0),
      pendingShip,
      pendingRefund,
      lowStock,
      recentOrders,
      hotProducts,
    };
  }

  // ==================== 运费模板 ====================

  async getFreightTemplates(query: any) {
    const { page = 1, pageSize = 20, merchantId } = query;
    const where: any = {};
    if (merchantId) where.merchantId = merchantId;

    const [list, total] = await Promise.all([
      this.prisma.mallFreightTemplate.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
      }),
      this.prisma.mallFreightTemplate.count({ where }),
    ]);

    return {
      list,
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  async createFreightTemplate(dto: any, operatorId?: string, ip?: string) {
    if (!dto.name) throw new BadRequestException("模板名称不能为空");
    if (!dto.merchantId) throw new BadRequestException("商户ID不能为空");

    // Build rules from detailed fields or use provided rules
    const rules = dto.rules || {
      chargingType: dto.chargingType || 'piece',
      defaultFirstUnit: dto.defaultFirstUnit || 1,
      defaultFirstFee: dto.defaultFirstFee || 0,
      defaultContinueUnit: dto.defaultContinueUnit || 1,
      defaultContinueFee: dto.defaultContinueFee || 0,
      freeFreightAmount: dto.freeFreightAmount || 0,
    };

    // If setting as default, unset other defaults for same merchant
    if (dto.isDefault) {
      await this.prisma.mallFreightTemplate.updateMany({
        where: { merchantId: dto.merchantId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const template = await this.prisma.mallFreightTemplate.create({
      data: {
        merchantId: dto.merchantId,
        name: dto.name,
        rules,
        isDefault: dto.isDefault || false,
      },
    });

    await this.logOperation(
      operatorId,
      "create",
      "mall_freight_template",
      template.id,
      "freight_template",
      { name: dto.name },
      ip,
    );

    return { success: true, data: template };
  }

  async updateFreightTemplate(
    id: string,
    dto: any,
    operatorId?: string,
    ip?: string,
  ) {
    const template = await this.prisma.mallFreightTemplate.findUnique({
      where: { id },
    });
    if (!template) throw new NotFoundException("运费模板不存在");

    // Build rules from detailed fields if provided, otherwise use existing
    let rules = dto.rules;
    if (!rules && (dto.chargingType || dto.defaultFirstUnit !== undefined)) {
      const existingRules = (template.rules as any) || {};
      rules = {
        chargingType: dto.chargingType || existingRules.chargingType || 'piece',
        defaultFirstUnit: dto.defaultFirstUnit !== undefined ? dto.defaultFirstUnit : existingRules.defaultFirstUnit || 1,
        defaultFirstFee: dto.defaultFirstFee !== undefined ? dto.defaultFirstFee : existingRules.defaultFirstFee || 0,
        defaultContinueUnit: dto.defaultContinueUnit !== undefined ? dto.defaultContinueUnit : existingRules.defaultContinueUnit || 1,
        defaultContinueFee: dto.defaultContinueFee !== undefined ? dto.defaultContinueFee : existingRules.defaultContinueFee || 0,
        freeFreightAmount: dto.freeFreightAmount !== undefined ? dto.freeFreightAmount : existingRules.freeFreightAmount || 0,
      };
    }

    // If setting as default, unset other defaults for same merchant
    if (dto.isDefault && !template.isDefault) {
      await this.prisma.mallFreightTemplate.updateMany({
        where: { merchantId: template.merchantId, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }

    const updated = await this.prisma.mallFreightTemplate.update({
      where: { id },
      data: {
        name: dto.name !== undefined ? dto.name : template.name,
        rules: rules !== undefined ? rules : template.rules,
        isDefault: dto.isDefault !== undefined ? dto.isDefault : template.isDefault,
      },
    });

    await this.logOperation(
      operatorId,
      "update",
      "mall_freight_template",
      id,
      "freight_template",
      dto,
      ip,
    );

    return { success: true, data: updated };
  }

  async deleteFreightTemplate(id: string, operatorId?: string, ip?: string) {
    const template = await this.prisma.mallFreightTemplate.findUnique({
      where: { id },
    });
    if (!template) throw new NotFoundException("运费模板不存在");

    await this.prisma.mallFreightTemplate.delete({ where: { id } });

    await this.logOperation(
      operatorId,
      "delete",
      "mall_freight_template",
      id,
      "freight_template",
      { name: template.name },
      ip,
    );

    return { success: true };
  }

  // ==================== 商户统计 ====================

  async getMerchants(query: any) {
    const { page = 1, pageSize = 20, keyword, status, regionId, region_id } =
      query;
    const where: any = {};
    if (keyword) {
      where.OR = [
        { name: { contains: keyword } },
        { phone: { contains: keyword } },
        { address: { contains: keyword } },
      ];
    }
    if (status) where.status = status;
    if (regionId || region_id) where.regionId = regionId || region_id;

    const [list, total] = await Promise.all([
      this.prisma.mallMerchant.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
      }),
      this.prisma.mallMerchant.count({ where }),
    ]);

    return {
      list,
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  async getMerchantDetail(id: string) {
    const merchant = await this.prisma.mallMerchant.findUnique({
      where: { id },
    });
    if (!merchant) throw new NotFoundException("商户不存在");
    return merchant;
  }

  async updateMerchant(
    id: string,
    dto: any,
    operatorId?: string,
    ip?: string,
  ) {
    const merchant = await this.prisma.mallMerchant.findUnique({
      where: { id },
    });
    if (!merchant) throw new NotFoundException("商户不存在");

    const updated = await this.prisma.mallMerchant.update({
      where: { id },
      data: {
        name: dto.name !== undefined ? dto.name : dto.merchant_name !== undefined ? dto.merchant_name : merchant.name,
        logo: dto.logo !== undefined ? dto.logo : dto.merchant_logo !== undefined ? dto.merchant_logo : merchant.logo,
        cover: dto.cover !== undefined ? dto.cover : dto.merchant_cover !== undefined ? dto.merchant_cover : merchant.cover,
        phone: dto.phone !== undefined ? dto.phone : dto.contact_phone !== undefined ? dto.contact_phone : merchant.phone,
        address: dto.address !== undefined ? dto.address : dto.contact_address !== undefined ? dto.contact_address : merchant.address,
        latitude: dto.latitude !== undefined ? Number(dto.latitude) : merchant.latitude,
        longitude: dto.longitude !== undefined ? Number(dto.longitude) : merchant.longitude,
        businessHours: dto.businessHours !== undefined ? dto.businessHours : dto.business_hours !== undefined ? dto.business_hours : merchant.businessHours,
        description: dto.description !== undefined ? dto.description : merchant.description,
        status: dto.status !== undefined ? dto.status : merchant.status,
        rejectReason: dto.rejectReason !== undefined ? dto.rejectReason : dto.reject_reason !== undefined ? dto.reject_reason : merchant.rejectReason,
        isShow: dto.isShow !== undefined ? dto.isShow : dto.is_show !== undefined ? dto.is_show : merchant.isShow,
      },
    });

    await this.logOperation(
      operatorId,
      "update",
      "mall_merchant",
      id,
      "merchant",
      dto,
      ip,
    );

    return { success: true, data: updated };
  }

  async getMerchantStats(id: string) {
    const merchant = await this.prisma.mallMerchant.findUnique({
      where: { id },
    });
    if (!merchant) throw new NotFoundException("商户不存在");

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [
      totalProducts,
      onSaleProducts,
      totalOrders,
      totalSales,
      reviewCount,
      avgRating,
      todayOrders,
      todaySales,
      pendingShip,
      pendingRefund,
    ] = await Promise.all([
      this.prisma.mallProduct.count({ where: { merchantId: id } }),
      this.prisma.mallProduct.count({ where: { merchantId: id, status: "on_sale" } }),
      this.prisma.mallOrder.count({ where: { merchantId: id } }),
      this.prisma.mallOrder.aggregate({
        where: { merchantId: id, status: "completed" },
        _sum: { payAmount: true },
      }),
      this.prisma.mallReview.count({ where: { merchantId: id } }),
      this.prisma.mallReview.aggregate({
        where: { merchantId: id },
        _avg: { rating: true },
      }),
      this.prisma.mallOrder.count({
        where: { merchantId: id, createdAt: { gte: today, lt: tomorrow } },
      }),
      this.prisma.mallOrder.aggregate({
        where: { merchantId: id, createdAt: { gte: today, lt: tomorrow }, status: { not: "cancelled" } },
        _sum: { payAmount: true },
      }),
      this.prisma.mallOrder.count({ where: { merchantId: id, status: "paid" } }),
      this.prisma.mallRefund.count({
        where: { order: { merchantId: id }, status: "applying" },
      }),
    ]);

    return {
      products: {
        total_products: totalProducts,
        on_sale_products: onSaleProducts,
      },
      orders: {
        total_orders: totalOrders,
        total_amount: Number(totalSales._sum.payAmount || 0).toFixed(2),
      },
      reviewCount,
      avgRating: Number(avgRating._avg.rating || 0),
      todayOrders,
      todaySales: Number(todaySales._sum.payAmount || 0),
      pendingShip,
      pendingRefund,
    };
  }

  async getMerchantCirclesAndLocations(id: string) {
    const merchant = await this.prisma.mallMerchant.findUnique({
      where: { id },
    });
    if (!merchant) throw new NotFoundException("商户不存在");

    const circles = await this.prisma.circle.findMany({
      where: {
        name: { contains: merchant.name },
        ...(merchant.regionId ? { regionId: merchant.regionId } : {}),
      },
      take: 10,
    });

    const checkInLocations = await this.prisma.punchInLocation.findMany({
      where: {
        name: { contains: merchant.name },
      },
      take: 10,
    });

    return {
      circles: circles.map((c) => ({
        id: c.id,
        name: c.name,
        logo: c.icon || "",
        audit_status: c.status === "active" ? "approved" : c.status,
        check_in_location: checkInLocations.find((l) => l.name.includes(c.name))
          ? { title: checkInLocations.find((l) => l.name.includes(c.name))!.name }
          : null,
      })),
      check_in_locations: checkInLocations.map((l) => ({
        id: l.id,
        title: l.name,
        address: l.address,
        latitude: l.latitude,
        longitude: l.longitude,
      })),
    };
  }

  // ==================== 客服管理 ====================

  async getServiceStaffList(query: any) {
    const { page = 1, pageSize = 20, keyword, merchantId, regionId, status } = query;
    const where: any = {};
    if (keyword) {
      where.OR = [
        { nickname: { contains: keyword } },
        { phone: { contains: keyword } },
        { wechat: { contains: keyword } },
      ];
    }
    if (merchantId) where.merchantId = merchantId;
    if (regionId) where.regionId = regionId;
    if (status) where.status = status;

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

  async createServiceStaff(dto: any, operatorId?: string, ip?: string) {
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
    if (operatorId) await this.logOperation(operatorId, "CREATE", "mall_service_staff", staff.id, "mall_service_staff", { nickname }, ip);
    return { success: true, data: staff };
  }

  async updateServiceStaff(id: string, dto: any, operatorId?: string, ip?: string) {
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
    if (operatorId) await this.logOperation(operatorId, "UPDATE", "mall_service_staff", id, "mall_service_staff", { nickname: updated.nickname }, ip);
    return { success: true, data: updated };
  }

  async deleteServiceStaff(id: string, operatorId?: string, ip?: string) {
    const staff = await this.prisma.mallServiceStaff.findUnique({ where: { id } });
    if (!staff) throw new NotFoundException("客服不存在");
    await this.prisma.mallServiceStaff.delete({ where: { id } });
    if (operatorId) await this.logOperation(operatorId, "DELETE", "mall_service_staff", id, "mall_service_staff", { nickname: staff.nickname }, ip);
    return { success: true, message: "客服已删除" };
  }

  async updateServiceStaffStatus(id: string, status: string, operatorId?: string, ip?: string) {
    const staff = await this.prisma.mallServiceStaff.findUnique({ where: { id } });
    if (!staff) throw new NotFoundException("客服不存在");
    const updated = await this.prisma.mallServiceStaff.update({
      where: { id },
      data: { status },
    });
    if (operatorId) await this.logOperation(operatorId, "UPDATE_STATUS", "mall_service_staff", id, "mall_service_staff", { status }, ip);
    return { success: true, data: updated };
  }
}
