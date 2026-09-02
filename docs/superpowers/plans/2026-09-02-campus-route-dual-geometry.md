# Campus Route Dual-Geometry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an admin-planned, rider-verified campus route flow in which GCJ-02 geometry is the navigation truth and independently confirmed artwork geometry is the user-facing SVG display.

**Architecture:** Keep one stable `routeId` through planning, assignment, collection, review, and publication. Store `plannedGeometryGcj02` for field guidance, replace navigation truth only with server-ACK `sourceGeometryGcj02`, and store `artworkGeometry` as an independent SVG overlay; task, review, and publication gates prevent any stage from being silently skipped.

**Tech Stack:** NestJS, Prisma JSON manifests, Vue 3, Element Plus, AMap JS API 2.0, OpenLayers, uni-app rider client, WeChat Mini Program canvas, Node test runner, Jest.

**Spec:** `docs/superpowers/specs/2026-09-02-campus-route-dual-geometry-design.md`

## Global Constraints

- The supplied artist SVG remains the user-facing base map; AMap, GCJ-02, calibration, and rider tracks remain engineering evidence.
- `sourceGeometryGcj02` is the only navigation geometry after review; artwork editing must never mutate it.
- A `route_collection` task may be saved as an empty draft, but cannot enter `ready` without at least one valid target route.
- Planned routes and newly reviewed routes remain `public=false` until explicit publication approval.
- Public navigation still requires reviewed walkable routes, trusted endpoint anchors, verified entrances, and a connected graph.
- Do not add a new database table or dependency; use the existing manifest and task JSON fields.
- Do not publish, deploy, migrate production data, or create real field tasks during local implementation.
- Preserve unrelated user changes in all three repositories.

## Repository Health Gate

The main repository currently cannot build a Git tree because historical blob objects are missing. Do not edit business code until this gate passes.

- [ ] Run `git write-tree` in `/Users/nianbaidediannao/Desktop/后端后台本地测试版`.
- [ ] If Git reports a missing blob, retrieve that exact historical file from an immutable remote commit, verify `git hash-object <download>` equals the reported object ID, then write only that verified blob with `git hash-object -w <download>`.
- [ ] Repeat `git write-tree`; stop and report if the object store cannot be repaired non-destructively.
- [ ] Confirm `git status --short --branch` contains only known pre-existing changes plus the approved spec and plan.
- [ ] Run the current focused baselines:

```bash
cd /Users/nianbaidediannao/Desktop/后端后台本地测试版/admin
node --test src/views/region/components/campus-map/*.test.mjs

cd /Users/nianbaidediannao/Desktop/骑手端app
node --test tests/campus-collection-*.test.mjs tests/campus-stationary-location.test.mjs

cd /Users/nianbaidediannao/Desktop/前端文件
node --test minitest/campus-map-control.test.cjs minitest/campus-map-geometry.test.cjs minitest/campus-map-page.test.cjs minitest/campus-navigation-session.test.cjs minitest/campus-navigation.test.cjs
```

Expected baseline: admin 52 passing, rider 85 passing, Mini Program map/navigation 88 passing. Record any drift rather than changing tests to hide it.

## File Structure

- `admin/src/views/region/components/campus-map/campusRoutePlanningModel.mjs`: pure route-stage, dispatchability, geometry, and alignment helpers.
- `admin/src/views/region/components/campus-map/campusRoutePlanningModel.test.mjs`: deterministic unit tests for those helpers.
- `admin/src/views/region/components/RegionCampusMapPainter.vue`: coordinates AMap planning, SVG alignment, manifest round-trip, and task entry.
- `admin/src/views/region/components/campus-map/CampusMapWorkbenchHeader.vue`: explicit “画师图 / 真实路线” workbench switch.
- `admin/src/views/region/components/campus-map/CampusMapCadWorkbench.vue`: edits only `artworkGeometry` when alignment mode is enabled.
- `admin/src/views/region/components/campus-map/CampusMapCollectionDrawer.vue`: prevents empty ready route tasks and compares planned, actual, and artwork lines.
- `admin/src/views/region/components/campus-map/campusMapCollectionModel.mjs`: task-form and review helper contracts.
- `backend/src/modules/campus-map/campus-map-collection.contract.ts`: state-aware target-route validation.
- `backend/src/modules/campus-map/campus-map-collection.service.ts`: target eligibility, rider reference map, stable route write-back, and audit evidence.
- `backend/src/modules/campus-map/campus-map-route-geometry.ts`: pure route geometry and artwork-projection helpers.
- `backend/src/modules/campus-map/campus-map-route-geometry.spec.ts`: projection and topology comparison tests.
- `backend/src/modules/campus-map/campus-map.service.ts`: publication reconciliation, artwork-route sanitization, and publication gates.
- `/Users/nianbaidediannao/Desktop/骑手端app/pages/campus-collection/collect.vue`: blocks route collection when the required blue target is missing.
- `/Users/nianbaidediannao/Desktop/骑手端app/pages/campus-collection/object-form.vue`: records the stable `targetRouteId` for each submitted route segment.
- `/Users/nianbaidediannao/Desktop/骑手端app/api/campus-collection-form.js`: normalizes route-target choices into collection-object properties.
- `/Users/nianbaidediannao/Desktop/前端文件/campusMap/index/index.js`: consumes sanitized artwork route overlays while routing from the compiled verified graph.
- `/Users/nianbaidediannao/Desktop/前端文件/minitest/campus-map-page.test.cjs`: verifies engineering layers remain private and artwork overlays render safely.

---

### Task 1: Pure Route Planning Contract

**Files:**
- Create: `admin/src/views/region/components/campus-map/campusRoutePlanningModel.mjs`
- Create: `admin/src/views/region/components/campus-map/campusRoutePlanningModel.test.mjs`

**Interfaces:**
- Consumes: route-shaped manifest objects with `points`, `sourceProperties`, and `public`.
- Produces: `routePlanningGeometry(route)`, `routeArtworkGeometry(route)`, `routeDispatchState(route)`, and `buildPlannedRouteProperties(routeId, coordinates)`.

- [ ] **Step 1: Write the failing pure-model tests**

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildPlannedRouteProperties,
  routeArtworkGeometry,
  routeDispatchState,
  routePlanningGeometry,
} from './campusRoutePlanningModel.mjs'

const line = [[106.5, 29.6], [106.5002, 29.6001]]

test('planned route is dispatchable but never public navigation truth', () => {
  const properties = buildPlannedRouteProperties('route-1', line)
  assert.equal(properties.routeStage, 'planned')
  assert.equal(properties.collectionSource, 'admin_planned')
  assert.equal(properties.public, false)
  assert.deepEqual(routePlanningGeometry({ sourceProperties: properties }), line)
  assert.deepEqual(routeDispatchState({ id: 'route-1', sourceProperties: properties }), {
    ready: true,
    reason: '',
  })
})

test('artwork geometry never replaces GCJ-02 planning geometry', () => {
  const route = {
    sourceProperties: {
      plannedGeometryGcj02: { type: 'LineString', coordinates: line },
      artworkGeometry: { type: 'LineString', coordinates: [[400, 800], [520, 910]] },
    },
  }
  assert.deepEqual(routePlanningGeometry(route), line)
  assert.deepEqual(routeArtworkGeometry(route), [[400, 800], [520, 910]])
})
```

- [ ] **Step 2: Run the tests and verify the module is missing**

Run: `cd admin && node --test src/views/region/components/campus-map/campusRoutePlanningModel.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement the minimal pure contract**

```js
const lineCoordinates = (value) => value && value.type === 'LineString' && Array.isArray(value.coordinates)
  ? value.coordinates.filter((point) => Array.isArray(point) && point.length >= 2 && point.every(Number.isFinite))
  : []

export function buildPlannedRouteProperties(routeId, coordinates) {
  return {
    id: String(routeId),
    semanticType: 'road',
    routeStage: 'planned',
    plannedGeometryGcj02: { type: 'LineString', coordinates: lineCoordinates({ type: 'LineString', coordinates }) },
    collectionSource: 'admin_planned',
    verificationStatus: 'pending_collection',
    displayAlignmentStatus: 'missing',
    public: false,
  }
}

export function routePlanningGeometry(route = {}) {
  return lineCoordinates(route.sourceProperties?.plannedGeometryGcj02)
}

export function routeArtworkGeometry(route = {}) {
  return lineCoordinates(route.sourceProperties?.artworkGeometry || route.artworkGeometry)
}

export function routeDispatchState(route = {}) {
  if (!String(route.id || '').trim()) return { ready: false, reason: '路线缺少稳定标识' }
  if (routePlanningGeometry(route).length < 2) return { ready: false, reason: '路线缺少有效 GCJ-02 规划线' }
  return { ready: true, reason: '' }
}
```

- [ ] **Step 4: Run the new model tests**

Run: `cd admin && node --test src/views/region/components/campus-map/campusRoutePlanningModel.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit the pure contract**

```bash
git add admin/src/views/region/components/campus-map/campusRoutePlanningModel.mjs admin/src/views/region/components/campus-map/campusRoutePlanningModel.test.mjs
git commit -m "feat(campus-map): define planned route contract"
```

### Task 2: Backend Ready-Task and Target Eligibility Gates

**Files:**
- Modify: `backend/src/modules/campus-map/campus-map-collection.contract.ts:314-333`
- Modify: `backend/src/modules/campus-map/campus-map-collection.service.ts:300-335,2641-2660`
- Modify: `backend/src/modules/campus-map/campus-map-collection.service.spec.ts:260-285`

**Interfaces:**
- Consumes: `taskType`, `status`, `targetFeatureIds`, and the current region manifest.
- Produces: a ready route task whose every target is a current-region road with at least two valid GCJ-02 planned or verified points.

- [ ] **Step 1: Add failing contract tests**

```ts
expect(() => parseTask({
  name: '无路线任务',
  status: 'ready',
  taskType: 'route_collection',
  objectTypes: ['road'],
  targetFeatureIds: [],
})).toThrow('待采集路线任务必须指定至少一条后台规划路线');

expect(parseTask({
  name: '路线草稿',
  status: 'draft',
  taskType: 'route_collection',
  objectTypes: ['road'],
  targetFeatureIds: [],
})).toMatchObject({ status: 'draft', targetFeatureIds: [] });
```

- [ ] **Step 2: Run the focused Jest test and confirm red**

Run: `cd backend && ../node_modules/.bin/jest --runInBand src/modules/campus-map/campus-map-collection.service.spec.ts -t "validates explicit route"`

Expected: the ready empty-target case does not throw.

- [ ] **Step 3: Add the state-aware contract guard**

```ts
if (taskType === 'route_collection' && status === 'ready' && targetFeatureIds.length === 0) {
  throw new BadRequestException('待采集路线任务必须指定至少一条后台规划路线');
}
```

- [ ] **Step 4: Add failing service tests for wrong target kinds and invalid geometry**

Create manifest fixtures for a POI target, a route with one point, and a route with two `plannedGeometryGcj02` points. Assert only the last target allows `createTask`.

- [ ] **Step 5: Replace the existence-only target check with route eligibility validation**

Pass task context at both create and update boundaries:

```ts
await this.assertTargetFeatures(regionId, input.targetFeatureIds, {
  taskType: input.taskType,
  status: input.status,
});
```

```ts
private routeTargetCoordinates(feature: any): unknown[] {
  const properties = feature?.properties || {};
  const planned = properties.plannedGeometryGcj02;
  const verified = properties.sourceGeometryGcj02;
  const geometry = planned?.type === 'LineString' ? planned : verified?.type === 'LineString' ? verified : null;
  return Array.isArray(geometry?.coordinates) ? geometry.coordinates : [];
}
```

When `taskType=route_collection` and `status=ready`, require each selected feature to have `semanticType=road` and at least two valid longitude/latitude pairs. Keep `assertTargetFeatures` existence behavior for draft tasks and non-route legacy tasks.

- [ ] **Step 6: Run contract and service tests**

Run: `cd backend && ../node_modules/.bin/jest --runInBand src/modules/campus-map/campus-map-collection.service.spec.ts`

Expected: PASS with the new empty-target and geometry cases.

- [ ] **Step 7: Commit backend task gates**

```bash
git add backend/src/modules/campus-map/campus-map-collection.contract.ts backend/src/modules/campus-map/campus-map-collection.service.ts backend/src/modules/campus-map/campus-map-collection.service.spec.ts
git commit -m "fix(campus-map): require planned routes before dispatch"
```

### Task 3: Restore the Admin AMap Route Planning Surface

**Files:**
- Modify: `admin/src/views/region/components/RegionCampusMapPainter.vue:32-95,552-565,2292-2385,2771-2790,2882-3198,3418-3455`
- Modify: `admin/src/views/region/components/campus-map/CampusMapWorkbenchHeader.vue:1-45,57-105`
- Modify: `admin/src/views/region/components/campus-map/campusMapCollectionModel.test.mjs`

**Interfaces:**
- Consumes: `buildPlannedRouteProperties` from Task 1 and existing AMap runtime configuration.
- Produces: saved `RouteItem` values with stable ID, GCJ-02 points, `plannedGeometryGcj02`, and `public=false`.

- [ ] **Step 1: Add a failing static-control test**

```js
test('exposes a real-route planning surface without replacing the artist workbench', () => {
  const painter = readFileSync(new URL('../RegionCampusMapPainter.vue', import.meta.url), 'utf8')
  const header = readFileSync(new URL('./CampusMapWorkbenchHeader.vue', import.meta.url), 'utf8')
  assert.match(header, /画师图/)
  assert.match(header, /真实路线/)
  assert.match(painter, /ref="amapMapRef"/)
  assert.doesNotMatch(painter, /function handleEditorModeChange[\s\S]{0,180}editorMode\.value = 'image'/)
  assert.match(painter, /buildPlannedRouteProperties/)
})
```

- [ ] **Step 2: Run the admin test and verify red**

Run: `cd admin && node --test src/views/region/components/campus-map/campusMapCollectionModel.test.mjs`

Expected: FAIL because the real-route workbench is not reachable.

- [ ] **Step 3: Add the explicit workbench switch**

In `CampusMapWorkbenchHeader.vue`, emit only these values:

```vue
<el-radio-group :model-value="editorMode" size="small" @change="emitEditorMode">
  <el-radio-button label="image">画师图</el-radio-button>
  <el-radio-button label="amap">真实路线</el-radio-button>
</el-radio-group>
```

In `RegionCampusMapPainter.vue`, render the existing AMap instance only in real-route mode:

```vue
<div v-if="editorMode === 'amap'" class="amap-workbench-shell">
  <div ref="amapMapRef" class="amap-workbench-map"></div>
  <div class="map-status-strip">{{ amapStatus }}</div>
</div>
<CampusMapCadWorkbench v-else-if="hasVisualBaseMap" />
```

- [ ] **Step 4: Stop forcing every mode change back to the artist map**

```ts
async function handleEditorModeChange(value: EditorMode) {
  editorMode.value = value
  if (value === 'amap') {
    toolMode.value = 'route'
    await nextTick()
    await initializeAmapWorkbench()
  }
}
```

- [ ] **Step 5: Persist a planned route rather than a publishable route**

When `finishRoute()` runs in AMap mode, require two points with longitude/latitude, build stable properties with `buildPlannedRouteProperties`, and preserve them in `sourceProperties`. Do not set `collectionSource=rider_app_approved`, `verificationStatus=verified`, or `public=true`.

- [ ] **Step 6: Round-trip `plannedGeometryGcj02` through parse and save**

Ensure `parseAmapRouteLayer()` keeps all route properties in `sourceProperties`, and `standardizeAmapFeature()` writes those properties back while forcing `public` to the explicit route switch.

- [ ] **Step 7: Run admin tests and typecheck**

```bash
cd admin
node --test src/views/region/components/campus-map/*.test.mjs
npm run typecheck
```

Expected: all tests pass and Vue typecheck exits 0.

- [ ] **Step 8: Commit the planning surface**

```bash
git add admin/src/views/region/components/RegionCampusMapPainter.vue admin/src/views/region/components/campus-map/CampusMapWorkbenchHeader.vue admin/src/views/region/components/campus-map/campusMapCollectionModel.test.mjs
git commit -m "feat(campus-map): restore real route planning"
```

### Task 4: Artwork Projection and Independent Display Editing

**Files:**
- Create: `backend/src/modules/campus-map/campus-map-route-geometry.ts`
- Create: `backend/src/modules/campus-map/campus-map-route-geometry.spec.ts`
- Modify: `backend/src/modules/campus-map/campus-map.service.ts:800-940`
- Modify: `admin/src/views/region/components/campus-map/CampusMapCadWorkbench.vue:1-145,180-310`
- Modify: `admin/src/views/region/components/RegionCampusMapPainter.vue:697-717`
- Modify: `admin/src/views/region/components/campus-map/campusRoutePlanningModel.test.mjs`

**Interfaces:**
- Consumes: three or more `{ longitude, latitude, artworkX, artworkY }` control pairs and a GCJ-02 LineString.
- Produces: `projectRouteToArtwork(coordinates, controlPoints)`; admin edits emit only artwork coordinates, while topology conflicts remain an explicit manual-review decision.

- [ ] **Step 1: Write failing projection tests**

```ts
it('projects a GCJ-02 line into artwork coordinates with three control points', () => {
  const controls = [
    { longitude: 106.5000, latitude: 29.6000, artworkX: 100, artworkY: 200 },
    { longitude: 106.5010, latitude: 29.6000, artworkX: 200, artworkY: 200 },
    { longitude: 106.5000, latitude: 29.6010, artworkX: 100, artworkY: 300 },
  ];
  expect(projectRouteToArtwork([[106.5002, 29.6003], [106.5008, 29.6007]], controls)).toEqual({
    type: 'LineString',
    coordinates: [[120, 230], [180, 270]],
  });
});

it('returns null for collinear control points', () => {
  const controls = [
    { longitude: 106.5000, latitude: 29.6000, artworkX: 100, artworkY: 200 },
    { longitude: 106.5010, latitude: 29.6000, artworkX: 200, artworkY: 200 },
    { longitude: 106.5020, latitude: 29.6000, artworkX: 300, artworkY: 200 },
  ];
  expect(projectRouteToArtwork([[106.5002, 29.6000], [106.5008, 29.6000]], controls)).toBeNull();
});
```

- [ ] **Step 2: Run the new Jest file and verify red**

Run: `cd backend && ../node_modules/.bin/jest --runInBand src/modules/campus-map/campus-map-route-geometry.spec.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement affine projection as a pure module**

Move the proven 3-by-3 solve pattern from `campus-map-collection.service.ts:108-191` into the new module. Export an exact API:

```ts
export type RouteControlPoint = {
  longitude: number;
  latitude: number;
  artworkX: number;
  artworkY: number;
};

export function projectRouteToArtwork(
  coordinates: Array<[number, number]>,
  controls: RouteControlPoint[],
): { type: 'LineString'; coordinates: Array<[number, number]> } | null;
```

Round output coordinates to two decimals and return `null` for fewer than three valid non-collinear controls.

- [ ] **Step 4: Auto-create only an unconfirmed artwork candidate**

During draft save, when a planned route lacks `artworkGeometry`, collect verified place pairs from `CampusMapProject`, call `projectRouteToArtwork`, and write:

```ts
properties.artworkGeometry = projected;
properties.displayAlignmentStatus = 'auto_projected';
```

Never mark it `manual_confirmed` automatically.

- [ ] **Step 5: Add independent SVG route editing**

Add an OpenLayers `Modify` interaction in `CampusMapCadWorkbench.vue` only when the selected feature is a route and the parent passes `artwork-editing=true`. Emit:

```ts
const emit = defineEmits<{
  (event: 'route-artwork-change', routeId: string, points: RatioPoint[]): void
}>()
```

The parent converts ratios to artwork coordinates, writes `sourceProperties.artworkGeometry`, and sets `displayAlignmentStatus='manual_confirmed'`. Do not write longitude or latitude in this handler.

- [ ] **Step 6: Add a regression test proving display edits preserve GCJ-02**

Use `routePlanningGeometry()` before and after applying an artwork change and assert the coordinate arrays are byte-for-byte equal.

- [ ] **Step 7: Run geometry, service, and admin tests**

```bash
cd backend
../node_modules/.bin/jest --runInBand src/modules/campus-map/campus-map-route-geometry.spec.ts src/modules/campus-map/campus-map.service.spec.ts

cd ../admin
node --test src/views/region/components/campus-map/*.test.mjs
npm run typecheck
```

- [ ] **Step 8: Commit artwork alignment**

```bash
git add backend/src/modules/campus-map/campus-map-route-geometry.ts backend/src/modules/campus-map/campus-map-route-geometry.spec.ts backend/src/modules/campus-map/campus-map.service.ts admin/src/views/region/components/campus-map/CampusMapCadWorkbench.vue admin/src/views/region/components/RegionCampusMapPainter.vue admin/src/views/region/components/campus-map/campusRoutePlanningModel.test.mjs
git commit -m "feat(campus-map): separate artwork route alignment"
```

### Task 5: Rider Reference Map and Missing-Target Start Block

**Files:**
- Modify: `backend/src/modules/campus-map/campus-map-collection.service.ts:480-505,2475-2560`
- Modify: `backend/src/modules/campus-map/campus-map-collection.service.spec.ts`
- Modify: `/Users/nianbaidediannao/Desktop/骑手端app/pages/campus-collection/collect.vue:110-160,218-245`
- Modify: `/Users/nianbaidediannao/Desktop/骑手端app/tests/campus-collection-pages.test.mjs`

**Interfaces:**
- Consumes: ready route task targets and each route's `plannedGeometryGcj02`.
- Produces: `referenceMap.requiredTargetCount`, `referenceMap.resolvedTargetCount`, targeted blue features, and a rider start guard.

- [ ] **Step 1: Add failing backend reference-map tests**

Assert a targeted planned route is returned as:

```ts
expect(result.referenceMap).toMatchObject({
  enabled: true,
  requiredTargetCount: 1,
  resolvedTargetCount: 1,
  features: [expect.objectContaining({ id: 'route-1', kind: 'road', targeted: true })],
});
```

Also assert a missing target returns `enabled=false`, `reason='target_route_missing'`, `requiredTargetCount=1`, and `resolvedTargetCount=0`.

- [ ] **Step 2: Run the focused backend tests and verify red**

Run: `cd backend && ../node_modules/.bin/jest --runInBand src/modules/campus-map/campus-map-collection.service.spec.ts -t "reference map"`

- [ ] **Step 3: Prefer planned geometry for targeted reference features**

In `buildRiderReferenceMap`, read `plannedGeometryGcj02` before ordinary feature geometry for targeted planned routes. Return required/resolved counts and fail closed when a required target cannot be rendered.

- [ ] **Step 4: Add failing rider source assertions**

```js
test('blocks a route task when its required blue target is missing', () => {
  const collect = readFileSync(new URL('../pages/campus-collection/collect.vue', import.meta.url), 'utf8')
  assert.match(collect, /target_route_missing/)
  assert.match(collect, /该任务缺少后台规划路线，请管理员重新派发/)
  assert.match(collect, /resolvedTargetCount/)
})
```

- [ ] **Step 5: Implement the rider start guard**

Store the reference counts during `loadTask()`. Before starting a `route_collection` task, require `requiredTargetCount > 0` and equality with `resolvedTargetCount`; show the exact message and return without calling `startCampusTask`.

- [ ] **Step 6: Run rider tests**

Run: `cd /Users/nianbaidediannao/Desktop/骑手端app && node --test tests/campus-collection-*.test.mjs tests/campus-stationary-location.test.mjs`

- [ ] **Step 7: Commit in the correct repositories**

```bash
cd /Users/nianbaidediannao/Desktop/后端后台本地测试版
git add backend/src/modules/campus-map/campus-map-collection.service.ts backend/src/modules/campus-map/campus-map-collection.service.spec.ts
git commit -m "feat(campus-map): serve planned rider route targets"

cd /Users/nianbaidediannao/Desktop/骑手端app
git add pages/campus-collection/collect.vue tests/campus-collection-pages.test.mjs
git commit -m "fix(campus-map): block collection without blue route"
```

### Task 6: Stable Route Identity Through Object Submission and Review

**Files:**
- Modify: `/Users/nianbaidediannao/Desktop/骑手端app/api/campus-collection-form.js`
- Modify: `/Users/nianbaidediannao/Desktop/骑手端app/pages/campus-collection/collect.vue`
- Modify: `/Users/nianbaidediannao/Desktop/骑手端app/pages/campus-collection/object-form.vue`
- Modify: `/Users/nianbaidediannao/Desktop/骑手端app/tests/campus-collection-pages.test.mjs`
- Modify: `backend/src/modules/campus-map/campus-map-collection.contract.ts`
- Modify: `backend/src/modules/campus-map/campus-map-collection.service.ts:2700-3135`
- Modify: `backend/src/modules/campus-map/campus-map-collection.service.spec.ts`
- Modify: `admin/src/views/region/components/campus-map/CampusMapCollectionDrawer.vue:220-340`

**Interfaces:**
- Consumes: task target route IDs and one rider route segment.
- Produces: collection object property `targetRouteId` and review write-back to that same stable route feature.

- [ ] **Step 1: Add failing rider form tests**

```js
test('route object preserves the selected stable target route', () => {
  const properties = form.routeTargetProperties('route-2', [
    { id: 'route-1', targeted: true },
    { id: 'route-2', targeted: true },
  ])
  assert.deepEqual(properties, { targetRouteId: 'route-2' })
  assert.throws(() => form.routeTargetProperties('route-3', [{ id: 'route-1', targeted: true }]), /不属于当前任务/)
})
```

- [ ] **Step 2: Carry targeted routes into the existing durable object draft**

When `collect.vue` writes `campus_collection_object_draft_v1`, add only targeted reference features:

```js
targetRoutes: this.refFeatures
  .filter((feature) => feature.targeted === true && feature.kind === 'road')
  .map((feature) => ({ id: String(feature.id), title: String(feature.title || '未命名路线') })),
```

The object form reads this existing persisted draft after restart; do not introduce another storage key.

- [ ] **Step 3: Implement target selection in the route object form**

If a task has one targeted route, select it automatically. If it has multiple, require the rider to choose one before finishing the segment. Write only `{ targetRouteId }` into object properties; do not copy the planned geometry into the object.

- [ ] **Step 4: Add failing backend review tests**

Create a manifest containing `route-plan-1`, a task targeting it, and an approved road object with `properties.targetRouteId='route-plan-1'`. Assert review updates that feature and does not append `collection-route-{objectId}`.

Also assert review rejects a `targetRouteId` not listed on the task.

- [ ] **Step 5: Validate target identity at object ingestion**

For road objects, normalize `targetRouteId` as a non-empty string and verify it belongs to the session task's `targetFeatureIds`. Historical objects without a target remain reviewable through the existing legacy append path, but new ready-task objects cannot omit it.

- [ ] **Step 6: Update the stable planned feature on approval**

In `applyApprovedObject`, locate by `properties.id === targetRouteId`. Preserve operator title, planned geometry, artwork geometry, alignment status, and explicit `public` value. Replace only server-owned truth fields:

```ts
Object.assign(feature.properties, {
  sourceObjectId: object.id,
  sourceSessionId: object.sessionId,
  sourceGeometryGcj02: { type: 'LineString', coordinates: authoritativeCoordinates },
  collectionSource: 'rider_app_approved',
  verificationStatus: 'verified',
  routeStage: 'verified',
  routeEndpointAnchors: routeFeatureAnchors,
  public: feature.properties.public === true,
});
```

- [ ] **Step 7: Add the three-line review comparison**

The admin review drawer must label the planned route blue, submitted ACK route orange, and artwork route green. If `targetRouteId` is absent on a legacy object, label it “历史自由采集路线” instead of inventing a plan.

- [ ] **Step 8: Run rider, backend, and admin focused tests**

```bash
cd /Users/nianbaidediannao/Desktop/骑手端app
node --test tests/campus-collection-pages.test.mjs tests/campus-collection-quality.test.mjs

cd /Users/nianbaidediannao/Desktop/后端后台本地测试版/backend
../node_modules/.bin/jest --runInBand src/modules/campus-map/campus-map-collection.service.spec.ts

cd ../admin
node --test src/views/region/components/campus-map/*.test.mjs
```

- [ ] **Step 9: Commit per repository**

Commit rider changes with `feat(campus-map): bind route segments to planned targets`, then main-repository changes with `feat(campus-map): preserve route identity through review`.

### Task 7: Publication Gate and Sanitized Artwork Route Output

**Files:**
- Modify: `backend/src/modules/campus-map/campus-map.service.ts:1370-1420,1535-1705,1740-2005`
- Modify: `backend/src/modules/campus-map/campus-map.service.spec.ts`

**Interfaces:**
- Consumes: verified public route features containing trusted truth and confirmed artwork geometry.
- Produces: the existing verified navigation graph plus a sanitized top-level `artworkRoutes` array with no internal evidence.

- [ ] **Step 1: Add failing publication tests**

```ts
expect(() => service.assertRouteArtworkReady({
  properties: {
    collectionSource: 'rider_app_approved',
    verificationStatus: 'verified',
    public: true,
    displayAlignmentStatus: 'auto_projected',
  },
})).toThrow('公开路线尚未确认画师图展示线');
```

Add a successful fixture with `displayAlignmentStatus='manual_confirmed'`, a LineString `artworkGeometry`, trusted `sourceGeometryGcj02`, and endpoint anchors. Assert navigation edges use GCJ-02 while `artworkRoutes[0].geometry` uses artwork coordinates.

- [ ] **Step 2: Run focused publication tests and verify red**

Run: `cd backend && ../node_modules/.bin/jest --runInBand src/modules/campus-map/campus-map.service.spec.ts -t "artwork route"`

- [ ] **Step 3: Add publication readiness validation**

For every `public=true` rider-approved route, require:

```ts
const artwork = this.asRecord(properties.artworkGeometry);
if (properties.displayAlignmentStatus !== 'manual_confirmed'
  || artwork?.type !== 'LineString'
  || !Array.isArray(artwork.coordinates)
  || artwork.coordinates.length < 2) {
  throw new BadRequestException(`路线“${properties.title || properties.id}”尚未确认画师图展示线`);
}
```

- [ ] **Step 4: Build sanitized artwork output**

Return only:

```ts
{
  id: String(properties.id),
  title: String(properties.title || '校园路线'),
  geometry: artworkGeometry,
  style: { stroke: String(properties.color || '#F97316'), width: 3 },
}
```

Do not expose `sourceObjectId`, raw evidence, quality samples, reviewer IDs, or `plannedGeometryGcj02` through `artworkRoutes`.

In the immutable published snapshot only, set the sanitized route stage to `published`; do not rewrite the editable draft merely because a version was generated.

- [ ] **Step 5: Confirm navigation compiler remains truth-only**

Keep `compilePublishedNavigation()` reading `sourceGeometryGcj02`, `collectionSource=rider_app_approved`, `public=true`, and trusted anchors. Add an assertion that changing only `artworkGeometry` does not change generated navigation nodes or edges.

- [ ] **Step 6: Run backend service tests**

Run: `cd backend && ../node_modules/.bin/jest --runInBand src/modules/campus-map/campus-map.service.spec.ts`

- [ ] **Step 7: Commit publication changes**

```bash
git add backend/src/modules/campus-map/campus-map.service.ts backend/src/modules/campus-map/campus-map.service.spec.ts
git commit -m "feat(campus-map): publish sanitized artwork routes"
```

### Task 8: Mini Program Artwork Overlay Without Engineering Leakage

**Files:**
- Modify: `/Users/nianbaidediannao/Desktop/前端文件/campusMap/index/index.js:1120-1130,1440-1475,2650-2730`
- Modify: `/Users/nianbaidediannao/Desktop/前端文件/minitest/campus-map-page.test.cjs:640-690`

**Interfaces:**
- Consumes: `manifest.artworkRoutes` sanitized by Task 7 and `manifest.navigation.graph` compiled from real routes.
- Produces: canvas-only artist route overlays while preserving the existing internal navigation graph.

- [ ] **Step 1: Add a failing Mini Program test**

```js
test('renders sanitized artwork routes while keeping operator routes private', () => {
  const manifest = {
    artworkRoutes: [{
      id: 'route-1',
      title: '校园北路',
      geometry: { type: 'LineString', coordinates: [[100, 200], [240, 260]] },
      style: { stroke: '#F97316', width: 3 },
    }],
  }
  const overlays = sandbox.__normalizeArtworkRoutes(manifest)
  assert.equal(overlays.length, 1)
  assert.deepEqual(overlays[0].points, [[100, 200], [240, 260]])
  assert.equal(JSON.stringify(overlays).includes('sourceObjectId'), false)
})
```

- [ ] **Step 2: Run the page test and verify red**

Run: `cd /Users/nianbaidediannao/Desktop/前端文件 && node --test minitest/campus-map-page.test.cjs`

- [ ] **Step 3: Normalize only the sanitized top-level overlay**

Add `normalizeArtworkRoutes(manifest)` that accepts finite LineString points inside the published artwork bounds. Continue filtering `operator_routes` and `operator_areas` from normal user draw layers.

- [ ] **Step 4: Draw artwork routes in the existing transformed canvas pass**

Draw after the SVG background and before place labels. Use each route's sanitized stroke/width, rounded joins, and the same viewport transform as buildings and markers. Do not draw GCJ-02 coordinates directly on the SVG canvas.

- [ ] **Step 5: Prove display changes do not alter navigation**

Load two packages with identical `navigation.graph` and different `artworkRoutes`; assert `normalizeGraph()` produces identical nodes and edges for both.

- [ ] **Step 6: Run Mini Program map/navigation tests**

```bash
cd /Users/nianbaidediannao/Desktop/前端文件
node --test minitest/campus-map-control.test.cjs minitest/campus-map-geometry.test.cjs minitest/campus-map-page.test.cjs minitest/campus-navigation-session.test.cjs minitest/campus-navigation.test.cjs
```

- [ ] **Step 7: Commit Mini Program changes**

```bash
git add campusMap/index/index.js minitest/campus-map-page.test.cjs
git commit -m "feat(campus-map): render confirmed artwork routes"
```

### Task 9: Cross-Client Verification and Local Acceptance

**Files:**
- Modify only tests or implementation files required by a proven failure from Tasks 1-8.

**Interfaces:**
- Consumes: the full planned-route, rider-target, stable-review, artwork-publication flow.
- Produces: fresh test/build evidence and a manual local acceptance record; no production mutation.

- [ ] **Step 1: Run all focused automated tests**

```bash
cd /Users/nianbaidediannao/Desktop/后端后台本地测试版/admin
node --test src/views/region/components/campus-map/*.test.mjs
npm run typecheck

cd ../backend
../node_modules/.bin/jest --runInBand src/modules/campus-map/campus-map-route-geometry.spec.ts src/modules/campus-map/campus-map-collection.service.spec.ts src/modules/campus-map/campus-map.service.spec.ts

cd /Users/nianbaidediannao/Desktop/骑手端app
node --test tests/campus-collection-*.test.mjs tests/campus-stationary-location.test.mjs

cd /Users/nianbaidediannao/Desktop/前端文件
node --test minitest/campus-map-control.test.cjs minitest/campus-map-geometry.test.cjs minitest/campus-map-page.test.cjs minitest/campus-navigation-session.test.cjs minitest/campus-navigation.test.cjs
```

Expected: every command exits 0. If iCloud `dataless` dependencies block Jest or typecheck, report the exact file and do not call the suite passing.

- [ ] **Step 2: Run builds**

```bash
cd /Users/nianbaidediannao/Desktop/后端后台本地测试版
npm run build:backend
npm run build:admin
```

Expected: both exit 0. Do not infer a successful rider APK or WeChat build from these commands.

- [ ] **Step 3: Perform local admin acceptance**

Use a disposable local map draft and verify:

1. “真实路线” opens AMap and saves a blue planned line.
2. “画师图” shows an auto-projected line that remains unconfirmed.
3. Editing the artwork line changes only `artworkGeometry`.
4. A ready route task cannot be saved empty.
5. A valid target route appears blue in the rider task response.
6. Review updates the original route ID and preserves explicit `public=false`.
7. Publication remains blocked until artwork alignment is manually confirmed.

- [ ] **Step 4: Review diffs in all repositories**

Run `git diff --check`, `git status --short --branch`, and a scoped `git diff --stat` in the backend/admin, rider, and Mini Program repositories. Confirm no dependencies, secrets, generated builds, or unrelated files were added.

- [ ] **Step 5: Record the production acceptance boundary**

State explicitly that deployment, online task creation, newly installed rider APK, real walking capture, formal version publication, public API verification, and WeChat-device navigation remain pending until separately authorized and executed.

- [ ] **Step 6: Final commits**

Create only small follow-up commits for proven verification fixes. Do not squash or rewrite user history unless explicitly requested.
