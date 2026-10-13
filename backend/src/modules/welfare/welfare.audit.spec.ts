import { Test } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { PrismaClient } from "@prisma/client";
import Redis from "ioredis";
import request from "supertest";
import { createCipheriv, randomBytes } from "node:crypto";
import { WelfareModule } from "./welfare.module";
import { WelfareService } from "./welfare.service";
import { WelfareWorker } from "./welfare.worker";
import { WelfareWechatService } from "./welfare-wechat.service";
import { WechatTokenService } from "../wechat/wechat-token.service";
import { AddressModule } from "../address/address.module";
import { PrismaModule } from "../../common/modules/prisma.module";
import { PrismaService } from "../../common/services/prisma.service";
import { RedisService } from "../../common/services/redis.service";
import { TransformInterceptor } from "../../interceptors/transform.interceptor";
import {
  miniProgramApiCompatMiddleware,
  getMiniProgramGlobalPrefixExcludes,
} from "../../common/middleware/mini-program-api-compat";
const url = process.env.WELFARE_TEST_DATABASE_URL;
const redisUrl = process.env.WELFARE_TEST_REDIS_URL;
if (
  url &&
  !/^postgresql:\/\/[^@]+@127\.0\.0\.1:55437\/welfare_qa(?:\?|$)/.test(url)
)
  throw Error("Only isolated welfare_qa is allowed");
if (redisUrl && redisUrl !== "redis://127.0.0.1:56381/0")
  throw Error("Only isolated Redis is allowed");
(url && redisUrl ? describe : describe.skip)(
  "完整接口管线与真实 PostgreSQL/Redis 验收",
  () => {
    let app: INestApplication,
      db: PrismaClient,
      redis: Redis,
      service: WelfareService,
      wechat: WelfareWechatService,
      redisService: RedisService;
    let user: any,
      other: any,
      region: any,
      school: any,
      admin: any,
      address: any,
      userToken: string,
      otherToken: string,
      adminToken: string;
    const prefix = "wfaudit_" + Date.now(),
      appid = "wx_isolated_audit",
      key = randomBytes(16);
    const unwrap = (r: any) => r.body.data || r.body;
    const api = (
      method: "get" | "post" | "put",
      route: string,
      token = userToken,
    ) =>
      request(app.getHttpServer())
        [method](route)
        .set("Authorization", "Bearer " + token);
    const input = (patch: any = {}) => ({
      title: prefix,
      description: "本地真实数据库验收",
      mode: "scheduled",
      regionId: region.id,
      requireStudent: true,
      requireOfficial: true,
      requireGroup: true,
      groupIds: ["forged"],
      joinGuide: "从官方群卡片进入",
      claimMethod: "shipping",
      startAt: new Date(Date.now() - 60000).toISOString(),
      endAt: new Date(Date.now() + 3600000).toISOString(),
      drawAt: new Date(Date.now() + 3600000).toISOString(),
      claimUntil: new Date(Date.now() + 86400000).toISOString(),
      maxEntries: 100,
      prizes: [{ name: "验收实物", kind: "physical", quantity: 1 }],
      ...patch,
    });
    function proof(gid = "qa_official_group") {
      const iv = randomBytes(16),
        cipher = createCipheriv("aes-128-cbc", key, iv);
      return {
        iv: iv.toString("base64"),
        encryptedData: Buffer.concat([
          cipher.update(
            JSON.stringify({
              opengid: gid,
              chat_type: 3,
              watermark: { appid, timestamp: Math.floor(Date.now() / 1000) },
            }),
          ),
          cipher.final(),
        ]).toString("base64"),
      };
    }
    beforeAll(async () => {
      db = new PrismaClient({ datasources: { db: { url } } });
      await db.$connect();
      redis = new Redis(redisUrl!);
      region = await db.region.create({
        data: { name: prefix, code: prefix, onlyStudentAuthUsers: true },
      });
      school = await db.school.create({
        data: { name: prefix, regionId: region.id },
      });
      user = await db.user.create({
        data: {
          openid: prefix,
          nickname: "验收同学",
          profile: { create: { regionId: region.id } },
        },
      });
      other = await db.user.create({
        data: { openid: prefix + "_other", nickname: "另一同学" },
      });
      const role = await db.adminRole.upsert({
        where: { code: "super_admin" },
        update: {},
        create: { code: "super_admin", name: "QA" },
      });
      admin = await db.adminAccount.create({
        data: {
          username: prefix,
          passwordHash: "invalid",
          realName: "QA",
          roles: { create: { roleId: role.id } },
        },
      });
      address = await db.address.create({
        data: {
          userId: user.id,
          name: "验收同学",
          phone: "13800138000",
          detail: "测试省测试市校园一号楼",
          fullAddress: "测试省测试市校园一号楼",
        },
      });
      const m = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            ignoreEnvFile: true,
            load: [() => ({ JWT_SECRET: "isolated-audit-secret" })],
          }),
          JwtModule.register({ global: true, secret: "isolated-audit-secret" }),
          ScheduleModule.forRoot(),
          PrismaModule,
          WelfareModule,
          AddressModule,
        ],
        providers: [WelfareWorker],
      })
        .overrideProvider(PrismaService)
        .useValue(db)
        .overrideProvider("REDIS_CLIENT")
        .useValue(redis)
        .overrideProvider(WechatTokenService)
        .useValue({
          getMiniappCredentials: async () => ({ appid, secret: "qa_only" }),
        })
        .compile();
      app = m.createNestApplication();
      app.use(miniProgramApiCompatMiddleware);
      app.useGlobalPipes(
        new ValidationPipe({
          whitelist: true,
          transform: true,
          forbidNonWhitelisted: true,
          transformOptions: { enableImplicitConversion: true },
        }),
      );
      app.useGlobalInterceptors(new TransformInterceptor());
      app.setGlobalPrefix("/api/v1", {
        exclude: [
          ...getMiniProgramGlobalPrefixExcludes(),
          "admin",
          "admin/{*path}",
        ],
      });
      await app.init();
      service = m.get(WelfareService);
      wechat = m.get(WelfareWechatService);
      redisService = m.get(RedisService);
      const jwt = m.get(JwtService);
      userToken = jwt.sign({ sub: user.id });
      otherToken = jwt.sign({ sub: other.id });
      adminToken = jwt.sign({ sub: admin.id, isAdmin: true });
      await redisService.set(
        "welfare:session:" + user.id,
        key.toString("base64"),
        600,
      );
    }, 30000);
    afterAll(async () => {
      await app?.close();
      if (redis?.status !== "end") await redis?.quit();
      await db?.$disconnect();
    });
    test("真实路由前缀、学生策略、公众号状态、群密文、地址与发货完整闭环", async () => {
      const c = unwrap(
        await api("post", "/admin/welfare/campaigns", adminToken)
          .send(input())
          .expect(201),
      );
      expect(c.groupIds || []).not.toContain("forged");
      const bindingToken = randomBytes(12).toString("hex");
      await redisService.setJson(
        "welfare:binding:" + bindingToken,
        { accountId: admin.id, campaignId: c.id, candidate: null },
        900,
      );
      await api("post", "/api/miniapp/welfare/group-binding/" + bindingToken)
        .send({ proof: proof() })
        .expect(201);
      expect(
        unwrap(
          await api(
            "get",
            `/admin/welfare/campaigns/${c.id}/group-binding/${bindingToken}`,
            adminToken,
          ).expect(200),
        ).ready,
      ).toBe(true);
      await api(
        "post",
        `/admin/welfare/campaigns/${c.id}/group-binding/confirm`,
        adminToken,
      )
        .send({ token: bindingToken })
        .expect(201);
      await api(
        "post",
        `/admin/welfare/campaigns/${c.id}/publish`,
        adminToken,
      ).expect(201);
      const endpoint = `/api/miniapp/welfare/campaigns/${c.id}`;
      const detail = unwrap(
        await request(app.getHttpServer()).get(endpoint).expect(200),
      );
      expect(detail.id).toBe(c.id);
      expect(detail.groupIds).toBeUndefined();
      const join = (p = proof()) =>
        api("post", endpoint + "/participate").send({
          requestKey: "qa_request_000001",
          groupProof: p,
        });
      const rejected = await join().expect(403);
      expect(rejected.body.code).toBe("STUDENT_VERIFICATION_REQUIRED");
      await db.studentVerify.create({
        data: {
          userId: user.id,
          realName: "验收同学",
          studentId: prefix,
          schoolName: school.name,
          schoolId: school.id,
          proofMethod: "MANUAL_REVIEW",
          status: "APPROVED",
        },
      });
      expect((await join().expect(403)).body.message).toMatch(/公众号绑定/);
      await db.wechatOfficialBinding.create({
        data: {
          userId: user.id,
          officialOpenid: prefix + "_official",
          subscribe: true,
        },
      });
      const wrong = await join(proof("qa_other_group")).expect(403);
      expect(wrong.body.code).toBe("WELFARE_GROUP_REQUIRED");
      await join({ opengid: "qa_official_group" } as any).expect(400);
      const e = unwrap(await join().expect(201));
      expect(e.outcome).toBe("waiting");
      expect(unwrap(await join().expect(201)).id).toBe(e.id);
      expect(await db.welfareEntry.count({ where: { campaignId: c.id } })).toBe(
        1,
      );
      await api(
        "get",
        "/api/miniapp/welfare/entries/" + e.id,
        otherToken,
      ).expect(404);
      await db.welfareCampaign.update({
        where: { id: c.id },
        data: {
          endAt: new Date(Date.now() - 1000),
          drawAt: new Date(Date.now() - 1000),
        },
      });
      // The actual Nest @Interval registration must draw, without calling drawScheduled/sweep here.
      const deadline = Date.now() + 15000;
      let result: any;
      while (Date.now() < deadline) {
        result = await db.welfareEntry.findUnique({ where: { id: e.id } });
        if (result?.outcome === "won") break;
        await new Promise((r) => setTimeout(r, 200));
      }
      expect(result.outcome).toBe("won");
      expect(await db.welfareDraw.count({ where: { campaignId: c.id } })).toBe(
        1,
      );
      expect(
        await db.notification.count({ where: { eventKey: "welfare:" + e.id } }),
      ).toBe(1);
      const addresses = unwrap(await api("get", "/api/addresses").expect(200));
      expect(addresses.addresses.some((a: any) => a.id === address.id)).toBe(
        true,
      );
      await api("put", "/api/miniapp/welfare/entries/" + e.id + "/address")
        .send({ addressId: address.id })
        .expect(200);
      expect(
        unwrap(
          await api("get", "/api/miniapp/welfare/entries/" + e.id).expect(200),
        ).recipientName,
      ).toBe("验收同学");
      await api("post", "/admin/welfare/entries/" + e.id + "/ship", adminToken)
        .send({ carrier: "验收物流", trackingNumber: "QA12345678" })
        .expect(201);
      expect(
        unwrap(
          await api("get", "/api/miniapp/welfare/entries/" + e.id).expect(200),
        ).claimStatus,
      ).toBe("shipped");
      await api("put", "/api/miniapp/welfare/entries/" + e.id + "/address")
        .send({ addressId: address.id })
        .expect(400);
      const winners = unwrap(
        await request(app.getHttpServer())
          .get(endpoint + "/winners")
          .expect(200),
      );
      expect(JSON.stringify(winners)).not.toMatch(
        /13800138000|验收同学|QA12345678/,
      );
    }, 25000);
    test("Redis 群绑定入口不能跨管理员、跨活动确认；锁内只能提交一个候选群", async () => {
      const token = randomBytes(12).toString("hex");
      await redisService.setJson(
        "welfare:binding:" + token,
        { accountId: admin.id, campaignId: "audit_campaign", candidate: null },
        900,
      );
      const results = await Promise.allSettled([
        wechat.offerBinding(token, user.id, proof("qa_first")),
        wechat.offerBinding(token, user.id, proof("qa_second")),
      ]);
      expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
      await expect(
        wechat.binding("other_admin", "audit_campaign", token),
      ).rejects.toThrow();
      await expect(
        wechat.binding(admin.id, "other_campaign", token),
      ).rejects.toThrow();
      await wechat.consumeBinding(token);
      await expect(
        wechat.offerBinding(token, user.id, proof()),
      ).rejects.toThrow(/过期/);
    });
    test("只对外网微信返回做替身，session 验证拒绝另一个微信账号且不泄露密钥", async () => {
      const axios = (await import("axios")).default;
      const spy = jest
        .spyOn(axios, "get")
        .mockResolvedValue({
          data: { openid: other.openid, session_key: key.toString("base64") },
        });
      try {
        await expect(wechat.refreshSession(user.id, "qa_code")).rejects.toThrow(
          "不一致",
        );
        spy.mockResolvedValue({
          data: { openid: user.openid, session_key: key.toString("base64") },
        });
        expect(await wechat.refreshSession(user.id, "qa_code_2")).toEqual({
          ready: true,
        });
        expect(await wechat.groupId(user.id, proof())).toBe(
          "qa_official_group",
        );
      } finally {
        spy.mockRestore();
      }
    });
  },
);
