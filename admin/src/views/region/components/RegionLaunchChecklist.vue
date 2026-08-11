<template>
  <div class="section-card glass-card">
    <div class="section-head">
      <div class="card-title">上线检查</div>
      <el-tag :type="statusType" effect="plain">{{ statusText }}</el-tag>
    </div>
    <div class="checklist">
      <div v-for="(item, idx) in checklist" :key="idx" class="check-item" :class="{ passed: item.passed, warning: !item.passed && item.required, optional: !item.passed && !item.required }">
        <div class="check-icon">
          <el-icon v-if="item.passed"><SuccessFilled /></el-icon>
          <el-icon v-else-if="item.required"><WarningFilled /></el-icon>
          <el-icon v-else><InfoFilled /></el-icon>
        </div>
        <div class="check-content">
          <div class="check-title">{{ item.title }}</div>
          <div class="check-desc">{{ item.description }}</div>
        </div>
        <el-button v-if="!item.passed && item.tab" size="small" @click="handleJump(item.tab)">
          去配置
        </el-button>
      </div>
    </div>
    <div class="check-summary">
      <div class="summary-item">
        <span class="summary-label">已完成</span>
        <span class="summary-value passed">{{ passedCount }}</span>
      </div>
      <div class="summary-item">
        <span class="summary-label">待完善</span>
        <span class="summary-value warning">{{ warningCount }}</span>
      </div>
      <div class="summary-item">
        <span class="summary-label">可选</span>
        <span class="summary-value optional">{{ optionalCount }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { SuccessFilled, WarningFilled, InfoFilled } from '@element-plus/icons-vue'

interface CheckItem {
  title: string
  description: string
  passed: boolean
  required: boolean
  tab?: string
}

interface Props {
  regionName?: string
  logo?: string
  coverImage?: string
  latitude?: number | null
  longitude?: number | null
  serviceRadius?: number
  homeTabs?: any[]
  tabbarList?: any[]
  shareTitle?: string
  shareImage?: string
  profileItems?: any[]
  homeLayout?: any
  messageLayout?: any
  profileLayout?: any
}

const props = withDefaults(defineProps<Props>(), {
  regionName: '',
  logo: '',
  coverImage: '',
  latitude: null,
  longitude: null,
  serviceRadius: 5000,
  homeTabs: () => [],
  tabbarList: () => [],
  shareTitle: '',
  shareImage: '',
  profileItems: () => [],
  homeLayout: null,
  messageLayout: null,
  profileLayout: null
})

const emit = defineEmits<{
  'jump': [tab: string]
}>()

const checklist = computed<CheckItem[]>(() => [
  {
    title: '区域名称已填写',
    description: '区域名称是小程序展示的基础信息',
    passed: !!props.regionName?.trim(),
    required: true,
    tab: 'basic'
  },
  {
    title: 'Logo 已上传',
    description: '区域 Logo 用于小程序内展示',
    passed: !!props.logo,
    required: true,
    tab: 'basic'
  },
  {
    title: '封面已上传',
    description: '区域封面用于列表页展示',
    passed: !!props.coverImage,
    required: true,
    tab: 'basic'
  },
  {
    title: '地图坐标已选择',
    description: '经纬度坐标用于定位区域位置',
    passed: !!props.latitude && !!props.longitude,
    required: true,
    tab: 'location'
  },
  {
    title: '服务半径已设置',
    description: '服务半径决定区域覆盖范围',
    passed: props.serviceRadius > 0,
    required: true,
    tab: 'location'
  },
  {
    title: '首页 Tabs 至少启用 2 个',
    description: '首页需要至少 2 个选项卡',
    passed: props.homeTabs.filter(t => t.enabled).length >= 2,
    required: true,
    tab: 'tabs'
  },
  {
    title: '底部导航 3-5 个',
    description: '底部导航栏需要 3-5 个导航项',
    passed: props.tabbarList.length >= 3 && props.tabbarList.length <= 5,
    required: true,
    tab: 'tabbar'
  },
  {
    title: '底部导航包含首页和我的',
    description: '建议底部导航必须包含首页和我的',
    passed: hasHomeAndMine.value,
    required: false,
    tab: 'tabbar'
  },
  {
    title: '分享标题已配置',
    description: '分享标题用于微信分享卡片',
    passed: !!props.shareTitle?.trim(),
    required: false,
    tab: 'share'
  },
  {
    title: '分享图片已配置',
    description: '分享图片用于微信分享卡片',
    passed: !!props.shareImage,
    required: false,
    tab: 'share'
  },
  {
    title: '我的页入口已配置',
    description: '我的页面需要至少一个功能入口',
    passed: props.profileItems.filter(i => i.enabled).length > 0,
    required: false,
    tab: 'profile'
  },
  {
    title: '首页布局已配置',
    description: '首页页面装修已保存',
    passed: !!props.homeLayout,
    required: false,
    tab: 'layout-home'
  },
  {
    title: '消息页布局已配置',
    description: '消息页页面装修已保存',
    passed: !!props.messageLayout,
    required: false,
    tab: 'layout-message'
  },
  {
    title: '我的页布局已配置',
    description: '我的页页面装修已保存',
    passed: !!props.profileLayout,
    required: false,
    tab: 'layout-profile'
  }
])

const hasHomeAndMine = computed(() => {
  const ids = props.tabbarList.map(t => t.id?.toLowerCase())
  return ids.includes('home') && ids.includes('mine')
})

const passedCount = computed(() => checklist.value.filter(i => i.passed).length)
const warningCount = computed(() => checklist.value.filter(i => !i.passed && i.required).length)
const optionalCount = computed(() => checklist.value.filter(i => !i.passed && !i.required).length)

const statusType = computed(() => {
  if (warningCount.value > 0) return 'warning'
  if (optionalCount.value > 0) return 'info'
  return 'success'
})

const statusText = computed(() => {
  if (warningCount.value > 0) return '有风险'
  if (optionalCount.value > 0) return '待完善'
  return '已完成'
})

function handleJump(tab: string) {
  emit('jump', tab)
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

.checklist {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px 24px;
}

.check-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.6);
  border: 1px solid color-mix(in srgb, var(--mx-border) 60%, transparent);
  transition: all 0.2s;
}

.check-item.passed {
  background: rgba(240, 253, 244, 0.8);
  border-color: rgba(134, 239, 172, 0.4);
}

.check-item.warning {
  background: rgba(255, 251, 235, 0.8);
  border-color: rgba(253, 186, 116, 0.4);
}

.check-item.optional {
  background: rgba(241, 245, 249, 0.8);
  border-color: rgba(203, 213, 225, 0.4);
}

.check-icon {
  font-size: 20px;
  flex-shrink: 0;
}

.passed .check-icon {
  color: #22c55e;
}

.warning .check-icon {
  color: #f59e0b;
}

.optional .check-icon {
  color: var(--mx-muted);
}

.check-content {
  flex: 1;
  min-width: 0;
}

.check-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-regular);
  margin-bottom: 2px;
}

.check-desc {
  font-size: 12px;
  color: var(--mx-sub);
}

.check-summary {
  display: flex;
  justify-content: center;
  gap: 32px;
  padding: 16px 24px;
  border-top: 1px solid color-mix(in srgb, var(--mx-border) 60%, transparent);
}

.summary-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.summary-label {
  font-size: 12px;
  color: var(--mx-sub);
}

.summary-value {
  font-size: 24px;
  font-weight: 700;
}

.summary-value.passed {
  color: #22c55e;
}

.summary-value.warning {
  color: #f59e0b;
}

.summary-value.optional {
  color: var(--mx-muted);
}
</style>
