import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/services/prisma.service";
import {
  AiRuntimeService,
  AiChatMessage,
} from "../ai-runtime/ai-runtime.service";
import { WechatMomentsService } from "../wechat-moments/wechat-moments.service";
import { parseJsonKeepingBigInts } from "../wechat-moments/wechatpad.client";
import { BUILTIN_SKILLS } from "./wechat-chat.skills";
import {
  ChatGenerationError,
  GeneratedReply,
  generationFailure,
  normalizeReply,
} from "./wechat-chat.generation";
import {
  accountKey,
  assertKeys,
  callbackObservation,
  ChatSettings,
  ChatStyle,
  commandFor,
  DEFAULT_SETTINGS,
  hash,
  normalizeMessage,
  selectKnowledge,
  systemPrompt,
  triggerReason,
  validateSettings,
} from "./wechat-chat.policy";

@Injectable()
export class WechatChatService {
  constructor(
    readonly prisma: PrismaService,
    readonly moments: WechatMomentsService,
    readonly ai: AiRuntimeService,
  ) {}

  async settings() {
    const row = await this.prisma.wechatChatSettings.upsert({
      where: { id: "global" },
      update: {},
      create: { id: "global", value: DEFAULT_SETTINGS as any },
    });
    return {
      revision: row.revision,
      config: { ...DEFAULT_SETTINGS, ...(row.value as any) } as ChatSettings,
    };
  }

  async saveSettings(input: any) {
    const current = await this.settings();
    const config = validateSettings(input, current.config);
    const connection = await this.moments.getConfig();
    if (
      config.enabled &&
      (connection.missing.length || !connection.webhookSecret)
    )
      throw new BadRequestException(
        "请先在朋友圈同步页完成共用微信连接与回调密钥配置",
      );
    config.boundDeviceId = connection.wechatpad.deviceId;
    if (input.revision !== current.revision)
      throw new ConflictException("配置已变化，请刷新后重试");
    await this.prisma.$transaction(async (tx) => {
      const changed = await tx.wechatChatSettings.updateMany({
        where: { id: "global", revision: input.revision },
        data: { revision: { increment: 1 }, value: config as any },
      });
      if (changed.count !== 1)
        throw new ConflictException("配置已变化，请刷新后重试");
      await tx.wechatChatReply.updateMany({
        where: { status: { in: ["pending", "generating", "draft"] } },
        data: { status: "cancelled", reason: "settings_changed" },
      });
    });
    return this.settings();
  }

  async status() {
    const [settings, connection, state, ai] = await Promise.all([
      this.settings(),
      this.moments.getConfig(),
      this.moments.getState(),
      this.ai.getSafeConfig(),
    ]);
    const key = accountKey(settings.config);
    const [conversations, queue, quota, observations] = await Promise.all([
      this.prisma.wechatChatConversation.count({ where: { accountKey: key } }),
      this.prisma.wechatChatReply.groupBy({
        by: ["status"],
        where: { conversation: { accountKey: key } },
        _count: true,
      }),
      this.prisma.wechatChatQuota.findUnique({
        where: { id: this.quotaId(key) },
      }),
      this.prisma.config.findMany({
        where: {
          key: {
            in: ["private", "group"].map((kind) =>
              this.observationKey(
                connection.wechatpad.deviceId,
                settings.config,
                kind,
              ),
            ),
          },
        },
        select: { value: true },
      }),
    ]);
    return {
      ...settings,
      connection: {
        deviceId: connection.wechatpad.deviceId,
        online: state.online === true,
        missing: connection.missing,
        hasWebhookSecret: Boolean(connection.webhookSecret),
        callbackPath: "/api/wechat-channel/webhook",
      },
      ai: { configured: ai.hasApiKey, model: ai.model },
      conversations,
      queue,
      detection: {
        private:
          observations
            .map((r) => r.value as any)
            .find((r) => r.kind === "private") || null,
        group:
          observations
            .map((r) => r.value as any)
            .find((r) => r.kind === "group") || null,
      },
      quota: {
        calls: quota?.calls || 0,
        tokens: quota?.tokens || 0,
        dayTimezone: "UTC",
      },
    };
  }

  observationKey(deviceId: string, settings: ChatSettings, kind: string) {
    return `wechat.chat.observation.${hash(JSON.stringify([deviceId, settings.selfWxid, kind, settings.groupSenderField, settings.groupMentionsField, settings.groupContractConfirmed]))}`;
  }

  /** The caller has already checked raw-body HMAC and both device identifiers. */
  async receive(body: any) {
    const settings = await this.settings();
    const message = normalizeMessage(body, settings.config);
    if (!message) return { ok: true, ignored: "unsupported_event" };
    const key = accountKey(settings.config);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const observation = callbackObservation(body, settings.config);
        if (observation) {
          const observationKey = this.observationKey(
            body.device_id,
            settings.config,
            observation.kind,
          );
          await tx.config.upsert({
            where: { key: observationKey },
            update: { value: observation as any },
            create: {
              key: observationKey,
              value: observation as any,
              group: "wechat",
              desc: "微信聊天接入检测：仅结构和状态，不保存消息正文或身份值",
            },
          });
        }
        const conversation = await tx.wechatChatConversation.upsert({
          where: {
            accountKey_wxid: {
              accountKey: key,
              wxid: message.conversationWxid,
            },
          },
          update: { updatedAt: new Date() },
          create: {
            accountKey: key,
            wxid: message.conversationWxid,
            kind: message.kind,
            allowedSkills: BUILTIN_SKILLS.map((s) => s.id),
          },
        });
        if (!message.reason && message.sender) {
          const preferenceText =
            message.kind === "group" &&
            message.text.startsWith(settings.config.groupPrefix)
              ? message.text.slice(settings.config.groupPrefix.length).trim()
              : message.text.trim();
          const stop =
            /^(别怼了|不要怼我|别损我了|停止斗嘴|停止回怼|别开玩笑了|认真点)[。！!\s]*$/.test(
              preferenceText,
            );
          const resume = /^(可以继续开玩笑|可以怼我|继续斗嘴)[。！!\s]*$/.test(
            preferenceText,
          );
          if (stop || resume) {
            await tx.wechatChatMember.upsert({
              where: { id: hash(`${conversation.id}:${message.sender}`) },
              update: { banterMuted: stop },
              create: {
                id: hash(`${conversation.id}:${message.sender}`),
                conversationId: conversation.id,
                sender: message.sender,
                banterMuted: stop,
              },
            });
            await tx.wechatChatReply.updateMany({
              where: {
                conversationId: conversation.id,
                message: { sender: message.sender },
                status: { in: ["pending", "generating", "draft"] },
              },
              data: {
                status: "cancelled",
                reason: "member_preference_changed",
              },
            });
          }
        }
        let reason = triggerReason(message, settings.config, conversation);
        if (!reason && settings.config.boundDeviceId !== body.device_id)
          reason = "device_binding_changed";
        const stored = await tx.wechatChatMessage.create({
          data: {
            conversationId: conversation.id,
            eventKey: message.eventKey,
            remoteId: message.remoteId,
            sender: message.sender,
            text: message.text,
            msgType: message.msgType,
            status: reason ? "ignored" : "accepted",
            reason,
          },
        });
        if (!reason)
          await tx.wechatChatReply.create({
            data: {
              messageId: stored.id,
              conversationId: conversation.id,
              deviceId: body.device_id,
              recipient: conversation.wxid,
              settingsRevision: settings.revision,
              conversationRevision: conversation.revision,
              // A short buffer coalesces bursts; older jobs are superseded before generation.
              notBefore: new Date(Date.now() + 1500),
            },
          });
        return { ok: true, accepted: !reason, reason };
      });
    } catch (error: any) {
      if (error?.code === "P2002") {
        const duplicate = await this.prisma.wechatChatMessage.findUnique({
          where: { eventKey: message.eventKey },
          select: { id: true },
        });
        if (duplicate) return { ok: true, duplicate: true };
      }
      throw error;
    }
  }

  async conversations(query: any) {
    const page = Math.max(1, Math.floor(Number(query?.page) || 1));
    const settings = await this.settings();
    const where = {
      accountKey: accountKey(settings.config),
      ...(query?.kind === "private" || query?.kind === "group"
        ? { kind: query.kind as string }
        : {}),
    };
    const [list, total] = await Promise.all([
      this.prisma.wechatChatConversation.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * 30,
        take: 30,
      }),
      this.prisma.wechatChatConversation.count({ where }),
    ]);
    return { list, total, page, pageSize: 30 };
  }

  async requireConversation(id: string) {
    const settings = await this.settings();
    const row = await this.prisma.wechatChatConversation.findFirst({
      where: { id, accountKey: accountKey(settings.config) },
    });
    if (!row) throw new NotFoundException("会话不存在或不属于当前微信号");
    return row;
  }

  async updateConversation(id: string, input: any) {
    assertKeys(input, [
      "revision",
      "enabled",
      "takeover",
      "style",
      "groupTrigger",
      "allowedSkills",
      "resetContext",
    ]);
    await this.requireConversation(id);
    if (!Number.isInteger(input.revision) || input.revision < 1)
      throw new BadRequestException("缺少会话配置版本");
    for (const k of ["enabled", "takeover", "resetContext"])
      if (input[k] !== undefined && typeof input[k] !== "boolean")
        throw new BadRequestException("开关格式无效");
    if (
      input.style !== undefined &&
      !["inherit", "daily", "humorous", "banter"].includes(input.style)
    )
      throw new BadRequestException("风格无效");
    if (
      input.groupTrigger !== undefined &&
      !["inherit", "prefix", "mention", "all"].includes(input.groupTrigger)
    )
      throw new BadRequestException("触发方式无效");
    if (
      input.allowedSkills !== undefined &&
      (!Array.isArray(input.allowedSkills) ||
        input.allowedSkills.length > 20 ||
        input.allowedSkills.some((v: unknown) => typeof v !== "string"))
    )
      throw new BadRequestException("Skill 列表无效");
    const { revision, resetContext, ...changes } = input;
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.wechatChatConversation.updateMany({
        where: { id, revision },
        data: {
          ...changes,
          revision: { increment: 1 },
          ...(resetContext ? { contextAfter: new Date() } : {}),
        },
      });
      if (updated.count !== 1)
        throw new ConflictException("会话配置已变化，请刷新");
      await tx.wechatChatReply.updateMany({
        where: {
          conversationId: id,
          status: { in: ["pending", "generating", "draft"] },
        },
        data: { status: "cancelled", reason: "conversation_changed" },
      });
      return tx.wechatChatConversation.findUnique({ where: { id } });
    });
  }

  async messages(id: string) {
    await this.requireConversation(id);
    return this.prisma.wechatChatMessage.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: "desc" },
      take: 80,
      include: {
        reply: {
          select: {
            id: true,
            status: true,
            text: true,
            reason: true,
            sentAt: true,
            sourceVersions: true,
          },
        },
      },
    });
  }

  async jobs(query: any) {
    const settings = await this.settings();
    const status = [
      "pending",
      "generating",
      "draft",
      "sent",
      "unknown",
      "failed",
      "cancelled",
    ].includes(query?.status)
      ? (query.status as string)
      : undefined;
    const rows = await this.prisma.wechatChatReply.findMany({
      where: {
        conversation: { accountKey: accountKey(settings.config) },
        ...(status ? { status } : {}),
      },
      take: 80,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        conversationId: true,
        status: true,
        reason: true,
        createdAt: true,
        updatedAt: true,
        remoteId: true,
        recipient: true,
        sourceVersions: true,
      },
    });
    return rows.map(({ sourceVersions, ...row }) => ({
      ...row,
      diagnostics: (sourceVersions as any)?.generation || null,
    }));
  }

  async resolveUnknown(id: string, input: any) {
    assertKeys(input, ["resolution"]);
    if (!["sent", "not_sent"].includes(input.resolution))
      throw new BadRequestException("请明确核查结果");
    const row = await this.prisma.wechatChatReply.findUnique({ where: { id } });
    if (!row) throw new NotFoundException("任务不存在");
    await this.requireConversation(row.conversationId);
    const result = await this.prisma.wechatChatReply.updateMany({
      where: { id, status: "unknown" },
      data: {
        status: input.resolution === "sent" ? "sent" : "cancelled",
        reason: `operator_confirmed_${input.resolution}`,
        ...(input.resolution === "sent" ? { sentAt: new Date() } : {}),
      },
    });
    if (result.count !== 1) throw new ConflictException("该任务已处理");
    return { ok: true };
  }

  async ensureBuiltins() {
    for (const item of BUILTIN_SKILLS) {
      await this.prisma.wechatChatSkill.upsert({
        where: { id: item.id },
        update: {},
        create: {
          id: item.id,
          name: item.name,
          versions: {
            create: {
              content: item.content,
              sourceUrl: item.sourceUrl,
              commit: item.commit,
              license: item.license,
              hash: hash(item.content),
            },
          },
        },
      });
    }
  }

  async skills() {
    await this.ensureBuiltins();
    return this.prisma.wechatChatSkill.findMany({
      orderBy: { createdAt: "asc" },
      include: { versions: { orderBy: { createdAt: "desc" }, take: 20 } },
    });
  }

  async createSkillVersion(id: string, input: any, adminId: string) {
    assertKeys(input, ["name", "content", "sourceUrl", "commit", "license"]);
    if (!/^[a-z][a-z0-9-]{1,49}$/.test(id))
      throw new BadRequestException("Skill 标识格式无效");
    for (const [key, max] of [
      ["name", 80],
      ["content", 12000],
      ["sourceUrl", 500],
      ["commit", 100],
      ["license", 100],
    ] as const) {
      if (
        typeof input[key] !== "string" ||
        !input[key].trim() ||
        input[key].length > max
      )
        throw new BadRequestException(`${key} 内容缺失或过长`);
    }
    if (
      !/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(?:\/[^\s]*)?$/.test(
        input.sourceUrl,
      )
    )
      throw new BadRequestException(
        "来源请填写 GitHub HTTPS 地址；此处只记录来源，不执行仓库代码",
      );
    if (!/^[a-f0-9]{40}$/.test(input.commit))
      throw new BadRequestException("请填写已审阅版本的完整提交 SHA");
    return this.prisma.wechatChatSkill.upsert({
      where: { id },
      update: {
        name: input.name,
        versions: {
          create: {
            content: input.content,
            sourceUrl: input.sourceUrl,
            commit: input.commit,
            license: input.license,
            hash: hash(input.content),
            createdBy: adminId,
          },
        },
      },
      create: {
        id,
        name: input.name,
        versions: {
          create: {
            content: input.content,
            sourceUrl: input.sourceUrl,
            commit: input.commit,
            license: input.license,
            hash: hash(input.content),
            createdBy: adminId,
          },
        },
      },
    });
  }

  async publishSkill(id: string, input: any) {
    assertKeys(input, ["versionId", "enabled", "scope"]);
    if (
      typeof input.enabled !== "boolean" ||
      !["all", "private", "group"].includes(input.scope)
    )
      throw new BadRequestException("发布设置无效");
    const version = await this.prisma.wechatChatSkillVersion.findFirst({
      where: { id: String(input.versionId || ""), skillId: id },
    });
    if (!version) throw new NotFoundException("Skill 版本不存在");
    await this.settings();
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.wechatChatSkill.update({
        where: { id },
        data: {
          publishedVersionId: version.id,
          enabled: input.enabled,
          scope: input.scope,
        },
      });
      await this.invalidate(tx, "skill_changed");
      return row;
    });
  }

  private async invalidate(tx: Prisma.TransactionClient, reason: string) {
    await tx.wechatChatSettings.update({
      where: { id: "global" },
      data: { revision: { increment: 1 } },
    });
    await tx.wechatChatReply.updateMany({
      where: { status: { in: ["pending", "generating", "draft"] } },
      data: { status: "cancelled", reason },
    });
  }

  async knowledge() {
    return this.prisma.wechatChatKnowledge.findMany({
      orderBy: { updatedAt: "desc" },
      take: 200,
    });
  }

  async saveKnowledge(id: string | undefined, input: any) {
    assertKeys(input, [
      "title",
      "content",
      "source",
      "scope",
      "conversationId",
      "enabled",
    ]);
    for (const [k, max] of [
      ["title", 150],
      ["content", 12000],
      ["source", 500],
    ] as const)
      if (
        typeof input[k] !== "string" ||
        !input[k].trim() ||
        input[k].length > max
      )
        throw new BadRequestException(`${k} 内容缺失或过长`);
    if (
      !["private", "group", "all", "conversation"].includes(input.scope) ||
      typeof input.enabled !== "boolean"
    )
      throw new BadRequestException("资料可见范围或开关无效");
    if (input.scope === "conversation")
      await this.requireConversation(String(input.conversationId || ""));
    await this.settings();
    return this.prisma.$transaction(async (tx) => {
      const data = {
        ...input,
        conversationId:
          input.scope === "conversation" ? input.conversationId : null,
      };
      const row = id
        ? await tx.wechatChatKnowledge.update({ where: { id }, data })
        : await tx.wechatChatKnowledge.create({ data });
      await this.invalidate(tx, "knowledge_changed");
      return row;
    });
  }

  async buildReply(
    conversationId: string,
    text: string,
    settings: ChatSettings,
    styleOverride?: ChatStyle,
    sender?: string,
  ) {
    const conversation = await this.requireConversation(conversationId);
    const command = commandFor(
      text,
      conversation.kind,
      settings.commandsEnabled,
    );
    const allowed = Array.isArray(conversation.allowedSkills)
      ? conversation.allowedSkills.filter(
          (id): id is string => typeof id === "string",
        )
      : [];
    const skills = await this.prisma.wechatChatSkill.findMany({
      where: {
        id: { in: allowed },
        enabled: true,
        scope: { in: ["all", conversation.kind] },
      },
    });
    const versions = await this.prisma.wechatChatSkillVersion.findMany({
      where: {
        id: {
          in: skills
            .map((s) => s.publishedVersionId)
            .filter((id): id is string => Boolean(id)),
        },
      },
    });
    const active = versions.filter(
      (v) => v.skillId !== "goutoujunshi" || command.command === "advisor",
    );
    if (command.command === "skills")
      return {
        fixed:
          skills
            .filter((s) => s.publishedVersionId)
            .map((s) => s.name)
            .join("、") || "此会话暂未启用 Skill。",
        command,
        sourceVersions: {},
      };
    if (["help", "denied", "reset", "disabled"].includes(command.command))
      return { fixed: command.content, command, sourceVersions: {} };
    if (
      command.command === "advisor" &&
      !active.some((s) => s.skillId === "goutoujunshi")
    )
      return {
        fixed: "这个会话尚未启用狗头军师。",
        command,
        sourceVersions: {},
      };
    const where = {
      enabled: true,
      OR: [
        { scope: "all" },
        { scope: conversation.kind },
        { scope: "conversation", conversationId },
      ],
    };
    const docs = selectKnowledge(
      await this.prisma.wechatChatKnowledge.findMany({
        where,
        take: 200,
        orderBy: { updatedAt: "desc" },
      }),
      command.content,
    );
    // Only this verified member's thread is used in a group; other members' messages stay out.
    const contextSender =
      conversation.kind === "private" ? conversation.wxid : sender;
    const history =
      Boolean(contextSender) && settings.contextMessages
        ? await this.prisma.wechatChatMessage.findMany({
            where: {
              conversationId,
              sender: contextSender,
              status: "accepted",
              createdAt: { gte: conversation.contextAfter },
              reply: { status: "sent" },
            },
            include: { reply: true },
            orderBy: { createdAt: "desc" },
            take: settings.contextMessages,
          })
        : [];
    const member = contextSender
      ? await this.prisma.wechatChatMember.findUnique({
          where: { id: hash(`${conversationId}:${contextSender}`) },
        })
      : null;
    const selectedStyle =
      styleOverride ||
      (conversation.style === "inherit"
        ? settings.defaultStyle
        : (conversation.style as ChatStyle));
    const style =
      selectedStyle === "banter" && member?.banterMuted
        ? "daily"
        : selectedStyle;
    const messages: AiChatMessage[] = [
      {
        role: "system",
        content: systemPrompt(
          settings,
          style,
          active.map((s) => s.content),
          docs.map((d) => ({
            title: d.title,
            content: d.content.slice(0, 4000),
            source: d.source,
          })),
        ),
      },
    ];
    for (const h of history.reverse()) {
      messages.push({ role: "user", content: h.text });
      if (h.reply?.text)
        messages.push({ role: "assistant", content: h.reply.text });
    }
    messages.push({ role: "user", content: command.content });
    return {
      messages,
      command,
      sourceVersions: {
        skills: active.map((s) => ({
          id: s.skillId,
          version: s.id,
          hash: s.hash,
        })),
        knowledge: docs.map((d) => ({
          id: d.id,
          updatedAt: d.updatedAt.toISOString(),
        })),
      },
    };
  }

  quotaId(key: string) {
    return `${key}:${new Date().toISOString().slice(0, 10)}`;
  }

  async generate(
    messages: AiChatMessage[],
    settings: ChatSettings,
    taskId?: string,
  ): Promise<GeneratedReply> {
    // UTF-8 bytes are a conservative input-token reservation for ordinary supported tokenizers.
    const inputReservation =
      Buffer.byteLength(JSON.stringify(messages), "utf8") + 1000;
    let reserved = inputReservation + settings.maxOutputTokens;
    const id = this.quotaId(accountKey(settings));
    try {
      await this.prisma.$transaction(async (tx) => {
        const quota = await tx.wechatChatQuota.upsert({
          where: { id },
          // Take the row lock before reading the balance, including across API/Worker processes.
          update: { calls: { increment: 0 } },
          create: { id },
        });
        if (settings.maxDailyCalls > 0 && quota.calls >= settings.maxDailyCalls)
          throw new ChatGenerationError("wechat_daily_call_limit");
        if (settings.maxDailyTokens > 0) {
          const remaining = settings.maxDailyTokens - quota.tokens;
          if (remaining < reserved)
            throw new ChatGenerationError("wechat_daily_token_limit");
          // Without an output cap, reserve the remaining daily budget so concurrent
          // requests cannot each spend it. Actual usage is settled after the response.
          if (settings.maxOutputTokens === 0) reserved = remaining;
        }
        const result = await tx.wechatChatQuota.updateMany({
          where: {
            id,
            ...(settings.maxDailyCalls > 0
              ? { calls: { lt: settings.maxDailyCalls } }
              : {}),
            ...(settings.maxDailyTokens > 0
              ? { tokens: { lte: settings.maxDailyTokens - reserved } }
              : {}),
          },
          data: { calls: { increment: 1 }, tokens: { increment: reserved } },
        });
        if (result.count !== 1) throw new ChatGenerationError("quota_busy");
      });
    } catch (error) {
      if (error instanceof ChatGenerationError) throw error;
      throw new ChatGenerationError("quota_accounting_failed");
    }
    // Failed/unknown calls retain the reservation; database failure cannot grant a free retry.
    const result = await this.ai
      .callChatDetailed(messages, {
        purpose: "wechat_reply",
        source: "wechat-chat",
        privateContent: true,
        maxTokens: settings.maxOutputTokens,
        timeoutMs: 30000,
        taskId,
      })
      .catch((error) => {
        throw generationFailure(error);
      });
    const diagnostics = {
      callLogId: result.callLogId,
      finishReason: result.finishReason,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      totalTokens: result.totalTokens,
      maxReplyChars: settings.maxReplyChars,
      maxOutputTokens: settings.maxOutputTokens,
    };
    const actual = Math.max(0, Math.ceil(result.totalTokens));
    try {
      if (!Number.isFinite(actual)) throw new Error("Invalid usage");
      await this.prisma.wechatChatQuota.update({
        where: { id },
        data: { tokens: { increment: actual - reserved } },
      });
    } catch {
      throw new ChatGenerationError("quota_accounting_failed", diagnostics);
    }
    return normalizeReply(result.content, diagnostics);
  }

  async preview(input: any) {
    assertKeys(input, ["conversationId", "text", "style"]);
    if (
      typeof input.text !== "string" ||
      !input.text.trim() ||
      input.text.length > 6000
    )
      throw new BadRequestException("请输入 1–6000 字的测试消息");
    if (!["daily", "humorous", "banter"].includes(input.style))
      throw new BadRequestException("风格无效");
    const settings = await this.settings();
    const built = input.conversationId
      ? await this.buildReply(
          String(input.conversationId),
          input.text,
          settings.config,
          input.style,
        )
      : {
          messages: [
            {
              role: "system" as const,
              content: systemPrompt(settings.config, input.style, [], []),
            },
            { role: "user" as const, content: input.text },
          ],
          sourceVersions: {},
        };
    const generated =
      "fixed" in built
        ? { text: built.fixed, reason: null, diagnostics: {} }
        : await this.generate(built.messages!, settings.config);
    return { ...generated, sent: false, sourceVersions: built.sourceVersions };
  }

  async inspectCallback(input: any) {
    assertKeys(input, ["rawJson"]);
    if (typeof input.rawJson !== "string" || input.rawJson.length > 16000)
      throw new BadRequestException("样例最多 16000 字符");
    let body: any;
    try {
      body = parseJsonKeepingBigInts(input.rawJson);
    } catch {
      throw new BadRequestException("JSON 格式无效");
    }
    const settings = await this.settings();
    return {
      sampleOnly: true,
      stored: false,
      sent: false,
      message: normalizeMessage(body, settings.config),
    };
  }
}
