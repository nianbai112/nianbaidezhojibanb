<template>
  <div class="section-card glass-card">
    <div class="section-head">
      <div class="card-title">我的页面入口配置</div>
      <div>
        <el-button size="small" @click="handleReset">恢复默认</el-button>
        <el-button size="small" type="primary" @click="addItem">添加入口</el-button>
      </div>
    </div>
    <div class="form-tip" style="margin-bottom:16px">控制小程序"我的"页面的功能入口列表。</div>
    <div class="sortable-list">
      <div v-for="(item, idx) in items" :key="item.id" class="sortable-item card-item">
        <div class="sortable-grip">☰</div>
        <div class="sortable-content card-fields">
          <el-input v-model="item.title" size="small" placeholder="标题" style="width:100px" />
          <el-input v-model="item.icon" size="small" placeholder="图标类名" style="width:120px" />
          <el-input v-model="item.path" size="small" placeholder="跳转路径" style="width:180px" />
        </div>
        <el-switch v-model="item.enabled" size="small" />
        <div class="sortable-actions">
          <el-button size="small" circle :disabled="idx === 0" @click="moveItem(idx, -1)">
            <el-icon><Top /></el-icon>
          </el-button>
          <el-button size="small" circle :disabled="idx === items.length - 1" @click="moveItem(idx, 1)">
            <el-icon><Bottom /></el-icon>
          </el-button>
          <el-button size="small" circle type="danger" @click="removeItem(idx)">
            <el-icon><Delete /></el-icon>
          </el-button>
        </div>
      </div>
    </div>
    <div v-if="!items.length" class="empty-hint">暂无入口配置，点击"添加入口"或"恢复默认"</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Top, Bottom, Delete } from '@element-plus/icons-vue'

interface ProfileItem {
  id: string
  title: string
  icon: string
  path: string
  enabled: boolean
  sortOrder: number
  requireLogin: boolean
}

interface Props {
  items?: ProfileItem[]
  defaultItems?: ProfileItem[]
}

const props = withDefaults(defineProps<Props>(), {
  items: () => [],
  defaultItems: () => [
    { id: 'orders', title: '我的订单', icon: 'icon-dingdan', path: '/pagesA/order/order', enabled: true, sortOrder: 0, requireLogin: true },
    { id: 'wallet', title: '我的钱包', icon: 'icon-qianbao', path: '/pagesA/withdraw/withdraw', enabled: true, sortOrder: 1, requireLogin: true },
    { id: 'share', title: '分享赚赏', icon: 'icon-fenxiang', path: '/pagesA/news/SharingCourtesy/SharingCourtesy', enabled: true, sortOrder: 2, requireLogin: true },
    { id: 'rider', title: '骑手中心', icon: 'icon-qishou', path: '/pagesA/Rider/Rider', enabled: true, sortOrder: 3, requireLogin: true },
    { id: 'merchant', title: '商家管理', icon: 'icon-shangjia', path: '/pagesA/MerchantManagement/managerial', enabled: true, sortOrder: 4, requireLogin: true },
    { id: 'settings', title: '设置', icon: 'icon-shezhi', path: '/pages/auth/settings/settings', enabled: true, sortOrder: 5, requireLogin: false }
  ]
})

const emit = defineEmits<{
  'update:items': [value: ProfileItem[]]
}>()

const items = computed({
  get: () => props.items,
  set: (val) => emit('update:items', val)
})

function moveItem(idx: number, dir: number) {
  const target = idx + dir
  if (target < 0 || target >= items.value.length) return

  const newItems = [...items.value]
  const tmp = newItems[idx]
  newItems[idx] = newItems[target]
  newItems[target] = tmp
  items.value = newItems
}

function addItem() {
  const newItem: ProfileItem = {
    id: `item_${Date.now()}`,
    title: '新入口',
    icon: '',
    path: '',
    enabled: true,
    sortOrder: items.value.length,
    requireLogin: true
  }
  items.value = [...items.value, newItem]
}

function removeItem(idx: number) {
  items.value = items.value.filter((_, i) => i !== idx)
}

function handleReset() {
  items.value = JSON.parse(JSON.stringify(props.defaultItems))
}
</script>

<style scoped lang="scss">
.section-card {
  padding: 0;
}

.section-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 20px 24px 4px;
}

.form-tip {
  color: #94a3b8;
  font-size: 12px;
  margin-top: 4px;
  padding: 0 24px;
}

.sortable-list {
  display: grid;
  gap: 8px;
  padding: 0 24px 24px;
}

.sortable-item {
  display: grid;
  grid-template-columns: 28px 1fr auto 100px;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.66);
  border: 1px solid rgba(226, 232, 240, 0.6);
}

.sortable-grip {
  cursor: grab;
  color: #94a3b8;
  font-size: 16px;
  user-select: none;
}

.sortable-content {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.card-fields {
  flex-wrap: wrap;
}

.sortable-actions {
  display: flex;
  gap: 4px;
}

.empty-hint {
  text-align: center;
  color: #94a3b8;
  padding: 24px;
  font-size: 13px;
}
</style>
