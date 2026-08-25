import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  buildNotificationDeliveryPayload,
  notificationDeliveryCapabilities,
} from './notificationDelivery.mjs'

const adminRoot = fileURLToPath(new URL('../../../', import.meta.url))
const source = (relativePath) => readFile(new URL(relativePath, `file://${adminRoot}/`), 'utf8')

test('builds only the backend-supported Notification broadcast DTO', () => {
  assert.deepEqual(
    buildNotificationDeliveryPayload({ target: 'all', title: ' 全站通知 ', content: ' 正文 ' }),
    {
      title: '全站通知',
      content: '正文',
      channelMask: {
        inApp: true,
        websocket: true,
        wechatSubscribe: false,
        officialAccount: false,
      },
    },
  )

  assert.equal(
    buildNotificationDeliveryPayload({
      target: 'region',
      regionId: 'region-1',
      title: '区域通知',
      content: '正文',
    }).regionId,
    'region-1',
  )
})

test('requires an explicit userId and never degrades a single-user Notification into a broadcast', () => {
  assert.equal(notificationDeliveryCapabilities.user, true)
  assert.throws(
    () => buildNotificationDeliveryPayload({ target: 'user', title: '定向通知', content: '正文' }),
    /请填写用户 ID/,
  )
  assert.deepEqual(
    buildNotificationDeliveryPayload({ target: 'user', userId: 'user-1', title: '定向通知', content: '正文' }),
    {
      userId: 'user-1',
      title: '定向通知',
      content: '正文',
      channelMask: {
        inApp: true,
        websocket: true,
        wechatSubscribe: false,
        officialAccount: false,
      },
    },
  )
})

test('notification settings no longer call the realtime private-chat push endpoint', async () => {
  const text = await source('src/views/system/NotificationCenterSettings.vue')
  assert.match(text, /sendNotification/)
  assert.doesNotMatch(text, /testPushToUser|broadcastToAll|pushToRegion|realtime\/test-push/)
})

test('customer-service replies carry the visible ticket context', async () => {
  const [page, api] = await Promise.all([
    source('src/views/system/RealtimeSessionsPage.vue'),
    source('src/api/admin.ts'),
  ])
  assert.doesNotMatch(page, /testPushToUser|handleTestPush/)
  assert.match(page, /ticket\.id/)
  assert.match(page, /activeTicketId/)
  assert.match(api, /ticketId\?: string/)
  assert.match(api, /\{ content, ticketId \}/)
})

test('admin entry labels keep the four message domains separate', async () => {
  const [menus, tabs, privateMessages] = await Promise.all([
    source('src/router/menus.ts'),
    source('src/views/common/moduleTabs.ts'),
    source('src/views/user/PrivateMessages.vue'),
  ])
  for (const label of ['客服工作台', '通知投递', '校园内容', '私信审核']) {
    assert.match(`${menus}\n${tabs}\n${privateMessages}`, new RegExp(label))
  }
})
