import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildKingkongPayload,
  normalizeHomeNavDisplayConfig,
  normalizeKingkongCollection,
  normalizeKingkongEntry,
  validateKingkongEntries,
} from './homeKingkongLinks.mjs'

test('recovers kingkong entries from a legacy object with numeric keys', () => {
  assert.deepEqual(
    normalizeKingkongCollection({
      1: { name: '外卖' },
      0: { name: '跑腿' },
      title: { text: '灵萌圈友' },
      showLayoutSwitch: true,
    }).map((item) => item.name),
    ['跑腿', '外卖'],
  )
})

test('keeps display metadata separate from kingkong entries', () => {
  assert.deepEqual(
    normalizeHomeNavDisplayConfig({
      0: { name: '跑腿' },
      title: { show: false, text: '校园首页', color: '#123456', fontSize: 18, fontWeight: '700' },
      showLayoutSwitch: false,
    }),
    {
      title: { show: false, text: '校园首页', color: '#123456', fontSize: 18, fontWeight: '700' },
      showLayoutSwitch: false,
    },
  )
})

test('keeps the app id and normalizes legacy link types in saved kingkong entries', () => {
  assert.deepEqual(
    buildKingkongPayload([
      { id: 'a', name: '官网', linkType: 'web', path: 'https://example.com', enabled: true },
      { id: 'b', name: '商城', linkType: 'miniProgram', appid: 'wx123', page: 'pages/home/index', enabled: true },
    ]),
    [
      {
        id: 'a', name: '官网', subtitle: '', icon: '', linkType: 'webview',
        path: 'https://example.com', page: 'https://example.com', appId: '', query: '',
        enabled: true, sortOrder: 0, type: 'page',
      },
      {
        id: 'b', name: '商城', subtitle: '', icon: '', linkType: 'miniapp',
        path: 'pages/home/index', page: 'pages/home/index', appId: 'wx123', query: '',
        enabled: true, sortOrder: 1, type: 'page',
      },
    ],
  )
})

test('normalizes one loaded kingkong entry without losing app id or query', () => {
  assert.deepEqual(
    normalizeKingkongEntry({
      id: 'entry-1', name: '半屏商城', image: '/icon.png', linkType: 'miniapp_half',
      appid: 'wx456', page: 'pages/shop/index', query: 'from=home', enabled: true, sortOrder: 3,
    }),
    {
      id: 'entry-1', name: '半屏商城', subtitle: '', icon: '/icon.png', linkType: 'miniapp_half',
      appId: 'wx456', path: 'pages/shop/index', query: 'from=home', enabled: true, sortOrder: 3,
    },
  )
})

test('normalizes web schemes and telephone formatting before saving', () => {
  assert.deepEqual(
    buildKingkongPayload([
      { name: '官网', linkType: 'webview', path: 'HTTPS://example.com', enabled: true },
      { name: '联系客服', linkType: 'tel', path: '1-380-013-8000', query: 'from=home', enabled: true },
    ]).map(({ linkType, path, query }) => ({ linkType, path, query })),
    [
      { linkType: 'webview', path: 'https://example.com', query: '' },
      { linkType: 'tel', path: '13800138000', query: '' },
    ],
  )
})

test('rejects enabled entries whose selected jump type is incomplete', () => {
  assert.equal(
    validateKingkongEntries([{ name: '商城', linkType: 'miniapp', appId: '', path: 'pages/home/index', enabled: true }]),
    '「商城」请填写小程序 AppID',
  )
  assert.equal(
    validateKingkongEntries([{ name: '联系客服', linkType: 'tel', path: '123', enabled: true }]),
    '「联系客服」请填写正确的电话号码',
  )
  assert.equal(
    validateKingkongEntries([{ name: '商城', linkType: 'miniapp', appId: 'wx123', path: 'pages/home/index', enabled: true }]),
    '「商城」小程序 AppID 格式不正确',
  )
  assert.equal(
    validateKingkongEntries([{ name: '联系客服', linkType: 'tel', path: '1-----', enabled: true }]),
    '「联系客服」请填写正确的电话号码',
  )
  assert.equal(
    validateKingkongEntries([{ name: '仅展示', linkType: 'none', path: '', enabled: true }]),
    '',
  )
})
