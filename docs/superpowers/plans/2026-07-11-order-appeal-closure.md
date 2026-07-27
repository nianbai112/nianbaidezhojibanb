# 订单申诉闭环 Implementation Plan

> **For agentic workers:** Execute inline with TDD; this live workspace is intentionally not moved to a worktree because it contains the user’s active local test line.

**Goal:** Let a user submit and track an appeal against an eligible delivery or errand order, while a region-authorized administrator can reply and resolve it.

**Architecture:** A small `order-appeal` backend module owns eligibility, ownership checks, immutable order snapshots, appeal history, and notification delivery. The mini-program uses a single page with submit/history tabs. The admin console uses one management page; it may change appeal status but never changes payment/refund state.

**Tech Stack:** NestJS, Prisma, Jest, Vue 3 + Element Plus, WeChat mini-program output, existing upload and notification APIs.

## Global Constraints

- Scope: current delivery/merchant orders and errand orders only; existing mall refund flow stays separate.
- Users can have one appeal per order; duplicate creation is rejected by a database unique constraint.
- Eligible means owned by the caller, paid/non-terminal, and not already refunding/refunded.
- Images must already be uploaded by the authenticated user through the existing upload endpoint; store only 1–6 HTTPS image URLs.
- A regional administrator may read or mutate only appeals whose `regionId` is in their server-side data scope.
- Status values are `pending`, `processing`, `resolved`, `rejected`; every mutation appends an immutable history event and notifies the user.
- No payment, refund, order-status, or user-contact data is mutated by the appeal workflow.

---

### Task 1: Backend data model and domain service

**Files:**
- Create: `backend/src/modules/order-appeal/order-appeal.service.ts`
- Create: `backend/src/modules/order-appeal/order-appeal.service.spec.ts`
- Create: `backend/src/modules/order-appeal/dto/order-appeal.dto.ts`
- Modify: `backend/prisma/schema.prisma`

**Interfaces:**
- `listEligibleOrders(userId): Promise<AppealOrderOption[]>`
- `createAppeal(userId, dto): Promise<OrderAppealView>`
- `listMyAppeals(userId): Promise<OrderAppealView[]>`
- `listAdminAppeals(operatorId, query): Promise<Page<OrderAppealView>>`
- `updateAppeal(operatorId, id, dto): Promise<OrderAppealView>`

- [ ] Write Jest tests for user ownership, terminal/refund rejection, unique duplicate rejection, region-scoped admin query, and history creation.
- [ ] Run `npm test -- order-appeal.service.spec.ts`; expect failure because the service does not exist.
- [ ] Add `OrderAppeal` and `OrderAppealEvent` Prisma models with `@@unique([orderType, orderId])`, list indexes, and a migration.
- [ ] Implement the narrow service and reuse `NotifyService.createAndDispatch` for create/update notices.
- [ ] Run the focused test and Prisma generation; expect pass.

### Task 2: HTTP endpoints and module registration

**Files:**
- Create: `backend/src/modules/order-appeal/order-appeal.controller.ts`
- Create: `backend/src/modules/order-appeal/order-appeal.admin.controller.ts`
- Create: `backend/src/modules/order-appeal/order-appeal.module.ts`
- Modify: `backend/src/app.module.ts`

**Interfaces:**
- `GET /order-appeals/eligible-orders`
- `POST /order-appeals`
- `GET /order-appeals/my`
- `GET /admin/order-appeals`
- `PATCH /admin/order-appeals/:id`

- [ ] Write controller metadata/guard tests.
- [ ] Run the focused tests; expect route/module failures.
- [ ] Add JWT user routes plus `order:view` protected admin routes; pass the admin id to server-side scope validation.
- [ ] Register the module without changing unrelated modules.
- [ ] Run focused tests and `npm run build`.

### Task 3: Mini-program appeal page

**Files:**
- Create: `pagesA/order/appeal/appeal.js`
- Create: `pagesA/order/appeal/appeal.wxml`
- Create: `pagesA/order/appeal/appeal.wxss`
- Create: `pagesA/order/appeal/appeal.json`
- Modify: `app.json`, `api/lmapi.js`, `pagesA/news/OfficialAssistant/OfficialAssistant.js`
- Test: `minitest/order-appeal-closure.test.cjs`

- [ ] Write a static contract test that requires the new API wrappers, selectable and disabled-order render states, an appeal submit path, a history tab, and a quick action targeting the page.
- [ ] Run the test; expect failure.
- [ ] Implement the page using the existing `uploadFile` API and limit images to six; show a specific disabled reason, not an unresponsive order card.
- [ ] Submit an appeal with type, description, evidence URLs and phone; on success switch to the history tab.
- [ ] Replace the official assistant’s hard-coded order route with the appeal page and remove the misleading local acknowledgement for this workflow.
- [ ] Run the static test and the existing mini-program verification command if available.

### Task 4: Admin appeal workbench

**Files:**
- Create: `admin/src/views/order/OrderAppealsPage.vue`
- Modify: `admin/src/router/index.ts`, `admin/src/router/menus.ts`
- Test: `backend/src/modules/order-appeal/order-appeal.service.spec.ts`

- [ ] Use the existing request helper and Element Plus table/drawer patterns.
- [ ] Provide filters for region/status/order number, details including evidence/history, and an update form for status/reply.
- [ ] Do not show a refund button or mutate financial values.
- [ ] Run `npm run build` in `admin` and re-run backend tests.

### Task 5: Runtime verification

- [ ] Run backend migration generation/build/tests and admin build.
- [ ] Run front-end static contract test.
- [ ] In WeChat DevTools, verify: eligible order selects; ineligible order explains why; submit produces a number; admin reply appears in history; cross-region admin cannot access it.
- [ ] Report static checks separately from the GUI/backend-runtime gate.
