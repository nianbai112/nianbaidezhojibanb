export const notificationDeliveryCapabilities = Object.freeze({
  user: true,
  region: true,
  all: true,
})

function requiredText(value, label) {
  const text = String(value || '').trim()
  if (!text) throw new Error(`请填写${label}`)
  return text
}

/**
 * Build the exact AdminBroadcastDto accepted by /admin/notifications/send.
 * UI-only targetType must never leak into this payload. The backend distinguishes
 * a single user with userId, a region with regionId, and all users with neither.
 */
export function buildNotificationDeliveryPayload(input = {}) {
  const target = String(input.target || '').trim()
  if (!notificationDeliveryCapabilities[target]) throw new Error('请选择有效的通知投递范围')

  const payload = {
    title: requiredText(input.title, '通知标题'),
    content: requiredText(input.content, '通知内容'),
    channelMask: {
      inApp: true,
      websocket: input.websocket !== false,
      wechatSubscribe: input.wechatSubscribe === true,
      officialAccount: false,
    },
  }

  if (target === 'user') payload.userId = requiredText(input.userId, '用户 ID')
  if (target === 'region') payload.regionId = requiredText(input.regionId, '区域 ID')
  if (input.linkType) payload.linkType = String(input.linkType).trim()
  if (input.linkValue) payload.linkValue = String(input.linkValue).trim()
  return payload
}
