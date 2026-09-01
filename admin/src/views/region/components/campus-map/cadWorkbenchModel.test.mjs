import assert from 'node:assert/strict'
import test from 'node:test'
import { campusMapWorkflowSteps } from './cadWorkbenchModel.mjs'

test('native GCJ-02 maps complete the real-coordinate step without calibration points', () => {
  const steps = campusMapWorkflowSteps({
    hasVisualBaseMap: true,
    featureCount: 10,
    calibrationPointCount: 0,
    calibrationRequired: false,
    canPublish: true,
  })
  const positioning = steps.find((step) => step.key === 'amap')
  assert.equal(positioning.status, 'done')
  assert.equal(positioning.subtitle, 'GCJ-02 已启用')
})
