// Run ONLY through scripts/test-apple-lifecycle-isolated.cjs. All users/tokens are synthetic.
// Real PG, Prisma transactions and service methods; provider HTTP and session transports are substitutes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const url = new URL(process.env.UNIAPPX_TEST_DATABASE_URL || 'http://invalid');
assert.equal(url.protocol, 'postgresql:');
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.port, process.env.UNIAPPX_ISOLATED_PORT);
assert.match(url.pathname, /^\/apple_lifecycle_test_uniappx_[a-f0-9]{12}$/);
assert.equal(fs.realpathSync(process.cwd()), fs.realpathSync(process.env.UNIAPPX_ISOLATED_ROOT || '/invalid'));
assert.ok(path.basename(process.cwd()).startsWith('uniappx-apple-lifecycle-'));
assert.ok(fs.existsSync(path.join(process.cwd(), 'cluster/postmaster.pid')));
require('ts-node').register({ transpileOnly: true, project: path.resolve(__dirname, '../tsconfig.json') });
const { PrismaClient } = require('@prisma/client');
const { AppleLifecycleService } = require('../src/modules/auth/apple-lifecycle.service.ts');
const { AppleTokenVault } = require('../src/modules/auth/apple-token-vault.ts');
const { resolveLoginIdentity, loginIdentityKey } = require('../src/modules/auth/app-identity.ts');
const { UserService } = require('../src/modules/user/user.service.ts');
const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
const APP = 'com.example.isolated-apple';
const BASE = Date.now() - 120000;
const settings = { APPLE_TOKEN_ENCRYPTION_KEY_ID: 'isolated', APPLE_TOKEN_ENCRYPTION_KEYS: JSON.stringify({ isolated: randomBytes(32).toString('base64') }) };
const config = { get: (key) => settings[key] };
const vault = new AppleTokenVault(config);
const clone = (value) => JSON.parse(JSON.stringify(value));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const keyOf = (subject) => loginIdentityKey('app-apple', APP, subject);
const authorization = (subject) => db.appleAuthorization.findUnique({ where: { identityKey: keyOf(subject) } });
const tokensOf = (subject) => db.appleOAuthToken.findMany({ where: { identityKey: keyOf(subject) }, orderBy: { id: 'asc' } });
const event = (subject, extra = {}) => ({ id: `event-${subject}`, appId: APP, subject, type: 'consent-revoked', issuedAtMs: BASE + 20000, eventTimeMs: BASE + 10000, ...extra });
const grant = (subject, extra = {}) => ({ provider: 'apple', appId: APP, subject, appleRefreshToken: `synthetic-refresh-${subject}`, appleAuthorizedAtMs: BASE, ...extra });
function fixture({ database = db, revoke, cleanup, verify, vaultConfig = config } = {}) {
  const revocations = [], cleanups = [];
  const oauth = {
    verifyAppleNotification: async (value) => verify ? verify(value) : clone(value),
    revokeAppleToken: async (appId, token) => { revocations.push({ appId, token }); if (revoke) return revoke(appId, token); },
  };
  const sessions = { revoke: async (userId, options) => { cleanups.push({ userId, options }); if (cleanup) return cleanup(userId, options); } };
  const service = new AppleLifecycleService(database, vaultConfig, oauth, sessions);
  const userService = new UserService(database, {}, {}, {}, {}, {}, sessions, {}, {}, {}, undefined, service);
  return { service, userService, oauth, sessions, revocations, cleanups };
}
async function login(f, subject, extra = {}, requestedAt = extra.appleAuthorizedAtMs ?? BASE) {
  const identity = grant(subject, extra);
  return resolveLoginIdentity(db, { provider: 'app-apple', appId: identity.appId, subject },
    (tx, user) => f.service.bindAuthorization(tx, user, identity, requestedAt));
}
function transactionDatabase(change) {
  return new Proxy(db, { get(target, name) {
    if (name === '$transaction') return (work, options) => target.$transaction((tx) => work(change(tx)), options);
    const value = Reflect.get(target, name); return typeof value === 'function' ? value.bind(target) : value;
  } });
}
function overrideModel(tx, modelName, method, transform) {
  const model = new Proxy(tx[modelName], { get(target, name) {
    if (name === method) return (args) => target[method](transform(args));
    const value = Reflect.get(target, name); return typeof value === 'function' ? value.bind(target) : value;
  } });
  return new Proxy(tx, { get(target, name) { return name === modelName ? model : Reflect.get(target, name); } });
}
function concurrentDatabase() {
  let entered = 0, ready = 0, conflicts = 0;
  const gate = deferred();
  const wrapped = new Proxy(db, { get(target, name) {
    if (name === '$transaction') return async (work, options) => {
      try {
        return await target.$transaction(async (tx) => {
          if (entered++ < 2) {
            await tx.appleServerEvent.count(); // Both first attempts establish real PG snapshots.
            if (++ready === 2) gate.resolve();
            await gate.promise;
          }
          return work(tx);
        }, options);
      } catch (error) { if (['P2034', 'P2002'].includes(error.code)) conflicts += 1; throw error; }
    };
    const value = Reflect.get(target, name); return typeof value === 'function' ? value.bind(target) : value;
  } });
  return { database: wrapped, conflicts: () => conflicts };
}
async function reset() {
  // Safe only because the runner and the assertions above require a fresh named loopback cluster.
  await db.$transaction([
    db.errandOrder.deleteMany(), db.regionRider.deleteMany(), db.secondHandOrder.deleteMany(),
    db.auditLog.deleteMany(), db.appleOAuthToken.deleteMany(), db.appleServerEvent.deleteMany(),
    db.appleAuthorization.deleteMany(), db.userAuthIdentity.deleteMany(), db.user.deleteMany(),
  ]);
}
async function expectBlockedCancellation(f, userId, subject, reason) {
  const beforeUser = await db.user.findUnique({ where: { id: userId }, include: { profile: true } });
  const beforeAuth = await authorization(subject), beforeTokens = await tokensOf(subject);
  await assert.rejects(() => f.userService.cancelAccount(userId), (error) =>
    error.getStatus?.() === 400 && error.getResponse?.().blockers?.some((item) => item.includes(reason)));
  assert.deepEqual(await db.user.findUnique({ where: { id: userId }, include: { profile: true } }), beforeUser);
  assert.deepEqual(await authorization(subject), beforeAuth); assert.deepEqual(await tokensOf(subject), beforeTokens);
  assert.equal(await db.auditLog.count(), 0); assert.equal(f.cleanups.length, 0); assert.equal(f.revocations.length, 0);
}
let checks = 0;
const failures = [];
async function check(label, work) {
  await reset();
  try { await work(); checks += 1; console.log('PASS', label); }
  catch (error) { failures.push(label); console.error('FAIL', label, String(error?.message || error)); }
}

async function main() {
  const [identity] = await db.$queryRawUnsafe('SELECT current_database() AS name, host(inet_server_addr()) AS host, inet_server_port() AS port');
  assert.equal(identity.name, url.pathname.slice(1)); assert.equal(identity.host, '127.0.0.1'); assert.equal(String(identity.port), url.port);

  await check('unknown-subject revocation persists a tombstone and rolls back every old-login-created row', async () => {
    const f = fixture(), subject = 'unknown-old-login';
    await f.service.handleNotification(event(subject));
    const before = await authorization(subject);
    assert.equal(before.userId, null); assert.equal(before.state, 'consent_revoked');
    await assert.rejects(() => login(f, subject), (error) => error.getResponse?.().code === 'APPLE_AUTHORIZATION_REVOKED');
    assert.equal(await db.user.count(), 0); assert.equal(await db.userProfile.count(), 0); assert.equal(await db.userSettings.count(), 0);
    assert.equal(await db.userAuthIdentity.count(), 0); assert.equal(await db.appleOAuthToken.count(), 0);
    assert.deepEqual(await authorization(subject), before);
    // A fresh-looking token cannot redeem a login request started before revocation.
    await assert.rejects(() => login(f, subject, { appleAuthorizedAtMs: BASE + 30000 }, BASE), /授权已失效/);
    assert.equal(await db.user.count(), 0);
  });

  await check('missing vault configuration fails inside login finalizer and rolls back identity/profile/settings', async () => {
    const f = fixture({ vaultConfig: { get: () => undefined } });
    await assert.rejects(() => login(f, 'vault-missing'), (error) => error.getStatus?.() === 503);
    for (const model of ['user', 'userProfile', 'userSettings', 'userAuthIdentity', 'appleAuthorization', 'appleOAuthToken']) assert.equal(await db[model].count(), 0);
  });

  await check('a genuinely newer authorization follows revocation, while equal or older evidence stays blocked', async () => {
    const f = fixture(), subject = 'authorization-watermark';
    const user = await login(f, subject);
    const signedEvent = event(subject);
    await f.service.handleNotification(signedEvent);
    assert.equal((await db.user.findUnique({ where: { id: user.id } })).authVersion, 1);
    assert.equal((await tokensOf(subject))[0].tokenCiphertext, null);
    await assert.rejects(() => login(f, subject, { appleAuthorizedAtMs: signedEvent.eventTimeMs }), /授权已失效/);
    const latest = await login(f, subject, { appleAuthorizedAtMs: BASE + 30000, appleRefreshToken: 'synthetic-new-grant' });
    assert.equal(latest.id, user.id); assert.equal(latest.authVersion, 1);
    assert.equal((await authorization(subject)).state, 'active');
    await f.service.handleNotification(event(subject, { id: 'late-earlier-consent', eventTimeMs: BASE + 20000, issuedAtMs: BASE + 40000 }));
    assert.equal((await authorization(subject)).state, 'active');
    assert.equal((await db.user.findUnique({ where: { id: user.id } })).authVersion, 1);
    assert.equal((await tokensOf(subject)).filter((row) => row.state === 'active').length, 1);
  });

  await check('account-deleted is terminal even when older than a recent grant and later email events never restore it', async () => {
    const f = fixture(), subject = 'terminal-provider-delete';
    const user = await login(f, subject, { appleAuthorizedAtMs: BASE + 30000 });
    await f.service.handleNotification(event(subject, { type: 'account-deleted' }));
    await f.service.handleNotification(event(subject, { id: 'later-email', type: 'email-enabled', eventTimeMs: BASE + 40000, issuedAtMs: BASE + 50000 }));
    const current = await authorization(subject);
    assert.equal(current.state, 'account_deleted'); assert.equal(current.lastEventAt.getTime(), BASE + 10000);
    await assert.rejects(() => login(f, subject, { appleAuthorizedAtMs: BASE + 60000 }), /授权已失效/);
    assert.equal((await db.user.findUnique({ where: { id: user.id } })).authVersion, 1);
    assert.equal((await tokensOf(subject))[0].tokenCiphertext, null);
  });

  await check('email timestamps neither advance the consent watermark nor restore revoked authorization', async () => {
    const f = fixture(), subject = 'email-separate-watermark';
    const user = await login(f, subject);
    await f.service.handleNotification(event(subject, { id: 'new-email-first', type: 'email-enabled', eventTimeMs: BASE + 50000, issuedAtMs: BASE + 60000 }));
    assert.equal((await authorization(subject)).state, 'active'); assert.equal((await authorization(subject)).lastEventAt, null);
    await f.service.handleNotification(event(subject));
    await f.service.handleNotification(event(subject, { id: 'new-email-after', type: 'email-disabled', eventTimeMs: BASE + 70000, issuedAtMs: BASE + 80000 }));
    assert.equal((await authorization(subject)).state, 'consent_revoked'); assert.equal((await authorization(subject)).lastEventAt.getTime(), BASE + 10000);
    assert.equal((await db.user.findUnique({ where: { id: user.id } })).authVersion, 1);
    assert.equal(await db.appleServerEvent.count(), 3);
  });

  await check('concurrent duplicate notifications retry a real PG conflict and increment authVersion exactly once', async () => {
    const base = fixture(), subject = 'concurrent-duplicate';
    const user = await login(base, subject);
    const pair = concurrentDatabase(); const f = fixture({ database: pair.database }); const payload = event(subject);
    await Promise.all([f.service.handleNotification(payload), f.service.handleNotification(payload)]);
    await f.service.handleNotification(payload);
    assert.ok(pair.conflicts() >= 1, 'test must observe a real PG serialization or uniqueness conflict');
    assert.equal(await db.appleServerEvent.count(), 1);
    assert.equal((await db.user.findUnique({ where: { id: user.id } })).authVersion, 1);
    assert.equal(f.cleanups.length, 1); assert.deepEqual(f.cleanups[0].options, { versionAlreadyRevoked: true, invalidBeforeVersion: 1 });
    assert.equal((await tokensOf(subject))[0].state, 'complete');
  });

  await check('a reused jti with different signed contents cannot change the original durable receipt', async () => {
    const f = fixture(), subject = 'jti-conflict'; const user = await login(f, subject);
    const payload = event(subject); await f.service.handleNotification(payload);
    await assert.rejects(() => f.service.handleNotification({ ...payload, type: 'account-deleted' }), /标识冲突/);
    await assert.rejects(() => f.service.handleNotification({ ...payload, subject: 'another-subject' }), /标识冲突/);
    assert.equal(await db.appleServerEvent.count(), 1); assert.equal((await authorization(subject)).state, 'consent_revoked');
    assert.equal((await db.user.findUnique({ where: { id: user.id } })).authVersion, 1);
  });

  await check('real failure after receipt and token updates rolls back receipt/state/version and permits retry', async () => {
    const base = fixture(), subject = 'notification-rollback'; const user = await login(base, subject);
    const beforeAuth = await authorization(subject), beforeTokens = await tokensOf(subject);
    const broken = fixture({ database: transactionDatabase((tx) => overrideModel(tx, 'user', 'update', (args) => ({ ...args, where: { id: 'missing-synthetic-user' } }))) });
    await assert.rejects(() => broken.service.handleNotification(event(subject)), (error) => error.code === 'P2025');
    assert.equal(await db.appleServerEvent.count(), 0);
    assert.deepEqual(await authorization(subject), beforeAuth); assert.deepEqual(await tokensOf(subject), beforeTokens);
    assert.equal((await db.user.findUnique({ where: { id: user.id } })).authVersion, 0); assert.equal(broken.cleanups.length, 0);
    await base.service.handleNotification(event(subject));
    assert.equal(await db.appleServerEvent.count(), 1); assert.equal((await db.user.findUnique({ where: { id: user.id } })).authVersion, 1);
  });

  await check('transport cleanup failure cannot undo the committed revocation/version fence', async () => {
    const f = fixture({ cleanup: async () => { throw new Error('synthetic transport unavailable'); } });
    const subject = 'cleanup-outage'; const user = await login(f, subject);
    assert.deepEqual(await f.service.handleNotification(event(subject)), { success: true });
    assert.equal((await authorization(subject)).state, 'consent_revoked');
    assert.equal((await db.user.findUnique({ where: { id: user.id } })).authVersion, 1);
    assert.equal((await tokensOf(subject))[0].tokenCiphertext, null);
  });

  await check('real account cancellation commits deletion, profile redaction and all token outbox rows atomically', async () => {
    const f = fixture(), subject = 'delete-multiple-tokens'; const user = await login(f, subject);
    await login(f, subject, { appleAuthorizedAtMs: BASE + 1000, appleRefreshToken: 'synthetic-second-device-refresh' });
    await db.userProfile.update({ where: { userId: user.id }, data: { email: 'synthetic@example.invalid', wechat: 'synthetic-contact', bio: 'synthetic-bio' } });
    const beforeTokens = await tokensOf(subject);
    assert.equal(beforeTokens.length, 2);
    const plaintexts = beforeTokens.map((row) => vault.open(row.tokenCiphertext, APP, subject)).sort();
    assert.deepEqual(plaintexts, ['synthetic-refresh-' + subject, 'synthetic-second-device-refresh'].sort());
    assert.ok(beforeTokens.every((row) => !row.tokenCiphertext.includes('synthetic')));
    const result = await f.userService.cancelAccount(user.id);
    assert.equal(result.apple_revocation.status, 'pending');
    const deleted = await db.user.findUnique({ where: { id: user.id }, include: { profile: true } });
    assert.equal(deleted.status, 'DELETED'); assert.equal(deleted.authVersion, 1); assert.equal(deleted.profile.email, null); assert.equal(deleted.profile.wechat, null);
    assert.equal((await authorization(subject)).state, 'local_deleted');
    const queued = await tokensOf(subject); assert.equal(queued.length, 2); assert.ok(queued.every((row) => row.state === 'pending' && row.tokenCiphertext && row.nextAttemptAt));
    assert.equal(await db.auditLog.count({ where: { userId: user.id, action: 'DELETE' } }), 1);
    assert.equal(f.revocations.length, 0, 'provider HTTP must not run inside the deletion transaction');
    assert.deepEqual(f.cleanups[0].options, { versionAlreadyRevoked: true, invalidBeforeVersion: 1 });
  });

  await check('late consent from before reauthorization cannot discard the newer token after local deletion', async () => {
    const f = fixture(), subject = 'deleted-new-grant-old-consent'; const user = await login(f, subject);
    await f.service.handleNotification(event(subject));
    await login(f, subject, { appleAuthorizedAtMs: BASE + 30000, appleRefreshToken: 'synthetic-newer-delete-token' });
    await f.userService.cancelAccount(user.id);
    const beforeAuth = await authorization(subject), beforeTokens = await tokensOf(subject);
    assert.equal(beforeAuth.state, 'local_deleted'); assert.equal(beforeTokens.filter((row) => row.state === 'pending').length, 1);
    await f.service.handleNotification(event(subject, { id: 'late-consent-after-delete', eventTimeMs: BASE + 20000, issuedAtMs: BASE + 40000 }));
    assert.deepEqual(await authorization(subject), beforeAuth); assert.deepEqual(await tokensOf(subject), beforeTokens);
    assert.equal((await db.user.findUnique({ where: { id: user.id } })).authVersion, 2);
    assert.deepEqual(f.cleanups.map((row) => row.options.invalidBeforeVersion), [1, 2]);
    assert.deepEqual(await f.service.drainRevocations(), { attempted: 1, completed: 1 });
    assert.deepEqual(f.revocations, [{ appId: APP, token: 'synthetic-newer-delete-token' }]);
  });

  await check('positive wallet balance blocks cancellation without touching user, authorization or outbox', async () => {
    const f = fixture(), subject = 'wallet-balance-block'; const user = await login(f, subject);
    await db.wallet.create({ data: { userId: user.id, balance: '1.25' } });
    await expectBlockedCancellation(f, user.id, subject, '钱包余额');
  });

  await check('frozen wallet funds alone block cancellation even when spendable balance is zero', async () => {
    const f = fixture(), subject = 'wallet-freeze-block'; const user = await login(f, subject);
    await db.wallet.create({ data: { userId: user.id, balance: 0, freeze: '2.00' } });
    await expectBlockedCancellation(f, user.id, subject, '冻结资金');
  });

  await check('pending and processing withdrawals block cancellation with all Apple state unchanged', async () => {
    const f = fixture(), subject = 'withdraw-block'; const user = await login(f, subject);
    const withdrawal = await db.withdraw.create({ data: { userId: user.id, amount: '1.00', channel: 'WX_PAY', account: 'synthetic-account', status: 'PENDING' } });
    await expectBlockedCancellation(f, user.id, subject, '提现');
    await db.withdraw.update({ where: { id: withdrawal.id }, data: { status: 'PROCESSING' } });
    await expectBlockedCancellation(f, user.id, subject, '提现');
  });

  await check('an unfinished errand assigned only to this rider blocks rider account deletion', async () => {
    const f = fixture(), subject = 'rider-order-block'; const rider = await login(f, subject);
    const customer = await db.user.create({ data: { openid: 'synthetic-errand-customer', nickname: '合成买家' } });
    await db.regionRider.create({ data: { userId: rider.id, regionId: 'synthetic-region', realName: '合成骑手', idCard: 'synthetic-id', phone: 'synthetic-phone' } });
    await db.errandOrder.create({ data: { orderNo: 'synthetic-rider-order', userId: customer.id, riderId: rider.id, status: 'in_progress', title: '合成订单', pickupAddress: '合成取货地址', deliverAddress: '合成送货地址', price: '1.00', payAmount: '1.00' } });
    assert.equal(await db.errandOrder.count({ where: { userId: rider.id } }), 0);
    await expectBlockedCancellation(f, rider.id, subject, '跑腿订单');
  });

  await check('an unfinished second-hand sale blocks a seller who has no buyer orders', async () => {
    const f = fixture(), subject = 'seller-order-block'; const seller = await login(f, subject);
    const buyer = await db.user.create({ data: { openid: 'synthetic-secondhand-buyer', nickname: '合成买家' } });
    const product = await db.secondHand.create({ data: { userId: seller.id, title: '合成商品', images: [], price: '1.00', category: 'synthetic' } });
    await db.secondHandOrder.create({ data: { orderNo: 'synthetic-seller-order', buyerId: buyer.id, sellerId: seller.id, productId: product.id, price: '1.00', status: 'paid' } });
    assert.equal(await db.secondHandOrder.count({ where: { buyerId: seller.id } }), 0);
    await expectBlockedCancellation(f, seller.id, subject, '二手交易订单');
  });

  await check('a real audit insert failure rolls back local deletion and every queued Apple token', async () => {
    const base = fixture(), subject = 'delete-rollback'; const user = await login(base, subject);
    await login(base, subject, { appleRefreshToken: 'synthetic-other-refresh', appleAuthorizedAtMs: BASE + 1000 });
    const existingAudit = await db.auditLog.create({ data: { userId: user.id, action: 'UPDATE', module: 'synthetic-test' } });
    const beforeUser = await db.user.findUnique({ where: { id: user.id } }), beforeAuth = await authorization(subject), beforeTokens = await tokensOf(subject);
    const broken = fixture({ database: transactionDatabase((tx) => overrideModel(tx, 'auditLog', 'create', (args) => ({ ...args, data: { ...args.data, id: existingAudit.id } }))) });
    await assert.rejects(() => broken.userService.cancelAccount(user.id), (error) => error.code === 'P2002');
    assert.deepEqual(await db.user.findUnique({ where: { id: user.id } }), beforeUser);
    assert.deepEqual(await authorization(subject), beforeAuth); assert.deepEqual(await tokensOf(subject), beforeTokens);
    assert.equal(broken.cleanups.length, 0); assert.equal(broken.revocations.length, 0);
  });

  await check('legacy Apple identity without stored tokens can delete locally and reports manual revocation', async () => {
    const f = fixture(), subject = 'legacy-no-provider-token';
    const user = await resolveLoginIdentity(db, { provider: 'app-apple', appId: APP, subject });
    const result = await f.userService.cancelAccount(user.id);
    assert.equal(result.apple_revocation.status, 'manual_required');
    assert.equal((await db.user.findUnique({ where: { id: user.id } })).status, 'DELETED');
    assert.equal((await authorization(subject)).state, 'local_deleted'); assert.equal(await db.appleOAuthToken.count(), 0);
    assert.equal(f.revocations.length, 0);
  });

  await check('a non-Apple account deletion does not fabricate an Apple revocation task', async () => {
    const f = fixture(); const user = await db.user.create({ data: { openid: 'synthetic-non-apple', nickname: '合成用户' } });
    const result = await f.userService.cancelAccount(user.id);
    assert.equal(result.apple_revocation.status, 'not_required'); assert.equal(await db.appleAuthorization.count(), 0); assert.equal(await db.appleOAuthToken.count(), 0);
  });

  await check('two worker instances cannot claim the same live lease or revoke its token twice', async () => {
    const started = deferred(), release = deferred();
    const f = fixture({ revoke: async () => { started.resolve(); await release.promise; } });
    const subject = 'worker-one-lease'; const user = await login(f, subject); await f.userService.cancelAccount(user.id);
    const first = f.service.drainRevocations(); await started.promise;
    const second = fixture(); assert.deepEqual(await second.service.drainRevocations(), { attempted: 0, completed: 0 });
    assert.equal(second.revocations.length, 0);
    const leased = (await tokensOf(subject))[0]; assert.equal(leased.state, 'processing'); assert.equal(leased.attempts, 1); assert.ok(leased.leaseUntil > new Date());
    release.resolve(); assert.deepEqual(await first, { attempted: 1, completed: 1 });
    const completed = (await tokensOf(subject))[0]; assert.equal(completed.state, 'complete'); assert.equal(completed.tokenCiphertext, null); assert.equal(completed.leaseId, null);
    assert.equal(f.revocations.length, 1);
  });

  await check('provider failure preserves encrypted token, backs off, retries and clears ciphertext only on success', async () => {
    let failing = true;
    const f = fixture({ revoke: async () => { if (failing) throw new Error('synthetic-sensitive-provider-token'); } });
    const subject = 'worker-retry'; const user = await login(f, subject); await f.userService.cancelAccount(user.id);
    const ciphertext = (await tokensOf(subject))[0].tokenCiphertext;
    assert.deepEqual(await f.service.drainRevocations(), { attempted: 1, completed: 0 });
    const retry = (await tokensOf(subject))[0]; assert.equal(retry.state, 'pending'); assert.equal(retry.tokenCiphertext, ciphertext); assert.equal(retry.attempts, 1);
    assert.equal(retry.lastErrorCode, 'APPLE_REVOCATION_RETRY_REQUIRED'); assert.ok(retry.nextAttemptAt > new Date());
    assert.equal(JSON.stringify(retry).includes('synthetic-sensitive-provider-token'), false);
    assert.deepEqual(await f.service.drainRevocations(), { attempted: 0, completed: 0 });
    await db.appleOAuthToken.update({ where: { id: retry.id }, data: { nextAttemptAt: new Date(Date.now() - 1) } });
    failing = false;
    assert.deepEqual(await f.service.drainRevocations(), { attempted: 1, completed: 1 });
    const complete = (await tokensOf(subject))[0]; assert.equal(complete.state, 'complete'); assert.equal(complete.attempts, 2); assert.equal(complete.tokenCiphertext, null); assert.equal(complete.lastErrorCode, null);
  });

  await check('expired lease is recovered and a delayed old worker cannot clear the replacement lease', async () => {
    const oldStarted = deferred(), oldRelease = deferred(), newStarted = deferred(), newRelease = deferred();
    const old = fixture({ revoke: async () => { oldStarted.resolve(); await oldRelease.promise; } });
    const replacement = fixture({ revoke: async () => { newStarted.resolve(); await newRelease.promise; } });
    const subject = 'worker-expired-lease'; const user = await login(old, subject); await old.userService.cancelAccount(user.id);
    const oldJob = old.service.drainRevocations(); await oldStarted.promise;
    const first = (await tokensOf(subject))[0];
    await db.appleOAuthToken.update({ where: { id: first.id }, data: { leaseUntil: new Date(Date.now() - 1) } });
    const replacementJob = replacement.service.drainRevocations(); await newStarted.promise;
    const claimed = (await tokensOf(subject))[0]; assert.notEqual(claimed.leaseId, first.leaseId); assert.equal(claimed.attempts, 2);
    oldRelease.resolve(); assert.deepEqual(await oldJob, { attempted: 1, completed: 0 });
    const stillLeased = (await tokensOf(subject))[0]; assert.equal(stillLeased.leaseId, claimed.leaseId); assert.ok(stillLeased.tokenCiphertext);
    newRelease.resolve(); assert.deepEqual(await replacementJob, { attempted: 1, completed: 1 });
    assert.equal((await tokensOf(subject))[0].tokenCiphertext, null);
  });

  await check('provider notification during a worker lease completes its token without letting the old worker resurrect it', async () => {
    const started = deferred(), release = deferred();
    const f = fixture({ revoke: async () => { started.resolve(); await release.promise; } });
    const subject = 'worker-notification-race'; const user = await login(f, subject); await f.userService.cancelAccount(user.id);
    const job = f.service.drainRevocations(); await started.promise;
    await f.service.handleNotification(event(subject, { type: 'account-deleted' }));
    assert.equal((await authorization(subject)).state, 'local_deleted');
    const committed = (await tokensOf(subject))[0]; assert.equal(committed.state, 'complete'); assert.equal(committed.tokenCiphertext, null);
    release.resolve(); assert.deepEqual(await job, { attempted: 1, completed: 0 });
    assert.deepEqual(await tokensOf(subject), [committed]);
  });

  await check('wrong vault key keeps the outbox retryable and never sends garbage to Apple', async () => {
    const base = fixture(), subject = 'worker-vault-error'; const user = await login(base, subject); await base.userService.cancelAccount(user.id);
    const wrong = fixture({ vaultConfig: { get: (name) => name === 'APPLE_TOKEN_ENCRYPTION_KEYS' ? JSON.stringify({ isolated: randomBytes(32).toString('base64') }) : 'isolated' } });
    assert.deepEqual(await wrong.service.drainRevocations(), { attempted: 1, completed: 0 });
    assert.equal(wrong.revocations.length, 0); const row = (await tokensOf(subject))[0]; assert.equal(row.state, 'pending'); assert.ok(row.tokenCiphertext);
  });

  if (failures.length) throw new Error(`${failures.length} failed isolated contracts: ${failures.join('; ')}`);
  console.log(`PASS: ${checks} real PostgreSQL Apple lifecycle contracts; no project .env, existing DB, real users or Apple network calls.`);
}
main().catch((error) => {
  console.error(String(error?.message || error).replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, '[isolated database URL]'));
  process.exitCode = 1;
}).finally(() => db.$disconnect());
