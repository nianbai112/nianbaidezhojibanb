import {BadRequestException} from '@nestjs/common';
export function riderRankingRange(value:string,now=new Date()){
 const shifted=new Date(now.getTime()+8*3600000),year=shifted.getUTCFullYear(),month=shifted.getUTCMonth(),day=shifted.getUTCDate();
 const midnight=new Date(Date.UTC(year,month,day)-8*3600000);let start:Date|undefined,end:Date|undefined;
 if(value==='day')start=midnight;else if(value==='yesterday'){start=new Date(midnight.getTime()-86400000);end=midnight}else if(value==='week'){const weekday=(shifted.getUTCDay()+6)%7;start=new Date(midnight.getTime()-weekday*86400000)}else if(value==='month')start=new Date(Date.UTC(year,month,1)-8*3600000);else if(value==='year')start=new Date(Date.UTC(year,0,1)-8*3600000);else if(value!=='all')throw new BadRequestException('排行时间范围无效');
 return start?{gte:start,...(end?{lt:end}:{})}:undefined;
}
export async function readRiderRanking(db:any,query:any,now=new Date()){
 const regionId=String(query.region_id||query.regionId||'').trim();if(!regionId)throw new BadRequestException('请选择排行榜校区');
 const page=Number(query.page||1),limit=Number(query.limit||20);if(!Number.isInteger(page)||page<1||page>100000||!Number.isInteger(limit)||limit<1||limit>100)throw new BadRequestException('排行分页无效');
 const range=riderRankingRange(query.time_range||'week',now),direction=query.order==='asc'?1:-1;
 const errandWhere:any={regionId,riderId:{not:null},status:'completed',refundStatus:{notIn:['refunding','refunded']},...(range?{completeTime:range}:{})};
 const shopWhere:any={merchant:{regionId},riderId:{not:null},status:{in:['RECEIVED','COMPLETED']},deliveryMode:{in:['platform_rider','rider_delivery']},refundStatus:{notIn:['refunding','refunded']},...(range?{OR:[{completeTime:range},{completeTime:null,receiveTime:range}]}:{})};
 const [errands,shopOriginal,shopFallback]=await Promise.all([
  db.errandOrder.groupBy({by:['riderId'],where:errandWhere,_count:{id:true},_sum:{price:true,tip:true,platformFee:true}}),
  db.order.groupBy({by:['riderId'],where:{...shopWhere,originalFreightAmount:{gt:0}},_count:{id:true},_sum:{originalFreightAmount:true}}),
  db.order.groupBy({by:['riderId'],where:{...shopWhere,originalFreightAmount:{lte:0}},_count:{id:true},_sum:{freightAmount:true}}),
 ]);
 const map=new Map<string,any>();const apply=(r:any,kind:string,amount:number)=>{if(!r.riderId)return;const row=map.get(r.riderId)||{riderId:r.riderId,orderCount:0,errandOrders:0,deliveryOrders:0,earningsCents:0};row.orderCount+=Number(r._count.id);row[kind]+=Number(r._count.id);row.earningsCents+=Math.max(0,Math.round(amount*100));map.set(r.riderId,row)};
 errands.forEach((r:any)=>apply(r,'errandOrders',Number(r._sum.price||0)+Number(r._sum.tip||0)-Number(r._sum.platformFee||0)));shopOriginal.forEach((r:any)=>apply(r,'deliveryOrders',Number(r._sum.originalFreightAmount||0)));shopFallback.forEach((r:any)=>apply(r,'deliveryOrders',Number(r._sum.freightAmount||0)));
 const sorted=[...map.values()].sort((a,b)=>direction*((query.sort_by==='earnings'?a.earningsCents-b.earningsCents:a.orderCount-b.orderCount))||a.riderId.localeCompare(b.riderId));
 const sliced=sorted.slice((page-1)*limit,page*limit);const riders=sliced.length?await db.regionRider.findMany({where:{userId:{in:sliced.map(r=>r.riderId)}},select:{userId:true,anonymous:true,status:true,riderBio:true,User:{select:{nickname:true,avatar:true}}}}):[];const profiles=new Map(riders.map((r:any)=>[r.userId,r]));
 const list=sliced.map((r,i)=>{const profile:any=profiles.get(r.riderId),anonymous=!profile||profile.anonymous===true;return{rank:(page-1)*limit+i+1,riderId:r.riderId,nickname:anonymous?'匿名骑手':profile.User?.nickname||'骑手',avatar:anonymous?'':profile.User?.avatar||'',anonymous,orderCount:r.orderCount,errandOrders:r.errandOrders,deliveryOrders:r.deliveryOrders,totalEarnings:r.earningsCents/100,status:profile?.status||'offline',bio:anonymous?'':profile?.riderBio||''}});
 return{list,total:sorted.length,page,limit,has_more:page*limit<sorted.length,region_id:regionId,earnings_basis:'delivery_fee_before_settlement'};
}
