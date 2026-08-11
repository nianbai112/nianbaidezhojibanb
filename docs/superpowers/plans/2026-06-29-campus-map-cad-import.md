# Campus Map CAD Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an operator-facing CAD import flow that turns DXF/DWG/GeoJSON files into editable campus-map drafts, then publishes semantic campus icons that the mini-program can render.

**Architecture:** Keep the first implementation inside the existing campus-map module and config storage to avoid a heavy database migration. The backend stores source files under `uploads/campus-map-imports`, creates import-job records in the config table, converts supported files into draft POI/area/route data, and returns conversion reports for the admin workbench. The admin workbench adds a CAD import drawer and semantic icon category picker; the mini-program reads the published semantic metadata when drawing markers.

**Tech Stack:** NestJS, Prisma config table, Element Plus/Vue 3, WeChat mini-program canvas/native map, Node built-in `fs/path/child_process`.

---

### Task 1: Backend Import Job And Converter

**Files:**
- Modify: `/Users/nianbaidediannao/Desktop/后端后台本地测试版/backend/src/modules/campus-map/campus-map.controller.ts`
- Modify: `/Users/nianbaidediannao/Desktop/后端后台本地测试版/backend/src/modules/campus-map/campus-map.service.ts`
- Modify: `/Users/nianbaidediannao/Desktop/后端后台本地测试版/backend/src/modules/campus-map/campus-map.service.spec.ts`

- [ ] Add multipart upload endpoint `POST /admin/campus-map/:regionId/imports`.
- [ ] Add polling endpoints `GET /admin/campus-map/:regionId/imports` and `GET /admin/campus-map/:regionId/imports/:jobId`.
- [ ] Parse DXF text entities for `LINE`, `LWPOLYLINE`, `POLYLINE`, `TEXT`, and `MTEXT`.
- [ ] Convert parsed CAD features into editable `pois`, `areas`, and `routes` using layer-name inference.
- [ ] Support GeoJSON import directly.
- [ ] Attempt DWG conversion through ODA File Converter when configured or installed; otherwise return an actionable `needs_converter` job.
- [ ] Add unit tests for DXF parsing, semantic classification, and job persistence payloads.

### Task 2: Admin CAD Import Drawer And Semantic Icon Library

**Files:**
- Modify: `/Users/nianbaidediannao/Desktop/后端后台本地测试版/admin/src/api/admin.ts`
- Modify: `/Users/nianbaidediannao/Desktop/后端后台本地测试版/admin/src/views/region/components/RegionCampusMapPainter.vue`

- [ ] Add API helpers for campus-map import upload, list, and detail polling.
- [ ] Add `CAD导入` button in the map action bar.
- [ ] Add import drawer with upload, conversion report, layer summary, and draft-apply actions.
- [ ] Add built-in semantic categories: library, canteen, dorm, teaching, office, sports, gate, express, shop, clinic, toilet, parking, bus, service, building.
- [ ] Let operators tag POIs and areas with semantic type, display name, icon, and color.
- [ ] Make imported drafts populate existing editable POI/area/route arrays instead of creating a separate hidden map model.

### Task 3: Mini-Program Semantic Rendering

**Files:**
- Modify: `/Users/nianbaidediannao/Desktop/前端文件/campusMap/index/index.js`
- Modify: `/Users/nianbaidediannao/Desktop/前端文件/campusMap/index/index.wxss`

- [ ] Read `semanticType`, `icon`, and `color` from published feature properties.
- [ ] Render canvas POIs with category-colored cute icon badges and labels.
- [ ] Render native-map markers with the same semantic title/callout behavior where custom icons are not available.
- [ ] Keep distance, search target selection, and fallback local map behavior intact.

### Task 4: Verification And Sync

**Files:**
- Copy changed backend/admin files from local-test to `/Users/nianbaidediannao/Desktop/后端后台干净版本`.
- Test: `/Users/nianbaidediannao/Desktop/前端文件/minitest/campus-map-control.test.cjs`

- [ ] Add focused minitest checks for the CAD import drawer and semantic categories.
- [ ] Run backend campus-map tests.
- [ ] Run frontend minitest.
- [ ] Build the admin package.
- [ ] Sync changed backend/admin files to the clean version and verify diffs match.
