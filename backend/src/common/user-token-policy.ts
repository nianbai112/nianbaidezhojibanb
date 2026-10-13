import { UnauthorizedException } from '@nestjs/common';

export type UserTokenPayload = {
  sub?: unknown;
  isAdmin?: unknown;
  token_use?: unknown;
  sv?: unknown;
  exp?: unknown;
  [key: string]: unknown;
};

const invalid = () => new UnauthorizedException('登录令牌无效，请重新登录');
export const revokedSession = () => new UnauthorizedException({
  code: 'SESSION_REVOKED', message: '登录状态已撤销，请重新登录',
});

export function storedAuthVersion(user: any): number {
  const version = user?.authVersion ?? 0;
  if (!Number.isSafeInteger(version) || version < 0) throw revokedSession();
  return version;
}

export function tokenAuthVersion(payload: UserTokenPayload, purpose: 'access' | 'refresh', allowLegacyRefresh = false): number {
  if (!payload || typeof payload.sub !== 'string' || !payload.sub || payload.isAdmin === true) throw invalid();
  const legacy = purpose === 'refresh' && allowLegacyRefresh && payload.token_use === undefined;
  if (!legacy && payload.token_use !== purpose) throw invalid();
  const version = legacy && payload.sv === undefined ? 0 : payload.sv;
  if (!Number.isSafeInteger(version) || Number(version) < 0) throw invalid();
  return version as number;
}

/** Redis cleanup is advisory. This persisted version is the revocation barrier. */
export function assertMatchingAuthVersion(payloadVersion: number, user: any): void {
  if (!user || user.status === 'DELETED' || user.deletedAt || storedAuthVersion(user) !== payloadVersion) throw revokedSession();
}

export async function readAccessSession(prisma: any, payload: UserTokenPayload): Promise<any> {
  const version = tokenAuthVersion(payload, 'access');
  // Long-lived sockets must also stop at access-token expiry, not only on reconnect.
  if (payload.exp !== undefined && (!Number.isSafeInteger(payload.exp) || Number(payload.exp) <= Math.floor(Date.now() / 1000))) throw invalid();
  const user = await prisma.user.findUnique({
    where: { id: payload.sub }, select: { id: true, status: true, deletedAt: true, authVersion: true },
  });
  assertMatchingAuthVersion(version, user);
  return user;
}
