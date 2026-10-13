import { WechatChatService } from "./wechat-chat.service";
import { DEFAULT_SETTINGS } from "./wechat-chat.policy";
import {
  ChatGenerationError,
  generationFailure,
  normalizeReply,
} from "./wechat-chat.generation";

describe("微信回复限制与故障分类", () => {
  const messages = [{ role: "user" as const, content: "测试问题" }];
  function setup(initial = { calls: 0, tokens: 0 }) {
    const balance = { ...initial };
    const quota = {
      upsert: jest.fn(async () => ({ ...balance })),
      updateMany: jest.fn(async ({ where, data }) => {
        if (
          (where.calls && balance.calls >= where.calls.lt) ||
          (where.tokens && balance.tokens > where.tokens.lte)
        )
          return { count: 0 };
        balance.calls += data.calls.increment;
        balance.tokens += data.tokens.increment;
        return { count: 1 };
      }),
      update: jest.fn(async ({ data }) => {
        balance.tokens += data.tokens.increment;
        return { ...balance };
      }),
    };
    const db: any = {
      wechatChatQuota: quota,
      $transaction: jest.fn((run) => run({ wechatChatQuota: quota })),
    };
    const ai: any = {
      callChatDetailed: jest.fn(async () => ({
        content: "你好😀，今天怎么样？",
        callLogId: "log-fixture",
        finishReason: "stop",
        inputTokens: 5,
        outputTokens: 15,
        totalTokens: 20,
      })),
    };
    return {
      service: new WechatChatService(db, {} as any, ai),
      db,
      ai,
      quota,
      balance,
    };
  }

  it("all four zero limits allow generation and still account actual usage", async () => {
    const { service, balance, quota, ai } = setup({
      calls: 10001,
      tokens: 10000001,
    });
    const reply = await service.generate(
      messages,
      {
        ...DEFAULT_SETTINGS,
        maxDailyCalls: 0,
        maxDailyTokens: 0,
        maxOutputTokens: 0,
        maxReplyChars: 0,
      },
      "job-1",
    );
    expect(reply.text).toBe("你好😀，今天怎么样？");
    expect(balance).toEqual({ calls: 10002, tokens: 10000021 });
    expect(quota.updateMany.mock.calls[0][0].where).not.toHaveProperty("calls");
    expect(quota.updateMany.mock.calls[0][0].where).not.toHaveProperty(
      "tokens",
    );
    expect(ai.callChatDetailed).toHaveBeenCalledWith(
      messages,
      expect.objectContaining({
        maxTokens: 0,
        taskId: "job-1",
        privateContent: true,
      }),
    );
  });
  it("zero daily calls does not disable a nonzero token limit", async () => {
    const { service, ai } = setup({ calls: 9999, tokens: 499999 });
    await expect(
      service.generate(messages, { ...DEFAULT_SETTINGS, maxDailyCalls: 0 }),
    ).rejects.toMatchObject({ reason: "wechat_daily_token_limit" });
    expect(ai.callChatDetailed).not.toHaveBeenCalled();
  });
  it("zero daily tokens does not disable a nonzero call limit", async () => {
    const { service, ai } = setup({ calls: 200, tokens: 9999999 });
    await expect(
      service.generate(messages, { ...DEFAULT_SETTINGS, maxDailyTokens: 0 }),
    ).rejects.toMatchObject({ reason: "wechat_daily_call_limit" });
    expect(ai.callChatDetailed).not.toHaveBeenCalled();
  });
  it("reserves the remaining finite daily budget for uncapped output, then settles actual usage", async () => {
    const { service, quota, balance } = setup({ calls: 2, tokens: 100 });
    await service.generate(messages, {
      ...DEFAULT_SETTINGS,
      maxOutputTokens: 0,
    });
    expect(quota.updateMany.mock.calls[0][0].data.tokens.increment).toBe(
      499900,
    );
    expect(balance).toEqual({ calls: 3, tokens: 120 });
  });
  it("accounts provider-default output even when it crosses the daily threshold and blocks the next call", async () => {
    const { service, ai, balance } = setup();
    ai.callChatDetailed.mockResolvedValue({
      content: "回复",
      totalTokens: 8000,
    });
    const config = {
      ...DEFAULT_SETTINGS,
      maxDailyTokens: 5000,
      maxOutputTokens: 0,
    };
    await service.generate(messages, config);
    expect(balance.tokens).toBe(8000);
    await expect(service.generate(messages, config)).rejects.toMatchObject({
      reason: "wechat_daily_token_limit",
    });
    expect(ai.callChatDetailed).toHaveBeenCalledTimes(1);
  });
  it("does not grant a free retry after an ambiguous provider failure", async () => {
    const { service, ai, balance } = setup();
    ai.callChatDetailed.mockRejectedValue(
      Object.assign(new Error("PRIVATE_PROVIDER_ERROR"), {
        errorCode: "timeout",
        callLogId: "log-fixture",
      }),
    );
    await expect(
      service.generate(messages, DEFAULT_SETTINGS),
    ).rejects.toMatchObject({
      reason: "timeout",
      diagnostics: { callLogId: "log-fixture" },
    });
    expect(balance.calls).toBe(1);
    expect(balance.tokens).toBeGreaterThan(500);
  });
  it("a database reservation failure prevents the provider call", async () => {
    const { service, ai, quota } = setup();
    quota.upsert.mockRejectedValue(new Error("PRIVATE_DATABASE_ERROR"));
    await expect(
      service.generate(messages, DEFAULT_SETTINGS),
    ).rejects.toMatchObject({ reason: "quota_accounting_failed" });
    expect(ai.callChatDetailed).not.toHaveBeenCalled();
  });
  it("a settlement failure keeps the call ID for diagnosis", async () => {
    const { service, quota } = setup();
    quota.update.mockRejectedValue(new Error("PRIVATE_DATABASE_ERROR"));
    await expect(
      service.generate(messages, DEFAULT_SETTINGS),
    ).rejects.toMatchObject({
      reason: "quota_accounting_failed",
      diagnostics: { callLogId: "log-fixture", totalTokens: 20 },
    });
  });
  it("truncates without splitting a Unicode code point and stores only counts in diagnostics", () => {
    const reply = normalizeReply("你好😀再见", {
      maxReplyChars: 3,
      finishReason: "stop",
    });
    expect(reply.text).toBe("你好😀");
    expect(reply.reason).toBe("reply_truncated");
    expect(reply.diagnostics).toMatchObject({ responseChars: 5, sentChars: 3 });
    expect(JSON.stringify(reply.diagnostics)).not.toContain("你好");
  });
  it("zero character limit returns the complete response beyond the former maximum", () => {
    const text = "好".repeat(3000);
    expect(normalizeReply(text, { maxReplyChars: 0 }).text).toBe(text);
    expect(
      normalizeReply("好".repeat(500), { maxReplyChars: 500 }).reason,
    ).toBeNull();
  });
  it.each([
    ["stop", "empty_reply"],
    ["length", "empty_reply_output_limit"],
  ])("classifies empty responses ending with %s", (finishReason, reason) => {
    expect(() =>
      normalizeReply("  ", { finishReason, callLogId: "log-empty" }),
    ).toThrow(ChatGenerationError);
    try {
      normalizeReply("  ", { finishReason, callLogId: "log-empty" });
    } catch (e) {
      expect(e).toMatchObject({
        reason,
        diagnostics: { callLogId: "log-empty", responseChars: 0 },
      });
    }
  });
  it("distinguishes intentional silence and the model output limit", () => {
    expect(normalizeReply("[NO_REPLY]", { maxReplyChars: 3 }).text).toBe("");
    expect(
      normalizeReply("部分回复", { finishReason: "length", maxReplyChars: 0 })
        .reason,
    ).toBe("model_output_limit");
  });
  it("never copies provider messages or arbitrary error codes into task diagnostics", () => {
    const error = generationFailure({
      message: "PRIVATE_PROMPT",
      errorCode: "PRIVATE_PROVIDER_ECHO",
      callLogId: "unsafe value",
    });
    expect(error.reason).toBe("generation_system_error");
    expect(JSON.stringify(error)).not.toContain("PRIVATE");
    expect(error.diagnostics).toEqual({});
    expect(
      generationFailure({
        errorCode: "daily_token_limit",
        callLogId: "log-safe",
      }).reason,
    ).toBe("daily_token_limit");
  });
});
