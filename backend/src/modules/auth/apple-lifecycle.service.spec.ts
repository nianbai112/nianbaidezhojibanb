import { Logger } from '@nestjs/common';
import { AppleLifecycleService } from './apple-lifecycle.service';
import { AppleTokenVault } from './apple-token-vault';
import { loginIdentityKey } from './app-identity';

const APP = 'com.synthetic.campus', SUBJECT = 'synthetic-apple-subject', TOKEN = 'synthetic-refresh-token';
const KEY = loginIdentityKey('app-apple', APP, SUBJECT);
const NOW = 1800000000000;
const identity = () => ({ provider: 'apple' as const, appId: APP, subject: SUBJECT, appleRefreshToken: TOKEN, appleAuthorizedAtMs: NOW });
const authorization = (extra: Record<string, any> = {}) => ({ identityKey: KEY, appId: APP, subject: SUBJECT, userId: 'owner', state: 'active', authorizedAt: new Date(NOW - 1000), lastEventAt: null, ...extra });
const channel = (extra: Record<string, any> = {}) => ({ identityKey: KEY, provider: 'app-apple', appId: APP, subject: SUBJECT, userId: 'owner', ...extra });
const event = (extra: Record<string, any> = {}) => ({ id: 'synthetic-event-1', appId: APP, subject: SUBJECT, type: 'consent-revoked', eventTimeMs: NOW, issuedAtMs: NOW + 1000, ...extra });
function setup(extraConfig: Record<string, unknown> = {}) {
  const config: any = { get: (name: string) => ({ APPLE_TOKEN_ENCRYPTION_KEY_ID: 'current', APPLE_TOKEN_ENCRYPTION_KEYS: JSON.stringify({ current: Buffer.alloc(32, 7).toString('base64') }), ...extraConfig })[name] };
  const tx: any = {
    appleAuthorization: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn().mockResolvedValue({}) },
    appleOAuthToken: { findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn().mockResolvedValue({}), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    appleServerEvent: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({}) },
    userAuthIdentity: { findUnique: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
    user: { findUnique: jest.fn().mockResolvedValue({ id: 'owner', status: 'ACTIVE', deletedAt: null }), update: jest.fn().mockResolvedValue({ authVersion: 7 }) },
  };
  const prisma: any = { ...tx, $transaction: jest.fn(async (work: (client: any) => Promise<any>) => work(tx)) };
  const oauth: any = { verifyAppleNotification: jest.fn().mockResolvedValue(event()), revokeAppleToken: jest.fn().mockResolvedValue(undefined) };
  const sessions: any = { revoke: jest.fn().mockResolvedValue(undefined) };
  return { tx, prisma, oauth, sessions, vault: new AppleTokenVault(config), service: new AppleLifecycleService(prisma, config, oauth, sessions) };
}
async function rejects(work: Promise<unknown>, status: number, code?: string) {
  try { await work; throw new Error('Expected rejection'); } catch (error: any) {
    expect(error.getStatus()).toBe(status);
    if (code) expect(error.getResponse()).toMatchObject({ code });
    return error;
  }
}
function tokenRow(vault: AppleTokenVault, extra: Record<string, any> = {}) {
  return { id: 'synthetic-token-id', identityKey: KEY, tokenCiphertext: vault.seal(TOKEN, APP, SUBJECT), state: 'pending', attempts: 0, ...extra };
}

describe('Apple lifecycle authorization, notification and revocation boundaries', () => {
  let warn: jest.SpyInstance;
  beforeEach(() => { warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {}); });
  afterEach(() => jest.restoreAllMocks());

  it('binds only the verified owner and persists ciphertext, never a plaintext provider token', async () => {
    const f = setup();
    await expect(f.service.bindAuthorization(f.tx, { id: 'owner' }, identity(), NOW + 100)).resolves.toMatchObject({ id: 'owner' });
    expect(f.tx.appleAuthorization.upsert.mock.calls[0][0].create).toMatchObject({ identityKey: KEY, userId: 'owner', state: 'active', authorizedAt: new Date(NOW) });
    const saved = f.tx.appleOAuthToken.upsert.mock.calls[0][0];
    expect(saved.where.id).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(saved)).not.toContain(TOKEN);
    expect(f.vault.open(saved.create.tokenCiphertext, APP, SUBJECT)).toBe(TOKEN);
    expect(f.prisma.$transaction).not.toHaveBeenCalled(); // Must remain in the caller's transaction.
    expect(f.oauth.revokeAppleToken).not.toHaveBeenCalled();
  });
  it.each([{ provider: 'wechat' }, { appleRefreshToken: '' }, { appleAuthorizedAtMs: NaN }])('rejects incomplete verified authorization before persisting (case %#)', async (extra) => {
    const f = setup(); await rejects(f.service.bindAuthorization(f.tx, { id: 'owner' }, { ...identity(), ...extra } as any, NOW), 401);
    expect(f.tx.appleAuthorization.upsert).not.toHaveBeenCalled(); expect(f.tx.appleOAuthToken.upsert).not.toHaveBeenCalled();
  });
  it.each([{ userId: 'other-owner' }, { appId: 'com.synthetic.other' }, { subject: 'other-subject' }])('rejects inconsistent stored ownership instead of merging it (case %#)', async (extra) => {
    const f = setup(); f.tx.appleAuthorization.findUnique.mockResolvedValue(authorization(extra));
    await rejects(f.service.bindAuthorization(f.tx, { id: 'owner' }, identity(), NOW), 409);
    expect(f.tx.appleOAuthToken.upsert).not.toHaveBeenCalled();
  });
  it.each(['local_deleted', 'account_deleted'])('does not reactivate terminal authorization %s', async (state) => {
    const f = setup(); f.tx.appleAuthorization.findUnique.mockResolvedValue(authorization({ state }));
    await rejects(f.service.bindAuthorization(f.tx, { id: 'owner' }, identity(), NOW), 401, 'APPLE_AUTHORIZATION_REVOKED');
    expect(f.tx.appleAuthorization.upsert).not.toHaveBeenCalled();
  });
  it('uses both provider evidence and request start watermarks to reject a late login', async () => {
    const f = setup(); f.tx.appleAuthorization.findUnique.mockResolvedValue(authorization({ state: 'consent_revoked', lastEventAt: new Date(NOW) }));
    for (const [provider, started] of [[NOW, NOW + 1], [NOW + 1000, NOW - 1]]) {
      await rejects(f.service.bindAuthorization(f.tx, { id: 'owner' }, { ...identity(), appleAuthorizedAtMs: provider }, started), 401, 'APPLE_AUTHORIZATION_REVOKED');
    }
    expect(f.tx.appleAuthorization.upsert).not.toHaveBeenCalled();
    await f.service.bindAuthorization(f.tx, { id: 'owner' }, { ...identity(), appleAuthorizedAtMs: NOW + 1 }, NOW + 2);
    expect(f.tx.appleAuthorization.upsert.mock.calls[0][0].update).toMatchObject({ state: 'active', authorizedAt: new Date(NOW + 1), revokedAt: null });
  });
  it.each([null, { id: 'owner', status: 'DELETED' }, { id: 'owner', status: 'ACTIVE', deletedAt: new Date() }])('refuses inactive local accounts even with valid Apple evidence (case %#)', async (user) => {
    const f = setup(); f.tx.user.findUnique.mockResolvedValue(user);
    await rejects(f.service.bindAuthorization(f.tx, { id: 'owner' }, identity(), NOW), 401);
    expect(f.tx.appleAuthorization.upsert).not.toHaveBeenCalled();
  });
  it('missing encryption config fails closed before any authorization/token write', async () => {
    const f = setup({ APPLE_TOKEN_ENCRYPTION_KEYS: undefined });
    await rejects(f.service.bindAuthorization(f.tx, { id: 'owner' }, identity(), NOW), 503, 'APPLE_TOKEN_VAULT_UNAVAILABLE');
    expect(f.tx.appleAuthorization.upsert).not.toHaveBeenCalled(); expect(f.tx.appleOAuthToken.upsert).not.toHaveBeenCalled();
  });

  it('rejects an unverified notification without starting a database transaction', async () => {
    const f = setup(); const failure = new Error('invalid signature'); f.oauth.verifyAppleNotification.mockRejectedValue(failure);
    await expect(f.service.handleNotification('synthetic-signed-payload')).rejects.toBe(failure);
    expect(f.prisma.$transaction).not.toHaveBeenCalled(); expect(f.sessions.revoke).not.toHaveBeenCalled();
  });
  it('commits durable revocation and authVersion before attempting live session cleanup', async () => {
    const f = setup(); f.tx.appleAuthorization.findUnique.mockResolvedValue(authorization()); f.tx.userAuthIdentity.findUnique.mockResolvedValue(channel());
    f.prisma.$transaction.mockImplementation(async (work: (client: any) => Promise<any>) => { const result = await work(f.tx); expect(f.sessions.revoke).not.toHaveBeenCalled(); return result; });
    await expect(f.service.handleNotification('synthetic-signed-payload')).resolves.toEqual({ success: true });
    expect(f.tx.appleAuthorization.upsert.mock.calls[0][0].update).toMatchObject({ state: 'consent_revoked', lastEventAt: new Date(NOW) });
    expect(f.tx.appleOAuthToken.updateMany.mock.calls[0][0].data).toMatchObject({ state: 'complete', tokenCiphertext: null, leaseId: null });
    expect(f.tx.user.update).toHaveBeenCalledWith({ where: { id: 'owner' }, data: { authVersion: { increment: 1 } }, select: { authVersion: true } });
    expect(f.sessions.revoke).toHaveBeenCalledWith('owner', { versionAlreadyRevoked: true, invalidBeforeVersion: 7 });
    expect(f.prisma.$transaction.mock.calls[0][1]).toMatchObject({ isolationLevel: 'Serializable' });
  });
  it('a repeated verified event is idempotent and does not bump the user version twice', async () => {
    const f = setup(); f.tx.userAuthIdentity.findUnique.mockResolvedValue(channel());
    await f.service.handleNotification('synthetic-signed-payload');
    const receipt = f.tx.appleServerEvent.create.mock.calls[0][0].data;
    f.tx.appleServerEvent.findUnique.mockResolvedValue(receipt);
    await f.service.handleNotification('synthetic-signed-payload');
    expect(f.tx.appleServerEvent.create).toHaveBeenCalledTimes(1); expect(f.tx.user.update).toHaveBeenCalledTimes(1); expect(f.sessions.revoke).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(receipt)).not.toContain('synthetic-signed-payload');
  });
  it('rejects duplicate event IDs with different signed content', async () => {
    const f = setup();
    f.tx.appleServerEvent.findUnique.mockResolvedValue({ eventId: 'synthetic-event-1', identityKey: KEY, type: 'account-deleted', eventAt: new Date(NOW), issuedAt: new Date(NOW + 1000) });
    await rejects(f.service.handleNotification('synthetic-signed-payload'), 401);
    expect(f.tx.appleAuthorization.upsert).not.toHaveBeenCalled(); expect(f.sessions.revoke).not.toHaveBeenCalled();
  });
  it.each(['email-enabled', 'email-disabled'])('%s records receipt without changing authorization or its watermark', async (type) => {
    const f = setup(); f.oauth.verifyAppleNotification.mockResolvedValue(event({ type }));
    await f.service.handleNotification('synthetic-signed-payload');
    expect(f.tx.appleServerEvent.create).toHaveBeenCalledTimes(1);
    expect(f.tx.appleAuthorization.findUnique).not.toHaveBeenCalled(); expect(f.tx.appleAuthorization.upsert).not.toHaveBeenCalled(); expect(f.tx.user.update).not.toHaveBeenCalled();
  });
  it.each([{ authorizedAt: new Date(NOW + 1) }, { lastEventAt: new Date(NOW + 1) }])('a stale consent revocation cannot overwrite newer authorization/watermark (case %#)', async (extra) => {
    const f = setup(); f.tx.appleAuthorization.findUnique.mockResolvedValue(authorization(extra));
    await f.service.handleNotification('synthetic-signed-payload');
    expect(f.tx.appleServerEvent.create).toHaveBeenCalledTimes(1);
    expect(f.tx.appleAuthorization.upsert).not.toHaveBeenCalled(); expect(f.tx.appleOAuthToken.updateMany).not.toHaveBeenCalled(); expect(f.sessions.revoke).not.toHaveBeenCalled();
  });
  it('stale consent notification cannot falsely complete the pending outbox of a newer locally deleted grant', async () => {
    const f = setup();
    f.tx.appleAuthorization.findUnique.mockResolvedValue(authorization({ state: 'local_deleted', authorizedAt: new Date(NOW + 1), lastEventAt: new Date(NOW - 1000) }));
    f.tx.appleOAuthToken.findMany.mockResolvedValue([tokenRow(f.vault)]);
    await f.service.handleNotification('synthetic-signed-payload');
    expect(f.tx.appleServerEvent.create).toHaveBeenCalledTimes(1);
    expect(f.tx.appleAuthorization.upsert).not.toHaveBeenCalled();
    expect(f.tx.appleOAuthToken.updateMany).not.toHaveBeenCalled();
    expect(f.tx.user.update).not.toHaveBeenCalled();
    expect(f.sessions.revoke).not.toHaveBeenCalled();
  });
  it('keeps deletion terminal even if an account-deleted event arrives after a newer consent watermark', async () => {
    const f = setup(); f.oauth.verifyAppleNotification.mockResolvedValue(event({ type: 'account-deleted' }));
    f.tx.appleAuthorization.findUnique.mockResolvedValue(authorization({ state: 'local_deleted', lastEventAt: new Date(NOW + 1000) }));
    await f.service.handleNotification('synthetic-signed-payload');
    expect(f.tx.appleAuthorization.upsert.mock.calls[0][0].update).toMatchObject({ state: 'local_deleted', lastEventAt: new Date(NOW + 1000) });
  });
  it('persists a pre-login tombstone without creating or guessing a local account', async () => {
    const f = setup(); await f.service.handleNotification('synthetic-signed-payload');
    expect(f.tx.appleAuthorization.upsert.mock.calls[0][0].create).toMatchObject({ identityKey: KEY, userId: null, state: 'consent_revoked' });
    expect(f.tx.user.update).not.toHaveBeenCalled(); expect(f.sessions.revoke).not.toHaveBeenCalled();
  });
  it('inconsistent notification ownership fails before changing users or clearing token data', async () => {
    const f = setup(); f.tx.appleAuthorization.findUnique.mockResolvedValue(authorization()); f.tx.userAuthIdentity.findUnique.mockResolvedValue(channel({ userId: 'other' }));
    await rejects(f.service.handleNotification('synthetic-signed-payload'), 409);
    expect(f.tx.appleAuthorization.upsert).not.toHaveBeenCalled(); expect(f.tx.appleOAuthToken.updateMany).not.toHaveBeenCalled(); expect(f.sessions.revoke).not.toHaveBeenCalled();
  });
  it('unavailable event persistence is not acknowledged and does not fall back to memory', async () => {
    const f = setup(); const failure = new Error('database unavailable'); f.tx.appleServerEvent.create.mockRejectedValue(failure);
    await expect(f.service.handleNotification('synthetic-signed-payload')).rejects.toBe(failure);
    expect(f.prisma.$transaction).toHaveBeenCalledTimes(1); expect(f.tx.appleAuthorization.upsert).not.toHaveBeenCalled(); expect(f.sessions.revoke).not.toHaveBeenCalled();
  });
  it('retries P2002/P2034 transactions completely, with bounded failure after four attempts', async () => {
    const f = setup();
    f.tx.appleServerEvent.create.mockRejectedValueOnce({ code: 'P2002' }).mockRejectedValueOnce({ code: 'P2034' });
    await f.service.handleNotification('synthetic-signed-payload');
    expect(f.prisma.$transaction).toHaveBeenCalledTimes(3); expect(f.tx.appleServerEvent.findUnique).toHaveBeenCalledTimes(3);
    const exhausted = setup(); exhausted.tx.appleServerEvent.findUnique.mockRejectedValue({ code: 'P2034' });
    await rejects(exhausted.service.handleNotification('synthetic-signed-payload'), 409);
    expect(exhausted.prisma.$transaction).toHaveBeenCalledTimes(4); expect(exhausted.sessions.revoke).not.toHaveBeenCalled();
  });
  it('live session cleanup failures do not expose provider errors or undo durable revocation', async () => {
    const f = setup(); f.tx.userAuthIdentity.findUnique.mockResolvedValue(channel()); f.sessions.revoke.mockRejectedValue({ message: 'synthetic-sensitive-redis-detail', token: TOKEN });
    await expect(f.service.handleNotification('synthetic-signed-payload')).resolves.toEqual({ success: true });
    expect(f.tx.user.update).toHaveBeenCalledTimes(1); expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/synthetic-sensitive-redis-detail|synthetic-refresh-token/);
  });

  it('local deletion without an Apple identity needs no revocation and never calls a provider', async () => {
    const f = setup(); await expect(f.service.queueAccountDeletion(f.tx, 'owner', new Date(NOW))).resolves.toEqual({ status: 'not_required' });
    expect(f.tx.appleAuthorization.upsert).not.toHaveBeenCalled(); expect(f.oauth.revokeAppleToken).not.toHaveBeenCalled();
  });
  it('legacy Apple users without saved tokens get manual guidance without blocking local deletion', async () => {
    const f = setup(); f.tx.userAuthIdentity.findMany.mockResolvedValue([channel()]);
    await expect(f.service.queueAccountDeletion(f.tx, 'owner', new Date(NOW))).resolves.toEqual({ status: 'manual_required' });
    expect(f.tx.appleAuthorization.upsert.mock.calls[0][0].create).toMatchObject({ state: 'local_deleted', userId: 'owner' });
    expect(f.oauth.revokeAppleToken).not.toHaveBeenCalled(); expect(f.prisma.$transaction).not.toHaveBeenCalled();
  });
  it('queues encrypted grants in the caller transaction while preserving a processing worker lease', async () => {
    const f = setup(); f.tx.userAuthIdentity.findMany.mockResolvedValue([channel()]);
    f.tx.appleOAuthToken.findMany.mockResolvedValue([tokenRow(f.vault), tokenRow(f.vault, { id: 'processing', state: 'processing', leaseId: 'another-worker' })]);
    await expect(f.service.queueAccountDeletion(f.tx, 'owner', new Date(NOW))).resolves.toEqual({ status: 'pending' });
    expect(f.tx.appleOAuthToken.updateMany.mock.calls[0][0]).toMatchObject({ where: { identityKey: KEY, state: { in: ['active', 'pending'] }, tokenCiphertext: { not: null } }, data: { state: 'pending', nextAttemptAt: new Date(NOW) } });
    expect(f.oauth.revokeAppleToken).not.toHaveBeenCalled();
  });
  it.each(['consent_revoked', 'account_deleted'])('provider state %s requires no fresh provider call when tokens are already gone', async (state) => {
    const f = setup(); f.tx.userAuthIdentity.findMany.mockResolvedValue([channel()]); f.tx.appleAuthorization.findUnique.mockResolvedValue(authorization({ state }));
    await expect(f.service.queueAccountDeletion(f.tx, 'owner', new Date(NOW))).resolves.toEqual({ status: 'complete' });
    expect(f.oauth.revokeAppleToken).not.toHaveBeenCalled();
  });
  it('a completed token receipt avoids false manual guidance; mixed identities retain manual guidance', async () => {
    const f = setup(); f.tx.userAuthIdentity.findMany.mockResolvedValue([channel()]); f.tx.appleOAuthToken.findMany.mockResolvedValue([{ state: 'complete', tokenCiphertext: null }]);
    await expect(f.service.queueAccountDeletion(f.tx, 'owner', new Date(NOW))).resolves.toEqual({ status: 'complete' });
    const secondSubject = 'second-subject';
    f.tx.userAuthIdentity.findMany.mockResolvedValue([channel(), channel({ subject: secondSubject, identityKey: loginIdentityKey('app-apple', APP, secondSubject) })]);
    f.tx.appleOAuthToken.findMany.mockReset().mockResolvedValueOnce([tokenRow(f.vault)]).mockResolvedValueOnce([]);
    await expect(f.service.queueAccountDeletion(f.tx, 'owner', new Date(NOW))).resolves.toEqual({ status: 'manual_required' });
  });
  it('outbox write failure propagates to the enclosing deletion transaction without provider side effects', async () => {
    const f = setup(); f.tx.userAuthIdentity.findMany.mockResolvedValue([channel()]); f.tx.appleOAuthToken.findMany.mockResolvedValue([tokenRow(f.vault)]);
    const failed = new Error('outbox database unavailable'); f.tx.appleOAuthToken.updateMany.mockRejectedValue(failed);
    await expect(f.service.queueAccountDeletion(f.tx, 'owner', new Date(NOW))).rejects.toBe(failed);
    expect(f.oauth.revokeAppleToken).not.toHaveBeenCalled();
  });
  it('invalid local identity keys cannot delete someone else\'s grant', async () => {
    const f = setup(); f.tx.userAuthIdentity.findMany.mockResolvedValue([channel({ identityKey: 'wrong-key' })]);
    await rejects(f.service.queueAccountDeletion(f.tx, 'owner', new Date(NOW)), 409);
    expect(f.tx.appleAuthorization.upsert).not.toHaveBeenCalled(); expect(f.tx.appleOAuthToken.updateMany).not.toHaveBeenCalled();
  });

  it('a worker that loses its atomic lease claim never decrypts or contacts Apple', async () => {
    const f = setup(); f.tx.appleOAuthToken.findMany.mockResolvedValue([{ ...tokenRow(f.vault), tokenCiphertext: 'deliberately-invalid' }]); f.tx.appleOAuthToken.updateMany.mockResolvedValue({ count: 0 });
    await expect(f.service.drainRevocations()).resolves.toEqual({ attempted: 0, completed: 0 });
    expect(f.tx.appleAuthorization.findUnique).not.toHaveBeenCalled(); expect(f.oauth.revokeAppleToken).not.toHaveBeenCalled();
  });
  it('a successful worker clears ciphertext only under its matching durable lease', async () => {
    const f = setup(); const row = tokenRow(f.vault); f.tx.appleOAuthToken.findMany.mockResolvedValue([row]); f.tx.appleAuthorization.findUnique.mockResolvedValue(authorization({ state: 'local_deleted' }));
    await expect(f.service.drainRevocations()).resolves.toEqual({ attempted: 1, completed: 1 });
    expect(f.oauth.revokeAppleToken).toHaveBeenCalledWith(APP, TOKEN);
    const [claim, completed] = f.tx.appleOAuthToken.updateMany.mock.calls.map((call: any) => call[0]);
    expect(claim.where).toMatchObject({ id: row.id, tokenCiphertext: row.tokenCiphertext });
    expect(completed.where).toEqual({ id: row.id, state: 'processing', leaseId: claim.data.leaseId });
    expect(completed.data).toMatchObject({ state: 'complete', tokenCiphertext: null, leaseId: null, lastErrorCode: null });
    expect(warn).not.toHaveBeenCalled();
  });
  it.each(['decrypt', 'ownership-state', 'provider'])('worker %s failure keeps an encrypted retry task and stores no raw secret error', async (kind) => {
    const f = setup(); const row = tokenRow(f.vault, { attempts: 20 });
    if (kind === 'decrypt') row.tokenCiphertext = 'invalid-ciphertext';
    f.tx.appleOAuthToken.findMany.mockResolvedValue([row]); f.tx.appleAuthorization.findUnique.mockResolvedValue(authorization({ state: kind === 'ownership-state' ? 'active' : 'local_deleted' }));
    if (kind === 'provider') f.oauth.revokeAppleToken.mockRejectedValue({ message: 'synthetic-provider-secret', config: { data: TOKEN } });
    const before = Date.now();
    await expect(f.service.drainRevocations()).resolves.toEqual({ attempted: 1, completed: 0 });
    const [claim, retried] = f.tx.appleOAuthToken.updateMany.mock.calls.map((call: any) => call[0]);
    expect(retried.where).toEqual({ id: row.id, state: 'processing', leaseId: claim.data.leaseId });
    expect(retried.data).toMatchObject({ state: 'pending', leaseId: null, lastErrorCode: 'APPLE_REVOCATION_RETRY_REQUIRED' });
    expect(retried.data.tokenCiphertext).toBeUndefined();
    expect(retried.data.nextAttemptAt.getTime()).toBeGreaterThanOrEqual(before + 3600000);
    expect(retried.data.nextAttemptAt.getTime()).toBeLessThanOrEqual(Date.now() + 3600000);
    expect(JSON.stringify(retried)).not.toMatch(/synthetic-provider-secret|synthetic-refresh-token/);
    expect(warn).not.toHaveBeenCalled();
    if (kind !== 'provider') expect(f.oauth.revokeAppleToken).not.toHaveBeenCalled();
  });
  it('a late successful provider response cannot complete a task whose lease was replaced', async () => {
    const f = setup(); f.tx.appleOAuthToken.findMany.mockResolvedValue([tokenRow(f.vault)]); f.tx.appleAuthorization.findUnique.mockResolvedValue(authorization({ state: 'local_deleted' }));
    f.tx.appleOAuthToken.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    await expect(f.service.drainRevocations()).resolves.toEqual({ attempted: 1, completed: 0 });
    expect(f.tx.appleOAuthToken.updateMany).toHaveBeenCalledTimes(2);
    expect(f.tx.appleOAuthToken.updateMany.mock.calls[1][0].where.leaseId).toBe(f.tx.appleOAuthToken.updateMany.mock.calls[0][0].data.leaseId);
  });
});
