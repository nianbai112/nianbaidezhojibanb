import assert from 'node:assert/strict'
import test from 'node:test'
import { persistRegionEditor } from './editorPersistence.mjs'

function recordingRequest() {
  const calls = []
  return {
    calls,
    client: {
      async put(url, payload) { calls.push({ method: 'put', url, payload }) },
    },
  }
}

test('region editors persist their current payload without writing a global code package', async () => {
  const request = recordingRequest()
  const payload = { message_page_layout: 'default' }

  await persistRegionEditor(request.client, 'region-1', payload)

  assert.deepEqual(request.calls, [
    { method: 'put', url: '/admin/regions/region-1', payload },
  ])
})
