# Rider Delivery Execution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add navigation, risk-based delivery proof, and delivery exception reporting to the official rider App.

**Architecture:** Reuse existing order formatters, upload API, delivery nodes, and risk events. Add one guarded rider-App exception endpoint and small pure App helpers; keep the order lifecycle authoritative on the server.

**Tech Stack:** NestJS, Prisma, Jest, UniApp, Node test runner.

## Global Constraints

- No Prisma model, migration, or new dependency.
- Proof is optional except when existing order risk metadata requires it.
- At most three proof images; exception description is 5-300 characters.
- Preserve unrelated dirty backend files.

---

### Task 1: Delivery detail contract and navigation

**Files:**
- Modify: `backend/src/modules/errand/errand.service.ts`
- Modify: `backend/src/modules/errand/errand-rider-app-detail.spec.ts`
- Modify: `骑手端app/utils.js`
- Create: `骑手端app/tests/delivery-execution.test.mjs`
- Modify: `骑手端app/pages/order-detail/order-detail.vue`

**Interfaces:**
- Produces normalized pickup/delivery coordinates and `delivery_proof_required`.
- Produces `getNavigationTarget(order, kind)` for native map launch.

- [ ] Write failing backend and App tests for coordinate/proof normalization.
- [ ] Run targeted tests and confirm the new contract is absent.
- [ ] Add the minimum formatter fields and pure navigation helper.
- [ ] Add native map buttons with address-search fallback.
- [ ] Run targeted tests.

### Task 2: Upload and submit delivery proof

**Files:**
- Create: `骑手端app/api/upload.js`
- Modify: `骑手端app/pages/order-detail/order-detail.vue`
- Modify: `骑手端app/tests/delivery-execution.test.mjs`

**Interfaces:**
- Produces `uploadImage(filePath)` returning one uploaded URL.
- Status submission sends `proof_images`, location, and remark.

- [ ] Write a failing test for proof requirement validation.
- [ ] Run it and confirm failure.
- [ ] Implement a pure `validateDeliveryProof` helper.
- [ ] Add choose/remove/preview/upload behavior using `uni.chooseImage` and existing `/upload`.
- [ ] Run App tests.

### Task 3: Delivery exception endpoint and App form

**Files:**
- Modify: `backend/src/modules/rider-app/rider-app.service.ts`
- Modify: `backend/src/modules/rider-app/rider-app.controller.ts`
- Modify: `backend/src/modules/rider-app/rider-app.service.spec.ts`
- Modify: `backend/src/modules/rider-app/rider-app.controller.spec.ts`
- Modify: `骑手端app/api/rider.js`
- Modify: `骑手端app/pages/order-detail/order-detail.vue`

**Interfaces:**
- Produces `POST /rider-app/orders/:orderId/exceptions`.
- Consumes `{ type, description, proof_images }`.

- [ ] Write failing service tests for ownership, active status, input validation, and duplicate open reports.
- [ ] Run tests and confirm the endpoint is missing.
- [ ] Implement the minimal transaction writing `DeliveryRiskEvent` and `DeliveryOrderNode`.
- [ ] Add the guarded controller method.
- [ ] Add a compact exception form to the order detail page.
- [ ] Run targeted tests.

### Task 4: Integrated verification

**Files:**
- Modify only files required to correct introduced failures.

- [ ] Run backend targeted tests, full Jest suite, TypeScript, and lint.
- [ ] Run App Node tests and HBuilderX iOS simulator compile/launch.
- [ ] Inspect the order detail UI and commit only intended backend/admin files.

