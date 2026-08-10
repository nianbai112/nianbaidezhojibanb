import test from 'node:test'
import assert from 'node:assert/strict'
import * as model from './campusMapCollectionModel.mjs'

test('maps one backend rider option without exposing the full phone number', () => {
  assert.deepEqual(model.toCollectorOption({
    userId: 'rider-1', uid: 1008, nickname: '小王', realName: '王同学',
    phone: '138****8000', avatar: 'https://img/avatar.jpg', regionId: 'region-1',
  }), {
    value: 'rider-1', uid: 1008, label: '小王', realName: '王同学',
    phone: '138****8000', avatar: 'https://img/avatar.jpg', regionId: 'region-1',
  })
})

test('builds a rider-only outdoor task payload from selected real users', () => {
  assert.deepEqual(model.buildProfessionalTaskPayload({
    name: '一期道路和建筑采集', instructions: '沿道路中心线行走', status: 'ready',
    collectorUserIds: ['rider-1', 'rider-1', 'rider-2'],
    objectTypes: ['road', 'building', 'entrance'], priority: 2,
    dueAt: '2026-08-31T15:59:59.000Z',
  }), {
    name: '一期道路和建筑采集', instructions: '沿道路中心线行走', status: 'ready',
    collectorUserIds: ['rider-1', 'rider-2'], allowedClients: ['rider_app'],
    objectTypes: ['road', 'building', 'entrance'], priority: 2,
    dueAt: '2026-08-31T15:59:59.000Z',
  })
})

test('converts immutable collected geometries to review-only GeoJSON features', () => {
  const result = model.toCollectionFeatures([{
    id: 'road-1', objectType: 'road', reviewStatus: 'pending',
    geometry: { type: 'LineString', coordinates: [[106.5, 29.6], [106.6, 29.7]] },
    properties: { surface: 'asphalt' },
  }])
  assert.deepEqual(result, {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature', id: 'road-1',
      geometry: { type: 'LineString', coordinates: [[106.5, 29.6], [106.6, 29.7]] },
      properties: { surface: 'asphalt', objectType: 'road', reviewStatus: 'pending' },
    }],
  })
})
