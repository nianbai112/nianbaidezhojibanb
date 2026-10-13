import { PrismaClient } from "@prisma/client";
import { WelfareService } from "./welfare.service";
const url = process.env.WELFARE_TEST_DATABASE_URL;
if (
  url &&
  !/^postgresql:\/\/[^@]+@127\.0\.0\.1:55437\/welfare_qa(?:\?|$)/.test(url)
)
  throw new Error(
    "Only isolated welfare_qa on loopback port 55437 is accepted",
  );
(url ? describe : describe.skip)("新版抽奖数据库事务", () => {
  let db: PrismaClient,
    service: WelfareService,
    admin: string,
    users: any[],
    region: any,
    coupon: any,
    address: any,
    otherAddress: any;
  const prefix = "wfqa_" + Date.now();
  const payload = (patch: any = {}) => ({
    title: prefix,
    description: "测试活动",
    mode: "scheduled",
    requireStudent: false,
    requireOfficial: false,
    startAt: new Date(Date.now() - 60000).toISOString(),
    endAt: new Date(Date.now() + 3600000).toISOString(),
    drawAt: new Date(Date.now() + 3600000).toISOString(),
    claimUntil: new Date(Date.now() + 86400000).toISOString(),
    maxEntries: 100,
    claimMethod: "pickup",
    pickupLocation: "测试自提点",
    prizes: [{ name: "测试奖品", kind: "physical", quantity: 1 }],
    ...patch,
  });
  const join = (
    id: string,
    u = users[0],
    key = "wf_same_request_0001",
    proof?: any,
  ) => service.participate(id, { sub: u.id }, key, proof);
  const make = async (patch: any = {}) => {
    const c = await service.save(null, payload(patch), admin);
    await service.transition(c.id, "publish", admin);
    return c;
  };
  const due = async (id: string) =>
    db.welfareCampaign.update({
      where: { id },
      data: {
        endAt: new Date(Date.now() - 1000),
        drawAt: new Date(Date.now() - 500),
      },
    });
  const finish = async (id: string) => {
    await due(id);
    await service.drawScheduled(id);
  };
  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url } } });
    await db.$connect();
    admin = (
      await db.adminAccount.create({
        data: {
          username: prefix,
          passwordHash: "not-a-login-hash",
          realName: "test",
        },
      })
    ).id;
    region = await db.region.create({
      data: { name: "测试校区", code: prefix },
    });
    users = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        db.user.create({
          data: {
            openid: prefix + "_" + i,
            nickname: "测试同学" + i,
            profile: { create: { regionId: region.id } },
          },
        }),
      ),
    );
    coupon = await db.coupon.create({
      data: {
        name: prefix,
        type: "FULL_REDUCTION",
        value: 5,
        totalCount: 50,
        startAt: new Date(Date.now() - 86400000),
        endAt: new Date(Date.now() + 10 * 86400000),
      },
    });
    address = await db.address.create({
      data: {
        userId: users[0].id,
        name: "小明",
        phone: "13800138000",
        detail: "测试市测试路一号校园驿站",
        fullAddress: "测试市测试路一号校园驿站",
        regionId: region.id,
      },
    });
    otherAddress = await db.address.create({
      data: {
        userId: users[1].id,
        name: "另一位同学",
        phone: "13900139000",
        detail: "测试市另一个校园驿站",
      },
    });
    service = new WelfareService(
      db as any,
      {
        getAdminContext: async (id: string) => ({
          isSuperAdmin: id === admin,
          regionIds: [],
        }),
      } as any,
      { assertStudentProtectedAction: async () => {} } as any,
      { hasBenefit: async () => false } as any,
      {
        groupId: async (_user: string, p: any) => {
          if (!p?.validatedByTest) throw new Error("无群凭证");
          return p.gid;
        },
      } as any,
    );
  }, 30000);
  afterAll(async () => {
    await db?.$disconnect();
  });
  test("并发20次不同请求键，只生成一份报名；开奖前不生成中奖通知", async () => {
    const c = await make();
    const all = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        join(c.id, users[0], "wf_join_request_" + i),
      ),
    );
    expect(new Set(all.map((e) => e.id)).size).toBe(1);
    expect(all[0].outcome).toBe("waiting");
    expect(await db.welfareEntry.count({ where: { campaignId: c.id } })).toBe(
      1,
    );
    expect(
      (await db.welfareCampaign.findUniqueOrThrow({ where: { id: c.id } }))
        .entryCount,
    ).toBe(1);
    expect(
      await db.notification.count({
        where: { eventKey: "welfare:" + all[0].id },
      }),
    ).toBe(0);
    await finish(c.id);
    expect((await join(c.id, users[0], "wf_late_retry_123")).id).toBe(
      all[0].id,
    );
  }, 30000);
  test("十人争一份奖品，并发四次开奖只发一次；通知不重复", async () => {
    const c = await make();
    await Promise.all(users.slice(0, 10).map((u) => join(c.id, u)));
    await due(c.id);
    await Promise.all(
      Array.from({ length: 4 }, () => service.drawScheduled(c.id)),
    );
    expect(await db.welfareDraw.count({ where: { campaignId: c.id } })).toBe(1);
    expect(
      await db.welfareEntry.count({
        where: { campaignId: c.id, outcome: "won" },
      }),
    ).toBe(1);
    expect(
      (
        await db.welfarePrize.findUniqueOrThrow({
          where: { id: c.prizes[0].id },
        })
      ).issuedCount,
    ).toBe(1);
    const entries = await db.welfareEntry.findMany({
      where: { campaignId: c.id },
    });
    expect(
      await db.notification.count({
        where: { eventKey: { in: entries.map((e) => "welfare:" + e.id) } },
      }),
    ).toBe(10);
  }, 30000);
  test("群未绑定禁止发布，外群卡片与伪造参数不能报名", async () => {
    const c = await service.save(
      null,
      payload({ requireGroup: true, joinGuide: "联系管理员邀请入群" }),
      admin,
    );
    await expect(service.transition(c.id, "publish", admin)).rejects.toThrow(
      "群绑定",
    );
    await db.welfareCampaign.update({
      where: { id: c.id },
      data: { groupIds: ["official"] },
    });
    await service.transition(c.id, "publish", admin);
    await expect(
      join(c.id, users[0], "wf_group_bad_123", { gid: "official" }),
    ).rejects.toThrow("无群凭证");
    await expect(
      join(c.id, users[0], "wf_group_wrong_123", {
        gid: "other",
        validatedByTest: true,
      }),
    ).rejects.toThrow("官方群");
    const e = await join(c.id, users[0], "wf_group_good_123", {
      gid: "official",
      validatedByTest: true,
    });
    expect(e.groupVerifiedAt).not.toBeNull();
    expect(JSON.stringify(await service.publicDetail(c.id))).not.toContain(
      "groupIds",
    );
  });
  test("名额满与报名截止阻止新报名，已有用户能恢复记录", async () => {
    const c = await make({ maxEntries: 1 });
    await join(c.id);
    await expect(join(c.id, users[1])).rejects.toThrow("名额");
    await due(c.id);
    await expect(join(c.id, users[2])).rejects.toThrow("时间");
    expect((await join(c.id)).outcome).toBe("waiting");
  });
  test("开奖人数不足先顺延，顺延次数用完后作废并通知报名者", async () => {
    const c = await make({ minParticipants: 2, extendHours: 6, maxExtensions: 1 });
    await join(c.id);
    await due(c.id);
    await expect(service.drawScheduled(c.id)).resolves.toMatchObject({ extended: true, candidateCount: 1 });
    const extended = await db.welfareCampaign.findUniqueOrThrow({ where: { id: c.id } });
    expect(extended).toMatchObject({ status: "published", extensionCount: 1, drawnAt: null });
    expect(extended.drawAt.getTime()).toBeGreaterThan(Date.now() + 5 * 3600000);
    expect(extended.endAt.getTime()).toBeGreaterThan(Date.now());
    expect(await db.welfareDraw.count({ where: { campaignId: c.id } })).toBe(0);
    await due(c.id);
    await expect(service.drawScheduled(c.id)).resolves.toMatchObject({ cancelled: true, candidateCount: 1 });
    const done = await db.welfareCampaign.findUniqueOrThrow({ where: { id: c.id } });
    expect(done.status).toBe("cancelled");
    expect(done.lastError).toContain("参与人数不足 2 人");
    const entries = await db.welfareEntry.findMany({ where: { campaignId: c.id } });
    expect(entries.map((e) => e.outcome)).toEqual(["cancelled"]);
    expect(await db.notification.count({ where: { eventKey: `welfare:${entries[0].id}` } })).toBe(1);
    await expect(service.drawScheduled(c.id)).resolves.toBe(false);
  });
  test("暂停不影响到点开奖，截止后不能取消", async () => {
    const c = await make();
    await join(c.id);
    await service.transition(c.id, "pause", admin);
    await due(c.id);
    await expect(service.transition(c.id, "cancel", admin)).rejects.toThrow();
    await service.drawScheduled(c.id);
    expect(
      (await service.myState(c.id, { sub: users[0].id })).entry?.outcome,
    ).toBe("won");
  });
  test("开奖时剔除封禁账号，空池不虚构中奖者", async () => {
    const c = await make();
    await join(c.id, users[11]);
    await db.user.update({
      where: { id: users[11].id },
      data: { status: "BANNED" },
    });
    await finish(c.id);
    expect(
      (await service.myState(c.id, { sub: users[11].id })).entry?.outcome,
    ).toBe("excluded");
    expect(
      await db.welfareEntry.count({
        where: { campaignId: c.id, outcome: "won" },
      }),
    ).toBe(0);
  });
  test("会员、校区、账号身份由服务端校验", async () => {
    const c = await make({ regionId: region.id, memberOnly: true });
    await expect(join(c.id)).rejects.toThrow("会员");
    await expect(
      service.participate(
        c.id,
        { sub: users[0].id, isAdmin: true },
        "wf_admin_request_1",
      ),
    ).rejects.toThrow("小程序");
    await expect(service.adminDetail(c.id, "other_admin")).rejects.toThrow(
      "无权",
    );
  });
  test("发布后规则锁定；其他用户不能读取记录或提交地址", async () => {
    const c = await make({ claimMethod: "shipping" }),
      e = await join(c.id);
    await finish(c.id);
    await expect(service.save(c.id, payload(), admin)).rejects.toThrow("锁定");
    await expect(service.myEntry(e.id, { sub: users[1].id })).rejects.toThrow(
      "不存在",
    );
    await expect(
      service.address(e.id, { sub: users[1].id }, { addressId: address.id }),
    ).rejects.toThrow("不存在");
  });
  test("邮寄：中奖后填地址、仅一次发货、发货后地址锁定", async () => {
    const c = await make({ claimMethod: "shipping" }),
      e = await join(c.id);
    const addr = { addressId: address.id };
    await expect(
      service.address(e.id, { sub: users[0].id }, addr),
    ).rejects.toThrow("不能");
    await finish(c.id);
    await service.address(e.id, { sub: users[0].id }, addr);
    const attempts = await Promise.allSettled([
      service.ship(e.id, admin, {
        carrier: "测试快递",
        trackingNumber: "TEST123456",
      }),
      service.ship(e.id, admin, {
        carrier: "测试快递",
        trackingNumber: "TEST123456",
      }),
    ]);
    expect(attempts.filter((a) => a.status === "fulfilled")).toHaveLength(1);
    await expect(
      service.address(e.id, { sub: users[0].id }, addr),
    ).rejects.toThrow("不能");
    const row = await service.myEntry(e.id, { sub: users[0].id });
    expect(row.claimStatus).toBe("shipped");
    expect(row.claimCode).toBeNull();
    expect(row.trackingNumber).toBe("TEST123456");
    expect(JSON.stringify(await service.winners(c.id, {}))).not.toMatch(
      /13800138000|recipient|userId|claimCode/,
    );
  });
  test("自提并发核销只成功一次；过期不可领", async () => {
    const c = await make(),
      e = await join(c.id);
    await finish(c.id);
    const won = await service.myEntry(e.id, { sub: users[0].id });
    const a = await Promise.allSettled([
      service.redeem(won.claimCode, admin),
      service.redeem(won.claimCode, admin),
    ]);
    expect(a.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const c2 = await make(),
      e2 = await join(c2.id);
    await finish(c2.id);
    const w2 = await service.myEntry(e2.id, { sub: users[0].id });
    await db.welfareCampaign.update({
      where: { id: c2.id },
      data: { claimUntil: new Date(Date.now() - 1000) },
    });
    await expect(service.redeem(w2.claimCode, admin)).rejects.toThrow("期限");
  });
  test("人工兑奖奖品生成领奖码，管理员可核销且不能重复发放", async () => {
    const c = await make({
        title: prefix + "_manual_milk_tea",
        claimMethod: "pickup",
        pickupLocation: "奶茶店前台",
        contact: "活动管理员",
        claimContactImage: "/uploads/admin-contact.png",
        claimInstructions: "凭中奖页面和领奖码到前台领取",
        prizes: [{ name: "奶茶", kind: "manual", quantity: 1 }],
      }),
      e = await join(c.id);
    const publicInfo = await service.publicDetail(c.id);
    expect(publicInfo.contact).toBeNull();
    expect(publicInfo).not.toHaveProperty("claimContactImage");
    expect(publicInfo.claimInstructions).toBe("凭中奖页面和领奖码到前台领取");
    const waiting = await service.myEntry(e.id, { sub: users[0].id });
    expect(waiting.contact).toBeNull();
    expect(waiting.claimContactImage).toBeNull();
    await finish(c.id);
    const won = await service.myEntry(e.id, { sub: users[0].id });
    expect(won.claimCode).toMatch(/^[A-F0-9]{24}$/);
    expect(won.prize?.kind).toBe("manual");
    expect(won.claimContactImage).toBe("/uploads/admin-contact.png");
    expect(won.contact).toBe("活动管理员");
    expect(won.claimInstructions).toBe("凭中奖页面和领奖码到前台领取");
    await service.redeem(won.claimCode, admin);
    await expect(service.redeem(won.claimCode, admin)).rejects.toThrow("已核销");
  });
  test("分享来源按活动去重统计，分享者本人不计入", async () => {
    const c = await make({ title: prefix + "_share_analytics" });
    // Only entrants may share; the sharer joins first.
    await expect(service.shareLink(c.id, { sub: users[0].id })).rejects.toThrow("报名成功后才能分享活动");
    await join(c.id, users[0], "wf_share_owner_000001");
    const link = await service.shareLink(c.id, { sub: users[0].id });
    expect(link.token).toMatch(/^[a-f0-9]{32}$/);
    expect(link.path).toContain("share=" + link.token);
    const first = await service.recordShareVisit(
      c.id,
      { sub: users[1].id },
      { token: link.token },
    );
    const duplicate = await service.recordShareVisit(
      c.id,
      { sub: users[1].id },
      { token: link.token },
    );
    const self = await service.recordShareVisit(
      c.id,
      { sub: users[0].id },
      { token: link.token },
    );
    expect(first).toEqual({ recorded: true, source: "unknown" });
    expect(duplicate).toEqual({ recorded: false, source: "unknown" });
    expect(self).toEqual({ recorded: false, reason: "self" });
    await expect(service.shareAnalytics(c.id, admin)).resolves.toMatchObject({
      visitors: 1,
      official: 0,
      external: 0,
      unknown: 1,
    });
  });
  test("券库存预留与释放正确，并发发券幂等", async () => {
    const before = (
      await db.coupon.findUniqueOrThrow({ where: { id: coupon.id } })
    ).receivedCount;
    const c = await make({
      prizes: [
        { name: "五元券", kind: "coupon", couponId: coupon.id, quantity: 5 },
      ],
    });
    expect(
      (await db.coupon.findUniqueOrThrow({ where: { id: coupon.id } }))
        .receivedCount,
    ).toBe(before + 5);
    const e = await join(c.id);
    await finish(c.id);
    await Promise.all([
      service.deliverCoupon(e.id),
      service.deliverCoupon(e.id),
    ]);
    expect(
      (await service.myEntry(e.id, { sub: users[0].id })).claimStatus,
    ).toBe("delivered");
    expect(
      await db.couponReceive.count({
        where: { couponId: coupon.id, userId: users[0].id },
      }),
    ).toBe(1);
    expect(
      (await db.coupon.findUniqueOrThrow({ where: { id: coupon.id } }))
        .receivedCount,
    ).toBe(before + 1);
  });
  test("后一个奖项缺货时整个发布回滚", async () => {
    const before = (
      await db.coupon.findUniqueOrThrow({ where: { id: coupon.id } })
    ).receivedCount;
    const c = await service.save(
      null,
      payload({
        prizes: [
          { name: "够库存", kind: "coupon", couponId: coupon.id, quantity: 2 },
          { name: "不足", kind: "coupon", couponId: coupon.id, quantity: 100 },
        ],
      }),
      admin,
    );
    await expect(service.transition(c.id, "publish", admin)).rejects.toThrow(
      "库存不足",
    );
    expect(
      (await db.coupon.findUniqueOrThrow({ where: { id: coupon.id } }))
        .receivedCount,
    ).toBe(before);
    expect(
      (await db.welfareCampaign.findUniqueOrThrow({ where: { id: c.id } }))
        .status,
    ).toBe("draft");
  });
  test("取消保留记录并通知，不能再次开奖", async () => {
    const c = await make(),
      e = await join(c.id);
    await service.transition(c.id, "cancel", admin);
    await finish(c.id);
    expect((await service.myEntry(e.id, { sub: users[0].id })).outcome).toBe(
      "cancelled",
    );
    expect(await db.welfareDraw.count({ where: { campaignId: c.id } })).toBe(0);
  });
  test("学生审核中与错误校区不能报名，通过有效认证后才可报名", async () => {
    const school = await db.school.create({
      data: { name: "测试学校", regionId: region.id },
    });
    const c = await make({ requireStudent: true, regionId: region.id });
    await expect(join(c.id, users[10])).rejects.toThrow("学生认证");
    const verification = await db.studentVerify.create({
      data: {
        userId: users[10].id,
        realName: "测试同学",
        studentId: prefix,
        schoolName: "测试学校",
        schoolId: school.id,
        proofMethod: "MANUAL_REVIEW",
        status: "PENDING",
      },
    });
    expect(
      (await service.myState(c.id, { sub: users[10].id })).eligibility
        .studentStatus,
    ).toBe("pending");
    await expect(join(c.id, users[10])).rejects.toThrow("学生认证");
    await db.studentVerify.update({
      where: { id: verification.id },
      data: { status: "APPROVED" },
    });
    await db.school.update({
      where: { id: school.id },
      data: { isEnabled: false },
    });
    await expect(join(c.id, users[10])).rejects.toThrow("学生认证");
    await db.school.update({
      where: { id: school.id },
      data: { isEnabled: true },
    });
    expect(
      (await service.myState(c.id, { sub: users[10].id })).eligibility
        .studentVerified,
    ).toBe(true);
    expect((await join(c.id, users[10])).outcome).toBe("waiting");
  });
  test("公众号未绑定或已取消关注不能通过，只有真实绑定状态有效", async () => {
    const c = await make({ requireOfficial: true });
    await expect(join(c.id, users[9])).rejects.toThrow("公众号绑定");
    await db.wechatOfficialBinding.create({
      data: {
        userId: users[9].id,
        officialOpenid: prefix + "_official",
        subscribe: false,
      },
    });
    await expect(join(c.id, users[9])).rejects.toThrow("公众号绑定");
    await db.wechatOfficialBinding.update({
      where: { userId: users[9].id },
      data: { subscribe: true },
    });
    expect(
      (await service.myState(c.id, { sub: users[9].id })).eligibility
        .officialBound,
    ).toBe(true);
    expect((await join(c.id, users[9])).outcome).toBe("waiting");
  });
  test("复用已有地址簿，伪造别人的地址 ID 被拒绝；提交后的地址快照不受地址簿编辑影响", async () => {
    const c = await make({ claimMethod: "shipping" }),
      e = await join(c.id);
    await finish(c.id);
    await expect(
      service.address(
        e.id,
        { sub: users[0].id },
        { addressId: otherAddress.id },
      ),
    ).rejects.toThrow("地址不存在");
    await expect(
      service.address(
        e.id,
        { sub: users[0].id },
        { name: "假姓名", phone: "13800138000", address: "伪造客户端地址" },
      ),
    ).rejects.toThrow("已有收货地址");
    await service.address(
      e.id,
      { sub: users[0].id },
      { addressId: address.id },
    );
    await db.address.update({
      where: { id: address.id },
      data: { fullAddress: "测试市修改后的其他地址" },
    });
    expect(
      (await service.myEntry(e.id, { sub: users[0].id })).recipientAddress,
    ).toBe("测试市测试路一号校园驿站");
  });
  (process.env.WELFARE_STRESS === "1" ? test : test.skip)(
    "配置上限：一万人、一千份奖品完整开奖且通知数量正确",
    async () => {
      const c = await make({
        maxEntries: 10000,
        prizes: [{ kind: "physical", name: "上限验收奖品", quantity: 1000 }],
      });
      for (let offset = 0; offset < 10000; offset += 250) {
        const rows = Array.from({ length: 250 }, (_, i) => ({
          id: `load_${prefix}_${offset + i}`,
          openid: `load_${prefix}_${offset + i}`,
          nickname: "容量验收",
        }));
        await db.user.createMany({ data: rows });
        await db.welfareEntry.createMany({
          data: rows.map((u, i) => ({
            campaignId: c.id,
            userId: u.id,
            nickname: u.nickname,
            requestKey: `load_request_${offset + i}`,
          })),
        });
      }
      await db.welfareCampaign.update({
        where: { id: c.id },
        data: { entryCount: 10000 },
      });
      await due(c.id);
      const start = Date.now();
      await service.drawScheduled(c.id);
      const elapsedMs = Date.now() - start;
      const draw = await db.welfareDraw.findUniqueOrThrow({
        where: { campaignId: c.id },
      });
      expect(draw.candidateCount).toBe(10000);
      expect(draw.randomWinners).toBe(1000);
      expect(
        await db.welfareEntry.count({
          where: { campaignId: c.id, outcome: "won" },
        }),
      ).toBe(1000);
      expect(
        await db.welfareEntry.count({
          where: { campaignId: c.id, outcome: "lost" },
        }),
      ).toBe(9000);
      const notifications = await db.notification.count({
        where: {
          scene: "welfare_draw",
          data: { path: ["campaignId"] as any, equals: c.id },
        },
      });
      expect(notifications).toBe(10000);
      console.info(
        "WELFARE_CAPACITY_AUDIT=" +
          JSON.stringify({
            entrants: 10000,
            prizes: 1000,
            elapsedMs,
            notifications,
          }),
      );
    },
    90000,
  );
});

(url ? describe : describe.skip)("新增参与条件的真实数据库验收", () => {
  let db: PrismaClient;
  let service: WelfareService;
  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url } } });
    await db.$connect();
    service = new WelfareService(db as any,
      { getAdminContext: async () => ({ isSuperAdmin: true, regionIds: [] }) } as any,
      { assertStudentProtectedAction: async () => {} } as any,
      { hasBenefit: async () => false } as any);
  });
  afterAll(async () => { await db?.$disconnect(); });
  test("活动保存、页面核验与报名拦截一致，资料和时间满足后只报名一次", async () => {
    const prefix = 'wfconditions_' + Date.now();
    const admin = await db.adminAccount.create({ data: { username: prefix, passwordHash: 'not-a-login-hash', realName: '条件验收管理员' } });
    const user = await db.user.create({ data: { openid: prefix, nickname: '用户' + prefix.slice(-6) } });
    const config = {
      title: prefix, description: '真实数据库条件验收', mode: 'scheduled',
      requireStudent: false, requireOfficial: false, requireProfile: true, minRegistrationDays: 7,
      startAt: new Date(Date.now()-60000).toISOString(), endAt: new Date(Date.now()+3600000).toISOString(),
      drawAt: new Date(Date.now()+3600000).toISOString(), claimUntil: new Date(Date.now()+86400000).toISOString(),
      maxEntries: 100, claimMethod: 'shipping', prizes: [{ name: '条件验收奖品', kind: 'physical', quantity: 1 }],
    };
    const campaign = await service.save(null, config, admin.id);
    expect(campaign).toMatchObject({ requireProfile: true, minRegistrationDays: 7 });
    await service.transition(campaign.id, 'publish', admin.id);
    const join = () => service.participate(campaign.id, { sub: user.id }, 'wf_conditions_request_001');
    expect((await service.myState(campaign.id, { sub: user.id })).eligibility)
      .toMatchObject({ profileComplete: false, registeredDays: 0, registrationEligible: false });
    await expect(join()).rejects.toThrow('完善个人资料');
    await db.user.update({ where: { id: user.id }, data: { nickname: '新同学', avatar: '/uploads/test-avatar.png' } });
    await expect(join()).rejects.toThrow('需注册满 7 天');
    expect(await db.welfareEntry.count({ where: { campaignId: campaign.id } })).toBe(0);
    expect((await db.welfareCampaign.findUniqueOrThrow({ where: { id: campaign.id } })).entryCount).toBe(0);
    await db.user.update({ where: { id: user.id }, data: { createdAt: new Date(Date.now()-7*86400000-1000) } });
    const state = await service.myState(campaign.id, { sub: user.id });
    expect(state.eligibility).toMatchObject({ profileComplete: true, registeredDays: 7, registrationEligible: true });
    const result = await join();
    await db.user.update({ where: { id: user.id }, data: { avatar: null } });
    expect((await join()).id).toBe(result.id);
    expect(await db.welfareEntry.count({ where: { campaignId: campaign.id } })).toBe(1);
    await expect(service.save(campaign.id, { ...config, minRegistrationDays: 0 }, admin.id)).rejects.toThrow('规则已锁定');
  });
});
