import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';

@Injectable()
export class MerchantService {
  constructor(private readonly prisma: PrismaService) {}

  // ==================== 打印机配置 ====================

  async getPrinterList(query: any) {
    const { page = 1, pageSize = 20, merchantId, brand, status } = query;
    const where: any = {};
    if (merchantId) where.merchantId = merchantId;
    if (brand) where.brand = brand;
    if (status) where.status = status;
    const [list, total] = await Promise.all([
      this.prisma.printerConfig.findMany({
        where,
        skip: (Number(page) - 1) * Number(pageSize),
        take: Number(pageSize),
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.printerConfig.count({ where }),
    ]);
    return { list, total, page: Number(page), pageSize: Number(pageSize) };
  }

  async getPrinter(id: string) {
    const p = await this.prisma.printerConfig.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('打印机不存在');
    return p;
  }

  async createPrinter(dto: any) {
    return this.prisma.printerConfig.create({ data: dto as any });
  }

  async updatePrinter(id: string, dto: any) {
    const p = await this.prisma.printerConfig.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('打印机不存在');
    return this.prisma.printerConfig.update({ where: { id }, data: dto as any });
  }

  async deletePrinter(id: string) {
    const p = await this.prisma.printerConfig.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('打印机不存在');
    return this.prisma.printerConfig.update({ where: { id }, data: { status: 'deleted' } });
  }

  async testPrint(id: string, dto: any) {
    const p = await this.prisma.printerConfig.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('打印机不存在');
    return { success: true, message: '打印任务已提交', printer: p.name, content: dto.content || dto.orderId || '测试打印' };
  }

  // ==================== 商品加价规则 ====================

  async getPriceAdjustments(query: any) {
    const { page = 1, pageSize = 20, type, scope, status, regionId, categoryId, merchantId } = query;
    const where: any = {};
    if (type) where.type = type;
    if (scope) where.scope = scope;
    if (status) where.status = status;
    if (regionId) where.regionId = regionId;
    if (categoryId) where.categoryId = categoryId;
    if (merchantId) where.merchantId = merchantId;
    const [list, total] = await Promise.all([
      this.prisma.productPriceAdjustment.findMany({
        where,
        skip: (Number(page) - 1) * Number(pageSize),
        take: Number(pageSize),
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        include: {
          region: { select: { name: true } },
          category: { select: { name: true } },
          merchant: { select: { name: true } },
        },
      }),
      this.prisma.productPriceAdjustment.count({ where }),
    ]);
    return { list, total, page: Number(page), pageSize: Number(pageSize) };
  }

  async getPriceAdjustment(id: string) {
    const a = await this.prisma.productPriceAdjustment.findUnique({
      where: { id },
      include: { region: { select: { name: true } }, category: { select: { name: true } }, merchant: { select: { name: true } } },
    });
    if (!a) throw new NotFoundException('加价规则不存在');
    return a;
  }

  async createPriceAdjustment(dto: any) {
    return this.prisma.productPriceAdjustment.create({ data: dto as any });
  }

  async updatePriceAdjustment(id: string, dto: any) {
    const a = await this.prisma.productPriceAdjustment.findUnique({ where: { id } });
    if (!a) throw new NotFoundException('加价规则不存在');
    return this.prisma.productPriceAdjustment.update({ where: { id }, data: dto as any });
  }

  async deletePriceAdjustment(id: string) {
    const a = await this.prisma.productPriceAdjustment.findUnique({ where: { id } });
    if (!a) throw new NotFoundException('加价规则不存在');
    return this.prisma.productPriceAdjustment.delete({ where: { id } });
  }

  // ==================== 商品采集 ====================

  async getProductCollection(query: any) {
    const { page = 1, pageSize = 20, keyword, categoryId, merchantId, regionId, status, minPrice, maxPrice } = query;
    const where: any = {};
    if (keyword) where.name = { contains: keyword, mode: 'insensitive' };
    if (categoryId) where.categoryId = categoryId;
    if (merchantId) where.merchantId = merchantId;
    if (status) where.status = status;
    if (minPrice || maxPrice) {
      where.price = {};
      if (minPrice) where.price.gte = Number(minPrice);
      if (maxPrice) where.price.lte = Number(maxPrice);
    }
    if (regionId) {
      where.merchant = { regionId };
    }
    const [list, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip: (Number(page) - 1) * Number(pageSize),
        take: Number(pageSize),
        orderBy: { createdAt: 'desc' },
        include: {
          merchant: { select: { name: true, regionId: true } },
          category: { select: { name: true } },
        },
      }),
      this.prisma.product.count({ where }),
    ]);
    return { list, total, page: Number(page), pageSize: Number(pageSize) };
  }

  async batchCollectProducts(dto: any) {
    const { targetMerchantId, productIds } = dto;
    const target = await this.prisma.merchant.findUnique({ where: { id: targetMerchantId } });
    if (!target) throw new NotFoundException('目标商家不存在');
    const products = await this.prisma.product.findMany({ where: { id: { in: productIds } }, include: { skus: true } });
    let count = 0;
    for (const p of products) {
      const newProduct = await this.prisma.product.create({
        data: {
          merchantId: targetMerchantId,
          categoryId: p.categoryId,
          name: p.name,
          images: p.images,
          detail: p.detail,
          price: p.price,
          originPrice: p.originPrice,
          stock: p.stock,
          unit: p.unit,
          weight: p.weight,
          status: 'on_sale',
        } as any,
      });
      if (p.skus.length > 0) {
        await this.prisma.sKU.createMany({
          data: p.skus.map((sku: any) => ({
            productId: newProduct.id,
            specs: sku.specs,
            price: sku.price,
            originPrice: sku.originPrice,
            stock: sku.stock,
            image: sku.image,
            status: 'on_sale',
          })),
        });
      }
      count++;
    }
    return { success: true, collected: count };
  }

  async exportProducts(query: any) {
    const { pageSize = 10000, ...rest } = query;
    const data = await this.getProductCollection({ ...rest, pageSize });
    return data;
  }

  // ==================== 区域商家设置 ====================

  async getRegionSettingsList(query: any) {
    const { page = 1, pageSize = 20, regionId, isOpen } = query;
    const where: any = {};
    if (regionId) where.regionId = regionId;
    if (isOpen !== undefined) where.isOpen = isOpen === 'true';
    const [list, total] = await Promise.all([
      this.prisma.regionMerchantSettings.findMany({
        where,
        skip: (Number(page) - 1) * Number(pageSize),
        take: Number(pageSize),
        orderBy: { createdAt: 'desc' },
        include: { region: { select: { name: true } } },
      }),
      this.prisma.regionMerchantSettings.count({ where }),
    ]);
    return { list, total, page: Number(page), pageSize: Number(pageSize) };
  }

  async getRegionSettings(regionId: string) {
    const settings = await this.prisma.regionMerchantSettings.findUnique({
      where: { regionId },
      include: { region: { select: { name: true } } },
    });
    return settings || { regionId, isOpen: true, autoAuditEnabled: false, allowNegativeStock: false, requireProductAudit: true, settlementCycle: 'weekly', settlementDay: 1 };
  }

  async upsertRegionSettings(regionId: string, dto: any) {
    const r = await this.prisma.region.findUnique({ where: { id: regionId } });
    if (!r) throw new NotFoundException('区域不存在');
    return this.prisma.regionMerchantSettings.upsert({
      where: { regionId },
      create: { regionId, ...dto } as any,
      update: dto as any,
    });
  }
}
