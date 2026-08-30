import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCampusReleaseCockpit } from './campusMapReleaseModel.mjs'

const readyPlace = {
  id: 'place-3',
  placeId: 'place-3',
  officialNumber: 3,
  officialName: '天枢楼',
  artworkFeatureKey: 'area-3',
  artworkAnchorX: 120,
  artworkAnchorY: 220,
  coordinateStatus: 'verified',
  publishStatus: 'published',
  visibilityScope: 'phase1_active',
  serviceStatus: 'open',
  searchable: true,
}

test('binding blockers outrank later release blockers', () => {
  const result = buildCampusReleaseCockpit({
    places: [{ id: 'place-4', officialName: '天启楼', coordinateStatus: 'pending' }],
    features: [{ id: 'area-4', title: '天启楼' }],
    routes: [],
    qualityChecks: [],
    activeVersion: 0,
    publishedPlaceCount: 0,
    publicationVerified: false,
    hasUnsavedChanges: true,
  })

  assert.equal(result.stages.length, 5)
  assert.deepEqual(result.stages.map((stage) => stage.key), [
    'binding',
    'verification',
    'candidate',
    'version',
    'online',
  ])
  assert.equal(result.issues[0].stage, 'binding')
  assert.equal(result.issues[0].action, 'catalog')
  assert.equal(result.nextAction.action, 'catalog')
})

test('fully published data completes all five stages', () => {
  const result = buildCampusReleaseCockpit({
    places: [readyPlace],
    features: [{ id: 'area-3', placeId: 'place-3' }],
    routes: [],
    qualityChecks: [],
    activeVersion: 7,
    publishedPlaceCount: 1,
    publicationVerified: true,
    hasUnsavedChanges: false,
  })

  assert.deepEqual(result.stages.map((stage) => stage.status), ['pass', 'pass', 'pass', 'pass', 'pass'])
  assert.equal(result.issues.length, 0)
  assert.equal(result.nextAction.action, 'quality')
})

test('a generated version is not online until the public response is verified', () => {
  const result = buildCampusReleaseCockpit({
    places: [readyPlace],
    features: [{ id: 'area-3', placeId: 'place-3' }],
    routes: [],
    qualityChecks: [],
    activeVersion: 7,
    publishedPlaceCount: 0,
    publicationVerified: false,
    hasUnsavedChanges: false,
  })

  assert.equal(result.stages.at(-1).status, 'error')
  assert.equal(result.issues.at(-1).key, 'online-not-verified')
  assert.equal(result.issues.at(-1).action, 'quality')
})

test('future buildings and missing field evidence stay ahead of draft publication issues', () => {
  const future = {
    ...readyPlace,
    id: 'place-15',
    placeId: 'place-15',
    officialNumber: 15,
    officialName: '学生餐厅',
    constructionStatus: 'under_construction',
    visibilityScope: 'phase1_active',
    coordinateStatus: 'pending',
  }
  const result = buildCampusReleaseCockpit({
    places: [future],
    features: [{ id: 'area-15', placeId: 'place-15' }],
    routes: [],
    qualityChecks: [],
    activeVersion: 2,
    publishedPlaceCount: 1,
    publicationVerified: true,
    hasUnsavedChanges: true,
  })

  assert.deepEqual(result.issues.slice(0, 3).map((issue) => issue.key), [
    'future-visible:place-15',
    'verification:place-15',
    'draft-unpublished',
  ])
})

test('a valid future reference does not block the phase-one release stages', () => {
  const futureReference = {
    ...readyPlace,
    id: 'place-15',
    placeId: 'place-15',
    officialNumber: 15,
    officialName: '学生餐厅',
    artworkFeatureKey: 'area-15',
    phase: 'future',
    constructionStatus: 'under_construction',
    visibilityScope: 'future_reference',
    coordinateStatus: 'pending',
    publishStatus: 'draft',
    searchable: false,
    navigable: false,
  }
  const result = buildCampusReleaseCockpit({
    places: [readyPlace, futureReference],
    features: [
      { id: 'area-3', placeId: 'place-3' },
      { id: 'area-15', placeId: 'place-15' },
    ],
    routes: [],
    qualityChecks: [],
    activeVersion: 7,
    publishedPlaceCount: 1,
    publicationVerified: true,
    hasUnsavedChanges: false,
  })

  assert.deepEqual(result.stages.map((stage) => stage.status), ['pass', 'pass', 'pass', 'pass', 'pass'])
  assert.equal(result.stages.find((stage) => stage.key === 'binding').total, 2)
  assert.equal(result.stages.find((stage) => stage.key === 'candidate').total, 1)
  assert.equal(result.issues.length, 0)
})

test('an unopened published place must explain its state', () => {
  const result = buildCampusReleaseCockpit({
    places: [{ ...readyPlace, serviceStatus: 'unopened', unavailableMessage: '' }],
    features: [{ id: 'area-3', placeId: 'place-3' }],
    routes: [],
    qualityChecks: [],
    activeVersion: 0,
    publishedPlaceCount: 0,
    publicationVerified: false,
    hasUnsavedChanges: false,
  })

  const issue = result.issues.find((item) => item.key === 'availability:place-3')
  assert.ok(issue)
  assert.equal(issue.action, 'catalog')
  assert.equal(result.stages.find((stage) => stage.key === 'candidate').status, 'error')
})

test('null artwork coordinates never count as a vector binding', () => {
  const result = buildCampusReleaseCockpit({
    places: [{
      id: 'place-9',
      officialNumber: 9,
      officialName: '龙韬楼',
      artworkAnchorX: null,
      artworkAnchorY: null,
      coordinateStatus: 'verified',
    }],
    features: [],
    routes: [],
    qualityChecks: [],
    activeVersion: 0,
    publishedPlaceCount: 0,
    publicationVerified: false,
    hasUnsavedChanges: false,
  })

  assert.equal(result.stages[0].completed, 0)
  assert.equal(result.issues[0].key, 'binding:place-9')
})
