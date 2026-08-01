const assert = require('node:assert/strict')

async function run() {
  const {
    cadFeatureRecords,
    cadLayerRows,
    campusMapWorkflowSteps,
    isCadLayerVisible,
  } = await import('../admin/src/views/region/components/campus-map/cadWorkbenchModel.mjs')

  const records = cadFeatureRecords({
    pois: [{ id: 'poi-1', title: '图书馆', sourceLayer: '文字标注', xRatio: 0.2, yRatio: 0.3 }],
    areas: [{ id: 'area-1', title: '天枢楼', sourceLayer: '建筑', officialNumber: 3, officialName: '天枢楼', visibilityScope: 'phase1_active', semanticType: 'building', points: [{ xRatio: 0.1, yRatio: 0.1 }, { xRatio: 0.4, yRatio: 0.1 }, { xRatio: 0.4, yRatio: 0.4 }] }],
    routes: [{ id: 'route-1', title: '主路', sourceLayer: '建筑', points: [{ xRatio: 0.1, yRatio: 0.5 }, { xRatio: 0.8, yRatio: 0.5 }] }],
  })

  assert.deepEqual(records.map((item) => `${item.kind}:${item.id}`), ['area:area-1', 'route:route-1', 'poi:poi-1'])
  assert.equal(records[0].officialNumber, 3)
  assert.equal(records[0].visibilityScope, 'phase1_active')

  const layers = cadLayerRows(records)
  assert.equal(layers[0].name, '建筑')
  assert.equal(layers[0].count, 2)
  assert.equal(layers[0].areaCount, 1)
  assert.equal(layers[0].routeCount, 1)
  assert.equal(layers[1].name, '文字标注')
  assert.equal(layers[1].poiCount, 1)

  assert.equal(isCadLayerVisible('建筑', new Set()), true)
  assert.equal(isCadLayerVisible('建筑', new Set(['建筑'])), false)

  const emptySteps = campusMapWorkflowSteps({
    editorMode: 'image',
    hasVisualBaseMap: false,
    hasVectorBaseMap: false,
    featureCount: 0,
    calibrationPointCount: 0,
    canPublish: false,
  })
  assert.deepEqual(emptySteps.map((item) => item.key), ['cad', 'draw', 'amap', 'preview'])
  assert.equal(emptySteps[0].status, 'current')
  assert.equal(emptySteps[1].disabled, true)

  const cadSteps = campusMapWorkflowSteps({
    editorMode: 'image',
    hasVisualBaseMap: true,
    hasVectorBaseMap: true,
    featureCount: 3,
    calibrationPointCount: 0,
    canPublish: false,
  })
  assert.equal(cadSteps[0].status, 'done')
  assert.equal(cadSteps[1].status, 'current')
  assert.equal(cadSteps[2].disabled, false)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
