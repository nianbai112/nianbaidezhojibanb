# Phase-One Campus Building Semantics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a phase-one campus map that assigns official numbers and names to individual built facilities, keeps future construction out of the public map, and renders searchable, navigable, semantically styled buildings in admin and the WeChat mini-program.

**Architecture:** Keep CAD/GeoJSON as the only geometry source and add an official project catalog as metadata. Preserve that metadata through import, draft, publish, and mini-program parsing; the backend enforces the public visibility boundary, while admin supplies explicit assignment and review controls. Do not introduce a new database table: metadata remains inside draft/version manifest JSON and GeoJSON feature properties.

**Tech Stack:** Node.js ESM data tools, NestJS/Jest backend, Vue 3/Element Plus/OpenLayers admin, WeChat mini-program Canvas/native map, Node test/minitest.

## Global Constraints

- Work from isolated Git worktrees because both authoritative repositories currently contain unrelated uncommitted changes.
- Snapshot and carry forward only existing campus-map changes needed by this feature; do not stage or overwrite unrelated dirty files.
- CAD/GeoJSON remains the only coordinate and geometry source; never trace official geometry from the promotional perspective image.
- Public phase-one project numbers are exactly `1-13,16,17` and must total 15 unique entries.
- Future reference project numbers are exactly `14,15,18-37` and must total 22 unique entries.
- Public APIs must not return `constructionStatus=under_construction`, `visibilityScope=future_reference`, or `geometryStatus=unmatched` features.
- Unknown uses for projects `3-13,16,17` remain `semanticType=building`.
- Do not overwrite the current database draft, publish a map, deploy, or claim device acceptance during implementation.
- Backend/admin and mini-program changes use separate repositories and separate commits.

---

## File Structure

### Backend/admin repository

- Create `backend/src/modules/campus-map/campus-map-project-catalog.ts`: official 1-37 catalog, status/visibility helpers, metadata normalization, publication validation.
- Create `backend/src/modules/campus-map/campus-map-project-catalog.spec.ts`: catalog and visibility unit tests.
- Modify `backend/src/modules/campus-map/campus-map-import.service.ts`: preserve official metadata from GeoJSON into import drafts.
- Modify `backend/src/modules/campus-map/campus-map-import.service.spec.ts`: metadata-preservation regression tests.
- Modify `backend/src/modules/campus-map/campus-map.service.ts`: retain metadata in normalized layers, validate publish, and strip non-public features from active responses.
- Modify `backend/src/modules/campus-map/campus-map.service.spec.ts`: publish rejection and public filtering tests.
- Modify `backend/src/modules/campus-map/campus-map.controller.ts`: expose the official catalog to authorized admins.
- Modify `backend/src/modules/campus-map/campus-map.controller.spec.ts`: catalog endpoint coverage.
- Modify `admin/src/api/admin.ts`: admin catalog request.
- Create `admin/src/views/region/components/campus-map/campusProjectModel.mjs`: pure assignment, counts, visibility, and style helpers.
- Create `minitest/campus-map-project-semantics.test.cjs`: admin pure-model regression tests.
- Modify `admin/src/views/region/components/campus-map/CampusMapInspector.vue`: official project assignment and status/search/navigation fields.
- Modify `admin/src/views/region/components/campus-map/CampusMapCadWorkbench.vue`: semantic fills and official-number labels.
- Modify `admin/src/views/region/components/campus-map/cadWorkbenchModel.mjs`: carry project metadata into feature records and layer summaries.
- Modify `admin/src/views/region/components/RegionCampusMapPainter.vue`: load catalog, preserve metadata, calculate review counts, and serialize fields.

### Campus data package

- Create `/Users/nianbaidediannao/Desktop/校园地图资料/06-校园地图精简版-v1/tools/campus-map-phase1-projects.mjs`: official catalog and report helpers for the generated package.
- Modify `/Users/nianbaidediannao/Desktop/校园地图资料/06-校园地图精简版-v1/tools/build-campus-map-clean-v1.mjs`: emit catalog and review artifacts without inventing geometry.
- Modify `/Users/nianbaidediannao/Desktop/校园地图资料/06-校园地图精简版-v1/tools/campus-map-cleaner.test.mjs`: catalog, status, and artifact regression tests.
- Generate `/Users/nianbaidediannao/Desktop/校园地图资料/06-校园地图精简版-v1/map/一期项目目录-v1.json`.
- Generate `/Users/nianbaidediannao/Desktop/校园地图资料/06-校园地图精简版-v1/map/校园地图-一期语义化后台导入版-v2.geojson`.
- Generate `/Users/nianbaidediannao/Desktop/校园地图资料/06-校园地图精简版-v1/report/一期楼栋匹配清单.md`.

### Mini-program repository

- Modify `/Users/nianbaidediannao/Desktop/前端文件/campusMap/index/index.js`: visibility filtering, official metadata, search aliases, semantic styles, and navigation permission.
- Modify `/Users/nianbaidediannao/Desktop/前端文件/campusMap/index/index.wxml`: official number/status detail fields.
- Modify `/Users/nianbaidediannao/Desktop/前端文件/campusMap/index/index.wxss`: accessible project number badge and semantic detail styles.
- Modify `/Users/nianbaidediannao/Desktop/前端文件/minitest/campus-map-page.test.cjs`: public visibility, search, detail, and navigation tests.
- Modify `/Users/nianbaidediannao/Desktop/前端文件/minitest/campus-map-control.test.cjs`: draw/style and navigation permission assertions.

---

### Task 1: Official Project Catalog and Public Visibility Rules

**Files:**
- Create: `backend/src/modules/campus-map/campus-map-project-catalog.ts`
- Create: `backend/src/modules/campus-map/campus-map-project-catalog.spec.ts`

**Interfaces:**
- Produces: `CampusProjectMetadata`, `CAMPUS_PROJECT_CATALOG`, `normalizeCampusProjectMetadata(value)`, `isPublicCampusProject(value)`, `validateCampusProjectCollection(features)`.
- Consumed by: Tasks 2, 3, and 4.

- [ ] **Step 1: Write the failing catalog tests**

```ts
import {
  CAMPUS_PROJECT_CATALOG,
  isPublicCampusProject,
  validateCampusProjectCollection,
} from './campus-map-project-catalog';

describe('campus project catalog', () => {
  it('contains the exact 15 built and 22 future project numbers', () => {
    const built = CAMPUS_PROJECT_CATALOG.filter((item) => item.constructionStatus === 'built');
    const future = CAMPUS_PROJECT_CATALOG.filter((item) => item.constructionStatus === 'under_construction');
    expect(built.map((item) => item.officialNumber)).toEqual([1,2,3,4,5,6,7,8,9,10,11,12,13,16,17]);
    expect(future.map((item) => item.officialNumber)).toEqual([14,15,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37]);
  });

  it('never exposes future or unmatched projects publicly', () => {
    expect(isPublicCampusProject({ constructionStatus: 'built', visibilityScope: 'phase1_active', geometryStatus: 'verified_polygon' })).toBe(true);
    expect(isPublicCampusProject({ constructionStatus: 'under_construction', visibilityScope: 'future_reference', geometryStatus: 'verified_polygon' })).toBe(false);
    expect(isPublicCampusProject({ constructionStatus: 'built', visibilityScope: 'phase1_review', geometryStatus: 'unmatched' })).toBe(false);
  });

  it('rejects duplicate numbers and future navigation', () => {
    expect(validateCampusProjectCollection([
      { properties: { officialNumber: 3, constructionStatus: 'built', visibilityScope: 'phase1_active' } },
      { properties: { officialNumber: 3, constructionStatus: 'built', visibilityScope: 'phase1_active' } },
      { properties: { officialNumber: 15, constructionStatus: 'under_construction', visibilityScope: 'future_reference', navigable: true } },
    ])).toEqual(expect.arrayContaining([
      expect.stringContaining('重复官方编号 3'),
      expect.stringContaining('在建项目 15 不能开启导航'),
    ]));
  });
});
```

- [ ] **Step 2: Run the test and verify the module is missing**

Run: `npm --workspace backend test -- --runInBand src/modules/campus-map/campus-map-project-catalog.spec.ts`

Expected: FAIL because `campus-map-project-catalog.ts` does not exist.

- [ ] **Step 3: Implement the catalog and helpers**

Define the exact metadata type:

```ts
export type CampusProjectMetadata = {
  officialNumber: number;
  officialName: string;
  engineeringAlias: string;
  phase: 'phase1' | 'future';
  constructionStatus: 'built' | 'under_construction';
  visibilityScope: 'phase1_active' | 'phase1_review' | 'future_reference';
  semanticType: string;
  searchable: boolean;
  navigable: boolean;
  geometryStatus: 'verified_polygon' | 'verified_point' | 'point_only' | 'unmatched';
  sourceConfidence: 'official_signage_and_cad' | 'official_signage_only';
};
```

Populate all 37 entries exactly from the approved design. Use `building` for 3-13, 16, and 17. Built catalog entries default to `phase1_review`, `searchable=false`, `navigable=false`, and `geometryStatus=unmatched`; explicit geometry assignment is required before activation.

Implement:

```ts
export function isPublicCampusProject(value: Partial<CampusProjectMetadata>) {
  const managed = Boolean(value.officialNumber || value.visibilityScope || value.constructionStatus);
  if (!managed) return true;
  return value.constructionStatus === 'built'
    && value.visibilityScope === 'phase1_active'
    && value.geometryStatus !== 'unmatched';
}
```

`validateCampusProjectCollection` returns Chinese error strings for duplicate positive `officialNumber`, blank `officialName`, future search/navigation, and review/unmatched features placed in the active scope.

- [ ] **Step 4: Run focused tests**

Run: `npm --workspace backend test -- --runInBand src/modules/campus-map/campus-map-project-catalog.spec.ts`

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/campus-map/campus-map-project-catalog.ts backend/src/modules/campus-map/campus-map-project-catalog.spec.ts
git commit -m "feat: add official campus project catalog"
```

---

### Task 2: Preserve Project Metadata Through GeoJSON Import

**Files:**
- Modify: `backend/src/modules/campus-map/campus-map-import.service.ts`
- Modify: `backend/src/modules/campus-map/campus-map-import.service.spec.ts`

**Interfaces:**
- Consumes: `normalizeCampusProjectMetadata(value)` from Task 1.
- Produces: import draft `pois[]` and `areas[]` carrying the complete project metadata contract.
- Consumed by: Task 4 admin normalization.

- [ ] **Step 1: Add a failing GeoJSON metadata test**

```ts
it('preserves official project metadata in imported GeoJSON features', () => {
  const service = new CampusMapImportService(createPrisma() as any);
  const result = service.convertGeoJsonToDraft({
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: {
        title: '天枢楼',
        layer: 'phase1_buildings',
        officialNumber: 3,
        officialName: '天枢楼',
        phase: 'phase1',
        constructionStatus: 'built',
        visibilityScope: 'phase1_active',
        semanticType: 'building',
        searchable: true,
        navigable: true,
        geometryStatus: 'verified_polygon',
        sourceConfidence: 'official_signage_and_cad',
      },
      geometry: { type: 'Polygon', coordinates: [[[0,0],[20,0],[20,20],[0,20],[0,0]]] },
    }],
  });
  expect(result.draft.areas[0]).toEqual(expect.objectContaining({
    officialNumber: 3,
    officialName: '天枢楼',
    constructionStatus: 'built',
    visibilityScope: 'phase1_active',
    searchable: true,
    navigable: true,
    geometryStatus: 'verified_polygon',
  }));
});
```

- [ ] **Step 2: Run the test and verify metadata is dropped**

Run: `npm --workspace backend test -- --runInBand src/modules/campus-map/campus-map-import.service.spec.ts -t "preserves official project metadata"`

Expected: FAIL because the draft area lacks `officialNumber` and visibility fields.

- [ ] **Step 3: Extend `RawCadFeature` and GeoJSON conversion**

Add `project?: Partial<CampusProjectMetadata>` to `RawCadFeature`. In `geoJsonFeaturesToRawFeatures`, call `normalizeCampusProjectMetadata(properties)` once and attach the returned object. In `rawFeaturesToDraft`, spread `feature.project` into point and polygon draft items after the semantic defaults so official metadata wins.

Do not attach project metadata to ordinary road/landscape routes unless the GeoJSON feature contains a positive `officialNumber`.

- [ ] **Step 4: Run import service tests**

Run: `npm --workspace backend test -- --runInBand src/modules/campus-map/campus-map-import.service.spec.ts`

Expected: PASS with the new metadata regression and all existing import tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/campus-map/campus-map-import.service.ts backend/src/modules/campus-map/campus-map-import.service.spec.ts
git commit -m "feat: preserve campus project import metadata"
```

---

### Task 3: Enforce Publish and Active-Map Isolation

**Files:**
- Modify: `backend/src/modules/campus-map/campus-map.service.ts`
- Modify: `backend/src/modules/campus-map/campus-map.service.spec.ts`
- Modify: `backend/src/modules/campus-map/campus-map.controller.ts`
- Modify: `backend/src/modules/campus-map/campus-map.controller.spec.ts`

**Interfaces:**
- Consumes: catalog and validation helpers from Task 1.
- Produces: `GET /admin/campus-map/project-catalog`; publish validation; public manifests stripped to active built features.
- Consumed by: Tasks 4 and 5.

- [ ] **Step 1: Write failing service tests**

Add tests proving:

```ts
it('rejects publishing a future searchable feature', async () => {
  prisma.campusMap.findUnique.mockResolvedValue({ id: 'map-1' });
  prisma.campusMapDraft.findUnique.mockResolvedValue({
    revision: 1,
    manifest: manifestWithFeature({
      officialNumber: 15,
      officialName: '学生餐厅',
      constructionStatus: 'under_construction',
      visibilityScope: 'future_reference',
      searchable: true,
      navigable: false,
      geometryStatus: 'verified_polygon',
    }),
  });
  await expect(service.publishDraft('region-1')).rejects.toThrow('在建项目 15 不能开启搜索');
});

it('removes review and future features from the active response', async () => {
  // activeVersion.manifest contains one active, one review, and one future project feature
  const result = await service.getActiveMap('region-1');
  const features = result.layers.flatMap((layer) => layer.inlineData?.features || []);
  expect(features.map((feature) => feature.properties.officialNumber)).toEqual([3]);
});
```

Add a controller test expecting `getProjectCatalog()` to return 37 entries.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm --workspace backend test -- --runInBand src/modules/campus-map/campus-map.service.spec.ts src/modules/campus-map/campus-map.controller.spec.ts`

Expected: FAIL because publish validation, public filtering, and the catalog endpoint are absent.

- [ ] **Step 3: Implement manifest feature traversal**

Add private helpers in `CampusMapService`:

```ts
private inlineFeatures(manifest: Record<string, any>) {
  return this.normalizeLayers(manifest.layers)
    .flatMap((layer) => Array.isArray(layer.inlineData?.features) ? layer.inlineData.features : []);
}

private publicProjectLayers(layers: any[]) {
  return layers.map((layer) => ({
    ...layer,
    inlineData: layer.inlineData ? {
      ...layer.inlineData,
      features: (layer.inlineData.features || []).filter((feature) => {
        const props = feature?.properties || {};
        return isPublicCampusProject(props);
      }),
    } : layer.inlineData,
  }));
}
```

Before version creation in `publishDraft`, call `validateCampusProjectCollection(this.inlineFeatures(manifest))` and throw `BadRequestException(errors.join('；'))` when errors exist. In `toPublicConfig`, apply `publicProjectLayers` after layer normalization and before feature counts are returned.

Ordinary background geometry without project status fields remains public. Imported CAD POIs/areas carrying `visibilityScope=phase1_review` remain private even before an official number is assigned, so engineering labels such as “1号院” do not leak into the user map.

- [ ] **Step 4: Add the catalog endpoint**

Add `CampusMapService.getProjectCatalog()` returning cloned catalog entries, then expose:

```ts
@Get('admin/campus-map/project-catalog')
@UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
@RequirePermission('region:view')
getProjectCatalog() {
  return this.service.getProjectCatalog();
}
```

Place this static route before `admin/campus-map/:regionId` to prevent `project-catalog` being treated as a region ID.

- [ ] **Step 5: Run backend campus-map tests**

Run: `npm --workspace backend test -- --runInBand src/modules/campus-map/campus-map-project-catalog.spec.ts src/modules/campus-map/campus-map-import.service.spec.ts src/modules/campus-map/campus-map.service.spec.ts src/modules/campus-map/campus-map.controller.spec.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/campus-map/campus-map.service.ts backend/src/modules/campus-map/campus-map.service.spec.ts backend/src/modules/campus-map/campus-map.controller.ts backend/src/modules/campus-map/campus-map.controller.spec.ts
git commit -m "feat: isolate future campus projects from publishing"
```

---

### Task 4: Generate the Phase-One Catalog and Matching Report

**Files:**
- Create: `/Users/nianbaidediannao/Desktop/校园地图资料/06-校园地图精简版-v1/tools/campus-map-phase1-projects.mjs`
- Modify: `/Users/nianbaidediannao/Desktop/校园地图资料/06-校园地图精简版-v1/tools/build-campus-map-clean-v1.mjs`
- Modify: `/Users/nianbaidediannao/Desktop/校园地图资料/06-校园地图精简版-v1/tools/campus-map-cleaner.test.mjs`

**Interfaces:**
- Produces: `PHASE1_PROJECTS`, `FUTURE_PROJECTS`, `validateProjectCatalog()`, `renderProjectMatchingReport()`.
- Produces artifacts consumed by operators; it does not invent geometry or auto-publish.

- [ ] **Step 1: Add failing data-package tests**

```js
test('official project catalog separates 15 built and 22 future entries', async () => {
  const { PHASE1_PROJECTS, FUTURE_PROJECTS, validateProjectCatalog } = await import('./campus-map-phase1-projects.mjs')
  assert.deepEqual(PHASE1_PROJECTS.map((item) => item.officialNumber), [1,2,3,4,5,6,7,8,9,10,11,12,13,16,17])
  assert.equal(FUTURE_PROJECTS.length, 22)
  assert.deepEqual(validateProjectCatalog([...PHASE1_PROJECTS, ...FUTURE_PROJECTS]), [])
})

test('build emits catalog and review report without fake geometry', async () => {
  // run buildCampusMap into a temporary directory
  const catalog = JSON.parse(await readFile(path.join(outputDir, 'map', '一期项目目录-v1.json'), 'utf8'))
  assert.equal(catalog.projects.length, 37)
  assert.equal(catalog.projects.filter((item) => item.geometryStatus === 'unmatched').length, 37)
  const report = await readFile(path.join(outputDir, 'report', '一期楼栋匹配清单.md'), 'utf8')
  assert.match(report, /天枢楼/)
  assert.match(report, /禁止从宣传透视图描绘正式轮廓/)

  const importFile = JSON.parse(await readFile(path.join(outputDir, 'map', '校园地图-一期语义化后台导入版-v2.geojson'), 'utf8'))
  assert.equal(importFile.features.length, 848)
  const reviewFeatures = importFile.features.filter((feature) => feature.properties.visibilityScope === 'phase1_review')
  assert.equal(reviewFeatures.length, 32)
  assert.ok(reviewFeatures.every((feature) => feature.properties.geometryStatus === 'unmatched'))
})
```

- [ ] **Step 2: Run tests and verify missing module/artifacts**

Run: `node --test tools/campus-map-cleaner.test.mjs`

Expected: FAIL because the catalog module and artifacts do not exist.

- [ ] **Step 3: Implement the immutable project arrays and validation**

Create all 37 entries using the exact names and statuses from the approved design. `renderProjectMatchingReport()` renders two tables: 15 phase-one rows requiring geometry assignment, and 22 future reference rows marked non-public.

- [ ] **Step 4: Emit artifacts from `buildCampusMap`**

Write:

```js
await writeJson(path.join(outputDir, 'map', '一期项目目录-v1.json'), {
  schemaVersion: 1,
  projects: [...PHASE1_PROJECTS, ...FUTURE_PROJECTS],
})
await writeFile(
  path.join(outputDir, 'report', '一期楼栋匹配清单.md'),
  renderProjectMatchingReport(),
  'utf8',
)
```

Also write `校园地图-一期语义化后台导入版-v2.geojson` from the existing 848 editable features. Mark the 25 POI candidates (`labels` and `entrances`) and 7 polygon building candidates as:

```js
{
  visibilityScope: 'phase1_review',
  geometryStatus: 'unmatched',
  constructionStatus: 'built',
  searchable: false,
  navigable: false,
}
```

Leave roads, routes, water, landscape, boundaries, and open building linework without project status fields so they remain background geometry. Do not add official numbers or names to any geometry until an operator explicitly assigns it in Task 5.

- [ ] **Step 5: Run tests and rebuild artifacts**

Run: `node --test tools/campus-map-cleaner.test.mjs`

Expected: PASS.

Run: `node tools/build-campus-map-clean-v1.mjs`

Expected: summary remains `editableCount: 848`; the v2 import, catalog, and report files are created.

- [ ] **Step 6: Verify checksums and source immutability**

Run: `shasum -a 256 -c report/checksums.txt`

Expected: all original DWG/DXF and tracked output hashes pass after updating the checksum manifest for the two new artifacts and modified tools.

- [ ] **Step 7: Commit scope note**

The data package is outside Git. Record changed paths and SHA-256 values in the implementation handoff; do not create a repository commit for this task.

---

### Task 5: Admin Assignment, Review Counts, and Semantic Rendering

**Files:**
- Modify: `admin/src/api/admin.ts`
- Create: `admin/src/views/region/components/campus-map/campusProjectModel.mjs`
- Create: `minitest/campus-map-project-semantics.test.cjs`
- Modify: `admin/src/views/region/components/campus-map/CampusMapInspector.vue`
- Modify: `admin/src/views/region/components/campus-map/CampusMapCadWorkbench.vue`
- Modify: `admin/src/views/region/components/campus-map/cadWorkbenchModel.mjs`
- Modify: `admin/src/views/region/components/RegionCampusMapPainter.vue`

**Interfaces:**
- Consumes: `GET /admin/campus-map/project-catalog` and import draft metadata.
- Produces: explicit `assignProject(item, project)` behavior, review counts, serialized feature metadata, semantic OpenLayers styles.
- Consumed by: Task 6 via published GeoJSON properties.

- [ ] **Step 1: Write failing pure-model tests**

```js
const {
  applyCampusProject,
  campusProjectCounts,
  campusProjectStyle,
} = await import('../admin/src/views/region/components/campus-map/campusProjectModel.mjs')

const assigned = applyCampusProject({ id: 'area-1' }, {
  officialNumber: 3,
  officialName: '天枢楼',
  semanticType: 'building',
  constructionStatus: 'built',
})
assert.equal(assigned.title, '天枢楼')
assert.equal(assigned.visibilityScope, 'phase1_active')
assert.equal(assigned.geometryStatus, 'verified_polygon')
assert.equal(assigned.searchable, true)

assert.deepEqual(campusProjectCounts([
  assigned,
  { officialNumber: 4, visibilityScope: 'phase1_review' },
  { officialNumber: 15, visibilityScope: 'future_reference' },
]), { active: 1, review: 1, future: 1, unmatched: 1 })

assert.deepEqual(campusProjectStyle({ semanticType: 'building' }), {
  stroke: '#4F6272',
  fill: 'rgba(79, 98, 114, 0.22)',
})
```

- [ ] **Step 2: Run test and verify missing model**

Run: `node minitest/campus-map-project-semantics.test.cjs`

Expected: FAIL because `campusProjectModel.mjs` does not exist.

- [ ] **Step 3: Implement the pure project model**

`applyCampusProject` copies official metadata, sets `title=officialName`, preserves the previous title as `engineeringAlias`, and derives geometry status from item kind (`area -> verified_polygon`, `poi -> verified_point`). Future projects always stay `future_reference`, `searchable=false`, `navigable=false`; built assigned geometry becomes `phase1_active`, `searchable=true`, while `navigable` stays false until calibration is complete.

`normalizeImportedPoi` and `normalizeImportedArea` mark unassigned CAD-derived items as `visibilityScope=phase1_review`, `geometryStatus=unmatched`, `searchable=false`, and `navigable=false`. Background routes, roads, water, landscape, and boundaries do not receive project status fields.

`campusProjectStyle` returns exact colors: teaching `#0F766E`, dorm `#7C3AED`, canteen `#F97316`, office `#475569`, sports `#16A34A`, library `#2563EB`, gate `#DC2626`, parking `#334155`, building `#4F6272`.

Extend the admin semantic catalog with `research` (`科研楼`, `#0369A1`) and `museum` (`校史馆`, `#92400E`) so future reference entries remain understandable in admin without becoming public.

- [ ] **Step 4: Add the admin API and inspector fields**

Add:

```ts
export function fetchCampusMapProjectCatalog() {
  return request.get('/admin/campus-map/project-catalog')
}
```

`CampusMapInspector.vue` receives `projectCatalog`, displays an official-project select for POIs/areas, and exposes `assignProject`. Below it, show read-only official number/name/status plus editable search/navigation switches. Disable both switches for `under_construction` or `geometryStatus=unmatched`.

- [ ] **Step 5: Preserve and serialize metadata in the painter**

Extend `PoiItem` and `AreaItem` with the project fields from Task 1. Update `normalizeImportedPoi`, `normalizeImportedArea`, `buildPayload`, `standardizeAmapFeature`, and published feature parsing to copy the exact project keys.

Load the catalog once with `fetchCampusMapProjectCatalog()`. Add `handleAssignProject(projectNumber)` that calls `applyCampusProject` on the selected item and refreshes semantic styling. Add project counts to quality checks; duplicate numbers, future-visible items, and unmatched active items are errors.

- [ ] **Step 6: Render semantic polygons and number labels in OpenLayers**

Carry metadata through `cadFeatureRecord`. In `CampusMapCadWorkbench.vue`, set feature properties `officialNumber`, `semanticType`, `constructionStatus`, and `visibilityScope`. Use `campusProjectStyle` for polygon fill/stroke and render `#3 天枢楼` labels for assigned projects. Future reference features use a gray dashed stroke and are hidden by default.

- [ ] **Step 7: Run admin model and existing workbench tests**

Run: `node minitest/campus-map-project-semantics.test.cjs && node minitest/campus-map-openlayers-workbench.test.cjs`

Expected: PASS.

- [ ] **Step 8: Run admin typecheck and build**

Run: `npm --workspace admin run typecheck`

Expected: exit 0.

Run: `npm --workspace admin run build`

Expected: exit 0; chunk-size warnings are non-blocking.

- [ ] **Step 9: Commit**

```bash
git add admin/src/api/admin.ts admin/src/views/region/components/campus-map/campusProjectModel.mjs minitest/campus-map-project-semantics.test.cjs admin/src/views/region/components/campus-map/CampusMapInspector.vue admin/src/views/region/components/campus-map/CampusMapCadWorkbench.vue admin/src/views/region/components/campus-map/cadWorkbenchModel.mjs admin/src/views/region/components/RegionCampusMapPainter.vue
git commit -m "feat: add phase-one campus project assignment"
```

---

### Task 6: Mini-Program Public Filtering, Search, Details, and Visual Styles

**Files:**
- Modify: `/Users/nianbaidediannao/Desktop/前端文件/campusMap/index/index.js`
- Modify: `/Users/nianbaidediannao/Desktop/前端文件/campusMap/index/index.wxml`
- Modify: `/Users/nianbaidediannao/Desktop/前端文件/campusMap/index/index.wxss`
- Modify: `/Users/nianbaidediannao/Desktop/前端文件/minitest/campus-map-page.test.cjs`
- Modify: `/Users/nianbaidediannao/Desktop/前端文件/minitest/campus-map-control.test.cjs`

**Interfaces:**
- Consumes: published feature properties from Tasks 3 and 5.
- Produces: public-only POI index, official-number search, semantic drawing, permission-aware navigation.

- [ ] **Step 1: Add failing public visibility and search tests**

Extend the VM export with `isPublicCampusFeature`, then assert:

```js
const items = [
  { title: '天枢楼', officialNumber: 3, constructionStatus: 'built', visibilityScope: 'phase1_active', geometryStatus: 'verified_polygon', searchable: true, semanticType: 'building' },
  { title: '学生餐厅', officialNumber: 15, constructionStatus: 'under_construction', visibilityScope: 'future_reference', geometryStatus: 'verified_polygon', searchable: false, semanticType: 'canteen' },
]
assert.deepEqual(
  Array.from(sandbox.__filterCampusPois(items, '3', 'all'), (item) => item.title),
  ['天枢楼'],
)
assert.equal(sandbox.__isPublicCampusFeature(items[0]), true)
assert.equal(sandbox.__isPublicCampusFeature(items[1]), false)
```

Add a navigation assertion showing `selectedCanNavigate=false` when an item has `navigable=false`, even when calibration produces coordinates.

- [ ] **Step 2: Run page/control tests and verify failure**

Run: `node --test minitest/campus-map-page.test.cjs minitest/campus-map-control.test.cjs`

Expected: FAIL because official numbers and visibility/navigation flags are ignored.

- [ ] **Step 3: Implement public filtering and metadata parsing**

Add:

```js
function isPublicCampusFeature(item = {}) {
  const managed = Boolean(item.officialNumber || item.visibilityScope || item.constructionStatus);
  if (!managed) return true;
  return item.constructionStatus === 'built'
    && item.visibilityScope === 'phase1_active'
    && item.geometryStatus !== 'unmatched';
}
```

Filter feature collections and the POI index through this helper. `filterCampusPois` must also require `searchable !== false` and include `officialNumber`, `officialName`, and `engineeringAlias` in the keyword haystack.

`buildPoiIndex` copies `officialNumber`, `officialName`, `constructionStatus`, `searchable`, and `navigable`. `selectPoi` sets `selectedCanNavigate=Boolean(item.navigable !== false && selectedLngLat)`.

- [ ] **Step 4: Implement semantic drawing and details**

Extend semantic constants with `research` and `museum`. For polygons, use each feature's semantic color with a 0.22 alpha fill. Draw official labels as `#3 天枢楼` at medium/near zoom and suppress labels at overview scale to avoid overlap.

In WXML, show the number badge only when `selectedOfficialNumber` exists. In WXSS, use a solid high-contrast badge and keep text labels so meaning does not depend on color.

- [ ] **Step 5: Run mini-program tests**

Run: `node --test minitest/campus-map-page.test.cjs minitest/campus-map-geometry.test.cjs minitest/campus-map-control.test.cjs`

Expected: PASS.

- [ ] **Step 6: Run static syntax checks**

Run: `node --check campusMap/index/index.js && node --check common/campusMapGeometry.js`

Expected: exit 0.

- [ ] **Step 7: Commit in the mini-program repository**

```bash
git add campusMap/index/index.js campusMap/index/index.wxml campusMap/index/index.wxss minitest/campus-map-page.test.cjs minitest/campus-map-control.test.cjs
git commit -m "feat: render phase-one campus building semantics"
```

---

### Task 7: End-to-End Verification and Handoff

**Files:**
- Verify only; do not change production data or publish.

**Interfaces:**
- Consumes all previous task outputs.
- Produces evidence separating local tests, browser/admin evidence, DevTools evidence, and remaining deployment/device gates.

- [ ] **Step 1: Run focused backend tests**

Run: `npm --workspace backend test -- --runInBand src/modules/campus-map/campus-map-project-catalog.spec.ts src/modules/campus-map/campus-map-import.service.spec.ts src/modules/campus-map/campus-map.service.spec.ts src/modules/campus-map/campus-map.controller.spec.ts`

Expected: PASS.

- [ ] **Step 2: Run backend build**

Run: `npm --workspace backend run build`

Expected: exit 0.

- [ ] **Step 3: Run admin verification**

Run: `node minitest/campus-map-project-semantics.test.cjs && node minitest/campus-map-openlayers-workbench.test.cjs && npm --workspace admin run typecheck && npm --workspace admin run build`

Expected: exit 0; non-failing bundle size warnings may remain.

- [ ] **Step 4: Run data-package verification**

Run from `/Users/nianbaidediannao/Desktop/校园地图资料/06-校园地图精简版-v1`:

```bash
node --test tools/campus-map-cleaner.test.mjs
shasum -a 256 -c report/checksums.txt
```

Expected: all tests and checksums pass.

- [ ] **Step 5: Run mini-program verification**

Run from `/Users/nianbaidediannao/Desktop/前端文件`:

```bash
node --test minitest/campus-map-page.test.cjs minitest/campus-map-geometry.test.cjs minitest/campus-map-control.test.cjs
node --check campusMap/index/index.js
```

Expected: PASS and exit 0.

- [ ] **Step 6: Perform local admin visual verification**

Open the campus-map workbench against local backend data, import the generated GeoJSON into a disposable/test region, and capture these states without publishing:

1. unassigned CAD objects plus catalog;
2. an assigned `#3 天枢楼` polygon with neutral building fill;
3. future `#15 学生餐厅` shown in gray as backend-only reference;
4. quality check rejecting a future searchable item;
5. preview showing only active built projects.

- [ ] **Step 7: Perform WeChat Developer Tools verification**

Against a disposable locally published test manifest, verify:

1. `#3 天枢楼` appears with number and name;
2. searching `3` and `天枢楼` finds the same building;
3. `#15 学生餐厅` is absent;
4. a non-navigable item does not show an enabled navigation action;
5. semantic colors remain understandable with text labels.

If DevTools or test-region publishing is unavailable, report this as an unverified gate rather than replacing it with unit-test evidence.

- [ ] **Step 8: Review repository boundaries**

Run `git status --short`, `git diff --check`, and `git log --oneline` in both repositories. Confirm backend/admin and mini-program commits are separate and that unrelated dirty files remain untouched.

- [ ] **Step 9: Handoff without production mutation**

Report created artifacts, commit hashes, local test results, admin/DevTools evidence, checksum result, and remaining real-device/deployment gates. Do not publish the production map or migrate production data.
