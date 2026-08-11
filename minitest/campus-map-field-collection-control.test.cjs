const test = require('node:test')
const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const path = require('node:path')
const { Prisma } = require('@prisma/client')

const root = path.resolve(__dirname, '..')

function prismaModel(name) {
  return Prisma.dmmf.datamodel.models.find((model) => model.name === name)
}

test('Prisma exposes immutable campus collection source records', () => {
  for (const name of [
    'CampusMapCollectionTask',
    'CampusMapCollectionAssignment',
    'CampusMapMarkerTemplate',
    'CampusMapCollectionSession',
    'CampusMapCollectionPoint',
    'CampusMapCollectionMarker',
    'CampusMapCollectionMarkerBinding',
    'CampusMapCollectionAttachment',
  ]) {
    assert.ok(prismaModel(name), `${name} should be available through Prisma Client`)
  }

  assert.deepEqual(prismaModel('CampusMapCollectionPoint').uniqueIndexes, [
    { name: null, fields: ['sessionId', 'clientPointId'] },
    { name: null, fields: ['sessionId', 'batchNo', 'pointSeq'] },
  ])
  assert.deepEqual(prismaModel('CampusMapCollectionMarker').uniqueIndexes, [
    { name: null, fields: ['sessionId', 'clientMarkerId'] },
  ])
})

test('PostgreSQL and MySQL Prisma schemas stay generated from the main schema', () => {
  const result = spawnSync(
    process.execPath,
    ['backend/scripts/sync-prisma-schema-variants.cjs', '--check'],
    { cwd: root, encoding: 'utf8' },
  )

  assert.equal(result.status, 0, result.stderr || result.stdout)
})

test('admin collection model classifies accuracy and builds an ordered raw polyline', async () => {
  const model = await import('../admin/src/views/region/components/campus-map/campusMapCollectionModel.mjs')

  assert.deepEqual(model.accuracyBand(6), { key: 'good', label: '良好', color: '#16a34a' })
  assert.deepEqual(model.accuracyBand(12), { key: 'review', label: '需复核', color: '#eab308' })
  assert.deepEqual(model.accuracyBand(22), { key: 'poor', label: '较差', color: '#dc2626' })
  assert.deepEqual(model.toRawPolyline([
    { longitude: 106.5, latitude: 29.6 },
    { longitude: 106.5001, latitude: 29.6001 },
  ]), [
    [106.5, 29.6],
    [106.5001, 29.6001],
  ])
  assert.equal(
    model.buildCollectorPath('a code/with+symbols'),
    '/campusMap/collector/index?code=a%20code%2Fwith%2Bsymbols',
  )
  assert.equal(
    model.toSvgPolyline([[106.5, 29.6], [106.6, 29.7]], 200, 100),
    '8,92 192,8',
  )
})
