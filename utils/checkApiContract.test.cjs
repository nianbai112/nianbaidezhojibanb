const test = require('node:test');
const assert = require('node:assert/strict');
const { findMethodNear } = require('./checkApiContract');

test('reads the real method from a request block', () => {
  const source = 'request({ url: joinUrl(apiUrl, "/platform/login-page-config"), method: "GET" })';
  assert.equal(findMethodNear(source, source.indexOf('joinUrl')), 'GET');
});

test('defaults an uploadFile block to POST when method is omitted', () => {
  const source = 'common_vendor.index.uploadFile({ url: joinUrl(apiUrl, "/upload"), filePath })';
  assert.equal(findMethodNear(source, source.indexOf('joinUrl')), 'POST');
});
