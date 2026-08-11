# Rider Hidden Password Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a backend-configured hidden username/password login to the rider App, bound to one approved official rider and granting the same full rider capabilities as SMS login.

**Architecture:** Store one bcrypt-backed credential in a dedicated Prisma model and issue normal user tokens with additional credential source/version claims. Reuse the existing rider session and workbench after login, while HTTP, refresh-token, and native WebSocket authentication reject disabled or rotated password credentials immediately.

**Tech Stack:** NestJS 11, Prisma 5, PostgreSQL/MySQL schema variants, bcrypt, JWT, Redis, Vue 3 + Element Plus admin, UniApp rider client, Node test runner, Jest.

## Global Constraints

- Do not modify the mini-program.
- Preserve the existing SMS-code rider login and its token behavior.
- The hidden credential must bind exactly one `ACTIVE` user whose `RegionRider` is `approved`, `official`, and has a region.
- Passwords and password hashes must never appear in admin responses, logs, storage, client telemetry, or Git.
- The first version manages one hidden test credential only; do not build multi-account roles or bulk credential management.
- The rider login card appears only after 10 logo taps within 5 seconds.
- Password-login tokens have full ordinary rider capability, but must be revocable through `credentialVersion` on HTTP, refresh, and WebSocket paths.
- Use Node 22 for backend/admin commands.
- Keep backend/admin commits in the isolated Git worktree; the standalone rider App is non-Git and must retain its recoverable pre-change backup.

---

### Task 1: Define and test the hidden-credential validation contract

**Files:**
- Create: `backend/src/modules/rider-app/rider-password-credential.contract.ts`
- Create: `backend/src/modules/rider-app/rider-password-credential.contract.spec.ts`

**Interfaces:**
- Produces: `normalizeRiderPasswordUsername(value: unknown): string`
- Produces: `parseRiderPasswordCredentialInput(value: unknown, hasPassword: boolean): RiderPasswordCredentialInput`
- Produces: `PASSWORD_LOGIN_GENERIC_MESSAGE: string`
- `RiderPasswordCredentialInput` contains `username`, `userId`, `enabled`, `expiresAt`, and optional `password`.

- [ ] **Step 1: Write failing contract tests**

```ts
import {
  normalizeRiderPasswordUsername,
  parseRiderPasswordCredentialInput,
} from './rider-password-credential.contract';

describe('rider password credential contract', () => {
  it('normalizes a case-insensitive login name', () => {
    expect(normalizeRiderPasswordUsername('  Campus.Test  ')).toBe('campus.test');
  });

  it('requires a 10-64 character password containing letters and numbers', () => {
    expect(() => parseRiderPasswordCredentialInput({
      username: 'campus.test', userId: 'user-1', enabled: true, password: 'short1',
    }, false)).toThrow('密码');
    expect(parseRiderPasswordCredentialInput({
      username: 'campus.test', userId: 'user-1', enabled: true, password: 'Campus2026!',
    }, false).password).toBe('Campus2026!');
  });

  it('allows an empty password only when a hash already exists', () => {
    expect(parseRiderPasswordCredentialInput({
      username: 'campus.test', userId: 'user-1', enabled: true, password: '',
    }, true).password).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the contract test and verify RED**

Run: `npm --workspace backend test -- --runInBand rider-password-credential.contract.spec.ts`

Expected: FAIL because `rider-password-credential.contract.ts` does not exist.

- [ ] **Step 3: Implement the minimal validation contract**

```ts
import { BadRequestException } from '@nestjs/common';

export const PASSWORD_LOGIN_GENERIC_MESSAGE = '账号或密码错误，或账号暂不可用';

export function normalizeRiderPasswordUsername(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

export function parseRiderPasswordCredentialInput(value: any, hasPassword: boolean) {
  const username = normalizeRiderPasswordUsername(value?.username);
  const userId = String(value?.userId || '').trim();
  const password = String(value?.password || '');
  if (!/^[a-z0-9._-]{4,40}$/.test(username)) throw new BadRequestException('账号需为 4-40 位字母、数字或 ._-');
  if (!userId) throw new BadRequestException('请选择绑定的官方骑手');
  if (!password && !hasPassword) throw new BadRequestException('请设置登录密码');
  if (password && (password.length < 10 || password.length > 64 || !/[A-Za-z]/.test(password) || !/\d/.test(password))) {
    throw new BadRequestException('密码需为 10-64 位并同时包含字母和数字');
  }
  const expiresAt = value?.expiresAt ? new Date(value.expiresAt) : null;
  if (expiresAt && Number.isNaN(expiresAt.getTime())) throw new BadRequestException('失效时间无效');
  return { username, userId, enabled: value?.enabled !== false, expiresAt, ...(password ? { password } : {}) };
}
```

- [ ] **Step 4: Run the contract test and verify GREEN**

Run: `npm --workspace backend test -- --runInBand rider-password-credential.contract.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit the contract**

```bash
git add backend/src/modules/rider-app/rider-password-credential.contract.ts backend/src/modules/rider-app/rider-password-credential.contract.spec.ts
git commit -m "feat(rider-app): validate hidden login credentials"
```

---

### Task 2: Persist one safe credential and expose admin management APIs

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Modify: `backend/prisma/schema.postgresql.prisma`
- Modify: `backend/prisma/schema.mysql.prisma`
- Create: `backend/prisma/migrations/202608110001_rider_password_credential/migration.sql`
- Create: `backend/prisma/additive-migrations/postgresql/202608110001_rider_password_credential.sql`
- Create: `backend/prisma/additive-migrations/mysql/202608110001_rider_password_credential.sql`
- Create: `backend/src/modules/rider-app/rider-password-credential.service.ts`
- Create: `backend/src/modules/rider-app/rider-password-credential.service.spec.ts`
- Modify: `backend/src/modules/rider-app/rider-app.controller.ts`
- Modify: `backend/src/modules/rider-app/rider-app.module.ts`

**Interfaces:**
- Consumes: `parseRiderPasswordCredentialInput` from Task 1.
- Produces: Prisma model `RiderAppPasswordCredential`.
- Produces: `RiderPasswordCredentialService.getSafeConfig()`.
- Produces: `RiderPasswordCredentialService.saveConfig(dto, operatorId, ip)`.
- Produces: `RiderPasswordCredentialService.resetLock(operatorId, ip)`.
- Produces: `RiderPasswordCredentialService.listRiderOptions(keyword)`.
- Consumes: global `RedisService` for deleting only `refresh:rider_password:<credentialId>` when a password session is rotated.

- [ ] **Step 1: Write failing service tests for safe admin behavior**

```ts
it('stores a bcrypt hash and never returns it', async () => {
  prisma.regionRider.findFirst.mockResolvedValue({
    userId: 'user-1', regionId: 'region-1', verifyStatus: 'approved', riderType: 'official',
    User: { id: 'user-1', status: 'ACTIVE', nickname: '测试骑手' },
  });
  prisma.region.findUnique.mockResolvedValue({ id: 'region-1', name: '测试区域' });
  prisma.riderAppPasswordCredential.findFirst.mockResolvedValue(null);
  prisma.riderAppPasswordCredential.create.mockImplementation(({ data }) => ({ id: 'credential-1', ...data }));
  const result = await service.saveConfig({
    username: 'campus.test', password: 'Campus2026!', userId: 'user-1', enabled: true,
  }, 'admin-1', '127.0.0.1');
  expect(prisma.riderAppPasswordCredential.create.mock.calls[0][0].data.passwordHash).toMatch(/^\$2/);
  expect(JSON.stringify(result)).not.toContain('Campus2026!');
  expect(JSON.stringify(result)).not.toContain('passwordHash');
});

it('rejects a user who is not an approved official rider with a region', async () => {
  prisma.regionRider.findFirst.mockResolvedValue(null);
  await expect(service.saveConfig({
    username: 'campus.test', password: 'Campus2026!', userId: 'user-2', enabled: true,
  }, 'admin-1', '127.0.0.1')).rejects.toThrow('官方骑手');
});
```

- [ ] **Step 2: Run the service test and verify RED**

Run: `npm --workspace backend test -- --runInBand rider-password-credential.service.spec.ts`

Expected: FAIL because the service and Prisma model do not exist.

- [ ] **Step 3: Add the Prisma model to all three schema files**

```prisma
model RiderAppPasswordCredential {
  id                String    @id @default(cuid())
  username          String
  normalizedUsername String   @unique
  passwordHash      String
  userId            String    @unique
  enabled           Boolean   @default(true)
  expiresAt         DateTime?
  failedAttempts    Int       @default(0)
  lockedUntil       DateTime?
  sessionVersion    Int       @default(1)
  lastLoginAt       DateTime?
  lastLoginIp       String?
  lastLoginDevice   Json?
  passwordChangedAt DateTime  @default(now())
  createdBy         String?
  updatedBy         String?
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  User User @relation(fields: [userId], references: [id], onDelete: Restrict)

  @@map("rider_app_password_credentials")
}
```

Add `riderAppPasswordCredential RiderAppPasswordCredential?` as the optional reverse relation on `User`, then create matching PostgreSQL canonical/additive SQL and MySQL additive SQL. The table must enforce unique normalized username and unique bound user.

- [ ] **Step 4: Implement safe service operations**

Implement `RiderPasswordCredentialService` with these rules:

```ts
const PASSWORD_ROUNDS = 12;

async saveConfig(dto: any, operatorId?: string, ip?: string) {
  const current = await this.prisma.riderAppPasswordCredential.findFirst();
  const input = parseRiderPasswordCredentialInput(dto, Boolean(current?.passwordHash));
  const rider = await this.prisma.regionRider.findFirst({
    where: { userId: input.userId, verifyStatus: 'approved', riderType: 'official', User: { status: 'ACTIVE' } },
    include: { User: true },
  });
  if (!rider || !String(rider.regionId || '').trim()) throw new BadRequestException('只能绑定已审核且已分配区域的官方骑手');
  const region = await this.prisma.region.findUnique({
    where: { id: rider.regionId },
    select: { id: true, name: true },
  });
  const passwordChanged = Boolean(input.password);
  const passwordHash = passwordChanged ? await bcrypt.hash(input.password!, PASSWORD_ROUNDS) : current!.passwordHash;
  const sessionChanged = !current || Boolean(input.password) || current.userId !== input.userId || current.enabled !== input.enabled;
  const updateData = { ...safeData, passwordHash, ...(passwordChanged ? { passwordChangedAt: new Date() } : {}) };
  const saved = current
    ? await this.prisma.riderAppPasswordCredential.update({
        where: { id: current.id },
        data: { ...updateData, ...(sessionChanged ? { sessionVersion: { increment: 1 } } : {}) },
      })
    : await this.prisma.riderAppPasswordCredential.create({ data: { ...safeData, passwordHash } });
  if (current && sessionChanged) await this.redis.del(`refresh:rider_password:${current.id}`).catch(() => undefined);
  await this.logCredentialChange(operatorId, current ? 'update' : 'create', saved.id, {
    username: saved.username,
    userId: saved.userId,
    enabled: saved.enabled,
    expiresAt: saved.expiresAt,
    passwordChanged,
  }, ip);
  return this.toSafeConfig(saved, rider, region);
}
```

Define `safeData` explicitly from `username`, `normalizedUsername`, `userId`, `enabled`, `expiresAt`, `updatedBy`; never spread the request DTO. `toSafeConfig` returns only `configured`, `username`, `userId`, `enabled`, `expiresAt`, `failedAttempts`, `lockedUntil`, `lastLoginAt`, `lastLoginIp`, a sanitized `lastLoginDevice`, `passwordChangedAt`, and masked rider/region fields.

Write operation logs directly with the repository's existing model; the helper must swallow only log-write failures and must receive pre-sanitized details:

```ts
private async logCredentialChange(accountId: string | undefined, action: string, targetId: string, detail: Record<string, unknown>, ip?: string) {
  if (!accountId) return;
  try {
    await this.prisma.adminOperationLog.create({
      data: {
        accountId,
        action: `rider_password_${action}`,
        module: 'rider_app',
        targetId,
        targetType: 'rider_password_credential',
        detail,
        ip: ip || '',
      },
    });
  } catch { /* operation-log failure must not expose or roll back the credential change */ }
}
```

`resetLock` records only the credential ID and reset action. Its response and log must not contain `password`, `passwordHash`, raw request bodies, or full rider phone numbers.

- [ ] **Step 5: Add guarded admin routes**

Add these routes to `RiderAppController`, each guarded with `JwtGuard`, `AdminGuard`, `AdminPermissionGuard`, and `@RequirePermission('rider-app:config')`:

```ts
@Get('admin/rider-app/password-login')
getPasswordLoginConfig() { return this.credentialService.getSafeConfig(); }

@Put('admin/rider-app/password-login')
savePasswordLoginConfig(@Body() dto: any, @CurrentUser('sub') adminId: string, @Req() req: Request) {
  return this.credentialService.saveConfig(dto, adminId, this.clientIp(req));
}

@Post('admin/rider-app/password-login/reset-lock')
resetPasswordLoginLock(@CurrentUser('sub') adminId: string, @Req() req: Request) {
  return this.credentialService.resetLock(adminId, this.clientIp(req));
}

@Get('admin/rider-app/password-login/rider-options')
listPasswordLoginRiders(@Query('keyword') keyword?: string) {
  return this.credentialService.listRiderOptions(keyword);
}
```

- [ ] **Step 6: Sync schemas, generate Prisma client, and run tests**

Run:

```bash
npm --workspace backend run db:sync-schemas
npm --workspace backend run db:generate
npm --workspace backend test -- --runInBand rider-password-credential.service.spec.ts rider-password-credential.contract.spec.ts
```

Expected: schema variants report synchronized, Prisma generation succeeds, and tests PASS.

- [ ] **Step 7: Commit persistence and admin APIs**

```bash
git add backend/prisma backend/src/modules/rider-app
git commit -m "feat(rider-app): manage hidden password credential"
```

---

### Task 3: Issue revocable full-rider tokens and protect HTTP, refresh, and WebSocket paths

**Files:**
- Create: `backend/src/common/auth/rider-password-token.util.ts`
- Create: `backend/src/common/auth/rider-password-token.util.spec.ts`
- Modify: `backend/src/modules/auth/auth.service.ts`
- Modify: `backend/src/modules/rider-app/rider-password-credential.service.ts`
- Modify: `backend/src/modules/rider-app/rider-app.service.ts`
- Modify: `backend/src/modules/rider-app/rider-app.controller.ts`
- Modify: `backend/src/guards/jwt.guard.ts`
- Modify: `backend/src/guards/jwt.guard.spec.ts`
- Modify: `backend/src/modules/websocket/ws-native.gateway.ts`
- Modify: `backend/src/modules/websocket/ws-native.gateway.spec.ts`
- Modify: `backend/src/modules/rider-app/rider-app.service.spec.ts`
- Modify: `backend/src/modules/rider-app/rider-app.controller.spec.ts`

**Interfaces:**
- Consumes: `RiderAppPasswordCredential` from Task 2.
- Produces: `assertRiderPasswordTokenActive(prisma, payload): Promise<void>`.
- Produces: `AuthService.issueActiveUserTokens(userId, openid, extraClaims, refreshKey)`.
- Produces: `RiderAppService.loginPassword(dto, ip, ua)`.
- Produces: `POST /rider-app/login/password`.

- [ ] **Step 1: Write failing token-revocation tests**

```ts
it('accepts ordinary SMS tokens without a credential lookup', async () => {
  await expect(assertRiderPasswordTokenActive(prisma, { sub: 'user-1', isAdmin: false })).resolves.toBeUndefined();
  expect(prisma.riderAppPasswordCredential.findUnique).not.toHaveBeenCalled();
});

it('rejects a rotated password credential token', async () => {
  prisma.riderAppPasswordCredential.findUnique.mockResolvedValue({
    id: 'credential-1', userId: 'user-1', enabled: true, expiresAt: null, sessionVersion: 3,
  });
  await expect(assertRiderPasswordTokenActive(prisma, {
    sub: 'user-1', authSource: 'rider_password', credentialId: 'credential-1', credentialVersion: 2,
  })).rejects.toThrow('登录状态已失效');
});
```

Add service tests for correct login, generic wrong-password errors, five-failure lockout, successful reset, and rejection of disabled/expired/unqualified bindings. Add guard and WebSocket tests proving the shared validator runs before protected access.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
npm --workspace backend test -- --runInBand rider-password-token.util.spec.ts rider-app.service.spec.ts jwt.guard.spec.ts ws-native.gateway.spec.ts
```

Expected: FAIL because password token claims and login behavior are absent.

- [ ] **Step 3: Implement the shared token validator**

```ts
export async function assertRiderPasswordTokenActive(prisma: PrismaService, payload: any) {
  if (payload?.authSource !== 'rider_password') return;
  const credential = await prisma.riderAppPasswordCredential.findUnique({ where: { id: String(payload.credentialId || '') } });
  if (
    !credential || !credential.enabled || credential.userId !== payload.sub
    || credential.sessionVersion !== Number(payload.credentialVersion)
    || (credential.expiresAt && credential.expiresAt.getTime() <= Date.now())
  ) throw new UnauthorizedException('登录状态已失效，请重新登录');
}
```

Call it from `JwtGuard.canActivate`, `AuthService.refreshToken`, and `WsNativeGateway.handleConnection` immediately after JWT verification. A token with `authSource=rider_password` but missing either credential claim must fail closed.

- [ ] **Step 4: Extend token generation without changing SMS tokens**

Change token generation to merge only explicitly supplied extra claims:

```ts
async issueActiveUserTokens(userId: string, openid: string, extraClaims: Record<string, unknown>, refreshKey: string) {
  return this.generateTokens(userId, openid, extraClaims, refreshKey);
}

private async generateTokens(userId: string, openid: string, extraClaims: Record<string, unknown> = {}, refreshKey = `refresh:${userId}`) {
  await this.assertActiveUser(userId);
  const payload = { sub: userId, openid, isAdmin: false, ...extraClaims };
  // sign access and refresh, then store under the supplied exact key
}
```

All existing SMS callers continue using the default `refresh:<userId>` key and unchanged claims. Password login passes `refresh:rider_password:<credentialId>`. In `refreshToken`, derive that same key only when `authSource === 'rider_password'`, validate the credential before reading Redis, and preserve `authSource`, `credentialId`, and `credentialVersion` in the replacement pair. Ordinary refresh tokens continue reading and writing `refresh:<userId>`.

- [ ] **Step 5: Implement password verification, lockout, and session response**

Use one valid fixed dummy bcrypt hash when no credential exists. For a known credential, atomically increment `failedAttempts`, read back the new count, and set `lockedUntil = now + 15 minutes` when the new count reaches 5. Do not mutate a real credential for unknown usernames. Use `PASSWORD_LOGIN_GENERIC_MESSAGE` for all public failures.

On success:

```ts
const tokens = await this.authService.issueActiveUserTokens(user.id, user.openid, {
  authSource: 'rider_password',
  credentialId: credential.id,
  credentialVersion: credential.sessionVersion,
}, `refresh:rider_password:${credential.id}`);
await this.prisma.riderAppPasswordCredential.update({
  where: { id: credential.id },
  data: {
    failedAttempts: 0,
    lockedUntil: null,
    lastLoginAt: new Date(),
    lastLoginIp: ip,
    lastLoginDevice: sanitizeDeviceSummary(dto.device, ua),
  },
});
return { ...tokens, ...(await this.buildSession(user.id)) };
```

- [ ] **Step 6: Add the throttled public login route**

```ts
@Post('rider-app/login/password')
@UseGuards(ThrottlerGuard)
@Throttle({ auth: { ttl: 60000, limit: 5 } })
loginPassword(@Body() dto: { username?: string; password?: string; device?: Record<string, unknown> }, @Req() req: Request) {
  return this.riderAppService.loginPassword(dto, this.clientIp(req), String(req.headers['user-agent'] || ''));
}
```

- [ ] **Step 7: Run focused security tests and the full backend suite**

Run:

```bash
npm --workspace backend test -- --runInBand rider-password-token.util.spec.ts rider-password-credential.service.spec.ts rider-app.service.spec.ts rider-app.controller.spec.ts jwt.guard.spec.ts ws-native.gateway.spec.ts
npm --workspace backend test -- --runInBand
```

Expected: focused tests and all backend suites PASS; existing SMS login tests remain unchanged.

- [ ] **Step 8: Commit password login and revocation**

```bash
git add backend/src/common/auth backend/src/modules/auth backend/src/modules/rider-app backend/src/guards backend/src/modules/websocket
git commit -m "feat(rider-app): authenticate hidden test accounts"
```

---

### Task 4: Add safe credential controls to the admin Rider App center

**Files:**
- Create: `admin/src/views/system/riderPasswordCredentialModel.mjs`
- Create: `admin/src/views/system/riderPasswordCredentialModel.test.mjs`
- Modify: `admin/src/views/system/RiderAppControl.vue`

**Interfaces:**
- Consumes: Task 2 admin endpoints.
- Produces: `mapRiderPasswordCredential(value)` safe view model.
- Produces: `buildRiderPasswordCredentialPayload(form)` request payload that omits blank passwords.

- [ ] **Step 1: Write failing admin model tests**

```js
test('never maps passwordHash from an admin response', () => {
  const result = model.mapRiderPasswordCredential({
    configured: true, username: 'campus.test', passwordHash: 'secret-hash', password: 'secret', enabled: true,
  })
  assert.equal(result.username, 'campus.test')
  assert.equal('passwordHash' in result, false)
  assert.equal('password' in result, false)
})

test('omits a blank password when saving existing configuration', () => {
  assert.deepEqual(model.buildRiderPasswordCredentialPayload({
    username: 'campus.test', password: '', userId: 'user-1', enabled: true, expiresAt: '',
  }), { username: 'campus.test', userId: 'user-1', enabled: true, expiresAt: null })
})
```

- [ ] **Step 2: Run the model test and verify RED**

Run: `node --test admin/src/views/system/riderPasswordCredentialModel.test.mjs`

Expected: FAIL because the model file does not exist.

- [ ] **Step 3: Implement the pure model helper**

Implement only safe keys and ensure `password` is included when non-empty, never `passwordHash`.

- [ ] **Step 4: Add the “隐藏测试登录” admin card**

Extend `RiderAppControl.vue` with:

- an enabled switch;
- remote official-rider selector using `/admin/rider-app/password-login/rider-options`;
- username input;
- password input with “留空表示不修改” after initial configuration;
- optional expiry date/time;
- safe status fields for bound region, last login, failed attempts, and lock time;
- “保存测试账号” and “解除锁定” buttons;
- a warning that this credential grants complete official rider App capability.

Use separate `credentialLoading` and `credentialSaving` state so saving normal App control configuration cannot accidentally overwrite the credential.

- [ ] **Step 5: Run admin tests, typecheck, and build**

Run:

```bash
node --test admin/src/views/system/riderPasswordCredentialModel.test.mjs
npm --workspace admin run typecheck
npm --workspace admin run build
```

Expected: model tests PASS, Vue typecheck PASS, and Vite build completes. Existing chunk-size warnings are non-blocking.

- [ ] **Step 6: Commit the admin control**

```bash
git add admin/src/views/system/RiderAppControl.vue admin/src/views/system/riderPasswordCredentialModel.mjs admin/src/views/system/riderPasswordCredentialModel.test.mjs
git commit -m "feat(admin): configure rider test login"
```

---

### Task 5: Reveal and use the hidden login in the standalone rider App

**Files:**
- Create: `/Users/nianbaidediannao/Desktop/骑手端app/api/hidden-login-trigger.js`
- Create: `/Users/nianbaidediannao/Desktop/骑手端app/tests/hidden-login-trigger.test.mjs`
- Modify: `/Users/nianbaidediannao/Desktop/骑手端app/api/rider.js`
- Modify: `/Users/nianbaidediannao/Desktop/骑手端app/pages/login/login.vue`
- Create: `/Users/nianbaidediannao/Desktop/骑手端app/tests/rider-password-login.test.mjs`

**Interfaces:**
- Produces: `createHiddenLoginTrigger({ taps = 10, windowMs = 5000 })` with `tap(now): boolean` and `reset()`.
- Produces: `loginByPassword(data)` calling `POST /rider-app/login/password`.
- Consumes: existing `setAuthTokens`, `handleLoginResult`, App control startup checks, and full workbench route.

- [ ] **Step 1: Confirm the rider backup before editing**

Verify the existing recoverable backup:

```bash
test -d '/Users/nianbaidediannao/Desktop/骑手端app备份/20260810-campus-collection-before'
```

Create a new scoped backup only if one for this feature does not exist, excluding `node_modules` and `unpackage`:

```bash
mkdir -p '/Users/nianbaidediannao/Desktop/骑手端app备份/20260811-hidden-login-before'
rsync -a --exclude node_modules --exclude unpackage '/Users/nianbaidediannao/Desktop/骑手端app/' '/Users/nianbaidediannao/Desktop/骑手端app备份/20260811-hidden-login-before/'
```

- [ ] **Step 2: Write failing tap-window and API-route tests**

```js
test('reveals only after ten taps inside five seconds', () => {
  const trigger = createHiddenLoginTrigger({ taps: 10, windowMs: 5000 })
  for (let index = 0; index < 9; index += 1) assert.equal(trigger.tap(index * 400), false)
  assert.equal(trigger.tap(3600), true)
})

test('resets when the tap window expires', () => {
  const trigger = createHiddenLoginTrigger({ taps: 10, windowMs: 5000 })
  for (let index = 0; index < 9; index += 1) trigger.tap(index * 400)
  assert.equal(trigger.tap(9000), false)
})
```

Extend the API test to assert `loginByPassword` calls exactly `/rider-app/login/password` with `POST`, and does not touch SMS or mini-program routes.

- [ ] **Step 3: Run rider tests and verify RED**

Run: `npm --prefix '/Users/nianbaidediannao/Desktop/骑手端app' test`

Expected: FAIL because the trigger and password API method are missing.

- [ ] **Step 4: Implement the pure trigger and password API method**

```js
export function createHiddenLoginTrigger({ taps = 10, windowMs = 5000 } = {}) {
  let firstTapAt = null
  let count = 0
  return {
    tap(now = Date.now()) {
      if (firstTapAt === null || now - firstTapAt > windowMs) { firstTapAt = now; count = 0 }
      count += 1
      if (count < taps) return false
      firstTapAt = null; count = 0; return true
    },
    reset() { firstTapAt = null; count = 0 },
  }
}
```

```js
export function loginByPassword(data) {
  return request('/rider-app/login/password', { method: 'POST', data })
}
```

- [ ] **Step 5: Add the hidden login card to `login.vue`**

- Bind `@tap="handleLogoTap"` to the existing brand Logo.
- Create one module trigger with 10 taps/5000 ms.
- Show a separate card with username/password only after the trigger returns true.
- Submit `device: uni.getSystemInfoSync()` through `loginByPassword`.
- Pass the successful response to existing `handleLoginResult`; do not add a second token store or workbench.
- Clear `password` on failure, card close, `onUnload`, and success.
- Do not persist username or password to UniApp storage.
- Keep `bootstrap()` and App control checks ahead of both login methods.

- [ ] **Step 6: Run the full rider test suite**

Run: `npm --prefix '/Users/nianbaidediannao/Desktop/骑手端app' test`

Expected: all tests PASS, including hidden tap behavior, exact login route, campus collection, delivery tracking, and token refresh tests.

- [ ] **Step 7: Compare rider source to the scoped backup**

Run:

```bash
diff -qr '/Users/nianbaidediannao/Desktop/骑手端app备份/20260811-hidden-login-before' '/Users/nianbaidediannao/Desktop/骑手端app' --exclude=node_modules --exclude=unpackage --exclude=.DS_Store || true
```

Expected: only the planned trigger, rider API, login page, and tests differ in addition to pre-existing campus collection work.

---

### Task 6: Complete cross-stack verification and device acceptance documentation

**Files:**
- Modify: `docs/campus-map/2026-08-10-rider-collection-device-acceptance.md`

**Interfaces:**
- Consumes: all backend/admin/rider deliverables from Tasks 1-5.
- Produces: auditable local verification results and real-device steps; does not claim deployment or device acceptance.

- [ ] **Step 1: Add hidden-login device checks to the acceptance document**

Add checkboxes for:

- Logo tap threshold and timeout;
- successful full-rider login;
- wrong-password lockout;
- admin unlock;
- immediate rejection after disable/password reset;
- SMS login unaffected;
- bound rider sees only assigned campus collection tasks;
- no password in App storage, network logs, admin response, or operation log.

- [ ] **Step 2: Run final backend verification**

Run:

```bash
npm --workspace backend run db:sync-schemas
npm --workspace backend run db:generate
npm --workspace backend test -- --runInBand
npm --workspace backend run build
```

Expected: schema variants synchronized, Prisma generated, all Jest suites PASS, and production build exits 0.

- [ ] **Step 3: Run final admin verification**

Run:

```bash
node --test admin/src/views/system/riderPasswordCredentialModel.test.mjs
npm --workspace admin run typecheck
npm --workspace admin run build
```

Expected: model tests, typecheck, and production build PASS.

- [ ] **Step 4: Run final rider verification**

Run: `npm --prefix '/Users/nianbaidediannao/Desktop/骑手端app' test`

Expected: every rider test PASS.

- [ ] **Step 5: Verify secrets and diff hygiene**

Run:

```bash
rg -n "Campus2026|ValidPassword123" backend/src admin/src /Users/nianbaidediannao/Desktop/骑手端app -g '!*.spec.ts' -g '!*.test.mjs' -g '!node_modules' -g '!unpackage'
rg -n "passwordHash" admin/src /Users/nianbaidediannao/Desktop/骑手端app -g '!*.test.mjs' -g '!node_modules' -g '!unpackage'
git diff --check
git status --short
```

Expected: no fixture/real password values in production code, no password hash handling in admin/rider production code, no whitespace errors, and only intentional changes remain. Backend tests additionally assert that controller/service responses and `AdminOperationLog.detail` never include `password` or `passwordHash`.

- [ ] **Step 6: Commit verification documentation**

```bash
git add docs/campus-map/2026-08-10-rider-collection-device-acceptance.md
git commit -m "docs: add hidden rider login acceptance"
```

- [ ] **Step 7: Record honest acceptance boundary**

Report local test/build evidence separately from deployment and real-device evidence. A fresh Android package and backend migration deployment are still required before claiming the hidden login works on the user's phone.
