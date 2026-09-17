import assert from 'node:assert/strict';
import test from 'node:test';
import { describeWechatTemplateState } from './wechatTemplateState.mjs';

const complete = { templateId: 'configured-id', enabled: true, fieldMapping: { thing1: 'content' } };
test('an id alone is not evidence of a usable or delivered template', () => {
  assert.equal(describeWechatTemplateState([{ templateId: 'configured-id', enabled: false }]).label, '模板已停用');
  assert.equal(describeWechatTemplateState([{ templateId: 'configured-id', enabled: true }]).label, '字段待配置');
  const result = describeWechatTemplateState([complete]);
  assert.equal(result.label, '已保存配置');
  assert.match(result.note, /实际送达以发送日志中的微信回执为准/);
});
test('a failed read is distinguishable from an empty configuration', () => {
  assert.equal(describeWechatTemplateState([], 'failed').label, '读取失败');
  assert.equal(describeWechatTemplateState([]).label, '待配置');
  assert.equal(describeWechatTemplateState([], 'loading').label, '检查中');
});
test('all returned campus configurations contribute to readiness', () => {
  assert.equal(describeWechatTemplateState([complete, { ...complete, enabled: false }]).label, '部分模板停用');
  assert.equal(describeWechatTemplateState([complete, { ...complete, templateId: '' }]).label, '模板 ID 缺失');
  assert.equal(describeWechatTemplateState([complete, { ...complete, fieldMapping: { thing2: '' } }]).label, '字段待配置');
});
