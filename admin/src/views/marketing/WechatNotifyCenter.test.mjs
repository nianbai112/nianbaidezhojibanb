import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const source = fs.readFileSync(new URL('./WechatNotifyCenter.vue', import.meta.url), 'utf8')

test('all implemented order and community subscriptions are configurable', () => {
  assert.match(source, /platformType: 'official'/)
  assert.match(source, /platformType: 'miniprogram'/)
  assert.match(source, /miniDefaultPage: '\/pagesA\/order\/order'/)
  assert.match(source, /miniDefaultPage: '\/pagesB\/post\/post'/)
  assert.match(source, /fetchWechatTemplates\(\{ platformType: 'official'/)
  assert.match(source, /fetchWechatTemplates\(\{ platformType: 'miniprogram'/)

  for (const templateType of [
    'takeaway_order_status',
    'takeaway_merchant_order',
    'takeaway_rider_order',
    'errand_accepted',
    'errand_picked',
    'errand_delivered',
    'post_audit_result',
    'post_comment',
    'comment_reply',
  ]) {
    assert.match(source, new RegExp(`key: '${templateType}'[\\s\\S]{0,260}supportsMiniProgram: true`))
  }

  const abnormalRowStart = source.lastIndexOf("key: 'errand_abnormal'")
  const abnormalRow = source.slice(abnormalRowStart, source.indexOf('\n  },', abnormalRowStart) + 5)
  assert.match(abnormalRow, /服务号持续通知/)
  assert.doesNotMatch(abnormalRow, /supportsMiniProgram/)
})
