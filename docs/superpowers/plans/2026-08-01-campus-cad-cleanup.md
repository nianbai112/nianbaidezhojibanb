# Campus CAD Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate a non-destructive, auditable campus-map v1 package with a cleaned DXF, role-based GeoJSON layers, visual preview, cleanup report, and checksums while keeping editable objects under the approved performance budget.

**Architecture:** A small Node.js data tool reads the already normalized candidate GeoJSON layers, applies source-layer and entity-class allowlists, removes block-reference noise and spatial outliers, simplifies and deduplicates geometry, and writes deterministic role-based layers. A CLI then merges the cleaned layers for GDAL DXF export and produces the manifest, SVG/PNG preview, reports, and input/output checksums. The original DWG/DXF files and the current backend/admin/database remain read-only.

**Tech Stack:** Node.js 22 built-ins (`node:fs`, `node:path`, `node:crypto`, `node:test`), GDAL 3.13.1 (`ogr2ogr`, `ogrinfo`), macOS Quick Look (`qlmanage`) for SVG-to-PNG rendering.

## Global Constraints

- During data-tool execution, only create implementation artifacts below `/Users/nianbaidediannao/Desktop/校园地图资料/06-校园地图精简版-v1/`; this checked-in plan is the only repository file for the cleanup batch.
- Do not modify or delete any original DWG/DXF, backend/admin source, database record, current map draft, or published mini-program map.
- Use `ZT07~09 总平面图0804 改景观渠` as the primary semantic source, the 2025-11-21 combined plan as a reference source, and the 2025-07-13 survey as the spatial-control source.
- Subtract exactly `36_000_000` from total-plan X coordinates greater than `10_000_000`; do not offset the survey coordinates.
- Keep first-load objects at or below `1,200`, route skeleton objects at or below `120`, core POIs/entrances at or below `200`, and all editable objects at or below `1,500`.
- Do not silently delete a required layer to meet a budget; fail the verification and report the overage.
- Do not initialize a Git repository in the artifact directory. The repository commit covers only this plan; output integrity is tracked by SHA-256 checksums.

---

## File Structure

- Create `/Users/nianbaidediannao/Desktop/校园地图资料/06-校园地图精简版-v1/tools/campus-map-cleaner.mjs`: pure geometry, filtering, simplification, deduplication, manifest, SVG, and report functions.
- Create `/Users/nianbaidediannao/Desktop/校园地图资料/06-校园地图精简版-v1/tools/campus-map-cleaner.test.mjs`: unit and real-data integration checks.
- Create `/Users/nianbaidediannao/Desktop/校园地图资料/06-校园地图精简版-v1/tools/build-campus-map-clean-v1.mjs`: CLI orchestration and deterministic artifact writing.
- Create `/Users/nianbaidediannao/Desktop/校园地图资料/06-校园地图精简版-v1/map/layers/*.geojson`: cleaned business-role layers.
- Create `/Users/nianbaidediannao/Desktop/校园地图资料/06-校园地图精简版-v1/map/campus-map-clean-v1.geojson`: merged semantic GeoJSON used for DXF export.
- Create `/Users/nianbaidediannao/Desktop/校园地图资料/06-校园地图精简版-v1/map/manifest.json`: coordinate, bounds, layer, load strategy, and count metadata.
- Create `/Users/nianbaidediannao/Desktop/校园地图资料/06-校园地图精简版-v1/cad/校园地图-精简版-v1.dxf`: merged exchange-format CAD output.
- Create `/Users/nianbaidediannao/Desktop/校园地图资料/06-校园地图精简版-v1/preview/校园地图-精简版-v1.svg` and `.png`: visual acceptance artifacts.
- Create `/Users/nianbaidediannao/Desktop/校园地图资料/06-校园地图精简版-v1/report/清理结果.md`: before/after counts and removal reasons.
- Create `/Users/nianbaidediannao/Desktop/校园地图资料/06-校园地图精简版-v1/report/待人工确认.md`: unresolved labels and reference-only objects.
- Create `/Users/nianbaidediannao/Desktop/校园地图资料/06-校园地图精简版-v1/report/checksums.txt`: SHA-256 evidence for original inputs and outputs.

### Task 1: Pure cleanup engine and failing tests

**Files:**
- Create: `/Users/nianbaidediannao/Desktop/校园地图资料/06-校园地图精简版-v1/tools/campus-map-cleaner.mjs`
- Create: `/Users/nianbaidediannao/Desktop/校园地图资料/06-校园地图精简版-v1/tools/campus-map-cleaner.test.mjs`

**Interfaces:**
- Produces: `normalizeGeneralPlanCoordinate(coord: number[]): number[]`
- Produces: `cleanCadText(value: unknown): string`
- Produces: `isUsefulCampusLabel(value: unknown): boolean`
- Produces: `explodeGeometry(geometry: GeoJSONGeometry): GeoJSONGeometry[]`
- Produces: `simplifyLine(points: number[][], tolerance: number): number[][]`
- Produces: `cleanLayer(spec: LayerSpec, collection: FeatureCollection): CleanLayerResult`
- Produces: `validateBudgets(results: CleanLayerResult[]): BudgetSummary`

- [ ] **Step 1: Create the artifact directories without touching existing source data**

Run:

```bash
mkdir -p "/Users/nianbaidediannao/Desktop/校园地图资料/06-校园地图精简版-v1"/{tools,map/layers,cad,preview,report}
```

Expected: only the new `06-校园地图精简版-v1` directory tree exists; the original DWG/DXF paths are unchanged.

- [ ] **Step 2: Write focused failing tests**

Create tests using `node:test` and `node:assert/strict` with these exact assertions:

```js
test('normalizes only total-plan X band coordinates', () => {
  assert.deepEqual(normalizeGeneralPlanCoordinate([36571665.439, 3429397.447]), [571665.439, 3429397.447])
  assert.deepEqual(normalizeGeneralPlanCoordinate([571665.439, 3429397.447]), [571665.439, 3429397.447])
})

test('rejects CAD annotations that are not campus POIs', () => {
  for (const value of ['H=22M', '4F', '487.24', '设计说明', '图签']) {
    assert.equal(isUsefulCampusLabel(value), false)
  }
  for (const value of ['图书馆', '5号院', '北校门', '学生食堂']) {
    assert.equal(isUsefulCampusLabel(value), true)
  }
})

test('drops route block references and keeps AcDbPolyline centerlines', () => {
  const input = featureCollection([
    lineFeature('AcDbEntity:AcDbBlockReference', [[571200, 3428500], [571300, 3428600]]),
    lineFeature('AcDbEntity:AcDbPolyline', [[571200, 3428500], [571300, 3428600]]),
  ])
  const result = cleanLayer(routeSpec, input)
  assert.equal(result.features.length, 1)
  assert.match(result.features[0].properties.SubClasses, /AcDbPolyline/)
})

test('removes zero-area and outside-campus geometry', () => {
  const result = cleanLayer(buildingSpec, featureCollection([
    lineFeature('AcDbEntity:AcDbPolyline', [[571700, 3429400], [571800, 3429400], [571800, 3429500], [571700, 3429400]]),
    lineFeature('AcDbEntity:AcDbPolyline', [[0, 0], [10, 0], [10, 10], [0, 0]]),
  ]))
  assert.equal(result.features.length, 1)
})

test('keeps line endpoints while simplifying dense vertices', () => {
  const result = simplifyLine([[0, 0], [1, 0.01], [2, -0.01], [3, 0]], 0.05)
  assert.deepEqual(result, [[0, 0], [3, 0]])
})
```

- [ ] **Step 3: Run the tests and verify the intended failure**

Run:

```bash
node --test "/Users/nianbaidediannao/Desktop/校园地图资料/06-校园地图精简版-v1/tools/campus-map-cleaner.test.mjs"
```

Expected: FAIL because `campus-map-cleaner.mjs` does not yet export the required functions.

- [ ] **Step 4: Implement the minimum pure cleanup engine**

Use these fixed spatial constants and layer rules:

```js
export const X_BAND_OFFSET = 36_000_000
export const MAIN_CAMPUS_BBOX = [571_000, 3_428_300, 572_600, 3_429_900]

export const LAYER_SPECS = [
  { id: 'boundary', source: 'zt0804_boundary.geojson', load: 'initial', allowedTypes: ['LineString', 'MultiLineString'], minSpan: 100 },
  { id: 'landscape', source: 'zt0804_landscape.geojson', load: 'initial', allowedTypes: ['LineString', 'MultiLineString'], tolerance: 0.8 },
  { id: 'water', source: 'zt0804_water.geojson', load: 'initial', allowedTypes: ['LineString', 'MultiLineString'], tolerance: 0.4 },
  { id: 'roads_edge', source: 'zt0804_roads_edge.geojson', load: 'initial', allowedTypes: ['LineString', 'MultiLineString'], tolerance: 0.5 },
  { id: 'buildings', source: 'zt0804_building_outline.geojson', load: 'initial', allowedSubClasses: ['AcDbPolyline'], polygonizeClosed: true, tolerance: 0.2 },
  { id: 'routes', source: 'zt0804_roads_centerline.geojson', load: 'route', allowedSubClasses: ['AcDbPolyline'], tolerance: 0.8 },
  { id: 'labels', source: 'zt0804_building_labels.geojson', load: 'poi', allowedTypes: ['Point'], usefulTextOnly: true },
  { id: 'entrances', source: 'zt0804_entrances.geojson', load: 'poi', centroidFromGeometryCollection: true },
  { id: 'fire_access_reference', source: 'zt20251121_fire_access.geojson', load: 'reference', allowedTypes: ['LineString', 'MultiLineString', 'Polygon'], tolerance: 0.8 },
]
```

Filtering order must be deterministic:

```js
export function cleanLayer(spec, collection) {
  const exploded = collection.features.flatMap((feature) => explodeFeature(feature))
  const allowed = exploded.filter((feature) => matchesEntityRule(spec, feature))
  const spatial = allowed.filter((feature) => featureInsideCampus(feature, MAIN_CAMPUS_BBOX, 0.6))
  const shaped = spatial.map((feature) => normalizeAndSimplify(spec, feature)).filter(Boolean)
  const deduped = dedupeFeatures(shaped)
  return summarizeLayer(spec, collection.features.length, deduped)
}
```

Use Ramer-Douglas-Peucker simplification, preserve line endpoints and closed rings, quantize deduplication keys to `0.05` meter, and preserve only `Layer`, `Text`, `SubClasses`, and `EntityHandle` properties plus the generated `role` and `load` fields.

- [ ] **Step 5: Run unit tests and verify they pass**

Run:

```bash
node --test "/Users/nianbaidediannao/Desktop/校园地图资料/06-校园地图精简版-v1/tools/campus-map-cleaner.test.mjs"
```

Expected: all cleanup-engine tests PASS.

### Task 2: Deterministic artifact builder and real-data integration test

**Files:**
- Create: `/Users/nianbaidediannao/Desktop/校园地图资料/06-校园地图精简版-v1/tools/build-campus-map-clean-v1.mjs`
- Modify: `/Users/nianbaidediannao/Desktop/校园地图资料/06-校园地图精简版-v1/tools/campus-map-cleaner.test.mjs`

**Interfaces:**
- Consumes: all Task 1 exports and `LAYER_SPECS`.
- Produces: `buildCampusMap({ sourceDir, outputDir }): Promise<BuildSummary>`.
- Produces: deterministic GeoJSON layers, manifest, merged GeoJSON, SVG preview, Markdown reports, and checksum inputs used by Task 3.

- [ ] **Step 1: Add a failing real-data integration test**

The test must call `buildCampusMap()` in a temporary directory and assert:

```js
assert.ok(summary.layers.find((layer) => layer.id === 'buildings').featureCount > 0)
assert.ok(summary.layers.find((layer) => layer.id === 'routes').featureCount > 0)
assert.ok(summary.layers.find((layer) => layer.id === 'entrances').featureCount > 0)
assert.ok(summary.firstLoadCount <= 1200)
assert.ok(summary.routeCount <= 120)
assert.ok(summary.poiCount <= 200)
assert.ok(summary.editableCount <= 1500)
assert.ok(summary.bbox[0] >= 571000 && summary.bbox[2] <= 572600)
assert.ok(summary.bbox[1] >= 3428300 && summary.bbox[3] <= 3429900)
```

- [ ] **Step 2: Run the integration test and verify it fails**

Run:

```bash
node --test --test-name-pattern='real campus data' "/Users/nianbaidediannao/Desktop/校园地图资料/06-校园地图精简版-v1/tools/campus-map-cleaner.test.mjs"
```

Expected: FAIL because `buildCampusMap()` has not been implemented.

- [ ] **Step 3: Implement deterministic build orchestration**

Read sources only from:

```js
const sourceDir = '/Users/nianbaidediannao/Desktop/校园地图资料/05-小程序地图数据/normalized-layers'
const outputDir = '/Users/nianbaidediannao/Desktop/校园地图资料/06-校园地图精简版-v1'
```

For each layer spec, write a stable `FeatureCollection` sorted by `EntityHandle`, then geometry type, then serialized coordinates. Create a manifest with:

```js
{
  id: 'campus-map-clean-v1',
  coordinateSystem: { id: 'survey-projected-meter', unit: 'meter', xBandOffset: 36000000 },
  bbox,
  performanceBudget: { firstLoad: 1200, routes: 120, pois: 200, editable: 1500 },
  counts: { firstLoad, routes, pois, editable, reference },
  layers: layerSummaries,
}
```

The merged GeoJSON must set `properties.Layer` to the business layer ID so GDAL preserves semantic layer names in the DXF export.

- [ ] **Step 4: Generate the SVG and reports from the same cleaned layer objects**

The SVG renderer must use the actual cleaned bbox, draw only initial/route/poi layers, and use these fixed styles:

```js
const styles = {
  boundary: { stroke: '#111827', fill: 'none', width: 3 },
  landscape: { stroke: '#16a34a', fill: '#dcfce7', width: 1 },
  water: { stroke: '#0284c7', fill: '#bae6fd', width: 1.5 },
  roads_edge: { stroke: '#64748b', fill: 'none', width: 1 },
  buildings: { stroke: '#334155', fill: '#cbd5e1', width: 1.5 },
  routes: { stroke: '#f97316', fill: 'none', width: 2 },
  entrances: { stroke: '#dc2626', fill: '#ef4444', width: 1.5 },
  labels: { stroke: '#0f172a', fill: '#0f172a', width: 1 },
}
```

`清理结果.md` must include source count, retained count, removed count, coordinate count before/after, load strategy, and the applied rule for every layer. `待人工确认.md` must list rejected-but-useful-looking labels and reference-only fire/access items; it must explicitly say that these were not published or applied to the current draft.

- [ ] **Step 5: Run all tests and verify they pass**

Run:

```bash
node --test "/Users/nianbaidediannao/Desktop/校园地图资料/06-校园地图精简版-v1/tools/campus-map-cleaner.test.mjs"
```

Expected: unit and real-data integration tests PASS, including all four object budgets and bbox limits.

### Task 3: Build DXF/PNG, validate outputs, and preserve source evidence

**Files:**
- Create all final artifacts listed in File Structure.
- Modify the builder only if verification reveals a single confirmed transformation defect.

**Interfaces:**
- Consumes: Task 2 CLI and generated merged GeoJSON.
- Produces: final cleaned DXF, PNG preview, checksum evidence, and a completed validation report.

- [ ] **Step 1: Record original input metadata before building**

Run `stat` and `shasum -a 256` for the three original DWG files and the three ODA DXF files. Store the results in a temporary shell variable and compare them after the build; do not write inside the original directories.

- [ ] **Step 2: Run the clean build**

Run:

```bash
node "/Users/nianbaidediannao/Desktop/校园地图资料/06-校园地图精简版-v1/tools/build-campus-map-clean-v1.mjs"
```

Expected: exit 0 and a JSON summary showing all budgets at or below their limits.

- [ ] **Step 3: Export the merged cleaned data to DXF**

Run:

```bash
ogr2ogr -overwrite -f DXF \
  "/Users/nianbaidediannao/Desktop/校园地图资料/06-校园地图精简版-v1/cad/校园地图-精简版-v1.dxf" \
  "/Users/nianbaidediannao/Desktop/校园地图资料/06-校园地图精简版-v1/map/campus-map-clean-v1.geojson" \
  -nln entities
```

Expected: exit 0 and a readable DXF. Run `ogrinfo -so` on the output and record its feature count and extent in `清理结果.md`.

- [ ] **Step 4: Render the SVG preview to PNG**

Run in an empty temporary directory so Quick Look cannot overwrite unrelated files:

```bash
preview_tmp="$(mktemp -d /tmp/campus-map-preview.XXXXXX)"
qlmanage -t -s 2200 -o "$preview_tmp" "/Users/nianbaidediannao/Desktop/校园地图资料/06-校园地图精简版-v1/preview/校园地图-精简版-v1.svg"
mv "$preview_tmp/校园地图-精简版-v1.svg.png" "/Users/nianbaidediannao/Desktop/校园地图资料/06-校园地图精简版-v1/preview/校园地图-精简版-v1.png"
rmdir "$preview_tmp"
```

Expected: a non-empty PNG that can be opened by the image viewer.

- [ ] **Step 5: Verify source immutability and output integrity**

Re-run the original `stat` and SHA-256 commands and assert byte-for-byte equality with Step 1. Then write `report/checksums.txt` containing the unchanged original-input hashes followed by hashes for every final GeoJSON, manifest, DXF, SVG, PNG, and Markdown report.

- [ ] **Step 6: Run final machine checks**

Run:

```bash
node --test "/Users/nianbaidediannao/Desktop/校园地图资料/06-校园地图精简版-v1/tools/campus-map-cleaner.test.mjs"
jq -e '.counts.firstLoad <= 1200 and .counts.routes <= 120 and .counts.pois <= 200 and .counts.editable <= 1500' "/Users/nianbaidediannao/Desktop/校园地图资料/06-校园地图精简版-v1/map/manifest.json"
ogrinfo -ro -so "/Users/nianbaidediannao/Desktop/校园地图资料/06-校园地图精简版-v1/cad/校园地图-精简版-v1.dxf" entities
```

Expected: tests PASS, `jq` returns true, and GDAL reports a finite campus-scale extent.

- [ ] **Step 7: Perform visual QA**

Open the PNG and verify: campus boundary visible; buildings non-empty; roads connected enough to recognize the campus; entrances visible; no title block, dense elevation labels, equipment symbols, stair/balcony details, or off-campus clusters; route skeleton does not dominate the map.

- [ ] **Step 8: Hand off without applying or publishing**

Report links to the cleaned DXF, preview PNG, manifest, cleanup report, and manual-review list. Explicitly state that backend/admin/database/current draft/published mini-program state were not changed.
