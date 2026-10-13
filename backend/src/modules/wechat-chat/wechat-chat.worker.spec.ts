import { WechatChatWorker } from "./wechat-chat.worker";
import { DEFAULT_SETTINGS } from "./wechat-chat.policy";
import { ChatGenerationError, normalizeReply } from "./wechat-chat.generation";
import { WechatpadError } from "../wechat-moments/wechatpad.client";

describe("微信自动回复任务", () => {
  function setup() {
    const config = {
      ...DEFAULT_SETTINGS,
      enabled: true,
      dryRun: false,
      boundDeviceId: "device-fixture",
    };
    const conversation = {
      id: "conv-fixture",
      kind: "private",
      enabled: true,
      takeover: false,
      revision: 1,
      lastReplyAt: null,
    };
    const job: any = {
      id: "job-fixture",
      conversationId: conversation.id,
      status: "pending",
      createdAt: new Date(),
      deviceId: config.boundDeviceId,
      settingsRevision: 1,
      conversationRevision: 1,
      conversation,
      recipient: "fixture_recipient",
      message: {
        text: "fixture input",
        sender: "fixture_recipient",
        createdAt: new Date(),
      },
    };
    const db: any = {
      wechatChatConversation: {
        updateMany: jest.fn(async () => ({ count: 1 })),
        findUnique: jest.fn(async () => conversation),
        update: jest.fn(async () => conversation),
      },
      wechatChatSettings: { updateMany: jest.fn(async () => ({ count: 1 })) },
      wechatChatMessage: {
        findFirst: jest.fn(async () => null),
        findMany: jest.fn(async () => []),
      },
      wechatChatReply: {
        findFirst: jest.fn(async () => (job.status === "pending" ? job : null)),
        findUnique: jest.fn(async () => job),
        count: jest.fn(async () => 0),
        updateMany: jest.fn(async ({ where, data }) => {
          if (
            where.status &&
            (typeof where.status === "string"
              ? job.status !== where.status
              : !where.status.in.includes(job.status))
          )
            return { count: 0 };
          Object.assign(job, data);
          return { count: 1 };
        }),
      },
    };
    db.$transaction = (run: any) => run(db);
    const sendText = jest.fn(async () => ({
      confirmed: true,
      messageId: "remote-fixture",
    }));
    const service: any = {
      prisma: db,
      settings: jest.fn(async () => ({ config, revision: 1 })),
      buildReply: jest.fn(async () => ({
        messages: [{ role: "user", content: "PRIVATE_INPUT" }],
        command: { command: "chat" },
        sourceVersions: { skills: [], knowledge: [] },
      })),
      generate: jest.fn(async () =>
        normalizeReply("你好😀再见", {
          maxReplyChars: 3,
          callLogId: "log-fixture",
          outputTokens: 8,
          finishReason: "stop",
        }),
      ),
      moments: {
        getConfig: jest.fn(async () => ({
          wechatpad: { deviceId: config.boundDeviceId },
        })),
        getState: jest.fn(async () => ({ online: true })),
        createClient: jest.fn(() => ({ sendText })),
      },
    };
    const worker = new WechatChatWorker(service, {} as any);
    return { worker, service, db, job, config, sendText };
  }
  it("sends the truncated reply once and keeps the explanation and call ID", async () => {
    const { worker, service, job, sendText } = setup();
    await worker.processConversation("conv-fixture");
    expect(sendText).toHaveBeenCalledWith("fixture_recipient", "你好😀");
    expect(job).toMatchObject({
      status: "sent",
      reason: "reply_truncated",
      sourceVersions: {
        generation: {
          callLogId: "log-fixture",
          responseChars: 5,
          sentChars: 3,
        },
      },
    });
    expect(service.generate.mock.calls[0][2]).toBe("job-fixture");
    await worker.processConversation("conv-fixture");
    expect(sendText).toHaveBeenCalledTimes(1);
  });
  it("keeps draft mode and never sends automatically", async () => {
    const { worker, config, job, sendText } = setup();
    config.dryRun = true;
    await worker.processConversation("conv-fixture");
    expect(job.status).toBe("draft");
    expect(job.reason).toBe("reply_truncated");
    expect(sendText).not.toHaveBeenCalled();
  });
  it.each([
    "empty_reply",
    "empty_reply_output_limit",
    "wechat_daily_call_limit",
    "wechat_daily_token_limit",
    "timeout",
    "auth_error",
    "provider_payment_required",
  ])("records %s separately without sending", async (reason) => {
    const { worker, service, job, sendText } = setup();
    service.generate.mockRejectedValue(
      new ChatGenerationError(reason, {
        callLogId: "log-failed",
        responseChars: 0,
      }),
    );
    await worker.processConversation("conv-fixture");
    expect(job).toMatchObject({
      status: "failed",
      reason,
      sourceVersions: { generation: { callLogId: "log-failed" } },
    });
    expect(sendText).not.toHaveBeenCalled();
  });
  it("keeps post-generation database errors distinct and retains successful model diagnostics", async () => {
    const { worker, db, job, sendText } = setup();
    db.wechatChatConversation.findUnique.mockRejectedValue(
      new Error("PRIVATE_DB_MESSAGE"),
    );
    await worker.processConversation("conv-fixture");
    expect(job.reason).toBe("generation_system_error");
    expect(job.sourceVersions.generation.callLogId).toBe("log-fixture");
    expect(JSON.stringify(job.sourceVersions)).not.toContain("PRIVATE");
    expect(sendText).not.toHaveBeenCalled();
  });
  it("preserves sending uncertainty and never retries it", async () => {
    const { worker, job, sendText } = setup();
    sendText.mockRejectedValue(
      new WechatpadError("PRIVATE_PROVIDER_ECHO", true),
    );
    await worker.processConversation("conv-fixture");
    expect(job.status).toBe("unknown");
    expect(job.reason).toBe("send_result_unknown");
    await worker.processConversation("conv-fixture");
    expect(sendText).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(job.sourceVersions)).not.toContain("PRIVATE");
  });
  it("still cancels when settings change during generation", async () => {
    const { worker, service, config, job, sendText } = setup();
    service.generate.mockImplementation(async () => {
      config.enabled = false;
      return normalizeReply("测试回复", { maxReplyChars: 0 });
    });
    await worker.processConversation("conv-fixture");
    expect(job).toMatchObject({
      status: "cancelled",
      reason: "policy_changed_before_send",
    });
    expect(sendText).not.toHaveBeenCalled();
  });
});
