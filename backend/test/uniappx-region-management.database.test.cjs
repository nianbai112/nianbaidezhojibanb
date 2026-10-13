// Only run through test-region-management-isolated.cjs. No project .env or shared database.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const url = new URL(process.env.UNIAPPX_TEST_DATABASE_URL || 'http://invalid');
assert.equal(url.protocol, 'postgresql:'); assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.port, process.env.UNIAPPX_ISOLATED_PORT);
assert.match(url.pathname, /^\/region_management_test_uniappx_[a-f0-9]{12}$/);
assert.equal(fs.realpathSync(process.cwd()), fs.realpathSync(process.env.UNIAPPX_ISOLATED_ROOT || '/invalid'));
assert.ok(path.basename(process.cwd()).startsWith('uniappx-region-management-'));
assert.ok(fs.existsSync(path.join(process.cwd(), 'cluster/postmaster.pid')));
require('ts-node').register({ transpileOnly: true, project: path.resolve(__dirname, '../tsconfig.json') });
const { PrismaClient } = require('@prisma/client');
const { Test } = require('@nestjs/testing');
const { UnauthorizedException } = require('@nestjs/common');
const { RegionService } = require('../src/modules/region/region.service.ts');
const { RegionController } = require('../src/modules/region/region.controller.ts');
const { IpGeoService } = require('../src/modules/ip-geo/ip-geo.service.ts');
const { UserService } = require('../src/modules/user/user.service.ts');
const { JwtGuard } = require('../src/guards/jwt.guard.ts');
const { TransformInterceptor } = require('../src/interceptors/transform.interceptor.ts');
const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
const service = new RegionService(db);
const userService = (prisma=db) => new UserService(prisma, {}, {}, {}, {}, {}, {}, {}, {}, {});
const payload = { regionId: 'a', realName: '合成申请人', phone: '13800000000', reason: '仅隔离测试使用的合作说明' };
const content = { category:'navItem',type:'page',title:'合成导航',icon:'https://yuntingzhe.cn/synthetic.png',target:'pages/tabbar/index/index',sortOrder:0,isShow:true };
const failStatus = (code) => (error) => error.getStatus?.() === code;
const deferred = () => { let resolve; const promise = new Promise(done=>{resolve=done});return {resolve,promise}; };
let checks=0,app;
async function check(name,work){await work();checks++;console.log('PASS',name);}
async function request(method,target,actor,data) {
  return new Promise((resolve,reject)=>{
    const source = data ? JSON.stringify(data):'';
    const req = http.request({hostname:'127.0.0.1',port:process.env.UNIAPPX_TEST_HTTP_PORT,path:target,method,headers:{'content-type':'application/json',...(actor?{'x-synthetic-actor':actor}:{})}},res=>{
      let text='';res.on('data',part=>{text+=part});res.on('end',()=>{try{resolve({status:res.statusCode,body:text?JSON.parse(text):null})}catch(e){reject(e)}});
    });req.on('error',reject);req.setTimeout(5000,()=>req.destroy(new Error('isolated HTTP timeout')));req.end(source);
  });
}
async function main(){
  const [identity] = await db.$queryRawUnsafe('SELECT current_database() AS name, host(inet_server_addr()) AS host, inet_server_port() AS port');
  assert.equal(identity.name,url.pathname.slice(1));assert.equal(identity.host,'127.0.0.1');assert.equal(String(identity.port),url.port);
  await db.user.createMany({data:['manager','other','regional','global','foreign','applicant','review-race','frozen','inactive'].map(id=>({id,openid:'isolated-'+id,status:id==='inactive'?'BANNED':'ACTIVE'}))});
  await db.region.createMany({data:[{id:'a',name:'合成甲校',code:'a',managerUserId:'manager'},{id:'b',name:'合成乙校',code:'b',managerUserId:'other'}]});
  await db.role.createMany({data:[{id:'region-role',name:'synthetic region admin',type:'REGION_ADMIN'},{id:'admin-role',name:'synthetic admin',type:'ADMIN'}]});
  await db.userRole.createMany({data:[{userId:'regional',roleId:'region-role',regionId:'a'},{userId:'foreign',roleId:'region-role',regionId:'b'},{userId:'global',roleId:'admin-role',regionId:null}]});
  await db.regionContentItem.createMany({data:[{id:'a-row',regionId:'a',type:'menu',title:'甲',link:'internal:pages/tabbar/index/index',image:content.icon},{id:'b-row',regionId:'b',type:'menu',title:'乙',link:'internal:pages/tabbar/index/index',image:content.icon}]});
  await check('DB ownership and authoritative role scope protect region management',async()=>{
    assert.equal((await service.getManagement('a',{sub:'manager'})).permissions.canEditSettings,true);
    assert.equal((await service.getManagement('a',{sub:'regional'})).permissions.canEditSettings,false);
    assert.equal((await service.getManagement('a',{sub:'global'})).permissions.canEditContent,true);
    for(const actor of [{sub:'other'},{sub:'foreign'},{sub:'applicant',role:'SUPER_ADMIN'},{sub:'manager',isAdmin:true}])await assert.rejects(service.getManagement('a',actor),failStatus(403));
  });
  await check('content writes bind to URL campus and cannot update/delete a foreign item',async()=>{
    const item=await service.addContentItem('a',{...content,regionId:'b',id:'b-row',isAdmin:true},{sub:'manager'});
    assert.equal(item.regionId,'a');assert.notEqual(item.id,'b-row');assert.equal(item.category,'navItem');
    await assert.rejects(service.updateContentItem('a','b-row',content,{sub:'manager'}),failStatus(404));
    await assert.rejects(service.deleteContentItem('a','b-row',{sub:'manager'}),failStatus(404));
    assert.equal((await db.regionContentItem.findUnique({where:{id:'b-row'}})).title,'乙');
    await service.updateContentItem('a',item.id,{...content,title:'已修改'},{sub:'manager'});assert.equal((await db.regionContentItem.findUnique({where:{id:item.id}})).title,'已修改');
    await service.deleteContentItem('a',item.id,{sub:'manager'});assert.equal(await db.regionContentItem.findUnique({where:{id:item.id}}),null);
  });
  await check('role revocation and inactive accounts are rechecked on mutation, invalid DTOs roll back',async()=>{
    await db.userRole.deleteMany({where:{userId:'regional'}});
    await assert.rejects(service.addContentItem('a',content,{sub:'regional'}),failStatus(403));
    await db.region.update({where:{id:'a'},data:{managerUserId:'inactive'}});
    await assert.rejects(service.addContentItem('a',content,{sub:'inactive'}),failStatus(403));
    await db.region.update({where:{id:'a'},data:{managerUserId:'manager'}});
    const before=await db.regionContentItem.count();
    await assert.rejects(service.addContentItem('a',{...content,type:'webview',target:'javascript:alert(1)'},{sub:'manager'}),failStatus(400));assert.equal(await db.regionContentItem.count(),before);
  });
  await check('simultaneous first applications converge to one DB row with explicit conflict or update',async()=>{
    const results=await Promise.allSettled(Array.from({length:4},()=>userService().submitCityAgentApplication('applicant',{...payload,userId:'other',status:'approved'})));
    assert.ok(results.some(result=>result.status==='fulfilled'));
    for(const result of results)if(result.status==='rejected')assert.equal(result.reason.getStatus?.(),409);
    assert.equal(await db.cityAgentApplication.count({where:{userId:'applicant',regionId:'a'}}),1);
    const saved=await db.cityAgentApplication.findFirst({where:{userId:'applicant'}});assert.equal(saved.status,'pending');
    const retried=await userService().submitCityAgentApplication('applicant',{...payload,reason:'重试后仍应更新同一条申请记录'});assert.equal(retried.application.id,saved.id);
  });
  await check('approval committed between snapshot and update cannot be downgraded to pending',async()=>{
    const application=await db.cityAgentApplication.create({data:{userId:'review-race',regionId:'a',realName:payload.realName,phone:payload.phone,reason:payload.reason}});
    const read=deferred(),resume=deferred();
    const observedPrisma={$transaction:(work,options)=>db.$transaction(tx=>work(new Proxy(tx,{get(target,key){if(key==='cityAgentApplication')return new Proxy(target[key],{get(model,method){if(method==='findFirst')return async(...args)=>{const row=await model.findFirst(...args);read.resolve();await resume.promise;return row};const value=model[method];return typeof value==='function'?value.bind(model):value}});const value=target[key];return typeof value==='function'?value.bind(target):value}})),options)};
    const task=userService(observedPrisma).submitCityAgentApplication('review-race',payload);
    await read.promise;
    try{await db.cityAgentApplication.update({where:{id:application.id},data:{status:'approved',approvedAt:new Date()}})}finally{resume.resolve()}
    await assert.rejects(task,failStatus(409));assert.equal((await db.cityAgentApplication.findUnique({where:{id:application.id}})).status,'approved');
  });
  await check('approved applications, frozen agents and inactive users cannot submit; rejected may resubmit',async()=>{
    await assert.rejects(userService().submitCityAgentApplication('review-race',payload),failStatus(400));
    await db.cityAgent.create({data:{userId:'frozen',regionId:'b',realName:payload.realName,phone:payload.phone,status:'frozen'}});
    await assert.rejects(userService().submitCityAgentApplication('frozen',payload),failStatus(400));await assert.rejects(userService().submitCityAgentApplication('inactive',payload),failStatus(400));
    await db.cityAgentApplication.updateMany({where:{userId:'applicant'},data:{status:'rejected',rejectReason:'测试退回'}});
    const retried=await userService().submitCityAgentApplication('applicant',payload);assert.equal(retried.application.status,'pending');assert.equal(retried.application.rejectReason,'');
  });
  const module=await Test.createTestingModule({controllers:[RegionController],providers:[{provide:RegionService,useValue:service},{provide:IpGeoService,useValue:{}}]})
    .overrideGuard(JwtGuard).useValue({canActivate(context){const req=context.switchToHttp().getRequest();const sub=req.headers['x-synthetic-actor'];if(!sub)throw new UnauthorizedException();req.user={sub};return true}}).compile();
  app=module.createNestApplication({logger:false});app.useGlobalInterceptors(new TransformInterceptor());await app.listen(0,'127.0.0.1');process.env.UNIAPPX_TEST_HTTP_PORT=String(app.getHttpServer().address().port);
  await check('actual HTTP management route is guarded and normalized; body cannot forge actor or campus',async()=>{
    assert.equal((await request('GET','/regions/a/management')).status,401);
    assert.equal((await request('GET','/regions/a/management','other')).status,403);
    const response=await request('GET','/regions/a/management','manager');assert.equal(response.status,200);assert.equal(response.body.permissions.canEditSettings,true);assert.ok(response.body.items.some(item=>item.id==='a-row'));
    const created=await request('POST','/regions/a/content-item','manager',{...content,regionId:'b',userId:'other'});assert.equal(created.status,201);assert.equal(created.body.regionId,'a');
    assert.equal((await request('PUT','/regions/a/content-item/b-row','manager',content)).status,404);
    assert.equal((await request('DELETE','/regions/a/content-item/b-row','manager')).status,404);
  });
  console.log(`PASS: ${checks} isolated PostgreSQL/HTTP management + partner concurrency contracts; JWT proof and external services use no real credentials.`);
}
main().catch(error=>{console.error(String(error?.stack||error).replace(/postgres(?:ql)?:\/\/[^\s"']+/gi,'[isolated database URL]'));process.exitCode=1})
.finally(async()=>{if(app)await app.close();await db.$disconnect()});
