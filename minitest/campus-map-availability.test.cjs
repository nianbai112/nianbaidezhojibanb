const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

async function run() {
  const model = await import('../admin/src/views/region/components/campus-map/campusAvailabilityModel.mjs')

  assert.deepEqual(model.normalizeSchoolAvailability(), {
    status: 'open',
    unavailableMessage: '',
  })
  assert.deepEqual(model.normalizeBuildingAvailability({
    serviceStatus: 'unopened',
    unavailableMessage: ' 施工中 ',
    navigable: true,
  }), {
    serviceStatus: 'unopened',
    unavailableMessage: '施工中',
    searchable: true,
    navigable: false,
  })

  const merged = model.mergeRegionCampusMapStatuses(
    [{ id: 'a' }, { id: 'b' }],
    [{ regionId: 'a', publishedStatus: 'unopened' }],
  )
  assert.equal(merged[0].campusMapStatus, 'unopened')
  assert.equal(merged[1].campusMapStatus, 'unconfigured')
  assert.equal(model.filterRegionsByCampusMapStatus(merged, 'unopened').length, 1)
  assert.equal(model.filterRegionsByCampusMapStatus(merged, 'all').length, 2)

  const apiSource = fs.readFileSync(path.join(
    __dirname,
    '../admin/src/api/admin.ts',
  ), 'utf8')
  const statusesRouteIndex = apiSource.indexOf('/admin/campus-map/statuses')
  const regionRouteIndex = apiSource.indexOf('/admin/campus-map/${regionId}')
  assert.ok(statusesRouteIndex >= 0, '缺少校园地图状态 API')
  assert.ok(statusesRouteIndex < regionRouteIndex, '静态状态路由必须位于动态学校路由之前')
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
