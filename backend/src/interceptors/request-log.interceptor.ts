import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
  OnModuleDestroy,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";
import { PrismaService } from "../common/services/prisma.service";

// =============================================================================
// 敏感数据脱敏规则
// =============================================================================

/** 字段名关键字（不区分大小写）——命中则脱敏处理 */
const SENSITIVE_KEYS = [
  "password",
  "token",
  "secret",
  "key",
  "cert",
  "privatekey",
  "idcard",
  "bankcard",
  "phone",
  "mobile",
  "tel",
  "authorization",
  "accesstoken",
  "refreshtoken",
  "apikey",
  "pin",
];

/** 中国大陆手机号正则（1xx-xxxx-xxxx） */
const PHONE_RE = /^1[3-9]\d{9}$/;

/** 中国大陆身份证号正则（18位，允许最后一位 X） */
const ID_CARD_RE =
  /^[1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]$/;

/** JWT token 格式前缀检测 */
const JWT_RE = /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/** 微信支付密钥特征（32/64 位十六进制） */
const PAYMENT_KEY_RE = /^[A-Fa-f0-9]{32,64}$/;

/**
 * 手机号脱敏：13812341234 → 138****1234
 */
function maskPhone(value: string): string {
  if (value.length < 7) return "***";
  return value.slice(0, 3) + "****" + value.slice(-4);
}

/**
 * 身份证号脱敏：保留末尾 4 位，其余替换为 *
 */
function maskIdCard(value: string): string {
  if (value.length < 4) return "***";
  return "*".repeat(value.length - 4) + value.slice(-4);
}

/**
 * JWT token 脱敏：仅保留前 8 个字符
 */
function maskJwt(value: string): string {
  return value.slice(0, 8) + "...[truncated]";
}

/**
 * 通用脱敏：保留开头和结尾各一小段
 */
function maskGeneric(value: string): string {
  if (value.length <= 6) return "***";
  return value.slice(0, 2) + "***" + value.slice(-2);
}

/**
 * 智能脱敏：根据值的内容模式选择合适的脱敏策略
 */
function maskSensitiveValue(value: any): any {
  if (!value) return value;
  if (typeof value !== "string") return value;

  const trimmed = value.trim();

  if (PHONE_RE.test(trimmed)) return maskPhone(trimmed);
  if (ID_CARD_RE.test(trimmed)) return maskIdCard(trimmed);
  if (JWT_RE.test(trimmed)) return maskJwt(trimmed);
  if (PAYMENT_KEY_RE.test(trimmed)) return maskGeneric(trimmed);

  // 通用脱敏：如果值看起来像令牌（很长且无空格）
  if (trimmed.length > 30 && !trimmed.includes(" ")) {
    return maskGeneric(trimmed);
  }

  return value;
}

function maskNamedSensitiveValue(value: any): any {
  if (value === undefined || value === null) return value;
  if (typeof value !== "string") return "[redacted]";
  const masked = maskSensitiveValue(value);
  return masked === value ? maskGeneric(value) : masked;
}

/**
 * 检查字段名是否匹配敏感关键字
 */
function isSensitiveFieldName(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[_-]/g, "");
  return SENSITIVE_KEYS.some((sk) => normalized.includes(sk));
}

/**
 * 递归脱敏对象中的所有敏感字段
 */
function maskSensitive(data: any): any {
  if (!data || typeof data !== "object") return data;
  if (Array.isArray(data)) return data.map(maskSensitive);

  const masked: any = {};
  for (const [k, v] of Object.entries(data)) {
    if (isSensitiveFieldName(k)) {
      masked[k] = maskNamedSensitiveValue(v);
    } else if (typeof v === "object" && v !== null) {
      masked[k] = maskSensitive(v);
    } else {
      masked[k] = v;
    }
  }
  return masked;
}

// =============================================================================
// Interceptor
// =============================================================================

@Injectable()
export class RequestLogInterceptor implements NestInterceptor, OnModuleDestroy {
  private readonly logger = new Logger(RequestLogInterceptor.name);
  private readonly pendingLogs: any[] = [];
  private readonly batchSize = 50;
  private readonly maxQueueSize = 1000;
  private readonly flushTimer: NodeJS.Timeout;
  private flushPromise?: Promise<void>;
  private lastWarningAt = 0;

  constructor(private readonly prisma: PrismaService) {
    this.flushTimer = setInterval(() => {
      void this.flushPendingLogs();
    }, 250);
    this.flushTimer.unref?.();
  }

  async onModuleDestroy(): Promise<void> {
    clearInterval(this.flushTimer);
    if (this.flushPromise) await this.flushPromise;
    while (this.pendingLogs.length > 0) {
      await this.flushPendingLogs();
    }
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, headers, body, user, ip } = request;
    const start = Date.now();

    // 跳过静态资源、Swagger、安装向导探活接口
    if (
      url.startsWith("/api/docs") ||
      url.startsWith("/swagger") ||
      url.startsWith("/setup") ||
      url === "/healthz"
    ) {
      return next.handle();
    }

    const adminId = user?.isAdmin ? user.sub : undefined;
    const userId = user?.isAdmin ? undefined : user?.sub;

    // 脱敏敏感 headers（Authorization 等）
    const safeHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers || {})) {
      safeHeaders[k] = isSensitiveFieldName(k)
        ? maskNamedSensitiveValue(v)
        : String(v ?? "");
    }

    const enqueue = (statusCode: number) => {
      const duration = Date.now() - start;
      const isAdminPath =
        url.startsWith("/admin/") || url.startsWith("/api/admin/");
      const isError = statusCode >= 400;
      if (!(isAdminPath || isError || Math.random() < 0.01)) return;

      this.enqueueLog({
        level:
          statusCode >= 500 ? "error" : statusCode >= 400 ? "warn" : "info",
        module: isAdminPath ? "admin" : "request",
        message: `${method} ${url} ${statusCode} ${duration}ms`,
        detail: body ? maskSensitive(body) : undefined,
        requestId: (safeHeaders["x-request-id"] as string) || undefined,
        userId,
        adminId,
        ip: ip || (safeHeaders["x-forwarded-for"] as string) || undefined,
        userAgent: (safeHeaders["user-agent"] as string) || undefined,
        path: url,
        method,
        statusCode,
        durationMs: duration,
      });
    };

    return next.handle().pipe(
      tap({
        next: () => enqueue(request.res?.statusCode || 200),
        error: (error: any) =>
          enqueue(
            Number(
              error?.status ||
                error?.statusCode ||
                error?.getStatus?.() ||
                request.res?.statusCode ||
                500,
            ),
          ),
      }),
    );
  }

  private enqueueLog(data: any): void {
    if (this.pendingLogs.length >= this.maxQueueSize) {
      this.warnAtMostOncePerMinute(
        `Request log queue full (${this.maxQueueSize}); dropping logs to protect request traffic`,
      );
      return;
    }

    this.pendingLogs.push(data);
    if (this.pendingLogs.length >= this.batchSize) {
      void this.flushPendingLogs();
    }
  }

  private flushPendingLogs(): Promise<void> {
    if (this.flushPromise) return this.flushPromise;
    if (this.pendingLogs.length === 0) return Promise.resolve();

    const batch = this.pendingLogs.splice(0, this.batchSize);
    this.flushPromise = this.prisma.serverLog
      .createMany({ data: batch })
      .catch((error: any) => {
        this.warnAtMostOncePerMinute(
          `Failed to persist ${batch.length} request logs: ${error?.message || error}`,
        );
      })
      .then(() => undefined)
      .finally(() => {
        this.flushPromise = undefined;
        if (this.pendingLogs.length >= this.batchSize) {
          queueMicrotask(() => void this.flushPendingLogs());
        }
      });
    return this.flushPromise;
  }

  private warnAtMostOncePerMinute(message: string): void {
    const now = Date.now();
    if (now - this.lastWarningAt < 60000) return;
    this.lastWarningAt = now;
    this.logger.warn(message);
  }
}
