import { AsyncLocalStorage } from 'node:async_hooks';
import { isIP } from 'node:net';
import type { Request, Response, NextFunction } from 'express';

// Express resolves the proxy chain using the configured trusted proxy addresses.
// Never use an arbitrary client-supplied forwarding header as the audit identity.
export function clientIp(req: Pick<Request, 'ip' | 'socket'>): string | undefined {
  const value = String(req.ip || req.socket?.remoteAddress || '').replace(/^::ffff:/, '').trim();
  return isIP(value) ? value : undefined;
}

export const requestContext = new AsyncLocalStorage<{ request: Request; operationLogged?: boolean }>();

export function requestContextMiddleware(request: Request, _response: Response, next: NextFunction) {
  requestContext.run({ request }, next);
}

export function currentRequestMetadata() {
  const request = requestContext.getStore()?.request;
  return {
    ip: request ? clientIp(request) : undefined,
    ua: request?.headers['user-agent']?.slice(0, 2000),
    ipSource: request ? 'request' : 'system',
  };
}

export function redactAuditDetail(value: any, key = '', previous?: any): any {
  if (/base64|fileContent|imageData/i.test(key) || (typeof value === 'string' && /^data:[^;]+;base64,/i.test(value))) {
    return '已记录文件变更，文件内容不写入日志';
  }
  if (!key && typeof value === 'string') {
    try { return redactAuditDetail(JSON.parse(value)); } catch { return value; }
  }
  if (/student.?id|real.?name|activation|password|secret|token|authorization|private.?key|api.*key|access.?key|encrypt.*key|encoding.?aes.?key|aes.?key|bank.?card|id.?card|cert/i.test(key)) {
    if (value === null || value === undefined || value === '') return value;
    if (value === '已更新敏感信息') return value;
    return previous !== undefined && previous !== value ? '已更新敏感信息' : '已隐藏敏感信息';
  }
  if (Array.isArray(value)) return value.map((item, index) => redactAuditDetail(item, '', previous?.[index]));
  if (value && typeof value === 'object') {
    if (value instanceof Date) return value.toISOString();
    return Object.fromEntries(Object.entries(value).map(([name, item]) => [name,
      redactAuditDetail(item, name, name === 'after' && 'before' in value ? value.before : previous?.[name]) ]));
  }
  return value;
}
