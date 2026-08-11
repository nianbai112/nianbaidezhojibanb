import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('renders remote agreement content as escaped text instead of executable HTML', async () => {
  const source = await readFile(new URL('../src/App.vue', import.meta.url), 'utf8')

  assert.doesNotMatch(source, /v-html\s*=\s*["']agreement\.content["']/)
  assert.match(source, /\{\{\s*paragraph\s*\}\}/)
})
