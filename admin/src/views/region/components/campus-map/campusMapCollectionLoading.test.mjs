import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import vm from 'node:vm'

const source = readFileSync(new URL('./CampusMapCollectionDrawer.vue', import.meta.url), 'utf8')
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
function runtime() {
  const requests = []
  const context = {
    props: { regionId: 'r1' }, scopeRevision: 1, objectRequest: 0,
    objectPage: { value: 3 }, selectedObject: { value: { id: 'old' } },
    reviewDialogVisible: { value: true }, objects: { value: [] }, objectTotal: { value: 0 },
    reviewFilters: { reviewStatus: 'pending', taskId: '', objectType: '' },
    fetchCampusMapCollectionObjects(region, query) { const request = { ...deferred(), region, query }; requests.push(request); return request.promise },
  }
  vm.runInNewContext(stripTypeScriptTypes(source.slice(source.indexOf('async function loadObjects()'), source.indexOf('function selectObject(')), { mode: 'transform' }), context)
  return { context, requests }
}

test('a slow previous filter cannot overwrite the current review list or reopen its selected object', async () => {
  const { context: c, requests } = runtime()
  const first = c.loadObjects()
  c.reviewFilters.reviewStatus = 'approved'
  const second = c.resetObjectPage()
  assert.equal(requests[0].query.page, 3)
  assert.equal(requests[1].query.page, 1)
  assert.equal(requests[1].query.pageSize, 50)
  assert.equal(c.selectedObject.value, null)
  assert.equal(c.reviewDialogVisible.value, false)
  requests[1].resolve({ items: [{ id: 'approved' }], total: 151 }); await second
  requests[0].resolve({ items: [{ id: 'pending' }], total: 2 }); await first
  assert.equal(c.objects.value[0].id, 'approved')
  assert.equal(c.objectTotal.value, 151)
})

test('switching school or closing the drawer invalidates an outstanding review query', async () => {
  const { context: c, requests } = runtime()
  const loading = c.loadObjects()
  c.scopeRevision += 1
  c.props.regionId = 'r2'
  requests[0].resolve({ items: [{ id: 'old-school' }], total: 8 }); await loading
  assert.equal(c.objects.value.length, 0)
  assert.equal(c.objectTotal.value, 0)
})
