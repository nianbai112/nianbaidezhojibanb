<template>
  <div class="page-container">
    <div class="page-header">
      <h2>我的页面布局配置</h2>
      <div class="header-actions">
        <el-select v-model="selectedRegion" placeholder="选择区域" style="width: 200px" @change="loadLayout">
          <el-option label="全局配置" value="" />
          <el-option v-for="region in regions" :key="region.id" :label="region.name" :value="region.id" />
        </el-select>
        <el-button type="primary" @click="saveLayout">保存配置</el-button>
      </div>
    </div>

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
          <el-form-item label="显示编辑资料">
            <el-switch v-model="layout.settings.showEditProfile" />
          </el-form-item>
          <el-form-item label="显示二维码">
            <el-switch v-model="layout.settings.showQrcode" />
          </el-form-item>
        </el-form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { User, Wallet, Tickets, Checked, Shop, Van, Share, Calendar, Setting } from '@element-plus/icons-vue'
import { request } from '@/api/request'

const selectedRegion = ref('')
const regions = ref<any[]>([])
const layout = reactive<any>({
  components: [
    { id: 'user-card', type: 'user-card', enabled: true, config: { showAvatar: true, showName: true }, order: 0 },
    { id: 'wallet', type: 'wallet', enabled: true, config: {}, order: 1 },
    { id: 'orders', type: 'orders', enabled: true, config: { types: ['mall', 'errand', 'groupbuy'] }, order: 2 },
    { id: 'certification', type: 'certification', enabled: true, config: {}, order: 3 },
    { id: 'merchant-entry', type: 'merchant-entry', enabled: true, config: {}, order: 4 },
    { id: 'rider-entry', type: 'rider-entry', enabled: true, config: {}, order: 5 },
    { id: 'share-earn', type: 'share-earn', enabled: true, config: {}, order: 6 },
    { id: 'sign-in', type: 'sign-in', enabled: true, config: {}, order: 7 },
    { id: 'settings', type: 'settings', enabled: true, config: {}, order: 8 },
  ],
  settings: { showEditProfile: true, showQrcode: true },
})

const componentNames: Record<string, string> = {
  'user-card': '用户资料卡',
  'wallet': '钱包入口',
  'orders': '我的订单',
  'certification': '认证入口',
  'merchant-entry': '商家入驻',
  'rider-entry': '骑手中心',
  'share-earn': '分享赚钱',
  'sign-in': '签到入口',
  'settings': '设置入口',
}

const getComponentName = (type: string) => componentNames[type] || type
const getIcon = (type: string) => {
  const map: Record<string, any> = {
    'user-card': User,
    'wallet': Wallet,
    'orders': Tickets,
    'certification': Checked,
    'merchant-entry': Shop,
    'rider-entry': Van,
    'share-earn': Share,
    'sign-in': Calendar,
    'settings': Setting,
  }
  return map[type] || Setting
}

const loadLayout = async () => {
  try {
    const regionId = selectedRegion.value || 'global'
    const res = await request.get(`/admin/layout/profile/${regionId}`)
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
    await request.put(`/admin/layout/profile/${regionId}`, layout)
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
.page-container { padding: 20px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
.header-actions { display: flex; gap: 12px; align-items: center; }
.config-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
.glass-card { background: rgba(255,255,255,0.8); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.3); border-radius: 12px; padding: 20px; }
.glass-card h3 { margin-bottom: 16px; font-size: 16px; font-weight: 600; }
.component-list { display: flex; flex-direction: column; gap: 12px; }
.component-item { display: flex; justify-content: space-between; align-items: center; padding: 12px; background: #f5f7fa; border-radius: 8px; }
.component-info { display: flex; align-items: center; gap: 8px; }
</style>
