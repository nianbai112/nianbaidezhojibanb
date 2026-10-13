import { ConflictException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../../common/services/prisma.service';
import { UserSessionRevocationService } from '../websocket/user-session-revocation.service';
import { AppOauthService } from './app-oauth.service';
import type { AppOAuthIdentity } from './app-oauth.service';
import { loginIdentityKey } from './app-identity';
import { AppleTokenVault } from './apple-token-vault';

export type AppleRevocationStatus = 'not_required' | 'pending' | 'manual_required' | 'complete';
const digest = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const terminal = (state: string): boolean => state === 'account_deleted' || state === 'local_deleted';

@Injectable()
export class AppleLifecycleService {
  private readonly vault: AppleTokenVault;
  private readonly logger = new Logger(AppleLifecycleService.name);
  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
    private readonly oauth: AppOauthService,
    private readonly sessions: UserSessionRevocationService,
  ) { this.vault = new AppleTokenVault(config); }

  assertLoginConfigured(): void { this.vault.assertConfigured(); }

  // Called inside resolveLoginIdentity's Serializable transaction. A failure rolls
  // back user creation, channel ownership and the encrypted provider grant together.
  async bindAuthorization(tx: any, user: any, identity: AppOAuthIdentity, requestedAtMs: number): Promise<any> {
    if (identity.provider !== 'apple' || !identity.appleRefreshToken || !Number.isSafeInteger(identity.appleAuthorizedAtMs)) {
      throw new UnauthorizedException('Apple 授权信息不完整，请重新授权');
    }
    const key = loginIdentityKey('app-apple', identity.appId, identity.subject);
    const existing = await tx.appleAuthorization.findUnique({ where: { identityKey: key } });
    if (existing && (existing.appId !== identity.appId || existing.subject !== identity.subject || existing.userId && existing.userId !== user.id)) {
      throw new ConflictException('Apple 身份归属不一致，不能自动合并');
    }
    const evidenceAtMs = Math.min(identity.appleAuthorizedAtMs!, requestedAtMs);
    if (!Number.isSafeInteger(evidenceAtMs) || evidenceAtMs <= 0) throw new UnauthorizedException('Apple 授权上下文无效');
    if (existing && (terminal(existing.state) || existing.lastEventAt && evidenceAtMs <= existing.lastEventAt.getTime())) {
      throw new UnauthorizedException({ code: 'APPLE_AUTHORIZATION_REVOKED', message: 'Apple 授权已失效，请重新发起授权；已删除身份不能恢复' });
    }
    const currentUser = await tx.user.findUnique({ where: { id: user.id } });
    if (!currentUser || !['ACTIVE', 'BANNED'].includes(currentUser.status) || currentUser.deletedAt) throw new UnauthorizedException('账号已停用');
    const authorizedAt = new Date(Math.max(evidenceAtMs, existing?.authorizedAt?.getTime() || 0));
    const ciphertext = this.vault.seal(identity.appleRefreshToken, identity.appId, identity.subject);
    await tx.appleAuthorization.upsert({ where: { identityKey: key },
      create: { identityKey: key, appId: identity.appId, subject: identity.subject, userId: user.id, state: 'active', authorizedAt },
      update: { userId: user.id, state: 'active', authorizedAt, revokedAt: null },
    });
    const tokenId = digest([key, identity.appleRefreshToken]);
    await tx.appleOAuthToken.upsert({ where: { id: tokenId },
      create: { id: tokenId, identityKey: key, tokenCiphertext: ciphertext },
      update: { tokenCiphertext: ciphertext, state: 'active', attempts: 0, nextAttemptAt: null, leaseId: null, leaseUntil: null, lastErrorCode: null, completedAt: null },
    });
    return currentUser;
  }

  // Part of the local account deletion transaction. Never make an HTTP call in it.
  // Missing legacy tokens do not block deletion; the caller must show manual guidance.
  async queueAccountDeletion(tx: any, userId: string, now: Date): Promise<{ status: AppleRevocationStatus }> {
    const identities = await tx.userAuthIdentity.findMany({ where: { userId, provider: 'app-apple' } });
    if (!identities.length) return { status: 'not_required' };
    let manual = false, queued = false;
    for (const identity of identities) {
      const key = loginIdentityKey('app-apple', identity.appId, identity.subject);
      if (identity.identityKey !== key) throw new ConflictException('Apple 身份记录异常，请联系平台核查');
      const current = await tx.appleAuthorization.findUnique({ where: { identityKey: key } });
      if (current && (current.appId !== identity.appId || current.subject !== identity.subject || current.userId && current.userId !== userId)) throw new ConflictException('Apple 身份记录异常');
      const tokens = await tx.appleOAuthToken.findMany({ where: { identityKey: key } });
      const usable = tokens.filter((token: any) => token.tokenCiphertext && ['active', 'pending', 'processing'].includes(token.state));
      const providerAlreadyRevoked = current?.state === 'consent_revoked' || current?.state === 'account_deleted';
      if (!usable.length && !providerAlreadyRevoked && !tokens.some((token: any) => token.state === 'complete')) manual = true;
      await tx.appleAuthorization.upsert({ where: { identityKey: key },
        create: { identityKey: key, appId: identity.appId, subject: identity.subject, userId, state: 'local_deleted', revokedAt: now },
        update: { userId, state: 'local_deleted', revokedAt: now },
      });
      if (usable.length) {
        await tx.appleOAuthToken.updateMany({ where: { identityKey: key, state: { in: ['active', 'pending'] }, tokenCiphertext: { not: null } },
          data: { state: 'pending', nextAttemptAt: now, leaseId: null, leaseUntil: null },
        });
        queued = true;
      }
    }
    return { status: manual ? 'manual_required' : queued ? 'pending' : 'complete' };
  }

  async handleNotification(payload: unknown): Promise<{ success: true }> {
    const event = await this.oauth.verifyAppleNotification(payload);
    const key = loginIdentityKey('app-apple', event.appId, event.subject);
    const eventKey = digest(['apple-notification', event.appId, event.id]);
    const revokedSession = await this.serializable(async (tx: any) => {
      const receipt = await tx.appleServerEvent.findUnique({ where: { id: eventKey } });
      if (receipt) {
        if (receipt.eventId !== event.id || receipt.identityKey !== key || receipt.type !== event.type || receipt.eventAt.getTime() !== event.eventTimeMs || receipt.issuedAt.getTime() !== event.issuedAtMs) throw new UnauthorizedException('通知标识冲突');
        return null;
      }
      await tx.appleServerEvent.create({ data: { id: eventKey, eventId: event.id, identityKey: key, type: event.type,
        eventAt: new Date(event.eventTimeMs), issuedAt: new Date(event.issuedAtMs) } });
      // Mail relay changes do not re-enable consent and do not move its event watermark.
      if (event.type === 'email-enabled' || event.type === 'email-disabled') return null;
      const current = await tx.appleAuthorization.findUnique({ where: { identityKey: key } });
      const channel = await tx.userAuthIdentity.findUnique({ where: { identityKey: key } });
      if (channel && (channel.provider !== 'app-apple' || channel.appId !== event.appId || channel.subject !== event.subject)) throw new ConflictException('Apple 身份归属异常');
      if (current && (current.appId !== event.appId || current.subject !== event.subject || current.userId && channel && current.userId !== channel.userId)) throw new ConflictException('Apple 身份归属异常');
      const boundUserId = current?.userId || channel?.userId || null;
      // A late revocation from an older grant must not clear the newer grant's
      // deletion outbox, even when the local account is already terminal.
      if (event.type === 'consent-revoked' && current &&
        (current.authorizedAt?.getTime() > event.eventTimeMs || current.lastEventAt?.getTime() > event.eventTimeMs)) return null;
      const state = current?.state === 'local_deleted' ? 'local_deleted' : event.type === 'account-deleted' || current?.state === 'account_deleted' ? 'account_deleted' : 'consent_revoked';
      const lastEventAt = new Date(Math.max(event.eventTimeMs, current?.lastEventAt?.getTime() || 0));
      await tx.appleAuthorization.upsert({ where: { identityKey: key },
        create: { identityKey: key, appId: event.appId, subject: event.subject, userId: boundUserId, state, lastEventAt, revokedAt: new Date(event.eventTimeMs) },
        update: { userId: boundUserId, state, lastEventAt, revokedAt: new Date(event.eventTimeMs) },
      });
      await tx.appleOAuthToken.updateMany({ where: { identityKey: key, state: { not: 'complete' } }, data: {
        state: 'complete', tokenCiphertext: null, completedAt: new Date(), leaseId: null, leaseUntil: null, nextAttemptAt: null, lastErrorCode: null,
      } });
      if (!boundUserId) return null;
      const user = await tx.user.update({ where: { id: boundUserId }, data: { authVersion: { increment: 1 } }, select: { authVersion: true } });
      return { userId: boundUserId, invalidBeforeVersion: user.authVersion as number };
    });
    if (revokedSession) {
      // DB version is the authority even if Redis/socket cleanup is temporarily unavailable.
      try { await this.sessions.revoke(revokedSession.userId, { versionAlreadyRevoked: true, invalidBeforeVersion: revokedSession.invalidBeforeVersion }); }
      catch { this.logger.warn('Apple 授权会话已持久撤销，实时连接清理待恢复'); }
    }
    return { success: true };
  }

  private async serializable<T>(work: (tx: any) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt++) {
      try { return await this.prisma.$transaction(work, { isolationLevel: 'Serializable', maxWait: 5000, timeout: 10000 }); }
      catch (error: any) { if (!['P2002', 'P2034'].includes(error?.code)) throw error; }
    }
    throw new ConflictException('Apple 授权状态正在变化，请重试');
  }

  // Durable leases support restarts/multiple workers. Only the lease owner can
  // complete or reschedule a token, so a delayed response cannot clear a newer grant.
  async drainRevocations(limit = 20): Promise<{ attempted: number; completed: number }> {
    const db: any = this.prisma;
    const now = new Date();
    const rows = await db.appleOAuthToken.findMany({ where: {
      tokenCiphertext: { not: null }, OR: [
        { state: 'pending', nextAttemptAt: { lte: now } },
        { state: 'processing', leaseUntil: { lte: now } },
      ],
    }, take: Math.min(Math.max(limit, 1), 100), orderBy: { updatedAt: 'asc' }, include: { authorization: true } });
    let attempted = 0, completed = 0;
    for (const row of rows) {
      const leaseId = randomUUID();
      const claimed = await db.appleOAuthToken.updateMany({ where: { id: row.id, tokenCiphertext: row.tokenCiphertext, OR: [
        { state: 'pending', nextAttemptAt: { lte: now } }, { state: 'processing', leaseUntil: { lte: now } },
      ] }, data: { state: 'processing', leaseId, leaseUntil: new Date(Date.now() + 60000), attempts: { increment: 1 } } });
      if (claimed.count !== 1) continue;
      attempted++;
      try {
        const authorization = await db.appleAuthorization.findUnique({ where: { identityKey: row.identityKey } });
        if (!authorization || authorization.state !== 'local_deleted') throw new Error('APPLE_REVOCATION_STATE_INVALID');
        const token = this.vault.open(row.tokenCiphertext, authorization.appId, authorization.subject);
        await this.oauth.revokeAppleToken(authorization.appId, token);
        const result = await db.appleOAuthToken.updateMany({ where: { id: row.id, state: 'processing', leaseId }, data: {
          state: 'complete', tokenCiphertext: null, leaseId: null, leaseUntil: null, nextAttemptAt: null, lastErrorCode: null, completedAt: new Date(),
        } });
        completed += result.count;
      } catch {
        // Store only an internal fixed code; never an Axios exception or provider token.
        const delay = Math.min(3600000, 30000 * 2 ** Math.min(row.attempts, 7));
        await db.appleOAuthToken.updateMany({ where: { id: row.id, state: 'processing', leaseId }, data: {
          state: 'pending', leaseId: null, leaseUntil: null, nextAttemptAt: new Date(Date.now() + delay), lastErrorCode: 'APPLE_REVOCATION_RETRY_REQUIRED',
        } });
      }
    }
    return { attempted, completed };
  }
}
