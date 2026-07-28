# Rider Background Location Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add controlled native background tracking, bounded offline storage, and idempotent trajectory backfill to the official rider App.

**Architecture:** Keep location collection and queueing in a small App coordinator, add a batch rider endpoint backed by a dedicated trajectory model, and extend the existing rider-App control menu. Preserve the existing single-location endpoint for old clients.

**Tech Stack:** UniApp Vue 2, HTML5+ native location, local Android UTS foreground service, NestJS, Prisma, Jest, Node test runner.

## Global Constraints

- No third-party location dependency.
- No production database mutation.
- Track only approved official riders with active assigned orders; accept cached points for recently assigned orders within the configured backfill window.
- Preserve unrelated dirty files.

---

### Task 1: Offline queue and App batch contract

**Files:**
- Modify: `骑手端app/tests/location-tracker.test.mjs`
- Modify: `骑手端app/api/location-tracker.js`
- Modify: `骑手端app/api/rider.js`

- [x] Write failing tests for point normalization, bounded deduplication, batching, success removal, and failed-upload retention.
- [x] Run tests and confirm the new behavior is absent.
- [x] Implement storage-backed queue and `POST /rider-app/location/batch` client.
- [x] Run App tests.

### Task 2: Native lifecycle and permissions

**Files:**
- Modify: `骑手端app/api/location-tracker.js`
- Modify: `骑手端app/App.vue`
- Modify: `骑手端app/pages/workbench/workbench.vue`
- Modify: `骑手端app/pages/order-detail/order-detail.vue`
- Modify: `骑手端app/manifest.json`

- [x] Write lifecycle tests for start conditions and reconnect-safe queue flushing.
- [x] Add native continuous watch with safe foreground fallback.
- [x] Carry active order IDs into each point and bind network/App lifecycle hooks.
- [x] Add iOS background-location mode and Android background/foreground-location permissions.
- [x] Run App tests and compile checks.

### Task 3: Idempotent backend trajectory ingestion

**Files:**
- Modify: `backend/src/modules/rider-app/rider-app.service.spec.ts`
- Modify: `backend/src/modules/rider-app/rider-app.controller.spec.ts`
- Modify: `backend/src/modules/rider-app/rider-app.service.ts`
- Modify: `backend/src/modules/rider-app/rider-app.controller.ts`
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/202607280002_rider_location_tracks/migration.sql`

- [x] Write failing tests for validation, ownership, backfill gating, idempotency, and atomic latest-location forwarding.
- [x] Add the batch endpoint and dedicated trajectory model.
- [x] Sync PostgreSQL/MySQL schema variants and additive release migrations without applying a live migration.
- [x] Run targeted backend tests and Prisma validation.

### Task 4: Remote controls and admin menu

**Files:**
- Modify: `backend/src/modules/system-config/rider-app-control.config.spec.ts`
- Modify: `backend/src/modules/system-config/rider-app-control.config.ts`
- Modify: `admin/src/views/system/RiderAppControl.vue`
- Modify: `骑手端app/api/app-control.js`

- [x] Write failing normalization/range tests.
- [x] Add background switch, queue size, batch size, and maximum point age.
- [x] Bind fields to the existing rider-App control menu.
- [x] Run targeted tests and admin build.

### Task 5: Integrated verification

- [x] Run all App Node tests.
- [x] Run backend targeted tests, full Jest suite, TypeScript, lint, schema sync check, and Prisma validation.
- [x] Build the admin UI and inspect intended diffs only.
- [x] Record remaining signed-package Android/iOS real-device acceptance gates.
