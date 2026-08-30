const test = require('node:test');
const assert = require('node:assert/strict');
const { unsupportedRequests } = require('./checkApiContractSnapshot.cjs');

test('committed API contract accepts routes still exposed by the backend', () => {
  const requests = [{ method: 'GET', path: '/users/:userId' }];
  const routes = [{ method: 'GET', path: '/users/:id' }];

  assert.deepEqual(unsupportedRequests(requests, routes), []);
});

test('committed API contract reports a removed backend route', () => {
  const requests = [{ method: 'POST', path: '/orders' }];
  const routes = [{ method: 'GET', path: '/orders' }];

  assert.deepEqual(unsupportedRequests(requests, routes), requests);
});
