import { BadRequestException } from "@nestjs/common";

export interface GenerationDiagnostics {
  callLogId?: string;
  finishReason?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  responseChars?: number;
  sentChars?: number;
  maxReplyChars?: number;
  maxOutputTokens?: number;
}

export interface GeneratedReply {
  text: string;
  reason: string | null;
  diagnostics: GenerationDiagnostics;
}

const ERRORS: Record<string, string> = {
  daily_call_limit: "全局 AI 今日调用次数已达上限",
  daily_token_limit: "全局 AI 今日 Token 已达上限",
  daily_cost_limit: "全局 AI 今日成本已达上限",
  wechat_daily_call_limit: "微信 AI 今日调用次数已达上限",
  wechat_daily_token_limit: "微信 AI 今日剩余 Token 不足，或有调用正在预占额度",
  quota_busy: "额度正在结算，请稍后重试",
  quota_accounting_failed: "额度记录失败，请检查数据库",
  ai_disabled: "AI 运营未启用，请检查模型配置",
  ai_key_missing: "AI 密钥未配置",
  ai_model_missing: "AI 模型未配置",
  timeout: "模型响应超时",
  auth_error: "模型服务鉴权失败，请检查密钥和权限",
  rate_limited: "模型服务限流，请稍后重试",
  provider_payment_required: "模型服务要求检查余额或账单",
  provider_4xx: "模型服务拒绝请求，请检查模型和参数",
  provider_5xx: "模型服务暂时异常",
  provider_error: "模型连接或响应异常",
  empty_reply: "模型未返回可发送的回复正文",
  empty_reply_output_limit: "模型达到输出上限，未返回回复正文",
  generation_system_error: "生成后的本地处理异常，请查看诊断记录",
};

export class ChatGenerationError extends BadRequestException {
  constructor(
    readonly reason: string,
    readonly diagnostics: GenerationDiagnostics = {},
  ) {
    super(ERRORS[reason] || ERRORS.generation_system_error);
  }
}

/** Never persist an arbitrary provider error message, prompt, or response body. */
export function generationFailure(error: any): ChatGenerationError {
  if (error instanceof ChatGenerationError) return error;
  const code = Object.hasOwnProperty.call(ERRORS, error?.errorCode)
    ? (error.errorCode as string)
    : "generation_system_error";
  const callLogId =
    typeof error?.callLogId === "string" &&
    /^[a-zA-Z0-9_-]{1,128}$/.test(error.callLogId)
      ? error.callLogId
      : undefined;
  return new ChatGenerationError(code, callLogId ? { callLogId } : {});
}

export function normalizeReply(
  content: string,
  diagnostics: GenerationDiagnostics,
): GeneratedReply {
  const text = content.trim();
  const chars = Array.from(text);
  const details = { ...diagnostics, responseChars: chars.length, sentChars: 0 };
  if (text === "[NO_REPLY]")
    return { text: "", reason: null, diagnostics: details };
  if (!text)
    throw new ChatGenerationError(
      diagnostics.finishReason === "length"
        ? "empty_reply_output_limit"
        : "empty_reply",
      details,
    );
  const limit = diagnostics.maxReplyChars || 0;
  const truncated = limit > 0 && chars.length > limit;
  const reply = truncated ? chars.slice(0, limit).join("").trimEnd() : text;
  return {
    text: reply,
    reason: truncated
      ? "reply_truncated"
      : diagnostics.finishReason === "length"
        ? "model_output_limit"
        : null,
    diagnostics: { ...details, sentChars: Array.from(reply).length },
  };
}
