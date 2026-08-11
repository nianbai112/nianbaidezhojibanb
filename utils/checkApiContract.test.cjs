const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { findMethodNear } = require('./checkApiContract');

test('reads the real method from a request block', () => {
  const source = 'request({ url: joinUrl(apiUrl, "/platform/login-page-config"), method: "GET" })';
  assert.equal(findMethodNear(source, source.indexOf('joinUrl')), 'GET');
});

test('defaults an uploadFile block to POST when method is omitted', () => {
  const source = 'common_vendor.index.uploadFile({ url: joinUrl(apiUrl, "/upload"), filePath })';
  assert.equal(findMethodNear(source, source.indexOf('joinUrl')), 'POST');
});

test('bounds decorator argument scanning to one source line', () => {
  const source = fs.readFileSync(path.join(__dirname, 'checkApiContract.js'), 'utf8');
  assert.match(source, /\[\^\)\]\{0,500\}/);
  assert.doesNotMatch(source, /\[\^\)\]\*\)\/g/);
});
