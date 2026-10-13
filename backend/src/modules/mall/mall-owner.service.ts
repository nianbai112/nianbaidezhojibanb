import { AdministrativeDivisionService } from '../address/administrative-division.service';
import { mallFreightRules, mallPromotionLimits } from './mall-checkout';
import { BadRequestException, Optional, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';

function valueText(value: unknown, max = 200, required = false) {
  const text = typeof value === 'string' ? value.trim() : '';
  if ((required && !text) || text.length > max) throw new BadRequestException('字段长度不正确');
  return text;
}
function whole(value: unknown, max = 1000000, min = 0) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < min || n > max || value === '' || value == null) throw new BadRequestException('数量格式不正确');
  return n;
}
function money(value: unknown, allowZero = true) {
  const text = String(value ?? '');
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(text)) throw new BadRequestException('金额最多保留两位小数');
  const amount = Number(text);
  if (!allowZero && amount <= 0) throw new BadRequestException('金额必须大于零');
  return amount;
}
function image(value: unknown) {
  const url = valueText(value, 1000);
  if (url && !/^https:\/\/[^\s]+$/.test(url) && !/^\/(?:uploads|api\/uploads)\/[^\s]+$/.test(url)) throw new BadRequestException('图片地址格式不正确');
  return url;
}
function images(value: unknown) {
  if (!Array.isArray(value) || value.length > 9) throw new BadRequestException('最多上传九张商品图片');
  return value.map(image).filter(Boolean);
}
function pageOf(query: any) { return { page: whole(query.page ?? 1, 100000, 1), pageSize: whole(query.limit ?? query.pageSize ?? 20, 100, 1) }; }
function statusOf(value: any, choices: string[], fallback?: string) {
  const status = String(value ?? fallback ?? '');
  if (!choices.includes(status)) throw new BadRequestException('状态不正确');
  return status;
}

/** Every owner decision and dependent write share a serializable transaction. Admin APIs remain separate. */
@Injectable()
export class MallOwnerService {
  constructor(private readonly prisma: PrismaService, @Optional() private readonly divisions?: AdministrativeDivisionService) {}

  private async transaction<T>(work: (tx: any) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try { return await this.prisma.$transaction(work, { isolationLevel: 'Serializable' }); }
      catch (error: any) { if (error?.code !== 'P2034') throw error; if (attempt === 2) throw new ConflictException('店铺数据已变化，请刷新后重试'); }
    }
    throw new ConflictException('请重试');
  }
  private async owner(tx: any, userId: string, merchantId: string, regionId: unknown, writable = true) {
    if (!userId || !merchantId || !valueText(regionId, 191, true)) throw new ForbiddenException('请先选择校区');
    const merchant = await tx.mallMerchant.findFirst({ where: { id: merchantId, userId, regionId: String(regionId) } });
    if (!merchant) throw new ForbiddenException('无权管理该校区店铺');
    if (writable && !['approved', 'closed'].includes(merchant.status)) throw new ForbiddenException('店铺审核通过后才能经营');
    return merchant;
  }
  private async child(tx: any, model: string, id: string, merchantId: string) {
    const row = await tx[model].findFirst({ where: { id, merchantId } });
    if (!row) throw new NotFoundException('记录不存在或不属于当前店铺');
    return row;
  }
  async merchants(userId: string, query: any) {
    const regionId = valueText(query.region_id, 191, true);
    return this.prisma.mallMerchant.findMany({ where: { userId, regionId }, orderBy: { createdAt: 'desc' } });
  }
  async dashboard(userId: string, merchantId: string, query: any) {
    return this.transaction(async tx => {
      const merchant = await this.owner(tx, userId, merchantId, query.region_id, false);
      const [products, pendingShipment, pendingRefund, reviews] = await Promise.all([
        tx.mallProduct.count({ where: { merchantId } }), tx.mallOrder.count({ where: { merchantId, status: 'paid' } }),
        tx.mallRefund.count({ where: { order: { merchantId }, status: 'applying' } }), tx.mallReview.count({ where: { merchantId } }),
      ]);
      return { merchant, products, pendingShipment, pendingRefund, reviews };
    });
  }
  async updateMerchant(userId: string, merchantId: string, dto: any) {
    return this.transaction(async tx => {
      await this.owner(tx, userId, merchantId, dto.region_id);
      const data: any = {};
      for (const key of ['name', 'phone', 'address', 'businessHours', 'description']) if (dto[key] !== undefined) data[key] = valueText(dto[key], key === 'description' ? 2000 : 200, ['name', 'phone'].includes(key));
      if (data.phone && !/^\+?[\d\s-]{6,20}$/.test(data.phone)) throw new BadRequestException('联系电话格式不正确');
      for (const key of ['logo', 'cover']) if (dto[key] !== undefined) data[key] = image(dto[key]);
      for (const key of ['latitude', 'longitude']) if (dto[key] !== undefined) { const n = Number(dto[key]); if (!Number.isFinite(n) || Math.abs(n) > (key === 'latitude' ? 90 : 180)) throw new BadRequestException('坐标不正确'); data[key] = n; }
      if (dto.status !== undefined) data.status = statusOf(dto.status, ['approved', 'closed']);
      return tx.mallMerchant.update({ where: { id: merchantId }, data });
    });
  }
  async products(userId: string, merchantId: string, query: any) {
    return this.transaction(async tx => {
      await this.owner(tx, userId, merchantId, query.region_id);
      const { page, pageSize } = pageOf(query);
      const where: any = { merchantId };
      if (query.status) where.status = statusOf(query.status, ['on_sale', 'off_sale']);
      if (query.keyword) where.name = { contains: valueText(query.keyword, 100) };
      if (query.stock_warning === '1') where.stock = { lte: whole(query.threshold ?? 10, 10000) };
      const [list, total] = await Promise.all([tx.mallProduct.findMany({ where, include: { skus: true }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }), tx.mallProduct.count({ where })]);
      return { list, total, page, pageSize };
    });
  }
  async product(userId: string, merchantId: string, id: string, query: any) {
    return this.transaction(async tx => { await this.owner(tx, userId, merchantId, query.region_id); await this.child(tx, 'mallProduct', id, merchantId); return tx.mallProduct.findUnique({ where: { id }, include: { skus: true } }); });
  }
  async saveProduct(userId: string, merchantId: string, id: string | null, dto: any) {
    return this.transaction(async tx => {
      await this.owner(tx, userId, merchantId, dto.region_id);
      if (id) await this.child(tx, 'mallProduct', id, merchantId);
      const data: any = {};
      for (const key of ['name', 'subtitle', 'detail']) if (dto[key] !== undefined || (!id && key === 'name')) data[key] = valueText(dto[key], key === 'detail' ? 100000 : 200, key === 'name');
      if (dto.images !== undefined || !id) { data.images = images(dto.images ?? []); data.mainImage = data.images[0] || null; }
      if (dto.price !== undefined || !id) data.price = money(dto.price, false);
      if (dto.originPrice !== undefined) data.originPrice = dto.originPrice === '' || dto.originPrice == null ? null : money(dto.originPrice);
      if (dto.stock !== undefined || !id) data.stock = whole(dto.stock ?? 0);
      if (dto.status !== undefined || !id) data.status = statusOf(dto.status, ['on_sale', 'off_sale'], 'off_sale');
      if (dto.categoryId !== undefined) {
        if (dto.categoryId && !await tx.mallCategory.findFirst({ where: { id: String(dto.categoryId), isShow: true } })) throw new BadRequestException('请选择有效商品分类');
        data.categoryId = dto.categoryId || null;
      }
      for (const field of ['weightGrams','volumeCm3']) if(dto[field]!==undefined) data[field]=dto[field]===null||dto[field]===''?null:whole(dto[field],1000000000,1);
      if (dto.sortOrder !== undefined) data.sortOrder = whole(dto.sortOrder, 100000);
      for (const key of ['isHot', 'isNew']) if (dto[key] !== undefined) { if (typeof dto[key] !== 'boolean') throw new BadRequestException('开关格式不正确'); data[key] = dto[key]; }
      if (id && (data.stock !== undefined || data.price !== undefined) && await tx.mallProductSku.count({ where: { productId: id } }) > 0) throw new BadRequestException('多规格商品请在规格库存页修改价格和库存');
      return id ? tx.mallProduct.update({ where: { id }, data }) : tx.mallProduct.create({ data: { ...data, merchantId } });
    });
  }
  async saveSku(userId: string, merchantId: string, productId: string, skuId: string | null, dto: any) {
    return this.transaction(async tx => {
      await this.owner(tx, userId, merchantId, dto.region_id); await this.child(tx, 'mallProduct', productId, merchantId);
      if (skuId && !await tx.mallProductSku.findFirst({ where: { id: skuId, productId } })) throw new NotFoundException('规格不属于该商品');
      const data:any = { skuName: valueText(dto.skuName, 100, true), price: money(dto.price, false), stock: whole(dto.stock), isDefault: dto.isDefault === true };
      for(const field of ['weightGrams','volumeCm3'])if(dto[field]!==undefined)data[field]=dto[field]===null||dto[field]===''?null:whole(dto[field],1000000000,1);
      if (data.isDefault) await tx.mallProductSku.updateMany({ where: { productId }, data: { isDefault: false } });
      const result = skuId ? await tx.mallProductSku.update({ where: { id: skuId }, data }) : await tx.mallProductSku.create({ data: { ...data, productId } });
      const all = await tx.mallProductSku.findMany({ where: { productId } });
      await tx.mallProduct.update({ where: { id: productId }, data: { stock: all.reduce((sum: number, sku: any) => sum + sku.stock, 0), price: Math.min(...all.map((sku: any) => Number(sku.price))) } });
      return result;
    });
  }
  async deleteSku(userId: string, merchantId: string, productId: string, skuId: string, dto: any) {
    return this.transaction(async tx => {
      await this.owner(tx, userId, merchantId, dto.region_id); await this.child(tx, 'mallProduct', productId, merchantId);
      const skus = await tx.mallProductSku.findMany({ where: { productId } });
      if (!skus.some((sku: any) => sku.id === skuId)) throw new NotFoundException('规格不存在');
      if (skus.length <= 1) throw new BadRequestException('请至少保留一个规格；停售请将商品下架');
      const active = await tx.mallOrderItem.count({ where: { skuId, order: { status: { in: ['pending_pay', 'paid', 'shipped'] } } } });
      if (active > 0) throw new BadRequestException('该规格存在待完成订单，不能删除');
      await tx.mallCart.deleteMany({ where: { skuId, productId } });
      await tx.mallProductSku.delete({ where: { id: skuId } });
      const left = skus.filter((sku: any) => sku.id !== skuId);
      if (!left.some((sku: any) => sku.isDefault)) await tx.mallProductSku.update({ where: { id: left[0].id }, data: { isDefault: true } });
      await tx.mallProduct.update({ where: { id: productId }, data: { stock: left.reduce((sum: number, sku: any) => sum + sku.stock, 0), price: Math.min(...left.map((sku: any) => Number(sku.price))) } });
      return { success: true };
    });
  }
  async orders(userId: string, merchantId: string, query: any) {
    return this.transaction(async tx => {
      await this.owner(tx, userId, merchantId, query.region_id); const { page, pageSize } = pageOf(query);
      const where: any = { merchantId }; if (query.status) where.status = statusOf(query.status, ['pending_pay', 'paid', 'shipped', 'received', 'completed', 'cancelled']);
      const [list, total] = await Promise.all([tx.mallOrder.findMany({ where, include: { items: true, refunds: true }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }), tx.mallOrder.count({ where })]);
      return { list, total, page, pageSize };
    });
  }
  async ship(userId: string, merchantId: string, id: string, dto: any) {
    return this.transaction(async tx => {
      await this.owner(tx, userId, merchantId, dto.region_id);
      const order = await this.child(tx, 'mallOrder', id, merchantId);
      if (order.status !== 'paid' || !['none', 'partial'].includes(order.refundStatus || 'none')) throw new BadRequestException('仅无处理中退款的已付款订单可以发货');
      if (await tx.mallRefund.count({where:{orderId:id,status:{in:['applying','approved','merchant_approved','processing']}}}) > 0) throw new BadRequestException('有处理中退款，不能发货');
      const trackingNo = valueText(dto.trackingNo, 100, true), trackingCompany = valueText(dto.trackingCompany, 100, true);
      const result = await tx.mallOrder.updateMany({ where: { id, merchantId, status: 'paid', refundStatus: {in:['none','partial']} }, data: { status: 'shipped', trackingNo, trackingCompany, deliverTime: new Date() } });
      if (result.count !== 1) throw new ConflictException('订单状态变化，请刷新');
      return { success: true, status: 'shipped' };
    });
  }
  async refunds(userId: string, merchantId: string, query: any) {
    return this.transaction(async tx => {
      await this.owner(tx, userId, merchantId, query.region_id); const { page, pageSize } = pageOf(query);
      const where: any = { order: { merchantId } }; if (query.status) where.status = valueText(query.status, 30);
      const [list, total] = await Promise.all([tx.mallRefund.findMany({ where, include: { order: { include: { items: true } } }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }), tx.mallRefund.count({ where })]);
      return { list, total, page, pageSize };
    });
  }
  async reviewRefund(userId: string, merchantId: string, id: string, dto: any) {
    return this.transaction(async tx => {
      await this.owner(tx, userId, merchantId, dto.region_id);
      const refund = await tx.mallRefund.findFirst({ where: { id, order: { merchantId } } });
      if (!refund) throw new NotFoundException('退款申请不属于当前店铺');
      if (refund.status !== 'applying') throw new ConflictException('退款申请已经处理，请刷新');
      if (typeof dto.approved !== 'boolean') throw new BadRequestException('请选择同意或拒绝');
      const reason = valueText(dto.reason, 1000, !dto.approved);
      const status = dto.approved ? 'merchant_approved' : 'merchant_rejected';
      const result = await tx.mallRefund.updateMany({ where: { id, status: 'applying' }, data: { status, merchantReply: reason || null, rejectReason: dto.approved ? null : reason, merchantReplyTime: new Date() } });
      if (result.count !== 1) throw new ConflictException('退款状态已变化');
      if (!dto.approved) { const previous=await tx.mallRefund.count({where:{orderId:refund.orderId,status:'refunded'}}); await tx.mallOrder.update({where:{id:refund.orderId},data:{refundStatus:previous?'partial':'none'}}); }
      // Existing platform finishRefund is the sole payment orchestration. Merchant review cannot mark money refunded.
      return { id, status, processing_stage: dto.approved ? 'awaiting_platform_refund' : 'merchant_rejected', message: dto.approved ? '已同意，等待平台处理退款；尚未退到账户' : '已提交拒绝理由' };
    });
  }
  async records(userId: string, merchantId: string, kind: string, query: any) {
    const models: Record<string, string> = { promotions: 'mallPromotion', freight: 'mallFreightTemplate', reviews: 'mallReview', distributors: 'mallDistributor', service: 'mallServiceStaff' };
    const model = models[kind]; if (!model) throw new NotFoundException();
    return this.transaction(async tx => {
      await this.owner(tx, userId, merchantId, query.region_id); const { page, pageSize } = pageOf(query); const where: any = { merchantId };
      if (query.status) where.status = valueText(query.status, 30);
      const [list, total] = await Promise.all([tx[model].findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }), tx[model].count({ where })]);
      return { list, total, page, pageSize };
    });
  }
  async record(userId: string, merchantId: string, kind: string, id: string, query: any) {
    const models: Record<string,string> = {promotions:'mallPromotion',freight:'mallFreightTemplate',service:'mallServiceStaff'};
    const model=models[kind]; if(!model)throw new NotFoundException();
    return this.transaction(async tx=>{await this.owner(tx,userId,merchantId,query.region_id);return this.child(tx,model,id,merchantId);});
  }
  async replyReview(userId: string, merchantId: string, id: string, dto: any) {
    return this.transaction(async tx => { await this.owner(tx, userId, merchantId, dto.region_id); await this.child(tx, 'mallReview', id, merchantId); return tx.mallReview.update({ where: { id }, data: { reply: valueText(dto.reply, 1000, true), replyAt: new Date() } }); });
  }
  async reviewDistributor(userId: string, merchantId: string, id: string, dto: any) {
    return this.transaction(async tx => {
      await this.owner(tx, userId, merchantId, dto.region_id); const row = await this.child(tx, 'mallDistributor', id, merchantId);
      if (row.status !== 'pending') throw new ConflictException('申请已审核');
      if (typeof dto.approved !== 'boolean') throw new BadRequestException('请选择审核结果');
      return tx.mallDistributor.update({ where: { id }, data: { status: dto.approved ? 'approved' : 'rejected', remark: valueText(dto.reason, 1000, !dto.approved) } });
    });
  }
  async savePromotion(userId: string, merchantId: string, id: string | null, dto: any) {
    return this.transaction(async tx => {
      await this.owner(tx, userId, merchantId, dto.region_id); if (id) await this.child(tx, 'mallPromotion', id, merchantId);
      const type = statusOf(dto.type, ['full_reduction', 'direct_discount', 'percentage_discount', 'free_shipping']);
      const startAt = new Date(dto.startAt), endAt = new Date(dto.endAt);
      if (!Number.isFinite(startAt.getTime()) || !Number.isFinite(endAt.getTime()) || endAt <= startAt) throw new BadRequestException('请填写正确的活动起止时间');
      const raw = dto.rules || {}; let rules: any;
      if (type === 'full_reduction') {
        if (!Array.isArray(raw.rules) || raw.rules.length === 0 || raw.rules.length > 20) throw new BadRequestException('请填写满减阶梯');
        rules = { rules: raw.rules.map((r: any) => { const threshold = money(r.threshold, false), discount = money(r.discount, false); if (discount > threshold) throw new BadRequestException('满减金额不能超过门槛'); return { threshold, discount }; }) };
      } else if (type === 'direct_discount') rules = { discount_amount: money(raw.discount_amount, false), min_amount: money(raw.min_amount ?? 0) };
      else if (type === 'free_shipping') rules = {min_amount:money(raw.min_amount ?? 0)};
      else { const rate = Number(raw.discount_rate); if (!Number.isFinite(rate) || rate <= 0 || rate >= 100) throw new BadRequestException('折扣率应在0至100之间'); rules = { discount_rate: rate, min_amount: money(raw.min_amount ?? 0), max_discount: money(raw.max_discount ?? 0) }; }
      const limits=mallPromotionLimits(raw);
      if(limits.productIds.length){const products=await tx.mallProduct.findMany({where:{id:{in:limits.productIds},merchantId},select:{id:true}});if(products.length!==limits.productIds.length)throw new BadRequestException('促销商品必须全部属于本店');}
      rules={...rules,user_limit:limits.userLimit,total_limit:limits.totalLimit,product_ids:limits.productIds,description:valueText(raw.description??'',2000),image:raw.image?images([raw.image])[0]:null};
      const data = { name: valueText(dto.name, 100, true), type, rules, startAt, endAt, status: statusOf(dto.status, ['active', 'inactive'], 'active') };
      return id ? tx.mallPromotion.update({ where: { id }, data }) : tx.mallPromotion.create({ data: { ...data, merchantId } });
    });
  }
  async saveFreight(userId: string, merchantId: string, id: string | null, dto: any) {
    await this.owner(this.prisma,userId,merchantId,dto.region_id);
    const raw = dto.rules || {}, selections=raw.areaRules||[];
    if(!Array.isArray(selections)||selections.length>50)throw new BadRequestException('地区运费规则最多50组');
    const verified:any[]=[];
    // External geography lookup stays outside the DB transaction; ownership is rechecked after it.
    for(const row of selections){
      if(!this.divisions)throw new BadRequestException('省市区校验服务尚未就绪');
      const value={provinceCode:String(row.provinceCode||''),cityCode:String(row.cityCode||''),districtCode:String(row.districtCode||'')};
      const selected=await this.divisions.validateSelection(value,row.level);
      verified.push({...row,...value,level:row.level,areaCodes:[selected.code],areaLabel:selected.label});
    }
    const rules = mallFreightRules({...raw,areaRules:verified});
    rules.areaRules=rules.areaRules.map((row:any,index:number)=>({...row,provinceCode:verified[index].provinceCode,cityCode:verified[index].cityCode,districtCode:verified[index].districtCode,level:verified[index].level,areaLabel:verified[index].areaLabel}));
    return this.transaction(async tx => {
      await this.owner(tx, userId, merchantId, dto.region_id); if (id) await this.child(tx, 'mallFreightTemplate', id, merchantId);
      const isDefault = dto.isDefault === true;
      if (isDefault) await tx.mallFreightTemplate.updateMany({ where: { merchantId }, data: { isDefault: false } });
      const data = { name: valueText(dto.name, 100, true), rules, isDefault };
      return id ? tx.mallFreightTemplate.update({ where: { id }, data }) : tx.mallFreightTemplate.create({ data: { ...data, merchantId } });
    });
  }
  async saveServiceStaff(userId: string, merchantId: string, id: string | null, dto: any) {
    return this.transaction(async tx => {
      const merchant = await this.owner(tx, userId, merchantId, dto.region_id); if (id) await this.child(tx, 'mallServiceStaff', id, merchantId);
      const data = { nickname: valueText(dto.nickname, 100, true), avatar: image(dto.avatar), phone: valueText(dto.phone, 30), wechat: valueText(dto.wechat, 100), workTime: valueText(dto.workTime, 200), onlineStatus: statusOf(dto.onlineStatus, ['online', 'offline'], 'offline'), status: statusOf(dto.status, ['active', 'disabled'], 'active') };
      return id ? tx.mallServiceStaff.update({ where: { id }, data }) : tx.mallServiceStaff.create({ data: { ...data, merchantId, regionId: merchant.regionId } });
    });
  }
  async removeRecord(userId: string, merchantId: string, kind: string, id: string, dto: any) {
    const models: Record<string, string> = { promotions: 'mallPromotion', freight: 'mallFreightTemplate', service: 'mallServiceStaff' }; const model = models[kind]; if (!model) throw new NotFoundException();
    return this.transaction(async tx => { await this.owner(tx, userId, merchantId, dto.region_id); await this.child(tx, model, id, merchantId); if(kind==='promotions'&&await tx.mallPromotionUsage.count({where:{promotionId:id}})>0)throw new BadRequestException('已有使用记录的活动不能删除，请停用以保留订单记录'); await tx[model].delete({ where: { id } }); return { success: true }; });
  }
}
