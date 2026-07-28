# Rider Income, Settlement, Withdrawal and Appeal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give approved official riders a real income center backed by the existing settlement, wallet, withdrawal and finance-admin workflows.

**Architecture:** Add rider-owned read/write methods around the existing `FinanceService` and `FinanceAdminService`; do not create another ledger. Store one appeal directly on each `RiderSettlement`, expose controlled rider routes, and extend the existing finance admin screen to process appeals without automatically changing money.

**Tech Stack:** UniApp Vue 2, Node test runner, NestJS, Prisma, Jest, Vue 3, Element Plus.

## Global Constraints

- The only money chain is `RiderSettlement -> Wallet -> Withdraw`.
- Appeal processing never adds, deducts, refunds or transfers money automatically.
- Every rider route requires login, approved official-rider status, a bound region and the remote `features.income` switch.
- A rider can only access their own settlements, wallet transactions, withdrawals and appeals.
- Pagination defaults to 20 and is capped at 50.
- PostgreSQL, MySQL and regular Prisma schemas remain synchronized; migrations are created but never applied to production.
- Preserve all unrelated dirty files in the backend/admin checkout.
- Use Node `22.22.2`; add no dependency.

---

### Task 1: Rider-owned income, wallet and withdrawal APIs

**Files:**
- Modify: `backend/src/modules/finance/finance.service.spec.ts`
- Modify: `backend/src/modules/finance/finance.service.ts`
- Modify: `backend/src/modules/finance-admin/finance-admin.service.spec.ts`
- Modify: `backend/src/modules/finance-admin/finance-admin.service.ts`
- Modify: `backend/src/modules/rider-app/rider-app.service.spec.ts`
- Modify: `backend/src/modules/rider-app/rider-app.controller.spec.ts`
- Modify: `backend/src/modules/rider-app/rider-app.service.ts`
- Modify: `backend/src/modules/rider-app/rider-app.controller.ts`
- Modify: `backend/src/modules/rider-app/rider-app.module.ts`

**Interfaces:**
- Consumes: `FinanceService.getWallet(userId)`, `FinanceService.transactions(userId, query)`, `FinanceService.withdraw(userId, dto)`, and the existing settlement earning calculation.
- Produces: `FinanceService.withdrawals(userId, query)`, `FinanceAdminService.getRiderIncomeOverview(riderId)`, `FinanceAdminService.getRiderSettlementsForRider(riderId, query)`, `FinanceAdminService.getRiderSettlementForRider(riderId, id)`, plus seven `/rider-app` handlers used by the App.

- [ ] **Step 1: Write failing finance and rider service tests**

Add behavior tests using literal expected values:

```ts
it('lists only the current user withdrawals with bounded pagination', async () => {
  prisma.withdraw.findMany.mockResolvedValue([{ id: 'wd-1', userId: 'rider-1', amount: 12.5 }]);
  prisma.withdraw.count.mockResolvedValue(1);
  await expect(service.withdrawals('rider-1', { page: 1, pageSize: 100 } as any)).resolves.toEqual({
    list: [expect.objectContaining({ id: 'wd-1', amount: 12.5 })], total: 1, page: 1, pageSize: 50,
  });
  expect(prisma.withdraw.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: { userId: 'rider-1' }, take: 50,
  }));
});

it('returns wallet, earned, pending and withdrawing amounts for one rider', async () => {
  // The fixture contains one 8.50 delivery today, one earlier 12.00 delivery this month,
  // one uncovered 5.00 order, wallet 20.00/3.00 and a 3.00 processing withdrawal.
  await expect(service.getRiderIncomeOverview('rider-1')).resolves.toEqual({
    today_income: 8.5,
    month_income: 20.5,
    pending_settlement: 5,
    withdrawing: 3,
  });
});

it('blocks income APIs when the remote income feature is disabled', async () => {
  systemConfig.getRiderAppControlConfig.mockResolvedValue({ data: { features: { income: false } } });
  await expect(service.getIncomeOverview('rider-1')).rejects.toThrow('收入功能暂未开放');
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
npm --workspace backend test -- --runInBand src/modules/finance/finance.service.spec.ts src/modules/finance-admin/finance-admin.service.spec.ts src/modules/rider-app/rider-app.service.spec.ts src/modules/rider-app/rider-app.controller.spec.ts
```

Expected: failures name the absent `withdrawals`, rider income methods and controller handlers.

- [ ] **Step 3: Implement the minimal shared finance methods**

Add bounded user-owned withdrawal listing:

```ts
async withdrawals(userId: string, query: QueryDto) {
  const page = Math.max(1, Number(query?.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(query?.pageSize) || 20));
  const where = { userId };
  const [list, total] = await Promise.all([
    this.prisma.withdraw.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { createdAt: 'desc' } }),
    this.prisma.withdraw.count({ where }),
  ]);
  return { list: list.map(item => ({ ...item, amount: Number(item.amount) })), total, page, pageSize };
}
```

Make the existing earning helper callable inside `FinanceAdminService`, then add rider-owned overview/list/detail methods. Derive today and month boundaries in `Asia/Shanghai`, use `includeCovered: true` for earned totals, and use `includeCovered: false` from epoch to now for pending orders. Settlement list/detail queries always include `riderId` in the database `where` clause; detail returns `NotFoundException` for another rider's ID.

In `RiderAppService`, add `requireIncomeAccess(userId)` that first calls `requireOfficialRider`, then rejects when `config.data.features.income === false`. Each income/settlement/withdrawal method calls this guard before delegating. Import `FinanceModule` and `FinanceAdminModule` in `RiderAppModule`.

Register these JWT-protected controller routes with the exact service calls:

```ts
@Get('rider-app/income/overview') getIncomeOverview(@CurrentUser('sub') id: string)
@Get('rider-app/income/transactions') getIncomeTransactions(@CurrentUser('sub') id: string, @Query() q: any)
@Get('rider-app/settlements') getSettlements(@CurrentUser('sub') id: string, @Query() q: any)
@Get('rider-app/settlements/:id') getSettlement(@CurrentUser('sub') id: string, @Param('id') settlementId: string)
@Get('rider-app/withdrawals') getWithdrawals(@CurrentUser('sub') id: string, @Query() q: any)
@Post('rider-app/withdrawals') createWithdrawal(@CurrentUser('sub') id: string, @Body() dto: any)
```

The overview merges wallet fields from `FinanceService.getWallet()` with the four numeric finance-admin fields and returns snake_case keys.

- [ ] **Step 4: Run tests and verify GREEN**

Run the command from Step 2. Expected: all four suites pass with zero failures.

- [ ] **Step 5: Commit only Task 1 files**

```bash
git add backend/src/modules/finance backend/src/modules/finance-admin/finance-admin.service.ts backend/src/modules/finance-admin/finance-admin.service.spec.ts backend/src/modules/rider-app
git diff --cached --check
git commit -m "feat: add rider income and withdrawal APIs"
```

---

### Task 2: Idempotent rider settlement appeal

**Files:**
- Modify: `backend/src/modules/finance-admin/finance-admin.service.spec.ts`
- Modify: `backend/src/modules/finance-admin/finance-admin.service.ts`
- Modify: `backend/src/modules/rider-app/rider-app.service.spec.ts`
- Modify: `backend/src/modules/rider-app/rider-app.controller.spec.ts`
- Modify: `backend/src/modules/rider-app/rider-app.service.ts`
- Modify: `backend/src/modules/rider-app/rider-app.controller.ts`
- Modify: `backend/prisma/schema.prisma`
- Modify: `backend/prisma/schema.postgresql.prisma`
- Modify: `backend/prisma/schema.mysql.prisma`
- Create: `backend/prisma/migrations/202607280003_rider_settlement_appeals/migration.sql`
- Create: `backend/prisma/migrations/202607280003_rider_settlement_appeals/migration.mysql.sql`

**Interfaces:**
- Consumes: the rider ownership guard from Task 1.
- Produces: `FinanceAdminService.submitRiderSettlementAppeal(riderId, settlementId, dto)` and `POST /rider-app/settlements/:id/appeal`.

- [ ] **Step 1: Write failing appeal tests**

```ts
it('creates one appeal only on the current rider settlement', async () => {
  prisma.riderSettlement.findFirst.mockResolvedValue({ id: 'set-1', riderId: 'rider-1', appealStatus: null });
  prisma.riderSettlement.updateMany.mockResolvedValue({ count: 1 });
  prisma.riderSettlement.findFirst.mockResolvedValueOnce({ id: 'set-1', riderId: 'rider-1', appealStatus: null })
    .mockResolvedValueOnce({ id: 'set-1', appealStatus: 'pending', appealReason: '配送费少算五元' });
  await expect(service.submitRiderSettlementAppeal('rider-1', 'set-1', {
    reason: '配送费少算五元', images: ['https://cdn.example/a.jpg'],
  })).resolves.toEqual(expect.objectContaining({ appealStatus: 'pending' }));
  expect(prisma.riderSettlement.updateMany).toHaveBeenCalledWith(expect.objectContaining({
    where: { id: 'set-1', riderId: 'rider-1', appealStatus: null },
  }));
});

it('returns the existing appeal after a weak-network duplicate submit', async () => {
  prisma.riderSettlement.findFirst.mockResolvedValue({ id: 'set-1', riderId: 'rider-1', appealStatus: 'pending' });
  await expect(service.submitRiderSettlementAppeal('rider-1', 'set-1', { reason: '重复请求文本' }))
    .resolves.toEqual(expect.objectContaining({ appealStatus: 'pending', duplicate: true }));
  expect(prisma.riderSettlement.updateMany).not.toHaveBeenCalled();
});
```

Also test: another rider receives `NotFoundException`; reason outside 5-500 characters is rejected; more than three non-empty images is rejected.

- [ ] **Step 2: Run appeal tests and verify RED**

Run:

```bash
npm --workspace backend test -- --runInBand src/modules/finance-admin/finance-admin.service.spec.ts src/modules/rider-app/rider-app.service.spec.ts src/modules/rider-app/rider-app.controller.spec.ts
```

Expected: failure because the appeal method and route do not exist.

- [ ] **Step 3: Add schema fields and additive migrations**

Add identical Prisma fields to all three schemas:

```prisma
appealStatus    String?
appealReason    String?
appealImages    Json?
appealReply     String?
appealedAt      DateTime?
appealHandledAt DateTime?
appealHandlerId String?

@@index([appealStatus, createdAt])
```

PostgreSQL migration:

```sql
ALTER TABLE "rider_settlements"
  ADD COLUMN "appealStatus" TEXT,
  ADD COLUMN "appealReason" TEXT,
  ADD COLUMN "appealImages" JSONB,
  ADD COLUMN "appealReply" TEXT,
  ADD COLUMN "appealedAt" TIMESTAMP(3),
  ADD COLUMN "appealHandledAt" TIMESTAMP(3),
  ADD COLUMN "appealHandlerId" TEXT;
CREATE INDEX "rider_settlements_appealStatus_createdAt_idx"
  ON "rider_settlements"("appealStatus", "createdAt");
```

The MySQL companion uses `VARCHAR(32)`, `TEXT`, `JSON`, `DATETIME(3)` and the same index columns.

- [ ] **Step 4: Implement validation and conditional update**

Normalize `reason`, cap it at 500 characters, keep at most three non-empty string URLs, and use:

```ts
await this.prisma.riderSettlement.updateMany({
  where: { id: settlementId, riderId, appealStatus: null },
  data: { appealStatus: 'pending', appealReason: reason, appealImages: images, appealedAt: new Date() },
});
```

If a current rider-owned settlement already has `appealStatus`, return it with `duplicate: true`. Register `POST /rider-app/settlements/:id/appeal`; it passes the authenticated rider ID and never accepts a rider ID from the request body.

- [ ] **Step 5: Generate Prisma client and verify GREEN**

```bash
npm --workspace backend run db:generate
npm --workspace backend test -- --runInBand src/modules/finance-admin/finance-admin.service.spec.ts src/modules/rider-app/rider-app.service.spec.ts src/modules/rider-app/rider-app.controller.spec.ts
```

Expected: schema generation and all targeted suites pass.

- [ ] **Step 6: Commit only Task 2 files**

```bash
git add backend/prisma backend/src/modules/finance-admin/finance-admin.service.ts backend/src/modules/finance-admin/finance-admin.service.spec.ts backend/src/modules/rider-app
git diff --cached --check
git commit -m "feat: add rider settlement appeals"
```

---

### Task 3: Finance-admin appeal handling

**Files:**
- Modify: `backend/src/modules/finance-admin/finance-admin.service.spec.ts`
- Modify: `backend/src/modules/finance-admin/finance-admin.service.ts`
- Modify: `backend/src/modules/finance-admin/finance-admin.controller.ts`
- Modify: `admin/src/views/finance/RiderSettle.vue`

**Interfaces:**
- Consumes: appeal fields from Task 2 and existing `finance:settlement` permission/region-scope enforcement.
- Produces: `FinanceAdminService.handleRiderSettlementAppeal(id, dto, operatorId, ip)` and `PUT /admin/rider-settlements/:id/appeal`.

- [ ] **Step 1: Write failing admin workflow tests**

```ts
it('moves a pending appeal to processing and writes an operation log', async () => {
  prisma.riderSettlement.findUnique.mockResolvedValue({ id: 'set-1', regionId: 'region-1', appealStatus: 'pending' });
  prisma.riderSettlement.updateMany.mockResolvedValue({ count: 1 });
  await service.handleRiderSettlementAppeal('set-1', { status: 'processing' }, 'admin-1', '127.0.0.1');
  expect(prisma.riderSettlement.updateMany).toHaveBeenCalledWith(expect.objectContaining({
    where: { id: 'set-1', appealStatus: 'pending' }, data: expect.objectContaining({ appealStatus: 'processing' }),
  }));
  expect(prisma.adminOperationLog.create).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ action: 'handle_rider_settlement_appeal', targetId: 'set-1' }),
  }));
});
```

Also test: `resolved` and `rejected` require a 2-500 character reply; a terminal appeal cannot transition again; region access is checked before update; `getRiderSettlements` honors `appealStatus` filter.

- [ ] **Step 2: Run admin tests and verify RED**

```bash
npm --workspace backend test -- --runInBand src/modules/finance-admin/finance-admin.service.spec.ts
```

Expected: missing handler/filter failures.

- [ ] **Step 3: Implement the backend state transition**

Accept only these transitions:

```ts
const transitions = {
  pending: ['processing', 'resolved', 'rejected'],
  processing: ['resolved', 'rejected'],
} as const;
```

For terminal states write `appealReply`, `appealHandledAt`, and `appealHandlerId`; for processing write only the new status and handler ID. Use `updateMany` with both the ID and previous status, call `assertRiderSettlementAccess`, and append `AdminOperationLog`. The new controller route uses `@RequirePermission('finance:settlement')`.

- [ ] **Step 4: Extend the existing RiderSettle screen**

Add an appeal-status filter, a visible tag in the settlement table, an appeal block in the existing detail drawer, proof-image previews, and three actions:

```ts
await request.put(`/admin/rider-settlements/${detail.value.id}/appeal`, { status: 'processing' })
await request.put(`/admin/rider-settlements/${detail.value.id}/appeal`, { status: 'resolved', reply })
await request.put(`/admin/rider-settlements/${detail.value.id}/appeal`, { status: 'rejected', reply })
```

When `appealStatus` is `pending` or `processing`, the confirm/pay dialog text must explicitly say an appeal is unfinished; it remains a human confirmation and does not bypass the backend settlement state machine.

- [ ] **Step 5: Verify backend and admin GREEN**

```bash
npm --workspace backend test -- --runInBand src/modules/finance-admin/finance-admin.service.spec.ts
npm run typecheck:admin
npm run build:admin
```

Expected: zero test/type errors and a successful Vite production build.

- [ ] **Step 6: Commit only Task 3 files**

```bash
git add backend/src/modules/finance-admin admin/src/views/finance/RiderSettle.vue
git diff --cached --check
git commit -m "feat: add rider appeal handling to finance admin"
```

---

### Task 4: UniApp income center and entry points

**Files:**
- Create: `骑手端app/tests/income.test.mjs`
- Create: `骑手端app/api/income.js`
- Create: `骑手端app/pages/income/income.vue`
- Modify: `骑手端app/pages.json`
- Modify: `骑手端app/pages/profile/profile.vue`
- Modify: `骑手端app/pages/workbench/workbench.vue`

**Interfaces:**
- Consumes: Task 1 and Task 2 `/rider-app` routes, existing `request`, `uploadFile`, and `isRiderFeatureEnabled('income')`.
- Produces: API wrappers, `validateWithdrawalInput`, `validateAppealInput`, and the `/pages/income/income` page.

- [ ] **Step 1: Write failing App contract and validation tests**

```js
test('validates withdrawal amount, channel and account before submission', () => {
  assert.equal(validateWithdrawalInput({ amount: 0, channel: 'WX_PAY', account: 'wx' }), '请输入正确的提现金额')
  assert.equal(validateWithdrawalInput({ amount: 10, channel: '', account: 'wx' }), '请选择提现渠道')
  assert.equal(validateWithdrawalInput({ amount: 10, channel: 'WX_PAY', account: '' }), '请填写收款账号')
  assert.equal(validateWithdrawalInput({ amount: 10, channel: 'WX_PAY', account: 'wx' }), '')
})

test('validates one settlement appeal with at most three images', () => {
  assert.equal(validateAppealInput({ reason: '短', images: [] }), '申诉说明需填写 5-500 个字')
  assert.equal(validateAppealInput({ reason: '配送费金额计算有误', images: ['1', '2', '3', '4'] }), '最多上传 3 张凭证')
  assert.equal(validateAppealInput({ reason: '配送费金额计算有误', images: ['1'] }), '')
})
```

Use a stubbed `globalThis.uni.request` to assert that overview, transaction, settlement, withdrawal and appeal wrappers call the exact `/rider-app/...` routes and preserve the authenticated request helper.

- [ ] **Step 2: Run App tests and verify RED**

```bash
npm test
```

Expected: `api/income.js` is absent or its exports/routes are missing.

- [ ] **Step 3: Implement the API wrappers and validators**

Export:

```js
getIncomeOverview()
getIncomeTransactions(params)
getRiderSettlements(params)
getRiderSettlement(id)
getWithdrawals(params)
createWithdrawal(data)
createSettlementAppeal(id, data)
validateWithdrawalInput(data)
validateAppealInput(data)
```

Each wrapper calls the exact route from Tasks 1-2 through the existing `request` helper; no new HTTP client is introduced.

- [ ] **Step 4: Build the income center page**

The page renders:

- overview cards for `balance`, `freeze`, `today_income`, `month_income`, `pending_settlement`, and `withdrawing`;
- tabs for settlement records, wallet transactions and withdrawal records;
- a settlement detail popup with order items and existing appeal status/reply;
- a withdrawal form for amount, `WX_PAY`/`ALI_PAY`, account and real name;
- an appeal form with reason and up to three uploaded images.

Use independent loading/error state for overview and lists. Disable withdrawal/appeal submit buttons while awaiting a response, retain form values on failure, refresh affected data on success, and show “收入功能暂未开放” when `isRiderFeatureEnabled('income')` is false.

- [ ] **Step 5: Register and expose the page**

Add `{ "path": "pages/income/income", "style": { "navigationBarTitleText": "收入与结算" } }` to `pages.json`. Change the workbench balance card and profile “收入与结算” row to navigate to it only when the income feature is enabled; remove the profile's fake `stats.today_income/month_income` display so the API is the only amount source.

- [ ] **Step 6: Verify App GREEN**

```bash
npm test
```

Expected: all Node tests pass. Then run the HBuilderX CLI compile for Android and iOS targets if the installed CLI supports this project; otherwise record signed real-device compilation as an open acceptance gate without claiming it passed.

---

### Task 5: Integrated verification and clean handoff

**Files:** No new production files; inspect only intended diffs and generated Prisma client state.

**Interfaces:** Consumes all earlier tasks and produces verification evidence only.

- [ ] **Step 1: Run App tests**

```bash
cd /Users/nianbaidediannao/Desktop/骑手端app && npm test
```

- [ ] **Step 2: Run targeted and full backend tests**

```bash
cd /Users/nianbaidediannao/Desktop/后端后台本地测试版
npm --workspace backend test -- --runInBand src/modules/finance/finance.service.spec.ts src/modules/finance-admin/finance-admin.service.spec.ts src/modules/rider-app/rider-app.service.spec.ts src/modules/rider-app/rider-app.controller.spec.ts
npm --workspace backend test -- --runInBand
```

- [ ] **Step 3: Validate contracts, Prisma, lint and builds**

```bash
npm run contract:api
npm --workspace backend run db:generate
npx prisma validate --schema backend/prisma/schema.prisma
npx prisma validate --schema backend/prisma/schema.postgresql.prisma
npx prisma validate --schema backend/prisma/schema.mysql.prisma
npm run lint:check
npm run build:backend
npm run typecheck:admin
npm run build:admin
```

- [ ] **Step 4: Inspect scope and migration safety**

Run `git diff --check`, review every changed path, verify only the new migration files were added, and verify no database deployment command, production credential, external payout or real withdrawal occurred.

- [ ] **Step 5: Record remaining external gates**

Report source changes, local automated checks, simulator/device evidence, package signing and production acceptance separately. Do not treat a local build as physical-device background/payment proof.
