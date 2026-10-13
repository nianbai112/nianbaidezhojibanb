import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';

export function mallFen(value: unknown): number {
  const text = String(value ?? '');
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(text)) throw new BadRequestException('商品金额配置无效');
  const [whole, fraction = ''] = text.split('.'); return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}
export function mallQuantity(value: unknown): number {
  const quantity = Number(value); if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 999) throw new BadRequestException('商品数量应为1至999的整数'); return quantity;
}
export function mallRequestOrderNo(userId: string, requestId: unknown): string {
  if (typeof requestId !== 'string' || !/^[a-zA-Z0-9_-]{16,100}$/.test(requestId)) throw new BadRequestException('缺少有效下单请求号，请更新客户端后重试');
  return 'MALL' + createHash('sha256').update(userId + '\0' + requestId).digest('hex').slice(0, 32);
}
export function mallMeasure(value: unknown, scale: number): number {
  const raw=String(value??''); const decimals=scale===1000?3:scale===1000000?6:0;
  if (!new RegExp('^\\d{1,9}'+(decimals?'(\\.\\d{1,'+decimals+'})?':'')+'$').test(raw)) throw new BadRequestException('计费单位格式不正确');
  const [whole,fraction='']=raw.split('.');const result=Number(whole)*scale+Number(fraction.padEnd(decimals,'0'));
  if(!Number.isSafeInteger(result)||result<=0||result>1e12)throw new BadRequestException('计费单位必须大于0');return result;
}
export function mallFreightRules(raw: any): any {
  if(!raw||!['piece','weight','volume'].includes(raw.chargingType))throw new BadRequestException('请选择按件、重量或体积计费');
  const scale=raw.chargingType==='weight'?1000:raw.chargingType==='volume'?1000000:1;
  const units=(row:any)=>{mallMeasure(row.defaultFirstUnit,scale);mallMeasure(row.defaultContinueUnit,scale);return{defaultFirstUnit:String(row.defaultFirstUnit),defaultFirstFee:mallFen(row.defaultFirstFee)/100,defaultContinueUnit:String(row.defaultContinueUnit),defaultContinueFee:mallFen(row.defaultContinueFee)/100}};
  const freeType=raw.freeFreightType??(Number(raw.freeFreightAmount)>0?'amount':'none');if(!['none','amount','piece'].includes(freeType))throw new BadRequestException('包邮条件无效');
  const freeAmount=mallFen(raw.freeFreightAmount??0),freePiece=Number(raw.freeFreightPiece??0);if(freeType==='amount'&&freeAmount<=0||freeType==='piece'&&(!Number.isSafeInteger(freePiece)||freePiece<1||freePiece>1e6))throw new BadRequestException('包邮门槛必须大于0');
  const seen=new Set<string>();const areas=raw.areaRules??[];if(!Array.isArray(areas)||areas.length>50)throw new BadRequestException('地区运费规则最多50组');
  const areaRules=areas.map((row:any)=>{if(!Array.isArray(row.areaCodes)||!row.areaCodes.length||row.areaCodes.length>300)throw new BadRequestException('请选择运费适用地区');const areaCodes=row.areaCodes.map((code:any)=>{if(typeof code!=='string'||!/^\d{6}$/.test(code)||code==='000000'||seen.has(code))throw new BadRequestException('地区编号无效或重复');seen.add(code);return code});return{areaCodes,...units(row)}});
  return{chargingType:raw.chargingType,...units(raw),freeFreightType:freeType,freeFreightAmount:freeAmount/100,freeFreightPiece:freeType==='piece'?freePiece:0,areaRules};
}
export function mallFreightFen(templates: any[], quantity: number, productFen: number, physical:any={}): number {
  const defaults=templates.filter(row=>row.isDefault===true);if(defaults.length!==1)throw new BadRequestException('店铺尚未配置唯一默认运费模板，请联系商家');
  const rules=mallFreightRules(defaults[0].rules||{});let rate=rules;
  if(rules.areaRules.length){
    const codes=[physical.districtCode,physical.cityCode,physical.provinceCode];
    if(codes.some(code=>typeof code!=='string'||!/^\d{6}$/.test(code)))throw new BadRequestException('请补齐收货地址的省市区后计算运费');
    for(const code of codes){const found=rules.areaRules.find((row:any)=>row.areaCodes.includes(code));if(found){rate=found;break}}
  }
  if(rules.freeFreightType==='amount'&&productFen>=mallFen(rules.freeFreightAmount)||rules.freeFreightType==='piece'&&quantity>=rules.freeFreightPiece)return 0;
  const scale=rules.chargingType==='weight'?1000:rules.chargingType==='volume'?1000000:1;
  const measured=rules.chargingType==='weight'?physical.weightGrams:rules.chargingType==='volume'?physical.volumeCm3:quantity;
  if(!Number.isSafeInteger(measured)||measured<=0)throw new BadRequestException(rules.chargingType==='weight'?'商品重量尚未补齐，请联系商家':rules.chargingType==='volume'?'商品体积尚未补齐，请联系商家':'商品数量无效');
  return mallFen(rate.defaultFirstFee)+Math.ceil(Math.max(0,measured-mallMeasure(rate.defaultFirstUnit,scale))/mallMeasure(rate.defaultContinueUnit,scale))*mallFen(rate.defaultContinueFee);
}
export function mallPromotionLimits(rules:any):{userLimit:number;totalLimit:number;productIds:string[]}{
  const parse=(value:any)=>{const count=Number(value??0);if(!Number.isSafeInteger(count)||count<0||count>1e9)throw new BadRequestException('促销次数应为0或正整数');return count};
  if(rules.use_limit!=null&&rules.user_limit==null)throw new BadRequestException('旧活动次数口径尚未确认，请商家编辑并保存明确的每人及总次数');
  const userLimit=parse(rules.user_limit),totalLimit=parse(rules.total_limit);
  if(rules.user_limit!=null&&rules.use_limit!=null&&parse(rules.user_limit)!==parse(rules.use_limit))throw new BadRequestException('促销每人次数配置冲突');
  const ids=rules.product_ids??[];if(!Array.isArray(ids)||ids.length>1000||ids.some((id:any)=>typeof id!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(id)))throw new BadRequestException('促销商品范围无效');
  return{userLimit,totalLimit,productIds:[...new Set<string>(ids)]};
}
export async function mallAssertPromotionQuota(tx:any,promotion:any,userId:string){
  const limits=mallPromotionLimits(promotion.rules||{}),where={promotionId:promotion.id,status:{in:['reserved','consumed']}};
  if(limits.totalLimit&&await tx.mallPromotionUsage.count({where})>=limits.totalLimit)throw new BadRequestException('活动总名额已用完');
  if(limits.userLimit&&await tx.mallPromotionUsage.count({where:{...where,userId}})>=limits.userLimit)throw new BadRequestException('您已达到该活动使用次数');
  return limits;
}
export function mallPromotionFen(promotion: any, merchantId: string, productFen: number, now = new Date()): number {
  if (!promotion || promotion.status !== 'active' || promotion.merchantId && promotion.merchantId !== merchantId || new Date(promotion.startAt) > now || new Date(promotion.endAt) <= now) throw new BadRequestException('促销活动已失效或不适用于该店铺');
  const rules = promotion.rules || {};
  mallPromotionLimits(rules); // Quotas are checked and reserved by the checkout transaction.
  let discount = 0;
  if (promotion.type === 'full_reduction') {
    if (!Array.isArray(rules.rules)) throw new BadRequestException('满减配置无效');
    for (const row of rules.rules) { const threshold = mallFen(row.threshold), amount = mallFen(row.discount); if (amount > threshold) throw new BadRequestException('满减配置无效'); if (productFen >= threshold) discount = Math.max(discount, amount); }
  } else if (promotion.type === 'direct_discount') { if (productFen >= mallFen(rules.min_amount ?? 0)) discount = mallFen(rules.discount_amount); }
  else if (promotion.type === 'percentage_discount') {
    const rate = Number(rules.discount_rate);
    if (!Number.isFinite(rate) || rate <= 0 || rate >= 100) throw new BadRequestException('折扣配置无效');
    if (productFen >= mallFen(rules.min_amount ?? 0)) { discount = Math.floor(productFen * (100 - rate) / 100); const max = mallFen(rules.max_discount ?? 0); if (max) discount = Math.min(max, discount); }
  } else if (promotion.type === 'free_shipping') { mallFen(rules.min_amount ?? 0); } else throw new BadRequestException('暂不支持该促销规则自动结算');
  return Math.min(productFen, discount);
}
