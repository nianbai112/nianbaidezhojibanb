import { createHmac } from "node:crypto";
import {
  authenticateCheckinToken,
  checkinAvailable,
  createCheckinToken,
  readCheckinToken,
  validateCheckinSession,
} from "./welfare-checkin.policy";
const now = Date.parse("2026-09-27T08:30:15Z");
const session = {
  id: "session-1",
  qrSecret: "secret-for-local-test",
  status: "active",
  startAt: new Date(now - 1000),
  endAt: new Date(now + 3600000),
};
const input = {
  title: "迎新晚会",
  location: "活动中心",
  startAt: session.startAt.toISOString(),
  endAt: session.endAt.toISOString(),
  allowStaffScan: true,
  allowSelfScan: true,
  staffUserIds: ["staff-1"],
};
describe("线下签到签名与边界", () => {
  test("现场码按60秒时段轮换，个人码绑定用户且120秒过期", () => {
    const publicCode = createCheckinToken(session, "self", undefined, now);
    expect(publicCode.expiresAt.getTime()).toBe(now + 45000);
    expect(
      createCheckinToken(session, "self", undefined, now + 20000).token,
    ).toBe(publicCode.token);
    expect(
      createCheckinToken(session, "self", undefined, now + 45000).token,
    ).not.toBe(publicCode.token);
    expect(
      authenticateCheckinToken(
        createCheckinToken(session, "staff", "student-1", now).token,
        session.qrSecret,
      ),
    ).toEqual({
      v: 1,
      s: session.id,
      k: "staff",
      u: "student-1",
      e: now + 120000,
    });
    expect(readCheckinToken(publicCode.token).payload.u).toBeUndefined();
  });
  test("二维码不能超过签到截止时间，密钥轮换立即失效", () => {
    const signed = createCheckinToken(
      { ...session, endAt: new Date(now + 500) },
      "staff",
      "u",
      now,
    );
    expect(signed.expiresAt.getTime()).toBe(now + 500);
    expect(() =>
      authenticateCheckinToken(signed.token, "changed-secret"),
    ).toThrow("已失效");
  });
  test("修改签名内的用户、场次、方式或有效期均无法通过", () => {
    const signed = createCheckinToken(session, "staff", "student-1", now);
    const { payload, signature } = readCheckinToken(signed.token);
    for (const patch of [
      { s: "other" },
      { u: "other" },
      { e: now + 86400000 },
      { k: "self", u: undefined },
    ]) {
      const token =
        Buffer.from(JSON.stringify({ ...payload, ...patch })).toString(
          "base64url",
        ) +
        "." +
        signature;
      expect(() => authenticateCheckinToken(token, session.qrSecret)).toThrow();
    }
  });
  test.each([null, {}, "WFCI1:abc", "abc", "a".repeat(1300)])(
    "拒绝非签到格式 %p",
    (value) => expect(() => readCheckinToken(value)).toThrow(),
  );
  test.each([
    { s: ["session-1"] },
    { u: ["user"] },
    { e: "123" },
    { v: 2 },
    { k: "self" },
    { s: "" },
  ])("拒绝异常载荷 %p", (patch) => {
    const encoded = Buffer.from(
      JSON.stringify({ v: 1, s: "s", u: "u", k: "staff", e: now, ...patch }),
    ).toString("base64url");
    const token =
      encoded +
      "." +
      createHmac("sha256", session.qrSecret)
        .update(encoded)
        .digest("base64url");
    expect(() => readCheckinToken(token)).toThrow();
  });
  test("开始瞬间放行，截止瞬间以及暂停拒绝", () => {
    expect(() => checkinAvailable(session, session.startAt)).not.toThrow();
    expect(() =>
      checkinAvailable(session, new Date(session.startAt.getTime() - 1)),
    ).toThrow("尚未开始");
    expect(() => checkinAvailable(session, session.endAt)).toThrow("已结束");
    expect(() =>
      checkinAvailable({ ...session, status: "paused" }, new Date(now)),
    ).toThrow("已暂停");
  });
  test("允许任一种或同时开启；工作人员名单去重", () => {
    expect(
      validateCheckinSession(
        { ...input, staffUserIds: ["a", "a"] },
        new Date(now),
      ).staffUserIds,
    ).toEqual(["a"]);
    expect(() =>
      validateCheckinSession(
        { ...input, allowStaffScan: false, staffUserIds: [] },
        new Date(now),
      ),
    ).not.toThrow();
    expect(() =>
      validateCheckinSession({ ...input, allowSelfScan: false }, new Date(now)),
    ).not.toThrow();
  });
  test.each([
    { allowStaffScan: false, allowSelfScan: false },
    { allowStaffScan: "false" },
    { staffUserIds: [] },
    { staffUserIds: ["a", {}] },
    { startAt: null },
    { endAt: "bad" },
    { endAt: new Date(now - 1).toISOString() },
  ])("拒绝不可用场次 %p", (patch) => {
    expect(() =>
      validateCheckinSession({ ...input, ...patch }, new Date(now)),
    ).toThrow();
  });
});
