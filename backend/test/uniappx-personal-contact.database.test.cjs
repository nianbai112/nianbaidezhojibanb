// Run only through scripts/test-personal-contact-isolated.cjs; no existing DB or .env.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const url = new URL(process.env.UNIAPPX_TEST_DATABASE_URL || 'http://invalid');
assert.equal(url.protocol, 'postgresql:'); assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.port, process.env.UNIAPPX_ISOLATED_PORT);
assert.match(url.pathname, /^\/personal_contact_test_uniappx_[a-f0-9]{12}$/);
assert.equal(fs.realpathSync(process.cwd()), fs.realpathSync(process.env.UNIAPPX_ISOLATED_ROOT || '/invalid'));
assert.ok(path.basename(process.cwd()).startsWith('uniappx-personal-contact-'));
assert.ok(fs.existsSync(path.join(process.cwd(), 'cluster/postmaster.pid')));
require('ts-node').register({ transpileOnly: true, project: path.resolve(__dirname, '../tsconfig.json') });
const { PrismaClient } = require('@prisma/client');
const { Test } = require('@nestjs/testing');
const { UnauthorizedException } = require('@nestjs/common');
const { OperationService } = require('../src/modules/operation/operation.service.ts');
const { OperationController } = require('../src/modules/operation/operation.controller.ts');
const { JwtGuard } = require('../src/guards/jwt.guard.ts');
const { OptionalAuthGuard } = require('../src/guards/optional-auth.guard.ts');
const { TransformInterceptor } = require('../src/interceptors/transform.interceptor.ts');
const { getMiniProgramGlobalPrefixExcludes, miniProgramApiCompatMiddleware } = require('../src/common/middleware/mini-program-api-compat.ts');
const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
const policy={assertStudentProtectedAction:async(userId,regionId)=>{if(!['alice','bob'].includes(userId)||!['campus-a','campus-b'].includes(regionId))throw new Error('invalid synthetic policy scope')}};
const service=new OperationService(db,{},{},{},{},policy);
let checks=0,app;
async function check(name,work){await work();checks++;console.log('PASS',name)}
async function request(method,target,actor,data){return new Promise((resolve,reject)=>{const req=http.request({hostname:'127.0.0.1',port:process.env.UNIAPPX_TEST_HTTP_PORT,path:target,method,headers:{'content-type':'application/json',...(actor?{'x-synthetic-actor':actor}:{})}},res=>{let source='';res.on('data',part=>source+=part);res.on('end',()=>{try{resolve({status:res.statusCode,body:source?JSON.parse(source):null})}catch(e){reject(e)}})});req.on('error',reject);req.setTimeout(5000,()=>req.destroy(new Error('HTTP timeout')));req.end(data?JSON.stringify(data):undefined)})}
async function main(){
 const [identity]=await db.$queryRawUnsafe('SELECT current_database() AS name, host(inet_server_addr()) AS host, inet_server_port() AS port');assert.equal(identity.name,url.pathname.slice(1));assert.equal(identity.host,'127.0.0.1');assert.equal(String(identity.port),url.port);
 await db.region.createMany({data:[{id:'campus-a',name:'合成甲校',code:'synthetic-a'},{id:'campus-b',name:'合成乙校',code:'synthetic-b'}]});
 await db.user.createMany({data:['alice','bob'].map(id=>({id,openid:'synthetic-'+id,status:'ACTIVE'}))});
 await db.contactCategory.createMany({data:[{id:'cat-a',name:'甲校',regionId:'campus-a'},{id:'cat-b',name:'乙校',regionId:'campus-b'}]});
 await db.contact.create({data:{id:'historic-public',categoryId:'cat-a',name:'合成公开服务',phone:'10000',isPublic:true}});
 await check('PostgreSQL additive migration preserves existing public contact without inventing ownership',async()=>{
  await db.$executeRawUnsafe('DROP INDEX IF EXISTS "contacts_userId_categoryId_idx"');await db.$executeRawUnsafe('ALTER TABLE "contacts" DROP COLUMN "userId"');
  const sql=fs.readFileSync(path.resolve(__dirname,'../prisma/additive-migrations/postgresql/202609290003_personal_contact_ownership.sql'),'utf8');
  for(const part of sql.split(';').map(v=>v.trim()).filter(Boolean))await db.$executeRawUnsafe(part);
  const row=await db.contact.findUnique({where:{id:'historic-public'}});assert.equal(row.userId,null);assert.equal(row.isPublic,true);assert.equal(row.name,'合成公开服务');
 });
 let own;
 await check('real database writes force owner and private visibility despite spoofed payload',async()=>{
  own=await service.createContact('alice',{name:'本人好友',phone:'13800138000',category:'cat-a',region_id:'campus-a',userId:'bob',isPublic:true});assert.equal(own.userId,'alice');assert.equal(own.isPublic,false);
  await service.createContact('bob',{name:'别人好友',phone:'13800138001',category:'cat-a',region_id:'campus-a'});
  await service.createContact('alice',{name:'乙校好友',phone:'13800138002',category:'cat-b',region_id:'campus-b'});
  const data=(await service.getMyContacts('alice',{region_id:'campus-a'})).data;assert.equal(data.total,1);assert.equal(data.list[0].id,own.id);
 });
 await check('cross-owner update/delete and public-contact changes rejected without database effects',async()=>{
  await assert.rejects(()=>service.updateContact(own.id,'bob',{name:'偷改',phone:'13800138000',category:'cat-a',region_id:'campus-a'}));await assert.rejects(()=>service.deleteContact(own.id,'bob'));await assert.rejects(()=>service.deleteContact('historic-public','alice'));
  assert.equal((await db.contact.findUnique({where:{id:own.id}})).name,'本人好友');
 });
 await check('category cannot move personal contact to a foreign campus',async()=>{
  await assert.rejects(()=>service.updateContact(own.id,'alice',{name:'移校',phone:'13800138000',category:'cat-b',region_id:'campus-a'}));assert.equal((await db.contact.findUnique({where:{id:own.id}})).categoryId,'cat-a');
 });
 const module=await Test.createTestingModule({controllers:[OperationController],providers:[{provide:OperationService,useValue:service}]}).overrideGuard(JwtGuard).useValue({canActivate(ctx){const req=ctx.switchToHttp().getRequest();const sub=req.headers['x-synthetic-actor'];if(!['alice','bob'].includes(sub))throw new UnauthorizedException();req.user={sub};return true}}).overrideGuard(OptionalAuthGuard).useValue({canActivate:()=>true}).compile();
 app=module.createNestApplication({logger:false});app.use(miniProgramApiCompatMiddleware);app.useGlobalInterceptors(new TransformInterceptor());app.setGlobalPrefix('/api/v1',{exclude:[...getMiniProgramGlobalPrefixExcludes(),'api/{*path}']});await app.listen(0,'127.0.0.1');process.env.UNIAPPX_TEST_HTTP_PORT=String(app.getHttpServer().address().port);
 await check('real Nest route rejects unauthenticated private list and ignores query userId',async()=>{
  assert.equal((await request('GET','/api/contacts/my?region_id=campus-a')).status,401);
  const row=await request('GET','/api/contacts/my?region_id=campus-a&userId=bob','alice');assert.equal(row.status,200);assert.equal(row.body.data.list[0].id,own.id);
 });
 await check('real HTTP create uses JWT ownership and public payload cannot create campus-wide records',async()=>{
  const created=await request('POST','/api/contacts','alice',{name:'HTTP同学',phone:'13800138009',category:'cat-a',region_id:'campus-a',userId:'bob',isPublic:true});assert.equal(created.status,201);const id=created.body.id||created.body.data?.id;assert.ok(id);const row=await db.contact.findUnique({where:{id}});assert.equal(row.userId,'alice');assert.equal(row.isPublic,false);
  assert.equal((await request('DELETE','/api/contacts/'+id,'bob')).status,404);assert.equal((await request('DELETE','/api/contacts/'+id,'alice')).status,200);assert.equal(await db.contact.findUnique({where:{id}}),null);
 });
 await check('actual post and second-hand additive SQL preserves historic rows and leaves legacy request keys null',async()=>{
  await db.post.create({data:{id:'legacy-before-idempotency',userId:'alice',regionId:'campus-a',content:'history',status:'PUBLISHED',auditStatus:'approved'}});
  await db.secondHand.create({data:{id:'legacy-before-idempotency',userId:'alice',title:'history',category:'general',price:1,images:[]}});
  for(const [table,migration] of [['posts','202609290004_post_create_idempotency'],['second_hands','202609290005_second_hand_create_idempotency']]){
   await db.$executeRawUnsafe(`DROP INDEX "${table}_userId_clientRequestId_key"`);
   await db.$executeRawUnsafe(`ALTER TABLE "${table}" DROP COLUMN "clientRequestId", DROP COLUMN "clientPayloadHash"`);
   const sql=fs.readFileSync(path.resolve(__dirname,'../prisma/additive-migrations/postgresql/'+migration+'.sql'),'utf8');
   for(const part of sql.split(';').map(v=>v.trim()).filter(Boolean))await db.$executeRawUnsafe(part);
  }
  assert.equal((await db.post.findUnique({where:{id:'legacy-before-idempotency'}})).clientRequestId,null);
  assert.equal((await db.secondHand.findUnique({where:{id:'legacy-before-idempotency'}})).title,'history');
 });
 await check('published-post and second-hand idempotency indexes are scoped to owner and permit historic nulls',async()=>{
  const post={content:'synthetic',status:'PUBLISHED',auditStatus:'approved',regionId:'campus-a'};
  await db.post.create({data:{...post,userId:'alice',clientRequestId:'retry-key'}});await assert.rejects(()=>db.post.create({data:{...post,userId:'alice',clientRequestId:'retry-key'}}),e=>e.code==='P2002');await db.post.create({data:{...post,userId:'bob',clientRequestId:'retry-key'}});await db.post.createMany({data:[{...post,userId:'alice'},{...post,userId:'alice'}]});
  const item={title:'合成闲置',category:'general',price:1,images:[],userId:'alice',clientRequestId:'retry-item'};await db.secondHand.create({data:item});await assert.rejects(()=>db.secondHand.create({data:item}),e=>e.code==='P2002');await db.secondHand.create({data:{...item,userId:'bob'}});
 });
 await check('nearby SQL uses real distance, campus, publication, blocking and stable page counts',async()=>{
  const {nearbyPostIds}=require('../src/modules/post/post-nearby.ts');
  await db.post.createMany({data:[
   {id:'near-self',userId:'alice',regionId:'campus-a',content:'near',status:'PUBLISHED',auditStatus:'approved',latitude:30,longitude:120},
   {id:'near-second',userId:'alice',regionId:'campus-a',content:'next',status:'PUBLISHED',auditStatus:'approved',latitude:30.005,longitude:120},
   {id:'near-other',userId:'bob',regionId:'campus-a',content:'blocked',status:'PUBLISHED',auditStatus:'approved',latitude:30.001,longitude:120},
   {id:'far',userId:'alice',regionId:'campus-a',content:'far',status:'PUBLISHED',auditStatus:'approved',latitude:31,longitude:120},
   {id:'near-foreign',userId:'alice',regionId:'campus-b',content:'foreign',status:'PUBLISHED',auditStatus:'approved',latitude:30,longitude:120},
   {id:'near-hidden',userId:'alice',regionId:'campus-a',content:'hidden',status:'PENDING',auditStatus:'pending',latitude:30,longitude:120},
  ]});
  await db.block.create({data:{userId:'bob',blockedId:'alice'}});
  const first=await nearbyPostIds(db,'campus-a',{latitude:30,longitude:120,radius:1000,limit:1,page:1},'alice');
  assert.equal(first.total,2);assert.equal(first.rows[0].id,'near-self');assert.ok(first.rows[0].distance<1);
  const second=await nearbyPostIds(db,'campus-a',{latitude:30,longitude:120,radius:1000,limit:1,page:2},'alice');assert.equal(second.total,2);assert.equal(second.rows[0].id,'near-second');assert.ok(second.rows[0].distance>500);
  const guest=await nearbyPostIds(db,'campus-a',{latitude:30,longitude:120,radius:1000},undefined);assert.equal(guest.total,3);
  await assert.rejects(()=>nearbyPostIds(db,'campus-a',{latitude:'',longitude:120}));
 });
 await check('concurrent second-hand retries create one payable order, and competing payments allocate only one item',async()=>{
  const {PaymentService}=require('../src/modules/payment/payment.service.ts');const {requestContext}=require('../src/common/request-context.ts');
  await db.secondHandRegionSetting.create({data:{regionId:'campus-a',enableOnlinePayment:true}});
  await db.secondHand.create({data:{id:'sale-race',userId:'bob',regionId:'campus-a',title:'合成二手交易',price:10,category:'general',images:[],deliveryType:'包邮',status:'ON_SALE'}});
  const ops=new OperationService(db,{}, {wxUnifiedOrder:async()=>({paymentNo:'synthetic-only'})},{},{},policy);
  const results=await requestContext.run({request:{headers:{'x-client-platform':'app-android'}}},()=>Promise.all([ops.createSecondHandOrder('alice',{productId:'sale-race'}),ops.createSecondHandOrder('alice',{productId:'sale-race'})]));
  assert.equal(results[0].order.id,results[1].order.id);assert.equal(await db.secondHandOrder.count({where:{productId:'sale-race'}}),1);
  const first=results[0].order,second=await db.secondHandOrder.create({data:{orderNo:'synthetic-legacy-race',productId:'sale-race',buyerId:'alice',userId:'alice',sellerId:'bob',price:10,status:'pending_pay'}});
  const apply=order=>db.$transaction(tx=>PaymentService.prototype.updateBizOrder.call({logger:{warn:()=>{}}},tx,{bizType:'second_hand',bizId:order.id,paymentNo:'synthetic-'+order.id,amount:10}));
  const outcomes=await Promise.all([apply(first),apply(second)]);assert.equal(outcomes.filter(row=>row.refundCancelledSecondHand).length,1);
  assert.equal(await db.secondHandOrder.count({where:{productId:'sale-race',status:'paid'}}),1);assert.equal((await db.secondHand.findUnique({where:{id:'sale-race'}})).status,'SOLD');
  const loser=await db.secondHandOrder.findFirst({where:{productId:'sale-race',status:'cancelled'}});
  await db.$transaction(tx=>PaymentService.prototype.markBizRefunded.call({},tx,'second_hand',loser.id,10,true,10));
  assert.equal((await db.secondHand.findUnique({where:{id:'sale-race'}})).status,'SOLD');
 });
 await check('topup payment after cancellation cannot grant entitlement; concurrent purchases extend the same post cumulatively',async()=>{
  const {PaymentService}=require('../src/modules/payment/payment.service.ts');const {TopupService}=require('../src/modules/topup/topup.service.ts');
  const base=new Date(Date.now()+86400000);await db.post.create({data:{id:'topup-race-post',userId:'alice',regionId:'campus-a',status:'PUBLISHED',auditStatus:'approved',content:'合成置顶',isTop:true,topExpireAt:base}});
  const orders=[];for(const id of ['cancelled-pin','first-pin','second-pin']){orders.push(await db.topupOrder.create({data:{id,orderNo:id,userId:'alice',packageId:'synthetic',postId:'topup-race-post',regionId:'campus-a',paymentNo:'pay-'+id,amount:1,status:'paying',duration:1,durationUnit:'hours'}}));await db.paymentOrder.create({data:{paymentNo:'pay-'+id,bizType:'topup',bizId:id,orderNo:id,userId:'alice',amount:1,status:'paying'}})}
  const topup=new TopupService(db,{},{},{});await topup.cancelOrderUnlocked('cancelled-pin','alice');
  const apply=order=>db.$transaction(tx=>PaymentService.prototype.updateBizOrder.call({logger:{warn:()=>{}}},tx,{bizType:'topup',bizId:order.id,paymentNo:order.paymentNo,amount:1}));
  assert.equal((await apply(orders[0])).refundCancelledTopup,true);assert.equal((await db.post.findUnique({where:{id:'topup-race-post'}})).topExpireAt.getTime(),base.getTime());
  await Promise.all([apply(orders[1]),apply(orders[2])]);assert.equal((await db.post.findUnique({where:{id:'topup-race-post'}})).topExpireAt.getTime(),base.getTime()+7200000);
 });
 await check('actual contact visibility migration keeps historical contacts forbidden by default',async()=>{
  await db.userSettings.create({data:{userId:'alice',privacyLevel:0}});
  await db.$executeRawUnsafe('ALTER TABLE "user_settings" DROP COLUMN "wechatContactPermission", DROP COLUMN "phoneContactPermission"');
  const sql=fs.readFileSync(path.resolve(__dirname,'../prisma/additive-migrations/postgresql/202609290007_contact_visibility_permissions.sql'),'utf8');
  for(const part of sql.split(';').map(v=>v.trim()).filter(Boolean))await db.$executeRawUnsafe(part);
  const row=await db.userSettings.findUnique({where:{userId:'alice'}});assert.equal(row.privacyLevel,0);assert.equal(row.wechatContactPermission,3);assert.equal(row.phoneContactPermission,3);
 });
 await check('concurrent invite claims pay once and use transport IP rather than submitted metadata',async()=>{
  await db.user.createMany({data:['invite-owner','invite-user'].map(id=>({id,openid:'synthetic-'+id,status:'ACTIVE'}))});
  await db.shareSettings.createMany({data:[{regionId:'campus-a',isEnabled:true,inviterReward:2,inviteeReward:1,totalRewardBudget:3},{regionId:'campus-b',isEnabled:true,inviterReward:2,inviteeReward:1,totalRewardBudget:3}]});
  const run=region_id=>service.beInvited('invite-user',{inviter_id:'invite-owner',region_id,ip:'spoofed-ip',user_agent:'spoofed-agent'},{ip:'127.0.0.1',userAgent:'synthetic-http'});
  const outcomes=await Promise.allSettled([run('campus-a'),run('campus-b')]);assert.equal(outcomes.filter(row=>row.status==='fulfilled').length,1);
  assert.equal(await db.shareInvite.count({where:{inviteeId:'invite-user'}}),1);
  const invite=await db.shareInvite.findFirst({where:{inviteeId:'invite-user'}});assert.equal(invite.ip,'127.0.0.1');assert.equal(invite.userAgent,'synthetic-http');
  assert.equal(Number((await db.wallet.findUnique({where:{userId:'invite-owner'}})).balance),2);assert.equal(Number((await db.wallet.findUnique({where:{userId:'invite-user'}})).balance),1);
  assert.equal(await db.shareReward.count({where:{inviteId:invite.id}}),2);
 });
 await check('different invite pairs cannot concurrently overspend one campaign budget',async()=>{
  await db.user.createMany({data:['quota-owner-a','quota-owner-b','quota-user-a','quota-user-b'].map(id=>({id,openid:'synthetic-'+id,status:'ACTIVE'}))});
  await db.region.create({data:{id:'campus-quota',name:'合成奖励校区',code:'synthetic-quota'}});
  await db.shareSettings.create({data:{regionId:'campus-quota',isEnabled:true,inviterReward:2,inviteeReward:1,totalRewardBudget:3}});
  const outcomes=await Promise.allSettled(['a','b'].map(key=>service.beInvited('quota-user-'+key,{inviter_id:'quota-owner-'+key,region_id:'campus-quota'},{ip:'127.0.0.1'})));
  assert.equal(outcomes.filter(row=>row.status==='fulfilled').length,1);assert.equal(await db.shareInvite.count({where:{regionId:'campus-quota'}}),1);
  const sum=await db.shareReward.aggregate({where:{invite:{regionId:'campus-quota'}},_sum:{amount:true}});assert.equal(Number(sum._sum.amount),3);
 });
 console.log(`PASS: ${checks} isolated PostgreSQL + Nest HTTP contacts/idempotency contracts; identity policy replaced with a synthetic scope stub, no real student/provider data.`);
}
main().catch(error=>{console.error(String(error?.message||error).replace(/postgres(?:ql)?:\/\/[^\s"']+/gi,'[isolated database URL]'));process.exitCode=1}).finally(async()=>{if(app)await app.close();await db.$disconnect()});
