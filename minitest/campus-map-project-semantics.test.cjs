const assert = require('node:assert/strict')

async function run() {
  const {
    applyCampusProject,
    campusProjectCounts,
    campusProjectStyle,
    normalizeImportedAreaProject,
    normalizeImportedPoiProject,
  } = await import('../admin/src/views/region/components/campus-map/campusProjectModel.mjs')

  const assigned = applyCampusProject({ id: 'area-1', title: '1号院', points: [{}, {}, {}] }, {
    officialNumber: 3,
    officialName: '天枢楼',
    semanticType: 'building',
    constructionStatus: 'built',
  }, 'area')
  assert.equal(assigned.title, '天枢楼')
  assert.equal(assigned.engineeringAlias, '1号院')
  assert.equal(assigned.visibilityScope, 'phase1_active')
  assert.equal(assigned.geometryStatus, 'verified_polygon')
  assert.equal(assigned.searchable, true)
  assert.equal(assigned.navigable, false)

  const future = applyCampusProject({ id: 'poi-1', title: '候选点' }, {
    officialNumber: 15,
    officialName: '学生餐厅',
    semanticType: 'canteen',
    constructionStatus: 'under_construction',
  }, 'poi')
  assert.equal(future.visibilityScope, 'future_reference')
  assert.equal(future.searchable, false)
  assert.equal(future.navigable, false)

  assert.deepEqual(campusProjectCounts([
    assigned,
    { officialNumber: 4, visibilityScope: 'phase1_review', geometryStatus: 'unmatched' },
    { officialNumber: 15, visibilityScope: 'future_reference' },
  ]), { active: 1, review: 1, future: 1, unmatched: 1 })

  assert.deepEqual(campusProjectStyle({ semanticType: 'building' }), {
    stroke: '#4F6272',
    fill: 'rgba(79, 98, 114, 0.22)',
  })
  assert.equal(campusProjectStyle({ semanticType: 'research' }).stroke, '#0369A1')
  assert.equal(campusProjectStyle({ semanticType: 'museum' }).stroke, '#92400E')

  assert.deepEqual(normalizeImportedPoiProject({ sourceLayer: 'labels' }), {
    visibilityScope: 'phase1_review',
    constructionStatus: 'built',
    geometryStatus: 'unmatched',
    searchable: false,
    navigable: false,
  })
  assert.deepEqual(normalizeImportedAreaProject({ sourceLayer: 'buildings' }), {
    visibilityScope: 'phase1_review',
    constructionStatus: 'built',
    geometryStatus: 'unmatched',
    searchable: false,
    navigable: false,
  })
  assert.deepEqual(normalizeImportedAreaProject({ sourceLayer: 'landscape' }), {})
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
