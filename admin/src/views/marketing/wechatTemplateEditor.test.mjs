import assert from 'node:assert/strict'
import test from 'node:test'
import { parseWechatTemplate, buildTemplatePayload, editFields } from './wechatTemplateEditor.mjs'
const id = 'wechat_added_template_identifier_1234567890123'
const content = '订单编号:{{character_string7.DATA}}\n订单金额:{{amount8.DATA}}\n服务名称:{{thing9.DATA}}\n下单时间:{{time10.DATA}}\n服务地址:{{thing11.DATA}}'
test('WeChat actual variable numbers round-trip into a persistable new-rider mapping', () => {
 const form = { templateId: ` ${id} `, fields: parseWechatTemplate(content), enabled: true }
 const payload = buildTemplatePayload(form, 'new_errand_order', 'official')
 assert.deepEqual(payload, { templateId: id, enabled: true, fieldMapping: { character_string7: 'orderNo', amount8: 'orderAmount', thing9: 'serviceName', time10: 'orderTime', thing11: 'serviceAddress' } })
 assert.deepEqual(buildTemplatePayload({ ...form, fields: editFields(payload.fieldMapping) }, 'new_errand_order', 'official'), payload)
})
test('unknown WeChat labels require an explicit selection instead of guessing', () => {
 const fields = parseWechatTemplate('新字段:{{thing16.DATA}}')
 assert.equal(fields[0].business, '')
 assert.throws(() => buildTemplatePayload({ templateId: id, fields }, 'community_at', 'official'), /对应内容/)
})
test('rejects library IDs, duplicate variables and missing rider fields', () => {
 const fields = parseWechatTemplate(content)
 assert.throws(() => buildTemplatePayload({ templateId: '42995', fields }, 'new_errand_order', 'official'), /完整模板/)
 assert.throws(() => buildTemplatePayload({ templateId: id, fields: [fields[0], fields[0]] }, 'new_errand_order', 'official'), /重复/)
 assert.throws(() => buildTemplatePayload({ templateId: id, fields: fields.slice(1) }, 'new_errand_order', 'official'), /骑手新单/)
})
test('accepts variables pasted from WeChat and preserves a stopped template', () => {
 const data = buildTemplatePayload({ templateId: id, fields: [{ variable: '{{thing23.DATA}}', business: 'riderName' }], enabled: false }, 'errand_accepted', 'official')
 assert.deepEqual(data.fieldMapping, { thing23: 'riderName' }); assert.equal(data.enabled, false)
})
