const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const page = fs.readFileSync(path.join(__dirname, '../admin/src/views/order/OrderAppealsPage.vue'), 'utf8')

test('appeal drawer submits server-owned money resolution actions', () => {
  assert.match(page, /resolutionAction/)
  assert.match(page, /full_refund/)
  assert.match(page, /partial_refund/)
  assert.match(page, /compensate_user/)
  assert.match(page, /penalize_rider/)
  assert.match(page, /refundAmount/)
  assert.match(page, /riderPenaltyAmount/)
  assert.doesNotMatch(page, /本页不会执行退款/)
})
