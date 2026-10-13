import { Test } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { PrismaModule } from "../../common/modules/prisma.module";
import { PrismaService } from "../../common/services/prisma.service";
import { UserAccessPolicyService } from "../../common/services/user-access-policy.service";
import { WelfareModule } from "./welfare.module";
import { WelfareService } from "./welfare.service";
import { WelfareCheckinService } from "./welfare-checkin.service";
import { WelfareWechatService } from "./welfare-wechat.service";
import { createCheckinToken } from "./welfare-checkin.policy";

const url = process.env.WELFARE_CHECKIN_TEST_DATABASE_URL;
if (
  url &&
  !/^postgresql:\/\/checkin_qa@127\.0\.0\.1:58479\/welfare_checkin_qa(?:\?|$)/.test(
    url,
  )
)
  throw Error(
    "Only the isolated checkin_qa database on loopback port 58479 is allowed",
  );
(url ? describe : describe.skip)("线下签到数据库事务与 HTTP 权限", () => {
  let db: PrismaClient,
    app: INestApplication,
    service: WelfareCheckinService,
    welfare: WelfareService,
    jwt: JwtService;
  let admin: string, ordinary: string, region: any, users: any[];
  const prefix = "wfci_" + Date.now();
  const actor = (u: any) => ({ sub: u.id });
  const input = (patch: any = {}) => ({
    title: "现场签到 " + prefix,
    location: "学生活动中心",
    regionId: region.id,
    startAt: new Date(Date.now() - 60000).toISOString(),
    endAt: new Date(Date.now() + 3600000).toISOString(),
    allowStaffScan: true,
    allowSelfScan: true,
    staffUserIds: [users[2].id],
    ...patch,
  });
  const make = async (patch: any = {}) => {
    const r = await service.save(null, input(patch), admin);
    return db.welfareCheckinSession.findUniqueOrThrow({ where: { id: r.id } });
  };
  const token = (
    s: any,
    kind: "staff" | "self" = "staff",
    u = users[0],
    now = Date.now(),
  ) => createCheckinToken(s, kind, u.id, now).token;
  const auth = (sub: string, isAdmin = false) =>
    "Bearer " + jwt.sign({ sub, isAdmin });
  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url } } });
    await db.$connect();
    const role = await db.adminRole.upsert({
      where: { code: "super_admin" },
      update: {},
      create: { code: "super_admin", name: "超级管理员" },
    });
    admin = (
      await db.adminAccount.create({
        data: {
          username: prefix,
          realName: "签到测试管理员",
          passwordHash: "invalid",
          roles: { create: { roleId: role.id } },
        },
      })
    ).id;
    ordinary = (
      await db.adminAccount.create({
        data: {
          username: prefix + "_ordinary",
          realName: "无权限管理员",
          passwordHash: "invalid",
        },
      })
    ).id;
    region = await db.region.create({
      data: { name: "签到测试校区", code: prefix },
    });
    users = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        db.user.create({
          data: {
            openid: prefix + "_" + i,
            nickname: "测试同学" + i,
            avatar: "/uploads/avatar.png",
            createdAt: new Date(Date.now() - 8 * 86400000),
            profile: { create: { regionId: region.id } },
          },
        }),
      ),
    );
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ JWT_SECRET: "local-welfare-checkin-test-secret" })],
        }),
        JwtModule.register({
          global: true,
          secret: "local-welfare-checkin-test-secret",
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
    service = module.get(WelfareCheckinService);
    welfare = module.get(WelfareService);
    jwt = module.get(JwtService);
  }, 30000);
  afterAll(async () => {
    await app?.close();
    await db?.$disconnect();
  });
  test("游客、普通用户、无权限管理员无法操作后台；游客不能确认签到", async () => {
    const server = app.getHttpServer();
    await request(server)
      .post("/miniapp/welfare/checkins/confirm")
      .send({ token: "fake" })
      .expect(401);
    await request(server)
      .get("/admin/welfare/checkins")
      .set("Authorization", auth(users[0].id))
      .expect(401);
    const denied = await request(server)
      .post("/admin/welfare/checkins")
      .set("Authorization", auth(ordinary, true))
      .send(input())
      .expect(401);
    expect(denied.body.message).toContain("缺少权限");
    await request(server)
      .get("/admin/welfare/checkins")
      .set("Authorization", auth(admin, true))
      .expect(200);
  });
  test("预览不写入；非本场工作人员和本人均不可核验个人码", async () => {
    const s = await make(),
      t = token(s);
    await expect(service.preview(t, actor(users[1]))).rejects.toThrow(
      "指定工作人员",
    );
    await expect(
      service.confirm(token(s, "staff", users[2]), actor(users[2])),
    ).rejects.toThrow("其他指定工作人员");
    const preview = await service.preview(t, actor(users[2]));
    expect(preview.participant.nickname).toBe(users[0].nickname);
    expect(preview.session).not.toHaveProperty("qrSecret");
    expect(
      await db.welfareCheckinRecord.count({ where: { sessionId: s.id } }),
    ).toBe(0);
  });
  test("两种方式并发20次，仅生成一条记录，重试返回同一签到时间", async () => {
    const s = await make(),
      staffToken = token(s),
      selfToken = token(s, "self");
    const all = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        i % 2
          ? service.confirm(staffToken, actor(users[2]))
          : service.confirm(selfToken, actor(users[0])),
      ),
    );
    expect(all.filter((r) => !r.duplicate)).toHaveLength(1);
    expect(
      new Set(all.map((r) => new Date(r.signedAt).toISOString())).size,
    ).toBe(1);
    expect(
      await db.welfareCheckinRecord.count({ where: { sessionId: s.id } }),
    ).toBe(1);
    const row = await db.welfareCheckinRecord.findFirstOrThrow({
      where: { sessionId: s.id },
    });
    expect(row.userId).toBe(users[0].id);
    expect(row.verifiedBy).toBe(row.source === "staff" ? users[2].id : null);
    expect(
      (await service.myState(s.id, actor(users[0]))).record,
    ).not.toBeNull();
  }, 30000);
  test("公共码只签到当前登录用户，忽略伪造的 userId 和角色", async () => {
    const s = await make(),
      t = token(s, "self");
    await request(app.getHttpServer())
      .post("/miniapp/welfare/checkins/confirm")
      .set("Authorization", auth(users[1].id))
      .send({ token: t, userId: users[0].id, isAdmin: true, source: "staff" })
      .expect(201);
    expect((await service.myState(s.id, actor(users[0]))).record).toBeNull();
    expect((await service.myState(s.id, actor(users[1]))).record?.source).toBe(
      "self",
    );
  });
  test("过期、篡改、未开始、已结束、已暂停均不新增记录", async () => {
    const s = await make();
    await expect(
      service.confirm(
        token(s, "staff", users[0], Date.now() - 121000),
        actor(users[2]),
      ),
    ).rejects.toThrow("过期");
    await expect(
      service.confirm(token({ ...s, qrSecret: "forged" }), actor(users[2])),
    ).rejects.toThrow("失效");
    const future = await make({
      startAt: new Date(Date.now() + 60000).toISOString(),
    });
    await expect(
      service.confirm(token(future), actor(users[2])),
    ).rejects.toThrow("尚未开始");
    await db.welfareCheckinSession.update({
      where: { id: s.id },
      data: { endAt: new Date(Date.now() - 1) },
    });
    await expect(service.confirm(token(s), actor(users[2]))).rejects.toThrow(
      "已结束",
    );
    const paused = await make();
    await service.setStatus(paused.id, admin, "paused");
    await expect(
      service.confirm(token(paused), actor(users[2])),
    ).rejects.toThrow("失效");
    await expect(service.publicCode(paused.id, admin)).rejects.toThrow(
      "已暂停",
    );
    expect(
      await db.welfareCheckinRecord.count({
        where: { sessionId: { in: [s.id, future.id, paused.id] } },
      }),
    ).toBe(0);
  });
  test("被禁用的方式不能发码/签到；暂停恢复使旧码立即失效", async () => {
    const staff = await make({ allowSelfScan: false });
    await expect(service.publicCode(staff.id, admin)).rejects.toThrow("未开启");
    await expect(
      service.confirm(token(staff, "self"), actor(users[0])),
    ).rejects.toThrow("已关闭");
    const self = await make({ allowStaffScan: false, staffUserIds: [] });
    await expect(
      service.personalCode(self.id, actor(users[0])),
    ).rejects.toThrow("未开启");
    const old = token(staff);
    await service.setStatus(staff.id, admin, "paused");
    await service.setStatus(staff.id, admin, "active");
    await expect(service.confirm(old, actor(users[2]))).rejects.toThrow("失效");
  });
  test("校区、用户状态和管理员数据范围分别检查，不能越权读取", async () => {
    const s = await make();
    const stranger = await db.user.create({
      data: { openid: prefix + "_stranger", nickname: "外校测试" },
    });
    await expect(
      service.confirm(token(s, "self"), actor(stranger)),
    ).rejects.toThrow("所属校区");
    await db.user.update({
      where: { id: users[4].id },
      data: { status: "BANNED" },
    });
    await expect(
      service.confirm(token(s, "staff", users[4]), actor(users[2])),
    ).rejects.toThrow("当前账号");
    await db.user.update({
      where: { id: users[4].id },
      data: { status: "ACTIVE" },
    });
    for (const method of [
      () => service.adminDetail(s.id, ordinary),
      () => service.records(s.id, ordinary, {}),
      () => service.publicCode(s.id, ordinary),
      () => service.save(s.id, input(), ordinary),
    ])
      await expect(method()).rejects.toThrow("无权管理");
    await expect(service.adminList("")).rejects.toThrow("请登录");
  });
  test("完成记录保留；过期重试幂等；已有签到后不能改场次", async () => {
    const s = await make();
    await service.confirm(token(s), actor(users[2]));
    const again = await service.confirm(
      token(s, "staff", users[0], Date.now() - 121000),
      actor(users[2]),
    );
    expect(again.duplicate).toBe(true);
    await expect(service.save(s.id, input(), admin)).rejects.toThrow(
      "配置已锁定",
    );
    await service.setStatus(s.id, admin, "paused");
    expect(
      (await service.myState(s.id, actor(users[0]))).record,
    ).not.toBeNull();
    expect((await service.records(s.id, admin, {})).list[0].operator?.id).toBe(
      users[2].id,
    );
  });
  test("签到条件在报名事务内检查，其他场次不算；已签到仍须满足资料和天数", async () => {
    const s = await make(),
      other = await make();
    const campaign = await welfare.save(
      null,
      {
        title: prefix,
        mode: "scheduled",
        description: "测试活动",
        regionId: region.id,
        requireProfile: true,
        minRegistrationDays: 7,
        requireStudent: false,
        requireOfficial: false,
        checkinSessionId: s.id,
        startAt: new Date(Date.now() - 60000).toISOString(),
        endAt: new Date(Date.now() + 3600000).toISOString(),
        drawAt: new Date(Date.now() + 3600000).toISOString(),
        claimUntil: new Date(Date.now() + 86400000).toISOString(),
        maxEntries: 100,
        claimMethod: "pickup",
        pickupLocation: "活动中心",
        prizes: [{ name: "礼品", kind: "physical", quantity: 1 }],
      },
      admin,
    );
    await welfare.transition(campaign.id, "publish", admin);
    await expect(service.save(s.id, input(), admin)).rejects.toThrow(
      "配置已锁定",
    );
    const join = () =>
      welfare.participate(
        campaign.id,
        actor(users[0]),
        "wf_checkin_request_0001",
      );
    await service.confirm(token(other, "self"), actor(users[0]));
    await expect(join()).rejects.toMatchObject({
      response: { code: "WELFARE_CHECKIN_REQUIRED" },
    });
    expect(
      await db.welfareEntry.count({ where: { campaignId: campaign.id } }),
    ).toBe(0);
    await service.confirm(token(s), actor(users[2]));
    await db.user.update({
      where: { id: users[0].id },
      data: { avatar: null },
    });
    await expect(join()).rejects.toMatchObject({
      response: { code: "WELFARE_PROFILE_REQUIRED" },
    });
    await db.user.update({
      where: { id: users[0].id },
      data: { avatar: "/uploads/avatar.png", createdAt: new Date() },
    });
    await expect(join()).rejects.toMatchObject({
      response: { code: "WELFARE_REGISTRATION_DAYS_REQUIRED" },
    });
    await db.user.update({
      where: { id: users[0].id },
      data: { createdAt: new Date(Date.now() - 8 * 86400000) },
    });
    const entry = await join();
    expect((await join()).id).toBe(entry.id);
    expect(
      (await welfare.myState(campaign.id, actor(users[0]))).eligibility
        .checkinCompleted,
    ).toBe(true);
    const detail = await welfare.publicDetail(campaign.id);
    expect(detail.checkinSession).not.toHaveProperty("qrSecret");
    expect(detail.automaticRules).toContain("线下签到");
  });
  test("后台记录、场次列表、详情均不泄漏二维码签名密钥", async () => {
    const s = await make();
    const content = JSON.stringify([
      await service.adminDetail(s.id, admin),
      await service.adminList(admin),
      await service.myState(s.id, actor(users[0])),
    ]);
    expect(content).not.toContain(s.qrSecret);
    expect(content).not.toContain("qrSecret");
    const qr = await service.publicCode(s.id, admin);
    expect(qr.image).toMatch(/^data:image\/png;base64,/);
    expect(qr.expiresAt.getTime() - qr.serverTime.getTime()).toBeGreaterThan(0);
    expect(
      qr.expiresAt.getTime() - qr.serverTime.getTime(),
    ).toBeLessThanOrEqual(60000);
  });
});
