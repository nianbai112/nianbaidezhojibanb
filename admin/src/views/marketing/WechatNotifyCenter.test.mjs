import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const source = fs.readFileSync(new URL('./WechatNotifyCenter.vue', import.meta.url), 'utf8')

test('all implemented order and community subscriptions expose connection status', () => {
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

test('operator template panel exposes no editable template ids or field mappings', () => {
  const templateStart = source.indexOf('<!-- ===== TAB 3：消息模板 ===== -->')
  const templateEnd = source.indexOf('<!-- ===== TAB 4', templateStart)
  const template = source.slice(templateStart, templateEnd > templateStart ? templateEnd : source.indexOf('</el-tab-pane>', templateStart))

  assert.match(template, /模板 ID、变量名和业务字段由后端统一维护/)
  assert.match(template, /系统托管/)
  assert.doesNotMatch(template, /v-model="fd\.varName"/)
  assert.doesNotMatch(template, /v-model="fd\.mappedField"/)
  assert.doesNotMatch(template, /v-model="row\.templateId"/)
  assert.doesNotMatch(template, /v-model="row\.miniTemplateId"/)
  assert.doesNotMatch(source, /fieldDefs|miniFieldDefs|mappedField|varName/)
})
