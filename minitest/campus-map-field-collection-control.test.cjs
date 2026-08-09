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
