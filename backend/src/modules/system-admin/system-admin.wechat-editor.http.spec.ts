import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import request from 'supertest';
import { SystemAdminController } from './system-admin.controller';
import { SystemAdminService } from './system-admin.service';
import { WechatAdminController } from '../wechat/wechat.admin.controller';
import { WechatOfficialService } from '../wechat/wechat-official.service';
import { WechatTokenService } from '../wechat/wechat-token.service';
import { PrismaService } from '../../common/services/prisma.service';
import { RedisService } from '../../common/services/redis.service';

// Real HTTP, DTO validation, JWT and permissions; isolated in-memory persistence.
describe('operator WeChat editor HTTP', () => {
 let app: INestApplication, jwt: JwtService;
 const rows = new Map<string, any>();
 const templateId = 'wechat_added_template_identifier_1234567890';
 const mapping = { character_string1: 'orderNo', amount2: 'orderAmount', thing3: 'serviceName', time4: 'orderTime', thing5: 'serviceAddress' };
 const input = () => ({ platformType: 'official', templateType: 'new_errand_order', templateId, fieldMapping: mapping, enabled: true });
 const matches = (row: any, where: any = {}) => Object.entries(where).every(([key, value]) => row[key] === value);
 const prisma: any = {
  adminAccount: { findUnique: async ({ where }: any) => ({ status: 'active', roles: [{ role: { code: where.id === 'super' ? 'super_admin' : 'operator', permissions: where.id === 'operator' ? [{ permission: { code: 'system:config' } }] : [] } }] }) },
  user: { findUnique: async () => ({ status: 'ACTIVE' }) },
  wechatTemplateConfig: {
   findFirst: async ({ where }: any) => [...rows.values()].find(row => matches({ regionId: null, ...row }, where)) || null,
   findUnique: async ({ where }: any) => rows.get(where.id),
   findMany: async ({ where }: any) => [...rows.values()].filter(row => matches(row, where)),
   count: async () => rows.size,
   create: async ({ data }: any) => { rows.set(data.id, { regionId: null, ...data }); return rows.get(data.id); },
   update: async ({ where, data }: any) => { rows.set(where.id, { ...rows.get(where.id), ...data }); return rows.get(where.id); },
  },
 };
 const auth = (sub: string, isAdmin = true) => 'Bearer ' + jwt.sign({ sub, isAdmin });
 beforeAll(async () => {
  const secret = 'isolated-http-editor-test-secret';
  const module = await Test.createTestingModule({
   imports: [ConfigModule.forRoot({ ignoreEnvFile: true, load: [() => ({ JWT_SECRET: secret })] }), JwtModule.register({ secret })],
   controllers: [SystemAdminController, WechatAdminController],
   providers: [SystemAdminService, { provide: PrismaService, useValue: prisma }, { provide: RedisService, useValue: {} }, { provide: WechatOfficialService, useValue: { listAccountTemplates: async () => [{ templateId }] } }, { provide: WechatTokenService, useValue: {} }],
  }).compile();
  app = module.createNestApplication(); app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true })); await app.init(); jwt = module.get(JwtService);
 });
 beforeEach(() => rows.clear()); afterAll(async () => app?.close());
 it('super administrator saves, reopens, edits and reads the exact mapping', async () => {
  const saved = await request(app.getHttpServer()).post('/admin/wechat-templates').set('Authorization', auth('super')).send(input()).expect(201);
  let list = await request(app.getHttpServer()).get('/admin/wechat-templates?platformType=official').set('Authorization', auth('super')).expect(200);
  expect(list.body.list[0].fieldMapping).toEqual(mapping);
  const changed: any = { ...mapping, thing8: mapping.thing5 }; delete changed.thing5;
  await request(app.getHttpServer()).put('/admin/wechat-templates/' + saved.body.id).set('Authorization', auth('super')).send({ fieldMapping: changed }).expect(200);
  list = await request(app.getHttpServer()).get('/admin/wechat-templates').set('Authorization', auth('super')).expect(200); expect(list.body.list[0].fieldMapping).toEqual(changed);
 });
 it('allows an operator granted system:config', async () => {
  await request(app.getHttpServer()).post('/admin/wechat-templates').set('Authorization', auth('operator')).send(input()).expect(201);
  await request(app.getHttpServer()).get('/admin/wechat/official/templates').set('Authorization', auth('operator')).expect(200);
 });
 it('rejects a role lacking configuration permission', async () => {
  await request(app.getHttpServer()).post('/admin/wechat-templates').set('Authorization', auth('readonly')).send(input()).expect(401).expect(res => expect(res.body.message).toContain('缺少权限'));
  await request(app.getHttpServer()).get('/admin/wechat/official/templates').set('Authorization', auth('readonly')).expect(401).expect(res => expect(res.body.message).toContain('缺少权限')); expect(rows.size).toBe(0);
 });
 it('rejects anonymous requests and mini-program user tokens', async () => {
  await request(app.getHttpServer()).post('/admin/wechat-templates').send(input()).expect(401);
  await request(app.getHttpServer()).post('/admin/wechat-templates').set('Authorization', auth('user', false)).send(input()).expect(401);
 });
 it('validates actual template IDs and the five candidate-rider fields', async () => {
  await request(app.getHttpServer()).post('/admin/wechat-templates').set('Authorization', auth('super')).send({ ...input(), templateId: '42995' }).expect(400);
  await request(app.getHttpServer()).post('/admin/wechat-templates').set('Authorization', auth('super')).send({ ...input(), fieldMapping: { ...mapping, thing5: 'riderPhone' } }).expect(400); expect(rows.size).toBe(0);
 });
 it('rejects a duplicate global row', async () => {
  await request(app.getHttpServer()).post('/admin/wechat-templates').set('Authorization', auth('super')).send(input()).expect(201);
  await request(app.getHttpServer()).post('/admin/wechat-templates').set('Authorization', auth('super')).send(input()).expect(400); expect(rows.size).toBe(1);
 });
});
