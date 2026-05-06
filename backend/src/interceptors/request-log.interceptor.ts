import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaService } from '../common/services/prisma.service';

// =============================================================================
// 敏感数据脱敏规则
// =============================================================================

/** 字段名关键字（不区分大小写）——命中则脱敏处理 */
const SENSITIVE_KEYS = [
  'password',
  'token',
  'secret',
  'key',
  'cert',
  'privatekey',
  'idcard',
  'bankcard',
  'phone',
  'mobile',
  'tel',
  'authorization',
  'accesstoken',
  'refreshtoken',
  'apikey',
  'pin',
];

/** 中国大陆手机号正则（1xx-xxxx-xxxx） */
const PHONE_RE = /^1[3-9]\d{9}$/;

/** 中国大陆身份证号正则（18位，允许最后一位 X） */
const ID_CARD_RE = /^[1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]$/;

/** JWT token 格式前缀检测 */
const JWT_RE = /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/** 微信支付密钥特征（32/64 位十六进制） */
const PAYMENT_KEY_RE = /^[A-Fa-f0-9]{32,64}$/;

/**
 * 手机号脱敏：13812341234 → 138****1234
 */
function maskPhone(value: string): string {
  if (value.length < 7) return '***';
  return value.slice(0, 3) + '****' + value.slice(-4);
}

/**
 * 身份证号脱敏：保留末尾 4 位，其余替换为 *
 */
function maskIdCard(value: string): string {
  if (value.length < 4) return '***';
  return '*'.repeat(value.length - 4) + value.slice(-4);
}

/**
 * JWT token 脱敏：仅保留前 8 个字符
 */
function maskJwt(value: string): string {
  return value.slice(0, 8) + '...[truncated]';
}

/**
 * 通用脱敏：保留开头和结尾各一小段
 */
function maskGeneric(value: string): string {
  if (value.length <= 6) return '***';
  return value.slice(0, 2) + '***' + value.slice(-2);
}

/**
 * 智能脱敏：根据值的内容模式选择合适的脱敏策略
 */
function maskSensitiveValue(value: any): any {
  if (!value) return value;
  if (typeof value !== 'string') return value;

  const trimmed = value.trim();

  if (PHONE_RE.test(trimmed)) return maskPhone(trimmed);
  if (ID_CARD_RE.test(trimmed)) return maskIdCard(trimmed);
  if (JWT_RE.test(trimmed)) return maskJwt(trimmed);
  if (PAYMENT_KEY_RE.test(trimmed)) return maskGeneric(trimmed);

  // 通用脱敏：如果值看起来像令牌（很长且无空格）
  if (trimmed.length > 30 && !trimmed.includes(' ')) {
    return maskGeneric(trimmed);
  }

  return value;
}

/**
 * 检查字段名是否匹配敏感关键字
 */
function isSensitiveFieldName(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[_-]/g, '');
  return SENSITIVE_KEYS.some((sk) => normalized.includes(sk));
}

/**
 * 递归脱敏对象中的所有敏感字段
 */
function maskSensitive(data: any): any {
  if (!data || typeof data !== 'object') return data;
  if (Array.isArray(data)) return data.map(maskSensitive);

  const masked: any = {};
  for (const [k, v] of Object.entries(data)) {
    if (isSensitiveFieldName(k)) {
      masked[k] = maskSensitiveValue(v);
    } else if (typeof v === 'object' && v !== null) {
      masked[k] = maskSensitive(v);
    } else {
      masked[k] = v;
    }
  }
  return masked;
}

/**
 * 深度脱敏——对响应体 / headers 中可能存在的 JWT、手机号等做额外扫描
 * 在 maskSensitive 基础上，对字符串值再做内容模式匹配
 */
function deepMask(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(deepMask);

  const result: any = {};
  for (const [k, v] of Object.entries(obj)) {
    if (isSensitiveFieldName(k)) {
      result[k] = maskSensitiveValue(v);
    } else if (typeof v === 'string') {
      result[k] = maskSensitiveValue(v);
    } else if (typeof v === 'object' && v !== null) {
      result[k] = deepMask(v);
    } else {
      result[k] = v;
    }
  }
  return result;
}

// =============================================================================
// Interceptor
// =============================================================================

@Injectable()
export class RequestLogInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, headers, body, user, ip } = request;
    const start = Date.now();

    // 跳过静态资源、Swagger、安装向导探活接口
    if (
      url.startsWith('/api/docs') ||
      url.startsWith('/swagger') ||
      url.startsWith('/setup') ||
      url === '/healthz'
    ) {
      return next.handle();
    }

    const adminId = user?.isAdmin ? user.sub : undefined;
    const userId = user?.isAdmin ? undefined : user?.sub;

    // 脱敏敏感 headers（Authorization 等）
    const safeHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers || {})) {
      safeHeaders[k] = isSensitiveFieldName(k) ? maskSensitiveValue(v as string) : (v as string);
    }

    return next.handle().pipe(
      tap(async (responseBody) => {
        const duration = Date.now() - start;
        const statusCode = request.res?.statusCode || 200;

        // 只记录 4xx/5xx 或后台管理路径；正常 2xx 小程序路径采样记录（每 100 条记 1 条）
        const isAdminPath = url.startsWith('/admin/') || url.startsWith('/api/admin/');
        const isError = statusCode >= 400;
        const shouldLog = isAdminPath || isError || Math.random() < 0.01;

        if (!shouldLog) return;

        try {
          await this.prisma.serverLog.create({
            data: {
              level: statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info',
              module: isAdminPath ? 'admin' : 'request',
              message: `${method} ${url} ${statusCode} ${duration}ms`,
              detail: body ? maskSensitive(body) : undefined,
              requestId: safeHeaders['x-request-id'] as string || undefined,
              userId,
              adminId,
              ip: ip || safeHeaders['x-forwarded-for'] as string || undefined,
              userAgent: safeHeaders['user-agent'] as string || undefined,
              path: url,
              method,
              statusCode,
              durationMs: duration,
            },
          });
        } catch {
          // 日志写入失败不影响主流程
        }
      }),
    );
  }
}
