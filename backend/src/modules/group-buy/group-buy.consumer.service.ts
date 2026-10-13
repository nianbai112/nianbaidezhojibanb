import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../common/services/prisma.service';
import { RedisService } from '../../common/services/redis.service';
import { WalletService } from '../../common/services/wallet.service';
import { UserAccessPolicyService } from '../../common/services/user-access-policy.service';
import { PaymentService } from '../payment/payment.service';
import { canStartWechatPayment } from '../../common/payment-client';

export const GROUP_BUY_BIZ = 'group_buy';
export const groupBuyRequestNo = (userId: string, value: unknown) => {
  if(typeof value!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(value))throw new BadRequestException('缺少有效团购请求号，请更新客户端');
  return 'GB'+createHash('sha256').update(userId+'\0'+value).digest('hex').slice(0,32);
};
export const groupBuyFen = (value: unknown) => { const raw=String(value??''); if(!/^\d{1,8}(\.\d{1,2})?$/.test(raw))throw new BadRequestException('团购金额配置无效'); const [a,b='']=raw.split('.');return Number(a)*100+Number(b.padEnd(2,'0')); };
export const groupBuyCode = () => randomBytes(12).toString('hex').toUpperCase();

@Injectable()
export class GroupBuyConsumerService {
 constructor(private readonly prisma:PrismaService,private readonly redis:RedisService,private readonly access:UserAccessPolicyService,private readonly payment:PaymentService,private readonly wallet:WalletService){}
 private async locked<T>(id:string,fn:()=>Promise<T>):Promise<T>{const key=`groupbuy:order:${id}`;if(!await this.redis.getLock(key,45))throw new ConflictException('团购订单处理中，请稍后刷新');try{return await fn()}finally{await this.redis.releaseLock(key).catch(()=>undefined)}}
 private published(regionId: unknown, now=new Date()):any{return{status:'active',startAt:{lte:now},endAt:{gt:now},AND:[{OR:regionId?[{regionId:String(regionId)},{regionId:null}]:[{regionId:null}]},{OR:[{merchantId:null},{Merchant:{status:'approved'}}]}]}}
 async packages(query:any){const page=Math.max(1,Math.floor(Number(query.page)||1)),limit=Math.min(100,Math.max(1,Math.floor(Number(query.limit)||20)));const where:any=this.published(query.region_id);if(query.category_id)where.categoryId=String(query.category_id);if(query.keyword)where.name={contains:String(query.keyword).slice(0,100)};const[list,total]=await Promise.all([this.prisma.groupBuyPackage.findMany({where,orderBy:[{createdAt:'desc'},{id:'asc'}],skip:(page-1)*limit,take:limit}),this.prisma.groupBuyPackage.count({where})]);return{list,total,page,pageSize:limit}}
 async package(id:string,query:any={}){const row=await this.prisma.groupBuyPackage.findFirst({where:{id,...this.published(query.region_id)},include:{Merchant:{select:{id:true,name:true,address:true,phone:true}},Reviews:{where:{status:'approved',isHidden:false},orderBy:{createdAt:'desc'},take:20,select:{id:true,rating:true,content:true,images:true,reply:true,createdAt:true,User:{select:{nickname:true,avatar:true}}}}}});if(!row)throw new NotFoundException('团购套餐不存在、已结束或不属于当前校区');return row}
 async create(userId:string,dto:any){const orderNo=groupBuyRequestNo(userId,dto.request_id);return this.locked(orderNo,async()=>{
  const existing=await this.prisma.groupBuyOrder.findUnique({where:{orderNo},include:{Package:true}});if(existing)return this.publicOrder(existing);
  try{return await this.prisma.$transaction(async tx=>{
   const same=await tx.groupBuyOrder.findUnique({where:{orderNo},include:{Package:true}});if(same)return this.publicOrder(same);
   if(!dto.region_id)throw new BadRequestException('请先选择校区');
   const item=await tx.groupBuyPackage.findFirst({where:{id:String(dto.package_id||''),...this.published(dto.region_id)}});if(!item)throw new BadRequestException('套餐已结束或不属于当前校区');
   await this.access.assertStudentProtectedAction(userId,item.regionId||dto.region_id,'参与团购');
   const quantity=Number(dto.quantity??1);if(!Number.isSafeInteger(quantity)||quantity<1||quantity>99)throw new BadRequestException('团购数量应为1至99的整数');
   const amountFen=groupBuyFen(item.price)*quantity;if(amountFen<=0)throw new BadRequestException('套餐价格配置无效');
   if(groupBuyFen(dto.expected_amount)!==amountFen)throw new ConflictException('套餐价格已变化，请重新确认');
   if((await tx.groupBuyPackage.updateMany({where:{id:item.id,status:'active',stock:{gte:quantity},startAt:{lte:new Date()},endAt:{gt:new Date()}},data:{stock:{decrement:quantity}}})).count!==1)throw new ConflictException('套餐库存不足或已结束');
   const row=await tx.groupBuyOrder.create({data:{orderNo,userId,packageId:item.id,amount:amountFen/100,quantity,status:'pending_pay',verifyStatus:'pending',buyerName:String(dto.buyer_name||'').slice(0,50)||null,buyerPhone:String(dto.buyer_phone||'').slice(0,30)||null,remark:String(dto.remark||'').slice(0,500)||null},include:{Package:true}});
   return this.publicOrder(row);
  },{isolationLevel:'Serializable'})}catch(e:any){if(e?.code==='P2002'){const recovered=await this.prisma.groupBuyOrder.findUnique({where:{orderNo},include:{Package:true}});if(recovered)return this.publicOrder(recovered)}if(e?.code==='P2034')throw new ConflictException('套餐库存变化，请核对原请求后重试');throw e}
 })}
 private publicOrder(row:any){if(!row)return null;return{...row,verifyCode:['paid','completed'].includes(row.status)?row.verifyCode:null,order_sn:row.orderNo,pay_amount:row.amount}}
 async byRequest(userId:string,requestId:string){return this.publicOrder(await this.prisma.groupBuyOrder.findUnique({where:{orderNo:groupBuyRequestNo(userId,requestId)},include:{Package:true}}))}
 async order(userId:string,id:string,byNumber=false){const row=await this.prisma.groupBuyOrder.findFirst({where:{userId,...(byNumber?{orderNo:id}:{id})},include:{Package:true}});if(!row)throw new NotFoundException('团购订单不存在');await this.expireIfNeeded(row);const refreshed=await this.prisma.groupBuyOrder.findFirst({where:{id:row.id,userId},include:{Package:true}});return this.publicOrder(refreshed)}
 async orders(userId:string,query:any){await this.expireForUser(userId);const page=Math.max(1,Math.floor(Number(query.page)||1)),limit=Math.min(100,Math.max(1,Math.floor(Number(query.limit)||20)));const where:any={userId};if(query.status)where.status=String(query.status);const[list,total]=await Promise.all([this.prisma.groupBuyOrder.findMany({where,include:{Package:true},orderBy:[{createdAt:'desc'},{id:'asc'}],skip:(page-1)*limit,take:limit}),this.prisma.groupBuyOrder.count({where})]);return{list:list.map(row=>this.publicOrder(row)),total,page,pageSize:limit}}
 private async expireIfNeeded(row:any){if(row.status==='pending_pay'&&new Date(row.createdAt).getTime()<=Date.now()-15*60000)await this.cancel(row.userId,row.id).catch(e=>{if(!(e instanceof BadRequestException)&&!(e instanceof ConflictException))throw e})}
 private async expireForUser(userId?:string){const rows=await this.prisma.groupBuyOrder.findMany({where:{...(userId?{userId}:{}),status:'pending_pay',createdAt:{lte:new Date(Date.now()-15*60000)}},take:100,orderBy:{createdAt:'asc'}});for(const row of rows)await this.expireIfNeeded(row)}
 @Cron('*/1 * * * *')
 async expireUnpaid(){await this.expireForUser()}
 async cancel(userId:string,id:string){return this.locked(id,()=>this.prisma.$transaction(async tx=>{const row=await tx.groupBuyOrder.findFirst({where:{id,userId}});if(!row)throw new NotFoundException('订单不存在');if(row.status==='cancelled')return this.publicOrder(row);if(row.status!=='pending_pay')throw new BadRequestException('仅未付款团购订单可取消');const claimed=await tx.groupBuyOrder.updateMany({where:{id,userId,status:'pending_pay'},data:{status:'cancelled'}});if(claimed.count!==1)throw new ConflictException('订单状态已变化');await tx.groupBuyPackage.update({where:{id:row.packageId},data:{stock:{increment:row.quantity}}});return{...this.publicOrder(row),status:'cancelled'}},{isolationLevel:'Serializable'}))}
 async pay(userId:string,id:string,dto:any){
  const before=await this.prisma.groupBuyOrder.findFirst({where:{id,userId}});if(!before)throw new NotFoundException('订单不存在');await this.expireIfNeeded(before);
  return this.locked(id,async()=>{
  const row=await this.prisma.groupBuyOrder.findFirst({where:{id,userId},include:{Package:true}});if(!row)throw new NotFoundException('订单不存在');if(row.status!=='pending_pay'||new Date(row.createdAt).getTime()<=Date.now()-15*60000)throw new BadRequestException('订单已支付、取消或超时');
  const amount=groupBuyFen(row.amount)/100,channel=String(dto.payment_method||dto.pay_type||'wechat');
  if(channel==='balance')return this.prisma.$transaction(async tx=>{
   const claimed=await tx.groupBuyOrder.updateMany({where:{id,userId,status:'pending_pay',createdAt:{gt:new Date(Date.now()-15*60000)},OR:[{payChannel:null},{payChannel:'balance'}]},data:{status:'paid',payChannel:'balance',payTime:new Date(),verifyCode:groupBuyCode(),verifyStatus:'pending'}});if(claimed.count!==1)throw new ConflictException('已在其它渠道支付或状态变化，请查询订单');
   await this.wallet.deductBalanceAtomic(userId,amount,{type:'PAY',channel:'BALANCE',description:`团购订单 ${row.orderNo}`,orderNo:row.orderNo},tx);
   await tx.paymentOrder.create({data:{paymentNo:'GBPAY'+randomBytes(12).toString('hex'),bizType:GROUP_BUY_BIZ,bizId:id,userId,orderNo:row.orderNo,amount,channel:'balance',status:'paid',payTime:new Date()}});
   await tx.groupBuyPackage.update({where:{id:row.packageId},data:{soldCount:{increment:row.quantity}}});
   return this.publicOrder(await tx.groupBuyOrder.findUnique({where:{id},include:{Package:true}}));
  },{isolationLevel:'Serializable'});
  if(!['wechat','wx_pay'].includes(channel))throw new BadRequestException('不支持该支付方式');
  const user=await this.prisma.user.findUnique({where:{id:userId},select:{openid:true}});if(!user||!canStartWechatPayment(user.openid))throw new BadRequestException('微信支付账号尚未配置');
  return this.payment.wxUnifiedOrder({bizType:GROUP_BUY_BIZ,bizId:id,userId,orderNo:row.orderNo,amount,description:`团购 ${row.Package.name}`,openid:user.openid});
 })}
 async refund(userId:string,id:string,dto:any){return this.locked(id,async()=>{
  const reason=String(dto.reason||'').trim();if(!reason||reason.length>1000)throw new BadRequestException('请填写退款原因');
  const row=await this.prisma.$transaction(async tx=>{const item=await tx.groupBuyOrder.findFirst({where:{id,userId}});if(!item)throw new NotFoundException('订单不存在');if(item.status==='refunded')return item;if(item.verifyStatus==='verified'||!['paid','refunding'].includes(item.status))throw new BadRequestException('仅未核销的已付款团购可退款');if(item.status==='paid'){const claimed=await tx.groupBuyOrder.updateMany({where:{id,status:'paid',verifyStatus:'pending'},data:{status:'refunding',refundReason:reason,refundAmount:item.amount}});if(claimed.count!==1)throw new ConflictException('订单已核销或状态变化')}return item},{isolationLevel:'Serializable'});
  if(row.status==='refunded')return{status:'refunded',message:'该订单已退款'};
  // Retry inspects the actual financial refund first. No second monetary refund is created for a pending/settled record.
  const payment=await this.prisma.paymentOrder.findFirst({where:{bizType:GROUP_BUY_BIZ,bizId:id,status:{in:['paid','refunding','refunded']}},orderBy:{createdAt:'desc'}});
  if(!payment)throw new BadRequestException('未找到实际支付记录，请联系平台处理');
  const prior=await this.prisma.paymentRefund.findFirst({where:{paymentId:payment.id},orderBy:{createdAt:'desc'}});
  if(prior){if(['pending','processing','success'].includes(prior.status))return{status:prior.status==='success'?'refunded':'refunding',message:prior.status==='success'?'已退款':'退款处理中'};throw new BadRequestException('退款渠道处理失败，请联系平台从原退款记录重试')}
  const result=await this.payment.refund({bizType:GROUP_BUY_BIZ,bizId:id,amount:Number(row.amount),reason});return{status:result.status==='success'?'refunded':'refunding',message:result.status==='success'?'已退款':'退款处理中'};
 })}
}
