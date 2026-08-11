const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

test('errand admin exposes closure switches and actionable risk events', () => {
  const pricing = read('admin/src/views/delivery/PricingRules.vue')
  const abnormal = read('admin/src/views/delivery/AbnormalOrders.vue')
  const api = read('admin/src/api/errand.ts')

  for (const key of ['closureVersion', 'autoReceiptEnabled', 'settlementV2Enabled']) {
    assert.match(pricing, new RegExp(key))
  }
  assert.match(abnormal, /openRiskEvents/)
  assert.match(abnormal, /handleErrandRiskEvent/)
  assert.match(api, /admin\/errand\/risk-events\/\$\{id\}\/handle/)
})
