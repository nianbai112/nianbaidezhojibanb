# Campus Map Workbench Components Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the campus map painter into a clearer componentized workbench so operators can import CAD, draw places/routes/areas, inspect layers, preview, and publish without a crowded single-page UI.

**Architecture:** Keep the existing backend contract and map payload unchanged. Split presentational UI from `RegionCampusMapPainter.vue` into focused Vue 3 components while the parent keeps data, AMap, CAD import, publish, and history logic for this pass.

**Tech Stack:** Vue 3.5, TypeScript, Element Plus, existing `@amap/amap-jsapi-loader`, existing admin APIs.

---

### Task 1: Create Campus Map Component Boundaries

**Files:**
- Create: `admin/src/views/region/components/campus-map/CampusMapActionBar.vue`
- Create: `admin/src/views/region/components/campus-map/CampusMapToolRail.vue`
- Create: `admin/src/views/region/components/campus-map/CampusMapWorkbenchHeader.vue`
- Create: `admin/src/views/region/components/campus-map/CampusMapInspector.vue`
- Create: `admin/src/views/region/components/campus-map/CampusMapAssistantDrawer.vue`
- Create: `admin/src/views/region/components/campus-map/CampusMapImportDrawer.vue`
- Create: `admin/src/views/region/components/campus-map/CampusMapPreviewDrawer.vue`
- Create: `admin/src/views/region/components/campus-map/CampusMapQualityDrawer.vue`
- Modify: `admin/src/views/region/components/RegionCampusMapPainter.vue`

- [x] **Step 1: Create focused presentational components**

Each component receives props and emits events only. No component calls backend APIs or mutates global map state directly.

- [ ] **Step 2: Replace matching blocks in `RegionCampusMapPainter.vue`**

The parent imports the new components and passes existing refs/computed values through props/events.

- [ ] **Step 3: Keep publish payload stable**

Do not rename `pois`, `areas`, `routes`, `calibrationPoints`, `layers`, `positioning`, `amap`, or existing API functions.

### Task 2: Improve Operator Workbench Layout

**Files:**
- Modify: `admin/src/views/region/components/RegionCampusMapPainter.vue`
- Modify: new component scoped styles

- [ ] **Step 1: Make the main canvas/stage feel less crowded**

Use clearer section labels, stable responsive dimensions, and a separate inspector/layer list.

- [ ] **Step 2: Make common actions visible**

Keep import, assistant, preview, check, publish, undo, redo, and tool switching visible without burying them in drawers.

### Task 3: Verify Build and Existing Map Tests

**Files:**
- No new test files for this UI-only split.

- [ ] **Step 1: Run admin build**

Run: `cd /Users/nianbaidediannao/Desktop/后端后台本地测试版/admin && npm run build`

- [ ] **Step 2: Run existing mini-program map tests**

Run: `cd /Users/nianbaidediannao/Desktop/前端文件 && node --test minitest/campus-map-control.test.cjs`

- [ ] **Step 3: Sync changed admin files to clean backend copy**

Copy the changed admin component files and plan into `/Users/nianbaidediannao/Desktop/后端后台干净版本`.
