<template>
  <div class="page-shell">
    <PageHeader title="消息页布局配置">
      <template #actions>
        <el-select v-model="selectedRegion" placeholder="选择区域" style="width: 200px" @change="loadLayout">
          <el-option label="全局配置" value="" />
          <el-option v-for="region in regions" :key="region.id" :label="region.name" :value="region.id" />
        </el-select>
        <el-button type="primary" @click="saveLayout">保存配置</el-button>
      </template>
    </PageHeader>

    <div class="config-grid">
      <div class="glass-card">
        <h3>组件配置</h3>
        <div class="component-list">
          <div v-for="comp in layout.components" :key="comp.id" class="component-item">
            <div class="component-info">
              <el-icon><component :is="getIcon(comp.type)" /></el-icon>
              <span>{{ getComponentName(comp.type) }}</span>
            </div>
            <el-switch v-model="comp.enabled" />
          </div>
        </div>
      </div>

      <div class="glass-card">
        <h3>显示设置</h3>
        <el-form label-position="top">
          <el-form-item label="显示未读消息数">
            <el-switch v-model="layout.settings.showUnreadCount" />
          </el-form-item>
          <el-form-item label="显示消息预览">
            <el-switch v-model="layout.settings.showMessagePreview" />
          </el-form-item>
        </el-form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { ChatDotRound, User, Bell, Service, Notification } from '@element-plus/icons-vue'
import { request } from '@/api/request'
import PageHeader from '@/components/common/PageHeader.vue'

const selectedRegion = ref('')
const regions = ref<any[]>([])
const layout = reactive<any>({
  components: [
    { id: 'private-chat', type: 'private-chat', enabled: true, config: {}, order: 0 },
    { id: 'group-chat', type: 'group-chat', enabled: true, config: {}, order: 1 },
    { id: 'system-notice', type: 'system-notice', enabled: true, config: {}, order: 2 },
    { id: 'customer-service', type: 'customer-service', enabled: true, config: {}, order: 3 },
    { id: 'official-notice', type: 'official-notice', enabled: true, config: {}, order: 4 },
  ],
  settings: { showUnreadCount: true, showMessagePreview: true },
})

const componentNames: Record<string, string> = {
  'private-chat': '私信入口',
  'group-chat': '群聊入口',
  'system-notice': '系统通知',
  'customer-service': '客服入口',
  'official-notice': '官方公告',
}

const getComponentName = (type: string) => componentNames[type] || type
const getIcon = (type: string) => {
  const map: Record<string, any> = {
    'private-chat': ChatDotRound,
    'group-chat': User,
    'system-notice': Bell,
    'customer-service': Service,
    'official-notice': Notification,
  }
  return map[type] || Bell
}

const loadLayout = async () => {
  try {
    const regionId = selectedRegion.value || 'global'
    const res = await request.get(`/admin/layout/message/${regionId}`)
    if (res.data?.config) {
      Object.assign(layout, res.data.config)
    }
  } catch (error) {
    console.error('加载布局失败', error)
    ElMessage.warning('加载布局数据失败')
  }
}

const saveLayout = async () => {
  try {
    const regionId = selectedRegion.value || 'global'
    await request.put(`/admin/layout/message/${regionId}`, layout)
    ElMessage.success('配置已保存')
  } catch (error) {
    ElMessage.error('保存失败')
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
.config-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
.glass-card { background: rgba(255,255,255,0.8); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.3); border-radius: 10px; padding: 20px; }
.glass-card h3 { margin-bottom: 16px; font-size: 16px; font-weight: 600; }
.component-list { display: flex; flex-direction: column; gap: 12px; }
.component-item { display: flex; justify-content: space-between; align-items: center; padding: 12px; background: #f5f7fa; border-radius: 6px; }
.component-info { display: flex; align-items: center; gap: 8px; }
</style>
