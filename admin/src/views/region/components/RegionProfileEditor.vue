<template>
  <div class="section-card glass-card profile-editor">
    <div class="section-head">
      <div>
        <div class="card-title">我的页面入口配置</div>
        <div class="form-tip">这里会显示在小程序“我的”页头像下方的横向功能卡片，必须配置图片、文案和跳转。</div>
      </div>
      <div class="head-actions">
        <el-button size="small" @click="handleReset">恢复默认</el-button>
        <el-button size="small" type="primary" @click="addItem">添加入口</el-button>
      </div>
    </div>

    <div v-if="items.length" class="entry-list">
      <div v-for="(item, idx) in items" :key="item.id || idx" class="entry-card">
        <div class="entry-order">
          <span>{{ idx + 1 }}</span>
          <div class="drag-mark">☰</div>
        </div>

        <div class="entry-image">
          <ImageUploadBox
            v-model="item.main_image"
            scene="profile-entry"
            shape="square"
            placeholder="上传入口图"
            tip="建议 160x160"
            :max-size="2"
          />
        </div>

        <div class="entry-fields">
          <div class="field-row">
            <el-input v-model="item.title" size="small" placeholder="入口标题，如：我的订单" />
            <el-input v-model="item.description" size="small" placeholder="副标题，如：查看订单和售后" />
          </div>
          <div class="field-row">
            <el-select v-model="item.type" size="small" placeholder="跳转方式">
              <el-option label="小程序内部页面" value="internal_jump" />
              <el-option label="外部小程序" value="external_jump" />
              <el-option label="网页 WebView" value="web_page" />
              <el-option label="弹窗提醒" value="popup" />
            </el-select>
            <el-select v-model="item.navigation_permission" size="small" placeholder="可见人群">
              <el-option label="所有用户可见" value="unlimited" />
              <el-option label="区域管理员可见" value="region_manager" />
              <el-option label="商家可见" value="merchant" />
              <el-option label="商家店主可见" value="merchant_owner" />
              <el-option label="仅宿舍小店店主可见" value="dorm_shop_owner" />
              <el-option label="仅圈主可见" value="circle_owner" />
              <el-option label="仅骑手可见" value="delivery_rider" />
            </el-select>
          </div>
          <div class="field-row">
            <el-input v-model="item.path" size="small" placeholder="跳转路径，如 /pagesA/order/order" />
            <el-input v-if="item.type === 'external_jump'" v-model="item.appId" size="small" placeholder="外部小程序 AppID" />
            <el-input v-else v-model="item.query" size="small" placeholder="Query 参数，可选" />
          </div>
        </div>

        <div class="entry-control">
          <el-switch v-model="item.enabled" size="small" active-text="启用" inactive-text="隐藏" />
          <el-switch v-model="item.requireLogin" size="small" active-text="需登录" inactive-text="游客可见" />
          <div class="entry-actions">
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
    </div>

    <div v-else class="empty-hint">
      暂无入口配置，点击“添加入口”或“恢复默认”。没有入口时小程序会显示空白，不建议上线。
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Top, Bottom, Delete } from '@element-plus/icons-vue'
import ImageUploadBox from '@/components/common/ImageUploadBox.vue'

interface ProfileItem {
  id: string
  title: string
  description?: string
  icon?: string
  main_image?: string
  image?: string
  path: string
  query?: string
  appId?: string
  type: 'internal_jump' | 'external_jump' | 'web_page' | 'popup'
  navigation_permission?: 'unlimited' | 'region_manager' | 'merchant' | 'merchant_owner' | 'dorm_shop_owner' | 'circle_owner' | 'delivery_rider'
  enabled: boolean
  sortOrder: number
  requireLogin: boolean
}

interface Props {
  items?: ProfileItem[]
  defaultItems?: ProfileItem[]
}

const fallbackItems: ProfileItem[] = [
  { id: 'orders', title: '我的订单', description: '查看订单、配送和售后', icon: '', main_image: '/static/logo.jpg', path: '/pagesA/order/order', query: '', type: 'internal_jump', navigation_permission: 'unlimited', enabled: true, sortOrder: 0, requireLogin: true },
  { id: 'wallet', title: '我的钱包', description: '余额、提现和交易流水', icon: '', main_image: '/static/logo.jpg', path: '/pagesA/withdraw/withdraw', query: '', type: 'internal_jump', navigation_permission: 'unlimited', enabled: true, sortOrder: 1, requireLogin: true },
  { id: 'share', title: '分享有礼', description: '邀请同学加入本地生活圈', icon: '', main_image: '/static/logo.jpg', path: '/pagesA/news/SharingCourtesy/SharingCourtesy', query: '', type: 'internal_jump', navigation_permission: 'unlimited', enabled: true, sortOrder: 2, requireLogin: true },
  { id: 'merchant', title: '商家中心', description: '商家入驻与店铺管理', icon: '', main_image: '/static/logo.jpg', path: '/pagesA/MerchantManagement/managerial', query: '', type: 'internal_jump', navigation_permission: 'merchant', enabled: true, sortOrder: 3, requireLogin: true },
  { id: 'dorm_shop_owner', title: '宿舍小店', description: '商品、订单和营业设置', icon: '', main_image: '/static/logo.jpg', path: '/pagesA/DormShopOwner/DormShopOwner', query: '', type: 'internal_jump', navigation_permission: 'dorm_shop_owner', enabled: true, sortOrder: 4, requireLogin: true },
  { id: 'circle_manage', title: '圈子管理', description: '管理我创建的圈子', icon: '', main_image: '/static/logo.jpg', path: '/pages/B/circle-manage', query: '', type: 'internal_jump', navigation_permission: 'circle_owner', enabled: true, sortOrder: 5, requireLogin: true },
  { id: 'settings', title: '账号设置', description: '资料、隐私和系统设置', icon: '', main_image: '/static/logo.jpg', path: '/pages/auth/settings/settings', query: '', type: 'internal_jump', navigation_permission: 'unlimited', enabled: true, sortOrder: 6, requireLogin: false }
]

const props = withDefaults(defineProps<Props>(), {
  items: () => []
})

const emit = defineEmits<{
  'update:items': [value: ProfileItem[]]
}>()

const items = computed({
  get: () => props.items,
  set: (val) => emit('update:items', val.map((item, index) => ({ ...item, sortOrder: index })))
})

const defaultProfileItems = computed(() => (
  props.defaultItems && props.defaultItems.length ? props.defaultItems : fallbackItems
))

function moveItem(idx: number, dir: number) {
  const target = idx + dir
  if (target < 0 || target >= items.value.length) return
  const next = [...items.value]
  const tmp = next[idx]
  next[idx] = next[target]
  next[target] = tmp
  items.value = next
}

function addItem() {
  const newItem: ProfileItem = {
    id: `item_${Date.now()}`,
    title: '新入口',
    description: '',
    icon: '',
    main_image: '',
    path: '',
    query: '',
    appId: '',
    type: 'internal_jump',
    navigation_permission: 'unlimited',
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
  items.value = JSON.parse(JSON.stringify(defaultProfileItems.value))
}
</script>

<style scoped lang="scss">
.profile-editor {
  padding: 0;
}

.section-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  padding: 22px 24px 14px;
}

.head-actions {
  display: flex;
  gap: 10px;
  flex-shrink: 0;
}

.form-tip {
  color: var(--mx-sub);
  font-size: 13px;
  margin-top: 6px;
}

.entry-list {
  display: grid;
  gap: 14px;
  padding: 0 24px 24px;
}

.entry-card {
  display: grid;
  grid-template-columns: 46px 132px minmax(0, 1fr) 150px;
  gap: 16px;
  align-items: center;
  padding: 16px;
  border: 1px solid rgba(191, 207, 230, 0.72);
  border-radius: 14px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.92), rgba(248, 251, 255, 0.72));
}

.entry-order {
  display: grid;
  gap: 8px;
  justify-items: center;
  color: var(--mx-sub);

  span {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: #eaf2ff;
    color: var(--el-color-primary-dark-2);
    display: grid;
    place-items: center;
    font-weight: 800;
  }
}

.drag-mark {
  font-size: 15px;
  color: var(--mx-muted);
}

.entry-image {
  min-width: 0;
}

.entry-fields {
  display: grid;
  gap: 10px;
  min-width: 0;
}

.field-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.entry-control {
  display: grid;
  justify-items: end;
  gap: 12px;
}

.entry-actions {
  display: flex;
  gap: 6px;
}

.empty-hint {
  text-align: center;
  color: var(--mx-sub);
  padding: 28px 24px 34px;
  font-size: 14px;
}

@media (max-width: 1280px) {
  .entry-card {
    grid-template-columns: 36px 116px 1fr;
  }

  .entry-control {
    grid-column: 2 / 4;
    grid-template-columns: auto auto 1fr;
    align-items: center;
    justify-items: start;
  }
}

@media (max-width: 900px) {
  .section-head,
  .entry-card,
  .field-row {
    display: grid;
    grid-template-columns: 1fr;
  }

  .entry-control {
    grid-column: auto;
    grid-template-columns: 1fr;
  }
}
</style>
