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

test('only lets the latest rider search completion publish results and clear loading', () => {
  const controller = model.createLatestRequestController()
  const state = { options: ['current'], loading: true }
  const olderRequest = controller.begin()
  const newerRequest = controller.begin()

  assert.equal(controller.commit(olderRequest, () => {
    state.options = ['stale']
    state.loading = false
  }), false)
  assert.deepEqual(state, { options: ['current'], loading: true })

  assert.equal(controller.commit(newerRequest, () => {
    state.options = ['newest']
    state.loading = false
  }), true)
  assert.deepEqual(state, { options: ['newest'], loading: false })
})

test('shows a local error only when the shared interceptor has not already surfaced it', () => {
  const messages = []
  const show = (message) => messages.push(message)

  assert.equal(model.showUnsurfacedRequestError({
    message: 'shared message',
    userMessage: 'shared message',
  }, 'fallback', show), false)
  assert.deepEqual(messages, [])

  assert.equal(model.showUnsurfacedRequestError(new Error('local validation'), 'fallback', show), true)
  assert.deepEqual(messages, ['local validation'])
})
