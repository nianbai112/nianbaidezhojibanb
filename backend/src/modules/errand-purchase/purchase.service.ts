import { canStartWechatPayment } from '../../common/payment-client';
import { isMiniappOpenid } from '../../common/wechat-identity';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { PrismaService } from "../../common/services/prisma.service";
import { RedisService } from "../../common/services/redis.service";
import { UserAccessPolicyService } from "../../common/services/user-access-policy.service";
import { AdminDataScopeService } from "../../common/services/admin-data-scope.service";
import { PaymentService } from "../payment/payment.service";
import { NotifyService } from "../notify/notify.service";
import { RiderPayoutService } from "../rider-payout/rider-payout.service";
import { PrintService } from "../print/print.service";
import { hasDeliveryCoordinates, joinAddressParts } from "../address/address-location";
import { ErrandCouponBenefit, resolveErrandCoupon } from "../errand/errand-coupon";
import { restoreErrandOrderCoupon } from "../errand/errand-coupon-restoration";
import { errandExtendedConfigKey } from "../errand/errand-config.util";
import {
  assertCouponCampaignRules,
  reserveErrandCampaignBudget,
  resolveActiveCouponCampaign,
} from "../errand/errand-transaction-guards";
import { availableCategory, categoryIsAvailable, categoryTree } from "./purchase.catalog";
import {
  DEFAULT_TICKET_TEMPLATE,
  PURCHASE_CANCEL_WINDOW_MS,
  PURCHASE_PRINT_BIZ,
  PURCHASE_PRINT_BRANDS,
  PURCHASE_TICKET_TTL_MS,
  PURCHASE_TICKET_WINDOW_MS,
  TicketTemplate,
  normalizeTicketTemplate,
  purchaseCancelTicket,
  purchasePickupCode,
  purchasePrintState,
  purchaseRiderLabel,
  TICKET_PRESETS,
  renderPurchaseTicket,
  renderTicketParts,
  sampleTicketData,
  storedTicketTemplate,
  ticketTemplateKey,
} from "./purchase.printing";
import {
  modifierKey,
  modifierLineKey,
  normalizeBindings,
  normalizeModifierGroup,
  parseBindings,
  resolveModifierGroups,
  selectModifiers,
  specText,
} from "./purchase.modifiers";
import {
  CHANGE_BIZ,
  PURCHASE_BIZ,
  PURCHASE_TYPE,
  assertClock,
  canonicalShops,
  cents,
  integer,
  isOpen,
  matchCombination,
  money,
  policy,
  purchaseConfigKey,
  purchaseRoute,
  stableHash,
  text,
  urls,
} from "./purchase.policy";
import {
  applyPurchaseChange,
  assertPurchaseAdvance,
  lockPurchase,
  purchaseEvent,
  purchaseInclude,
  queuePurchaseRefund,
  unresolvedChanges,
  PURCHASE_TRANSACTION_OPTIONS,
} from "./purchase.transactions";

@Injectable()
export class PurchaseService {
  private readonly logger = new Logger(PurchaseService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: UserAccessPolicyService,
    private readonly scope: AdminDataScopeService,
    private readonly payment: PaymentService,
    private readonly redis: RedisService,
    private readonly notify: NotifyService,
    @Optional() private readonly riderPayout?: RiderPayoutService,
    @Optional() private readonly printer?: PrintService,
  ) {}

  private get db(): any {
    return this.prisma;
  }
  private transaction<T>(
    run: (tx: any) => Promise<T>,
    options: { isolationLevel?: "ReadCommitted" | "Serializable" } = {},
  ): Promise<T> {
    // MySQL's default repeatable-read snapshot can precede the order lock.
    // After waiting for that lock, reread the committed refund and goods state.
    // Order creation explicitly keeps Serializable for its quote validation.
    return this.db.$transaction(run, { ...PURCHASE_TRANSACTION_OPTIONS, ...options });
  }
  private async config(db: any, regionId: string) {
    const row = await db.config.findUnique({
      where: { key: purchaseConfigKey(regionId) },
    });
    return policy(row?.value);
  }
  private async adminRegion(operatorId: string, regionId: string) {
    text(operatorId, "管理员");
    text(regionId, "区域");
    await this.scope.assertRegionAccess(operatorId, regionId);
    if (
      !(await this.db.region.findUnique({
        where: { id: regionId },
        select: { id: true },
      }))
    )
      throw new BadRequestException("区域不存在");
  }
  private coordinate(value: any, label: string, max: number) {
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      Math.abs(value) > max
    )
      throw new BadRequestException(`${label}无效，请在地图上选择位置`);
    return value;
  }
  private image(value: any) {
    if (!value) return null;
    if (
      typeof value !== "string" ||
      !/^https:\/\//.test(value) ||
      value.length > 2048
    )
      throw new BadRequestException("图片地址无效");
    return value;
  }
  private bool(value: any) {
    if (typeof value !== "boolean")
      throw new BadRequestException("开关参数无效");
    return value;
  }
  // Every group of the given shops, disabled ones included; resolution filters them.
  private async shopModifierGroups(db: any, shopIds: string[]) {
    const ids = [...new Set(shopIds)];
    const rows = ids.length
      ? await db.purchaseModifierGroup.findMany({
          where: { shopId: { in: ids } },
          include: { options: true },
        })
      : [];
    const byShop = new Map<string, any[]>(ids.map((id) => [id, []]));
    for (const row of rows) byShop.get(row.shopId)?.push(row);
    return byShop;
  }
  // Drops deleted groups and options from every product binding in the shop.
  private async scrubModifierBindings(tx: any, shopId: string, groupIds: string[], optionIds: string[]) {
    const groups = new Set(groupIds), options = new Set(optionIds);
    const products = await tx.purchaseProduct.findMany({ where: { shopId }, select: { id: true, modifierBindings: true } });
    let changed = 0;
    for (const product of products) {
      const current = parseBindings(product.modifierBindings);
      const next = current
        .filter((b) => !groups.has(b.groupId))
        .map((b) => ({
          groupId: b.groupId,
          hiddenOptionIds: b.hiddenOptionIds.filter((id) => !options.has(id)),
          defaultOptionId: b.defaultOptionId && !options.has(b.defaultOptionId) ? b.defaultOptionId : null,
        }));
      if (JSON.stringify(next) === JSON.stringify(current)) continue;
      await tx.purchaseProduct.update({ where: { id: product.id }, data: { modifierBindings: next, version: { increment: 1 } } });
      changed++;
    }
    return changed;
  }
  private withModifiers(product: any, shopGroups: any[] = []) {
    const { modifierBindings, ...rest } = product;
    return { ...rest, modifierGroups: resolveModifierGroups(modifierBindings, shopGroups) };
  }
  private itemSnapshot(sku: any, selection: { modifiers: any[]; modifierCents: number }) {
    return {
      productId: sku.product.id,
      productName: sku.product.name,
      skuName: sku.name,
      image: sku.product.image,
      weightGrams: sku.weightGrams,
      skuVersion: sku.version,
      productVersion: sku.product.version,
      skuPriceCents: sku.priceCents,
      modifiers: selection.modifiers,
      modifierCents: selection.modifierCents,
      specText: specText(sku.name, selection.modifiers),
    };
  }

  async catalog(regionId: string, view?: string) {
    text(regionId, "区域");
    const p = await this.config(this.db, regionId);
    if (!p.enabled)
      return { enabled: false, shops: [], combinations: [], policy: p };
    const [shops, combinations] = await Promise.all([
      this.db.purchaseShop.findMany({
        where: { regionId, enabled: true },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        include: {
          categories: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
          products: view === "navigation" ? false : {
            where: { enabled: true, ...availableCategory, skus: { some: { enabled: true } } },
            orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
            include: { skus: { where: { enabled: true } } },
          },
          modifierGroups: view === "navigation" ? false : { include: { options: true } },
        },
      }),
      this.db.purchaseCombination.findMany({
        where: { regionId, enabled: true },
      }),
    ]);
    return {
      enabled: true,
      shops: shops.map(({ modifierGroups, ...s }: any) => ({
        ...s,
        ...(s.products ? { products: s.products.map((p: any) => this.withModifiers(p, modifierGroups)) } : {}),
        categories: categoryTree(s.categories || []),
        open: isOpen(s),
      })),
      combinations: combinations.filter((c: any) => c.shopIds.every((id: string) => shops.some((s: any) => s.id === id))),
      policy: p,
    };
  }

  async products(query: any) {
    const regionId = text(query.regionId, "区域"), shopId = text(query.shopId, "店铺");
    const page = integer(Number(query.page || 1), "页码", 1, 100000);
    const pageSize = integer(Number(query.pageSize || 20), "每页数量", 1, 40);
    const p = await this.config(this.db, regionId);
    if (!p.enabled) throw new BadRequestException("本区域暂未开放代买服务");
    const shop = await this.db.purchaseShop.findFirst({ where: { id: shopId, regionId, enabled: true } });
    if (!shop) throw new BadRequestException("店铺已停用或不属于当前区域");
    const where: any = { shopId, enabled: true, ...availableCategory, skus: { some: { enabled: true } } };
    if (query.categoryId) {
      const category = await this.db.purchaseCategory.findFirst({
        where: { id: text(query.categoryId, "分类"), shopId, enabled: true }, include: { parent: true },
      });
      if (!category || (category.parentId && !category.parent?.enabled)) throw new BadRequestException("分类不可用，请刷新店铺");
      const children = category.parentId ? [] : await this.db.purchaseCategory.findMany({
        where: { shopId, parentId: category.id, enabled: true }, select: { id: true },
      });
      where.categoryId = { in: [category.id, ...children.map((c: any) => c.id)] };
    }
    if (String(query.keyword || "").trim()) where.name = { contains: text(query.keyword.trim(), "搜索内容", 60) };
    const [items, total, groups] = await Promise.all([
      this.db.purchaseProduct.findMany({ where, orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        skip: (page - 1) * pageSize, take: pageSize,
        include: { skus: { where: { enabled: true }, orderBy: { id: "asc" } } },
      }),
      this.db.purchaseProduct.count({ where }),
      this.shopModifierGroups(this.db, [shopId]),
    ]);
    return {
      items: items.map((p: any) => this.withModifiers(p, groups.get(shopId))),
      total, page, pageSize, hasMore: page * pageSize < total,
    };
  }

  // Refresh only the selected cart lines; never rebuild a cart from a paginated product list.
  // `lines` carries each line's flavour choices; the older `skuIds` form applies defaults.
  async cartItems(body: any) {
    const regionId = text(body.regionId, "区域");
    const byLine = Array.isArray(body.lines);
    const raw = byLine ? body.lines : body.skuIds;
    if (!Array.isArray(raw) || raw.length > 100) throw new BadRequestException("购物车商品数量无效");
    const requested: { skuId: string; modifiers: unknown }[] = byLine
      ? raw.map((line: any) => ({ skuId: text(line?.skuId, "规格"), modifiers: Array.isArray(line?.modifiers) ? line.modifiers : [] }))
      : [...new Set<string>(raw.map((id: any) => text(id, "规格")))].map((skuId) => ({ skuId, modifiers: undefined }));
    const p = await this.config(this.db, regionId);
    if (!p.enabled || !requested.length) return { items: [] };
    const skus = await this.db.purchaseSku.findMany({
      where: { id: { in: [...new Set(requested.map((r) => r.skuId))] }, enabled: true, product: { enabled: true, ...availableCategory, shop: { regionId, enabled: true } } },
      include: { product: { include: { shop: true } } },
    });
    const groups = await this.shopModifierGroups(this.db, skus.map((sku: any) => sku.product.shopId));
    const items: any[] = [];
    requested.forEach((line, index) => {
      const sku = skus.find((s: any) => s.id === line.skuId);
      if (!sku) return;
      let selection: any = { modifiers: [], modifierCents: 0 }, invalidReason = "";
      try {
        selection = selectModifiers(resolveModifierGroups(sku.product.modifierBindings, groups.get(sku.product.shopId)), line.modifiers, { useDefaults: !byLine });
      } catch (error: any) {
        invalidReason = error?.message || "请重新选择口味";
      }
      items.push({ index, lineKey: modifierLineKey(sku.id, selection.modifiers), skuId: sku.id, productId: sku.productId,
        categoryId: sku.product.categoryId, shopId: sku.product.shopId, shopName: sku.product.shop.name,
        name: sku.product.name, spec: specText(sku.name, selection.modifiers), skuName: sku.name, image: sku.product.image,
        skuPriceCents: sku.priceCents, unitCents: sku.priceCents + selection.modifierCents, modifiers: selection.modifiers,
        invalidReason, open: isOpen(sku.product.shop),
      });
    });
    return { items };
  }

  private async buildQuote(db: any, userId: string, body: any) {
    const regionId = text(body.regionId, "区域"),
      addressId = text(body.addressId, "收货地址");
    const p = await this.config(db, regionId);
    if (!p.enabled) throw new BadRequestException("本区域暂未开放代买服务");
    const region = await db.region.findUnique({
      where: { id: regionId },
      select: { isOpen: true },
    });
    if (!region?.isOpen) throw new BadRequestException("当前区域未开放服务");
    const address = await db.address.findFirst({
      where: { id: addressId, userId, regionId },
    });
    if (!address)
      throw new BadRequestException("请选择当前区域内自己的收货地址");
    if (!hasDeliveryCoordinates(address)) {
      throw new BadRequestException("收货地址缺少有效地图位置，请先补充收货位置");
    }
    if (
      !Array.isArray(body.items) ||
      !body.items.length ||
      body.items.length > 100
    )
      throw new BadRequestException("请选择商品");
    const items = body.items.map((i: any) => ({
      skuId: text(i?.skuId, "规格"),
      quantity: integer(i?.quantity, "购买数量", 1, p.maxQuantity),
      modifiers: i?.modifiers,
    }));
    if (items.reduce((n: number, i: any) => n + i.quantity, 0) > p.maxQuantity)
      throw new BadRequestException("商品总件数超过限制");
    const skuIds = [...new Set<string>(items.map((i: any) => i.skuId))];
    const skus = await db.purchaseSku.findMany({
      where: { id: { in: skuIds }, enabled: true },
      include: { product: { include: { shop: true, catalogCategory: { include: { parent: true } } } } },
    });
    if (skus.length !== skuIds.length)
      throw new BadRequestException("部分商品已下架，请重新选择");
    const groups = await this.shopModifierGroups(db, skus.map((s: any) => s.product.shopId));
    const lines = items
      .map((i: any) => {
        const sku = skus.find((s: any) => s.id === i.skuId),
          product = sku.product,
          shop = product.shop;
        if (!product.enabled || !categoryIsAvailable(product) || shop.regionId !== regionId || !isOpen(shop))
          throw new BadRequestException(`${shop.name}已打烊或商品不可购买`);
        // Clients without flavour support send no modifiers; they receive the defaults.
        const selection = selectModifiers(
          resolveModifierGroups(product.modifierBindings, groups.get(shop.id)),
          i.modifiers,
          { useDefaults: true },
        );
        return {
          skuId: sku.id,
          quantity: i.quantity,
          modifiers: selection.modifiers.map((m) => ({ optionId: m.optionId, quantity: m.quantity })),
          lineKey: modifierLineKey(sku.id, selection.modifiers),
          shopId: shop.id,
          unitCents: sku.priceCents + selection.modifierCents,
          snapshot: this.itemSnapshot(sku, selection),
        };
      })
      .sort((a: any, b: any) => a.lineKey.localeCompare(b.lineKey));
    if (new Set(lines.map((i: any) => i.lineKey)).size !== lines.length)
      throw new BadRequestException("相同规格和口味的商品请合并数量");
    const shopIds = canonicalShops(lines.map((i: any) => i.shopId));
    if (shopIds.length > p.maxShops)
      throw new BadRequestException("店铺数量超过本区域限制");
    const rules = await db.purchaseCombination.findMany({
      where: { regionId, enabled: true },
    });
    const combination = matchCombination(shopIds, rules);
    const shops = shopIds.map(
      (id) => skus.find((s: any) => s.product.shopId === id).product.shop,
    );
    const route = purchaseRoute(shops, address);
    if (route.meters > p.maxDistanceMeters)
      throw new BadRequestException("所选店铺到收货地址超出配送范围");
    const weight = lines.reduce(
      (n: number, i: any) => n + i.quantity * i.snapshot.weightGrams,
      0,
    );
    if (weight > p.maxWeightGrams)
      throw new BadRequestException("商品总重量超过限制");
    const goodsCents = lines.reduce(
      (n: number, i: any) => n + i.quantity * i.unitCents,
      0,
    );
    const maxGoodsCents = Math.min(
      p.maxGoodsCents,
      combination?.maxGoodsCents ?? p.maxGoodsCents,
    );
    if (goodsCents > maxGoodsCents)
      throw new BadRequestException("商品货款超过垫付限额，请减少商品");
    const fees = {
      serviceFeeCents: p.serviceFeeCents,
      deliveryFeeCents: p.deliveryFeeCents,
      distanceFeeCents:
        Math.ceil(route.meters / 1000) * p.distanceFeeCentsPerKm,
      extraFeeCents: combination?.extraFeeCents || 0,
      combinationId: combination?.id || null,
      combinationVersion: combination?.version || null,
      maxGoodsCents,
      distanceMeters: route.meters,
    };
    const serviceCents =
      fees.serviceFeeCents +
      fees.deliveryFeeCents +
      fees.distanceFeeCents +
      fees.extraFeeCents;
    const shortagePolicy = body.shortagePolicy || "refund_missing";
    if (!["refund_missing", "contact_me"].includes(shortagePolicy))
      throw new BadRequestException("缺货处理方式无效");
    // Coupons use the errand rules and discount the service fee only, never goods money.
    const benefit = await resolveErrandCoupon(
      db,
      userId,
      body.userCouponId,
      money(serviceCents),
      regionId,
    );
    const couponDiscountCents = Math.min(
      serviceCents,
      cents(benefit.discountAmount),
    );
    const result = {
      regionId,
      address: {
        id: address.id,
        name: address.name,
        phone: address.phone,
        address: joinAddressParts([
          address.fullAddress || address.detail,
          address.dormitoryNumber,
        ]),
        latitude: address.latitude,
        longitude: address.longitude,
      },
      shops: route.shops.map((s) => ({
        id: s.id,
        name: s.name,
        address: s.address,
        latitude: s.latitude,
        longitude: s.longitude,
        phone: s.phone,
        version: s.version,
      })),
      items: lines,
      goodsCents,
      serviceCents,
      totalCents: goodsCents + serviceCents,
      coupon: benefit.receive
        ? {
            userCouponId: benefit.receive.id,
            couponId: benefit.coupon.id,
            name: benefit.coupon.name,
            discountCents: couponDiscountCents,
          }
        : null,
      couponDiscountCents,
      payCents: goodsCents + serviceCents - couponDiscountCents,
      weightGrams: weight,
      fees,
      policy: p,
      shortagePolicy,
    };
    return { quote: { ...result, quoteHash: stableHash(result) }, benefit };
  }
  async quote(userId: string, body: any) {
    await this.access.assertStudentProtectedAction(
      userId,
      text(body.regionId, "区域"),
      "创建代买订单",
    );
    return (await this.buildQuote(this.db, userId, body)).quote;
  }

  /** Runs in the order transaction: campaign budget, coupon receipt and template count together. */
  private async consumeCoupon(
    tx: any,
    userId: string,
    benefit: ErrandCouponBenefit,
    orderNo: string,
    discountCents: number,
  ) {
    const discount = money(discountCents);
    if (benefit.campaign) {
      const campaign = await resolveActiveCouponCampaign(tx, benefit.coupon.id);
      if (!campaign)
        throw new BadRequestException("营销活动状态已变化，请重新确认订单");
      await reserveErrandCampaignBudget(tx, campaign, userId, discount, new Date());
      await assertCouponCampaignRules(
        tx,
        campaign,
        userId,
        benefit.coupon.id,
        discount,
        "errand",
      );
      benefit.campaign = campaign;
    }
    const used = await tx.couponReceive.updateMany({
      where: { id: benefit.receive.id, userId, status: "unused" },
      data: { status: "used", usedAt: new Date(), orderNo },
    });
    if (used.count !== 1)
      throw new BadRequestException("优惠券已使用或已失效");
    await tx.coupon.update({
      where: { id: benefit.coupon.id },
      data: { usedCount: { increment: 1 } },
    });
  }
  async create(userId: string, body: any) {
    const requestKey = `${userId}:${text(body.requestKey, "请求编号", 100)}`;
    const requestHash = stableHash({
      regionId: body.regionId,
      addressId: body.addressId,
      items: body.items,
      shortagePolicy: body.shortagePolicy,
      remark: body.remark,
      quoteHash: body.quoteHash,
      ...(body.userCouponId ? { userCouponId: body.userCouponId } : {}),
    });
    const existing = await this.db.errandPurchase.findUnique({
      where: { requestKey },
    });
    if (existing) {
      if (existing.requestHash !== requestHash)
        throw new BadRequestException("下单编号已使用，请重新下单");
      return this.detail(existing.id, userId);
    }
    await this.access.assertStudentProtectedAction(
      userId,
      text(body.regionId, "区域"),
      "创建代买订单",
    );
    try {
      const id = await this.transaction(
        async (tx: any) => {
          const { quote: q, benefit } = await this.buildQuote(tx, userId, body);
          if (body.quoteHash !== q.quoteHash)
            throw new BadRequestException(
              "商品、地址或费用已变化，请重新确认报价",
            );
          const remark = body.remark ? text(body.remark, "备注", 200) : "";
          const orderNo = `DM${Date.now()}${randomUUID().slice(0, 8)}`;
          if (q.couponDiscountCents > 0)
            await this.consumeCoupon(tx, userId, benefit, orderNo, q.couponDiscountCents);
          const order = await tx.errandOrder.create({
            data: {
              orderNo,
              userId,
              regionId: q.regionId,
              type: PURCHASE_TYPE,
              title: `代买服务 · ${q.shops.map((s) => s.name).join("、")}`,
              description: `共${q.items.reduce((n: number, i: any) => n + i.quantity, 0)}件商品`,
              pickupAddress: q.shops.map((s) => s.address).join(" → "),
              pickupLat: q.shops[0].latitude,
              pickupLng: q.shops[0].longitude,
              deliverAddress: q.address.address,
              deliverContact: q.address.name,
              deliverPhone: q.address.phone,
              deliverLat: q.address.latitude,
              deliverLng: q.address.longitude,
              distance: q.fees.distanceMeters / 1000,
              weight: q.weightGrams / 1000,
              price: money(q.serviceCents),
              couponDiscount: money(q.couponDiscountCents),
              payAmount: money(q.payCents),
              remark,
              pricingSnapshot: {
                purchase: true,
                receiver_policy: "certified_only",
                ...q.fees,
              },
              tasks: {
                create: q.shops.map((s, index) => ({
                  sortOrder: index,
                  taskType: "purchase",
                  pickupAddress: s.address,
                  itemDescription: s.name,
                  recipientAddress: q.address.address,
                  metadata: { shopId: s.id, purchase: true },
                })),
              },
            },
          });
          await tx.errandPurchase.create({
            data: {
              id: order.id,
              userId,
              regionId: q.regionId,
              requestKey,
              requestHash,
              quoteHash: q.quoteHash,
              initialGoodsCents: q.goodsCents,
              approvedGoodsCents: q.goodsCents,
              serviceCents: q.serviceCents,
              feeSnapshot: q.fees,
              policySnapshot: q.policy,
              shortagePolicy: q.shortagePolicy,
              stops: {
                create: q.shops.map((s, index) => ({
                  shopId: s.id,
                  snapshot: s,
                  sortOrder: index,
                  items: {
                    create: q.items
                      .filter((i: any) => i.shopId === s.id)
                      .map((i: any) => ({
                        skuId: i.skuId,
                        snapshot: i.snapshot,
                        quantity: i.quantity,
                        approvedUnitCents: i.unitCents,
                      })),
                  },
                })),
              },
            },
          });
          if (q.couponDiscountCents > 0)
            // The rider keeps the full service fee; the coupon issuer funds the discount.
            await tx.subsidyLedger.create({
              data: {
                subsidyNo: `SUB${Date.now()}${randomUUID().slice(0, 6).toUpperCase()}`,
                sourceType: "coupon",
                sourceId: benefit.coupon.id,
                benefitKey: benefit.coupon.type,
                campaignId: benefit.campaign?.id || null,
                orderType: "errand_order",
                orderId: order.id,
                orderNo,
                userId,
                payerType:
                  benefit.campaign?.payerType ||
                  (benefit.coupon.regionId ? "region" : "platform"),
                payerId: benefit.coupon.regionId || null,
                receiverType: "rider",
                amount: money(q.couponDiscountCents),
                status: "pending",
                description: `${benefit.campaign?.title ? `活动${benefit.campaign.title}，` : ""}代买服务费优惠券核销：${benefit.coupon.name}`,
                metadata: {
                  couponReceiveId: benefit.receive.id,
                  couponName: benefit.coupon.name,
                  couponType: benefit.coupon.type,
                  campaignTitle: benefit.campaign?.title || null,
                  serviceCents: q.serviceCents,
                  goodsCents: q.goodsCents,
                  payCents: q.payCents,
                },
              },
            });
          await purchaseEvent(tx, order.id, userId, "created", {
            quoteHash: q.quoteHash,
            ...(q.couponDiscountCents > 0
              ? { couponDiscountCents: q.couponDiscountCents }
              : {}),
          });
          return order.id;
        },
        { isolationLevel: "Serializable" },
      );
      return this.detail(id, userId);
    } catch (error: any) {
      if (error.code === "P2002") {
        const row = await this.db.errandPurchase.findUnique({
          where: { requestKey },
        });
        if (row?.requestHash === requestHash)
          return this.detail(row.id, userId);
      }
      if (error.code === "P2034")
        throw new BadRequestException("报价信息正在更新，请刷新后重试");
      throw error;
    }
  }

  private async receiptSettings(regionId: string, purchasePolicy?: any) {
    const keys = [errandExtendedConfigKey(regionId), errandExtendedConfigKey("global")];
    if (purchasePolicy === undefined) keys.push(purchaseConfigKey(regionId));
    const rows = await this.db.config.findMany({
      where: { key: { in: [...new Set(keys)] } },
      select: { key: true, value: true },
    });
    const configs = new Map<string, any>(rows.map((row: any) => [row.key, row.value || {}]));
    // Match the worker's regional override and global fallback exactly.
    const regional = configs.get(errandExtendedConfigKey(regionId)) || {};
    const global = configs.get(errandExtendedConfigKey("global")) || {};
    const value = purchasePolicy === undefined ? configs.get(purchaseConfigKey(regionId)) : purchasePolicy;
    return {
      enabled: (regional.autoReceiptEnabled ?? regional.auto_receipt_enabled
        ?? global.autoReceiptEnabled ?? global.auto_receipt_enabled ?? true) !== false,
      autoReceiptHours: policy(value).autoReceiptHours,
      scanIntervalMinutes: 10,
    };
  }

  private async receiptAction(order: any) {
    if (order.status === "completed") return { allowed: false, reason: "订单已确认收货" };
    if (order.status !== "arrived") return { allowed: false, reason: "订单尚未送达或已结束，不能确认收货" };
    if (["refunding", "refunded"].includes(String(order.refundStatus || "none")))
      return { allowed: false, reason: "订单退款处理中或已退款，不能确认收货" };
    const [appeal, risk] = await Promise.all([
      this.db.orderAppeal.findFirst({
        where: {
          orderId: order.id,
          orderType: { in: ["errand", "errand_order"] },
          status: { notIn: ["resolved", "rejected", "closed", "cancelled", "completed"] },
        },
        select: { id: true },
      }),
      this.db.deliveryRiskEvent.findFirst({
        where: { orderId: order.id, orderType: "errand", handled: false, eventLevel: { in: ["error", "critical"] } },
        select: { id: true },
      }),
    ]);
    if (appeal) return { allowed: false, reason: "订单售后处理中，暂不能确认收货" };
    if (risk) return { allowed: false, reason: "订单存在未处理的配送风险，请先核查处理" };
    return { allowed: true, reason: "请核实用户已收到商品并填写说明；确认后按现有规则结算" };
  }

  async detail(id: string, userId: string, operatorId?: string) {
    const p = await this.db.errandPurchase.findUnique({
      where: { id },
      include: {
        ...purchaseInclude,
        events: { orderBy: { createdAt: "desc" }, take: 100 },
      },
    });
    if (!p) throw new NotFoundException("代买订单不存在");
    if (operatorId) await this.adminRegion(operatorId, p.regionId);
    else if (![p.userId, p.order.riderId].includes(userId))
      throw new ForbiddenException("无权查看该代买订单");
    const { receiptCode, ...order } = p.order;
    const printJobs = await this.db.printJob.findMany({
      where: {
        bizType: PURCHASE_PRINT_BIZ,
        bizId: { in: p.stops.map((s: any) => s.id) },
      },
      orderBy: { createdAt: "asc" },
      select: {
        bizId: true,
        event: true,
        status: true,
        errorMessage: true,
        printedAt: true,
      },
    });
    const [receiptSettings, receiptAction] = operatorId ? await Promise.all([
      this.receiptSettings(p.regionId),
      this.receiptAction(p.order),
    ]) : [];
    const adminReceipt = operatorId ? { receiptSettings, receiptAction } : {};
    return {
      ...p,
      ...adminReceipt,
      stops: p.stops.map((s: any) => ({
        ...s,
        print: purchasePrintState(
          printJobs.filter((job: any) => job.bizId === s.id),
          Boolean(operatorId),
        ),
      })),
      pickupCode: purchasePickupCode(p.order.orderNo),
      viewerRole: operatorId
        ? "admin"
        : p.userId === userId
          ? "buyer"
          : "rider",
      order: { ...order, ...(p.userId === userId ? { receiptCode } : {}) },
      totalCents: p.approvedGoodsCents + p.serviceCents,
      couponDiscountCents: cents(p.order.couponDiscount),
      payableCents:
        p.approvedGoodsCents + p.serviceCents - cents(p.order.couponDiscount),
      refundedCents: p.refunds
        .filter((r: any) => r.status === "success")
        .reduce((n: number, r: any) => n + r.amountCents, 0),
      refundPendingCents: p.refunds
        .filter((r: any) => r.status !== "success")
        .reduce((n: number, r: any) => n + r.amountCents, 0),
    };
  }

  async pay(id: string, userId: string, changeId?: string) {
    const p = await this.detail(id, userId);
    if (p.userId !== userId) throw new ForbiddenException("只能支付自己的订单");
    const change = changeId
      ? p.changes.find((c: any) => c.id === changeId)
      : null;
    if (
      changeId
        ? !change ||
          change.status !== "awaiting_payment" ||
          change.expiresAt <= new Date() ||
          p.order.status !== "accepted"
        : p.order.status !== "pending_pay" ||
          Date.now() - p.createdAt.getTime() >= 15 * 60000
    )
      throw new BadRequestException("订单或变更已失效，不能支付");
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { openid: true },
    });
    if (!user || !canStartWechatPayment(user.openid)) throw new BadRequestException("请先登录微信小程序");
    return this.payment.wxUnifiedOrder({
      bizType: change ? CHANGE_BIZ : PURCHASE_BIZ,
      bizId: change?.id || id,
      orderNo: p.order.orderNo,
      userId,
      openid: user.openid,
      amount: money(
        change
          ? change.deltaCents
          : p.initialGoodsCents + p.serviceCents - cents(p.order.couponDiscount),
      ),
      description: change ? "代买商品补差价" : "代买商品及跑腿服务",
    });
  }

  async propose(id: string, riderId: string, body: any) {
    const result = await this.transaction(async (tx: any) => {
      const p = await lockPurchase(tx, id);
      if (p.order.riderId !== riderId || p.order.status !== "accepted")
        throw new ForbiddenException("仅本单骑手可在采购阶段发起变更");
      const key = `${id}:${text(body.requestKey, "请求编号", 100)}`;
      const repeated = p.changes.find((c: any) => c.requestKey === key);
      const flavour = Array.isArray(body.modifiers)
        ? body.modifiers.map((m: any) => ({ optionId: String(m?.optionId || ""), quantity: Number(m?.quantity ?? 1) }))
        : null;
      if (repeated) {
        if (
          repeated.itemId !== body.itemId ||
          repeated.quantity !== body.quantity ||
          repeated.unitCents !== (body.quantity ? body.unitCents : 0) ||
          repeated.skuId !== (body.skuId || repeated.skuId) ||
          repeated.reason !== String(body.reason || "").trim() ||
          (body.quantity && flavour && modifierKey(flavour) !== modifierKey(repeated.snapshot?.modifiers))
        )
          throw new BadRequestException("请求编号已使用，请刷新后重新发起变更");
        return repeated;
      }
      const stop = p.stops.find((s: any) =>
        s.items.some((i: any) => i.id === body.itemId),
      );
      const item = stop?.items.find((i: any) => i.id === body.itemId);
      if (!item || stop.status !== "pending")
        throw new BadRequestException("商品已经购买或不存在");
      if (
        p.changes.some(
          (c: any) =>
            c.itemId === item.id && unresolvedChanges.includes(c.status),
        )
      )
        throw new BadRequestException("该商品已有待处理变更");
      const q = policy(p.policySnapshot),
        quantity = integer(body.quantity, "数量", 0, item.quantity);
      const unitCents = quantity
        ? integer(body.unitCents, "单价（分）", 1, q.maxGoodsCents)
        : 0;
      const skuId = quantity
        ? text(body.skuId || item.skuId, "规格")
        : item.skuId;
      // A replacement, or new flavour choices for the same item, is re-read from the catalog.
      const reread = !!quantity && (skuId !== item.skuId || !!flavour);
      const sku = reread
        ? await tx.purchaseSku.findUnique({
            where: { id: skuId },
            include: { product: true },
          })
        : null;
      if (
        reread &&
        (!sku?.enabled ||
          !sku.product.enabled ||
          sku.product.shopId !== stop.shopId)
      )
        throw new BadRequestException(
          skuId === item.skuId
            ? "该商品已从目录下架，不能修改口味，请按缺货或替换商品处理"
            : "替换商品必须来自同一家店的在售商品",
        );
      let snapshot = item.snapshot;
      if (reread) {
        const groups = await tx.purchaseModifierGroup.findMany({
          where: { shopId: stop.shopId },
          include: { options: true },
        });
        // The rider is at the counter, so the library's sold-out marks do not block them.
        const selection = selectModifiers(
          resolveModifierGroups(sku.product.modifierBindings, groups),
          flavour ?? undefined,
          { allowSoldOut: true, useDefaults: true },
        );
        snapshot = this.itemSnapshot(sku, selection);
      }
      const weight = p.stops
        .flatMap((s: any) => s.items)
        .reduce(
          (n: number, i: any) =>
            n +
            (i.id === item.id
              ? quantity * snapshot.weightGrams
              : i.quantity * i.snapshot.weightGrams),
          0,
        );
      if (weight > q.maxWeightGrams)
        throw new BadRequestException("替换后的商品超过配送重量限制");
      const deltaCents =
        quantity * unitCents - item.quantity * item.approvedUnitCents;
      if (
        !deltaCents &&
        quantity === item.quantity &&
        skuId === item.skuId &&
        modifierKey(snapshot.modifiers) === modifierKey(item.snapshot.modifiers)
      )
        throw new BadRequestException("商品没有变化");
      const reserved = p.changes
        .filter((c: any) => unresolvedChanges.includes(c.status))
        .reduce((n: number, c: any) => n + Math.max(0, c.deltaCents), 0);
      await assertPurchaseAdvance(
        tx,
        p.order,
        riderId,
        p.approvedGoodsCents + reserved + Math.max(0, deltaCents),
      );
      const change = await tx.purchaseChange.create({
        data: {
          purchaseId: id,
          itemId: item.id,
          requestKey: key,
          itemVersion: item.version,
          quantity,
          unitCents,
          skuId,
          snapshot,
          deltaCents,
          reason: text(body.reason, "变更原因", 200),
          evidenceUrls: urls(body.evidenceUrls, "缺货或价格凭证"),
          expiresAt: new Date(Date.now() + q.changeTimeoutMinutes * 60000),
        },
      });
      if (!quantity && p.shortagePolicy === "refund_missing")
        await applyPurchaseChange(tx, p, change);
      await purchaseEvent(tx, id, riderId, "change_proposed", {
        changeId: change.id,
        deltaCents,
      });
      return change;
    });
    await this.notifyChange(id);
    return result;
  }

  async respond(id: string, userId: string, changeId: string, accept: boolean) {
    this.bool(accept);
    return this.transaction(async (tx: any) => {
      const p = await lockPurchase(tx, id);
      if (p.userId !== userId)
        throw new ForbiddenException("只能确认自己的商品变更");
      const c = p.changes.find((row: any) => row.id === changeId);
      if (!c) throw new NotFoundException("变更不存在");
      if (c.status !== "pending") return { status: c.status };
      if (p.order.status !== "accepted" || c.expiresAt <= new Date())
        throw new BadRequestException("变更已失效，请让骑手重新发起");
      if (!accept)
        await tx.purchaseChange.update({
          where: { id: changeId },
          data: { status: "rejected", resolvedAt: new Date() },
        });
      else if (c.deltaCents > 0)
        await tx.purchaseChange.update({
          where: { id: changeId },
          data: { status: "awaiting_payment" },
        });
      else await applyPurchaseChange(tx, p, c);
      await purchaseEvent(
        tx,
        id,
        userId,
        accept ? "change_confirmed" : "change_rejected",
        { changeId },
      );
      return {
        status: accept
          ? c.deltaCents > 0
            ? "awaiting_payment"
            : "applied"
          : "rejected",
      };
    });
  }

  async receipt(id: string, riderId: string, stopId: string, body: any) {
    return this.transaction(async (tx: any) => {
      const p = await lockPurchase(tx, id);
      if (
        p.order.riderId !== riderId ||
        !["accepted", "in_progress", "arrived", "completed"].includes(
          p.order.status,
        )
      )
        throw new ForbiddenException("无权提交购买凭证");
      const s = p.stops.find((row: any) => row.id === stopId);
      if (!s || (s.status !== "pending" && s.auditStatus !== "rejected"))
        throw new BadRequestException("店铺不存在或凭证已通过审核");
      if (s.status === "pending" && p.order.status !== "accepted")
        throw new BadRequestException("采购阶段已结束");
      if (
        p.changes.some(
          (c: any) =>
            unresolvedChanges.includes(c.status) &&
            s.items.some((i: any) => i.id === c.itemId),
        )
      )
        throw new BadRequestException("请先处理该店商品变更");
      const actualCents = s.items.reduce(
        (n: number, i: any) => n + i.quantity * i.approvedUnitCents,
        0,
      );
      if (integer(body.actualCents, "实际货款（分）") !== actualCents)
        throw new BadRequestException(
          "实付金额与确认商品不符，请先发起差价变更",
        );
      const receiptUrls = actualCents ? urls(body.receiptUrls) : [];
      await tx.purchaseStop.update({
        where: { id: stopId },
        data: {
          actualCents,
          receiptUrls,
          status: actualCents ? "purchased" : "empty",
          purchasedAt: s.purchasedAt || new Date(),
          auditStatus: actualCents ? "pending" : "approved",
          auditNote: null,
          auditedBy: null,
          auditedAt: null,
        },
      });
      await purchaseEvent(tx, id, riderId, "receipt_submitted", {
        stopId,
        actualCents,
        receiptUrls,
      });
      return { success: true };
    });
  }

  async cancel(
    id: string,
    userId: string,
    reason: string,
    operatorId?: string,
  ) {
    const detail = await this.detail(id, userId, operatorId);
    if (!operatorId && detail.userId !== userId)
      throw new ForbiddenException("只能取消自己的订单");
    return this.transaction(async (tx: any) => {
      const p = await lockPurchase(tx, id);
      if (p.order.status === "cancelled") return { success: true };
      const allMissing = p.stops.every((s: any) =>
        s.items.every((i: any) => i.quantity === 0),
      );
      if (
        !["pending_pay", "pending_accept"].includes(p.order.status) &&
        !(p.order.status === "accepted" && (operatorId || allMissing))
      ) {
        throw new BadRequestException("骑手已开始采购，请联系后台处理取消");
      }
      if (p.stops.some((s: any) => s.status === "purchased"))
        throw new BadRequestException(
          "已有商品购买凭证，不能直接全额取消，请发起售后",
        );
      await tx.purchaseChange.updateMany({
        where: { purchaseId: id, status: { in: unresolvedChanges } },
        data: { status: "cancelled", resolvedAt: new Date() },
      });
      const paidChanges = p.changes
        .filter((c: any) => c.status === "applied" && c.deltaCents > 0)
        .reduce((n: number, c: any) => n + c.deltaCents, 0);
      const reserved = p.refunds
        .filter((r: any) => r.kind !== "late_payment")
        .reduce((n: number, r: any) => n + r.amountCents, 0);
      if (p.order.payTime)
        await queuePurchaseRefund(
          tx,
          p,
          p.initialGoodsCents +
            p.serviceCents -
            cents(p.order.couponDiscount) +
            paidChanges -
            reserved,
          "cancel",
          "cancel",
          reason || "用户取消",
        );
      // Unpaid orders return the coupon now; paid ones once the cancel refund succeeds.
      else await restoreErrandOrderCoupon(tx, p.order);
      await tx.errandOrder.update({
        where: { id },
        data: {
          status: "cancelled",
          cancelReason: text(reason || "用户取消", "原因", 200),
          cancelTime: new Date(),
        },
      });
      await tx.errandPurchase.update({
        where: { id },
        data: { reimbursementStatus: "not_required" },
      });
      if (p.order.riderId) {
        const active = await tx.errandOrder.count({
          where: {
            riderId: p.order.riderId,
            status: { in: ["accepted", "in_progress"] },
          },
        });
        const shops = await tx.order.count({
          where: { riderId: p.order.riderId, status: "SHIPPED" },
        });
        if (!active && !shops)
          await tx.regionRider.updateMany({
            where: { userId: p.order.riderId, status: "busy" },
            data: { status: "online" },
          });
      }
      await purchaseEvent(tx, id, operatorId || userId, "cancelled", {
        reason,
      });
      return { success: true };
    });
  }

  async adminData(operatorId: string, regionId: string, query: any = {}) {
    await this.adminRegion(operatorId, regionId);
    const page = integer(Number(query.page || 1), "页码", 1, 100000);
    const pageSize = integer(Number(query.pageSize || 20), "每页数量", 1, 100);
    const filters: Record<string, any> = {
      all: {},
      awaiting_receipt: { order: { status: "arrived" } },
      audit: { stops: { some: { auditStatus: "pending" } } },
      change: { changes: { some: { status: { in: unresolvedChanges } } } },
      refund: { refunds: { some: { status: "attention" } } },
      reimburse: { reimbursementStatus: "pending" },
    };
    const filter = String(query.filter || "all");
    if (!filters[filter]) throw new BadRequestException("订单筛选条件无效");
    const where: any = { regionId, ...filters[filter] };
    if (query.keyword) {
      const keyword = text(query.keyword, "搜索内容", 80);
      where.order = {
        ...(where.order || {}),
        OR: ["orderNo", "title", "deliverContact"].map((field) => ({
          [field]: { contains: keyword },
        })),
      };
    }
    const [
      shops,
      combinations,
      orders,
      p,
      total,
      active,
      audit,
      changes,
      refunds,
    ] = await Promise.all([
      this.db.purchaseShop.findMany({
        where: { regionId },
        orderBy: { sortOrder: "asc" },
        include: {
          categories: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
          products: { include: { skus: true } },
          modifierGroups: {
            orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
            include: { options: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } },
          },
        },
      }),
      this.db.purchaseCombination.findMany({
        where: { regionId },
        orderBy: { createdAt: "desc" },
      }),
      this.db.errandPurchase.findMany({
        where,
        include: purchaseInclude,
        orderBy: { createdAt: "desc" },
        take: pageSize,
        skip: (page - 1) * pageSize,
      }),
      this.db.config.findUnique({
        where: { key: purchaseConfigKey(regionId) },
      }),
      this.db.errandPurchase.count({ where }),
      this.db.errandPurchase.count({
        where: {
          regionId,
          order: {
            status: {
              in: ["pending_accept", "accepted", "in_progress", "arrived"],
            },
          },
        },
      }),
      this.db.errandPurchase.count({ where: { regionId, ...filters.audit } }),
      this.db.errandPurchase.count({ where: { regionId, ...filters.change } }),
      this.db.errandPurchase.count({ where: { regionId, ...filters.refund } }),
    ]);
    const [printers, regionTemplate] = await Promise.all([
      this.db.printerConfig.findMany({
        where: { purchaseShopId: { in: shops.map((s: any) => s.id) } },
      }),
      this.regionTicketTemplate(regionId),
    ]);
    return {
      ticketTemplate: {
        template: regionTemplate || DEFAULT_TICKET_TEMPLATE,
        custom: Boolean(regionTemplate),
        presets: TICKET_PRESETS,
      },
      shops: shops.map((s: any) => ({
        ...s,
        printer: this.printerView(
          printers.find((printer: any) => printer.purchaseShopId === s.id),
        ),
      })),
      combinations,
      orders,
      total,
      page,
      pageSize,
      overview: { active, audit, changes, refunds },
      policy: policy(p?.value),
      receiptSettings: await this.receiptSettings(regionId, p?.value ?? null),
      policyVersion: p?.updatedAt?.toISOString() || null,
    };
  }

  async compensate(operatorId: string, id: string, body: any) {
    await this.detail(id, "", operatorId);
    if (body.costBearer !== "platform")
      throw new BadRequestException("请明确确认本次补偿由平台承担");
    return this.transaction(async (tx: any) => {
      const p = await lockPurchase(tx, id);
      if (p.order.status !== "completed")
        throw new BadRequestException(
          "本入口用于已完成订单的售后补偿，采购中的异常请先协调履约",
        );
      const amount = integer(body.amountCents, "退款金额（分）", 1);
      const reason = text(body.reason, "售后原因", 160);
      const key = `compensation:${text(body.requestKey, "请求编号", 100)}`;
      const refund = await queuePurchaseRefund(
        tx,
        p,
        amount,
        key,
        "compensation",
        `平台售后补偿：${reason}`,
      );
      await purchaseEvent(tx, id, operatorId, "compensation_approved", {
        refundId: refund.id,
        amountCents: amount,
        reason,
        costBearer: "platform",
      });
      return { refundId: refund.id };
    });
  }

  async savePolicy(
    operatorId: string,
    regionId: string,
    body: any,
    expectedVersion?: string | null,
  ) {
    await this.adminRegion(operatorId, regionId);
    const p = policy(body),
      key = purchaseConfigKey(regionId);
    const current = await this.db.config.findUnique({ where: { key } });
    if (current) {
      if (!expectedVersion || Number.isNaN(new Date(expectedVersion).getTime()))
        throw new BadRequestException("请刷新区域设置后再保存");
      const changed = await this.db.config.updateMany({
        where: { key, updatedAt: new Date(expectedVersion) },
        data: { value: p, updatedBy: operatorId },
      });
      if (changed.count !== 1)
        throw new BadRequestException("其他管理员已修改设置，请刷新后重试");
    } else {
      try {
        await this.db.config.create({
          data: {
            key,
            value: p,
            group: "errand_purchase",
            createdBy: operatorId,
          },
        });
      } catch (e: any) {
        if (e.code === "P2002")
          throw new BadRequestException("设置已更新，请刷新后重试");
        throw e;
      }
    }
    return p;
  }
  async saveShop(operatorId: string, regionId: string, body: any) {
    await this.adminRegion(operatorId, regionId);
    const data = {
      regionId,
      name: text(body.name, "店铺名称", 50),
      address: text(body.address, "店铺地址"),
      logo: this.image(body.logo),
      phone: body.phone ? text(body.phone, "电话", 30) : null,
      latitude: this.coordinate(body.latitude, "纬度", 90),
      longitude: this.coordinate(body.longitude, "经度", 180),
      opensAt: assertClock(body.opensAt),
      closesAt: assertClock(body.closesAt),
      enabled: this.bool(body.enabled),
      sortOrder: integer(body.sortOrder ?? 0, "排序", 0, 10000),
    };
    if (!body.id) return this.db.purchaseShop.create({ data });
    const result = await this.db.purchaseShop.updateMany({
      where: {
        id: text(body.id, "店铺"),
        regionId,
        version: integer(body.version, "版本", 1),
      },
      data: { ...data, version: { increment: 1 } },
    });
    if (result.count !== 1)
      throw new BadRequestException("店铺已被修改，请刷新后重试");
    return { success: true };
  }
  // 出单打印机：每家店最多一台，用店家自己的云打印账号凭证；不需要的店铺不开启即可。
  private printerView(printer: any) {
    if (!printer) return null;
    return {
      id: printer.id,
      name: printer.name,
      brand: printer.brand,
      sn: printer.sn,
      enabled: printer.autoPrint && printer.status === "active",
      credentialConfigured: Boolean(printer.credentialCiphertext),
      // null means the shop follows the region default.
      ticketTemplate: storedTicketTemplate(printer.ticketTemplate),
      updatedAt: printer.updatedAt,
    };
  }
  private async regionTicketTemplate(regionId: string) {
    const row = await this.db.config.findUnique({
      where: { key: ticketTemplateKey(regionId) },
    });
    return storedTicketTemplate(row?.value);
  }
  /** Shop template, else region default, else the built-in layout. */
  private async ticketTemplates(
    pairs: { regionId: string; printer: any }[],
  ): Promise<Map<string, TicketTemplate>> {
    const regionIds = [...new Set(pairs.map((pair) => pair.regionId))];
    const rows = regionIds.length
      ? await this.db.config.findMany({
          where: { key: { in: regionIds.map(ticketTemplateKey) } },
        })
      : [];
    const result = new Map<string, TicketTemplate>();
    for (const { regionId, printer } of pairs) {
      const region = rows.find((row: any) => row.key === ticketTemplateKey(regionId));
      result.set(
        `${regionId}:${printer.id}`,
        storedTicketTemplate(printer.ticketTemplate) ||
          storedTicketTemplate(region?.value) ||
          DEFAULT_TICKET_TEMPLATE,
      );
    }
    return result;
  }
  async saveTicketTemplate(operatorId: string, regionId: string, template: any) {
    await this.adminRegion(operatorId, regionId);
    const key = ticketTemplateKey(regionId);
    if (template === null) {
      await this.db.config.deleteMany({ where: { key } });
      return { template: DEFAULT_TICKET_TEMPLATE, custom: false };
    }
    const value = normalizeTicketTemplate(template);
    await this.db.config.upsert({
      where: { key },
      update: { value, updatedBy: operatorId },
      create: { key, value, group: "errand_purchase", createdBy: operatorId },
    });
    return { template: value, custom: true };
  }
  async saveShopTicketTemplate(
    operatorId: string,
    regionId: string,
    shopId: string,
    template: any,
  ) {
    const { printer } = await this.shopPrinter(operatorId, regionId, shopId);
    const value = template === null ? null : normalizeTicketTemplate(template);
    const updated = await this.db.printerConfig.update({
      where: { id: printer.id },
      data: { ticketTemplate: value ?? Prisma.DbNull },
    });
    return this.printerView(updated);
  }
  /** Renders a sample order for the editor; template errors come back as data so typing is not interrupted. */
  async previewTicket(operatorId: string, regionId: string, body: any) {
    await this.adminRegion(operatorId, regionId);
    const shop = body.shopId
      ? await this.db.purchaseShop.findFirst({
          where: { id: text(body.shopId, "店铺"), regionId },
          select: { name: true },
        })
      : null;
    try {
      const template = normalizeTicketTemplate(body.template);
      const parts = renderTicketParts(template, sampleTicketData(shop?.name));
      return {
        content: parts.map((part) => part.markup).join(""),
        parts,
        error: null,
      };
    } catch (error: any) {
      if (error instanceof BadRequestException)
        return { content: null, parts: [], error: error.message };
      throw error;
    }
  }
  private printService() {
    if (!this.printer) throw new BadRequestException("云打印服务未启用");
    return this.printer;
  }
  private async adminShop(operatorId: string, regionId: string, shopId: string) {
    await this.adminRegion(operatorId, regionId);
    const shop = await this.db.purchaseShop.findFirst({
      where: { id: text(shopId, "店铺"), regionId },
    });
    if (!shop) throw new NotFoundException("店铺不存在");
    return shop;
  }
  private async shopPrinter(operatorId: string, regionId: string, shopId: string) {
    const shop = await this.adminShop(operatorId, regionId, shopId);
    const printer = await this.db.printerConfig.findUnique({
      where: { purchaseShopId: shop.id },
    });
    if (!printer) throw new BadRequestException("这家店还没有配置打印机");
    return { shop, printer };
  }
  async savePrinter(operatorId: string, regionId: string, shopId: string, body: any) {
    const print = this.printService();
    const shop = await this.adminShop(operatorId, regionId, shopId);
    const brand = String(body.brand || "");
    if (!PURCHASE_PRINT_BRANDS.includes(brand))
      throw new BadRequestException("请选择打印机品牌");
    const current = await this.db.printerConfig.findUnique({
      where: { purchaseShopId: shop.id },
    });
    const data = {
      name: body.name ? text(body.name, "打印机名称", 30) : `${shop.name}出单机`,
      brand,
      sn: text(body.sn, "打印机编号", 64),
      autoPrint: this.bool(body.enabled),
      status: "active",
      isDefault: true,
      // Each shop uses its own vendor account, never the platform one.
      ...print.prepareConnection(
        brand,
        { ...body, connectionMode: "merchant_owned" },
        current,
      ),
    };
    let printer: any;
    try {
      printer = current
        ? await this.db.printerConfig.update({ where: { id: current.id }, data })
        : await this.db.printerConfig.create({
            data: { ...data, purchaseShopId: shop.id },
          });
    } catch (error: any) {
      if (error.code === "P2002")
        throw new BadRequestException("打印机已被其他管理员修改，请刷新后重试");
      throw error;
    }
    const bind =
      brand === "feie"
        ? await print
            .bindFeieDevice(printer.id)
            .catch((error: any) => ({
              bound: false,
              message: String(error?.message || "飞鹅云添加设备失败"),
            }))
        : null;
    return { printer: this.printerView(printer), bind };
  }
  async deletePrinter(operatorId: string, regionId: string, shopId: string) {
    const { printer } = await this.shopPrinter(operatorId, regionId, shopId);
    await this.db.printerConfig.delete({ where: { id: printer.id } });
    return { success: true };
  }
  async testPrinter(operatorId: string, regionId: string, shopId: string) {
    const print = this.printService();
    const { shop, printer } = await this.shopPrinter(operatorId, regionId, shopId);
    // Prints a sample ticket in the shop's real layout, marked as a test.
    const template = (await this.ticketTemplates([{ regionId, printer }])).get(
      `${regionId}:${printer.id}`,
    )!;
    const job = await print.printSample(
      printer.id,
      renderPurchaseTicket(template, { ...sampleTicketData(shop.name), test: true }),
    );
    return { status: job.status, error: job.errorMessage || null };
  }
  async printerStatus(operatorId: string, regionId: string, shopId: string) {
    const print = this.printService();
    const { printer } = await this.shopPrinter(operatorId, regionId, shopId);
    return print.printerStatus(printer.id);
  }

  async saveCategory(operatorId: string, regionId: string, body: any) {
    await this.adminRegion(operatorId, regionId);
    const shopId = text(body.shopId, "店铺"), parentId = body.parentId ? text(body.parentId, "上级分类") : null;
    const name = text(body.name, "分类名称", 30);
    return this.transaction(async (tx: any) => {
      // Serialize category edits in a shop (also used by product assignment).
      const locked = await tx.purchaseShop.updateMany({ where: { id: shopId, regionId }, data: { version: { increment: 1 } } });
      if (locked.count !== 1) throw new BadRequestException("店铺不属于当前区域");
      if (parentId) {
        if (parentId === body.id) throw new BadRequestException("分类不能是自己的上级");
        const parent = await tx.purchaseCategory.findFirst({ where: { id: parentId, shopId } });
        if (!parent || parent.parentId) throw new BadRequestException("只能选择本店的一级分类作为上级");
        if (body.id && await tx.purchaseCategory.count({ where: { parentId: body.id } })) throw new BadRequestException("含子分类的一级分类不能移动到第二级");
      }
      if (await tx.purchaseCategory.findFirst({ where: { shopId, parentId, name, ...(body.id ? { id: { not: body.id } } : {}) } }))
        throw new BadRequestException("同一层级的分类名称不能重复");
      const data = { shopId, parentId, name, enabled: this.bool(body.enabled), sortOrder: integer(body.sortOrder ?? 0, "排序", 0, 10000) };
      if (!body.id) return tx.purchaseCategory.create({ data });
      const result = await tx.purchaseCategory.updateMany({ where: { id: text(body.id, "分类"), shopId, version: integer(body.version, "版本", 1) }, data: { ...data, version: { increment: 1 } } });
      if (result.count !== 1) throw new BadRequestException("分类已被修改，请刷新后重试");
      await tx.purchaseProduct.updateMany({ where: { categoryId: body.id, shopId }, data: { category: name, version: { increment: 1 } } });
      return { success: true };
    });
  }

  async saveProduct(operatorId: string, regionId: string, body: any) {
    await this.adminRegion(operatorId, regionId);
    const shopId = text(body.shopId, "店铺");
    const shop = await this.db.purchaseShop.findFirst({
      where: { id: shopId, regionId },
    });
    if (!shop) throw new BadRequestException("店铺不属于当前区域");
    const data = {
      shopId,
      name: text(body.name, "商品名称", 60),
      image: this.image(body.image),
      category: text(body.category || "全部商品", "分类", 30),
      enabled: this.bool(body.enabled),
      sortOrder: integer(body.sortOrder ?? 0, "排序", 0, 10000),
    };
    if (!Array.isArray(body.skus) || !body.skus.length || body.skus.length > 30)
      throw new BadRequestException("请设置1至30个规格");
    const skus = body.skus.map((s: any) => ({
      id: s.id,
      name: text(s.name, "规格名称", 60),
      priceCents: integer(s.priceCents, "价格（分）", 1, 1000000),
      weightGrams: integer(s.weightGrams, "重量（克）", 0, 100000),
      enabled: this.bool(s.enabled),
    }));
    if (new Set(skus.map((s: any) => s.name)).size !== skus.length)
      throw new BadRequestException("规格名称不能重复");
    return this.transaction(async (tx: any) => {
      await tx.purchaseShop.updateMany({ where: { id: shopId, regionId }, data: { version: { increment: 1 } } });
      let category: any;
      if (body.categoryId) {
        category = await tx.purchaseCategory.findFirst({ where: { id: text(body.categoryId, "分类"), shopId } });
        if (!category) throw new BadRequestException("分类不属于当前店铺");
      } else {
        // Existing clients can still submit the original flat category label.
        const name = data.category === "全部商品" ? "其他商品" : data.category;
        category = await tx.purchaseCategory.findFirst({ where: { shopId, parentId: null, name } });
        if (!category) category = await tx.purchaseCategory.create({ data: { shopId, name } });
      }
      Object.assign(data, { categoryId: category.id, category: category.name });
      // Older admin pages do not send bindings; leave the stored ones untouched then.
      if (body.modifierBindings !== undefined) {
        const groups = await tx.purchaseModifierGroup.findMany({ where: { shopId }, include: { options: true } });
        Object.assign(data, { modifierBindings: normalizeBindings(body.modifierBindings, groups) });
      }
      let productId = body.id;
      if (productId) {
        const updated = await tx.purchaseProduct.updateMany({
          where: {
            id: productId,
            shopId,
            version: integer(body.version, "版本", 1),
          },
          data: { ...data, version: { increment: 1 } },
        });
        if (updated.count !== 1)
          throw new BadRequestException("商品已修改，请刷新后重试");
        // Sizes left out of the form are deleted; order items keep their own snapshot.
        await tx.purchaseSku.deleteMany({
          where: { productId, id: { notIn: skus.filter((s: any) => s.id).map((s: any) => s.id) } },
        });
      } else productId = (await tx.purchaseProduct.create({ data })).id;
      for (const sku of skus) {
        const { id, ...fields } = sku;
        if (id) {
          const updated = await tx.purchaseSku.updateMany({
            where: { id, productId },
            data: { ...fields, version: { increment: 1 } },
          });
          if (updated.count !== 1)
            throw new BadRequestException("规格不属于当前商品");
        } else await tx.purchaseSku.create({ data: { ...fields, productId } });
      }
      return { id: productId };
    });
  }
  // Omitted options are disabled rather than deleted, so order snapshots stay traceable.
  async saveModifierGroup(operatorId: string, regionId: string, body: any) {
    await this.adminRegion(operatorId, regionId);
    const shopId = text(body.shopId, "店铺");
    const { group, options } = normalizeModifierGroup(body);
    return this.transaction(async (tx: any) => {
      // Serialize library edits per shop, as categories and products do.
      const locked = await tx.purchaseShop.updateMany({ where: { id: shopId, regionId }, data: { version: { increment: 1 } } });
      if (locked.count !== 1) throw new BadRequestException("店铺不属于当前区域");
      if (await tx.purchaseModifierGroup.findFirst({ where: { shopId, name: group.name, ...(body.id ? { id: { not: body.id } } : {}) } }))
        throw new BadRequestException("同一店铺的规格组名称不能重复");
      let groupId = body.id;
      if (groupId) {
        const updated = await tx.purchaseModifierGroup.updateMany({
          where: { id: text(groupId, "规格组"), shopId, version: integer(body.version, "版本", 1) },
          data: { ...group, version: { increment: 1 } },
        });
        if (updated.count !== 1) throw new BadRequestException("规格组已被修改，请刷新后重试");
        // Options removed from the form are deleted; order snapshots keep their own copy.
        const kept = options.filter((o: any) => o.id).map((o: any) => o.id);
        const removed = await tx.purchaseModifierOption.findMany({ where: { groupId, id: { notIn: kept } }, select: { id: true } });
        if (removed.length) {
          await tx.purchaseModifierOption.deleteMany({ where: { id: { in: removed.map((o: any) => o.id) } } });
          await this.scrubModifierBindings(tx, shopId, [], removed.map((o: any) => o.id));
        }
      } else groupId = (await tx.purchaseModifierGroup.create({ data: { ...group, shopId } })).id;
      for (const option of options) {
        const { id, ...fields } = option;
        if (id) {
          const updated = await tx.purchaseModifierOption.updateMany({
            where: { id, groupId },
            data: { ...fields, version: { increment: 1 } },
          });
          if (updated.count !== 1) throw new BadRequestException("选项不属于当前规格组，请刷新后重试");
        } else await tx.purchaseModifierOption.create({ data: { ...fields, groupId } });
      }
      return { id: groupId };
    });
  }
  async deleteModifierGroup(operatorId: string, regionId: string, groupId: string, version: unknown) {
    await this.adminRegion(operatorId, regionId);
    const id = text(groupId, "规格组"), expected = integer(version, "版本", 1);
    return this.transaction(async (tx: any) => {
      const group = await tx.purchaseModifierGroup.findFirst({ where: { id, shop: { regionId } } });
      if (!group) throw new BadRequestException("规格组不存在或已删除，请刷新");
      // Same shop lock as the other library edits.
      await tx.purchaseShop.updateMany({ where: { id: group.shopId, regionId }, data: { version: { increment: 1 } } });
      if (!(await tx.purchaseModifierGroup.findFirst({ where: { id, version: expected } })))
        throw new BadRequestException("规格组已被修改，请刷新后重试");
      await tx.purchaseModifierOption.deleteMany({ where: { groupId: id } });
      await tx.purchaseModifierGroup.delete({ where: { id } });
      return { success: true, products: await this.scrubModifierBindings(tx, group.shopId, [id], []) };
    });
  }
  async setModifierSoldOut(operatorId: string, regionId: string, optionId: string, soldOut: unknown) {
    await this.adminRegion(operatorId, regionId);
    const value = this.bool(soldOut);
    return this.transaction(async (tx: any) => {
      const option = await tx.purchaseModifierOption.findFirst({
        where: { id: text(optionId, "选项"), group: { shop: { regionId } } },
      });
      if (!option) throw new BadRequestException("选项不属于当前区域");
      await tx.purchaseModifierOption.update({ where: { id: option.id }, data: { soldOut: value, version: { increment: 1 } } });
      // An open edit form for this group must not silently restore the old flag.
      await tx.purchaseModifierGroup.update({ where: { id: option.groupId }, data: { version: { increment: 1 } } });
      return { success: true, soldOut: value };
    });
  }
  async saveCombination(operatorId: string, regionId: string, body: any) {
    await this.adminRegion(operatorId, regionId);
    if (
      !Array.isArray(body.shopIds) ||
      body.shopIds.some((id: any) => typeof id !== "string")
    )
      throw new BadRequestException("请选择店铺");
    const shopIds = canonicalShops(body.shopIds),
      p = await this.config(this.db, regionId);
    integer(shopIds.length, "组合店铺数量", 2, p.maxShops);
    if (
      (await this.db.purchaseShop.count({
        where: { id: { in: shopIds }, regionId },
      })) !== shopIds.length
    )
      throw new BadRequestException("组合店铺必须属于当前区域");
    const data = {
      regionId,
      shopIds,
      shopKey: shopIds.join("|"),
      name: text(body.name, "组合名称", 60),
      enabled: this.bool(body.enabled),
      extraFeeCents: integer(body.extraFeeCents, "多店附加费（分）", 0, 100000),
      maxGoodsCents: integer(
        body.maxGoodsCents,
        "组合货款限额（分）",
        1,
        p.maxGoodsCents,
      ),
    };
    if (!body.id) return this.db.purchaseCombination.create({ data });
    const updated = await this.db.purchaseCombination.updateMany({
      where: {
        id: body.id,
        regionId,
        version: integer(body.version, "版本", 1),
      },
      data: { ...data, version: { increment: 1 } },
    });
    if (updated.count !== 1)
      throw new BadRequestException("合单规则已变化，请刷新");
    return { success: true };
  }
  async audit(operatorId: string, id: string, stopId: string, body: any) {
    const p = await this.detail(id, "", operatorId);
    this.bool(body.approved);
    return this.transaction(async (tx: any) => {
      const current = await lockPurchase(tx, id),
        s = current.stops.find((s: any) => s.id === stopId);
      if (!s || s.status !== "purchased" || s.auditStatus !== "pending")
        throw new BadRequestException("该凭证不在待审核状态");
      await tx.purchaseStop.update({
        where: { id: stopId },
        data: {
          auditStatus: body.approved ? "approved" : "rejected",
          auditNote: text(body.note, "审核说明", 200),
          auditedBy: operatorId,
          auditedAt: new Date(),
        },
      });
      await purchaseEvent(tx, p.id, operatorId, "receipt_audited", {
        stopId,
        approved: body.approved,
        note: body.note,
      });
      return { success: true };
    });
  }

  private async notifyChange(id: string) {
    const p = await this.db.errandPurchase.findUnique({ where: { id } });
    await this.notify
      .createAndDispatch({
        type: "delivery",
        userId: p.userId,
        scene: "errand_purchase_change",
        title: "代买商品有变更",
        content: "骑手提交了商品变更，请查看并确认。",
        data: { orderId: id },
        linkType: "page",
        linkValue: `/pagesA/purchase/detail/detail?id=${id}`,
      } as any)
      .catch((error) => this.logger.warn(error.message));
  }

  // 骑手接单后给开启出单的店铺各打一张小票；订单取消后补打取消单。
  // Polling covers every path into "accepted" (rider, student receiver, admin dispatch)
  // without touching the errand or payment code.
  @Interval(5000)
  async printTick() {
    if (!this.printer) return;
    await this.redis
      .withLock("errand-purchase:print", 30, () => this.queuePrintTickets())
      .catch((error: any) => this.logger.warn(`代买出单: ${error.message}`));
  }

  async queuePrintTickets() {
    const print = this.printer;
    if (!print) return;
    const printers = await this.db.printerConfig.findMany({
      where: { purchaseShopId: { not: null }, status: "active" },
    });
    if (!printers.length) return;
    await this.queueNewTickets(
      print,
      printers.filter((printer: any) => printer.autoPrint),
    );
    await this.queueCancelTickets(print, printers);
  }

  private async queueNewTickets(print: PrintService, printers: any[]) {
    if (!printers.length) return;
    const byShop = new Map<string, any>(
      printers.map((printer: any) => [printer.purchaseShopId, printer]),
    );
    const purchases = await this.db.errandPurchase.findMany({
      where: {
        order: {
          status: "accepted",
          acceptTime: { gte: new Date(Date.now() - PURCHASE_TICKET_WINDOW_MS) },
        },
        stops: { some: { shopId: { in: [...byShop.keys()] }, status: "pending" } },
      },
      include: {
        order: true,
        stops: { orderBy: { sortOrder: "asc" }, include: { items: true } },
      },
      orderBy: { createdAt: "asc" },
      take: 50,
    });
    const due = purchases.flatMap((p: any) =>
      p.stops
        .filter(
          (s: any) =>
            s.status === "pending" &&
            byShop.has(s.shopId) &&
            s.items.some((i: any) => i.quantity > 0),
        )
        .map((s: any) => ({ p, s })),
    );
    if (!due.length) return;
    const queued = new Set(
      (
        await this.db.printJob.findMany({
          where: {
            bizType: PURCHASE_PRINT_BIZ,
            event: "purchase",
            bizId: { in: due.map(({ s }: any) => s.id) },
          },
          select: { bizId: true },
        })
      ).map((job: any) => job.bizId),
    );
    const riderIds = [
      ...new Set(due.map(({ p }: any) => p.order.riderId).filter(Boolean)),
    ];
    const [riders, users] = await Promise.all([
      this.db.regionRider.findMany({
        where: { userId: { in: riderIds } },
        select: { userId: true, realName: true, phone: true, anonymous: true },
      }),
      this.db.user.findMany({
        where: { id: { in: riderIds } },
        select: { id: true, phone: true },
      }),
    ]);
    const templates = await this.ticketTemplates(
      due.map(({ p, s }: any) => ({ regionId: p.regionId, printer: byShop.get(s.shopId) })),
    );
    for (const { p, s } of due) {
      if (queued.has(s.id) || !p.order.riderId) continue;
      const rider =
        riders.find((r: any) => r.userId === p.order.riderId) ||
        users.find((u: any) => u.id === p.order.riderId) ||
        null;
      const printer = byShop.get(s.shopId);
      const template = templates.get(`${p.regionId}:${printer.id}`)!;
      await print.enqueue({
        printer,
        event: "purchase",
        dedupeKey: `purchase:${s.id}:new`,
        copies: template.copies,
        content: renderPurchaseTicket(template, {
          shopName: s.snapshot?.name || "代买店铺",
          orderNo: p.order.orderNo,
          acceptTime: p.order.acceptTime,
          rider: purchaseRiderLabel(rider),
          remark: p.order.remark,
          stopIndex: p.stops.indexOf(s),
          stopCount: p.stops.length,
          items: s.items.map((i: any) => ({
            name: i.snapshot?.productName,
            spec: i.snapshot?.specText || i.snapshot?.skuName,
            quantity: i.quantity,
            unitCents: i.approvedUnitCents,
          })),
        }),
        orderId: p.id,
        bizType: PURCHASE_PRINT_BIZ,
        bizId: s.id,
        expiresAt: new Date(Date.now() + PURCHASE_TICKET_TTL_MS),
      });
    }
  }

  private async queueCancelTickets(print: PrintService, printers: any[]) {
    const tickets = await this.db.printJob.findMany({
      where: {
        bizType: PURCHASE_PRINT_BIZ,
        event: "purchase",
        status: { notIn: ["cancelled", "expired"] },
        createdAt: { gte: new Date(Date.now() - PURCHASE_CANCEL_WINDOW_MS) },
      },
    });
    if (!tickets.length) return;
    const orders = await this.db.errandOrder.findMany({
      where: {
        id: { in: [...new Set(tickets.map((t: any) => t.orderId))] },
        status: "cancelled",
      },
      select: { id: true, orderNo: true, cancelTime: true, regionId: true },
    });
    if (!orders.length) return;
    const stopIds = tickets.map((t: any) => t.bizId);
    const [sent, stops] = await Promise.all([
      this.db.printJob.findMany({
        where: {
          bizType: PURCHASE_PRINT_BIZ,
          event: "purchase_cancel",
          bizId: { in: stopIds },
        },
        select: { bizId: true },
      }),
      this.db.purchaseStop.findMany({
        where: { id: { in: stopIds } },
        select: { id: true, snapshot: true },
      }),
    ]);
    const cancelled = new Set(sent.map((job: any) => job.bizId));
    for (const ticket of tickets) {
      const order = orders.find((o: any) => o.id === ticket.orderId);
      if (!order || cancelled.has(ticket.bizId)) continue;
      // Not sent to the printer yet: withdraw it instead of printing it plus a cancel slip.
      const withdrawn = await this.db.printJob.updateMany({
        where: { id: ticket.id, status: { in: ["queued", "failed"] } },
        data: { status: "cancelled", errorMessage: "代买订单已取消，不再出单" },
      });
      // A ticket mid-submission is settled on the next tick.
      if (withdrawn.count || ticket.status === "processing") continue;
      const printer = printers.find((row: any) => row.id === ticket.printerId);
      if (!printer) continue;
      const template = (
        await this.ticketTemplates([{ regionId: order.regionId, printer }])
      ).get(`${order.regionId}:${printer.id}`)!;
      await print.enqueue({
        printer,
        event: "purchase_cancel",
        dedupeKey: `purchase:${ticket.bizId}:cancel`,
        content: purchaseCancelTicket({
          shopName:
            stops.find((s: any) => s.id === ticket.bizId)?.snapshot?.name ||
            "代买店铺",
          orderNo: order.orderNo,
          cancelTime: order.cancelTime || new Date(),
        }, template),
        orderId: order.id,
        bizType: PURCHASE_PRINT_BIZ,
        bizId: ticket.bizId,
        expiresAt: new Date(Date.now() + PURCHASE_TICKET_TTL_MS),
      });
    }
  }

  @Interval(30000)
  async tick() {
    const lock = (this.redis as any).withRenewingLock || this.redis.withLock;
    return lock
      .call(this.redis, "errand-purchase:worker", 60, async () => {
        const expired = await this.db.purchaseChange.findMany({
          where: {
            status: { in: unresolvedChanges },
            expiresAt: { lte: new Date() },
          },
          take: 50,
        });
        for (const c of expired)
          await this.transaction(async (tx: any) => {
            await lockPurchase(tx, c.purchaseId);
            await tx.purchaseChange.updateMany({
              where: {
                id: c.id,
                status: { in: unresolvedChanges },
                expiresAt: { lte: new Date() },
              },
              data: { status: "expired", resolvedAt: new Date() },
            });
          });
        const stale = await this.db.errandPurchase.findMany({
          where: {
            order: { status: "pending_pay" },
            createdAt: { lte: new Date(Date.now() - 15 * 60000) },
          },
          take: 30,
        });
        for (const p of stale)
          await this.cancel(p.id, p.userId, "付款超时").catch(() => undefined);
        const refunds = await this.db.purchaseRefund.findMany({
          where: { status: { not: "success" } },
          orderBy: { updatedAt: "asc" },
          take: 30,
        });
        for (const r of refunds) await this.processRefund(r);
        const purchases = await this.db.errandPurchase.findMany({
          where: {
            reimbursementStatus: "pending",
            order: { status: "completed" },
          },
          orderBy: { updatedAt: "asc" },
          take: 30,
        });
        for (const p of purchases)
          await this.reimburse(p.id).catch((error) =>
            this.logger.warn(`垫款返还 ${p.id}: ${error.message}`),
          );
      })
      .catch((error: any) => this.logger.warn(`代买任务: ${error.message}`));
  }

  async retryRefund(operatorId: string, id: string, refundId: string) {
    await this.detail(id, "", operatorId);
    const job = await this.transaction(async (tx: any) => {
      await lockPurchase(tx, id);
      const row = await tx.purchaseRefund.findFirst({
        where: { id: refundId, purchaseId: id },
      });
      if (!row || row.status === "success")
        throw new BadRequestException("退款任务不存在或已完成");
      // Reuse the original provider refund number. Unknown outcomes stay processing.
      for (const allocation of row.allocations)
        await tx.paymentRefund.updateMany({
          where: {
            sourceType: "purchase_refund",
            sourceId: `${row.id}:${allocation.paymentId}`,
            status: "failed",
          },
          data: { status: "pending", failReason: null },
        });
      await purchaseEvent(tx, id, operatorId, "refund_retry", { refundId });
      return row;
    });
    await this.processRefund(job);
    return { success: true };
  }

  private async processRefund(r: any) {
    try {
      let completed = true;
      for (const allocation of r.allocations) {
        const result: any = await this.payment.refund({
          bizType: allocation.bizType,
          bizId: allocation.bizId,
          amount: money(allocation.amountCents),
          reason: r.reason,
          sourceType: "purchase_refund",
          sourceId: `${r.id}:${allocation.paymentId}`,
        });
        if (result.status !== "success") completed = false;
      }
      await this.transaction(async (tx: any) => {
        const updated = await tx.purchaseRefund.updateMany({
          where: { id: r.id, status: { not: "success" } },
          data: { status: completed ? "success" : "processing", lastError: null },
        });
        if (!completed || updated.count !== 1 || r.kind !== "cancel") return;
        const order = await tx.errandOrder.findUnique({
          where: { id: r.purchaseId },
          select: { id: true, userId: true, orderNo: true },
        });
        if (order) await restoreErrandOrderCoupon(tx, order);
      });
    } catch (error: any) {
      await this.db.purchaseRefund.updateMany({
        where: { id: r.id, status: { not: "success" } },
        data: {
          status: "attention",
          lastError: String(error.message).slice(0, 500),
        },
      });
    }
  }

  // Returns the rider's goods money: the wallet is credited first, then the same amount is
  // queued for a WeChat transfer when the rider can receive one; otherwise it stays in the wallet.
  async reimburse(id: string) {
    const result = await this.transaction(async (tx: any) => {
      const p = await lockPurchase(tx, id);
      if (
        p.order.status !== "completed" ||
        !p.order.riderId ||
        p.reimbursementStatus !== "pending" ||
        p.stops.some(
          (s: any) =>
            !["purchased", "empty"].includes(s.status) ||
            s.auditStatus !== "approved",
        ) ||
        p.refunds.some((r: any) => r.status !== "success") ||
        p.changes.some((c: any) => unresolvedChanges.includes(c.status))
      )
        return;
      const [appeal, risk, hold] = await Promise.all([
        tx.orderAppeal.findFirst({
          where: {
            orderId: id,
            orderType: { in: ["errand", "errand_order"] },
            status: {
              notIn: [
                "resolved",
                "rejected",
                "closed",
                "cancelled",
                "completed",
              ],
            },
          },
        }),
        tx.deliveryRiskEvent.findFirst({
          where: { orderId: id, orderType: "errand", handled: false },
        }),
        tx.errandSettlementHold.findUnique({ where: { orderId: id } }),
      ]);
      if (appeal || risk || (hold && hold.status !== "released")) return;
      const principal = p.stops.reduce(
        (n: number, s: any) => n + s.actualCents,
        0,
      );
      if (principal !== p.approvedGoodsCents)
        throw new BadRequestException("购买凭证与货款不一致");
      await tx.errandPurchase.update({
        where: { id },
        data: {
          reimbursementStatus: "paid",
          reimbursedCents: principal,
          reimbursedAt: new Date(),
        },
      });
      if (principal) {
        const wallet = await tx.wallet.upsert({
          where: { userId: p.order.riderId },
          create: {
            userId: p.order.riderId,
            balance: money(principal),
            totalIn: money(principal),
          },
          update: {
            balance: { increment: money(principal) },
            totalIn: { increment: money(principal) },
          },
        });
        await tx.walletTransaction.create({
          data: {
            userId: p.order.riderId,
            type: "PURCHASE_REIMBURSEMENT",
            amount: money(principal),
            balance: wallet.balance,
            channel: "BALANCE",
            orderNo: p.order.orderNo,
            description: "代买垫付货款返还（不计跑腿收益）",
            status: "SUCCESS",
          },
        });
      }
      const payout = principal && this.riderPayout
        ? await this.riderPayout.reserve(tx, p.order, money(principal), "purchase_principal")
        : undefined;
      await purchaseEvent(tx, id, "system", "reimbursed", {
        principalCents: principal,
        payout: payout?.status || "WALLET",
      });
      return principal ? { order: p.order, principal, payout } : undefined;
    });
    if (!result || !this.riderPayout) return;
    if (result.payout?.status === "QUEUED") return this.riderPayout.kick();
    await this.riderPayout.announce({
      userId: result.order.riderId,
      orderId: id,
      orderNo: result.order.orderNo,
      kind: "purchase_principal",
      amountFen: result.principal,
      outcome: "WALLET",
      reason: result.payout?.reason || "",
      eventKey: `purchase_reimbursed:${id}`,
    });
  }
}
