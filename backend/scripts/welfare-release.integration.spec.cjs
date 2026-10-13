const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {PrismaClient}=require('@prisma/client');
const {prismaCliPath}=require('./migrate-release.cjs');
const source=process.env.WELFARE_TEST_DATABASE_URL;
if(source && !/^postgresql:\/\/[^@]+@127\.0\.0\.1:55437\/welfare_qa(?:\?|$)/.test(source))throw Error('Only isolated welfare_qa database allowed');
const root=path.resolve(__dirname,'..');
function run(url,args,input){const result=spawnSync(process.execPath,args,{cwd:root,env:{...process.env,DATABASE_URL:url,DB_PROVIDER:'postgresql'},encoding:'utf8',input,timeout:60000});assert.equal(result.status,0,result.stdout+'\n'+result.stderr);return result.stdout;}
function release(url,command){const text=run(url,[path.join(__dirname,'migrate-release.cjs'),command]);const data=JSON.parse(text.split('LINGMENG_MIGRATIONS_JSON=')[1]);assert.ok(data.migrations.every(m=>m.status==='APPLIED'));assert.notEqual(data.schema.status,'MISSING');return data;}
test('真实发布脚本：空库安装、重复安装保留数据、旧抽奖升级及重跑', {skip:!source,timeout:60000},async()=>{
 const admin=new PrismaClient({datasources:{db:{url:source}}});let db;
 const name='welfare_release_qa_'+Date.now();const target=new URL(source);target.pathname='/'+name;const url=target.toString();
 try {
  await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  release(url,'install');
  db=new PrismaClient({datasources:{db:{url}}});
  const survivor=await db.user.create({data:{openid:'migration-survivor',nickname:'保留用户'}});
  const c=await db.welfareCampaign.create({data:{title:'新版数据必须保留',description:'qa',mode:'scheduled',startAt:new Date(),endAt:new Date(Date.now()+10000),drawAt:new Date(Date.now()+10000),claimUntil:new Date(Date.now()+20000),createdBy:'qa'}});
  release(url,'install');assert.equal(await db.welfareCampaign.count({where:{id:c.id}}),1);
  // Recreate only the old lottery schema; retain unrelated current data and the
  // real historical ledger, exactly as an already-installed release would have.
  const old=fs.readFileSync(path.join(root,'prisma/additive-migrations/postgresql/202609160001_welfare_draws.sql'),'utf8');
  run(url,[prismaCliPath(),'db','execute','--url',url,'--stdin'],`DROP TABLE welfare_entries, welfare_draws, welfare_prizes, welfare_campaigns;\n${old}`);
  await db.$executeRawUnsafe("DELETE FROM lingmeng_schema_migrations WHERE migration_name IN ('202609180001_welfare_redesign','202609180002_welfare_retire_old')");
  const coupon=await db.coupon.create({data:{name:'迁移库存校验',type:'FULL_REDUCTION',value:1,totalCount:20,receivedCount:5,startAt:new Date(),endAt:new Date(Date.now()+86400000)}});
  await db.$executeRawUnsafe(`INSERT INTO welfare_campaigns (id,title,description,mode,"startAt","endAt","claimUntil","createdBy","updatedAt") VALUES ('old-campaign','旧测试抽奖','qa','scratch',NOW(),NOW(),NOW(),'qa',NOW())`);
  await db.$executeRawUnsafe(`INSERT INTO welfare_prizes (id,"campaignId",name,kind,"couponId",quantity,"couponReserved") VALUES ('old-prize','old-campaign','qa','coupon',$1,3,3)`,coupon.id);
  release(url,'apply');
  assert.equal(await db.welfareCampaign.count(),0);
  assert.equal((await db.coupon.findUnique({where:{id:coupon.id}})).receivedCount,2);
  assert.equal(await db.user.count({where:{id:survivor.id}}),1);
  const columns=await db.$queryRawUnsafe("SELECT column_name FROM information_schema.columns WHERE table_name='welfare_entries'");
  assert.ok(!columns.some(c=>['ordinal','dayKey','source'].includes(c.column_name)));
  release(url,'apply');assert.equal((await db.coupon.findUnique({where:{id:coupon.id}})).receivedCount,2);
 } finally {
  await db?.$disconnect();await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);await admin.$disconnect();
 }
});
