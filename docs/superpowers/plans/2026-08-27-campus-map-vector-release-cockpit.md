# Campus Map Vector Release Cockpit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the commissioned SVG the Mini Program's only user-visible campus map and turn the admin map editor into a simple five-stage release cockpit with three primary actions.

**Architecture:** Keep the existing backend contracts, draft/version workflow, rider review flow, and artist SVG. Add one pure admin derivation model for release stages/issues, then feed that model into a refactored action bar and inspector; independently remove the Mini Program's native-map render branch while retaining GCJ-02 projection as internal navigation data.

**Tech Stack:** Vue 3 `<script setup>` + TypeScript, Element Plus, Node.js `node:test`, WeChat Mini Program WXML/WXSS/CommonJS, existing NestJS/Prisma backend contracts.

**Spec:** `docs/superpowers/specs/2026-08-27-campus-map-vector-release-cockpit-design.md`

## Global Constraints

- The Mini Program must display only `/campusMap/assets/cqcx-campus-map.svg`; AMap, satellite, CAD, raw rider tracks, and native `<map>` must never become a user-visible fallback.
- Do not redraw, crop, or replace the commissioned SVG.
- Do not add a map-mode switch, runtime dependency, backend endpoint, database table, or production-data mutation.
- Built-in artwork anchors locate vector features only; they do not make an unpublished place public.
- Keep GCJ-02 coordinates and engineering layers available internally for projection, navigation calculation, admin calibration, and review.
- Admin primary actions are exactly `补地点`, `派采集`, and `发布本批`; duplicate peer buttons and status pills are removed or moved into one operations menu.
- Default project visibility remains the safe `phase1_review`; never restore `phase1_active` as an implicit default.
- Reuse existing drawers, services, colors, icons, and CSS variables; do not build a second editor or introduce decorative redesign unrelated to the release flow.
- Preserve all pre-existing dirty-worktree changes. Before every commit, inspect the staged diff and omit the commit when a touched file contains inseparable user-owned work.

---

### Task 1: Lock the Mini Program to the Artist SVG

**Files:**
- Modify: `/Users/nianbaidediannao/Desktop/前端文件/minitest/campus-map-page.test.cjs`
- Modify: `/Users/nianbaidediannao/Desktop/前端文件/campusMap/index/index.wxml`
- Modify only if the failing contract requires it: `/Users/nianbaidediannao/Desktop/前端文件/campusMap/index/index.js`

**Interfaces:**
- Consumes: packaged artwork path `/campusMap/assets/cqcx-campus-map.svg`, existing `backgroundImageUrl`, `visualMarkers`, Canvas gestures, and GCJ-02 projection helpers.
- Produces: a structural contract in which WXML contains no `<map>` element and remote data cannot select a real-map renderer.

- [ ] **Step 1: Write the failing structural tests**

Add these assertions to `campus-map-page.test.cjs` inside the existing commissioned-SVG rendering test:

```js
const illustrated = read("campusMap/index/campus-map-illustrated.js");
assert.doesNotMatch(wxml, /<map(?:\s|>)/, "public WXML must not contain a native map renderer");
assert.match(wxml, /<image[\s\S]*src="\{\{backgroundImageUrl\}\}"/);
assert.match(wxml, /<canvas[\s\S]*id="campusCanvas"/);
assert.doesNotMatch(wxml, /wx:(?:if|elif)="\{\{useNativeMap\}\}"/);
assert.doesNotMatch(wxml, /wx:if="\{\{!useNativeMap\}\}"/);
assert.match(js, /const useNativeMap = false/);
assert.match(illustrated, /imageUrl:\s*"\/campusMap\/assets\/cqcx-campus-map\.svg"/);
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```bash
cd /Users/nianbaidediannao/Desktop/前端文件
node --test minitest/campus-map-page.test.cjs
```

Expected: FAIL because `index.wxml` still contains `<map wx:if="{{useNativeMap}}">` and `useNativeMap` visibility conditions.

- [ ] **Step 3: Remove the native renderer without removing projection logic**

Replace the WXML render branch with the vector image and Canvas only:

```xml
<image
  wx:if="{{backgroundImageUrl}}"
  class="campus-base-image"
  src="{{backgroundImageUrl}}"
  mode="scaleToFill"
  style="{{backgroundImageStyle}}"
/>
<canvas
  id="campusCanvas"
  canvas-id="campusCanvas"
  class="campus-canvas"
  disable-scroll="true"
  bindtap="onCanvasTap"
  bindtouchstart="onTouchStart"
  bindtouchmove="onTouchMove"
  bindtouchend="onTouchEnd"
  bindtouchcancel="onTouchEnd"
></canvas>

<button
  wx:for="{{visualMarkers}}"
  wx:key="id"
  class="visual-marker {{selectedPoiId === item.id ? 'selected' : ''}} {{mapGesturing ? 'gesture-hidden' : ''}}"
  style="left:{{item.left}}px;top:{{item.top}}px"
  data-poi-id="{{item.id}}"
  aria-label="{{item.title}}"
  bindtap="onVisualMarkerTap"
>
  <text class="visual-marker-badge">{{item.badge}}</text>
  <text class="visual-marker-name">{{item.title}}</text>
</button>
```

Keep `useNativeMap: false` in JS for compatibility with existing projection/gesture methods in this change. Do not delete GCJ-02 normalization, route projection, or coordinate conversion helpers.

- [ ] **Step 4: Run focused and adjacent tests**

Run:

```bash
cd /Users/nianbaidediannao/Desktop/前端文件
node --test minitest/campus-map-page.test.cjs minitest/campus-map-control.test.cjs minitest/campus-navigation-session.test.cjs
```

Expected: PASS; any old assertion that requires a public native-map surface must be narrowed to internal coordinate/projection behavior, never satisfied by restoring `<map>`.

- [ ] **Step 5: Review and commit only separable task changes**

```bash
cd /Users/nianbaidediannao/Desktop/前端文件
git diff -- campusMap/index/index.wxml campusMap/index/index.js minitest/campus-map-page.test.cjs minitest/campus-map-control.test.cjs
git diff --check -- campusMap/index/index.wxml campusMap/index/index.js minitest/campus-map-page.test.cjs minitest/campus-map-control.test.cjs
git add -p campusMap/index/index.wxml campusMap/index/index.js minitest/campus-map-page.test.cjs minitest/campus-map-control.test.cjs
git diff --cached --check
git commit -m "fix: make campus artwork the only public map"
```

If patch staging cannot separate earlier user-owned edits, leave the implementation uncommitted and record that condition in the handoff.

### Task 2: Derive Five Release Stages and a Ranked Issue Queue

**Files:**
- Create: `admin/src/views/region/components/campus-map/campusMapReleaseModel.mjs`
- Create: `admin/src/views/region/components/campus-map/campusMapReleaseModel.test.mjs`
- Modify: `minitest/campus-map-project-semantics.test.cjs`

**Interfaces:**
- Consumes:

```ts
type ReleaseCockpitInput = {
  places: any[]
  features: any[]
  routes: any[]
  qualityChecks: Array<{ key: string; status: 'pass' | 'warning' | 'error'; message: string }>
  activeVersion: number
  publishedPlaceCount: number
  publicationVerified: boolean
  hasUnsavedChanges: boolean
}
```

- Produces:

```ts
type ReleaseStage = {
  key: 'binding' | 'verification' | 'candidate' | 'version' | 'online'
  label: string
  completed: number
  total: number
  status: 'pass' | 'warning' | 'error'
  summary: string
}

type ReleaseIssue = {
  key: string
  stage: ReleaseStage['key']
  level: 'warning' | 'error'
  title: string
  message: string
  placeId?: string
  featureId?: string
  action: 'catalog' | 'collection' | 'quality' | 'publish'
}

export function buildCampusReleaseCockpit(input: ReleaseCockpitInput): {
  stages: ReleaseStage[]
  issues: ReleaseIssue[]
  nextAction: { action: ReleaseIssue['action']; label: string; message: string }
}
```

- [ ] **Step 1: Write model tests for incomplete, ready, and stale-online states**

Create `campusMapReleaseModel.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCampusReleaseCockpit } from './campusMapReleaseModel.mjs'

const readyPlace = {
  id: 'place-3', placeId: 'place-3', officialNumber: 3, officialName: '天枢楼',
  artworkFeatureKey: 'area-3', artworkAnchorX: 120, artworkAnchorY: 220,
  coordinateStatus: 'verified', publishStatus: 'published', visibilityScope: 'phase1_active',
  serviceStatus: 'open', searchable: true,
}

test('binding blockers outrank later release blockers', () => {
  const result = buildCampusReleaseCockpit({
    places: [{ id: 'place-4', officialName: '天启楼', coordinateStatus: 'pending' }],
    features: [{ id: 'area-4', title: '天启楼' }], routes: [], qualityChecks: [],
    activeVersion: 0, publishedPlaceCount: 0, publicationVerified: false, hasUnsavedChanges: true,
  })
  assert.equal(result.stages.length, 5)
  assert.equal(result.issues[0].stage, 'binding')
  assert.equal(result.issues[0].action, 'catalog')
  assert.equal(result.nextAction.action, 'catalog')
})

test('fully published data completes all five stages', () => {
  const result = buildCampusReleaseCockpit({
    places: [readyPlace], features: [{ id: 'area-3', placeId: 'place-3' }], routes: [],
    qualityChecks: [], activeVersion: 7, publishedPlaceCount: 1,
    publicationVerified: true, hasUnsavedChanges: false,
  })
  assert.deepEqual(result.stages.map((stage) => stage.status), ['pass', 'pass', 'pass', 'pass', 'pass'])
  assert.equal(result.issues.length, 0)
  assert.equal(result.nextAction.action, 'quality')
})

test('a generated version is not online until the public response is verified', () => {
  const result = buildCampusReleaseCockpit({
    places: [readyPlace], features: [{ id: 'area-3', placeId: 'place-3' }], routes: [],
    qualityChecks: [], activeVersion: 7, publishedPlaceCount: 0,
    publicationVerified: false, hasUnsavedChanges: false,
  })
  assert.equal(result.stages.at(-1).status, 'error')
  assert.equal(result.issues.at(-1).key, 'online-not-verified')
  assert.equal(result.issues.at(-1).action, 'quality')
})
```

- [ ] **Step 2: Run the new model test and confirm RED**

Run:

```bash
node --test admin/src/views/region/components/campus-map/campusMapReleaseModel.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `campusMapReleaseModel.mjs`.

- [ ] **Step 3: Implement the pure release model**

Implement helpers inside `campusMapReleaseModel.mjs` with no Vue or API imports:

```js
const hasAnchor = (item = {}) => Boolean(
  String(item.artworkFeatureKey || '').trim()
  || (Number.isFinite(Number(item.artworkAnchorX)) && Number.isFinite(Number(item.artworkAnchorY)))
)
const placeId = (item = {}) => String(item.placeId || item.id || '')
const verified = (item = {}) => item.coordinateStatus === 'verified'
const candidate = (item = {}) => item.publishStatus === 'published'
  && item.visibilityScope === 'phase1_active'
  && hasAnchor(item)
  && (item.serviceStatus !== 'unopened' || Boolean(String(item.unavailableMessage || '').trim()))

export function buildCampusReleaseCockpit(input = {}) {
  const places = Array.isArray(input.places) ? input.places : []
  const features = Array.isArray(input.features) ? input.features : []
  const errors = (input.qualityChecks || []).filter((item) => item.status === 'error')
  const bound = places.filter((item) => placeId(item) && hasAnchor(item))
  const checked = bound.filter(verified)
  const candidates = checked.filter(candidate)
  const total = Math.max(places.length, features.length)
  const stages = [
    stage('binding', '档案绑定', bound.length, total, bound.length === total && total > 0, '稳定地点和矢量锚点'),
    stage('verification', '现场核验', checked.length, total, checked.length === total && total > 0, '坐标、入口和证据'),
    stage('candidate', '发布候选', candidates.length, total, candidates.length === total && total > 0 && !errors.length, '一期公开且可解释'),
    stage('version', '正式版本', Number(input.activeVersion || 0) > 0 ? candidates.length : 0, total, Number(input.activeVersion || 0) > 0 && !input.hasUnsavedChanges, '不可变发布快照'),
    stage('online', '用户在线', input.publicationVerified ? Number(input.publishedPlaceCount || 0) : 0, total, Boolean(input.publicationVerified) && Number(input.publishedPlaceCount || 0) > 0, '公共接口已验证'),
  ]
  const issues = buildIssues({ ...input, places, features, errors, bound, checked, candidates })
  const first = issues[0]
  return {
    stages,
    issues,
    nextAction: first
      ? { action: first.action, label: first.title, message: first.message }
      : { action: 'quality', label: '查看发布检查', message: '五个阶段已完成' },
  }
}
```

Implement `stage()` and `buildIssues()` in the same file. `buildIssues()` must append issues in this exact order: missing binding/anchor, future-visible, missing verification, unopened-without-message, route-quality error, unsaved draft, online-not-verified. Use stable keys such as `binding:${placeId}`, `verification:${placeId}`, and `quality:${check.key}`.

- [ ] **Step 4: Correct the stale safe-default expectation**

In `minitest/campus-map-project-semantics.test.cjs`, change only the obsolete assertion:

```js
assert.equal(assigned.visibilityScope, 'phase1_review')
assert.equal(assigned.searchable, false)
```

Do not change production code back to `phase1_active`.

- [ ] **Step 5: Run model and existing semantics tests**

Run:

```bash
node --test \
  admin/src/views/region/components/campus-map/campusMapReleaseModel.test.mjs \
  admin/src/views/region/components/campus-map/campusProjectModel.test.mjs \
  minitest/campus-map-project-semantics.test.cjs
```

Expected: PASS.

- [ ] **Step 6: Review and commit separable model changes**

```bash
git diff --check -- admin/src/views/region/components/campus-map/campusMapReleaseModel.mjs admin/src/views/region/components/campus-map/campusMapReleaseModel.test.mjs minitest/campus-map-project-semantics.test.cjs
git add admin/src/views/region/components/campus-map/campusMapReleaseModel.mjs admin/src/views/region/components/campus-map/campusMapReleaseModel.test.mjs
git add -p minitest/campus-map-project-semantics.test.cjs
git diff --cached --check
git commit -m "feat: derive campus map release stages"
```

### Task 3: Replace the Admin Button Wall with a Release Cockpit

**Files:**
- Modify: `admin/src/views/region/components/campus-map/CampusMapActionBar.vue`
- Modify: `admin/src/views/region/components/RegionCampusMapPainter.vue`
- Create: `minitest/campus-map-release-cockpit-ui.test.cjs`

**Interfaces:**
- Consumes: `buildCampusReleaseCockpit()` from Task 2 and existing drawers/actions in `RegionCampusMapPainter.vue`.
- Produces: `releaseCockpit` computed state, `releaseStage` selection, `handleReleaseAction(action)`, `handleReleaseStage(stageKey)`, and `handleOperationsCommand(command)`.

- [ ] **Step 1: Write the static UI contract test**

Create `minitest/campus-map-release-cockpit-ui.test.cjs`:

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')

const read = (file) => fs.readFileSync(file, 'utf8')
const actionBar = read('admin/src/views/region/components/campus-map/CampusMapActionBar.vue')
const painter = read('admin/src/views/region/components/RegionCampusMapPainter.vue')

test('campus map cockpit exposes five stages and only three primary operations', () => {
  for (const label of ['档案绑定', '现场核验', '发布候选', '正式版本', '用户在线']) assert.match(actionBar, new RegExp(label))
  for (const label of ['补地点', '派采集', '发布本批']) assert.match(actionBar, new RegExp(label))
  for (const oldPeer of ['>导入 CAD<', '>刷新<', '>高级<', '>预览<', '>版本历史<', '>保存草稿<', '>停用<']) assert.doesNotMatch(actionBar, new RegExp(oldPeer))
  assert.match(actionBar, /el-dropdown/)
  assert.match(painter, /buildCampusReleaseCockpit/)
  assert.match(painter, /handleReleaseAction/)
})
```

- [ ] **Step 2: Run the UI contract test and confirm RED**

Run:

```bash
node --test minitest/campus-map-release-cockpit-ui.test.cjs
```

Expected: FAIL because the current action bar exposes all operations as peer buttons and has no five-stage strip.

- [ ] **Step 3: Refactor `CampusMapActionBar.vue` around stages and three actions**

Replace count/status peer pills with a stage strip:

```vue
<button
  v-for="stage in releaseCockpit.stages"
  :key="stage.key"
  type="button"
  class="release-stage"
  :class="[stage.status, { active: activeStage === stage.key }]"
  @click="$emit('select-stage', stage.key)"
>
  <span>{{ stage.label }}</span>
  <strong>{{ stage.completed }}/{{ stage.total }}</strong>
  <small>{{ stage.summary }}</small>
</button>
```

The actions section must contain only:

```vue
<el-button :icon="OfficeBuilding" @click="$emit('run-action', 'catalog')">补地点</el-button>
<el-button :icon="Position" @click="$emit('run-action', 'collection')">派采集</el-button>
<el-button type="primary" :icon="Check" :loading="saving" @click="$emit('run-action', 'publish')">发布本批</el-button>
<el-dropdown trigger="click" @command="$emit('operation', $event)">
  <el-button :icon="MoreFilled" aria-label="更多运维操作" />
  <template #dropdown>
    <el-dropdown-menu>
      <el-dropdown-item command="import">导入 CAD</el-dropdown-item>
      <el-dropdown-item command="catalog">地点档案全量管理</el-dropdown-item>
      <el-dropdown-item command="preview">小程序预览</el-dropdown-item>
      <el-dropdown-item command="versions">版本历史与回滚</el-dropdown-item>
      <el-dropdown-item command="advanced">高级设置</el-dropdown-item>
      <el-dropdown-item command="refresh">刷新数据</el-dropdown-item>
      <el-dropdown-item command="disable" divided>停用地图</el-dropdown-item>
    </el-dropdown-menu>
  </template>
</el-dropdown>
```

Display `未保存`, `草稿 rN`, `线上 vN`, and public-place count as one compact metadata row. Remove the assistant score button and enabled switch from the primary row; retain advanced/disable behavior through the operations menu.

- [ ] **Step 4: Wire the pure model and action routing in the painter**

Add:

```ts
import { buildCampusReleaseCockpit } from './campus-map/campusMapReleaseModel.mjs'

type ReleaseAction = 'catalog' | 'collection' | 'quality' | 'publish'
type ReleaseStageKey = 'binding' | 'verification' | 'candidate' | 'version' | 'online'
const releaseStage = ref<ReleaseStageKey>('binding')
const releaseCockpit = computed(() => buildCampusReleaseCockpit({
  places: projectCatalog.value,
  features: [...pois.value, ...areas.value],
  routes: routes.value,
  qualityChecks: mapQualityChecks.value,
  activeVersion: workflow.activeVersion,
  publishedPlaceCount: livePublication.publicPlaceCount,
  publicationVerified: livePublication.verified,
  hasUnsavedChanges: hasUnsavedChanges.value,
}))

function handleReleaseAction(action: ReleaseAction) {
  if (action === 'catalog') { catalogDrawerVisible.value = true; return }
  if (action === 'collection') { collectionDrawerVisible.value = true; return }
  if (action === 'quality' || (action === 'publish' && !publishReadiness.value.canPublish)) { openQualityDrawer(); return }
  publishMap()
}

function handleReleaseStage(stage: ReleaseStageKey) {
  releaseStage.value = stage
  selectedId.value = ''
}
```

Map dropdown commands to existing methods with a `switch`; do not duplicate drawer state or API calls.

- [ ] **Step 5: Run UI/model tests and typecheck**

Run:

```bash
node --test minitest/campus-map-release-cockpit-ui.test.cjs admin/src/views/region/components/campus-map/campusMapReleaseModel.test.mjs
npm --workspace admin run typecheck
```

Expected: PASS.

- [ ] **Step 6: Inspect the 1440px responsive hierarchy**

Run the admin locally and inspect the existing campus-map route at 1440px. Verify the title/metadata, five stages, three actions, and more menu remain readable without wrapping into a wall of controls. If local campus tables or login are unavailable, capture the exact blocker and defer only visual acceptance.

- [ ] **Step 7: Review and commit only separable task changes**

```bash
git diff --check -- admin/src/views/region/components/campus-map/CampusMapActionBar.vue admin/src/views/region/components/RegionCampusMapPainter.vue minitest/campus-map-release-cockpit-ui.test.cjs
git add -p admin/src/views/region/components/campus-map/CampusMapActionBar.vue admin/src/views/region/components/RegionCampusMapPainter.vue
git add minitest/campus-map-release-cockpit-ui.test.cjs
git diff --cached --check
git commit -m "refactor: simplify campus map release operations"
```

### Task 4: Make the Inspector an Actionable Issue Queue by Default

**Files:**
- Modify: `admin/src/views/region/components/campus-map/CampusMapInspector.vue`
- Modify: `admin/src/views/region/components/RegionCampusMapPainter.vue`
- Modify: `minitest/campus-map-release-cockpit-ui.test.cjs`

**Interfaces:**
- Consumes: `releaseCockpit.issues`, `releaseStage`, existing `selectLayerItem`, catalog drawer, collection drawer, quality drawer, and publish action.
- Produces: `runIssue` event carrying a `ReleaseIssue`; raw layer lists remain available only in a collapsed secondary section.

- [ ] **Step 1: Extend the static UI contract test**

Append:

```js
const inspector = read('admin/src/views/region/components/campus-map/CampusMapInspector.vue')
assert.match(inspector, /当前阻塞/)
assert.match(inspector, /releaseCockpit\.issues/)
assert.match(inspector, /\$emit\('runIssue', issue\)/)
assert.match(inspector, /el-collapse-item[\s\S]*图层对象/)
```

- [ ] **Step 2: Run the UI test and confirm RED**

Run:

```bash
node --test minitest/campus-map-release-cockpit-ui.test.cjs
```

Expected: FAIL because the inspector still opens on a flat list of every layer object.

- [ ] **Step 3: Put the issue queue above the secondary layer list**

Add props and event:

```ts
releaseCockpit: {
  stages: any[]
  issues: Array<{ key: string; stage: string; level: 'warning' | 'error'; title: string; message: string; action: string }>
  nextAction: { action: string; label: string; message: string }
}
releaseStage: string
// emit
runIssue: [issue: any]
```

Replace the no-selection body with:

```vue
<div v-else class="empty-inspector">
  <section class="issue-queue">
    <div class="issue-queue-head">
      <div><strong>当前阻塞</strong><small>先处理最上面一项</small></div>
      <el-tag size="small" :type="releaseCockpit.issues.length ? 'danger' : 'success'">
        {{ releaseCockpit.issues.length ? `${releaseCockpit.issues.length} 项` : '已清空' }}
      </el-tag>
    </div>
    <button
      v-for="issue in visibleIssues"
      :key="issue.key"
      type="button"
      class="issue-row"
      :class="issue.level"
      @click="$emit('runIssue', issue)"
    >
      <span>{{ issue.level === 'error' ? '必须' : '建议' }}</span>
      <p><strong>{{ issue.title }}</strong><small>{{ issue.message }}</small></p>
    </button>
    <div v-if="!visibleIssues.length" class="issue-clear">当前阶段没有阻塞，可以继续检查发布。</div>
  </section>
  <el-collapse class="layer-details">
    <el-collapse-item name="layers" title="图层对象">
      <div class="layer-summary">
        <button v-for="poi in pois" :key="poi.id" type="button" class="layer-row" @click="$emit('selectLayerItem', 'poi', poi.id)"><span>点</span><strong>{{ poi.title || '未命名点位' }}</strong></button>
        <button v-for="area in areas" :key="area.id" type="button" class="layer-row" @click="$emit('selectLayerItem', 'area', area.id)"><span>区</span><strong>{{ area.title || '未命名区域' }}</strong></button>
        <button v-for="route in routes" :key="route.id" type="button" class="layer-row" @click="$emit('selectLayerItem', 'route', route.id)"><span>线</span><strong>{{ route.title || '未命名路线' }}</strong></button>
        <button v-for="point in calibrationPoints" :key="point.id" type="button" class="layer-row" @click="$emit('selectLayerItem', 'calibration', point.id)"><span>准</span><strong>{{ point.title || '校准点' }}</strong></button>
      </div>
    </el-collapse-item>
  </el-collapse>
</div>
```

Add `visibleIssues = computed(() => props.releaseCockpit.issues.filter(issue => issue.stage === props.releaseStage))`; if that list is empty, return all issues so the operator never sees a false-clear state while another stage is blocked.

- [ ] **Step 4: Reuse existing surfaces for issue actions**

In the painter:

```ts
function handleReleaseIssue(issue: any) {
  if (issue.featureId) {
    const feature = [...areas.value, ...pois.value, ...routes.value].find((item) => String(item.id) === String(issue.featureId))
    if (feature) selectLayerItem(Array.isArray(feature.points) ? 'area' : 'poi', feature.id)
  }
  if (issue.action === 'catalog') { catalogDrawerVisible.value = true; return }
  if (issue.action === 'collection') {
    const place = collectionPlaces.value.find((item) => String(item.placeId || item.id) === String(issue.placeId || ''))
    if (place?.placeId) { openPlaceCollectionTask(place); return }
    collectionDrawerVisible.value = true
    return
  }
  handleReleaseAction(issue.action)
}
```

Pass `:release-cockpit`, `:release-stage`, and `@run-issue` to the inspector. Do not create a new details drawer.

- [ ] **Step 5: Run UI/model tests and typecheck**

Run:

```bash
node --test minitest/campus-map-release-cockpit-ui.test.cjs admin/src/views/region/components/campus-map/campusMapReleaseModel.test.mjs
npm --workspace admin run typecheck
```

Expected: PASS.

- [ ] **Step 6: Review and commit only separable task changes**

```bash
git diff --check -- admin/src/views/region/components/campus-map/CampusMapInspector.vue admin/src/views/region/components/RegionCampusMapPainter.vue minitest/campus-map-release-cockpit-ui.test.cjs
git add -p admin/src/views/region/components/campus-map/CampusMapInspector.vue admin/src/views/region/components/RegionCampusMapPainter.vue minitest/campus-map-release-cockpit-ui.test.cjs
git diff --cached --check
git commit -m "feat: surface campus release blockers first"
```

### Task 5: Polish Mini Program Controls Without Touching the Artwork

**Files:**
- Modify: `/Users/nianbaidediannao/Desktop/前端文件/minitest/campus-map-page.test.cjs`
- Modify: `/Users/nianbaidediannao/Desktop/前端文件/campusMap/index/index.wxml`
- Modify: `/Users/nianbaidediannao/Desktop/前端文件/campusMap/index/index.wxss`

**Interfaces:**
- Consumes: existing Mini Program native `<icon>` component and current CSS variables/classes.
- Produces: native search/clear controls, compact translucent surfaces, and a clearer selected-marker state with no new assets or dependencies.

- [ ] **Step 1: Add visual-contract assertions**

Add to the existing search/detail test:

```js
assert.match(wxml, /<icon[^>]+type="search"/)
assert.match(wxml, /<icon[^>]+type="clear"/)
assert.doesNotMatch(wxml, />⌕<|>×<|>⌖</)
assert.match(wxss, /\.map-search-row[\s\S]*backdrop-filter/)
assert.match(wxss, /\.visual-marker\.selected/)
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```bash
cd /Users/nianbaidediannao/Desktop/前端文件
node --test minitest/campus-map-page.test.cjs
```

Expected: FAIL on character icons and missing glass-surface assertion.

- [ ] **Step 3: Replace character icons with native controls**

Use:

```xml
<icon class="map-search-icon" type="search" size="18" color="#64748b" />
<button wx:if="{{searchKeyword}}" class="map-search-clear" bindtap="clearPoiSearch" aria-label="清空搜索">
  <icon type="clear" size="17" color="#64748b" />
</button>
```

Replace the reset character with readable copy or an existing icon-backed action:

```xml
<button class="tool-button tool-reset" bindtap="resetView" aria-label="重置地图视图">重置</button>
```

- [ ] **Step 4: Tighten only the existing visual surfaces**

Update the existing selectors rather than creating a second theme:

```css
.map-search-row,
.map-search-results,
.map-panel,
.navigation-panel {
  background: rgba(255, 255, 255, .92);
  -webkit-backdrop-filter: blur(18rpx);
  backdrop-filter: blur(18rpx);
  box-shadow: 0 12rpx 34rpx rgba(15, 23, 42, .12);
}

.visual-marker.selected {
  z-index: 8;
  transform: translate(-50%, -100%) scale(1.06);
}
```

Keep the SVG image itself untouched and preserve map pan/zoom bounds.

- [ ] **Step 5: Run focused tests and static scans**

Run:

```bash
cd /Users/nianbaidediannao/Desktop/前端文件
node --test minitest/campus-map-page.test.cjs minitest/campus-map-control.test.cjs minitest/campus-navigation-session.test.cjs
rg -n '<map(?:\\s|>)|data-mode="reality"|>实景图<' campusMap/index/index.wxml campusMap/index/index.js
```

Expected: tests PASS and `rg` returns no user renderer/mode-switch matches.

- [ ] **Step 6: Review and commit only separable task changes**

```bash
cd /Users/nianbaidediannao/Desktop/前端文件
git diff --check -- campusMap/index/index.wxml campusMap/index/index.wxss minitest/campus-map-page.test.cjs
git add -p campusMap/index/index.wxml campusMap/index/index.wxss minitest/campus-map-page.test.cjs
git diff --cached --check
git commit -m "style: simplify illustrated campus map controls"
```

### Task 6: Full Regression and Real-Flow Acceptance

**Files:**
- Verify only: backend/admin, Mini Program, and rider campus-map test suites.
- Update only if an assertion still encodes a user-visible real-map fallback: the exact failing test file.

**Interfaces:**
- Consumes: all deliverables from Tasks 1-5.
- Produces: automated evidence for vector-only rendering, publish cockpit behavior, backend publication safety, and rider collection compatibility.

- [ ] **Step 1: Run admin release and map tests**

```bash
cd /Users/nianbaidediannao/Desktop/后端后台本地测试版
node --test \
  admin/src/views/region/components/campus-map/*.test.mjs \
  minitest/campus-map-project-semantics.test.cjs \
  minitest/campus-map-release-cockpit-ui.test.cjs
npm --workspace admin run typecheck
npm --workspace admin run build
```

Expected: all tests PASS; Vue typecheck and Vite build exit 0.

- [ ] **Step 2: Run backend campus-map tests without changing the database**

```bash
cd /Users/nianbaidediannao/Desktop/后端后台本地测试版
npm --workspace backend test -- --runInBand --testPathPattern=campus-map
```

Expected: all campus-map specs PASS. Do not run production migrations or publish calls.

- [ ] **Step 3: Run Mini Program campus-map tests**

```bash
cd /Users/nianbaidediannao/Desktop/前端文件
node --test \
  minitest/campus-map-page.test.cjs \
  minitest/campus-map-control.test.cjs \
  minitest/campus-map-collector.test.cjs \
  minitest/campus-navigation-session.test.cjs
```

Expected: all tests PASS.

- [ ] **Step 4: Run rider campus-map tests**

Run the rider repository's read-only test suite; do not create an APK unless separately requested:

```bash
cd /Users/nianbaidediannao/Desktop/骑手端app
npm test
```

Expected: all rider tests PASS.

- [ ] **Step 5: Prove there is no public real-map renderer**

```bash
rg -n '<map(?:\\s|>)|AMap\.ImageLayer|data-mode="reality"|>实景图<' \
  /Users/nianbaidediannao/Desktop/前端文件/campusMap \
  /Users/nianbaidediannao/Desktop/前端文件/minitest
cmp \
  /Users/nianbaidediannao/Desktop/后端后台本地测试版/admin/public/campusMap/assets/cqcx-campus-map.svg \
  /Users/nianbaidediannao/Desktop/前端文件/campusMap/assets/cqcx-campus-map.svg
```

Expected: no public renderer/mode-switch match; `cmp` exits 0.

- [ ] **Step 6: Perform visual acceptance where the environment permits**

Check admin at 1440px for: five stages visible, one obvious blocker, three primary actions, and secondary operations in one menu. Check WeChat Developer Tools for: search closed/open, place selected, navigation active, empty publication, and SVG load failure. Verify no view exposes AMap/satellite/CAD/raw tracks and the SVG has no stretching, cropping, or blank margins.

If login, local campus tables, formal published data, or a connected device is missing, report that exact boundary. Do not reinterpret a build or simulator result as production or installed-phone acceptance.

- [ ] **Step 7: Final diff and worktree safety review**

```bash
cd /Users/nianbaidediannao/Desktop/后端后台本地测试版
git diff --check
git status --short
cd /Users/nianbaidediannao/Desktop/前端文件
git diff --check
git status --short
```

Expected: no whitespace errors. Final handoff lists modified task files, automated evidence, visual checks completed, and any production/device checks still outstanding.
