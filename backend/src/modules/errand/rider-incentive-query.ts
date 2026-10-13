import {BadRequestException} from '@nestjs/common';
export function riderIncentiveQuery(userId:string,q:any={}){
 const integer=(v:any,def:number,max:number)=>{if(v==null||v==='')return def;const n=Number(v);if(!Number.isInteger(n)||n<1||n>max)throw new BadRequestException('分页参数无效');return n};
 const page=integer(q.page,1,100000),pageSize=integer(q.pageSize,20,100),where:any={userId};
 const region=String(q.region_id||q.regionId||'').trim();if(region)where.regionId=region;
 if(q.type){if(!['reward','penalty'].includes(q.type))throw new BadRequestException('奖惩类型无效');where.type={in:q.type==='reward'?['reward','rider_reward','merchant_reward']:['penalty','rider_penalty','merchant_penalty']}}
 if(q.rule_type){const rule=String(q.rule_type).trim();if(!/^[a-z_]{1,60}$/.test(rule))throw new BadRequestException('规则类型无效');where.ruleType=rule}
 const money=(v:any)=>{if(!/^\d+(\.\d{1,2})?$/.test(String(v)))throw new BadRequestException('金额筛选无效');const n=Number(v);if(!Number.isFinite(n)||n>100000000)throw new BadRequestException('金额筛选无效');return n};
 if(q.min_amount!=null&&q.min_amount!=='')where.amount={gte:money(q.min_amount)};if(q.max_amount!=null&&q.max_amount!=='')where.amount={...(where.amount||{}),lte:money(q.max_amount)};if(where.amount?.gte>where.amount?.lte)throw new BadRequestException('金额区间无效');
 const day=(v:any,end=false)=>{const text=String(v);if(!/^\d{4}-\d{2}-\d{2}$/.test(text))throw new BadRequestException('日期筛选无效');const d=new Date(`${text}T00:00:00+08:00`);if(!Number.isFinite(d.getTime())||new Date(d.getTime()+8*3600000).toISOString().slice(0,10)!==text)throw new BadRequestException('日期筛选无效');return end?new Date(d.getTime()+86400000):d};
 if(q.start_date)where.createdAt={gte:day(q.start_date)};if(q.end_date)where.createdAt={...(where.createdAt||{}),lt:day(q.end_date,true)};if(where.createdAt?.gte>=where.createdAt?.lt)throw new BadRequestException('日期区间无效');
 const keyword=String(q.keyword||'').trim();if(keyword){if(keyword.length>100)throw new BadRequestException('搜索内容过长');where.OR=[{description:{contains:keyword}},{orderId:{contains:keyword}}]}
 if(q.sort_by&&!['created_at','amount'].includes(q.sort_by)||q.sort_order&&!['asc','desc'].includes(q.sort_order))throw new BadRequestException('排序参数无效');
 return{page,pageSize,where,orderBy:[{[q.sort_by==='amount'?'amount':'createdAt']:q.sort_order==='asc'?'asc':'desc'},{id:'desc'}]};
}
