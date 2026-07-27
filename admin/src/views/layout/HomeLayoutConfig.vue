<template>
  <div class="page-shell">
    <PageHeader title="首页布局配置">
      <template #actions>
        <el-select v-model="selectedRegion" placeholder="选择区域" style="width: 200px" @change="loadLayout">
          <el-option label="全局配置" value="" />
          <el-option v-for="region in regions" :key="region.id" :label="region.name" :value="region.id" />
        </el-select>
        <el-button @click="previewLayout" :disabled="!hasDraft">预览</el-button>
        <el-button type="success" @click="publishLayout" :disabled="!hasDraft">发布</el-button>
        <el-button type="primary" @click="saveDraft">保存草稿</el-button>
      </template>
    </PageHeader>

    <div class="layout-builder">
      <div class="component-panel glass-card">
        <h3>组件库</h3>
        <div class="component-list">
          <div v-for="comp in availableComponents" :key="comp.type" class="component-item" draggable="true" @dragstart="dragStart($event, comp)">
            <el-icon><component :is="comp.icon" /></el-icon>
            <span>{{ comp.name }}</span>
          </div>
        </div>
      </div>

      <div class="preview-panel glass-card">
        <h3>手机预览</h3>
        <div class="phone-frame">
          <div class="phone-screen">
            <div v-for="(comp, index) in layout.components" :key="comp.id" class="preview-component"
              :class="{ selected: selectedComponent?.id === comp.id }"
              @click="selectComponent(comp)">
              <div class="component-header">
                <span>{{ getComponentName(comp.type) }}</span>
                <div class="component-actions">
                  <el-button size="small" circle @click.stop="moveComponent(index, -1)" :disabled="index === 0">
                    <el-icon><Top /></el-icon>
                  </el-button>
                  <el-button size="small" circle @click.stop="moveComponent(index, 1)" :disabled="index === layout.components.length - 1">
                    <el-icon><Bottom /></el-icon>
                  </el-button>
                  <el-button size="small" circle type="danger" @click.stop="removeComponent(index)">
                    <el-icon><Delete /></el-icon>
                  </el-button>
                </div>
              </div>
              <div class="component-preview">
                {{ comp.type === 'navbar' ? '顶部导航' : comp.type === 'search' ? '搜索框' : comp.type }}
              </div>
            </div>
            <div v-if="layout.components.length === 0" class="empty-preview">
              <p>拖拽组件到此处</p>
            </div>
          </div>
        </div>
      </div>

      <div class="config-panel glass-card">
        <h3>属性配置</h3>
        <div v-if="selectedComponent" class="config-form">
          <el-form label-position="top">
            <el-form-item label="启用状态">
              <el-switch v-model="selectedComponent.enabled" />
            </el-form-item>
            <template v-if="selectedComponent.type === 'navbar'">
              <el-form-item label="标题">
                <el-input v-model="selectedComponent.config.title" />
              </el-form-item>
              <el-form-item label="显示返回按钮">
                <el-switch v-model="selectedComponent.config.showBack" />
              </el-form-item>
            </template>
            <template v-if="selectedComponent.type === 'search'">
              <el-form-item label="占位文字">
                <el-input v-model="selectedComponent.config.placeholder" />
              </el-form-item>
            </template>
            <template v-if="selectedComponent.type === 'banner'">
              <el-form-item label="自动播放">
                <el-switch v-model="selectedComponent.config.autoplay" />
              </el-form-item>
              <el-form-item label="播放间隔(ms)">
                <el-input-number v-model="selectedComponent.config.interval" :min="1000" :step="1000" />
              </el-form-item>
            </template>
            <template v-if="selectedComponent.type === 'grid-menu'">
              <el-form-item label="列数">
                <el-input-number v-model="selectedComponent.config.columns" :min="3" :max="5" />
              </el-form-item>
            </template>
            <template v-if="selectedComponent.type === 'hot-posts'">
              <el-form-item label="显示数量">
                <el-input-number v-model="selectedComponent.config.limit" :min="1" :max="20" />
              </el-form-item>
            </template>
            <template v-if="selectedComponent.type === 'feed'">
              <el-form-item label="信息流样式">
                <el-select v-model="selectedComponent.config.style" style="width: 100%">
                  <el-option label="瀑布流" value="waterfall" />
                  <el-option label="列表" value="list" />
                  <el-option label="双列" value="grid" />
                </el-select>
              </el-form-item>
            </template>
          </el-form>
        </div>
        <div v-else class="no-selection">
          <p>选择组件以配置属性</p>
        </div>
      </div>
    </div>

    <div class="version-history glass-card">
      <h3>版本历史</h3>
      <el-table :data="versions" v-loading="loadingVersions">
        <el-table-column prop="version" label="版本" width="80" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'published' ? 'success' : row.status === 'draft' ? 'warning' : 'info'" size="small">
              {{ row.status === 'published' ? '已发布' : row.status === 'draft' ? '草稿' : '已归档' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="180" />
        <el-table-column label="操作" width="120">
          <template #default="{ row }">
            <el-button size="small" @click="rollbackVersion(row)" :disabled="row.status === 'published'">回滚</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Top, Bottom, Delete, House, Search, Picture, Grid, Bell, TrendCharts, Trophy, Shop, List } from '@element-plus/icons-vue'
import { request } from '@/api/request'
import PageHeader from '@/components/common/PageHeader.vue'

const selectedRegion = ref('')
const regions = ref<any[]>([])
const layout = reactive<any>({ components: [], settings: {} })
const selectedComponent = ref<any>(null)
const versions = ref<any[]>([])
const loadingVersions = ref(false)

const hasDraft = computed(() => layout.components.length > 0)

const availableComponents = [
  { type: 'navbar', name: '顶部导航', icon: 'House' },
  { type: 'search', name: '搜索框', icon: 'Search' },
  { type: 'banner', name: '轮播图', icon: 'Picture' },
  { type: 'grid-menu', name: '金刚区', icon: 'Grid' },
  { type: 'announcement', name: '公告', icon: 'Bell' },
  { type: 'hot-posts', name: '热门精选', icon: 'TrendCharts' },
  { type: 'ranking', name: '榜单', icon: 'Trophy' },
  { type: 'recommend-merchant', name: '推荐商家', icon: 'Shop' },
  { type: 'feed', name: '信息流', icon: 'List' },
]

const getComponentName = (type: string) => {
  const comp = availableComponents.find(c => c.type === type)
  return comp?.name || type
}

const dragStart = (event: DragEvent, comp: any) => {
  event.dataTransfer?.setData('component', JSON.stringify(comp))
}

const selectComponent = (comp: any) => {
  selectedComponent.value = comp
}

const moveComponent = (index: number, direction: number) => {
  const newIndex = index + direction
  if (newIndex < 0 || newIndex >= layout.components.length) return
  const temp = layout.components[index]
  layout.components[index] = layout.components[newIndex]
  layout.components[newIndex] = temp
}

const removeComponent = (index: number) => {
  layout.components.splice(index, 1)
  if (selectedComponent.value?.id === layout.components[index]?.id) {
    selectedComponent.value = null
  }
}

const loadLayout = async () => {
  try {
    const regionId = selectedRegion.value || 'global'
    const res = await request.get(`/admin/layout/home/${regionId}`)
    if (res.data?.config) {
      Object.assign(layout, res.data.config)
    }
    await loadVersions()
  } catch (error) {
    console.error('加载布局失败', error)
    ElMessage.warning('加载布局数据失败')
  }
}

const saveDraft = async () => {
  try {
    const regionId = selectedRegion.value || 'global'
    await request.put(`/admin/layout/home/${regionId}`, layout)
    ElMessage.success('草稿已保存')
    await loadVersions()
  } catch (error) {
    ElMessage.error('保存失败')
  }
}

const previewLayout = async () => {
  try {
    const regionId = selectedRegion.value || 'global'
    await request.post(`/admin/layout/home/${regionId}/preview`, layout)
    ElMessage.success('预览请求已发送，请在小程序端查看')
  } catch (error) {
    ElMessage.error('预览失败')
  }
}

const publishLayout = async () => {
  try {
    await ElMessageBox.confirm('确定发布当前布局吗？', '确认发布', { type: 'warning' })
    const regionId = selectedRegion.value || 'global'
    await request.post(`/admin/layout/home/${regionId}/publish`)
    ElMessage.success('布局已发布')
    await loadVersions()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('发布失败')
    }
  }
}

const loadVersions = async () => {
  loadingVersions.value = true
  try {
    const regionId = selectedRegion.value || 'global'
    const res = await request.get(`/admin/layout/home/${regionId}/versions`)
    versions.value = res.data?.list || []
  } catch (error) {
    console.error('加载版本失败', error)
    ElMessage.warning('加载版本列表失败')
  } finally {
    loadingVersions.value = false
  }
}

const rollbackVersion = async (version: any) => {
  try {
    await ElMessageBox.confirm(`确定回滚到版本 ${version.version} 吗？`, '确认回滚', { type: 'warning' })
    const regionId = selectedRegion.value || 'global'
    await request.post(`/admin/layout/home/${regionId}/rollback`, { versionId: version.id })
    ElMessage.success('已回滚')
    await loadLayout()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('回滚失败')
    }
  }
}

const loadRegions = async () => {
  try {
    const res = await request.get('/admin/regions')
    regions.value = res.data?.list || []
  } catch (error) {
    console.error('加载区域失败', error)
    ElMessage.warning('加载区域列表失败，区域选择不可用')
  }
}

onMounted(() => {
  loadRegions()
  loadLayout()
})
</script>

<style scoped>
.layout-builder {
  display: grid;
  grid-template-columns: 250px 320px 1fr;
  gap: 20px;
  margin-bottom: 24px;
}

.component-panel,
.preview-panel,
.config-panel {
  padding: 16px;
}

.component-panel h3,
.preview-panel h3,
.config-panel h3 {
  margin-bottom: 16px;
  font-size: 16px;
  font-weight: 600;
}

.component-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.component-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: #f5f7fa;
  border-radius: 6px;
  cursor: grab;
  transition: all 0.2s;
}

.component-item:hover {
  background: #e8eaed;
}

.phone-frame {
  width: 280px;
  height: 500px;
  border: 2px solid #333;
  border-radius: 24px;
  overflow: hidden;
  margin: 0 auto;
  background: #fff;
}

.phone-screen {
  height: 100%;
  overflow-y: auto;
  padding: 12px;
}

.preview-component {
  padding: 8px;
  margin-bottom: 8px;
  border: 1px dashed #ddd;
  border-radius: 6px;
  cursor: pointer;
}

.preview-component.selected {
  border-color: #409eff;
  background: #ecf5ff;
}

.component-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.component-header span {
  font-size: 12px;
  font-weight: 500;
}

.component-actions {
  display: flex;
  gap: 4px;
}

.component-preview {
  padding: 8px;
  background: #f9f9f9;
  border-radius: 6px;
  font-size: 12px;
  color: #666;
  text-align: center;
}

.empty-preview {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
  color: #999;
}

.config-form {
  max-height: 400px;
  overflow-y: auto;
}

.no-selection {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 200px;
  color: #999;
}

.version-history {
  padding: 16px;
}

.version-history h3 {
  margin-bottom: 16px;
}

.glass-card {
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 10px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
}
</style>
