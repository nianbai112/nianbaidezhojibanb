import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  buildPlaceTargetOptions,
  buildProfessionalTaskPayload,
  buildReviewPayload,
  defaultReviewApplyFields,
  isImageEvidenceAttachment,
  objectGeometryPolyline,
  objectTypesForTaskType,
  reviewComparisonRows,
  reviewApplyFieldsForObject,
  roadEvidenceNotes,
  routeDependencyReviewState,
  REVIEW_APPLY_FIELDS,
  REVIEW_STATUSES,
  taskTypeLabel,
  toCollectorOption,
} from './campusMapCollectionModel.mjs'

test('round-trips server-controlled rider route metadata through the visual editor', () => {
  const painter = readFileSync(new URL('../RegionCampusMapPainter.vue', import.meta.url), 'utf8')
  assert.match(painter, /sourceProperties\?: Record<string, any>/)
  assert.match(painter, /\.\.\.\(route\.sourceProperties \|\| \{\}\)/)
  assert.match(painter, /sourceProperties: \{ \.\.\.properties \}/)
})

test('maps an official rider row to the user id required by task assignments', () => {
  assert.deepEqual(
    toCollectorOption({
      id: 'region-rider-1',
      userId: 'user-1',
      realName: '王师傅',
      phone: '13800138000',
      User: {
        id: 'user-1',
        uid: 8,
        nickname: '小王',
        avatar: 'https://img/avatar.png',
        phone: '13800138000',
      },
    }),
    {
      value: 'user-1',
      label: '王师傅',
      phone: '138****8000',
      uid: 8,
      avatar: 'https://img/avatar.png',
    },
  )
})

test('builds one rider-app task payload with unique users and selected outdoor types', () => {
  assert.deepEqual(
    buildProfessionalTaskPayload({
      name: ' 一期道路与入口采集 ',
      instructions: ' 沿中心线步行 ',
      status: 'ready',
      collectorUserIds: ['user-1', 'user-1', 'user-2'],
      objectTypes: ['road', 'place_verification'],
      targetPlaceIds: ['place-library', 'place-library', 'place-gate'],
      priority: 1,
      dueAt: '2026-08-20T12:00:00.000Z',
    }),
    {
      name: '一期道路与入口采集',
      instructions: '沿中心线步行',
      status: 'ready',
      collectorUserIds: ['user-1', 'user-2'],
      allowedClients: ['rider_app'],
      taskType: 'mixed',
      objectTypes: ['road', 'place_verification'],
    targetPlaceIds: ['place-library', 'place-gate'],
    targetFeatureIds: [],
      priority: 1,
      dueAt: '2026-08-20T12:00:00.000Z',
      boundary: null,
    },
  )
})

test('builds a dedicated place verification task and infers old task types compatibly', () => {
  const payload = buildProfessionalTaskPayload({
    name: ' 人和楼现场核验 ',
    taskType: 'place_verification',
    objectTypes: ['place_verification'],
    targetPlaceIds: ['place-7'],
  })
  assert.equal(payload.taskType, 'place_verification')
  assert.deepEqual(payload.objectTypes, ['place_verification'])
  assert.deepEqual(payload.targetPlaceIds, ['place-7'])
  assert.equal(taskTypeLabel({ objectTypes: ['road'], targetPlaceIds: [] }), '路线采集')
  assert.equal(taskTypeLabel({ objectTypes: ['building'], targetPlaceIds: ['place-7'] }), '地点核验')
})

test('pins task type to the rider upload object type contract', () => {
  assert.deepEqual(objectTypesForTaskType('route_collection', ['building']), ['road'])
  assert.deepEqual(objectTypesForTaskType('place_verification', ['building']), ['place_verification'])
  assert.deepEqual(objectTypesForTaskType('mixed', ['entrance']), ['road', 'place_verification'])
})

test('unifies point and polygon targets by stable placeId without duplicate choices', () => {
  const options = buildPlaceTargetOptions([
    { id: 'poi-7', placeId: 'place-7', officialNumber: 7, title: '人和楼', featureKind: 'poi' },
    { id: 'area-7', placeId: 'place-7', officialNumber: 7, title: '人和楼', featureKind: 'area' },
    { id: 'area-gate', title: '北门', points: [{}, {}, {}] },
  ])
  assert.equal(options.length, 2)
  assert.equal(options[0].id, 'place-7')
  assert.match(options[0].label, /建筑轮廓/)
  assert.match(options[1].label, /建筑轮廓/)
})

test('keeps legacy manifest targets visible but disables them for new task selection', () => {
  const [legacy, catalog] = buildPlaceTargetOptions([
    { id: 'area-without-place', title: '未建档轮廓', points: [{}, {}, {}], catalogBacked: false },
    { id: 'place-7', placeId: 'place-7', officialNumber: 7, title: '人和楼', catalogBacked: true },
  ])
  assert.equal(legacy.selectable, false)
  assert.match(legacy.label, /请先建立地点档案并绑定/)
  assert.equal(catalog.selectable, true)
})

test('builds selective place promotion payload and never promotes unselected media', () => {
  const object = {
    properties: { targetPlaceId: 'place-7' },
    attachments: [{ id: 'photo-1' }, { id: 'photo-2' }],
  }
  assert.deepEqual(
    buildReviewPayload({
      decision: 'approved',
      note: ' 位置和封面照可用 ',
      applyFields: ['location', 'media', 'location', 'unknown'],
      promoteAttachmentIds: ['photo-2', 'photo-2'],
    }, object),
    {
      decision: 'approved',
      note: '位置和封面照可用',
      targetPlaceId: 'place-7',
      applyFields: ['location', 'media'],
      promoteAttachmentIds: ['photo-2'],
    },
  )
  assert.deepEqual(
    buildReviewPayload({ decision: 'approved', note: '只改地址', applyFields: ['address'], promoteAttachmentIds: ['photo-1'] }, object).promoteAttachmentIds,
    [],
  )
})

test('defaults road approval to geometry and media and exposes route evidence', () => {
  const road = {
    objectType: 'road',
    geometry: { type: 'LineString', coordinates: [[108.1, 30.1], [108.2, 30.2]] },
    attachments: [{ id: 'photo-1' }],
    properties: { note: '西侧路口正在施工' },
    evidence: { markers: [{ label: '路口', note: '有减速带' }] },
  }
  assert.deepEqual(defaultReviewApplyFields(road), ['geometry', 'media'])
  assert.deepEqual(objectGeometryPolyline(road), [[108.1, 30.1], [108.2, 30.2]])
  assert.deepEqual(roadEvidenceNotes(road), [
    { label: '旁注', text: '西侧路口正在施工' },
    { label: '路口', text: '有减速带' },
  ])
})

test('blocks a dependent route until its predecessor is approved and applied', () => {
  assert.deepEqual(routeDependencyReviewState({ objectType: 'road' }), {
    visible: false, blocked: false, type: 'info', title: '', description: '',
  })
  assert.deepEqual(routeDependencyReviewState({
    objectType: 'road',
    routeDependency: { previousRouteObjectId: 'road-parent', status: 'waiting_review', ready: false },
  }), {
    visible: true,
    blocked: true,
    type: 'warning',
    title: '请先审核上一段路线',
    description: '本段依赖上一段的共享路口；上一段审核并写入地图草稿后，才能通过本段。',
  })
  assert.equal(routeDependencyReviewState({
    objectType: 'road',
    routeDependency: { previousRouteObjectId: 'road-parent', status: 'ready', ready: true },
  }).blocked, false)
  assert.equal(routeDependencyReviewState({
    objectType: 'place_verification',
    routeDependency: { previousRouteObjectId: 'road-parent', status: 'missing', ready: false },
  }).blocked, false)
  assert.equal(routeDependencyReviewState({
    objectType: 'road',
    routeDependency: { previousRouteObjectId: null, sharedStartAnchorPointId: 'point-end', status: 'invalid', ready: false },
  }).blocked, true)
  assert.match(routeDependencyReviewState({
    objectType: 'road',
    routeDependency: { previousRouteObjectId: 'road-parent', status: 'anchor_invalid', ready: false },
  }).description, /重新审核上一段路线/)
})

test('exposes an explicit primary entrance apply field instead of coupling it to location', () => {
  const field = REVIEW_APPLY_FIELDS.find((item) => item.value === 'entrance')
  assert.deepEqual(field, { value: 'entrance', label: '主入口' })
  const rows = reviewComparisonRows(
    { entrances: [{ name: '旧主入口', isPrimary: true }] },
    { properties: { entranceCandidate: { name: '人和楼东门' } } },
  )
  assert.deepEqual(rows.find((row) => row.field === 'entrance'), {
    field: 'entrance', label: '主入口', current: '旧主入口', candidate: '人和楼东门',
  })
})

test('shows only fields that the selected collection object can actually apply', () => {
  assert.deepEqual(reviewApplyFieldsForObject({ objectType: 'road' }).map((item) => item.value), ['geometry', 'media'])
  assert.deepEqual(reviewApplyFieldsForObject({ objectType: 'place_verification' }).map((item) => item.value), [
    'location', 'entrance', 'address', 'constructionStatus', 'serviceStatus', 'media',
  ])
})

test('route media defaults and counts only use image evidence attachments', () => {
  assert.equal(isImageEvidenceAttachment({ kind: 'photo' }), true)
  assert.equal(isImageEvidenceAttachment({ kind: 'file', mimeType: 'image/webp' }), true)
  assert.equal(isImageEvidenceAttachment({ kind: 'audio', mimeType: 'audio/mpeg' }), false)
  assert.deepEqual(defaultReviewApplyFields({
    objectType: 'road',
    attachments: [{ id: 'voice-1', kind: 'audio', mimeType: 'audio/mpeg' }],
  }), ['geometry'])
  const media = reviewComparisonRows({}, {
    attachments: [
      { kind: 'audio', mimeType: 'audio/mpeg' },
      { kind: 'file', mimeType: 'image/jpeg' },
    ],
  }).find((row) => row.field === 'media')
  assert.equal(media.candidate, '1 张')
})

test('shows superseded resamples as read-only history instead of a review decision', () => {
  const superseded = REVIEW_STATUSES.find((item) => item.value === 'superseded')
  assert.deepEqual(superseded, { value: 'superseded', label: '已补采替代', type: 'info', decision: false })
})

test('defaults strong place verification to location so it can feed map calibration', () => {
  assert.deepEqual(defaultReviewApplyFields({
    objectType: 'place_verification',
    longitude: 108.755214,
    latitude: 30.977782,
    properties: { addressDescription: '候选地址', constructionStatus: 'built' },
    attachments: [{ id: 'photo-1' }],
  }), ['location'])
})

test('compares current place values against rider candidates field by field', () => {
  const rows = reviewComparisonRows(
    { longitude: 108.1, latitude: 30.1, address: '旧地址', constructionStatus: 'built', photos: ['/old.jpg'] },
    { longitude: 108.2, latitude: 30.2, properties: { address: '新地址', constructionStatus: 'under_construction' }, attachments: [{ kind: 'photo' }] },
  )
  assert.deepEqual(rows.find((row) => row.field === 'address'), {
    field: 'address', label: '校内地址', current: '旧地址', candidate: '新地址',
  })
  assert.equal(rows.find((row) => row.field === 'location').candidate, '108.200000, 30.200000')
  assert.equal(rows.find((row) => row.field === 'media').candidate, '1 张')
})
