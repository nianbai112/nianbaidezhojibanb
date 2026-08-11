# Rider App Control Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the phase-one rider App control center, public bootstrap configuration, and a non-blank App startup path.

**Architecture:** Reuse the existing `Config` and `AdminOperationLog` persistence. Add a typed rider control value in the system-config module, expose one guarded admin endpoint and one safe public endpoint, add a permission-gated Vue page, and make the UniApp consume normalized bootstrap configuration from a fixed HTTPS API base.

**Tech Stack:** NestJS, Prisma, Jest, Vue 3, Element Plus, UniApp, Node test runner.

## Global Constraints

- Do not add a Prisma model or migration.
- Do not expose a remotely editable API host or secrets.
- Production API base is `https://yuntingzhe.cn/api`.
- Download URLs are empty or HTTPS; WebSocket configuration is a relative path.
- Location interval is 15-300 seconds.
- Preserve unrelated dirty files in the backend checkout.

---

### Task 1: Typed backend configuration

**Files:**
- Create: `backend/src/modules/system-config/rider-app-control.config.ts`
- Create: `backend/src/modules/system-config/rider-app-control.config.spec.ts`
- Modify: `backend/src/modules/system-config/system-config.service.ts`

**Interfaces:**
- Produces: `DEFAULT_RIDER_APP_CONTROL_CONFIG`, `normalizeRiderAppControlConfig(value)`, and `validateRiderAppControlConfig(value)`.
- Produces: `SystemConfigService.getRiderAppControlConfig()` and `saveRiderAppControlConfig(value, operatorId, ip)`.

- [ ] Write tests proving defaults are filled and caller objects cannot mutate shared defaults.
- [ ] Run the test and verify it fails because the config module is missing.
- [ ] Implement normalization with explicit scalar coercion and cloned defaults.
- [ ] Run the test and verify it passes.
- [ ] Add tests rejecting invalid versions, URLs, WebSocket paths, and location intervals.
- [ ] Run the tests and verify they fail for missing validation.
- [ ] Implement minimal validation and service persistence through the existing named-config audit path.
- [ ] Run all system-config tests.

### Task 2: Backend endpoints and permission

**Files:**
- Modify: `backend/src/modules/system-config/system-config.controller.ts`
- Modify: `backend/src/modules/system-config/system-config.module.ts`
- Create: `backend/src/modules/system-config/rider-app-control.controller.spec.ts`
- Modify: `backend/prisma/seed.ts`
- Modify: `backend/src/modules/setup/setup.service.ts`

**Interfaces:**
- Produces: `GET /admin/rider-app/config`, `PUT /admin/rider-app/config`, and public `GET /rider-app/config`.
- Produces: permission `rider-app:config`.

- [ ] Write controller tests for the safe public projection and service delegation.
- [ ] Run the tests and verify controller classes or methods are missing.
- [ ] Add guarded admin methods and a separate unguarded public controller.
- [ ] Register the public controller and add permission seed entries.
- [ ] Run targeted tests and backend type checking.

### Task 3: Admin control page

**Files:**
- Create: `admin/src/views/system/RiderAppControl.vue`
- Modify: `admin/src/router/index.ts`
- Modify: `admin/src/router/menus.ts`
- Modify: `admin/src/router/access.ts`

**Interfaces:**
- Consumes: `/admin/rider-app/config`.
- Produces: permission-gated route `/system/rider-app-control` and a single validated save action.

- [ ] Add the route, menu entry, and access rule using `rider-app:config`.
- [ ] Build the four configuration cards with existing Element Plus controls.
- [ ] Add local validation and confirmations for enabling maintenance, disabling the App, or forcing updates.
- [ ] Run admin type checking.

### Task 4: Rider App bootstrap and runtime gates

**Files:**
- Modify: `api/config.js`
- Modify: `api/request.js`
- Create: `api/app-control.js`
- Create: `tests/app-control.test.mjs`
- Modify: `package.json`
- Modify: `pages.json`
- Create: `pages/system-status/system-status.vue`
- Modify: `pages/login/login.vue`
- Modify: `pages/workbench/workbench.vue`
- Modify: `pages/messages/messages.vue`
- Modify: `pages/profile/profile.vue`

**Interfaces:**
- Produces: `loadRiderAppControl`, `getRiderAppControl`, `compareVersions`, `getStartupDecision`, and `isRiderFeatureEnabled`.
- Consumes: public `/rider-app/config`.

- [ ] Write Node tests for version comparison, normalization, and startup decisions.
- [ ] Run the tests and verify they fail because the runtime module is missing.
- [ ] Implement the minimal pure helpers and make tests pass.
- [ ] Remove the stray startup token, set the HTTPS API base, and add a 10-second request timeout.
- [ ] Load bootstrap config before session restoration and route blocking states to the status page.
- [ ] Apply order-pool, chat, income, and incentive switches to their existing pages.
- [ ] Run App tests and parse/build checks.

### Task 5: Integrated verification

**Files:**
- Modify only files required to correct failures introduced by Tasks 1-4.

**Interfaces:**
- Produces: automated test evidence and simulator evidence for phase one.

- [ ] Run targeted backend tests.
- [ ] Run the full backend test suite and backend type checking.
- [ ] Run admin type checking.
- [ ] Run rider App Node tests and HBuilderX build/simulator launch.
- [ ] Confirm the backend checkout still contains only the user's original unrelated dirty files plus this feature's intended changes.

