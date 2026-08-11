# Order and Refund Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make errand delivery completion and refund processing an end-to-end, user-visible and operator-actionable state machine.

**Architecture:** The backend remains the single source of truth for fulfillment and refund transitions. It returns lifecycle truth to the UniApp X client, while the existing admin refund endpoints remain the sole refund-action surface and gain an operator detail view. Existing payment callback and idempotent transaction paths stay authoritative for financial success.

**Tech Stack:** NestJS, Prisma, Jest, Vue 3/Element Plus, UniApp X/UTS, Node test runner.

## Global Constraints

- Do not alter `前端文件`; it is compiled behavior evidence. Implement user-facing source changes in `/Users/nianbaidediannao/Desktop/校小伴UniAppX` and commit there separately.
- Never mark a WeChat refund successful before the signed callback or an active channel query confirms success.
- Retain existing transaction models and existing conditional updates; do not add parallel payment/refund records.
- Historical repair is read-only/dry-run only. No `--apply`, migration, deployment, or real payment/refund test without separate approval.
- Do not stage unrelated existing worktree changes.

---

### Task 1: Return authoritative errand lifecycle truth

**Files:**
- Modify: `backend/src/modules/errand/errand.service.ts:formatMiniOrders`
- Modify: `backend/src/modules/errand/errand.service.shop-delivery.spec.ts`
- Modify: `backend/src/modules/errand/errand-lifecycle.service.ts:confirmReceipt`
- Modify: `backend/src/modules/errand/errand-lifecycle.service.spec.ts`

**Interfaces:**
- Add compatible `order_lifecycle`: `{ fulfillment_status, fulfillment_label, refund_status, refund_label, receipt_action: { allowed, reason } }`.
- Keep `raw_status`, `status`, and `refund_status` intact.

- [ ] **Step 1: Write the failing lifecycle-payload tests**

```ts
expect(order.order_lifecycle).toEqual(expect.objectContaining({
  fulfillment_status: 'arrived',
  fulfillment_label: '已送达，待确认收货',
  refund_status: 'none',
  receipt_action: { allowed: true, reason: '' },
}));
expect(refundingOrder.order_lifecycle.receipt_action).toEqual({
  allowed: false,
  reason: '订单退款处理中，不能确认收货',
});
```

- [ ] **Step 2: Run red**

Run: `npm --prefix backend test -- --runInBand src/modules/errand/errand.service.shop-delivery.spec.ts src/modules/errand/errand-lifecycle.service.spec.ts`

Expected: FAIL because the lifecycle object is absent.

- [ ] **Step 3: Add the smallest shared lifecycle formatter**

```ts
private miniOrderLifecycle(status: string, refundStatus: string) {
  return {
    fulfillment_status: status,
    fulfillment_label: status === 'arrived' ? '已送达，待确认收货' : lifecycleLabel(status),
    refund_status: refundStatus,
    refund_label: refundLabel(refundStatus),
    receipt_action: { allowed: status === 'arrived' && refundStatus === 'none', reason: '' },
  }
}
```

Use it in `formatMiniOrders`; for a single detail query override `receipt_action` after checking appeal/risk holds using the same messages as `confirmReceipt`. Keep the existing conditional update, node insertion, timestamps, and rider limit of `arrived`.

- [ ] **Step 4: Run green**

Run: `npm --prefix backend test -- --runInBand src/modules/errand/errand.service.shop-delivery.spec.ts src/modules/errand/errand-lifecycle.service.spec.ts`

Expected: PASS; arrived has one allowed receipt action, while refund/appeal holds stay blocked.

- [ ] **Step 5: Commit only this backend task**

```bash
git add backend/src/modules/errand/errand.service.ts backend/src/modules/errand/errand.service.shop-delivery.spec.ts backend/src/modules/errand/errand-lifecycle.service.ts backend/src/modules/errand/errand-lifecycle.service.spec.ts
git commit -m "fix: expose errand lifecycle state"
```

### Task 2: Make UniApp X list and detail honor backend truth

**Files:**
- Modify: `/Users/nianbaidediannao/Desktop/校小伴UniAppX/services/errand/errand-endpoints.uts`
- Modify: `/Users/nianbaidediannao/Desktop/校小伴UniAppX/packages/errand/pages/orders.uvue`
- Modify: `/Users/nianbaidediannao/Desktop/校小伴UniAppX/packages/errand/pages/order-detail.uvue`
- Modify: `/Users/nianbaidediannao/Desktop/校小伴UniAppX/tests/unit/services/errand/errand-endpoints.test.js`
- Create: `/Users/nianbaidediannao/Desktop/校小伴UniAppX/tests/component/errand-order-lifecycle.contract.test.js`

**Interfaces:**
- Parse backend lifecycle fields as `statusText`, `refundText`, `receiptActionAllowed`, and `receiptActionReason`.
- Detail actions use `receiptActionAllowed`, never `status === 'completed'`.

- [ ] **Step 1: Write failing parser and page-contract tests**

```js
assert.equal(parseErrandOrder(arrivedRaw).statusText, '已送达，待确认收货')
assert.equal(parseErrandOrderDetail(arrivedRaw).receiptActionAllowed, true)
assert.match(detailSource, /receiptActionAllowed/)
assert.doesNotMatch(detailSource, /status === 'completed'/)
```

- [ ] **Step 2: Run red**

Run: `npm test -- --test-name-pattern='errand lifecycle|receipt action'`

Expected: FAIL because confirmation is currently guarded by `status === 'completed'`.

- [ ] **Step 3: Parse and render lifecycle values**

```ts
const receipt = raw.order_lifecycle?.receipt_action
return {
  ...base,
  statusText: raw.order_lifecycle?.fulfillment_label ?? statusText(raw.status),
  refundText: raw.order_lifecycle?.refund_label ?? '',
  receiptActionAllowed: receipt?.allowed === true,
  receiptActionReason: receipt?.reason ?? '',
}
```

Render the status/refund values and blocked reason. Preserve old-payload display fallback, but do not infer confirmation eligibility locally. Surface backend action failure messages.

- [ ] **Step 4: Run green and structure checks**

Run: `npm run test:unit -- --test-name-pattern='errand' && npm run test:component -- --test-name-pattern='errand lifecycle' && npm run verify:structure`

Expected: PASS; arrived enables confirmation, completed does not show confirmation, and a refund hold reason is visible.

- [ ] **Step 5: Commit in the UniApp X repository only**

```bash
git add services/errand/errand-endpoints.uts packages/errand/pages/orders.uvue packages/errand/pages/order-detail.uvue tests/unit/services/errand/errand-endpoints.test.js tests/component/errand-order-lifecycle.contract.test.js
git commit -m "fix: show errand lifecycle truth"
```

### Task 3: Make the admin refund queue an operational surface

**Files:**
- Modify: `backend/src/modules/admin/admin.service.ts:refunds`
- Modify: `backend/src/modules/admin/admin.service.spec.ts`
- Modify: `admin/src/views/modules/RefundsPage.vue`
- Modify: `admin/src/api/admin.ts` only if its existing generic action wrapper cannot represent the backend action flags.

**Interfaces:**
- `GET /admin/refunds` returns both `order` and `errand_order` with business/user/order details, payment/channel identifiers, failure reason, and `{ approve, reject, manualComplete }` flags.
- Existing audit and complete routes remain the only action routes.

- [ ] **Step 1: Write a failing errand-refund projection test**

```ts
expect(result.list[0]).toEqual(expect.objectContaining({
  bizType: 'errand_order', orderNo: 'ERR-1', status: 'pending',
  actions: { approve: true, reject: true, manualComplete: false },
}));
```

Also assert a WeChat `processing` refund cannot be manually completed and a failed row contains `failReason`.

- [ ] **Step 2: Run red**

Run: `npm --prefix backend test -- --runInBand src/modules/admin/admin.service.spec.ts`

Expected: FAIL because errand details/action eligibility are absent.

- [ ] **Step 3: Enrich the existing projection without a new endpoint**

```ts
actions: {
  approve: r.status === 'pending',
  reject: r.status === 'pending',
  manualComplete: r.status === 'processing' && !r.wxRefundId,
}
```

Load matching errand orders in one batched query alongside shop orders. Preserve `paymentRefundRegionWhere` before search conditions.

- [ ] **Step 4: Replace the generic refunds placeholder**

Show the queue fields, a detail dialog for fulfillment evidence/payment/refund IDs/failure reason, a required rejection reason, and action buttons constrained by `actions`. A WeChat `processing` row must say “等待渠道回调/查询”, never offer manual completion.

- [ ] **Step 5: Run green and builds**

Run: `npm --prefix backend test -- --runInBand src/modules/admin/admin.service.spec.ts && npm --prefix backend run build && npm --prefix admin run build`

Expected: PASS and the refund queue compiles with regional scope retained.

- [ ] **Step 6: Commit backend and admin changes separately**

```bash
git add backend/src/modules/admin/admin.service.ts backend/src/modules/admin/admin.service.spec.ts
git commit -m "fix: expose actionable errand refunds"
git add admin/src/views/modules/RefundsPage.vue admin/src/api/admin.ts
git commit -m "fix: make refund queue actionable"
```

### Task 4: Add read-only lifecycle exception audit and final evidence

**Files:**
- Modify: `backend/scripts/audit-errand-closure.cjs`
- Create: `backend/scripts/audit-errand-closure.spec.cjs`
- Modify: `docs/superpowers/specs/2026-08-11-order-refund-closure-design.md` only to record local evidence and external gates.

**Interfaces:**
- Audit emits `completed_without_receipt`, `arrived_receipt_overdue`, `refund_stuck`, and `refund_state_mismatch` with IDs and recommended actions.
- It is read-only and exits nonzero only for query/connectivity failures.

- [ ] **Step 1: Write failing classifications**

```js
assert.deepEqual(classifyErrand({ status: 'completed', receiptConfirmedAt: null }), ['completed_without_receipt'])
assert.deepEqual(classifyErrand({ status: 'arrived', receiptConfirmDeadline: past, refundStatus: 'none' }), ['arrived_receipt_overdue'])
```

- [ ] **Step 2: Run red**

Run: `node --test backend/scripts/audit-errand-closure.spec.cjs`

Expected: FAIL because the classifications do not exist.

- [ ] **Step 3: Add read-only output only**

Use query/classification output only: no update, payment request, `--apply` argument, or mutation path.

- [ ] **Step 4: Run dry-run and final scoped verification**

Run: `node --test backend/scripts/audit-errand-closure.spec.cjs && node backend/scripts/audit-errand-closure.cjs && npm --prefix backend test -- --runInBand src/modules/errand/errand-lifecycle.service.spec.ts src/modules/errand/errand.service.shop-delivery.spec.ts src/modules/admin/admin.service.spec.ts src/modules/payment/payment.service.spec.ts && npm --prefix backend run build && npm --prefix admin run build`

Then run Task 2’s UniApp X tests. Record exact results and retain real WeChat refund, three-role DevTools/device flow, migration, deployment, and historical repair as unrun gates.

- [ ] **Step 5: Commit the audit task**

```bash
git add backend/scripts/audit-errand-closure.cjs backend/scripts/audit-errand-closure.spec.cjs docs/superpowers/specs/2026-08-11-order-refund-closure-design.md
git commit -m "feat: audit errand closure exceptions"
```

## Plan Self-Review

- Task 1 is the authoritative lifecycle contract; Task 2 fixes the currently inverted UniApp X confirmation guard; Task 3 closes the human refund-operation gap; Task 4 makes historic anomalies inspectable without unapproved writes.
- The plan deliberately excludes production deployment, real-money validation, and historical data mutation.
