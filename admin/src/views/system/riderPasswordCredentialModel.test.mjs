import assert from 'node:assert/strict'
import test from 'node:test'
import * as model from './riderPasswordCredentialModel.mjs'

test('never maps passwordHash from an admin response', () => {
  const result = model.mapRiderPasswordCredential({
    configured: true, username: 'campus.test', passwordHash: 'secret-hash', password: 'secret', enabled: true,
  })
  assert.equal(result.username, 'campus.test')
  assert.equal('passwordHash' in result, false)
  assert.equal('password' in result, false)
})

test('omits a blank password when saving existing configuration', () => {
  assert.deepEqual(model.buildRiderPasswordCredentialPayload({
    username: 'campus.test', password: '', userId: 'user-1', enabled: true, expiresAt: '',
  }), { username: 'campus.test', userId: 'user-1', enabled: true, expiresAt: null })
})

test('includes a non-blank password only in the save payload', () => {
  assert.deepEqual(model.buildRiderPasswordCredentialPayload({
    username: 'campus.test', password: 'Campus2026!', userId: 'user-1', enabled: true, expiresAt: '',
  }), { username: 'campus.test', password: 'Campus2026!', userId: 'user-1', enabled: true, expiresAt: null })
})
