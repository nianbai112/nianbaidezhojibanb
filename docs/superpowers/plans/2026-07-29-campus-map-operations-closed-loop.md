# Campus Map Operations Closed Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Deliver a safe campus-map operations workflow and practical mini-program place discovery/navigation without touching the user-owned WXML compiler fix.

**Architecture:** Reuse the existing versioned backend and neutral manifest. Wire the Vue workbench to draft/publish/version APIs, make disabled-region fallback deterministic, recover stale import jobs, and derive all mini-program discovery data from the published manifest.

**Tech Stack:** NestJS, Prisma, Jest, Vue 3, Element Plus, WeChat Mini Program JavaScript/WXML/WXSS, Node test runner.

## Global Constraints

- Do not modify `/Users/nianbaidediannao/Desktop/前端文件/components/page-renderer/page-renderer.wxml`.
- Do not add runtime dependencies or replace existing map engines.
- Do not write real region data, run production migrations, deploy, commit, or push.
- Preserve unrelated dirty-worktree changes and verify frontend/backend separately.
- Write a failing behavior test before each production behavior change.

---

### Task 1: Admin Draft, Publish, Version, and Rollback Workflow

**Files:**
- Modify: `admin/src/api/admin.ts`
- Modify: `admin/src/views/region/components/RegionCampusMapPainter.vue`
- Modify: `admin/src/views/region/components/campus-map/CampusMapActionBar.vue`
- Create: `admin/src/views/region/components/campus-map/CampusMapVersionDrawer.vue`
- Test: `/Users/nianbaidediannao/Desktop/前端文件/minitest/campus-map-control.test.cjs`

**Interfaces:**
- Consumes: `workflow.draftRevision`, `workflow.activeVersion`, `workflow.activeVersionId` from `GET /admin/campus-map/:regionId`.
- Produces: `saveRegionCampusMapDraft(regionId, config, revision)`, `publishRegionCampusMapDraft(regionId, revision)`, `fetchRegionCampusMapVersions(regionId, params)`, `rollbackRegionCampusMapVersion(regionId, versionId)`.

- [x] **Step 1: Write a failing control-surface test**

```js
test("admin uses explicit campus map draft publishing and version recovery", () => {
  assert.match(api, /saveRegionCampusMapDraft/);
  assert.match(api, /publishRegionCampusMapDraft/);
  assert.match(painter, /CampusMapVersionDrawer/);
  assert.doesNotMatch(painter, /saveRegionCampusMap\(/);
});
```

- [x] **Step 2: Run the test and confirm it fails because the explicit workflow is absent**

Run: `node --test minitest/campus-map-control.test.cjs`

- [x] **Step 3: Add minimal API functions and workbench state/actions**

```ts
export function saveRegionCampusMapDraft(regionId, config, revision) {
  return request.put(`/admin/campus-map/${regionId}/draft`, { config, revision })
}
export function publishRegionCampusMapDraft(regionId, revision) {
  return request.post(`/admin/campus-map/${regionId}/publish`, { revision })
}
```

- [x] **Step 4: Add the focused version drawer and rollback confirmation**

```vue
<CampusMapVersionDrawer v-model="versionDrawerVisible" :region-id="currentRegionId()" @restored="loadMap" />
```

- [x] **Step 5: Run the control test and admin build**

Run: `node --test minitest/campus-map-control.test.cjs`

Run: `npm --workspace admin run build`

### Task 2: Deterministic Disable Fallback and Import Recovery

**Files:**
- Modify: `backend/src/modules/campus-map/campus-map.service.spec.ts`
- Modify: `backend/src/modules/campus-map/campus-map.service.ts`
- Modify: `backend/src/modules/campus-map/campus-map-import.service.spec.ts`
- Modify: `backend/src/modules/campus-map/campus-map-import.service.ts`

**Interfaces:**
- Consumes: regional and global CampusMap records plus `campus_map_import_*` Config values.
- Produces: disabled regional maps fall through to the global published map; startup recovery changes stale `queued/processing` jobs into retryable `failed` jobs.

- [x] **Step 1: Add a failing service test for disabled-region global fallback**

```ts
expect(await service.getActiveMap('region-1')).toMatchObject({
  enabled: true,
  sourceRegionId: 'global',
});
```

- [x] **Step 2: Run the focused test and verify the current result is `disabled`**

Run: `npm --workspace backend test -- --runInBand src/modules/campus-map/campus-map.service.spec.ts`

- [x] **Step 3: Make only publishable maps win the regional lookup**

```ts
const regionMap = await this.findPublishedMap(requestedRegionId);
if (this.isPublishedMapEnabled(regionMap)) return this.toPublishedMap(regionMap, requestedRegionId, requestedRegionId);
```

- [x] **Step 4: Add a failing import-service test for stale job recovery**

```ts
await service.onModuleInit();
expect(saved.jobs[0]).toMatchObject({ status: 'failed', progress: 0 });
```

- [x] **Step 5: Implement startup recovery and region-local serialization**

```ts
async onModuleInit() {
  await this.recoverInterruptedJobs();
}
```

- [x] **Step 6: Run all campus-map backend tests**

Run: `npm --workspace backend test -- --runInBand src/modules/campus-map/campus-map.service.spec.ts src/modules/campus-map/campus-map.controller.spec.ts src/modules/campus-map/campus-map-import.service.spec.ts`

### Task 3: Mini-program Place Discovery and Navigation

**Files:**
- Modify: `/Users/nianbaidediannao/Desktop/前端文件/common/campusMapGeometry.js`
- Modify: `/Users/nianbaidediannao/Desktop/前端文件/campusMap/index/index.js`
- Modify: `/Users/nianbaidediannao/Desktop/前端文件/campusMap/index/index.wxml`
- Modify: `/Users/nianbaidediannao/Desktop/前端文件/campusMap/index/index.wxss`
- Modify: `/Users/nianbaidediannao/Desktop/前端文件/minitest/campus-map-geometry.test.cjs`
- Modify: `/Users/nianbaidediannao/Desktop/前端文件/minitest/campus-map-page.test.cjs`

**Interfaces:**
- Consumes: published manifest POI properties and two-point positioning calibration.
- Produces: `unprojectMapPointToGps(positioning, point)`, searchable categorized `poiIndex`, unified `selectPoi`, and `navigateToSelected` using `wx.openLocation`.

- [x] **Step 1: Write failing geometry tests for inverse calibration**

```js
assert.deepEqual(unprojectMapPointToGps(positioning, { x: 50, y: 50 }), {
  longitude: 106.5,
  latitude: 29.5,
});
```

- [x] **Step 2: Run the geometry test and confirm the function is missing**

Run: `node --test minitest/campus-map-geometry.test.cjs`

- [x] **Step 3: Implement the minimal inverse projection helper**

```js
function unprojectMapPointToGps(positioning, point) {
  // invert the same two-axis linear calibration used by projectGpsToMapPoint
}
```

- [x] **Step 4: Write failing page tests for search, category, detail, navigation, and native feedback**

```js
assert.match(js, /onSearchInput/);
assert.match(js, /selectPoi/);
assert.match(js, /navigateToSelected/);
assert.match(wxml, /open-type="feedback"/);
```

- [x] **Step 5: Implement discovery UI and select/navigation behavior**

```js
wx.openLocation({
  longitude: selected.longitude,
  latitude: selected.latitude,
  name: selected.title,
});
```

- [x] **Step 6: Run all mini-program campus-map tests**

Run: `node --test minitest/campus-map-page.test.cjs minitest/campus-map-geometry.test.cjs minitest/campus-map-control.test.cjs`

### Task 4: Clean Release Sync and Final Verification

**Files:**
- Sync only verified campus-map backend/admin files into `/Users/nianbaidediannao/Desktop/后端后台干净版本`.
- Do not sync unrelated dirty files.

**Interfaces:**
- Consumes: verified local backend/admin campus-map source.
- Produces: clean release tree with the same control surface and version workflow.

- [x] **Step 1: Compare every target before copying and identify the minimal file list**

Run: `diff -q admin/src/views/region/RegionConfigCenter.vue /Users/nianbaidediannao/Desktop/后端后台干净版本/admin/src/views/region/RegionConfigCenter.vue`

Run the same explicit comparison for `backend/src/modules/campus-map/`, `admin/src/api/admin.ts`, `RegionCampusMapPainter.vue`, `CampusMapActionBar.vue`, and `CampusMapVersionDrawer.vue`; copy only files changed by Tasks 1-2 plus the missing region-center integration.

- [x] **Step 2: Apply the verified campus-map files and missing RegionConfigCenter integration only**

```text
backend/src/modules/campus-map/*
admin/src/api/admin.ts campus-map functions only
admin/src/views/region/components/RegionCampusMapPainter.vue
admin/src/views/region/components/campus-map/* changed by this plan
admin/src/views/region/RegionConfigCenter.vue campus-map tab integration
```

- [x] **Step 3: Re-run frontend control test, admin build, backend build, and focused tests**

Run: `node --test minitest/campus-map-page.test.cjs minitest/campus-map-geometry.test.cjs minitest/campus-map-control.test.cjs`

Run: `npm --workspace admin run build`

Run: `npm --workspace backend run build`

- [x] **Step 4: Confirm the user-owned WXML file is untouched**

Run: `git -C /Users/nianbaidediannao/Desktop/前端文件 diff -- components/page-renderer/page-renderer.wxml`
