import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { randomUUID } from "crypto";
import { RedisService } from "../../common/services/redis.service";
import { WechatpadError } from "../wechat-moments/wechatpad.client";
import { WechatChatService } from "./wechat-chat.service";
import { accountKey } from "./wechat-chat.policy";
import {
  GenerationDiagnostics,
  generationFailure,
} from "./wechat-chat.generation";

/** Registered only by WorkerModule. DB state is authoritative; Redis merely serializes a conversation. */
@Injectable()
export class WechatChatWorker {
  private running = false;
  private readonly logger = new Logger(WechatChatWorker.name);
  constructor(
    private readonly service: WechatChatService,
    private readonly redis: RedisService,
  ) {}

  @Cron("*/3 * * * * *")
  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const db = this.service.prisma;
      await db.wechatChatReply.updateMany({
        where: { status: "sending", leaseUntil: { lt: new Date() } },
        data: { status: "unknown", reason: "send_lease_expired" },
      });
      await db.wechatChatReply.updateMany({
        where: { status: "generating", leaseUntil: { lt: new Date() } },
        data: { status: "cancelled", reason: "generation_interrupted" },
      });
      const settings = await this.service.settings();
      if (!settings.config.enabled) return;
      const pending = await db.wechatChatReply.findMany({
        where: {
          status: "pending",
          notBefore: { lte: new Date() },
          conversation: { accountKey: accountKey(settings.config) },
        },
        orderBy: { createdAt: "asc" },
        take: 12,
        select: { conversationId: true },
      });
      const ids = [...new Set(pending.map((r) => r.conversationId))].slice(
        0,
        3,
      );
      await Promise.all(
        ids.map((id) =>
          this.redis.withRenewingLock(
            `wechat-chat:conversation:${id}`,
            90,
            () => this.processConversation(id),
          ),
        ),
      );
    } catch {
      // Provider errors may echo private prompts; only structured reasons are logged.
      this.logger.error(
        "微信聊天任务处理失败；已保留持久化任务，请检查 Worker、数据库与 Redis",
      );
    } finally {
      this.running = false;
    }
  }

  async processConversation(conversationId: string) {
    const token = randomUUID();
    const db = this.service.prisma;
    const claim = await db.wechatChatConversation.updateMany({
      where: {
        id: conversationId,
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
      },
      data: { leaseToken: token, leaseUntil: new Date(Date.now() + 150000) },
    });
    if (claim.count !== 1) return;
    try {
      await this.processHeldConversation(conversationId);
    } finally {
      await db.wechatChatConversation.updateMany({
        where: { id: conversationId, leaseToken: token },
        data: { leaseToken: null, leaseUntil: null },
      });
    }
  }

  private async processHeldConversation(conversationId: string) {
    const db = this.service.prisma;
    const job = await db.wechatChatReply.findFirst({
      where: {
        conversationId,
        status: "pending",
        notBefore: { lte: new Date() },
      },
      orderBy: { createdAt: "asc" },
      include: { message: true, conversation: true },
    });
    if (!job) return;
    // A persisted active lease also protects against loss/reacquisition of the Redis lock.
    if (
      await db.wechatChatReply.count({
        where: {
          conversationId,
          status: { in: ["generating", "sending"] },
          leaseUntil: { gt: new Date() },
        },
      })
    )
      return;
    const settings = await this.service.settings();
    const connection = await this.service.moments.getConfig();
    const state = await this.service.moments.getState();
    const stale = Date.now() - job.createdAt.getTime() > 10 * 60 * 1000;
    if (
      stale ||
      !settings.config.enabled ||
      settings.revision !== job.settingsRevision ||
      !job.conversation.enabled ||
      job.conversation.takeover ||
      job.conversation.revision !== job.conversationRevision ||
      connection.wechatpad.deviceId !== job.deviceId ||
      settings.config.boundDeviceId !== job.deviceId
    ) {
      await db.wechatChatReply.updateMany({
        where: { id: job.id, status: "pending" },
        data: {
          status: "cancelled",
          reason: stale ? "expired" : "policy_changed",
        },
      });
      return;
    }
    if (state.online !== true) return;
    if (
      job.conversation.lastReplyAt &&
      Date.now() - job.conversation.lastReplyAt.getTime() <
        settings.config.cooldownSeconds * 1000
    )
      return;
    const newer = await db.wechatChatMessage.findFirst({
      where: {
        conversationId,
        status: "accepted",
        sender: job.message.sender,
        createdAt: { gt: job.message.createdAt },
        reply: { status: "pending" },
      },
      select: { id: true },
    });
    if (newer && !job.message.text.trim().startsWith("/")) {
      await db.wechatChatReply.updateMany({
        where: { id: job.id, status: "pending" },
        data: { status: "cancelled", reason: "superseded" },
      });
      return;
    }
    const leaseToken = randomUUID();
    const claim = await db.wechatChatReply.updateMany({
      where: { id: job.id, status: "pending" },
      data: {
        status: "generating",
        leaseToken,
        leaseUntil: new Date(Date.now() + 120000),
      },
    });
    if (claim.count !== 1) return;
    let diagnostics: GenerationDiagnostics = {};
    let sourceVersions: Record<string, any> = {};
    let generationReason: string | null = null;
    try {
      const text =
        job.conversation.kind === "group" &&
        job.message.text.startsWith(settings.config.groupPrefix)
          ? job.message.text.slice(settings.config.groupPrefix.length)
          : job.message.text;
      const burst = text.trim().startsWith("/")
        ? []
        : await db.wechatChatMessage.findMany({
            where: {
              conversationId,
              sender: job.message.sender,
              createdAt: {
                gte: new Date(job.message.createdAt.getTime() - 30000),
                lt: job.message.createdAt,
              },
              reply: { reason: "superseded" },
            },
            orderBy: { createdAt: "asc" },
            take: 5,
          });
      const combined = [...burst.map((m) => m.text), text]
        .join("\n")
        .slice(-6000);
      const built = await this.service.buildReply(
        conversationId,
        combined,
        settings.config,
        undefined,
        job.message.sender || undefined,
      );
      sourceVersions = built.sourceVersions;
      const generated =
        "fixed" in built
          ? { text: built.fixed || "", reason: null, diagnostics: {} }
          : await this.service.generate(
              built.messages!,
              settings.config,
              job.id,
            );
      const reply = generated.text;
      diagnostics = generated.diagnostics;
      generationReason = generated.reason;
      sourceVersions = { ...sourceVersions, generation: diagnostics };
      if (!reply) {
        await db.wechatChatReply.updateMany({
          where: { id: job.id, status: "generating", leaseToken },
          data: { status: "cancelled", reason: "no_reply", sourceVersions },
        });
        return;
      }
      const [latest, conversation, activeConnection, online] =
        await Promise.all([
          this.service.settings(),
          db.wechatChatConversation.findUnique({
            where: { id: conversationId },
          }),
          this.service.moments.getConfig(),
          this.service.moments.getState(),
        ]);
      if (
        !latest.config.enabled ||
        latest.revision !== job.settingsRevision ||
        !conversation?.enabled ||
        conversation.takeover ||
        conversation.revision !== job.conversationRevision ||
        activeConnection.wechatpad.deviceId !== job.deviceId ||
        online.online !== true
      ) {
        await db.wechatChatReply.updateMany({
          where: { id: job.id, status: "generating", leaseToken },
          data: {
            status: "cancelled",
            reason: "policy_changed_before_send",
            sourceVersions,
          },
        });
        return;
      }
      const dryRun = latest.config.dryRun;
      const transitioned = await db.$transaction(async (tx) => {
        const configFence = await tx.wechatChatSettings.updateMany({
          where: { id: "global", revision: job.settingsRevision },
          data: { revision: job.settingsRevision },
        });
        const conversationFence = await tx.wechatChatConversation.updateMany({
          where: {
            id: conversationId,
            revision: job.conversationRevision,
            enabled: true,
            takeover: false,
          },
          data: { revision: job.conversationRevision },
        });
        if (configFence.count !== 1 || conversationFence.count !== 1)
          return false;

        const changed = await tx.wechatChatReply.updateMany({
          where: {
            id: job.id,
            status: "generating",
            leaseToken,
            leaseUntil: { gt: new Date() },
          },
          data: {
            status: dryRun ? "draft" : "sending",
            text: reply,
            sourceVersions,
            reason: generationReason,
            leaseUntil: new Date(Date.now() + 120000),
          },
        });
        if (changed.count === 1) {
          await tx.wechatChatConversation.update({
            where: { id: conversationId },
            data: {
              lastReplyAt: new Date(),
              ...(!dryRun && built.command.command === "reset"
                ? { contextAfter: new Date() }
                : {}),
            },
          });
        }
        return changed.count === 1;
      });
      if (!transitioned || dryRun) return;
      // Recipient is the immutable server-created outbox target, never model output.
      const result = await this.service.moments
        .createClient({
          ...activeConnection,
          wechatpad: { ...activeConnection.wechatpad, timeoutMs: 30000 },
        })
        .sendText(job.recipient, reply);
      await db.wechatChatReply.updateMany({
        where: { id: job.id, status: "sending", leaseToken },
        data: {
          status: result.confirmed ? "sent" : "unknown",
          remoteId: result.messageId,
          reason: result.confirmed
            ? generationReason
            : "unrecognized_delivery_receipt",
          sentAt: result.confirmed ? new Date() : null,
        },
      });
    } catch (error: any) {
      const current = await db.wechatChatReply.findUnique({
        where: { id: job.id },
        select: { status: true },
      });
      const sending = current?.status === "sending";
      const unknown =
        sending && (!(error instanceof WechatpadError) || error.ambiguous);
      const failure = generationFailure(error);
      await db.wechatChatReply.updateMany({
        where: {
          id: job.id,
          leaseToken,
          status: { in: ["generating", "sending"] },
        },
        data: {
          status: unknown ? "unknown" : "failed",
          reason: unknown
            ? "send_result_unknown"
            : sending
              ? "send_rejected"
              : failure.reason,
          sourceVersions: {
            ...sourceVersions,
            generation: { ...diagnostics, ...failure.diagnostics },
          },
        },
      });
    }
  }

  @Cron("0 20 3 * * *", { timeZone: "Asia/Shanghai" })
  async expireHistory() {
    // FK cascade also removes old replies; unresolved delivery receipts stay for review.
    await this.service.prisma.wechatChatMessage.deleteMany({
      where: {
        createdAt: { lt: new Date(Date.now() - 30 * 86400000) },
        OR: [
          { reply: null },
          {
            reply: { status: { in: ["sent", "cancelled", "failed", "draft"] } },
          },
        ],
      },
    });
  }
}
