<template>
  <div class="page-shell">
    <GlassPageHeader title="底部导航管理" subtitle="配置每个区域小程序底部固定导航栏（Tabbar）">
      <template #actions>
        <el-button :icon="Refresh" @click="loadRegions">刷新</el-button>
      </template>
    </GlassPageHeader>

    <div class="search-bar glass-card">
      <div class="card-body">
        <el-input v-model="search" placeholder="搜索区域名称" clearable :prefix-icon="Search" />
      </div>
    </div>

    <div v-if="!filteredRegions.length" class="empty-state glass-card">
      <el-empty description="暂无区域，请先在区域管理中新增区域">
        <el-button type="primary" @click="$router.push('/region/list')">前往区域管理</el-button>
      </el-empty>
    </div>

    <div v-else class="region-grid">
      <div v-for="r in filteredRegions" :key="r.id" class="region-card glass-card">
        <div class="card-header">
          <div class="region-info">
            <div class="region-logo" :style="r.logo ? {backgroundImage: `url(${r.logo})`, backgroundSize: 'cover'} : {}">
              {{ r.logo ? '' : (r.name || '').slice(0, 1) }}
            </div>
            <div>
              <div class="region-name">{{ r.name }}</div>
              <div class="region-code">{{ r.code || r.id }}</div>
            </div>
          </div>
          <el-tag :type="r.isOpen !== false ? 'success' : 'info'" size="small">
            {{ r.isOpen !== false ? '运营中' : '已关闭' }}
          </el-tag>
        </div>
        <div class="card-body">
          <div class="tabbar-preview">
            <div class="tabbar-phone">
              <div class="tabbar-bar">
                <div v-for="tab in getPreviewTabs(r.id)" :key="tab.id" class="tabbar-item" :class="{ disabled: !tab.enabled }">
                  <div class="tabbar-icon" :style="{ color: tab.enabled ? (tab.selectedColor || '#1677ff') : '#ccc' }">
                    <el-icon :size="16"><component :is="getTabIcon(tab.id)" /></el-icon>
                  </div>
                  <span class="tabbar-text">{{ tab.name }}</span>
                </div>
              </div>
            </div>
          </div>
          <div class="tabbar-summary">
            {{ getTabCount(r.id) }} 个导航项，{{ getEnabledCount(r.id) }} 个启用
          </div>
        </div>
        <div class="card-footer">
          <el-button type="primary" @click="openEditor(r)">编辑配置</el-button>
        </div>
      </div>
    </div>

    <el-drawer v-model="drawerVisible" :title="`编辑底部导航 - ${editingRegion?.name || ''}`" size="780px" direction="rtl">
      <template v-if="editingRegion">
        <div class="editor-layout">
          <div class="editor-form">
            <div class="editor-section">
              <div class="editor-section-title">全局样式</div>
              <div class="style-row">
                <div class="style-field">
                  <label>默认文字颜色</label>
                  <el-color-picker v-model="editConfig.color" />
                </div>
                <div class="style-field">
                  <label>选中文字颜色</label>
                  <el-color-picker v-model="editConfig.selectedColor" />
                </div>
                <div class="style-field">
                  <label>背景颜色</label>
                  <el-color-picker v-model="editConfig.backgroundColor" />
                </div>
              </div>
            </div>

            <div class="editor-section">
              <div class="editor-section-title">
                导航项（最多 5 个）
                <el-button size="small" type="primary" plain @click="addTab" :disabled="editConfig.list.length >= 5">添加</el-button>
              </div>
              <div class="tab-list">
                <div v-for="(tab, idx) in editConfig.list" :key="tab.id" class="tab-editor-item">
                  <div class="tab-editor-header">
                    <div class="tab-drag">☰</div>
                    <el-switch v-model="tab.enabled" size="small" />
                    <span class="tab-label">{{ tab.name || '未命名' }}</span>
                    <div class="tab-actions">
                      <el-button size="small" circle :disabled="idx === 0" @click="moveTab(idx, -1)"><el-icon><Top /></el-icon></el-button>
                      <el-button size="small" circle :disabled="idx === editConfig.list.length - 1" @click="moveTab(idx, 1)"><el-icon><Bottom /></el-icon></el-button>
                      <el-button size="small" circle type="danger" @click="editConfig.list.splice(idx, 1)"><el-icon><Delete /></el-icon></el-button>
                    </div>
                  </div>
                  <div class="tab-editor-body">
                    <div class="field-row">
                      <div class="field-item">
                        <label>名称</label>
                        <el-input v-model="tab.name" size="small" placeholder="首页" />
                      </div>
                      <div class="field-item">
                        <label>ID</label>
                        <el-input v-model="tab.id" size="small" placeholder="home" />
                      </div>
                    </div>
                    <div class="field-row">
                      <div class="field-item">
                        <label>页面路径 pagePath</label>
                        <el-input v-model="tab.pagePath" size="small" placeholder="pages/tabbar/index/index" />
                      </div>
                      <div class="field-item">
                        <label>动作 action</label>
                        <el-input v-model="tab.action" size="small" placeholder="publish（发布按钮用）" />
                      </div>
                    </div>
                    <div class="field-row tab-icon-upload-grid">
                      <div class="field-item">
                        <label>未选中图标</label>
                        <ImageUploadBox
                          v-model="tab.iconPath"
                          scene="tabbar-icon"
                          shape="square"
                          placeholder="上传普通图标"
                          tip="建议 80x80"
                          :max-size="1"
                        />
                      </div>
                      <div class="field-item">
                        <label>选中图标</label>
                        <ImageUploadBox
                          v-model="tab.selectedIconPath"
                          scene="tabbar-icon-active"
                          shape="square"
                          placeholder="上传选中图标"
                          tip="建议 80x80"
                          :max-size="1"
                        />
                      </div>
                    </div>
                    <div class="field-row">
                      <div class="field-item small">
                        <label>图标宽度</label>
                        <el-input-number v-model="tab.width" :min="16" :max="64" size="small" />
                      </div>
                      <div class="field-item small">
                        <label>图标高度</label>
                        <el-input-number v-model="tab.height" :min="16" :max="64" size="small" />
                      </div>
                      <div class="field-item small">
                        <label>字号</label>
                        <el-input-number v-model="tab.fontSize" :min="8" :max="20" size="small" />
                      </div>
                    </div>
                    <div class="field-row">
                      <div class="field-item small">
                        <label>普通颜色</label>
                        <el-color-picker v-model="tab.color" />
                      </div>
                      <div class="field-item small">
                        <label>选中颜色</label>
                        <el-color-picker v-model="tab.selectedColor" />
                      </div>
                      <div class="field-item toggle">
                        <label>头像模式</label>
                        <el-switch v-model="tab.avatarMode" size="small" />
                      </div>
                      <div class="field-item toggle">
                        <label>隐藏文字</label>
                        <el-switch v-model="tab.hideText" size="small" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div v-if="!editConfig.list.length" class="empty-tabs">
                暂无导航项，点击"添加"或"恢复默认"
              </div>
            </div>

            <div class="editor-actions">
              <el-button @click="resetToDefault">恢复默认</el-button>
              <el-button type="primary" :loading="saving" @click="saveConfig">保存配置</el-button>
            </div>
          </div>

          <div class="editor-preview">
            <div class="preview-title">实时预览</div>
            <div class="preview-phone">
              <div class="preview-content">
                <div class="preview-placeholder">小程序内容区域</div>
              </div>
              <div class="preview-tabbar" :style="{ background: editConfig.backgroundColor || '#ffffff' }">
                <div v-for="tab in editConfig.list" :key="tab.id" class="preview-tab-item" :class="{ disabled: !tab.enabled }">
                  <div class="preview-tab-icon" :style="{ color: tab.enabled ? (tab.selectedColor || editConfig.selectedColor || '#1677ff') : '#ccc' }">
                    <el-icon :size="20"><component :is="getTabIcon(tab.id)" /></el-icon>
                  </div>
                  <span v-if="!tab.hideText" class="preview-tab-text" :style="{ color: tab.enabled ? (tab.color || editConfig.color || '#8A8A8A') : '#ccc', fontSize: (tab.fontSize || 12) + 'px' }">
                    {{ tab.name }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import GlassPageHeader from '@/components/glass/GlassPageHeader.vue'
import ImageUploadBox from '@/components/common/ImageUploadBox.vue'
import { Refresh, Search, Top, Bottom, Delete, HomeFilled, ChatDotRound, User, Position, Menu } from '@element-plus/icons-vue'
import { fetchRegions, fetchRegionTabbar, saveRegionTabbar } from '@/api/admin'

const DEFAULT_TABS = [
  { id: 'home', name: '首页', pagePath: 'pages/tabbar/index/index', action: '', iconPath: '/static/tabbar/home.png', selectedIconPath: '/static/tabbar/home-active.png', color: '#8A8A8A', selectedColor: '#1677ff', width: 24, height: 24, fontSize: 12, avatarMode: false, hideText: false, enabled: true, sortOrder: 0, navType: 'bottom' },
  { id: 'circle', name: '圈子', pagePath: 'pages/tabbar/containers/containers', action: '', iconPath: '/static/tabbar/circle.png', selectedIconPath: '/static/tabbar/circle-active.png', color: '#8A8A8A', selectedColor: '#1677ff', width: 24, height: 24, fontSize: 12, avatarMode: false, hideText: false, enabled: true, sortOrder: 1, navType: 'bottom' },
  { id: 'publish', name: '发布', pagePath: '', action: 'publish', iconPath: '/static/tabbar/publish.png', selectedIconPath: '/static/tabbar/publish-active.png', color: '#8A8A8A', selectedColor: '#1677ff', width: 24, height: 24, fontSize: 12, avatarMode: false, hideText: false, enabled: true, sortOrder: 2, navType: 'bottom' },
  { id: 'message', name: '消息', pagePath: 'pages/tabbar/news/news', action: '', iconPath: '/static/tabbar/message.png', selectedIconPath: '/static/tabbar/message-active.png', color: '#8A8A8A', selectedColor: '#1677ff', width: 24, height: 24, fontSize: 12, avatarMode: false, hideText: false, enabled: true, sortOrder: 3, navType: 'bottom' },
  { id: 'mine', name: '我的', pagePath: 'pages/tabbar/auth/PersonalHomepage', action: '', iconPath: '/static/tabbar/mine.png', selectedIconPath: '/static/tabbar/mine-active.png', color: '#8A8A8A', selectedColor: '#1677ff', width: 24, height: 24, fontSize: 12, avatarMode: false, hideText: false, enabled: true, sortOrder: 4, navType: 'bottom' }
]

const DEFAULT_CONFIG = {
  color: '#8A8A8A',
  selectedColor: '#1677ff',
  backgroundColor: '#ffffff',
  borderStyle: 'black',
  list: JSON.parse(JSON.stringify(DEFAULT_TABS))
}

const route = useRoute()
const regions = ref<any[]>([])
const tabbarCache = ref<Record<string, any>>({})
const search = ref('')
const drawerVisible = ref(false)
const editingRegion = ref<any>(null)
const saving = ref(false)

const editConfig = reactive({
  color: '#8A8A8A',
  selectedColor: '#1677ff',
  backgroundColor: '#ffffff',
  borderStyle: 'black',
  list: [] as any[]
})

const filteredRegions = computed(() => {
  if (!search.value.trim()) return regions.value
  const q = search.value.trim().toLowerCase()
  return regions.value.filter(r => (r.name || '').toLowerCase().includes(q))
})

function getTabIcon(id: string) {
  const map: Record<string, any> = { home: HomeFilled, circle: Menu, publish: Position, message: ChatDotRound, mine: User }
  return map[id] || Menu
}

function getPreviewTabs(regionId: string) {
  const config = tabbarCache.value[regionId]
  const list = config?.list || DEFAULT_TABS
  return list.filter((t: any) => t.enabled !== false).slice(0, 5)
}

function getTabCount(regionId: string) {
  const config = tabbarCache.value[regionId]
  return (config?.list || DEFAULT_TABS).length
}

function getEnabledCount(regionId: string) {
  const config = tabbarCache.value[regionId]
  return (config?.list || DEFAULT_TABS).filter((t: any) => t.enabled !== false).length
}

async function loadRegions() {
  regions.value = await fetchRegions()
  for (const r of regions.value) {
    try {
      const data = await fetchRegionTabbar(r.id)
      if (data?.config) {
        tabbarCache.value[r.id] = data.config
      }
    } catch {
      // 区域未配置，使用默认
    }
  }
  const preferredId = String(
    route.query.regionId ||
    localStorage.getItem('LM_SELECTED_REGION_ID') ||
    localStorage.getItem('selectedRegionId') ||
    ''
  )
  if (preferredId) {
    const target = regions.value.find(r => String(r.id) === preferredId)
    if (target && !drawerVisible.value) {
      await openEditor(target)
    }
  }
}

async function openEditor(region: any) {
  editingRegion.value = region
  const cached = tabbarCache.value[region.id]
  if (cached?.list) {
    editConfig.color = cached.color || '#8A8A8A'
    editConfig.selectedColor = cached.selectedColor || '#1677ff'
    editConfig.backgroundColor = cached.backgroundColor || '#ffffff'
    editConfig.borderStyle = cached.borderStyle || 'black'
    editConfig.list = JSON.parse(JSON.stringify(cached.list))
  } else {
    resetToDefault()
  }
  drawerVisible.value = true
}

function resetToDefault() {
  editConfig.color = DEFAULT_CONFIG.color
  editConfig.selectedColor = DEFAULT_CONFIG.selectedColor
  editConfig.backgroundColor = DEFAULT_CONFIG.backgroundColor
  editConfig.borderStyle = DEFAULT_CONFIG.borderStyle
  editConfig.list = JSON.parse(JSON.stringify(DEFAULT_TABS))
}

function addTab() {
  if (editConfig.list.length >= 5) return
  editConfig.list.push({
    id: `tab_${Date.now()}`,
    name: '新导航',
    pagePath: '',
    action: '',
    iconPath: '',
    selectedIconPath: '',
    color: editConfig.color,
    selectedColor: editConfig.selectedColor,
    width: 24,
    height: 24,
    fontSize: 12,
    avatarMode: false,
    hideText: false,
    enabled: true,
    sortOrder: editConfig.list.length,
    navType: 'bottom'
  })
}

function moveTab(idx: number, dir: number) {
  const target = idx + dir
  if (target < 0 || target >= editConfig.list.length) return
  const tmp = editConfig.list[idx]
  editConfig.list[idx] = editConfig.list[target]
  editConfig.list[target] = tmp
}

async function saveConfig() {
  if (!editingRegion.value) return
  saving.value = true
  try {
    const config = {
      color: editConfig.color,
      selectedColor: editConfig.selectedColor,
      backgroundColor: editConfig.backgroundColor,
      borderStyle: editConfig.borderStyle,
      list: JSON.parse(JSON.stringify(editConfig.list))
    }
    await saveRegionTabbar(editingRegion.value.id, config)
    tabbarCache.value[editingRegion.value.id] = config
    ElMessage.success('底部导航配置已保存')
    drawerVisible.value = false
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

onMounted(loadRegions)
</script>

<style scoped lang="scss">
.search-bar {
  margin-bottom: 0;
}
.search-bar .card-body {
  padding: 16px 20px;
}

.region-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 20px;
}

.region-card .card-header {
  padding: 16px 20px;
}
.region-card .card-body {
  padding: 0 20px 16px;
}
.region-card .card-footer {
  padding: 0 20px 16px;
}

.region-info {
  display: flex;
  align-items: center;
  gap: 12px;
}
.region-logo {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: linear-gradient(135deg, #dbeafe, #60a5fa);
  display: grid;
  place-items: center;
  font-weight: 900;
  color: #1f6fff;
  font-size: 18px;
  flex-shrink: 0;
}
.region-name {
  font-weight: 900;
  font-size: 15px;
}
.region-code {
  color: #94a3b8;
  font-size: 12px;
  margin-top: 2px;
}

.tabbar-preview {
  margin-bottom: 8px;
}
.tabbar-phone {
  background: #f8fafc;
  border-radius: 12px;
  padding: 10px;
}
.tabbar-bar {
  display: flex;
  justify-content: space-around;
  align-items: center;
  background: #fff;
  border-radius: 10px;
  padding: 8px 4px;
}
.tabbar-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 0;
}
.tabbar-item.disabled {
  opacity: 0.4;
}
.tabbar-icon {
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
}
.tabbar-text {
  font-size: 10px;
  color: #64748b;
  white-space: nowrap;
}

.tabbar-summary {
  color: #94a3b8;
  font-size: 12px;
}

/* Editor */
.editor-layout {
  display: grid;
  grid-template-columns: 1fr 260px;
  gap: 24px;
  height: calc(100vh - 120px);
}

.editor-form {
  overflow-y: auto;
  padding-right: 4px;
}

.editor-section {
  margin-bottom: 24px;
}
.editor-section-title {
  font-weight: 900;
  font-size: 14px;
  margin-bottom: 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.style-row {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
}
.style-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.style-field label {
  font-size: 12px;
  color: #64748b;
  font-weight: 700;
}

.tab-list {
  display: grid;
  gap: 12px;
}
.tab-editor-item {
  border: 1px solid rgba(226, 232, 240, .7);
  border-radius: 14px;
  overflow: hidden;
  background: rgba(255, 255, 255, .6);
}
.tab-editor-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: rgba(248, 250, 252, .8);
  border-bottom: 1px solid rgba(226, 232, 240, .5);
}
.tab-drag {
  cursor: grab;
  color: #94a3b8;
  user-select: none;
}
.tab-label {
  font-weight: 800;
  font-size: 13px;
  flex: 1;
}
.tab-actions {
  display: flex;
  gap: 4px;
}
.tab-editor-body {
  padding: 14px;
  display: grid;
  gap: 10px;
}
.field-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.field-item {
  flex: 1;
  min-width: 120px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.field-item.small {
  min-width: 80px;
  flex: 0 0 auto;
}
.field-item.toggle {
  min-width: auto;
  flex-direction: row;
  align-items: center;
  gap: 6px;
}
.field-item label {
  font-size: 11px;
  color: #64748b;
  font-weight: 700;
}

.tab-icon-upload-grid {
  align-items: flex-start;
}

.empty-tabs {
  text-align: center;
  color: #94a3b8;
  padding: 24px;
  font-size: 13px;
}

.editor-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding-top: 16px;
  border-top: 1px solid rgba(226, 232, 240, .5);
}

/* Preview */
.editor-preview {
  position: sticky;
  top: 0;
}
.preview-title {
  font-weight: 900;
  font-size: 14px;
  margin-bottom: 12px;
}
.preview-phone {
  width: 220px;
  margin: 0 auto;
  border-radius: 28px;
  border: 2px solid #1f6fff;
  background: #fff;
  overflow: hidden;
  box-shadow: 0 12px 32px rgba(37, 99, 235, .12);
}
.preview-content {
  height: 320px;
  background: linear-gradient(180deg, #f0f7ff, #fff);
  display: grid;
  place-items: center;
}
.preview-placeholder {
  color: #94a3b8;
  font-size: 12px;
}
.preview-tabbar {
  display: flex;
  justify-content: space-around;
  align-items: center;
  padding: 6px 2px 10px;
  border-top: 1px solid rgba(226, 232, 240, .5);
}
.preview-tab-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 0;
}
.preview-tab-item.disabled {
  opacity: 0.3;
}
.preview-tab-icon {
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
}
.preview-tab-text {
  white-space: nowrap;
  font-weight: 700;
}

.empty-state {
  padding: 60px 20px;
  text-align: center;
}

@media (max-width: 1100px) {
  .region-grid {
    grid-template-columns: 1fr;
  }
  .editor-layout {
    grid-template-columns: 1fr;
  }
  .editor-preview {
    display: none;
  }
}
</style>
