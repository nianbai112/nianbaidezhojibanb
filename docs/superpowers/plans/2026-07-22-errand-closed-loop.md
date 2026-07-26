# Errand Closed-Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing errand feature server-priced, user-confirmed, channel-refunded, appeal-aware, settlement-traceable, privacy-safe, and operationally recoverable without rewriting the module.

**Architecture:** Keep the existing `ErrandService` as the API-facing orchestrator, extract pure quote calculation into `ErrandQuoteService`, and route every order transition through `ErrandLifecycleService`. Reuse `PaymentService`, `WalletService`, `NotifyService`, generic appeals, delivery nodes, risk events, Redis locks, and the existing payment-expiry scheduler; add only the receipt fields and settlement linkage needed for auditable finance.

**Tech Stack:** NestJS, TypeScript, Prisma 5, PostgreSQL/MySQL schema variants, Jest, Vue 3 + Element Plus, native WeChat mini-program compiled JavaScript/WXML/WXSS, Node.js 22.

## Global Constraints

- Node.js must be `>=22`; use `/opt/homebrew/opt/node@22/bin/node` when the shell default remains Node 18.
- Do not add a workflow engine, message queue, state-machine package, or other dependency.
- Preserve existing API paths where possible; add endpoints only for quote preview and receipt confirmation.
- Database changes are additive. Do not delete or reinterpret historical orders, refunds, appeals, or settlements automatically.
- `arrived` means delivered and awaiting receipt confirmation; riders must never write `completed`.
- User or system receipt confirmation is blocked by refunding/refunded state, open appeal, or blocking risk event.
- Payment and refund authority remains server-side; no client price, payment-success callback, or admin button can set a financial terminal state directly.
- Keep `后端后台本地测试版` and `/Users/nianbaidediannao/Desktop/前端文件` changes scoped. Do not stage unrelated dirty-worktree files.
- A passing build or unit test is local evidence only. Deployment, WeChat sandbox, DevTools, real database concurrency, and device proof must be reported separately.

---

## File Map

**New backend units**

- `backend/src/modules/errand/errand-quote.service.ts`: validate quote inputs and calculate all server-owned amounts.
- `backend/src/modules/errand/errand-lifecycle.service.ts`: guarded transitions, receipt confirmation, auto receipt, admin assign/cancel delegation.
- `backend/src/modules/errand/errand-privacy.ts`: status-aware public/pool/assigned order projections.
- `backend/src/modules/errand/*.spec.ts`: focused unit and concurrency contract tests.
- `backend/prisma/migrations/202607220002_errand_closed_loop/migration.sql`: additive receipt, settlement-item, liability, and review schema.

**Existing backend integration points**

- `backend/src/modules/errand/errand.service.ts`: order creation, formatting, rider commands, transfer, location.
- `backend/src/modules/errand/errand.controller.ts`: quote and confirmation routes, guarded location/public routes.
- `backend/src/modules/errand/errand.module.ts`: register/export new services.
- `backend/src/modules/payment/payment.service.ts`: channel-aware balance refund and errand reversal hook.
- `backend/src/modules/order-appeal/order-appeal.service.ts`: hold and resolution actions.
- `backend/src/modules/finance-admin/finance-admin.service.ts`: settlement eligibility and detail rows.
- `backend/src/modules/errand-admin/errand-admin.service.ts`: data scope and lifecycle delegation.
- `backend/src/modules/scheduler/payment-expiry.service.ts`: reuse patterns only; no second scheduler framework.

**Frontend and admin integration points**

- `/Users/nianbaidediannao/Desktop/前端文件/api/lmapi.js`: quote/confirm wrappers and corrected location contract.
- `/Users/nianbaidediannao/Desktop/前端文件/pagesA/RunningErrands/RunningErrands.js`: quote-first submission and yuan budget.
- `/Users/nianbaidediannao/Desktop/前端文件/pagesA/order/errand-detail/errand-detail.js`: confirm receipt, countdown, holds.
- `/Users/nianbaidediannao/Desktop/前端文件/pagesA/order/order.js`: free-order and balance-payment behavior.
- `/Users/nianbaidediannao/Desktop/前端文件/pagesA/Grab/Grab.js`: delivered-only rider action and evidence.
- `admin/src/api/errand.ts`: typed allowed actions, refund retry, and resolution calls.
- `admin/src/views/delivery/ErrandOrdersPage.vue`: guarded actions and closure detail.
- `admin/src/views/delivery/AbnormalOrders.vue`: actionable closure exceptions.
- `admin/src/views/delivery/PricingRules.vue`: closure and pricing configuration.

---

### Task 1: Add the additive closure schema

**Files:**
- Modify: `backend/prisma/schema.prisma:2725-2800`
- Modify: `backend/prisma/schema.prisma:4753-4782`
- Create: `backend/prisma/migrations/202607220002_errand_closed_loop/migration.sql`
- Create: `backend/src/modules/errand/errand-closure.schema.spec.ts`
- Regenerate: `backend/prisma/schema.postgresql.prisma`
- Regenerate: `backend/prisma/schema.mysql.prisma`

**Interfaces:**
- Produces `ErrandOrder.receiptConfirmDeadline`, `receiptConfirmedAt`, `receiptConfirmedBy`, `settlementEligibleAt`, and `pricingSnapshot`.
- Produces `RiderSettlementItem`, `RiderLiability`, and `ErrandReview` models with order/refund uniqueness.

- [ ] **Step 1: Write the failing schema contract test**

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('errand closure schema', () => {
  const schema = readFileSync(join(process.cwd(), 'prisma/schema.prisma'), 'utf8');

  it('stores receipt authority and auditable settlement linkage', () => {
    expect(schema).toContain('receiptConfirmDeadline DateTime?');
    expect(schema).toContain('receiptConfirmedAt     DateTime?');
    expect(schema).toContain('settlementEligibleAt   DateTime?');
    expect(schema).toContain('model RiderSettlementItem');
    expect(schema).toContain('@@unique([orderType, orderId])');
    expect(schema).toContain('model RiderLiability');
    expect(schema).toContain('model ErrandReview');
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `cd backend && /opt/homebrew/opt/node@22/bin/npm test -- --runInBand src/modules/errand/errand-closure.schema.spec.ts`

Expected: FAIL because the receipt fields and new models are absent.

- [ ] **Step 3: Add the Prisma fields, relations, indexes, and SQL migration**

Use nullable fields for historical compatibility. Use these exact uniqueness rules:

```prisma
model RiderSettlementItem {
  id                String           @id @default(cuid())
  settlementId      String
  settlement        RiderSettlement  @relation(fields: [settlementId], references: [id], onDelete: Cascade)
  orderType         String           @default("errand")
  orderId           String
  riderId           String
  deliveryFeeAmount Decimal          @default(0) @db.Decimal(12, 2)
  tipAmount         Decimal          @default(0) @db.Decimal(12, 2)
  rewardAmount      Decimal          @default(0) @db.Decimal(12, 2)
  penaltyAmount     Decimal          @default(0) @db.Decimal(12, 2)
  payableAmount     Decimal          @default(0) @db.Decimal(12, 2)
  status            String           @default("included")
  reversalAmount    Decimal          @default(0) @db.Decimal(12, 2)
  reversedAt        DateTime?
  reverseReason     String?
  createdAt         DateTime         @default(now())
  updatedAt         DateTime         @updatedAt

  @@unique([orderType, orderId])
  @@index([settlementId, status])
  @@index([riderId, createdAt])
  @@map("rider_settlement_items")
}

model RiderLiability {
  id              String   @id @default(cuid())
  riderId         String
  orderId         String
  refundId        String
  amount          Decimal  @db.Decimal(12, 2)
  recoveredAmount Decimal  @default(0) @db.Decimal(12, 2)
  status          String   @default("open")
  reason          String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@unique([orderId, refundId])
  @@index([riderId, status])
  @@map("rider_liabilities")
}

model ErrandReview {
  id        String   @id @default(cuid())
  orderId   String   @unique
  userId    String
  riderId   String
  rating    Int
  tags      Json?
  content   String?  @db.Text
  images    Json?
  status    String   @default("active")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([riderId, createdAt])
  @@map("errand_reviews")
}
```

Add these exact fields to `ErrandOrder` and `items RiderSettlementItem[]` to `RiderSettlement`:

```prisma
receiptConfirmDeadline DateTime?
receiptConfirmedAt     DateTime?
receiptConfirmedBy     String?
settlementEligibleAt   DateTime?
pricingSnapshot        Json?
```

- [ ] **Step 4: Sync variants and validate all schemas**

Run:

```bash
cd backend
/opt/homebrew/opt/node@22/bin/npm run db:sync-schemas
/opt/homebrew/opt/node@22/bin/node ../node_modules/prisma/build/index.js validate --schema prisma/schema.prisma
/opt/homebrew/opt/node@22/bin/npm test -- --runInBand src/modules/errand/errand-closure.schema.spec.ts
```

Expected: schema variants sync, Prisma reports the schema valid, and the contract test passes.

- [ ] **Step 5: Commit only the schema task**

```bash
git add backend/prisma/schema.prisma backend/prisma/schema.postgresql.prisma backend/prisma/schema.mysql.prisma backend/prisma/migrations/202607220002_errand_closed_loop/migration.sql backend/src/modules/errand/errand-closure.schema.spec.ts
git commit -m "feat(errand): add closed-loop receipt and settlement schema"
```

---

### Task 2: Build one server-owned quote calculator

**Files:**
- Create: `backend/src/modules/errand/errand-quote.service.ts`
- Create: `backend/src/modules/errand/errand-quote.service.spec.ts`
- Modify: `backend/src/modules/errand/errand.module.ts:1-17`
- Modify: `backend/src/modules/errand/errand.controller.ts:1-110`
- Modify: `backend/src/modules/errand/errand.service.ts:1403-1675`

**Interfaces:**
- Produces `ErrandQuoteService.quote(userId: string, dto: Record<string, unknown>): Promise<ErrandQuoteResult>`.
- `ErrandQuoteResult` contains `baseFee`, `sizeFee`, `distanceFee`, `weightFee`, `timeFee`, `riderSurcharge`, `tip`, `couponDiscount`, `memberDiscount`, `distanceMeters`, `payAmount`, `quotedAt`, and `pricingSnapshot`.

- [ ] **Step 1: Write failing quote tests**

```ts
describe('ErrandQuoteService', () => {
  it('ignores client price and computes configured components', async () => {
    const result = await service.quote('user-1', {
      region_id: 'region-1', service_type: 'express_pickup', price: -99,
      tip: 2, deliver_lat: 30.2, deliver_lng: 120.2,
      tasks: [{ pickup_point_id: 'point-1', item_size_id: 'size-1', code: 'A1', express_company: '顺丰' }],
    });
    expect(result.payAmount).toBeGreaterThanOrEqual(2);
    expect(result.pricingSnapshot).not.toHaveProperty('clientPrice');
  });

  it('rejects cross-region sizes and negative tips', async () => {
    await expect(service.quote('user-1', crossRegionDto)).rejects.toThrow('规格不属于当前区域');
    await expect(service.quote('user-1', { ...validDto, tip: -1 })).rejects.toThrow('小费金额无效');
  });

  it('blocks universal tasks that require rider advance payment', async () => {
    await expect(service.quote('user-1', {
      ...validDto, service_type: 'custom_task', tasks: [{ description: '代买', budget: 20 }],
    })).rejects.toThrow('暂不支持接单者垫资');
  });
});
```

- [ ] **Step 2: Run the tests and confirm service absence fails**

Run: `cd backend && /opt/homebrew/opt/node@22/bin/npm test -- --runInBand src/modules/errand/errand-quote.service.spec.ts`

Expected: FAIL because `ErrandQuoteService` does not exist.

- [ ] **Step 3: Implement the pure quote boundary**

Define and use this public shape:

```ts
export type ErrandQuoteResult = {
  baseFee: number;
  sizeFee: number;
  distanceFee: number;
  weightFee: number;
  timeFee: number;
  riderSurcharge: number;
  tip: number;
  couponDiscount: number;
  memberDiscount: number;
  distanceMeters: number;
  payAmount: number;
  quotedAt: string;
  pricingSnapshot: Record<string, unknown>;
};
```

Validate region, service switch, task count, size `regionId/applyTo`, pickup point `regionId/isOpen`, coordinate ranges, configured maximum distance/weight, and `0 <= tip <= 100`. Until procurement escrow has its own approved design, reject every universal task with a positive `budget` using the stable error code `ERRAND_ADVANCE_PAYMENT_DISABLED`. Calculate ordered pickup legs plus final delivery with Haversine; round money only after summing each category.

- [ ] **Step 4: Add the authenticated quote endpoint and reuse the calculator in create**

```ts
@Post('errand/order/quote')
@UseGuards(JwtGuard)
@ApiBearerAuth()
quoteOrder(@CurrentUser('sub') userId: string, @Body() dto: any) {
  return this.errandService.quoteOrder(userId, dto);
}
```

Delete reads of `dto.price`, `task.computed_fee`, and client `distance` from order amount persistence. Keep them only as ignored compatibility input.

- [ ] **Step 5: Verify and commit**

Run: `cd backend && /opt/homebrew/opt/node@22/bin/npm test -- --runInBand src/modules/errand/errand-quote.service.spec.ts src/modules/errand/errand-config.util.spec.ts && /opt/homebrew/opt/node@22/bin/node ../node_modules/typescript/bin/tsc --noEmit --incremental false --project tsconfig.json`

Expected: quote/config tests pass and TypeScript exits 0.

```bash
git add backend/src/modules/errand/errand-quote.service.ts backend/src/modules/errand/errand-quote.service.spec.ts backend/src/modules/errand/errand.module.ts backend/src/modules/errand/errand.controller.ts backend/src/modules/errand/errand.service.ts
git commit -m "fix(errand): make order quotes server authoritative"
```

---

### Task 3: Close order creation, zero-pay activation, and entitlement release

**Files:**
- Modify: `backend/src/modules/errand/errand.service.ts:1403-1895`
- Create: `backend/src/modules/errand/errand-order-creation.spec.ts`
- Modify: `backend/src/modules/payment/payment.controller.ts:36-103`
- Modify: `/Users/nianbaidediannao/Desktop/前端文件/pagesA/RunningErrands/RunningErrands.js:930-1110`

**Interfaces:**
- Consumes `ErrandQuoteResult` from Task 2.
- Produces `createOrder` behavior that returns `quote_changed`, creates normal pending-pay orders, or directly activates zero-pay orders.

- [ ] **Step 1: Write failing creation tests**

```ts
it('returns QUOTE_CHANGED without creating an order', async () => {
  quoteService.quote.mockResolvedValue({ ...quote, payAmount: 8 });
  await expect(service.createOrder('u1', { ...dto, client_quote_pay_amount: 5 }))
    .rejects.toMatchObject({ response: expect.objectContaining({ code: 'QUOTE_CHANGED' }) });
  expect(prisma.errandOrder.create).not.toHaveBeenCalled();
});

it('activates a zero-pay order without a payment request', async () => {
  quoteService.quote.mockResolvedValue({ ...quote, payAmount: 0 });
  const result = await service.createOrder('u1', dto);
  expect(result.data.status).toBe('pending_accept');
  expect(result.data.payChannel).toBe('free');
});
```

- [ ] **Step 2: Run and confirm failures**

Run: `cd backend && /opt/homebrew/opt/node@22/bin/npm test -- --runInBand src/modules/errand/errand-order-creation.spec.ts`

Expected: FAIL because create still trusts client price and zero-pay remains pending.

- [ ] **Step 3: Implement quote comparison and zero-pay activation**

Use `Math.round(amount * 100)` comparisons. Persist `pricingSnapshot`. For zero-pay, set `status='pending_accept'`, `payChannel='free'`, and `payTime=now` inside the same transaction that reserves/finalizes the coupon and membership benefit. Notify riders only after commit.

- [ ] **Step 4: Make the mini-program quote before create**

Add `quoteErrandOrder(data)` in `api/lmapi.js`. In `RunningErrands.js`, build one payload, call quote, display the returned total, and submit the same payload with `client_quote_pay_amount`. Send custom budget as a yuan number:

```js
budget: customTaskBudget.value ? Number(parseFloat(customTaskBudget.value).toFixed(2)) : null
```

If create returns a zero-pay order, navigate to the order without calling `wx.requestPayment`.

- [ ] **Step 5: Verify and commit**

Run:

```bash
cd backend && /opt/homebrew/opt/node@22/bin/npm test -- --runInBand src/modules/errand/errand-order-creation.spec.ts src/modules/errand/errand.service.aud-p1-052.spec.ts
/opt/homebrew/opt/node@22/bin/node --check /Users/nianbaidediannao/Desktop/前端文件/pagesA/RunningErrands/RunningErrands.js
```

Expected: tests and syntax check pass.

```bash
git add backend/src/modules/errand/errand.service.ts backend/src/modules/errand/errand-order-creation.spec.ts backend/src/modules/payment/payment.controller.ts
git commit -m "fix(errand): close quote and zero-pay creation"
```

Record the frontend files in the task handoff because `/Users/nianbaidediannao/Desktop/前端文件` is a separate tree and must be committed there only if it is its own repository.

---

### Task 4: Route rider delivery and user confirmation through one lifecycle service

**Files:**
- Create: `backend/src/modules/errand/errand-lifecycle.service.ts`
- Create: `backend/src/modules/errand/errand-lifecycle.service.spec.ts`
- Modify: `backend/src/modules/errand/errand.module.ts`
- Modify: `backend/src/modules/errand/errand.service.ts:1980-2205`
- Modify: `backend/src/modules/errand/errand.controller.ts:70-90`

**Interfaces:**
- Produces `markInProgress(orderId, riderId, evidence)`, `markArrived(orderId, riderId, evidence)`, and `confirmReceipt(orderId, userId, source)`.
- `confirmReceipt` writes `receiptConfirmedAt`, `receiptConfirmedBy`, `completeTime`, and `settlementEligibleAt` atomically.

- [ ] **Step 1: Write failing transition tests**

```ts
it('never lets a rider complete an errand', async () => {
  await expect(service.riderTransition('o1', 'r1', { status: 'completed' }))
    .rejects.toThrow('骑手只能标记送达');
});

it('confirms only the owner arrived order without a hold', async () => {
  const result = await service.confirmReceipt('o1', 'u1', 'user');
  expect(result.status).toBe('completed');
  expect(result.receiptConfirmedBy).toBe('user');
});
```

Also test wrong owner, refunding, open appeal, blocking risk event, duplicate confirmation, and missing required delivery proof.

- [ ] **Step 2: Run and confirm the old direct-complete behavior fails the contract**

Run: `cd backend && /opt/homebrew/opt/node@22/bin/npm test -- --runInBand src/modules/errand/errand-lifecycle.service.spec.ts`

Expected: FAIL because riders can currently write `completed` and confirmation does not exist.

- [ ] **Step 3: Implement guarded named methods**

Do not add a generic framework. Each method must use `updateMany` with exact old status and refund constraints, then write `DeliveryOrderNode` in the same transaction. `markArrived` sets `deliverTime`, `receiptConfirmDeadline = now + 24h`, and releases the rider only after counting other active orders. After commit, dispatch user/rider notifications for accepted, in-progress, arrived, and completed scenes; notification failure must never roll back the order transition.

- [ ] **Step 4: Add confirmation route and delegate old rider status route**

```ts
@Post('errand/order/:orderId/confirm-receipt')
@UseGuards(JwtGuard)
@ApiBearerAuth()
confirmReceipt(@Param('orderId') orderId: string, @CurrentUser('sub') userId: string) {
  return this.errandService.confirmReceipt(orderId, userId);
}
```

The compatibility rider-status route maps `in_progress` and `arrived`; it rejects `completed` before touching Prisma.

- [ ] **Step 5: Verify and commit**

Run: `cd backend && /opt/homebrew/opt/node@22/bin/npm test -- --runInBand src/modules/errand/errand-lifecycle.service.spec.ts src/modules/errand/errand.service.shop-delivery.spec.ts`

Expected: lifecycle and shared rider-delivery tests pass.

```bash
git add backend/src/modules/errand/errand-lifecycle.service.ts backend/src/modules/errand/errand-lifecycle.service.spec.ts backend/src/modules/errand/errand.module.ts backend/src/modules/errand/errand.service.ts backend/src/modules/errand/errand.controller.ts
git commit -m "feat(errand): require user receipt confirmation"
```

---

### Task 5: Add appeal-aware 24-hour auto receipt

**Files:**
- Modify: `backend/src/modules/errand/errand-lifecycle.service.ts`
- Create: `backend/src/modules/errand/errand-auto-receipt.spec.ts`
- Modify: `backend/src/modules/errand/errand.service.ts:1-80`

**Interfaces:**
- Produces `autoConfirmDueOrders(now = new Date()): Promise<{ checked: number; completed: number; held: number }>`.
- Reuses the existing Redis cron-lock pattern and `NotifyService` retryable delivery.

- [ ] **Step 1: Write failing auto-receipt tests**

```ts
it('auto-confirms an arrived order after its deadline', async () => {
  const result = await service.autoConfirmDueOrders(now);
  expect(result.completed).toBe(1);
  expect(prisma.errandOrder.updateMany).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({ status: 'arrived' }),
  }));
});

it.each(['open appeal', 'refunding', 'blocking risk'])('holds auto receipt for %s', async () => {
  const result = await heldService.autoConfirmDueOrders(now);
  expect(result.completed).toBe(0);
  expect(result.held).toBe(1);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `cd backend && /opt/homebrew/opt/node@22/bin/npm test -- --runInBand src/modules/errand/errand-auto-receipt.spec.ts`

Expected: FAIL because no errand auto-receipt job exists.

- [ ] **Step 3: Implement a batch of at most 100 due orders**

Query due `arrived` orders, query open appeal IDs and unhandled blocking risk IDs once per batch, skip held orders, and call `confirmReceipt(orderId, userId, 'system')` through a system-only internal path. Use a Redis lock key `errand:auto-receipt` and a 10-minute cron interval.

- [ ] **Step 4: Persist and dispatch confirmation notices**

Create notification scene `errand_order_auto_received` linking to `/pagesA/order/errand-detail/errand-detail?order_id=<id>`. Notification failure must not revert the confirmed order; the existing notification retry service handles failed channels.

- [ ] **Step 5: Verify and commit**

Run: `cd backend && /opt/homebrew/opt/node@22/bin/npm test -- --runInBand src/modules/errand/errand-auto-receipt.spec.ts src/modules/notify/notify.service.spec.ts`

```bash
git add backend/src/modules/errand/errand-lifecycle.service.ts backend/src/modules/errand/errand-auto-receipt.spec.ts backend/src/modules/errand/errand.service.ts
git commit -m "feat(errand): auto-confirm unchallenged deliveries"
```

---

### Task 6: Make refunds channel-aware and reversible

**Files:**
- Modify: `backend/src/modules/payment/payment.service.ts:993-1100`
- Modify: `backend/src/modules/payment/payment.service.ts:1284-1351`
- Modify: `backend/src/modules/payment/payment.service.spec.ts`
- Modify: `backend/src/modules/errand/errand.service.ts:1806-1880`
- Modify: `/Users/nianbaidediannao/Desktop/前端文件/pagesA/order/order.js:315-365,980-995`

**Interfaces:**
- Produces a `balance` branch in `PaymentService.refund` with the same `PaymentRefund` and business-finalization contract as WeChat.
- Produces idempotent full/partial refund behavior for errand orders.

- [ ] **Step 1: Write failing balance refund tests**

```ts
it('refunds a balance payment without calling WeChat', async () => {
  prisma.paymentOrder.findFirst.mockResolvedValue({ ...paid, channel: 'balance', wxTransId: null });
  await service.refund({ bizType: 'errand_order', bizId: 'o1', amount: 8, reason: '取消' });
  expect(wxPayRequest).not.toHaveBeenCalled();
  expect(prisma.walletTransaction.create).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ type: 'REFUND', channel: 'BALANCE' }),
  }));
});

it('does not credit a duplicate balance refund', async () => {
  await service.refund(refundDto);
  await expect(service.refund(refundDto)).rejects.toThrow('没有可退款金额');
});
```

- [ ] **Step 2: Run and confirm the current WeChat-only branch fails**

Run: `cd backend && /opt/homebrew/opt/node@22/bin/npm test -- --runInBand src/modules/payment/payment.service.spec.ts -t "balance payment"`

Expected: FAIL because refund calls WeChat with a missing transaction ID.

- [ ] **Step 3: Implement balance and free branches**

Within one Prisma transaction: conditionally claim the refund record, increment wallet balance and `totalIn`, read the new balance, write `WalletTransaction` with `REFUND/BALANCE`, update `PaymentOrder.refundedAmount/status`, call `markBizRefunded`, and write a `PlatformLedger` refund with channel `balance`. The `free` branch only restores reserved benefits and finalizes business state.

- [ ] **Step 4: Correct cancellation and frontend payment selection**

If refund dispatch fails, leave `refundStatus='refunding'`, persist failure, and create a risk event. In `order.js`, show balance payment only when `selectedOrder.type === 'errand'`; never call payment APIs when amount is zero.

- [ ] **Step 5: Verify and commit**

Run:

```bash
cd backend && /opt/homebrew/opt/node@22/bin/npm test -- --runInBand src/modules/payment/payment.service.spec.ts src/modules/errand/errand-lifecycle.service.spec.ts
/opt/homebrew/opt/node@22/bin/node --check /Users/nianbaidediannao/Desktop/前端文件/pagesA/order/order.js
```

```bash
git add backend/src/modules/payment/payment.service.ts backend/src/modules/payment/payment.service.spec.ts backend/src/modules/errand/errand.service.ts
git commit -m "fix(payment): refund errand balance payments in channel"
```

---

### Task 7: Tie appeals to refund, compensation, penalty, and settlement holds

**Files:**
- Modify: `backend/src/modules/order-appeal/dto/order-appeal.dto.ts:20-26`
- Modify: `backend/src/modules/order-appeal/order-appeal.service.ts:258-330,476-525`
- Modify: `backend/src/modules/order-appeal/order-appeal.service.spec.ts`
- Modify: `backend/src/modules/payment/payment.service.ts`

**Interfaces:**
- Extends `UpdateOrderAppealDto` with `resolutionAction`, `refundAmount`, and `riderPenaltyAmount`.
- Produces idempotent action execution keyed by the appeal event ID.

- [ ] **Step 1: Write failing resolution tests**

```ts
it('keeps an appeal processing until refund dispatch is recorded', async () => {
  paymentService.refund.mockResolvedValue({ refundNo: 'REF-1', status: 'processing' });
  const result = await service.updateAppeal('admin-1', 'a1', {
    status: 'resolved', reply: '同意退款', resolutionAction: 'full_refund', refundAmount: 8,
  });
  expect(result.status).toBe('processing');
});

it('records a platform compensation without changing refunded amount', async () => {
  await service.updateAppeal('admin-1', 'a1', {
    status: 'resolved', reply: '平台补偿', resolutionAction: 'compensate_user', refundAmount: 3,
  });
  expect(prisma.walletTransaction.create).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ type: 'REWARD' }),
  }));
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `cd backend && /opt/homebrew/opt/node@22/bin/npm test -- --runInBand src/modules/order-appeal/order-appeal.service.spec.ts`

Expected: FAIL because resolution actions are not implemented.

- [ ] **Step 3: Add validated resolution DTOs and idempotent event actions**

Accept only `no_action/full_refund/partial_refund/compensate_user/penalize_rider`. Require positive finite amounts: refund actions cannot exceed the payment's remaining refundable amount, platform compensation cannot exceed the order's `payAmount`, and rider penalty cannot exceed the settlement item's `payableAmount`. Execute every action with an appeal-event source key and reject duplicate action execution.

- [ ] **Step 4: Keep hold semantics derived from appeal status**

Every confirmation and settlement query must exclude `pending`, `processing`, and `waiting_user`. A resolved/rejected appeal releases the hold only after its required money action has a durable success or retry record.

- [ ] **Step 5: Verify and commit**

Run: `cd backend && /opt/homebrew/opt/node@22/bin/npm test -- --runInBand src/modules/order-appeal/order-appeal.service.spec.ts src/modules/payment/payment.service.spec.ts`

```bash
git add backend/src/modules/order-appeal/dto/order-appeal.dto.ts backend/src/modules/order-appeal/order-appeal.service.ts backend/src/modules/order-appeal/order-appeal.service.spec.ts backend/src/modules/payment/payment.service.ts
git commit -m "feat(errand): bind appeal resolutions to money actions"
```

---

### Task 8: Generate traceable settlements and post-payment liabilities

**Files:**
- Modify: `backend/src/modules/finance-admin/finance-admin.service.ts:115-155,1445-1475`
- Modify: `backend/src/modules/finance-admin/finance-admin.service.spec.ts`
- Modify: `backend/src/modules/payment/payment.service.ts:1284-1351`
- Modify: `backend/src/modules/finance-admin/finance-admin.controller.ts`

**Interfaces:**
- Produces `RiderSettlementItem` rows before settlement totals.
- Produces `reverseErrandSettlement(orderId, refundId, amount, reason)` and outstanding `RiderLiability` recovery.

- [ ] **Step 1: Write failing settlement eligibility tests**

```ts
it('settles only confirmed, cooled-down, unchallenged errand orders', async () => {
  await service.generateRiderSettlements(start, end, 'admin-1');
  expect(prisma.riderSettlementItem.create).toHaveBeenCalledTimes(1);
  expect(prisma.riderSettlementItem.create).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ orderId: 'eligible-order' }),
  }));
});

it('creates one liability when an already-paid item is refunded', async () => {
  await service.reverseErrandSettlement('o1', 'r1', 8, '退款');
  await service.reverseErrandSettlement('o1', 'r1', 8, '退款');
  expect(prisma.riderLiability.upsert).toHaveBeenCalledTimes(2);
  expect(prisma.riderLiability.count()).resolves.toBe(1);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `cd backend && /opt/homebrew/opt/node@22/bin/npm test -- --runInBand src/modules/finance-admin/finance-admin.service.spec.ts`

Expected: FAIL because settlements currently aggregate completed orders without receipt or appeal gates.

- [ ] **Step 3: Build settlement items first, aggregate second**

Filter `completed`, non-null `receiptConfirmedAt`, due `settlementEligibleAt`, non-refunding orders, no open appeal, no blocking risk, and no existing settlement item. Create item rows and settlement in one transaction; compute header totals exclusively from created items.

- [ ] **Step 4: Add reversal and liability recovery**

Before settlement payment, mark the item reversed and recompute the pending settlement. After payment, create/upsert the liability, reject withdrawals while liability is open, and subtract recoverable liability from future settlement payable amounts before wallet credit.

- [ ] **Step 5: Verify and commit**

Run: `cd backend && /opt/homebrew/opt/node@22/bin/npm test -- --runInBand src/modules/finance-admin/finance-admin.service.spec.ts src/modules/payment/payment.service.spec.ts`

```bash
git add backend/src/modules/finance-admin/finance-admin.service.ts backend/src/modules/finance-admin/finance-admin.service.spec.ts backend/src/modules/finance-admin/finance-admin.controller.ts backend/src/modules/payment/payment.service.ts
git commit -m "feat(finance): trace and reverse errand settlements"
```

---

### Task 9: Close privacy, region scope, assignment, transfer, and location authorization

**Files:**
- Create: `backend/src/modules/errand/errand-privacy.ts`
- Create: `backend/src/modules/errand/errand-privacy.spec.ts`
- Modify: `backend/src/modules/errand/errand.service.ts:2366-2503,2681-2697,3083-3215`
- Modify: `backend/src/modules/errand/errand.controller.ts:100-102,173-203`
- Modify: `backend/src/modules/errand-admin/errand-admin.service.ts:1-30,440-474`
- Modify: `backend/src/modules/errand-admin/errand-admin.module.ts`
- Create: `backend/src/modules/errand-admin/errand-admin.lifecycle.spec.ts`

**Interfaces:**
- Produces `publicErrandProjection`, `poolErrandProjection`, and `assignedErrandProjection`.
- Admin service consumes `AdminDataScopeService` and `ErrandLifecycleService`.

- [ ] **Step 1: Write failing privacy and authorization tests**

```ts
it('never exposes contact data or pickup code in a pool order', () => {
  const value = poolErrandProjection(orderWithSecrets);
  expect(JSON.stringify(value)).not.toContain('13800138000');
  expect(JSON.stringify(value)).not.toContain('PICKUP-8899');
});

it('rejects rider location reads without an active related order', async () => {
  await expect(service.getRiderLocation('viewer-1', 'rider-1', undefined))
    .rejects.toThrow('无权查看骑手位置');
});

it('rejects cross-region admin assignment and rider transfer', async () => {
  await expect(admin.assignOrder('o1', { riderId: 'r2' }, 'region-admin'))
    .rejects.toThrow('无权操作该区域');
});
```

- [ ] **Step 2: Run and confirm leaks/unguarded paths fail**

Run: `cd backend && /opt/homebrew/opt/node@22/bin/npm test -- --runInBand src/modules/errand/errand-privacy.spec.ts src/modules/errand-admin/errand-admin.lifecycle.spec.ts`

- [ ] **Step 3: Implement status-aware projections and guarded routes**

Public completed feed contains only service type, coarse region label, amount band, time, and anonymous rider. Pool feed contains coarse pickup/delivery labels and fee but no exact address, phone, code, raw task metadata, or coordinates. Full assigned projection requires owner, assigned rider, or scoped admin.

- [ ] **Step 4: Delegate admin and transfer operations**

Inject `AdminDataScopeService`; resolve operator scope before list/detail/write operations. Replace raw admin cancel/assign updates with lifecycle methods. Require same region, approved/online/non-frozen rider, capacity, risk permission, and CAS order state for normal assign and transfer.

- [ ] **Step 5: Verify and commit**

Run: `cd backend && /opt/homebrew/opt/node@22/bin/npm test -- --runInBand src/modules/errand/errand-privacy.spec.ts src/modules/errand-admin/errand-admin.lifecycle.spec.ts && /opt/homebrew/opt/node@22/bin/node ../node_modules/typescript/bin/tsc --noEmit --incremental false --project tsconfig.json`

```bash
git add backend/src/modules/errand/errand-privacy.ts backend/src/modules/errand/errand-privacy.spec.ts backend/src/modules/errand/errand.service.ts backend/src/modules/errand/errand.controller.ts backend/src/modules/errand-admin/errand-admin.service.ts backend/src/modules/errand-admin/errand-admin.module.ts backend/src/modules/errand-admin/errand-admin.lifecycle.spec.ts
git commit -m "fix(errand): enforce privacy and regional lifecycle scope"
```

---

### Task 10: Finish user and rider mini-program flows

**Files:**
- Modify: `/Users/nianbaidediannao/Desktop/前端文件/api/lmapi.js:1830-2320`
- Modify: `/Users/nianbaidediannao/Desktop/前端文件/pagesA/order/errand-detail/errand-detail.js`
- Modify: `/Users/nianbaidediannao/Desktop/前端文件/pagesA/order/errand-detail/errand-detail.wxml`
- Modify: `/Users/nianbaidediannao/Desktop/前端文件/pagesA/order/errand-detail/errand-detail.wxss`
- Modify: `/Users/nianbaidediannao/Desktop/前端文件/pagesA/Grab/Grab.js`
- Modify: `/Users/nianbaidediannao/Desktop/前端文件/pagesA/Grab/Grab.wxml`
- Create: `/Users/nianbaidediannao/Desktop/前端文件/minitest/errand-receipt-closure.test.cjs`

**Interfaces:**
- Adds `confirmErrandReceipt(orderId)` and `quoteErrandOrder(data)` API wrappers.
- User UI consumes `allowed_actions`, `receipt_confirm_deadline`, `settlement_state`, and hold reasons.

- [ ] **Step 1: Write failing static/runtime-contract tests**

```js
test('errand detail exposes receipt confirmation and hold messaging', () => {
  assert.match(detailJs, /confirmErrandReceipt/)
  assert.match(detailWxml, /确认收货/)
  assert.match(detailWxml, /自动确认/)
})

test('rider UI can mark arrived but never completed', () => {
  assert.match(grabJs, /status:\s*["']arrived["']/)
  assert.doesNotMatch(grabJs, /status:\s*["']completed["']/)
})
```

- [ ] **Step 2: Run and confirm failure**

Run: `cd /Users/nianbaidediannao/Desktop/前端文件 && /opt/homebrew/opt/node@22/bin/node --test minitest/errand-receipt-closure.test.cjs`

- [ ] **Step 3: Implement user confirmation and countdown**

Show `arrived` as “已送达，等待确认”. Display a deadline countdown; when expired, show “系统确认处理中” until refreshed data becomes completed. Confirmation uses a modal, a submission lock, and reloads server state. If `allowed_actions.confirm_receipt` is false, hide the button and show the returned hold reason.

- [ ] **Step 4: Implement evidence-aware rider delivery**

Render backend `required_evidence`; require the specified image/location/remark fields before calling rider status with `arrived`. Remove every rider path that submits `completed`. Refresh the order after transition instead of assuming success locally.

- [ ] **Step 5: Verify and record separate-tree changes**

Run:

```bash
cd /Users/nianbaidediannao/Desktop/前端文件
/opt/homebrew/opt/node@22/bin/node --test minitest/errand-receipt-closure.test.cjs minitest/errand-phase-one.test.cjs minitest/errand-phase-two.test.cjs
/opt/homebrew/opt/node@22/bin/node --check pagesA/order/errand-detail/errand-detail.js
/opt/homebrew/opt/node@22/bin/node --check pagesA/Grab/Grab.js
```

Expected: all selected tests and syntax checks pass. Commit in the frontend repository only if `git rev-parse --is-inside-work-tree` confirms it is a repository; otherwise report the exact changed files without staging them from the backend repository.

---

### Task 11: Expose safe operations, reviews, alerts, and closure configuration in admin

**Files:**
- Modify: `admin/src/api/errand.ts`
- Modify: `admin/src/views/delivery/ErrandOrdersPage.vue`
- Modify: `admin/src/views/delivery/AbnormalOrders.vue`
- Modify: `admin/src/views/delivery/PricingRules.vue`
- Modify: `backend/src/modules/errand-admin/errand-admin.service.ts`
- Modify: `backend/src/modules/errand/errand.service.ts`
- Modify: `backend/src/modules/errand/errand-config.util.ts`
- Modify: `backend/src/modules/errand/errand-config.util.spec.ts`
- Modify: `backend/src/modules/errand-admin/dto/errand-admin.dto.ts`
- Create: `backend/src/modules/errand/errand-review.spec.ts`
- Create: `admin/src/views/delivery/errand-closure.contract.spec.ts`

**Interfaces:**
- Order detail returns `allowedActions`, price breakdown, receipt, hold, refund, settlement item, liability, and timeline fields.
- Produces create/read review endpoints backed by `ErrandReview`.

- [ ] **Step 1: Write failing admin/review contracts**

```ts
it('allows one review only after confirmed receipt', async () => {
  await expect(service.createReview('u1', 'arrived-order', { rating: 5 })).rejects.toThrow('确认收货后才能评价');
  await expect(service.createReview('u1', 'completed-order', { rating: 5 })).resolves.toMatchObject({ rating: 5 });
});

it('returns server-owned allowed actions', async () => {
  const detail = await admin.getOrderDetail('o1', 'admin-1');
  expect(detail.allowedActions).toEqual(expect.objectContaining({ assign: expect.any(Boolean), cancel: expect.any(Boolean) }));
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `cd backend && /opt/homebrew/opt/node@22/bin/npm test -- --runInBand src/modules/errand/errand-review.spec.ts`

- [ ] **Step 3: Implement minimal review and actionable risk events**

Allow one 1-5 star review from the order owner after confirmed receipt and before full refund. Evaluate each configured rule once: `goodReviewReward` for 5 stars, `badReviewPenalty` for 1-2 stars, `timeoutPenalty` when delivery exceeds `timeoutMinutes`, and `nightReward` when pickup occurs from 22:00 through 05:59 in Asia/Shanghai. Persist an `IncentiveRecord` with order ID and rule type, and include its amount in settlement items. Create risk events for refund failure, overdue delivery, evidence rejection, cross-region transfer attempts, auto-receipt holds over 48 hours, and reversal failure.

- [ ] **Step 4: Make admin actions server-driven**

Render buttons only from `allowedActions`. Detail drawer must show pricing snapshot, proof, receipt deadline/source, appeal hold, refund attempts, settlement item, and liability. Add `closureVersion`, `autoReceiptEnabled`, and `settlementV2Enabled` to the existing extended-config allowlist/normalizer, admin DTO, API response, and PricingRules form; cover round-trip normalization in `errand-config.util.spec.ts`. The abnormal page provides retry notification/refund/auto-receipt domain actions, never raw status editing.

- [ ] **Step 5: Verify and commit**

Run:

```bash
cd backend && /opt/homebrew/opt/node@22/bin/npm test -- --runInBand src/modules/errand/errand-review.spec.ts src/modules/errand-admin/errand-admin.lifecycle.spec.ts
cd ../admin && /opt/homebrew/opt/node@22/bin/npm run typecheck && /opt/homebrew/opt/node@22/bin/npm run build
```

```bash
git add admin/src/api/errand.ts admin/src/views/delivery/ErrandOrdersPage.vue admin/src/views/delivery/AbnormalOrders.vue admin/src/views/delivery/PricingRules.vue backend/src/modules/errand-admin/errand-admin.service.ts backend/src/modules/errand-admin/dto/errand-admin.dto.ts backend/src/modules/errand/errand.service.ts backend/src/modules/errand/errand-config.util.ts backend/src/modules/errand/errand-config.util.spec.ts backend/src/modules/errand/errand-review.spec.ts admin/src/views/delivery/errand-closure.contract.spec.ts
git commit -m "feat(errand): add closure operations and rider reviews"
```

---

### Task 12: Repair legacy data safely and run the full acceptance gate

**Files:**
- Create: `backend/scripts/audit-errand-closure.cjs`
- Create: `backend/scripts/backfill-errand-receipts.cjs`
- Create: `backend/src/modules/errand/errand-closure.integration.spec.ts`
- Modify: `docs/superpowers/specs/2026-07-22-errand-closed-loop-design.md`
- Modify: `docs/市场版总审计报告.md`

**Interfaces:**
- Audit script is read-only and reports legacy arrived/completed/refund/appeal/settlement conflicts.
- Backfill script requires `--apply`, updates only receipt fields, and never creates new settlement items.

- [ ] **Step 1: Write the failing script and integration contracts**

```js
test('backfill defaults to dry-run and requires explicit apply', async () => {
  const result = await runBackfill([])
  assert.equal(result.applied, false)
  assert.equal(prisma.errandOrder.updateMany.mock.calls.length, 0)
})
```

Integration tests must cover two-rider concurrent acceptance, rider-arrived/user-confirmed flow, auto receipt with an open-appeal hold, balance full/partial refund, settlement exclusion, and paid-settlement liability creation.

- [ ] **Step 2: Run and confirm failure**

Run: `cd backend && /opt/homebrew/opt/node@22/bin/npm test -- --runInBand src/modules/errand/errand-closure.integration.spec.ts`

- [ ] **Step 3: Implement dry-run audit and guarded backfill**

`audit-errand-closure.cjs` outputs JSON counts and order IDs for: arrived without deadline, completed without receipt source, completed with open appeal, refunding over 30 minutes, historical settlement JSON without item links, and unknown custom-budget units. `backfill-errand-receipts.cjs` updates arrived deadlines and completed receipt timestamps/sources only when `--apply` is present; `settlementEligibleAt` remains null for legacy completed orders.

- [ ] **Step 4: Run automated verification**

Run:

```bash
cd backend
/opt/homebrew/opt/node@22/bin/npm run db:sync-schemas -- --check
/opt/homebrew/opt/node@22/bin/npm test -- --runInBand src/modules/errand src/modules/payment/payment.service.spec.ts src/modules/order-appeal/order-appeal.service.spec.ts src/modules/finance-admin/finance-admin.service.spec.ts
/opt/homebrew/opt/node@22/bin/npm run build
cd ../admin
/opt/homebrew/opt/node@22/bin/npm run typecheck
/opt/homebrew/opt/node@22/bin/npm run build
cd /Users/nianbaidediannao/Desktop/前端文件
/opt/homebrew/opt/node@22/bin/node --test minitest/errand-*.test.cjs minitest/ordinary-user-order-taking.test.cjs minitest/order-appeal-closure.test.cjs
```

Expected: zero test failures, backend build exits 0, admin typecheck/build exit 0, and schema variants are synchronized.

- [ ] **Step 5: Run and record runtime acceptance separately**

Against one real PostgreSQL test region: run a 50-request same-order acceptance race and require exactly one success/one accept node; exercise WeChat sandbox pay/refund and balance pay/refund; verify user confirmation, shortened auto-receipt timing, appeal hold, settlement item, and paid-item liability. In WeChat DevTools and one real device, verify weak network, duplicate taps, app restart, payment cancellation, location denial, and notification denial.

Update the design/audit documents using these exact evidence labels: `implemented`, `verified locally`, `verified with real PostgreSQL concurrency`, `verified in WeChat sandbox`, `verified in DevTools/device`, `pending deployment`.

- [ ] **Step 6: Commit scripts, tests, and evidence-only documentation**

```bash
git add backend/scripts/audit-errand-closure.cjs backend/scripts/backfill-errand-receipts.cjs backend/src/modules/errand/errand-closure.integration.spec.ts docs/superpowers/specs/2026-07-22-errand-closed-loop-design.md docs/市场版总审计报告.md
git commit -m "test(errand): add closed-loop audit and acceptance gates"
```

---

## Execution Order and Stop Conditions

Execute Tasks 1-3 before changing lifecycle semantics, Tasks 4-6 before enabling `closureVersion=2`, Tasks 7-9 before enabling new settlements, and Tasks 10-11 before publishing the mini-program/admin UI. Task 12 is mandatory before any launch claim.

Stop and do not enable the affected feature flag if any of these occur:

- schema migration cannot be applied and rolled forward on a copied test database;
- a client-controlled amount changes persisted `payAmount`;
- more than one concurrent acceptance succeeds;
- a rider can still write `completed`;
- an open appeal or refunding order auto-confirms or settles;
- a balance refund calls WeChat or credits twice;
- an unrelated user can read exact address, phone, code, or rider location;
- a paid settlement refund has no unique reversal/liability record.

## Spec Coverage Self-Review

| Design requirement | Implementation tasks |
|---|---|
| Additive receipt, settlement, liability, review models | Task 1 |
| Server-owned pricing, distance/weight/time rules, zero-pay, budget safety | Tasks 2-3 |
| Single lifecycle writer, rider delivery, user confirmation | Task 4 |
| Appeal/risk-aware 24-hour auto receipt and notifications | Task 5 |
| WeChat/balance/free refund closure | Task 6 |
| Appeal resolution, compensation, penalty, and holds | Task 7 |
| Settlement eligibility, unique source rows, reversal, liability | Task 8 |
| Privacy projections, region scope, location, assignment, transfer | Task 9 |
| Mini-program user/rider behavior and evidence | Task 10 |
| Admin allowed actions, reward rules, reviews, risk operations, flags | Task 11 |
| Legacy audit/backfill, rollback evidence, concurrency and runtime gates | Task 12 |
