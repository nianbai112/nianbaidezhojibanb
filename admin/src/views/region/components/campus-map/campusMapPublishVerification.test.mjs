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
