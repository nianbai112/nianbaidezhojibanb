import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const source = fs.readFileSync(new URL('./WechatNotifyCenter.vue', import.meta.url), 'utf8')

test('all implemented order and community subscriptions expose connection status', () => {
  assert.match(source, /loadTemplatePages\('official'\)/)
  assert.match(source, /loadTemplatePages\('miniprogram'\)/)
  assert.match(source, /fetchWechatTemplates\(\{ platformType, page, pageSize: 100 \}/)

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
  assert.match(abnormalRow, /退款处理和结果通过服务号通知/)
  assert.doesNotMatch(abnormalRow, /supportsMiniProgram/)
})

test('operators can open persisted official and mini-program template editors', () => {
  assert.match(source, /openTemplateEditor\(row, 'official'\)/)
  assert.match(source, /openTemplateEditor\(row, 'miniprogram'\)/)
  assert.match(source, /canConfigureTemplates/)
  assert.match(source, /@saved="reloadTemplatesAfterSave"/)
  assert.doesNotMatch(source, /系统托管|由后端统一维护/)
})
