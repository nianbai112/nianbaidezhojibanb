# Merchant Finance, Payout Account, and Funding Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first production-shaped merchant finance closure: immutable merchant ledger entries, auditable discount funding, verified payout accounts, settlement locking, two-person manual payout review, and separate merchant-Web/platform-admin operating surfaces.

**Architecture:** Add one focused `merchant-finance` NestJS module and keep the existing order, payment, refund, subsidy, settlement, authentication, and admin applications authoritative. Order and refund events call a single ledger write service; settlements aggregate and lock ledger entries instead of recalculating orders; merchant Web uses the existing user identity with a separate browser token/store/layout; platform finance keeps regional data scope and moves direct `paid` writes behind payout attempts.

**Tech Stack:** NestJS, Prisma, PostgreSQL/MySQL parity, Redis locks, Jest, Vue 3, Pinia, Vue Router, Axios, Element Plus, Node `crypto`.

## Global Constraints

- Do not create a second order, payment, refund, merchant, or admin backend.
- Do not connect or simulate a real bank, Alipay, or WeChat transfer in this project. `manual` is the only enabled payout channel; other channel values are schema-compatible placeholders that reject execution.
- Treat signed payment/refund callbacks or authoritative active queries as the only final source for payment/refund status.
- Store all money as `Decimal(12,2)` and return API amounts as decimal strings. Never calculate money with JavaScript floating point.
- Ledger entries are immutable business facts. Correction means a new reversal or adjustment entry, never overwriting historical amounts.
- Payout account plaintext must not enter normal DTO responses, logs, audits, exports, errors, snapshots, or channel results.
- `merchantLedgerV2Enabled`, `merchantSettlementV2Enabled`, and `merchantPayoutAccountEnabled` default to `false` per region.
- Keep `backend/prisma/schema.prisma`, `schema.postgresql.prisma`, and `schema.mysql.prisma` structurally equivalent, with PostgreSQL and MySQL migrations delivered together.
- Preserve legacy settlement compatibility: `amount - platformFee === netAmount` for V2 rows.
- Keep the merchant console under the existing Vue build but isolate its authentication state, Axios client, layout, routes, and navigation from the administrator console.
- Before each task, inspect the dirty target files and stage only the files named by that task. Never stage unrelated user changes.
- Use test-driven development: add a failing test, verify the expected failure, implement the smallest change, verify the focused test, then commit.
- Local tests, local database acceptance, device proof, deployment, and real-money proof are separate gates. This plan completes only local implementation and scoped evidence.

---

### Task 1: Add schema, migrations, feature flags, and schema parity tests

**Files:**

- Create: `backend/src/modules/merchant-finance/merchant-finance.schema.spec.ts`
- Modify: `backend/prisma/schema.prisma`
- Modify: `backend/prisma/schema.postgresql.prisma`
- Modify: `backend/prisma/schema.mysql.prisma`
- Create: `backend/prisma/migrations/202607260001_merchant_finance_v2/migration.sql`
- Create: `backend/prisma/additive-migrations/mysql/202607260001_merchant_finance_v2.sql`
- Modify: `backend/src/config/env.validation.ts`
- Modify: `backend/src/config/env.validation.spec.ts`
- Modify: `backend/.env.example`
- Modify: `deploy/env.backend.example`

- [ ] **Step 1: Write the failing schema parity test**

Create a table-driven Jest test that reads all three Prisma schemas and requires the new models, financial fields, unique keys, and three regional flags:

```ts
const schemaFiles = [
  'prisma/schema.prisma',
  'prisma/schema.postgresql.prisma',
  'prisma/schema.mysql.prisma',
];

it.each(schemaFiles)('%s contains merchant finance V2 contract', (file) => {
  const schema = readFileSync(resolve(process.cwd(), file), 'utf8');
  expect(schema).toContain('model MerchantLedgerEntry');
  expect(schema).toContain('model MerchantPayoutAccount');
  expect(schema).toContain('model MerchantPayoutAttempt');
  expect(schema).toMatch(/dedupeKey\s+String\s+@unique/);
  expect(schema).toMatch(/merchantLedgerV2Enabled\s+Boolean\s+@default\(false\)/);
});
```

- [ ] **Step 2: Run the test and verify it fails for missing models**

Run: `npm --prefix backend test -- merchant-finance.schema.spec.ts --runInBand`

Expected: FAIL with `MerchantLedgerEntry` or another V2 contract missing.

- [ ] **Step 3: Add the Prisma contract to all three schemas**

Add validated string fields consistently. The core ledger model is:

```prisma
model MerchantLedgerEntry {
  id                     String   @id @default(cuid())
  merchantId             String
  entryNo                String   @unique
  entryType              String
  direction              String
  amount                 Decimal  @db.Decimal(12, 2)
  status                 String   @default("pending")
  orderId                String?
  orderNo                String?
  sourceType             String
  sourceId               String
  payerType              String?
  payerId                String?
  campaignId             String?
  commissionRateSnapshot Decimal? @db.Decimal(8, 6)
  availableAt            DateTime?
  settlementId           String?
  reversalOfId           String?
  dedupeKey              String   @unique
  metadata               Json?
  createdAt              DateTime @default(now())
  updatedAt              DateTime @updatedAt

  merchant    Merchant            @relation(fields: [merchantId], references: [id])
  settlement  MerchantSettlement? @relation(fields: [settlementId], references: [id])
  reversalOf  MerchantLedgerEntry? @relation("MerchantLedgerReversal", fields: [reversalOfId], references: [id])
  reversals   MerchantLedgerEntry[] @relation("MerchantLedgerReversal")

  @@index([merchantId, status, availableAt])
  @@index([orderId, entryType])
  @@index([settlementId])
}
```

Add `MerchantPayoutAccount`, `MerchantPayoutAttempt`, the relations on `Merchant` and `MerchantSettlement`, `SubsidyLedger.dedupeKey`, and the settlement fields from the approved design. Add the three `Boolean @default(false)` flags to `RegionMerchantSettings`.

Use status strings in the first migration instead of new database enums so MySQL/PostgreSQL migrations stay aligned and future state additions do not require an enum migration.

- [ ] **Step 4: Add additive PostgreSQL and idempotent MySQL migrations**

The PostgreSQL migration creates tables, foreign keys, indexes, and partial/default-account protection where supported. The MySQL additive script uses `information_schema` checks/procedures in the repository's existing style so it can safely rerun.

Do not delete, rename, or backfill any historical row in this migration.

- [ ] **Step 5: Add the independent credential-key environment contract**

Accept an optional `PAYOUT_ACCOUNT_CREDENTIAL_KEY` in environment validation and document a 32-byte base64 key in both examples. Do not provide a real or weak default. Runtime services added later must reject sensitive operations when it is absent.

- [ ] **Step 6: Generate Prisma clients and run focused verification**

Run:

```bash
npm --prefix backend run db:generate
npm --prefix backend test -- merchant-finance.schema.spec.ts env.validation.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 7: Commit only the schema foundation**

```bash
git add backend/prisma/schema.prisma backend/prisma/schema.postgresql.prisma backend/prisma/schema.mysql.prisma backend/prisma/migrations/202607260001_merchant_finance_v2/migration.sql backend/prisma/additive-migrations/mysql/202607260001_merchant_finance_v2.sql backend/src/modules/merchant-finance/merchant-finance.schema.spec.ts backend/src/config/env.validation.ts backend/src/config/env.validation.spec.ts backend/.env.example deploy/env.backend.example
git commit -m "feat: add merchant finance v2 schema"
```

### Task 2: Build payout-account encryption and lifecycle services

**Files:**

- Create: `backend/src/modules/merchant-finance/merchant-payout-crypto.service.ts`
- Create: `backend/src/modules/merchant-finance/merchant-payout-crypto.service.spec.ts`
- Create: `backend/src/modules/merchant-finance/merchant-payout-account.service.ts`
- Create: `backend/src/modules/merchant-finance/merchant-payout-account.service.spec.ts`
- Create: `backend/src/modules/merchant-finance/dto/merchant-finance.dto.ts`
- Create: `backend/src/modules/merchant-finance/merchant-finance.module.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Write failing encryption boundary tests**

Cover round-trip encryption, randomized IVs, stable fingerprints, masking, missing key rejection, malformed ciphertext rejection, and absence of plaintext in thrown errors.

```ts
expect(crypto.encrypt('6222021234567890')).not.toContain('622202');
expect(crypto.fingerprint('6222021234567890'))
  .toBe(crypto.fingerprint('6222021234567890'));
expect(crypto.mask('6222021234567890')).toBe('6222 **** **** 7890');
```

- [ ] **Step 2: Verify the crypto test fails, then implement with Node `crypto`**

Use AES-256-GCM with a random 12-byte IV and a distinct HMAC subkey derived with HKDF. Persist a versioned string such as `v1.iv.tag.ciphertext`. Do not copy or refactor the printer credential implementation in this task.

Run: `npm --prefix backend test -- merchant-payout-crypto.service.spec.ts --runInBand`

Expected: PASS.

- [ ] **Step 3: Write failing account lifecycle tests**

Cover:

- merchant ownership and feature flag checks;
- duplicate active fingerprint rejection;
- new account starts `pending` and never returns plaintext;
- review changes `pending -> verified/rejected` only;
- setting a new default clears the previous default in the same transaction;
- account changes create a new record instead of overwriting a verified account;
- disabling an account referenced by a non-paid settlement rejects or pauses it according to the approved design;
- regional admin cannot review an out-of-scope merchant.

- [ ] **Step 4: Implement service methods with narrow return types**

```ts
type PayoutAccountView = {
  id: string;
  merchantId: string;
  accountType: 'bank_card' | 'alipay';
  accountHolder: string;
  accountNoMasked: string;
  bankName: string | null;
  status: 'pending' | 'verified' | 'rejected' | 'disabled';
  isDefault: boolean;
  version: number;
};

submitAccount(userId: string, merchantId: string, dto: SubmitPayoutAccountDto): Promise<PayoutAccountView>
reviewAccount(adminId: string, accountId: string, dto: ReviewPayoutAccountDto): Promise<PayoutAccountView>
setDefault(userId: string, merchantId: string, accountId: string): Promise<PayoutAccountView>
disableAccount(userId: string, merchantId: string, accountId: string): Promise<PayoutAccountView>
```

All ordinary Prisma selects must omit `accountNoCiphertext`. Only a later high-risk reveal/payout method may select and decrypt it.

- [ ] **Step 5: Register the module without importing order/payment modules**

Export `MerchantPayoutAccountService` and `MerchantPayoutCryptoService`. Import only common dependencies needed by the module; keep the direction one-way so `ShopModule` and `PaymentModule` can import merchant finance later without a circular dependency.

- [ ] **Step 6: Run focused tests and compile**

```bash
npm --prefix backend test -- merchant-payout-crypto.service.spec.ts merchant-payout-account.service.spec.ts --runInBand
npm --prefix backend run build
```

Expected: PASS and successful Nest/TypeScript build.

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/merchant-finance backend/src/app.module.ts
git commit -m "feat: add merchant payout account lifecycle"
```

### Task 3: Build the single merchant-ledger write service

**Files:**

- Create: `backend/src/modules/merchant-finance/merchant-ledger.service.ts`
- Create: `backend/src/modules/merchant-finance/merchant-ledger.service.spec.ts`
- Create: `backend/src/modules/merchant-finance/merchant-finance.types.ts`
- Modify: `backend/src/modules/merchant-finance/merchant-finance.module.ts`

- [ ] **Step 1: Define the event and funding contracts in a pure type file**

```ts
export type DiscountFundingAllocation = {
  payerType: 'platform' | 'merchant' | 'region' | 'sponsor';
  payerId: string | null;
  amount: string;
};

export type OrderLedgerSnapshot = {
  merchantId: string;
  orderId: string;
  orderNo: string;
  goodsAmount: string;
  merchantPackagingAmount: string;
  merchantDeliveryAmount: string;
  discountAmount: string;
  fundingAllocation: DiscountFundingAllocation[];
  commissionRate: string;
  commissionBase: string;
  commissionAmount: string;
  sourceEventId: string;
};
```

Require constructors/callers to supply decimal strings from authoritative server snapshots; do not accept client-calculated funding.

- [ ] **Step 2: Write failing tests for entry composition and idempotency**

Test no-discount, platform-funded, merchant-funded, region-funded, and platform+merchant shared funding. Verify each discount allocation sums exactly to `discountAmount`, invalid payer IDs reject, zero entries are omitted, and replaying the same event returns existing rows.

Expected composition for a shared ¥10 discount where platform pays ¥6 and merchant pays ¥4:

```text
order_goods credit  original goods/owned fees
external_subsidy credit 6.00 payer=platform
merchant_discount debit 4.00 payer=merchant
commission debit calculated from the snapshotted commission base
```

- [ ] **Step 3: Run and observe the expected missing-service failure**

Run: `npm --prefix backend test -- merchant-ledger.service.spec.ts --runInBand`

- [ ] **Step 4: Implement transaction-safe ledger creation**

Expose transaction-aware methods so the order service can reuse its existing Prisma transaction:

```ts
createOrderEntries(
  tx: Prisma.TransactionClient,
  snapshot: OrderLedgerSnapshot,
): Promise<MerchantLedgerEntry[]>;

cancelUnpaidOrderEntries(
  tx: Prisma.TransactionClient,
  orderId: string,
  sourceEventId: string,
): Promise<number>;
```

Use deterministic keys such as `order:{orderId}:{entryType}:{payerType}:{payerId ?? 'none'}:{sourceEventId}`. On unique-key conflict, load and return the existing business fact instead of creating a second row.

- [ ] **Step 5: Add balance and ledger-query aggregation**

Provide read methods that aggregate credit/debit by `pending`, `available`, `locked`, and `settled`, returning strings. Add cursor/page query filters for order number, entry type, status, and date. Do not add a mutable balance table or Redis balance cache.

- [ ] **Step 6: Run focused tests**

Run: `npm --prefix backend test -- merchant-ledger.service.spec.ts --runInBand`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/merchant-finance
git commit -m "feat: add merchant ledger write service"
```

### Task 4: Integrate ledger snapshots with order creation and unpaid cancellation

**Files:**

- Modify: `backend/src/modules/shop/shop.module.ts`
- Modify: `backend/src/modules/shop/shop.service.ts`
- Modify: `backend/src/modules/shop/shop.service.spec.ts`
- Modify: `backend/src/modules/merchant-finance/merchant-ledger.service.spec.ts`

- [ ] **Step 1: Add failing order integration tests**

Extend the existing order tests around the transaction at `shop.service.ts` order creation to prove:

- item unit price, modifier, packaging, delivery-mode, discount funding, and commission snapshots produce the expected entries;
- `Order.totalAmount` is not used as `order_goods`;
- V2-disabled regions preserve current behavior and create no ledger rows;
- unpaid order expiry/cancellation cancels pending ledger rows and subsidy rows once;
- repeated cancellation is idempotent.

- [ ] **Step 2: Add a private server-side snapshot builder**

Inside `ShopService`, derive `OrderLedgerSnapshot` only from the already-validated quote/order lines and server-owned activity configuration. The builder may format `Decimal` values but must not write ledger rows itself.

```ts
private buildMerchantLedgerSnapshot(input: ValidatedOrderPricing): OrderLedgerSnapshot
```

- [ ] **Step 3: Call `MerchantLedgerService` inside the existing transaction**

Import `MerchantFinanceModule` in `ShopModule`. After the order and existing `SubsidyLedger` records are created—but before transaction commit—call `createOrderEntries(tx, snapshot)`. Use the existing region settings lookup to gate V2.

For existing single-payer coupons, normalize to one allocation. Allow platform+merchant shared allocations only when the test-region flag is enabled and the current activity explicitly supplies fixed amounts.

- [ ] **Step 4: Route unpaid release through the same service**

In every authoritative unpaid close/expiry branch, call `cancelUnpaidOrderEntries` in the same transaction as coupon/stock/payment-reservation release. Do not add a second timer.

- [ ] **Step 5: Run order and ledger tests**

```bash
npm --prefix backend test -- shop.service.spec.ts merchant-ledger.service.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/shop/shop.module.ts backend/src/modules/shop/shop.service.ts backend/src/modules/shop/shop.service.spec.ts backend/src/modules/merchant-finance/merchant-ledger.service.spec.ts
git commit -m "feat: write merchant ledger with shop orders"
```

### Task 5: Release completed orders into available balance

**Files:**

- Create: `backend/src/modules/merchant-finance/merchant-ledger-release.service.ts`
- Create: `backend/src/modules/merchant-finance/merchant-ledger-release.service.spec.ts`
- Modify: `backend/src/modules/merchant-finance/merchant-finance.module.ts`
- Modify: `backend/src/modules/shop/shop.service.ts`
- Modify: `backend/src/modules/shop/shop.service.spec.ts`

- [ ] **Step 1: Write failing lifecycle tests**

Test that order completion sets `availableAt`, the scheduled release only moves eligible `pending` rows, open appeals/refunds/risk freezes block release, and repeated/concurrent jobs do not release twice.

- [ ] **Step 2: Add an explicit completion hook**

When the existing authoritative shop-order transition reaches `COMPLETED`, call:

```ts
markOrderCompleted(
  tx: Prisma.TransactionClient,
  orderId: string,
  completedAt: Date,
  coolingHours: number,
): Promise<number>;
```

Default `coolingHours` to 24 only when no existing settlement configuration provides a value. Persist the computed timestamp; do not recalculate from current settings later.

- [ ] **Step 3: Implement the scheduled conditional update**

Use the existing global Nest schedule support. Query a bounded batch, re-check order/refund/appeal/risk conditions, then `updateMany` with `status: 'pending'` as an optimistic guard. Record counts and amounts in structured, non-sensitive logs.

- [ ] **Step 4: Verify focused tests**

```bash
npm --prefix backend test -- merchant-ledger-release.service.spec.ts shop.service.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/merchant-finance backend/src/modules/shop/shop.service.ts backend/src/modules/shop/shop.service.spec.ts
git commit -m "feat: release completed merchant earnings"
```

### Task 6: Add final-refund reversals and settlement freeze rules

**Files:**

- Create: `backend/src/modules/merchant-finance/merchant-refund-ledger.service.ts`
- Create: `backend/src/modules/merchant-finance/merchant-refund-ledger.service.spec.ts`
- Modify: `backend/src/modules/merchant-finance/merchant-finance.module.ts`
- Modify: `backend/src/modules/payment/payment.module.ts`
- Modify: `backend/src/modules/payment/payment.service.ts`
- Modify: `backend/src/modules/payment/payment.service.spec.ts`

- [ ] **Step 1: Write failing refund tests before touching the callback**

Cover:

- refund requested/accepted does not change merchant ledger;
- signed final success creates proportional reversals once;
- partial refund uses the original funding and commission snapshots;
- `pending/available` entries are reversed without future double settlement;
- `locked` entries cancel an unprocessed settlement, unlock unaffected rows, and force regeneration;
- `processing/unknown` payout freezes further refund settlement action;
- `settled` entries create future debit entries, never an external bank debit;
- duplicate callbacks and active-query confirmation are idempotent.

- [ ] **Step 2: Implement one transaction-aware final-success entry point**

```ts
applySuccessfulRefund(
  tx: Prisma.TransactionClient,
  input: {
    refundId: string;
    orderId: string;
    refundAmount: string;
    finalizedAt: Date;
  },
): Promise<RefundLedgerResult>;
```

Compute reversals from stored ledger metadata and `reversalOfId`; do not rerun the current campaign or commission configuration.

- [ ] **Step 3: Call it from the existing authoritative final-success paths**

Import `MerchantFinanceModule` in `PaymentModule`. Place the call inside the same transaction that finalizes the refund/payment-order state. Leave request and channel-accepted paths untouched.

- [ ] **Step 4: Run focused refund verification**

```bash
npm --prefix backend test -- merchant-refund-ledger.service.spec.ts payment.service.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/merchant-finance backend/src/modules/payment/payment.module.ts backend/src/modules/payment/payment.service.ts backend/src/modules/payment/payment.service.spec.ts
git commit -m "feat: reverse merchant ledger on final refunds"
```

### Task 7: Generate and manage settlements from locked ledger entries

**Files:**

- Create: `backend/src/modules/merchant-finance/merchant-settlement.service.ts`
- Create: `backend/src/modules/merchant-finance/merchant-settlement.service.spec.ts`
- Modify: `backend/src/modules/merchant-finance/merchant-finance.module.ts`
- Modify: `backend/src/modules/admin/admin.module.ts`
- Modify: `backend/src/modules/admin/admin.service.ts`
- Modify: `backend/src/modules/admin/admin.service.spec.ts`
- Modify: `backend/src/modules/admin/admin.service.aud-p1-071.spec.ts`

- [ ] **Step 1: Write settlement generation and concurrency tests**

Test:

- only `available` unbound entries inside the period are selected;
- a verified default payout account is mandatory;
- `grossAmount`, `subsidyAmount`, `debitAmount`, `platformFee`, `netAmount`, and compatibility `amount` match ledger aggregation;
- account snapshot does not change when the merchant changes defaults;
- cancelled periods create `v2`, `v3`, ... keys without deleting history;
- active overlapping periods reject;
- negative or zero net settlements do not become payable;
- 50 concurrent generate calls produce one settlement and each ledger row is locked once.

- [ ] **Step 2: Implement Redis lock plus database compare-and-set**

```ts
generate(input: {
  merchantId: string;
  periodStart: Date;
  periodEnd: Date;
  operatorId: string;
}): Promise<MerchantSettlementView>
```

Acquire a short Redis lock keyed by merchant. In a Prisma transaction, load eligible IDs, create the settlement, and `updateMany` only rows still `available` with `settlementId: null`. Roll back unless the affected count equals the selected count.

- [ ] **Step 3: Add merchant confirmation/dispute state methods**

Implement `confirmByMerchant`, `openDispute`, and an admin `resolveDispute`. Require selected ledger IDs for disputes, allow only one open dispute, block payout while open, and use an adjustment/reversal entry rather than editing the original settlement amount.

- [ ] **Step 4: Delegate legacy generation to the new service behind the regional flag**

Keep `AdminService.generateMerchantSettlement()` as a compatibility facade. When V2 is enabled, call `MerchantSettlementService.generate`; otherwise preserve current behavior. Never let both paths create a settlement for the same merchant/period.

- [ ] **Step 5: Run tests**

```bash
npm --prefix backend test -- merchant-settlement.service.spec.ts admin.service.spec.ts admin.service.aud-p1-071.spec.ts --runInBand
```

Expected: PASS, including the 50-request concurrency test with the existing test Redis/lock double.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/merchant-finance backend/src/modules/admin/admin.module.ts backend/src/modules/admin/admin.service.ts backend/src/modules/admin/admin.service.spec.ts backend/src/modules/admin/admin.service.aud-p1-071.spec.ts
git commit -m "feat: settle merchants from ledger entries"
```

### Task 8: Replace direct paid writes with payout attempts and dual review

**Files:**

- Create: `backend/src/modules/merchant-finance/merchant-payout.service.ts`
- Create: `backend/src/modules/merchant-finance/merchant-payout.service.spec.ts`
- Modify: `backend/src/modules/merchant-finance/merchant-finance.module.ts`
- Modify: `backend/src/modules/finance-admin/finance-admin.module.ts`
- Modify: `backend/src/modules/finance-admin/finance-admin.service.ts`
- Modify: `backend/src/modules/finance-admin/finance-admin.service.spec.ts`

- [ ] **Step 1: Write failing payout lifecycle tests**

Cover:

- only `completed/failed` settlements with positive `netAmount` can start;
- open dispute or disabled/risky account blocks start;
- one idempotency key creates one attempt;
- manual start sets `processing`, never `paid`;
- receipt, external transfer number, transfer time, and sanitized result are required before review;
- creator cannot review their own attempt, including super admin;
- successful review atomically marks attempt `succeeded`, settlement `paid`, ledger entries `settled`, and linked subsidy rows `settled`;
- failed review preserves history and allows a new attempt;
- channel `accepted/unknown` never becomes `paid`;
- retry and duplicate review cannot settle twice.

- [ ] **Step 2: Implement a manual-only adapter boundary**

```ts
interface MerchantPayoutAdapter {
  start(input: PayoutInstruction): Promise<{
    status: 'processing' | 'unknown';
    externalRequestNo: string;
  }>;
  query(attempt: MerchantPayoutAttempt): Promise<PayoutQueryResult>;
}
```

The manual adapter stores no plaintext account in its result. `bank`, `alipay`, and `wechat_submerchant` return a controlled “channel not enabled” error until a separate integration project supplies final-status verification.

- [ ] **Step 3: Implement the controlled reveal method**

Select/decrypt only when the requesting admin has the payout-create permission, provides a reason, passes the existing high-risk/recent-verification check, and references an eligible settlement. Return `Cache-Control: no-store` later at the controller. Persist a dedicated audit event containing only masked account data.

- [ ] **Step 4: Replace legacy `payMerchantSettlement` behavior**

Keep its URL during compatibility, but change it to create a manual attempt. The response must clearly return `processing` and `attemptId`; entering a transfer number must not directly write `paid`.

- [ ] **Step 5: Verify focused tests**

```bash
npm --prefix backend test -- merchant-payout.service.spec.ts finance-admin.service.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/merchant-finance backend/src/modules/finance-admin
git commit -m "feat: add reviewed merchant payout attempts"
```

### Task 9: Expose merchant-Web finance APIs with ownership boundaries

**Files:**

- Create: `backend/src/modules/merchant-finance/merchant-finance.controller.ts`
- Create: `backend/src/modules/merchant-finance/merchant-finance.controller.spec.ts`
- Modify: `backend/src/modules/merchant-finance/merchant-finance.module.ts`
- Modify: `backend/src/modules/merchant-finance/dto/merchant-finance.dto.ts`

- [ ] **Step 1: Write controller authorization and response-shape tests**

Use the existing `JwtGuard` user identity and verify:

- `GET /merchant-web/shops` returns all `Merchant.userId` shops for a multi-store owner;
- every shop-scoped route rejects a different owner and an ordinary user;
- feature-disabled regions expose no mutation action;
- list/detail responses contain decimal strings and `allowedActions`;
- payout account responses never include ciphertext, fingerprint, or plaintext;
- a finance viewer cannot manage accounts or confirm settlements once staff roles exist; until then only `Merchant.userId` receives implicit owner rights.

- [ ] **Step 2: Implement the approved merchant endpoints**

Add the routes from design section 9.1 under `/merchant-web`, not `/merchant`, because `/merchant/*` is already used by administrator APIs.

Use shared DTO transforms for date ranges, pagination, and decimal strings. Services—not the Vue client—compute `allowedActions`.

- [ ] **Step 3: Add no-store headers on sensitive mutations/details**

Account submission, settlement detail, and any future reveal response must include `Cache-Control: no-store`. Do not add a merchant account reveal route.

- [ ] **Step 4: Run focused tests and build**

```bash
npm --prefix backend test -- merchant-finance.controller.spec.ts --runInBand
npm --prefix backend run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/merchant-finance
git commit -m "feat: expose merchant web finance api"
```

### Task 10: Expose platform-admin finance APIs with region scope and permissions

**Files:**

- Create: `backend/src/modules/merchant-finance/merchant-finance.admin.controller.ts`
- Create: `backend/src/modules/merchant-finance/merchant-finance.admin.controller.spec.ts`
- Modify: `backend/src/modules/merchant-finance/merchant-finance.module.ts`
- Modify: `backend/src/modules/merchant-finance/dto/merchant-finance.dto.ts`
- Modify: `backend/src/decorators/require-permission.decorator.ts`
- Modify: `backend/prisma/seed.ts`

- [ ] **Step 1: Write failing admin scope and permission tests**

Test global admin versus regional admin visibility, out-of-region review rejection, separate create/review payout permissions, adjustment reason requirements, no full account in exports, and `no-store` reveal responses.

- [ ] **Step 2: Add the minimum permission constants and seed mappings**

Add only the approved permission points:

```text
merchant:finance:view
merchant:finance_account:manage
merchant:settlement:confirm
finance:merchant_account:review
finance:merchant_settlement:generate
finance:merchant_settlement:confirm
finance:merchant_payout:create
finance:merchant_payout:review
finance:merchant_adjustment:create
```

Do not broaden existing administrator roles silently. Seed safe defaults, and document which role must be deliberately granted payout permissions.

- [ ] **Step 3: Implement routes under `/admin/finance`**

Use `JwtGuard`, `AdminGuard`, `PermissionsGuard`, `RequirePermission`, and `AdminDataScopeService`. Expose ledger, account review/reveal, settlement generation/confirmation/dispute resolution, payout creation/review/requery, and adjustment creation.

For adjustment creation, require source reason, affected merchant, direction, amount, and a server-generated dedupe key. Never update a ledger row in place.

- [ ] **Step 4: Run focused tests**

```bash
npm --prefix backend test -- merchant-finance.admin.controller.spec.ts --runInBand
npm --prefix backend run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/merchant-finance backend/src/decorators/require-permission.decorator.ts backend/prisma/seed.ts
git commit -m "feat: expose merchant finance admin api"
```

### Task 11: Create the isolated merchant Web shell and multi-store session

**Files:**

- Create: `admin/src/api/merchant-console-request.ts`
- Create: `admin/src/api/merchant-auth.ts`
- Create: `admin/src/api/merchant-finance.ts`
- Create: `admin/src/stores/merchant-auth.ts`
- Create: `admin/src/layout/MerchantConsoleLayout.vue`
- Create: `admin/src/views/merchant-console/Login.vue`
- Create: `admin/src/views/merchant-console/Overview.vue`
- Modify: `admin/src/router/index.ts`

- [ ] **Step 1: Add the merchant-only HTTP client**

Use separate storage keys (`LM_MERCHANT_TOKEN`, `LM_MERCHANT_REFRESH_TOKEN`) and redirect 401s to `/merchant-console/login`. Never read/write `LM_ADMIN_TOKEN`, and never redirect merchant sessions to the administrator `/login`.

Reuse existing backend endpoints:

```text
POST auth/phone/send-code
POST auth/phone/login
POST wx-auth/refresh
GET merchant-web/shops
```

- [ ] **Step 2: Implement merchant auth state and shop selection**

Persist the selected shop ID only if it remains in the authenticated shop list. If one owner has multiple shops, the layout must show the current shop and a switcher. Clear all merchant tokens and shop state on logout.

- [ ] **Step 3: Add isolated routes and guards**

Add `/merchant-console/login` and protected `/merchant-console/*` routes. Use route metadata such as `merchantAuth: true`; do not pass merchant pages through the administrator permission/menu guard.

- [ ] **Step 4: Build the operating shell**

The layout contains only the merchant overview and finance navigation delivered by this project. Do not expose empty order/product/printer placeholders and do not surface super-admin modules; daily operations enter the navigation only when their later project is implemented.

- [ ] **Step 5: Typecheck and build the Vue app**

```bash
npm --prefix admin run typecheck
npm --prefix admin run build
```

Expected: PASS. If the pre-existing whole-project type debt fails, record exact unrelated diagnostics and run a scoped `vue-tsc`/build check that proves the new files introduce no additional errors; do not claim the global gate passed.

- [ ] **Step 6: Commit**

```bash
git add admin/src/api/merchant-console-request.ts admin/src/api/merchant-auth.ts admin/src/api/merchant-finance.ts admin/src/stores/merchant-auth.ts admin/src/layout/MerchantConsoleLayout.vue admin/src/views/merchant-console/Login.vue admin/src/views/merchant-console/Overview.vue admin/src/router/index.ts
git commit -m "feat: add isolated merchant web console"
```

### Task 12: Build the five merchant finance operating pages

**Files:**

- Create: `admin/src/views/merchant-console/FinanceOverview.vue`
- Create: `admin/src/views/merchant-console/Ledger.vue`
- Create: `admin/src/views/merchant-console/Settlements.vue`
- Create: `admin/src/views/merchant-console/SettlementDetail.vue`
- Create: `admin/src/views/merchant-console/PayoutAccounts.vue`
- Create: `admin/src/views/merchant-console/Payouts.vue`
- Create: `admin/src/views/merchant-console/finance-format.ts`
- Modify: `admin/src/api/merchant-finance.ts`
- Modify: `admin/src/layout/MerchantConsoleLayout.vue`
- Modify: `admin/src/router/index.ts`

- [ ] **Step 1: Implement shared display rules before pages**

Add pure helpers for amount strings, status labels, and action visibility. Status labels must distinguish `completed=核算完成/待打款`, `processing=打款处理中`, and `paid=已到账`; never label `completed` as paid.

- [ ] **Step 2: Build finance overview and ledger pages**

Overview shows pending, available, locked, settled, and negative adjustment values with short explanations. Ledger provides server-side filters and order-source drilldown. Always include the selected shop ID in requests and cancel/reload queries on shop switch.

- [ ] **Step 3: Build settlement list/detail and dispute actions**

Show gross income, external subsidies, merchant discounts, commission, refunds/adjustments, net amount, masked payout account snapshot, and included ledger rows. Render confirm/dispute buttons only from `allowedActions`. A dispute requires selected rows and a reason.

- [ ] **Step 4: Build payout-account lifecycle UI**

Support bank card/Alipay submission, pending/verified/rejected/disabled states, default selection, and version history. Never add a “show full account” button and never put plaintext in local storage.

- [ ] **Step 5: Build payout records**

Show attempt number, channel, masked account, transfer number, requested/completed times, final state, and sanitized failure reason/receipt link. A `processing/unknown` attempt must be visually pending, not successful.

- [ ] **Step 6: Typecheck, build, and browser-smoke the merchant routes**

```bash
npm --prefix admin run typecheck
npm --prefix admin run build
```

Then use the local browser against the built/dev app to verify login redirect, multi-store switch, all five finance pages, empty/loading/error states, narrow viewport, and no administrator navigation leakage. Capture screenshots as local UI evidence.

- [ ] **Step 7: Commit**

```bash
git add admin/src/views/merchant-console admin/src/api/merchant-finance.ts admin/src/layout/MerchantConsoleLayout.vue admin/src/router/index.ts
git commit -m "feat: add merchant finance web pages"
```

### Task 13: Consolidate the platform finance workbench

**Files:**

- Modify: `admin/src/api/merchant.ts`
- Modify: `admin/src/views/finance/MerchantSettle.vue`
- Modify: `admin/src/views/merchant/MerchantSettlements.vue`
- Create: `admin/src/views/finance/MerchantPayoutAccounts.vue`
- Create: `admin/src/views/finance/MerchantPayouts.vue`
- Create: `admin/src/views/finance/MerchantFinanceExceptions.vue`
- Modify: `admin/src/router/index.ts`
- Modify: `admin/src/router/menus.ts`

- [ ] **Step 1: Replace direct-pay API assumptions**

Change the admin client so the old pay action creates a manual payout attempt and returns `processing`. Add explicit APIs for account review/reveal, payout receipt review, requery, dispute resolution, and ledger adjustment.

- [ ] **Step 2: Make `MerchantSettle.vue` the only settlement workbench**

Move any still-useful behavior from `views/merchant/MerchantSettlements.vue` into the finance workbench. Convert the duplicate merchant route to a redirect or thin compatibility wrapper; do not maintain two different settlement state machines.

- [ ] **Step 3: Add four actionable queues**

Expose:

1. payout accounts awaiting review;
2. settlements awaiting generation/confirmation;
3. payouts awaiting action, review, requery, or retry;
4. disputes and finance exceptions.

Keep full account values out of list state and generic exports. The one-time reveal dialog must auto-clear its value on close and show the audit reason field before request.

- [ ] **Step 4: Enforce region and permission-driven action UI**

The backend remains authoritative; the frontend hides actions according to returned permissions/allowed actions but does not rely on hiding for security.

- [ ] **Step 5: Typecheck, build, and browser-smoke administrator flows**

```bash
npm --prefix admin run typecheck
npm --prefix admin run build
```

Browser-smoke the four queues, regional filter, masked account display, manual payout creation, separate-review rejection, and `processing` display.

- [ ] **Step 6: Commit**

```bash
git add admin/src/api/merchant.ts admin/src/views/finance admin/src/views/merchant/MerchantSettlements.vue admin/src/router/index.ts admin/src/router/menus.ts
git commit -m "feat: consolidate merchant finance operations"
```

### Task 14: Add dry-run audit, controlled backfill, metrics, and rollout acceptance

**Files:**

- Create: `backend/scripts/audit-merchant-finance-v2.cjs`
- Create: `backend/scripts/backfill-merchant-ledger-v2.cjs`
- Create: `backend/src/modules/merchant-finance/merchant-finance.audit.spec.ts`
- Create: `backend/src/modules/merchant-finance/merchant-finance.integration.spec.ts`
- Modify: `backend/package.json`
- Modify: `docs/superpowers/specs/2026-07-26-merchant-finance-payout-funding-design.md`
- Create: `docs/runbooks/merchant-finance-v2-rollout.md`

- [ ] **Step 1: Write failing audit fixture tests**

Create fixed fixtures for the ten approved acceptance scenarios: normal, platform-funded, merchant-funded, shared-funded, member delivery benefit, pre-completion refund, post-completion partial refund, post-settlement refund, account-version snapshot, and failed-then-successful manual payout.

Assert six independent totals: goods income, discount, subsidy, commission, refund, and net amount.

- [ ] **Step 2: Implement a read-only audit script first**

The script accepts region, merchant, and date filters; compares orders/subsidies/refunds against ledger/settlements; prints row counts and amount differences; exits nonzero for any difference over `0.01`. It must never write.

Add package command: `finance:audit:v2`.

- [ ] **Step 3: Implement a dry-run-default backfill script**

Require explicit `--apply --operator=<id> --reason=<text>` for writes. Before applying, print affected order count and all six totals, require V2 settlement/payout flags to be off for the scope, and use the same service/dedupe contract as live order creation.

Add package command: `finance:backfill:v2`.

- [ ] **Step 4: Add structured metrics and exception queries**

Expose counts/amounts for stuck pending entries, subsidy differences, missing refund reversals, no verified payout account, settlement aggregation differences, long `processing/unknown` payouts, paid-versus-settled differences, and unresolved disputes. Never use account numbers, merchant names, or order notes as metric labels.

- [ ] **Step 5: Run the full scoped backend verification**

```bash
npm --prefix backend test -- merchant-finance --runInBand
npm --prefix backend test -- shop.service.spec.ts payment.service.spec.ts finance-admin.service.spec.ts admin.service.spec.ts --runInBand
npm --prefix backend run build
```

Expected: all new and touched-module tests PASS; build succeeds.

- [ ] **Step 6: Run database-backed concurrency and dry-run evidence**

Against a disposable local database only:

1. apply the migration;
2. seed the ten scenarios;
3. run 50 simultaneous settlement-generation requests;
4. verify one settlement wins and no ledger row is double locked;
5. run the audit script and require zero differences;
6. run backfill without `--apply` and prove no row changes.

Record local connection target, backup/restore point, commands, counts, amounts, and timestamps in the runbook. Do not point these scripts at production during this task.

- [ ] **Step 7: Run the admin verification and browser acceptance**

```bash
npm --prefix admin run typecheck
npm --prefix admin run build
```

Verify merchant and administrator flows in a local browser. Save screenshots for payout masking, settlement detail, dispute, account review, and processing payout. Document any pre-existing global type errors separately from new-file status.

- [ ] **Step 8: Complete the rollout runbook without enabling production flags**

The runbook must state:

- target database backup and restore commands/placeholders to fill at deployment time;
- migration dry-run/write boundary;
- per-region enable order (`ledger -> account -> settlement -> manual payout`);
- required 24-hour order/refund observation and one full settlement cycle;
- pause/rollback behavior that stops new settlement/payout writes but preserves V2 reads;
- manual payout dual-review checklist;
- alert owners and repair commands;
- explicit statement that real payment/refund callbacks, real receipt proof, target deployment, and observation are still external gates.

- [ ] **Step 9: Final security scan and full diff review**

Search the changed files for plaintext account logging, direct `status: 'paid'` writes outside `MerchantPayoutService`, settlement sums based on orders, floating-point money conversion, and frontend admin-token reuse.

Run:

```bash
rg -n "accountNo|console\.|Logger|status:\s*'paid'|Number\(|parseFloat|LM_ADMIN_TOKEN" backend/src/modules/merchant-finance admin/src/views/merchant-console admin/src/api/merchant-console-request.ts
git diff --check
```

Inspect every match; do not treat a clean text search as a substitute for tests.

- [ ] **Step 10: Commit acceptance tooling and runbook**

```bash
git add backend/scripts/audit-merchant-finance-v2.cjs backend/scripts/backfill-merchant-ledger-v2.cjs backend/src/modules/merchant-finance/merchant-finance.audit.spec.ts backend/src/modules/merchant-finance/merchant-finance.integration.spec.ts backend/package.json docs/superpowers/specs/2026-07-26-merchant-finance-payout-funding-design.md docs/runbooks/merchant-finance-v2-rollout.md
git commit -m "test: verify merchant finance closure"
```

## Completion Gates

Implementation may be reported as **locally complete** only when all of the following are true:

- all new focused Jest tests pass;
- touched legacy shop/payment/admin/finance tests pass;
- backend build and Prisma generation pass;
- admin build passes and new pages add no type errors;
- disposable-database migration, ten-scenario audit, and 50-request settlement concurrency evidence pass;
- account plaintext is absent from routine responses/logs/exports;
- manual payout requires different creator and reviewer and remains `processing` before review;
- legacy settlement fields produce the same net amount under the compatibility formula;
- all three regional flags remain disabled by default;
- the rollout runbook identifies backup, dry-run, observation, alert, and rollback ownership.

The project is **not production complete** until a target environment has applied the migration, configured the credential key, enabled one test region in sequence, observed real signed payment/refund callbacks, completed a real manually reviewed payout receipt, and passed one full settlement-cycle reconciliation.
