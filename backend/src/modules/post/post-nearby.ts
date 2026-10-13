import {BadRequestException} from '@nestjs/common';
import {Prisma} from '@prisma/client';

export function nearbyQuery(query: any) {
 const number=(value:unknown,name:string,min:number,max:number,fallback?:number)=>{
  if((value==null||value==='')&&fallback!==undefined)return fallback;
  if(!['number','string'].includes(typeof value)||String(value).trim()==='')throw new BadRequestException(`${name}无效`);
  const n=Number(value);if(!Number.isFinite(n)||n<min||n>max)throw new BadRequestException(`${name}无效`);return n;
 };
 const latitude=number(query.latitude??query.lat,'纬度',-90,90),longitude=number(query.longitude??query.lng,'经度',-180,180);
 const radius=number(query.radius??query.radiusMeters,'附近范围',100,10000,3000);
 const page=number(query.page,'页码',1,1000000,1),limit=number(query.limit??query.pageSize,'每页数量',1,50,20);
 if(!Number.isInteger(page)||!Number.isInteger(limit))throw new BadRequestException('分页必须为整数');
 return {latitude,longitude,radius,page,limit};
}
// 两种数据库均用参数化球面距离查询，先过滤学校/可见性/纬度边界，再按距离分页。
// 不先取固定数量候选再伪造全量分页，也不把关注帖子当成附近内容。
export async function nearbyPostIds(prisma:any,regionId:string,query:any,userId?:string) {
 if(!/^[A-Za-z0-9_-]{1,191}$/.test(regionId))throw new BadRequestException('请选择有效校区');
 const q=nearbyQuery(query),mysql=process.env.DB_PROVIDER==='mysql'||String(process.env.DATABASE_URL||'').startsWith('mysql:');
 const column=(table:string,name:string)=>Prisma.raw(`${table}.${mysql?'`'+name+'`':'"'+name+'"'}`);
 const lat=column('p','latitude'),lng=column('p','longitude'),user=column('p','userId');
 const distance=Prisma.sql`6371000 * ACOS(LEAST(1.0, GREATEST(-1.0, SIN(RADIANS(${q.latitude})) * SIN(RADIANS(${lat})) + COS(RADIANS(${q.latitude})) * COS(RADIANS(${lat})) * COS(RADIANS(${lng} - ${q.longitude})))))`;
 const blocked=userId?Prisma.sql`AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (${column('b','userId')} = ${userId} AND ${column('b','blockedId')} = ${user}) OR (${column('b','blockedId')} = ${userId} AND ${column('b','userId')} = ${user}))`:Prisma.empty;
 const minLat=Math.max(-90,q.latitude-q.radius/110000),maxLat=Math.min(90,q.latitude+q.radius/110000);
 const where=Prisma.sql`${column('p','regionId')} = ${regionId} AND p.status = 'PUBLISHED' AND ${column('p','auditStatus')} = 'approved' AND ${column('p','deletedAt')} IS NULL AND ${lat} BETWEEN ${minLat} AND ${maxLat} AND ${lng} BETWEEN -180 AND 180 ${blocked}`;
 const base=Prisma.sql`SELECT p.id, ${distance} AS distance FROM posts p WHERE ${where}`;
 const [count,rows]=await prisma.$transaction([
  prisma.$queryRaw(Prisma.sql`SELECT COUNT(*) AS total FROM (${base}) nearby WHERE distance <= ${q.radius}`),
  prisma.$queryRaw(Prisma.sql`SELECT id, distance FROM (${base}) nearby WHERE distance <= ${q.radius} ORDER BY distance ASC, id ASC LIMIT ${q.limit} OFFSET ${(q.page-1)*q.limit}`),
 ],{isolationLevel:'RepeatableRead'});
 return {...q,total:Number(count[0]?.total||0),rows:rows as {id:string;distance:number}[]};
}
