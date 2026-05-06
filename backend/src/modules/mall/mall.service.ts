import {
  Injectable,
  NotFoundException,
  BadRequestException,
  NotImplementedException,
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

  async getProducts(query: any) {
    const { page = 1, limit = 20, category_id, keyword } = query;
    const where: any = { status: "on_sale" };
    if (category_id) where.categoryId = category_id;
    if (keyword) where.name = { contains: keyword };
    return this.prisma.mallProduct.findMany({
      where,
      skip: (page - 1) * limit,
      take: Number(limit),
      orderBy: { createdAt: "desc" },
    });
  }

  async getProductDetail(id: string) {
    const product = await this.prisma.mallProduct.findUnique({ where: { id } });
    if (!product) throw new NotFoundException("商品不存在");
    return product;
  }

  async getMerchants(query: any) {
    const { page = 1, limit = 20 } = query;
    return this.prisma.mallMerchant.findMany({
      where: { status: "approved" },
      skip: (page - 1) * limit,
      take: Number(limit),
      orderBy: { createdAt: "desc" },
    });
  }

  async getMerchantDetail(id: string) {
    const merchant = await this.prisma.mallMerchant.findUnique({
      where: { id },
    });
    if (!merchant) throw new NotFoundException("商家不存在");
    return merchant;
  }

  async addToCart(userId: string, dto: any) {
    return this.prisma.mallCart.upsert({
      where: {
        userId_productId_skuId: {
          userId,
          productId: dto.product_id,
          skuId: dto.sku_id || null,
        },
      },
      create: {
        userId,
        productId: dto.product_id,
        skuId: dto.sku_id,
        quantity: dto.quantity || 1,
      },
      update: { quantity: { increment: dto.quantity || 1 } },
    });
  }

  async getCart(userId: string) {
    return this.prisma.mallCart.findMany({
      where: { userId },
      include: { product: true },
    });
  }

  async removeCartItem(id: string, userId: string) {
    await this.prisma.mallCart.deleteMany({ where: { id, userId } });
    return { success: true };
  }

  async submitOrder(userId: string, dto: any) {
    const orderNo = `MALL${Date.now()}`;
    return this.prisma.mallOrder.create({
      data: {
        orderNo,
        userId,
        merchantId: dto.merchant_id,
        totalAmount: dto.total_amount,
        payAmount: dto.pay_amount,
        receiverName: dto.receiver_name,
        receiverPhone: dto.receiver_phone,
        receiverAddress: dto.receiver_address,
      },
    });
  }

  async getMyOrders(userId: string, query: any) {
    const { page = 1, limit = 20, status } = query;
    const where: any = { userId };
    if (status) where.status = status;
    return this.prisma.mallOrder.findMany({
      where,
      skip: (page - 1) * limit,
      take: Number(limit),
      orderBy: { createdAt: "desc" },
    });
  }

  async getOrderDetail(id: string, userId: string) {
    const order = await this.prisma.mallOrder.findUnique({ where: { id } });
    if (!order || order.userId !== userId)
      throw new NotFoundException("订单不存在");
    return order;
  }

  async payOrder(id: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.mallOrder.findUnique({ where: { id } });
      if (!order) throw new NotFoundException("订单不存在");
      if (order.userId !== userId)
        throw new BadRequestException("无权操作该订单");
      if (order.status !== "pending_pay")
        throw new BadRequestException(`订单状态为 ${order.status}，无法支付`);
      return tx.mallOrder.update({
        where: { id },
        data: { status: "paid", payTime: new Date() },
      });
    });
  }

  async cancelOrder(id: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.mallOrder.findUnique({ where: { id } });
      if (!order) throw new NotFoundException("订单不存在");
      if (order.userId !== userId)
        throw new BadRequestException("无权操作该订单");
      const cancellableStatuses = ["pending_pay", "pending"];
      if (!cancellableStatuses.includes(order.status))
        throw new BadRequestException(`订单状态为 ${order.status}，无法取消`);
      return tx.mallOrder.update({
        where: { id },
        data: { status: "cancelled", cancelTime: new Date() },
      });
    });
  }

  async addFavorite(userId: string, dto: any) {
    const { product_id } = dto;
    if (!product_id) throw new BadRequestException("product_id 必填");
    const existing = await this.prisma.favorite.findFirst({
      where: { userId, targetType: "product", targetId: product_id },
    });
    if (existing) throw new BadRequestException("已收藏该商品");
    return this.prisma.favorite.create({
      data: { userId, targetType: "product", targetId: product_id },
    });
  }

  async getFavorites(userId: string, query: any) {
    const { page = 1, limit = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.favorite.findMany({
        where: { userId, targetType: "product" },
        skip: (page - 1) * limit,
        take: Number(limit),
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.favorite.count({ where: { userId, targetType: "product" } }),
    ]);
    const products = await this.prisma.product.findMany({
      where: { id: { in: list.map((item) => item.targetId) } },
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
      page,
      limit,
    };
  }

  async removeFavorite(productId: string, userId: string) {
    const favorite = await this.prisma.favorite.findFirst({
      where: { userId, targetType: "product", targetId: productId },
    });
    if (!favorite) throw new NotFoundException("收藏记录不存在");
    await this.prisma.favorite.delete({ where: { id: favorite.id } });
    return { success: true };
  }

  async getAvailablePromotions(query: any) {
    return this.prisma.mallPromotion.findMany({
      where: { status: "active", endAt: { gte: new Date() } },
    });
  }

  async getProductReviews(productId: string, query: any) {
    const { page = 1, page_size = 10 } = query;
    return this.prisma.mallReview.findMany({
      where: { productId, status: "active" },
      skip: (page - 1) * page_size,
      take: Number(page_size),
      orderBy: { createdAt: "desc" },
    });
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
    return this.prisma.mallRefund.create({
      data: {
        orderId: dto.order_id,
        amount: dto.amount,
        reason: dto.reason,
        refundNo: `REF${Date.now()}`,
      },
    });
  }

  async getMyRefunds(userId: string, query: any) {
    return this.prisma.mallRefund.findMany({
      where: {
        orderId: {
          in: (
            await this.prisma.mallOrder.findMany({
              where: { userId },
              select: { id: true },
            })
          ).map((o) => o.id),
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async applyDistributor(userId: string, dto: any) {
    return this.prisma.mallDistributor.create({
      data: { userId, realName: dto.real_name, phone: dto.phone },
    });
  }

  async getMyDistributor(userId: string) {
    return this.prisma.mallDistributor.findUnique({ where: { userId } });
  }

  async getMyMerchantApplication(userId: string) {
    return this.prisma.mallMerchant.findFirst({ where: { userId } });
  }

  async applyMerchant(userId: string, dto: any) {
    return this.prisma.mallMerchant.create({
      data: {
        userId,
        name: dto.name,
        phone: dto.phone,
        address: dto.address,
        description: dto.description,
      },
    });
  }
}
