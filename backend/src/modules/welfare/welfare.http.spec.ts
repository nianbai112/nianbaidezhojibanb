import { Test } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { WelfareModule } from "./welfare.module";
import { PrismaModule } from "../../common/modules/prisma.module";
import { PrismaService } from "../../common/services/prisma.service";
import { WelfareWechatService } from "./welfare-wechat.service";
import { UserAccessPolicyService } from "../../common/services/user-access-policy.service";
const url = process.env.WELFARE_TEST_DATABASE_URL;
if (
  url &&
  !/^postgresql:\/\/[^@]+@127\.0\.0\.1:55437\/welfare_qa(?:\?|$)/.test(url)
)
  throw new Error("Only isolated welfare_qa DB is allowed");
(url ? describe : describe.skip)("福利抽奖 HTTP 路由与真实权限守卫", () => {
  let app: INestApplication,
    db: PrismaClient,
    superToken: string,
    userToken: string,
    ordinaryToken: string,
    jwt: JwtService;
  const prefix = "wfhttp_" + Date.now();
  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url } } });
    await db.$connect();
    const role = await db.adminRole.upsert({
      where: { code: "super_admin" },
      update: {},
      create: { code: "super_admin", name: "QA超级管理员" },
    });
    const superAdmin = await db.adminAccount.create({
      data: {
        username: prefix,
        passwordHash: "invalid",
        realName: "测试超级管理员",
        roles: { create: { roleId: role.id } },
      },
    });
    const ordinary = await db.adminAccount.create({
      data: {
        username: prefix + "_ordinary",
        passwordHash: "invalid",
        realName: "测试无权限管理员",
      },
    });
    const user = await db.user.create({
      data: { openid: prefix, nickname: "测试用户" },
    });
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ JWT_SECRET: "isolated-welfare-test-secret" })],
        }),
        JwtModule.register({
          global: true,
          secret: "isolated-welfare-test-secret",
        }),
        PrismaModule,
        WelfareModule,
      ],
    })
      .overrideProvider("REDIS_CLIENT")
      .useValue({ quit: async () => {}, disconnect: () => {} })
      .overrideProvider(WelfareWechatService)
      .useValue({})
      .overrideProvider(PrismaService)
      .useValue(db)
      .overrideProvider(UserAccessPolicyService)
      .useValue({ assertStudentProtectedAction: async () => {} })
      .compile();
    app = module.createNestApplication();
    await app.init();
    jwt = module.get(JwtService);
    superToken = jwt.sign({ sub: superAdmin.id, isAdmin: true });
    ordinaryToken = jwt.sign({ sub: ordinary.id, isAdmin: true });
    userToken = jwt.sign({ sub: user.id });
  }, 30000);
  afterAll(async () => {
    await app?.close();
    await db?.$disconnect();
  });
  test("游客可查公开列表，但不能报名和读取自己的记录", async () => {
    await request(app.getHttpServer())
      .get("/miniapp/welfare/campaigns")
      .expect(200);
    await request(app.getHttpServer()).get("/miniapp/welfare/mine").expect(401);
    await request(app.getHttpServer())
      .post("/miniapp/welfare/campaigns/abc/participate")
      .send({ requestKey: "wf_valid_request_1" })
      .expect(401);
  });
  test("普通用户不能访问后台，即使提交管理员字段", async () => {
    await request(app.getHttpServer())
      .get("/admin/welfare/campaigns")
      .set("Authorization", "Bearer " + userToken)
      .expect(401);
    await request(app.getHttpServer())
      .post("/admin/welfare/campaigns")
      .set("Authorization", "Bearer " + userToken)
      .send({ isAdmin: true })
      .expect(401);
  });
  test("未配置权限角色的后台账号被拒绝", async () => {
    await request(app.getHttpServer())
      .get("/admin/welfare/campaigns")
      .set("Authorization", "Bearer " + ordinaryToken)
      .expect(401);
  });
  test("真实超级管理员权限允许创建，敏感设置不会开放给普通用户", async () => {
    const caps = await request(app.getHttpServer())
      .get("/admin/welfare/capabilities")
      .set("Authorization", "Bearer " + superToken)
      .expect(200);
    expect(caps.body.mode).toBe("scheduled");
    expect(caps.body).not.toHaveProperty("canGift");
    const result = await request(app.getHttpServer())
      .post("/admin/welfare/campaigns")
      .set("Authorization", "Bearer " + superToken)
      .send({
        title: "HTTP测试",
        description: "隔离测试",
        mode: "scheduled",
        startAt: new Date().toISOString(),
        endAt: new Date(Date.now() + 86400000).toISOString(),
        drawAt: new Date(Date.now() + 86400000).toISOString(),
        claimUntil: new Date(Date.now() + 2 * 86400000).toISOString(),
        maxEntries: 10,
        pickupLocation: "活动中心",
        prizes: [{ kind: "physical", name: "礼物", quantity: 1 }],
      })
      .expect(201);
    expect(result.body.id).toBeDefined();
    await request(app.getHttpServer())
      .get("/miniapp/welfare/campaigns/" + result.body.id)
      .expect(404);
  });
});
