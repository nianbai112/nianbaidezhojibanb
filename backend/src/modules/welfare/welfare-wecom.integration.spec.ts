import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import Redis from "ioredis";
import axios from "axios";
import express from "express";
import request from "supertest";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { WelfareWecomService } from "./welfare-wecom.service";
import { WelfareService } from "./welfare.service";
import { WelfareWecomCallbackController } from "./welfare-wecom.controller";
import { RedisService } from "../../common/services/redis.service";
import { AdminDataScopeService } from "../../common/services/admin-data-scope.service";
import { UserAccessPolicyService } from "../../common/services/user-access-policy.service";
import { TransformInterceptor } from "../../interceptors/transform.interceptor";
import {
  getMiniProgramGlobalPrefixExcludes,
  miniProgramApiCompatMiddleware,
} from "../../common/middleware/mini-program-api-compat";

const url = process.env.WELFARE_WECOM_TEST_DATABASE_URL,
  redisUrl = process.env.WELFARE_WECOM_TEST_REDIS_URL;
if (
  url &&
  !/^postgresql:\/\/[^@]+@127\.0\.0\.1:55439\/welfare_wecom_qa(?:\?|$)/.test(
    url,
  )
)
  throw Error("Only isolated welfare_wecom_qa is allowed");
if (redisUrl && redisUrl !== "redis://127.0.0.1:56383/0")
  throw Error("Only isolated WeCom QA Redis is allowed");
(url && redisUrl ? describe : describe.skip)(
  "企业微信群真实数据库、Redis与HTTP验收",
  () => {
    let db: PrismaClient,
      redis: Redis,
      service: WelfareService,
      wecom: WelfareWecomService,
      app: INestApplication;
    let admin: any,
      region: any,
      stay: any,
      left: any,
      groupId: string,
      remoteMembers: any[];
    const prefix = "wecom_qa_" + Date.now(),
      aes = randomBytes(32),
      previousScope = process.env.WX_OPEN_PLATFORM_ACCOUNT_ID;
    const config = {
      enabled: true,
      corpId: "ww_" + prefix,
      appSecret: "qa-secret",
      unionScope: "qa-platform",
      callbackToken: "qa-callback-token",
      encodingAESKey: aes.toString("base64").slice(0, -1),
    };
    const fullMembers = () => [
      { type: 2, userid: "remote-stay", unionid: stay.unionid },
      { type: 2, userid: "remote-left", unionid: left.unionid },
    ];
    function callback(message: string) {
      const size = Buffer.alloc(4);
      size.writeUInt32BE(Buffer.byteLength(message));
      const raw = Buffer.concat([
          randomBytes(16),
          size,
          Buffer.from(message),
          Buffer.from(config.corpId),
        ]),
        pad = 32 - (raw.length % 32);
      const cipher = createCipheriv("aes-256-cbc", aes, aes.subarray(0, 16));
      cipher.setAutoPadding(false);
      const encrypted = Buffer.concat([
          cipher.update(Buffer.concat([raw, Buffer.alloc(pad, pad)])),
          cipher.final(),
        ]).toString("base64"),
        timestamp = String(Math.floor(Date.now() / 1000)),
        nonce = "qa-nonce";
      return {
        encrypted,
        query: {
          timestamp,
          nonce,
          msg_signature: createHash("sha1")
            .update(
              [config.callbackToken, timestamp, nonce, encrypted]
                .sort()
                .join(""),
            )
            .digest("hex"),
        },
      };
    }
    async function enrolled() {
      remoteMembers = fullMembers();
      await wecom.invalidate(config.corpId, "chat-qa");
      const now = Date.now();
      const campaign = await service.save(
        null,
        {
          title: prefix,
          description: "企业微信群真实验收",
          regionId: region.id,
          mode: "scheduled",
          requireStudent: false,
          requireOfficial: false,
          requireGroup: true,
          groupVerificationMode: "wecom_member",
          groupRecheckAtDraw: true,
          groupIds: [groupId],
          joinGuide: "入群后返回小程序，开奖前保持在群",
          claimMethod: "shipping",
          startAt: new Date(now - 60000),
          endAt: new Date(now + 3600000),
          drawAt: new Date(now + 3600000),
          claimUntil: new Date(now + 86400000),
          maxEntries: 100,
          prizes: [{ name: "验收奖品", kind: "physical", quantity: 1 }],
        },
        admin.id,
      );
      await service.transition(campaign.id, "publish", admin.id);
      const first = await service.participate(
        campaign.id,
        { sub: stay.id },
        "wecom_request_stay_1",
      );
      const second = await service.participate(
        campaign.id,
        { sub: left.id },
        "wecom_request_left_1",
      );
      await db.welfareCampaign.update({
        where: { id: campaign.id },
        data: { endAt: new Date(now - 2000), drawAt: new Date(now - 1000) },
      });
      return { campaign, first, second };
    }
    beforeAll(async () => {
      process.env.WX_OPEN_PLATFORM_ACCOUNT_ID = config.unionScope;
      db = new PrismaClient({ datasources: { db: { url } } });
      await db.$connect();
      redis = new Redis(redisUrl!);
      await redis.ping();
      region = await db.region.create({
        data: { name: prefix, code: prefix, onlyStudentAuthUsers: false },
      });
      stay = await db.user.create({
        data: {
          openid: prefix + "_stay",
          unionid: "union_qa_stay",
          nickname: "在群同学",
          profile: { create: { regionId: region.id } },
        },
      });
      left = await db.user.create({
        data: {
          openid: prefix + "_left",
          unionid: "union_qa_left",
          nickname: "退群同学",
          profile: { create: { regionId: region.id } },
        },
      });
      const role = await db.adminRole.upsert({
        where: { code: "super_admin" },
        update: {},
        create: { code: "super_admin", name: "QA超级管理员" },
      });
      admin = await db.adminAccount.create({
        data: {
          username: prefix,
          passwordHash: "qa-no-login",
          realName: "QA管理员",
          roles: { create: { roleId: role.id } },
        },
      });
      const scope = new AdminDataScopeService(db as any),
        cache = new RedisService(redis);
      wecom = new WelfareWecomService(db as any, cache, scope);
      service = new WelfareService(
        db as any,
        scope,
        new UserAccessPolicyService(db as any, cache),
        {} as any,
        undefined,
        wecom,
      );
      jest.spyOn(axios, "get").mockResolvedValue({
        data: { errcode: 0, access_token: "qa-token", expires_in: 7200 },
      });
      jest
        .spyOn(axios, "post")
        .mockImplementation(async (_url: any, body: any) => ({
          data: {
            errcode: 0,
            group_chat: {
              chat_id: body.chat_id,
              name: "验收官方群",
              owner: "qa-owner",
              member_version: createHash("sha256")
                .update(JSON.stringify(remoteMembers))
                .digest("hex"),
              member_list: remoteMembers,
            },
          },
        }));
      await wecom.saveConfig(admin.id, config);
      remoteMembers = fullMembers();
      const registered = await wecom.importGroups(admin.id, {
        chatIds: ["chat-qa"],
        regionId: region.id,
      });
      groupId = registered.list[0].id;
      const module = await Test.createTestingModule({
        controllers: [WelfareWecomCallbackController],
        providers: [{ provide: WelfareWecomService, useValue: wecom }],
      }).compile();
      app = module.createNestApplication({ rawBody: true });
      app.use(
        ["/wechat/wecom/callback", "/api/wechat/wecom/callback"],
        express.text({ type: ["text/xml", "application/xml"], limit: "64kb" }),
      );
      app.use(miniProgramApiCompatMiddleware);
      app.setGlobalPrefix("/api/v1", {
        exclude: getMiniProgramGlobalPrefixExcludes(),
      });
      app.useGlobalInterceptors(new TransformInterceptor());
      await app.init();
    }, 30000);
    afterAll(async () => {
      jest.restoreAllMocks();
      if (previousScope === undefined)
        delete process.env.WX_OPEN_PLATFORM_ACCOUNT_ID;
      else process.env.WX_OPEN_PLATFORM_ACCOUNT_ID = previousScope;
      await app?.close();
      if (redis) await redis.quit();
      if (db) await db.$disconnect();
    });
    test("签名回调通过真实HTTP返回纯文本，退群使数据库快照过期；伪造签名不更新", async () => {
      const echo = callback("echo-qa");
      const verified = await request(app.getHttpServer())
        .get("/wechat/wecom/callback")
        .query({ ...echo.query, echostr: echo.encrypted });
      expect(verified.status).toBe(200);
      expect(verified.text).toBe("echo-qa");
      const before = await db.welfareWecomGroup.findUniqueOrThrow({
        where: { id: groupId },
      });
      const event = callback(
        "<xml><ToUserName>" +
          config.corpId +
          "</ToUserName><Event>change_external_chat</Event><ChatId>chat-qa</ChatId><UpdateDetail>del_member</UpdateDetail></xml>",
      );
      const payload =
        "<xml><Encrypt><![CDATA[" + event.encrypted + "]]></Encrypt></xml>";
      const response = await request(app.getHttpServer())
        .post("/api/wechat/wecom/callback")
        .query(event.query)
        .set("Content-Type", "application/xml")
        .send(payload);
      expect(response.status).toBe(200);
      expect(response.text).toBe("success");
      expect(
        await db.welfareWecomGroup.findUniqueOrThrow({
          where: { id: groupId },
        }),
      ).toMatchObject({
        dirtyVersion: before.dirtyVersion + 1,
        syncedAt: null,
      });
      const refused = await request(app.getHttpServer())
        .post("/wechat/wecom/callback")
        .query({ ...event.query, msg_signature: "0".repeat(40) })
        .set("Content-Type", "text/xml")
        .send(payload);
      expect(refused.status).toBe(403);
      expect(
        (
          await db.welfareWecomGroup.findUniqueOrThrow({
            where: { id: groupId },
          })
        ).dirtyVersion,
      ).toBe(before.dirtyVersion + 1);
    });
    test("报名无需卡片，退群后并发开奖只生成一次，只有在群者获奖", async () => {
      const { campaign, first, second } = await enrolled();
      remoteMembers = [fullMembers()[0]];
      await wecom.invalidate(config.corpId, "chat-qa");
      await Promise.allSettled([
        service.drawScheduled(campaign.id),
        service.drawScheduled(campaign.id),
      ]);
      expect(
        await db.welfareDraw.count({ where: { campaignId: campaign.id } }),
      ).toBe(1);
      expect(
        await db.welfareEntry.findUnique({ where: { id: first.id } }),
      ).toMatchObject({
        outcome: "won",
        groupVerifiedId: groupId,
        groupCheckedAtDraw: expect.any(Date),
      });
      expect(
        await db.welfareEntry.findUnique({ where: { id: second.id } }),
      ).toMatchObject({
        outcome: "excluded",
        exclusionReason: "left_official_group",
      });
      expect(
        (
          await db.welfarePrize.findMany({ where: { campaignId: campaign.id } })
        )[0].issuedCount,
      ).toBe(1);
      expect(
        await db.notification.count({
          where: {
            eventKey: { in: ["welfare:" + first.id, "welfare:" + second.id] },
          },
        }),
      ).toBe(2);
      expect(await service.drawScheduled(campaign.id)).toBe(false);
    });
    test("成员查询失败时仍等待开奖，恢复后能正常开奖", async () => {
      const { campaign } = await enrolled();
      const post = jest.spyOn(axios, "post");
      post.mockRejectedValueOnce(Error("mock network timeout"));
      await expect(service.drawScheduled(campaign.id)).rejects.toThrow(
        "查询失败",
      );
      expect(
        await db.welfareDraw.count({ where: { campaignId: campaign.id } }),
      ).toBe(0);
      expect(
        await db.welfareEntry.count({
          where: { campaignId: campaign.id, outcome: "waiting" },
        }),
      ).toBe(2);
      await service.drawScheduled(campaign.id);
      expect(
        await db.welfareEntry.count({
          where: { campaignId: campaign.id, outcome: "won" },
        }),
      ).toBe(1);
    });
    test("开奖写通知失败，奖品和结果一起回滚，重试只发一次奖", async () => {
      const { campaign } = await enrolled();
      await db.$executeRawUnsafe(
        "CREATE OR REPLACE FUNCTION wecom_qa_fail_notification() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'mock notification persistence failed'; END $$",
      );
      await db.$executeRawUnsafe(
        "CREATE TRIGGER wecom_qa_fail_notification BEFORE INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION wecom_qa_fail_notification()",
      );
      try {
        await expect(service.drawScheduled(campaign.id)).rejects.toThrow(
          "persistence",
        );
      } finally {
        await db.$executeRawUnsafe(
          "DROP TRIGGER wecom_qa_fail_notification ON notifications",
        );
        await db.$executeRawUnsafe(
          "DROP FUNCTION wecom_qa_fail_notification()",
        );
      }
      expect(
        await db.welfareDraw.count({ where: { campaignId: campaign.id } }),
      ).toBe(0);
      expect(
        await db.welfareEntry.count({
          where: { campaignId: campaign.id, outcome: "waiting" },
        }),
      ).toBe(2);
      expect(
        (
          await db.welfarePrize.findMany({ where: { campaignId: campaign.id } })
        )[0].issuedCount,
      ).toBe(0);
      await service.drawScheduled(campaign.id);
      expect(
        await db.welfareDraw.count({ where: { campaignId: campaign.id } }),
      ).toBe(1);
      expect(
        (
          await db.welfarePrize.findMany({ where: { campaignId: campaign.id } })
        )[0].issuedCount,
      ).toBe(1);
    });
    test("群解散的签名通知后，所有只在该群的报名取消资格，开奖正常完成", async () => {
      const { campaign } = await enrolled();
      const event = callback(
        "<xml><ToUserName>" +
          config.corpId +
          "</ToUserName><Event>change_external_chat</Event><ChatId>chat-qa</ChatId><ChangeType>dismiss</ChangeType></xml>",
      );
      const result = await request(app.getHttpServer())
        .post("/wechat/wecom/callback")
        .query(event.query)
        .set("Content-Type", "text/xml")
        .send("<xml><Encrypt>" + event.encrypted + "</Encrypt></xml>");
      expect(result.status).toBe(200);
      await expect(service.drawScheduled(campaign.id)).resolves.toMatchObject({
        candidateCount: 0,
        randomWinners: 0,
      });
      expect(
        await db.welfareEntry.count({
          where: {
            campaignId: campaign.id,
            outcome: "excluded",
            exclusionReason: "left_official_group",
          },
        }),
      ).toBe(2);
      expect(
        (
          await db.welfareCampaign.findUniqueOrThrow({
            where: { id: campaign.id },
          })
        ).status,
      ).toBe("finished");
    });
  },
);
