const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')

const read = (file) => fs.readFileSync(file, 'utf8')
const actionBar = read('admin/src/views/region/components/campus-map/CampusMapActionBar.vue')
const painter = read('admin/src/views/region/components/RegionCampusMapPainter.vue')
const releaseModel = read('admin/src/views/region/components/campus-map/campusMapReleaseModel.mjs')
const inspector = read('admin/src/views/region/components/campus-map/CampusMapInspector.vue')

test('campus map cockpit keeps workflow actions compact while exposing draft save separately', () => {
  for (const label of ['档案绑定', '现场核验', '发布候选', '正式版本', '用户在线']) {
    assert.match(releaseModel, new RegExp(label))
  }
  assert.match(actionBar, /v-for="stage in releaseCockpit\.stages"/)
  assert.match(actionBar, /class="release-stage"/)
  for (const label of ['补地点', '派采集', '保存草稿', '发布本批']) {
    assert.match(actionBar, new RegExp(label))
  }
  for (const oldPeer of ['>导入 CAD<', '>刷新<', '>高级<', '>预览<', '>版本历史<', '>停用<']) {
    assert.doesNotMatch(actionBar, new RegExp(`<el-button[^>]*${oldPeer}`))
  }
  assert.match(actionBar, /run-action', 'save'/)
  assert.match(actionBar, /draftSaving/)
  assert.match(painter, /:draft-saving="draftSaving"/)
  assert.match(painter, /action === 'save'[\s\S]*saveDraft\(\)/)
  const painterStyle = painter.split('<style scoped>')[1] || ''
  assert.doesNotMatch(painterStyle, /\.map-action-bar\s*\{/)
  assert.match(actionBar, /el-dropdown/)
  assert.match(painter, /buildCampusReleaseCockpit/)
  assert.match(painter, /handleReleaseAction/)
  assert.match(painter, /handleOperationsCommand/)
})

test('the default inspector shows ranked blockers before raw layer objects', () => {
  assert.match(inspector, /当前阻塞/)
  assert.match(inspector, /releaseCockpit\.issues/)
  assert.match(inspector, /\$emit\('runIssue', issue\)/)
  assert.match(inspector, /el-collapse-item[\s\S]*图层对象/)
  assert.match(painter, /handleReleaseIssue/)
  assert.match(painter, /@run-issue="handleReleaseIssue"/)
})

test('the inspector keeps user check-in photos private until an operator approves them', () => {
  assert.match(inspector, /用户打卡待审核/)
  assert.match(inspector, /pendingProjectMedia/)
  assert.match(inspector, /reviewProjectMedia\(media, 'approved'\)/)
  assert.match(inspector, /reviewProjectMedia\(media, 'rejected'\)/)
  assert.match(inspector, /updateCampusMapPlaceMedia/)
})
