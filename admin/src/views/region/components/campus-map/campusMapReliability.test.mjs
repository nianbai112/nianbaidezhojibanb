import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
const source = readFileSync(new URL('../RegionCampusMapPainter.vue', import.meta.url), 'utf8');
const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };
const compile = (start, end, context) => vm.runInNewContext(stripTypeScriptTypes(source.slice(source.indexOf(start), source.indexOf(end)), { mode: 'transform' }), context);
function saveRuntime() {
  const pending = deferred(); const state = { region: 'r1', applied: 0, scheduled: 0, sent: [] };
  const context = { draftSavePromise: null, editRevision: { value: 1 }, form: { mapId: 'map' },
    hasUnsavedChanges: { value: true }, workflow: { draftRevision: 1 }, draftSaving: { value: false },
    currentRegionId: () => state.region, buildPayload: () => ({ title: 'snapshot' }),
    saveRegionCampusMapDraft: (...args) => { state.sent.push(args); return pending.promise; },
    applyWorkflow() { state.applied++; }, scheduleDraftSave() { state.scheduled++; },
    shouldShowLocalRequestError: () => false, ElMessage: { success() {}, error() {}, warning() {} } };
  compile('async function saveDraft(', '\nasync function publishMap()', context);
  return { context, state, pending };
}

test('edits made during a save remain dirty and schedule the next save', async () => {
  const { context: c, state, pending } = saveRuntime();
  const saved = c.saveDraft({ silent: true }); c.editRevision.value++;
  pending.resolve({ workflow: { draftRevision: 2 } }); await saved;
  assert.equal(c.hasUnsavedChanges.value, true); assert.equal(state.scheduled, 1);
  assert.equal(state.sent.length, 1);
});

test('concurrent saves of an unchanged draft share one request', async () => {
  const { context: c, state, pending } = saveRuntime();
  const first = c.saveDraft(); const second = c.saveDraft();
  pending.resolve({ workflow: { draftRevision: 2 } }); await Promise.all([first, second]);
  assert.equal(state.sent.length, 1); assert.equal(c.hasUnsavedChanges.value, false);
});

test('a save response cannot overwrite another school workflow', async () => {
  const { context: c, state, pending } = saveRuntime();
  const saved = c.saveDraft(); state.region = 'r2';
  pending.resolve({ workflow: { draftRevision: 2 } }); assert.equal(await saved, null);
  assert.equal(state.applied, 0); assert.equal(c.hasUnsavedChanges.value, true);
});

test('editing one map object preserves all unrelated overlay instances', () => {
  let drawn = 0; const removed = [];
  const c = { amapMap: { remove(value) { removed.push(value); } }, amapSdk: {}, refreshingAmapOverlays: false,
    amapOverlayEntries: new Map(), activeAmapEditorKey: '', closeAmapEditor() {}, amapOverlays: [],
    pois: { value: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }] }, areas: { value: [] },
    visibleAmapRoutes: { value: [] }, calibrationPoints: { value: [] }, draftAreaPoints: { value: [] }, draftRoutePoints: { value: [] },
    drawAmapPoi(item) { drawn++; return { id: item.id, generation: drawn }; } };
  compile('function refreshAmapOverlays()', '\nfunction fitAmapOverlays()', c);
  c.refreshAmapOverlays(); const b = c.amapOverlayEntries.get('poi:b').overlay;
  c.refreshAmapOverlays(); assert.equal(drawn, 2);
  c.pois.value[0].title = 'changed'; c.refreshAmapOverlays();
  assert.equal(drawn, 3); assert.equal(removed.length, 1); assert.equal(c.amapOverlayEntries.get('poi:b').overlay, b);
  c.pois.value.shift(); c.refreshAmapOverlays(); assert.equal(removed.length, 2);
});

test('edits made while publishing remain dirty after the publication response', async () => {
  const pending = deferred(); let submitted = false, scheduled = 0;
  const c = { currentRegionId: () => 'r1', form: { enabled: true }, editorMode: { value: 'amap' },
    saving: { value: false }, hasVisualBaseMap: { value: true }, hasUnsavedChanges: { value: false }, editRevision: { value: 2 },
    workflow: { activeVersion: 1, activeVersionId: 'v1', draftRevision: 2 }, livePublication: { publicPlaceCount: 1 },
    validateBeforePublish: async () => true, saveDraft: async () => ({ workflow: { draftRevision: 2 } }),
    publishRegionCampusMapDraft: () => { submitted = true; return pending.promise; },
    fetchActiveCampusMap: async () => ({}), publishedAvailabilityStatus: { value: 'open' },
    normalizeSchoolAvailability: () => ({ status: 'open' }), applyWorkflow() {}, applyLivePublication() {},
    verifyCampusMapPublication: () => ({ ok: true, live: { activeVersion: 2, publicPlaceCount: 1 } }),
    scheduleDraftSave() { scheduled++; }, shouldShowLocalRequestError: () => false,
    ElMessage: { success() {}, warning() {}, error() {} } };
  compile('async function publishMap()', '\nasync function disableMap()', c);
  const publishing = c.publishMap();
  await new Promise(resolve => setImmediate(resolve)); assert.equal(submitted, true);
  c.editRevision.value++; c.hasUnsavedChanges.value = true;
  pending.resolve({ workflow: { activeVersion: 2 }, availability: { status: 'open' } }); await publishing;
  assert.equal(c.hasUnsavedChanges.value, true); assert.equal(scheduled, 1);
});
