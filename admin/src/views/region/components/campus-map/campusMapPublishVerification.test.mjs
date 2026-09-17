import test from 'node:test'
import assert from 'node:assert/strict'
import {
  campusMapPublicationSnapshot,
  verifyCampusMapPublication,
} from './campusMapPublishVerification.mjs'

test('publication snapshot reads the immutable live version and public place count', () => {
  assert.deepEqual(campusMapPublicationSnapshot({
    enabled: true,
    regionId: 'region-1',
    publicPlaces: [{ id: 'p1' }, { id: 'p2' }],
    workflow: { activeVersion: 3, activeVersionId: 'version-3' },
  }), {
    enabled: true,
    regionId: 'region-1',
    activeVersion: 3,
    activeVersionId: 'version-3',
    publicPlaceCount: 2,
  })
})

test('publication verification only succeeds after the public endpoint exposes the new version', () => {
  const verification = verifyCampusMapPublication(
    { workflow: { activeVersion: 2 } },
    { enabled: true, publicPlaces: [{ id: 'p1' }], workflow: { activeVersion: 3, activeVersionId: 'v3' } },
    { enabled: true, publicPlaces: [{ id: 'p1' }], workflow: { activeVersion: 3, activeVersionId: 'v3' } },
  )
  assert.equal(verification.ok, true)
  assert.deepEqual(verification.issues, [])
})

test('publication verification rejects false success with no public places', () => {
  const verification = verifyCampusMapPublication(
    { workflow: { activeVersion: 2 } },
    { enabled: true, publicPlaces: [], workflow: { activeVersion: 3, activeVersionId: 'v3' } },
    { enabled: true, publicPlaces: [], workflow: { activeVersion: 3, activeVersionId: 'v3' } },
  )
  assert.equal(verification.ok, false)
  assert.match(verification.issues.join('；'), /没有正式公开地点/)
})

test('publication verification rejects a stale public response', () => {
  const verification = verifyCampusMapPublication(
    { workflow: { activeVersion: 2 } },
    { enabled: true, publicPlaces: [{ id: 'p1' }], workflow: { activeVersion: 3, activeVersionId: 'v3' } },
    { enabled: true, publicPlaces: [{ id: 'p1' }], workflow: { activeVersion: 2, activeVersionId: 'v2' } },
  )
  assert.equal(verification.ok, false)
  assert.match(verification.issues.join('；'), /版本/)
})

test('publication rejects a matching version whose entrance policy disabled navigation', () => {
  const live = { enabled: true, publicPlaces: [{ id: 'p1', navigable: false }], navigation: null,
    navigationUnavailableReason: 'entrance_republish_required',
    workflow: { activeVersion: 17, activeVersionId: 'v17' } }
  assert.equal(verifyCampusMapPublication({ workflow: { activeVersion: 16 } }, live, live).ok, false)
})

test('publication checks expected navigable entrances against the live graph', () => {
  const published = { enabled: true, publicPlaces: [{ id: 'p1', title: '南校门', navigable: true, entranceNodeIds: ['entry'] }],
    workflow: { activeVersion: 18, activeVersionId: 'v18' },
    navigation: { graph: { nodes: { entry: {}, road: {} }, edges: [{ a: 'entry', b: 'road', public: true }] } } }
  const before = { workflow: { activeVersion: 17 } }
  assert.equal(verifyCampusMapPublication(before, published, published).ok, true)
  assert.equal(verifyCampusMapPublication(before, published, { ...published, navigation: null }).ok, false)
  assert.equal(verifyCampusMapPublication(before, published, { ...published,
    publicPlaces: [{ ...published.publicPlaces[0], navigable: false }] }).ok, false)
})
