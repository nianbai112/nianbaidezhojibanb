import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const files = ['EmptySlot.vue', 'MenuFallbackIcon.vue', 'HomeEditor.vue']

test('editor icons are rendered as text instead of injected HTML', async () => {
  for (const file of files) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /v-html=/, `${file} must not inject icon markup`)
  }
})
