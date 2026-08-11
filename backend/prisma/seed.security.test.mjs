import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('seed validation never logs any derived password value', async () => {
  const source = await readFile(new URL('seed.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /console\.(?:log|error|warn)\([^\n]*defaultPassword/)
})
