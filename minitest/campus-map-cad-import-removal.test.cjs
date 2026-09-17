const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('CAD import endpoints and startup provider are removed', () => {
  const controller = read('backend/src/modules/campus-map/campus-map.controller.ts');
  const module = read('backend/src/modules/campus-map/campus-map.module.ts');
  assert.doesNotMatch(controller, /CampusMapImportService|\/imports|campus-map\/converter/);
  assert.doesNotMatch(module, /CampusMapImportService/);
  for (const route of ['campus-map/active', 'campus-map/site', 'admin/campus-map/:regionId/draft', 'admin/campus-map/:regionId/publish']) {
    assert.ok(controller.includes(route), `retained route: ${route}`);
  }
  assert.match(module, /CampusMapCollectionService/);
});

test('CAD menu, upload client, polling and drawer are removed', () => {
  const painter = read('admin/src/views/region/components/RegionCampusMapPainter.vue');
  const actions = read('admin/src/views/region/components/campus-map/CampusMapActionBar.vue');
  const api = read('admin/src/api/admin.ts');
  assert.doesNotMatch(painter, /CampusMapImportDrawer|ImportJob|importPollingTimer|openImportDrawer|导入 CAD/);
  assert.doesNotMatch(actions, /command="import"|导入 CAD/);
  assert.doesNotMatch(api, /RegionCampusMapImport|CampusMapConverter/);
  assert.match(painter, /<CampusMapCadWorkbench/);
  assert.match(painter, /@show-artwork="handleEditorModeChange\('image'\)"/);
  assert.match(painter, /<CampusMapCollectionDrawer/);
  assert.match(painter, /<CampusMapVersionDrawer/);
});

test('artwork step still switches view instead of opening import', () => {
  const rail = read('admin/src/views/region/components/campus-map/CampusMapToolRail.vue');
  assert.match(rail, /if \(key === 'cad'\) emit\('showArtwork'\)/);
  assert.doesNotMatch(rail, /importCad/);
});

test('retired import-only source is removed without deleting artwork', () => {
  for (const file of [
    'backend/src/modules/campus-map/campus-map-import.service.ts',
    'admin/src/views/region/components/campus-map/CampusMapImportDrawer.vue',
  ]) assert.equal(fs.existsSync(path.join(root, file)), false, file);
  assert.ok(fs.existsSync(path.join(root, 'admin/public/assets/cqcx-campus-map.svg')));
  assert.ok(fs.existsSync(path.join(root, 'admin/src/views/region/components/campus-map/CampusMapCadWorkbench.vue')));
});
