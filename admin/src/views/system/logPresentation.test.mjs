import test from 'node:test';
import assert from 'node:assert/strict';
import { operationChanges, deviceInfo, ipText, actionName, moduleName } from './logPresentation.mjs';

test('shows the actual changed switches, including false and removed fields', () => {
  assert.deepEqual(operationChanges({ before: { enabled: true, hideMall: false, title: '旧标题' }, after: { enabled: false, hideMall: false } }), [
    { label: '启用状态', before: '是', after: '否' }, { label: '标题', before: '旧标题', after: '未设置' },
  ]);
});
test('distinguishes each navigation item without truncating changes', () => {
  const result = operationChanges({ before: { list: [{ name: '首页' }] }, after: { list: [{ name: '校园' }, { name: '消息' }] } });
  assert.equal(result[0].label, '导航项 · 第1项 · 名称');
  assert.equal(result[0].before, '首页');
  assert.equal(result[1].after, '消息');
});
test('does not invent historic values or IP addresses', () => {
  assert.deepEqual(operationChanges({ after: { enabled: false } }), [{ label: '启用状态', before: '历史未记录', after: '否' }]);
  assert.equal(ipText(null), '未记录');
  assert.match(ipText('127.0.0.1'), /本机或代理/);
  assert.equal(ipText('::ffff:183.227.87.224'), '183.227.87.224');
});
test('translates the exact technical actions shown in the screenshots', () => {
  assert.equal(actionName('UPDATE_APP_CAPABILITIES'), '修改小程序功能开关');
  assert.equal(actionName('UPDATE_APP_REVIEW_MODE'), '修改小程序审核配置');
  assert.equal(moduleName('config'), '系统配置');
});
test('identifies browser order correctly and keeps missing-device evidence honest', () => {
  assert.match(deviceInfo('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/130.0 Safari/537.36'), /苹果电脑系统 10.15.7 · 谷歌浏览器 130.0/);
  assert.match(deviceInfo('Mozilla/5.0 Windows NT 10.0 Chrome/130.0 Safari/537.36 Edg/130.1'), /微软浏览器 130.1/);
  assert.equal(deviceInfo(''), '未记录设备信息');
});
