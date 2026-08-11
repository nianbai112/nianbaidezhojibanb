# Campus Map Availability Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add versioned school-level and building-level availability controls to the campus map, expose them in admin, and render safe unavailable states in the WeChat mini-program.

**Architecture:** Keep school availability in the existing versioned campus-map manifest and building availability in GeoJSON feature properties. The backend owns normalization, publish validation, explicit-unopened fallback behavior, and scoped school-status aggregation; admin edits draft data; the mini-program renders school/building states and independently blocks navigation. No Prisma schema migration is required.

**Tech Stack:** Node.js 22+, NestJS 11/Jest, Vue 3/Element Plus/OpenLayers, WeChat mini-program Canvas/native map, Node.js `node:test`/`assert` minitests.

## Global Constraints

- Use Node.js 22 or newer for all backend/admin commands.
- Do not add a standalone building table or a second publishing workflow.
- Do not derive geometry from the promotional aerial rendering; CAD/GeoJSON remains authoritative.
- School `unavailableMessage` is limited to 200 characters; building `unavailableMessage` is limited to 120 characters.
- Explicit `school_unopened` must never fall back to a global or another-school map; an unconfigured school keeps the existing global fallback.
- `constructionStatus=under_construction` and `visibilityScope=future_reference` remain private even if `serviceStatus=open` is supplied.
- Unavailable active buildings remain visible and searchable but are never navigable.
- All writes stop at source files and local tests: do not write a real campus-map draft, publish a real version, deploy, or claim device acceptance.
- Backend/admin and mini-program are separate repositories and require separate commits and verification.
- Follow red-green-refactor: every production behavior change starts with a test that fails for the intended reason.

---

## File Structure

### Backend/admin repository

- Create `backend/src/modules/campus-map/campus-map-availability.ts`: shared status types, normalization, publication validation, and feature safety rules.
- Create `backend/src/modules/campus-map/campus-map-availability.spec.ts`: pure contract tests.
- Modify `backend/src/modules/campus-map/campus-map.service.ts`: preserve status fields, validate publish, prevent explicit-unopened fallback, and list scoped statuses.
- Modify `backend/src/modules/campus-map/campus-map.service.spec.ts`: school fallback, building navigation, legacy compatibility, and status-list tests.
- Modify `backend/src/modules/campus-map/campus-map.controller.ts`: add the static admin statuses endpoint before the dynamic region route.
- Modify `backend/src/modules/campus-map/campus-map.controller.spec.ts`: permission-scope and endpoint routing coverage.
- Modify `admin/src/api/admin.ts`: add `fetchCampusMapStatuses()`.
- Create `admin/src/views/region/components/campus-map/campusAvailabilityModel.mjs`: pure admin normalization, labeling, region merge, and filtering helpers.
- Create `minitest/campus-map-availability.test.cjs`: admin pure-model and source-contract regression tests.
- Create `admin/src/views/region/components/campus-map/CampusMapAvailabilityPanel.vue`: school draft/published status editor.
- Modify `admin/src/views/region/components/campus-map/CampusMapInspector.vue`: building availability editor and deletion confirmation entry point.
- Modify `admin/src/views/region/components/RegionCampusMapPainter.vue`: state, serialization, parsing, publish checks, status panel wiring, and building tags.
- Modify `admin/src/views/region/RegionList.vue`: school map status badges and filters.

### Mini-program repository

- Modify `/Users/nianbaidediannao/Desktop/前端文件/campusMap/index/index.js`: school-unopened handling, building status indexing, safe navigation, and lightweight unavailable/2.5D styling.
- Modify `/Users/nianbaidediannao/Desktop/前端文件/campusMap/index/index.wxml`: school state, search badge, building explanation, and disabled CTA copy.
- Modify `/Users/nianbaidediannao/Desktop/前端文件/campusMap/index/index.wxss`: accessible state badges, explanation panel, and disabled styling.
- Modify `/Users/nianbaidediannao/Desktop/前端文件/minitest/campus-map-page.test.cjs`: rendered unavailable states and source-contract checks.
- Modify `/Users/nianbaidediannao/Desktop/前端文件/minitest/campus-map-control.test.cjs`: end-to-end source boundary and backend/admin integration checks.

---

### Task 1: Backend Availability Contract

**Files:**
- Create: `backend/src/modules/campus-map/campus-map-availability.ts`
- Create: `backend/src/modules/campus-map/campus-map-availability.spec.ts`

**Interfaces:**
- Produces: `CampusAvailability`, `CampusAvailabilityStatus`, `normalizeCampusAvailability(value)`, `normalizeCampusFeatureProperties(value)`, `validateCampusAvailabilityManifest(manifest)`.
- Consumed by: Task 2.

- [ ] **Step 1: Write failing school normalization tests**

```ts
import {
  normalizeCampusAvailability,
  normalizeCampusFeatureProperties,
  validateCampusAvailabilityManifest,
} from './campus-map-availability';

describe('campus map availability', () => {
  it('defaults legacy school manifests to open and trims messages', () => {
    expect(normalizeCampusAvailability(undefined)).toEqual({ status: 'open', unavailableMessage: '' });
    expect(normalizeCampusAvailability({ status: 'unopened', unavailableMessage: '  正在校准  ' }))
      .toEqual({ status: 'unopened', unavailableMessage: '正在校准' });
  });

  it('forces unavailable active buildings to remain searchable and non-navigable', () => {
    expect(normalizeCampusFeatureProperties({
      constructionStatus: 'built',
      visibilityScope: 'phase1_active',
      serviceStatus: 'unopened',
      unavailableMessage: '暂未开放',
      searchable: false,
      navigable: true,
    })).toEqual(expect.objectContaining({ searchable: true, navigable: false }));
  });

  it('does not let service status expose future projects', () => {
    expect(normalizeCampusFeatureProperties({
      constructionStatus: 'under_construction',
      visibilityScope: 'future_reference',
      serviceStatus: 'open',
      searchable: true,
      navigable: true,
    })).toEqual(expect.objectContaining({ searchable: false, navigable: false }));
  });
});
```

- [ ] **Step 2: Run the test and verify the contract module is missing**

Run: `npm --workspace backend test -- --runInBand campus-map-availability.spec.ts`

Expected: FAIL because `campus-map-availability.ts` does not exist.

- [ ] **Step 3: Implement normalization with closed unions and length limits**

```ts
export type CampusAvailabilityStatus = 'open' | 'unopened';
export type CampusAvailability = {
  status: CampusAvailabilityStatus;
  unavailableMessage: string;
};

const SCHOOL_MESSAGE_LIMIT = 200;
const BUILDING_MESSAGE_LIMIT = 120;

export function normalizeCampusAvailability(value: any): CampusAvailability {
  const status: CampusAvailabilityStatus = value?.status === 'unopened' ? 'unopened' : 'open';
  return {
    status,
    unavailableMessage: status === 'unopened'
      ? String(value?.unavailableMessage || '').trim().slice(0, SCHOOL_MESSAGE_LIMIT)
      : '',
  };
}
```

Implement `normalizeCampusFeatureProperties` as a shallow copy. Use `serviceStatus='open'` for legacy built features; force future/reference features to `searchable=false,navigable=false`; force active unavailable features to `searchable=true,navigable=false`; trim building messages to 120 characters.

- [ ] **Step 4: Add failing publication validation tests**

```ts
it('rejects missing explanations and unavailable navigation', () => {
  const errors = validateCampusAvailabilityManifest({
    availability: { status: 'unopened', unavailableMessage: '' },
    layers: [{ inlineData: { features: [{
      properties: {
        title: '天枢楼',
        constructionStatus: 'built',
        visibilityScope: 'phase1_active',
        serviceStatus: 'unopened',
        unavailableMessage: '',
        navigable: true,
      },
    }] } }],
  });
  expect(errors).toEqual(expect.arrayContaining([
    '学校未开通时必须填写说明',
    '未开放建筑“天枢楼”必须填写说明',
    '未开放建筑“天枢楼”不能开启导航',
  ]));
});
```

- [ ] **Step 5: Implement manifest validation and run the full contract tests**

Traverse only `layers[].inlineData.features[]` and validate normalized feature properties. Ordinary road/water features without a building title/status are ignored.

Run: `npm --workspace backend test -- --runInBand campus-map-availability.spec.ts`

Expected: PASS.

- [ ] **Step 6: Commit the contract**

```bash
git add backend/src/modules/campus-map/campus-map-availability.ts backend/src/modules/campus-map/campus-map-availability.spec.ts
git commit -m "feat: add campus availability contract"
```

---

### Task 2: Backend Draft, Publish, Active Map, and Scoped Statuses

**Files:**
- Modify: `backend/src/modules/campus-map/campus-map.service.ts`
- Modify: `backend/src/modules/campus-map/campus-map.service.spec.ts`
- Modify: `backend/src/modules/campus-map/campus-map.controller.ts`
- Modify: `backend/src/modules/campus-map/campus-map.controller.spec.ts`

**Interfaces:**
- Consumes: Task 1 helpers.
- Produces: `CampusMapService.listAvailabilityStatuses(where)`, `GET /admin/campus-map/statuses`, `reason=school_unopened` active-map payloads.
- Consumed by: Tasks 3-5.

- [ ] **Step 1: Add a failing explicit-unopened fallback test**

```ts
it('returns the requested school explanation without global fallback', async () => {
  prisma.campusMap.findUnique.mockImplementation(({ where }) => where.regionId === 'school-1'
    ? Promise.resolve({
        enabled: true,
        regionId: 'school-1',
        activeVersion: { version: 3, manifest: {
          enabled: true,
          title: '测试大学',
          availability: { status: 'unopened', unavailableMessage: '地图资料校准中' },
          layers: [{ id: 'buildings', inlineData: { type: 'FeatureCollection', features: [] } }],
        } },
      })
    : Promise.resolve({ enabled: true, activeVersion: { version: 1, manifest: openManifest() } }));

  await expect(service.getActiveMap('school-1')).resolves.toEqual(expect.objectContaining({
    enabled: false,
    reason: 'school_unopened',
    sourceRegionId: 'school-1',
    availability: { status: 'unopened', unavailableMessage: '地图资料校准中' },
  }));
  expect(prisma.campusMap.findUnique).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run the focused test and verify it currently returns an enabled map or queries global**

Run: `npm --workspace backend test -- --runInBand campus-map.service.spec.ts -t "without global fallback"`

Expected: FAIL for the missing `school_unopened` behavior.

- [ ] **Step 3: Normalize draft payloads and public feature properties**

Import Task 1 helpers. In `normalizeAdminPayload`, add:

```ts
availability: normalizeCampusAvailability(raw.availability),
```

In `normalizeLayers`, clone inline feature collections and replace each `feature.properties` with `normalizeCampusFeatureProperties(feature.properties || {})`. Remove the existing duplicated `const enabled` declaration only if the focused Jest compile reports it; keep the single original expression unchanged.

- [ ] **Step 4: Enforce publish validation before version creation**

Immediately after `const manifest = this.asRecord(draft.manifest)`, call `validateCampusAvailabilityManifest(manifest)`. Throw `BadRequestException(errors.join('；'))` before incrementing `versionCounter` when errors exist.

Add service tests proving failed validation does not call `campusMap.update` or `campusMapVersion.create`, then run:

`npm --workspace backend test -- --runInBand campus-map.service.spec.ts -t "availability"`

Expected: PASS.

- [ ] **Step 5: Implement explicit-unopened output without layers or fallback**

Add a private `publishedAvailability(map)` helper using `normalizeCampusAvailability(map.activeVersion?.manifest?.availability)`. In `getActiveMap`, check an existing enabled published regional map for `status='unopened'` before `isPublishedMapEnabled`. Return a disabled public payload with `reason='school_unopened'`, the requested school title, its availability object, and `layers: []`.

Keep the old global fallback only when no explicit published regional availability decision exists.

- [ ] **Step 6: Write and implement scoped status list tests**

Test that `listAvailabilityStatuses({ regionId: { in: ['school-1'] } })` calls `campusMap.findMany` with that exact filter and returns:

```ts
{
  regionId: 'school-1',
  configured: true,
  publishedStatus: 'unopened',
  draftStatus: 'open',
  unavailableMessage: '地图资料校准中',
  draftRevision: 4,
  activeVersion: 3,
}
```

Implement `GET /admin/campus-map/statuses` before `GET /admin/campus-map/:regionId`. The controller obtains the filter with `scope.regionFieldWhere('regionId', user.sub)` and passes it to the service.

- [ ] **Step 7: Run backend campus-map tests and commit**

Run: `npm --workspace backend test -- --runInBand campus-map-availability.spec.ts campus-map.service.spec.ts campus-map.controller.spec.ts`

Expected: PASS.

```bash
git add backend/src/modules/campus-map/campus-map.service.ts backend/src/modules/campus-map/campus-map.service.spec.ts backend/src/modules/campus-map/campus-map.controller.ts backend/src/modules/campus-map/campus-map.controller.spec.ts
git commit -m "feat: enforce campus map availability"
```

---

### Task 3: Admin Pure Model and API Contract

**Files:**
- Create: `admin/src/views/region/components/campus-map/campusAvailabilityModel.mjs`
- Create: `minitest/campus-map-availability.test.cjs`
- Modify: `admin/src/api/admin.ts`

**Interfaces:**
- Produces: `normalizeSchoolAvailability(value)`, `normalizeBuildingAvailability(value)`, `mergeRegionCampusMapStatuses(regions,statuses)`, `filterRegionsByCampusMapStatus(regions,status)` and `fetchCampusMapStatuses()`.
- Consumed by: Task 4.

- [ ] **Step 1: Write a failing Node minitest**

```js
const assert = require('node:assert/strict')

async function run() {
  const model = await import('../admin/src/views/region/components/campus-map/campusAvailabilityModel.mjs')
  assert.deepEqual(model.normalizeSchoolAvailability(), { status: 'open', unavailableMessage: '' })
  assert.deepEqual(model.normalizeBuildingAvailability({ serviceStatus: 'unopened', unavailableMessage: ' 施工中 ', navigable: true }), {
    serviceStatus: 'unopened', unavailableMessage: '施工中', searchable: true, navigable: false,
  })
  const merged = model.mergeRegionCampusMapStatuses([{ id: 'a' }, { id: 'b' }], [{ regionId: 'a', publishedStatus: 'unopened' }])
  assert.equal(merged[0].campusMapStatus, 'unopened')
  assert.equal(merged[1].campusMapStatus, 'unconfigured')
}

run().catch((error) => { console.error(error); process.exit(1) })
```

- [ ] **Step 2: Run and verify the module is missing**

Run: `node minitest/campus-map-availability.test.cjs`

Expected: FAIL because `campusAvailabilityModel.mjs` does not exist.

- [ ] **Step 3: Implement the pure model and status filter**

Use only standard JavaScript. `filterRegionsByCampusMapStatus(regions,'all')` returns all rows; other values are `open`, `unopened`, and `unconfigured`.

- [ ] **Step 4: Add the admin API function and source assertion**

```ts
export async function fetchCampusMapStatuses() {
  return request.get('/admin/campus-map/statuses')
}
```

Extend the minitest to read `admin/src/api/admin.ts` and assert `/admin/campus-map/statuses` appears before the template literal `/admin/campus-map/${regionId}` in source order.

- [ ] **Step 5: Run and commit**

Run: `node minitest/campus-map-availability.test.cjs`

Expected: PASS.

```bash
git add admin/src/views/region/components/campus-map/campusAvailabilityModel.mjs minitest/campus-map-availability.test.cjs admin/src/api/admin.ts
git commit -m "feat: add admin campus availability model"
```

---

### Task 4: Admin School and Building Controls

**Files:**
- Create: `admin/src/views/region/components/campus-map/CampusMapAvailabilityPanel.vue`
- Modify: `admin/src/views/region/components/campus-map/CampusMapInspector.vue`
- Modify: `admin/src/views/region/components/RegionCampusMapPainter.vue`
- Modify: `admin/src/views/region/RegionList.vue`
- Modify: `minitest/campus-map-availability.test.cjs`

**Interfaces:**
- Consumes: Task 3 model and API.
- Produces: versioned school/building fields in draft payloads and visible school status aggregation.
- Consumed by: Task 5 through the published manifest.

- [ ] **Step 1: Add failing source-contract assertions**

Extend `minitest/campus-map-availability.test.cjs` to assert:

```js
assert.match(painter, /CampusMapAvailabilityPanel/)
assert.match(painter, /availabilityStatus/)
assert.match(painter, /unavailableMessage/)
assert.match(inspector, /serviceStatus/)
assert.match(inspector, /未开放说明/)
assert.match(regionList, /campusMapStatusFilter/)
assert.match(regionList, /fetchCampusMapStatuses/)
```

Run: `node minitest/campus-map-availability.test.cjs`

Expected: FAIL because the UI controls are absent.

- [ ] **Step 2: Build the school availability panel**

`CampusMapAvailabilityPanel.vue` receives:

```ts
defineProps<{
  status: 'open' | 'unopened'
  unavailableMessage: string
  publishedStatus: 'open' | 'unopened' | 'unconfigured'
}>()
defineEmits<{
  'update:status': [value: 'open' | 'unopened']
  'update:unavailableMessage': [value: string]
}>()
```

Render an Element Plus radio group, a conditional textarea with `maxlength=200` and count, plus separate “草稿状态” and “已发布状态” tags.

- [ ] **Step 3: Wire school status into painter serialization and parsing**

Add `availabilityStatus` and `unavailableMessage` to the reactive form. Both `buildPayload()` and `buildAmapPayload()` emit:

```ts
availability: normalizeSchoolAvailability({
  status: form.availabilityStatus,
  unavailableMessage: form.unavailableMessage,
}),
```

`applyConfig` reads `config.availability`; `qualityWarnings` adds the exact warning `学校未开通时必须填写说明` when appropriate. Do not change the existing save-draft/publish revision flow.

- [ ] **Step 4: Add building status fields to point/area types and the inspector**

Extend `PoiItem` and `AreaItem` with `serviceStatus?: 'open' | 'unopened'` and `unavailableMessage?: string`. For selected POIs/areas, show an availability radio group and conditional 120-character textarea. When status becomes unavailable, call `syncAvailability` so `searchable=true,navigable=false` is applied.

Keep routes and calibration points free of building availability fields.

- [ ] **Step 5: Preserve building fields in both map modes**

In `buildPayload`, `standardizeAmapFeature`, `parsePoiLayer`, `parseAmapPoiLayer`, `parseAreaLayer`, and `parseAmapAreaLayer`, round-trip `serviceStatus`, `unavailableMessage`, `searchable`, and `navigable` through `normalizeBuildingAvailability`.

Deletion keeps the existing undo snapshot, adds an Element Plus confirmation before removal, and does not call an API until the next draft save.

- [ ] **Step 6: Add Region List aggregation and filter**

In `loadRegions`, call `Promise.all([fetchRegions(), fetchCampusMapStatuses()])`, merge by `region.id`, and assign missing rows `campusMapStatus='unconfigured'`. Add a dedicated filter with options 全部地图、已开通、未开通、未配置, and display a campus-map tag on each region card. The existing region operational-status filter remains separate.

- [ ] **Step 7: Run admin validation and commit**

Run:

```bash
node minitest/campus-map-availability.test.cjs
npm --workspace admin run typecheck
npm --workspace admin run build
```

Expected: all commands PASS.

```bash
git add admin/src/views/region/components/campus-map/CampusMapAvailabilityPanel.vue admin/src/views/region/components/campus-map/CampusMapInspector.vue admin/src/views/region/components/RegionCampusMapPainter.vue admin/src/views/region/RegionList.vue minitest/campus-map-availability.test.cjs
git commit -m "feat: manage school and building availability"
```

---

### Task 5: Mini-program Unavailable States and Lightweight Visual Styling

**Files:**
- Modify: `/Users/nianbaidediannao/Desktop/前端文件/campusMap/index/index.js`
- Modify: `/Users/nianbaidediannao/Desktop/前端文件/campusMap/index/index.wxml`
- Modify: `/Users/nianbaidediannao/Desktop/前端文件/campusMap/index/index.wxss`
- Modify: `/Users/nianbaidediannao/Desktop/前端文件/minitest/campus-map-page.test.cjs`
- Modify: `/Users/nianbaidediannao/Desktop/前端文件/minitest/campus-map-control.test.cjs`

**Interfaces:**
- Consumes: backend `reason`, `availability`, and building feature properties from Tasks 1-4.
- Produces: visible school explanation, building badges, safe navigation state, and canvas building depth cues.

- [ ] **Step 1: Add failing mini-program source tests**

Add assertions for `school_unopened`, `unavailableMessage`, `serviceStatus`, `selectedAvailabilityLabel`, a navigation guard before `wx.openLocation`, and unavailable badge classes.

Run:

```bash
node /Users/nianbaidediannao/Desktop/前端文件/minitest/campus-map-page.test.cjs
node /Users/nianbaidediannao/Desktop/前端文件/minitest/campus-map-control.test.cjs
```

Expected: FAIL on the new assertions.

- [ ] **Step 2: Preserve explicit school-unopened errors**

In `loadRemoteMapPackage`, when `manifest.enabled !== true`, throw:

```js
throw createMapError(
  manifest.reason === 'school_unopened' ? 'school_unopened' : 'not_configured',
  manifest.availability && manifest.availability.unavailableMessage
    ? manifest.availability.unavailableMessage
    : '后台未启用校园地图'
)
```

In `showMapEmptyState`, map `school_unopened` to title `校园地图暂未开通`, description from the backend message, `canRetry=false`, and source label from the requested school. Network failures remain retryable and must not use this state.

- [ ] **Step 3: Index unavailable buildings without dropping search**

Add `operatorAreas` to `poiLayers` from `byId.operator_areas`. In `buildPoiIndex`, include point and polygon features and store:

```js
serviceStatus: properties.serviceStatus === 'unopened' ? 'unopened' : 'open',
unavailableMessage: String(properties.unavailableMessage || ''),
navigable: properties.navigable !== false && properties.serviceStatus !== 'unopened',
```

Search results keep unavailable buildings and add `availabilityLabel='暂未开放'`.

- [ ] **Step 4: Enforce selection and navigation safety**

`selectPoi` sets `selectedAvailabilityLabel`, `selectedUnavailableMessage`, and `selectedCanNavigate=Boolean(selectedLngLat) && item.navigable !== false`. `navigateToSelected` first checks `this.selectedPoi?.serviceStatus === 'unopened'`; if true, show `该建筑暂未开放` and return before resolving coordinates or calling `wx.openLocation`.

- [ ] **Step 5: Render text-accessible unavailable states**

In WXML, add an unavailable tag to search rows and the selected detail panel, render the backend explanation, and change the primary button text to `暂未开放` when navigation is disabled by service status. Add WXSS for a blue-gray badge, explanation box, and disabled button; do not rely on color alone.

- [ ] **Step 6: Add lightweight building depth cues to Canvas**

Before filling a Polygon whose semantic type is building, teaching, dorm, office, or library, draw the same projected ring offset by `(3, 5)` using a translucent blue-gray shadow. Draw the roof polygon at its original coordinates and keep the label on top. When `serviceStatus='unopened'`, use the unavailable palette and do not draw an active highlight.

Keep native-map polygons flat because the native component owns their renderer; status remains visible through labels, search, and the detail panel.

- [ ] **Step 7: Run mini-program tests and commit separately**

Run:

```bash
node /Users/nianbaidediannao/Desktop/前端文件/minitest/campus-map-page.test.cjs
node /Users/nianbaidediannao/Desktop/前端文件/minitest/campus-map-control.test.cjs
node /Users/nianbaidediannao/Desktop/前端文件/minitest/campus-map-geometry.test.cjs
```

Expected: PASS.

From `/Users/nianbaidediannao/Desktop/前端文件`:

```bash
git add campusMap/index/index.js campusMap/index/index.wxml campusMap/index/index.wxss minitest/campus-map-page.test.cjs minitest/campus-map-control.test.cjs
git commit -m "feat: show campus availability in miniapp"
```

---

### Task 6: Cross-stack Verification and Handoff

**Files:**
- Verify only; do not modify production data or deployment files.

**Interfaces:**
- Consumes: all previous tasks.
- Produces: separate backend/admin, mini-program source, and runtime evidence.

- [ ] **Step 1: Run the focused backend suite**

Run: `npm --workspace backend test -- --runInBand campus-map-availability.spec.ts campus-map.service.spec.ts campus-map.controller.spec.ts campus-map-import.service.spec.ts`

Expected: PASS with zero failed suites.

- [ ] **Step 2: Run backend compile validation**

Run: `npm --workspace backend run build`

Expected: PASS. Record but do not repair unrelated failures outside campus-map scope without reporting them.

- [ ] **Step 3: Run admin model, type, and build validation**

Run:

```bash
node minitest/campus-map-availability.test.cjs
node minitest/campus-map-openlayers-workbench.test.cjs
npm --workspace admin run typecheck
npm --workspace admin run build
```

Expected: PASS.

- [ ] **Step 4: Run mini-program campus-map regression tests**

Run the three commands from Task 5 Step 7 and record the exact pass counts.

- [ ] **Step 5: Inspect diffs and repository separation**

Confirm the backend/admin commit contains no mini-program paths and the mini-program commit contains no backend/admin paths. Confirm no database migration, real draft write, publish request, deployment file, CAD source, token, or upload artifact is staged.

- [ ] **Step 6: Report the unverified runtime gates**

Handoff must explicitly separate:

- Source changes and local automated checks.
- Admin local preview evidence, if captured.
- WeChat Developer Tools evidence, if actually performed.
- Real-device navigation and positioning, still pending unless actually performed.
- Production deployment and real map publication, still pending.
