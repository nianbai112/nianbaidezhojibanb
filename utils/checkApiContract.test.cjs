const test = require('node:test');
const assert = require('node:assert/strict');
const { compatibleFrontendPaths, findMethodNear } = require('./checkApiContract');

test('reads the real method from a request block', () => {
  const source = 'request({ url: joinUrl(apiUrl, "/platform/login-page-config"), method: "GET" })';
  assert.equal(findMethodNear(source, source.indexOf('joinUrl')), 'GET');
});

test('defaults an uploadFile block to POST when method is omitted', () => {
  const source = 'common_vendor.index.uploadFile({ url: joinUrl(apiUrl, "/upload"), filePath })';
  assert.equal(findMethodNear(source, source.indexOf('joinUrl')), 'POST');
});

test('matches legacy /api paths that the mini-program compatibility middleware rewrites', () => {
  assert.deepEqual(
    compatibleFrontendPaths('/api/post-shares/share-code'),
    ['/api/post-shares/share-code', '/post-shares/share-code'],
  );
});
