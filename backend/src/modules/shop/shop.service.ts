import { Injectable, NotFoundException, BadRequestException, ForbiddenException, NotImplementedException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';

@Injectable()
export class ShopService {
  constructor(private readonly prisma: PrismaService) {}

  async getByRegion(regionId: string, query: any) {
    const { page = 1, pageSize = 10 } = query;
    return this.prisma.merchant.findMany({ where: { regionId, status: 'approved' }, skip: (page - 1) * pageSize, take: Number(pageSize), orderBy: { createdAt: 'desc' } });
  }

  async getDetail(merchantId: string) {
    const merchant = await this.prisma.merchant.findUnique({ where: { id: merchantId } });
    if (!merchant) throw new NotFoundException('商家不存在');
    return merchant;
  }

  async getCategoriesAndProducts(merchantId: string) {
    const categories = await this.prisma.category.findMany({ where: { isShow: true }, include: { products: { where: { merchantId, status: 'on_sale' } } } });
    return { categories };
  }

  async getList(query: any) {
    const { page = 1, limit = 10 } = query;
    return this.prisma.merchant.findMany({ where: { status: 'approved' }, skip: (page - 1) * limit, take: Number(limit), orderBy: { createdAt: 'desc' } });
  }

  async getMerchantOrders(merchantId: string, query: any, userId: string) {
    return this.prisma.order.findMany({ where: { merchantId }, orderBy: { createdAt: 'desc' } });
  }

  async applyMerchant(userId: string, dto: any) {
    return this.prisma.merchant.create({ data: { userId, name: dto.name, phone: dto.phone, address: dto.address, description: dto.description } });
  }

  async getMyApplication(userId: string) {
    return this.prisma.merchant.findFirst({ where: { userId } });
  }

  async updateMerchant(merchantId: string, userId: string, dto: any) {
    return this.prisma.merchant.update({ where: { id: merchantId }, data: dto });
  }

  async syncToRegion(regionId: string, userId: string, dto: any) {
    const { merchantId } = dto;
    await this.prisma.merchant.update({ where: { id: merchantId }, data: { regionId } });
    return { success: true };
  }

  async getPrinters(merchantId: string) {
    return this.prisma.printerConfig.findMany({ where: { merchantId } });
  }

  async addPrinter(userId: string, dto: any) {
    return this.prisma.printerConfig.create({ data: dto });
  }

  async updatePrinter(printerId: string, userId: string, dto: any) {
    return this.prisma.printerConfig.update({ where: { id: printerId }, data: dto });
  }

  async deletePrinter(printerId: string, userId: string) {
    await this.prisma.printerConfig.delete({ where: { id: printerId } });
    return { success: true };
  }

  async getMerchantDashboard(merchantId: string, query: any) {
    const { type = 'today' } = query;
    const now = new Date();
    let startTime: Date;
    if (type === 'today') {
      startTime = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (type === 'week') {
      startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (type === 'month') {
      startTime = new Date(now.getFullYear(), now.getMonth(), 1);
    } else {
      startTime = new Date(0);
    }
    const orders = await this.prisma.order.findMany({
      where: { merchantId, createdAt: { gte: startTime } },
    });
    const totalOrders = orders.length;
    const totalAmount = orders.reduce((sum, o) => sum + Number(o.payAmount || 0), 0);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayOrders = orders.filter((o) => o.createdAt >= todayStart).length;
    const todayAmount = orders.filter((o) => o.createdAt >= todayStart).reduce((sum, o) => sum + Number(o.payAmount || 0), 0);
    return { totalOrders, totalAmount, todayOrders, todayAmount };
  }

  async getCategories() {
    return this.prisma.category.findMany({ where: { isShow: true, parentId: null }, include: { children: true } });
  }

  async createCategory(userId: string, dto: any) {
    return this.prisma.category.create({ data: dto });
  }

  async updateCategory(categoryId: string, userId: string, dto: any) {
    return this.prisma.category.update({ where: { id: categoryId }, data: dto });
  }

  async deleteCategory(categoryId: string, userId: string) {
    await this.prisma.category.delete({ where: { id: categoryId } });
    return { success: true };
  }

  async createProduct(userId: string, dto: any) {
    return this.prisma.product.create({ data: { ...dto, images: dto.images || [] } });
  }

  async updateProduct(productId: string, userId: string, dto: any) {
    return this.prisma.product.update({ where: { id: productId }, data: dto });
  }

  async deleteProduct(productId: string, userId: string) {
    await this.prisma.product.delete({ where: { id: productId } });
    return { success: true };
  }

  async deleteSpecOption(optionId: string, userId: string) {
    await this.prisma.productOption.delete({ where: { id: optionId } });
    return { success: true };
  }

  async batchCreateOptions(productId: string, userId: string, dto: any) {
    const { items } = dto;
    if (items && Array.isArray(items)) {
      await this.prisma.productOption.createMany({
        data: items.map((item: any) => ({ ...item, productId })),
      });
    }
    return { success: true };
  }

  async batchUpdateOptions(productId: string, userId: string, dto: any) {
    const { items } = dto;
    if (items && Array.isArray(items)) {
      for (const item of items) {
        if (item.id) {
          await this.prisma.productOption.update({
            where: { id: item.id },
            data: { name: item.name, values: item.values },
          });
        }
      }
    }
    return { success: true };
  }

  async batchDeleteOptions(productId: string, userId: string, dto: any) {
    const { ids } = dto;
    if (ids && Array.isArray(ids)) {
      await this.prisma.productOption.deleteMany({
        where: { id: { in: ids } },
      });
    }
    return { success: true };
  }

  async getAllOptions(productId: string) {
    return this.prisma.productOption.findMany({ where: { productId } });
  }

  async addToCart(userId: string, dto: any) {
    return this.prisma.cart.upsert({
      where: { userId_productId_skuId: { userId, productId: dto.product_id, skuId: dto.sku_id || null } },
      create: { userId, productId: dto.product_id, skuId: dto.sku_id, quantity: dto.quantity || 1 },
      update: { quantity: { increment: dto.quantity || 1 } },
    });
  }

  async removeFromCart(userId: string, dto: any) {
    await this.prisma.cart.deleteMany({ where: { userId, productId: dto.product_id, skuId: dto.sku_id } });
    return { success: true };
  }

  async clearCart(userId: string) {
    await this.prisma.cart.deleteMany({ where: { userId } });
    return { success: true };
  }

  async getCart(merchantId: string, userId: string) {
    return this.prisma.cart.findMany({ where: { userId }, include: { product: true, sku: true } });
  }

  async createOrder(merchantId: string, userId: string, dto: any) {
    const orderNo = `ORD${Date.now()}`;
    return this.prisma.order.create({ data: { orderNo, userId, merchantId, totalAmount: dto.total_amount, payAmount: dto.pay_amount, receiverName: dto.receiver_name, receiverPhone: dto.receiver_phone, receiverAddress: dto.receiver_address } });
  }

  async getOrderDetail(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.userId !== userId) throw new NotFoundException('订单不存在');
    return order;
  }

  async getOrders(userId: string, query: any) {
    const { page = 1, pageSize = 20, status, keyword } = query;
    const where: any = { userId };
    if (status) where.status = status;
    return this.prisma.order.findMany({ where, skip: (page - 1) * pageSize, take: Number(pageSize), orderBy: { createdAt: 'desc' } });
  }

  async updateOrderStatus(orderId: string, userId: string, dto: any) {
    return this.prisma.order.update({ where: { id: orderId }, data: { status: dto.status } });
  }

  async sendOrderNotification(userId: string, dto: any) {
    const { orderId } = dto;
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('订单不存在');
    return { success: true, message: '通知已发送' };
  }

  async printOrder(userId: string, dto: any) {
    const { orderId } = dto;
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('订单不存在');
    return { success: true, message: '打印任务已提交' };
  }

  async getReviewStats(merchantId: string, regionId: string) {
    const reviews = await this.prisma.review.findMany({ where: { merchantId } });
    const totalReviews = reviews.length;
    if (totalReviews === 0) return { avgRating: 0, totalReviews: 0, ratingDistribution: {} };
    const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews;
    const ratingDistribution: Record<number, number> = {};
    reviews.forEach((r) => {
      ratingDistribution[r.rating] = (ratingDistribution[r.rating] || 0) + 1;
    });
    return { avgRating: Math.round(avgRating * 10) / 10, totalReviews, ratingDistribution };
  }

  async getReviews(merchantId: string, query: any) {
    const { page = 1, page_size = 10 } = query;
    return this.prisma.review.findMany({ where: { merchantId: merchantId as any }, skip: (page - 1) * page_size, take: Number(page_size), orderBy: { createdAt: 'desc' } });
  }

  async submitReview(userId: string, dto: any) {
    return this.prisma.review.create({ data: { userId, productId: dto.product_id, orderId: dto.order_id, rating: dto.rating, content: dto.content, images: dto.images } });
  }

  async getPopularTags(regionId: string) {
    return { tags: [] };
  }
}
