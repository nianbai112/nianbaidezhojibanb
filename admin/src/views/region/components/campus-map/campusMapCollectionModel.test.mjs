import assert from 'node:assert/strict'
import test from 'node:test'
import { buildProfessionalTaskPayload, toCollectorOption } from './campusMapCollectionModel.mjs'

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
      objectTypes: ['road', 'entrance'],
      priority: 1,
      dueAt: '2026-08-20T12:00:00.000Z',
    }),
    {
      name: '一期道路与入口采集',
      instructions: '沿中心线步行',
      status: 'ready',
      collectorUserIds: ['user-1', 'user-2'],
      allowedClients: ['rider_app'],
      objectTypes: ['road', 'entrance'],
      priority: 1,
      dueAt: '2026-08-20T12:00:00.000Z',
      boundary: null,
    },
  )
})
