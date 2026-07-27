<template>
  <section class="region-hero glass-card">
    <div class="region-identity">
      <div class="hero-cover" :style="logo ? {backgroundImage: `url(${logo})`, backgroundSize: 'cover'} : {}">
        <img v-if="logo" :src="logo" alt="区域Logo" class="hero-logo-img" />
        <div v-else class="hero-logo-placeholder">
          <el-icon><Picture /></el-icon>
        </div>
      </div>
      <div class="hero-info">
        <div class="eyebrow">当前区域</div>
        <h1>{{ name || '未选择区域' }}</h1>
        <div class="meta-row">
          <el-tag :type="isOpen ? 'success' : 'info'" size="small">
            {{ isOpen ? '正常运营' : '已停用' }}
          </el-tag>
          <el-tag v-if="isHot" type="warning" effect="plain" size="small">热门</el-tag>
          <span v-if="address" class="address-text">
            <el-icon><Location /></el-icon>
            {{ address }}
          </span>
          <span v-else class="address-text missing">
            <el-icon><Location /></el-icon>
            未配置地址
          </span>
        </div>
        <div class="completion-bar">
          <div class="completion-label">配置完成度</div>
          <el-progress :percentage="completion" :stroke-width="8" :format="formatCompletion" />
        </div>
      </div>
    </div>
    <div class="hero-actions">
      <div class="hero-stats">
        <div class="stat-item" v-if="lastUpdated">
          <span class="stat-label">最近更新</span>
          <span class="stat-value">{{ formatTime(lastUpdated) }}</span>
        </div>
      </div>
      <div class="hero-buttons">
        <el-select v-model="selectedId" class="region-switcher" placeholder="选择区域" @change="handleSelectRegion" filterable>
          <el-option v-for="r in regions" :key="r.id" :label="r.name" :value="r.id">
            <div class="region-option">
              <span>{{ r.name }}</span>
              <el-tag v-if="r.isHot" type="warning" size="small" effect="plain">热</el-tag>
            </div>
          </el-option>
        </el-select>
        <el-button type="primary" plain @click="handleCreate">新增区域</el-button>
        <el-button @click="handleBatch">批量操作</el-button>
        <el-button :loading="refreshing" @click="handleRefresh">刷新</el-button>
        <el-button type="primary" :icon="Check" :loading="saving" @click="handleSave">保存配置</el-button>
        <el-button @click="handlePreview">预览</el-button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Check, Picture, Location } from '@element-plus/icons-vue'

interface Props {
  logo?: string
  name?: string
  isOpen?: boolean
  isHot?: boolean
  address?: string
  completion?: number
  lastUpdated?: string | Date
  regions: any[]
  selectedId: string | number
  saving?: boolean
  refreshing?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  logo: '',
  name: '',
  isOpen: true,
  isHot: false,
  address: '',
  completion: 0,
  lastUpdated: '',
  saving: false,
  refreshing: false
})

const emit = defineEmits<{
  'update:selectedId': [id: string | number]
  'select-region': [id: string | number]
  'create': []
  'refresh': []
  'save': []
  'preview': []
  'batch': []
}>()

const selectedId = computed({
  get: () => props.selectedId,
  set: (val) => emit('update:selectedId', val)
})

function handleSelectRegion(id: string | number) {
  emit('select-region', id)
}

function handleCreate() {
  emit('create')
}

function handleRefresh() {
  emit('refresh')
}

function handleSave() {
  emit('save')
}

function handlePreview() {
  emit('preview')
}

function handleBatch() {
  emit('batch')
}

function formatCompletion(percentage: number) {
  return percentage >= 80 ? '已完成' : percentage >= 50 ? '进行中' : '待完善'
}

function formatTime(time: string | Date) {
  if (!time) return '-'
  const date = new Date(time)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  if (hours < 24) return `${hours}小时前`
  if (days < 7) return `${days}天前`
  return date.toLocaleDateString('zh-CN')
}
</script>

<style scoped lang="scss">
.region-hero {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 24px;
  padding: 22px 24px;
  margin-bottom: 24px;
}

.region-identity {
  display: flex;
  align-items: flex-start;
  gap: 20px;
  min-width: 0;
  flex: 1;
}

.hero-cover {
  width: 72px;
  height: 72px;
  border-radius: 14px;
  background: linear-gradient(135deg, var(--el-color-primary-light-7), #60a5fa);
  flex-shrink: 0;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.hero-logo-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.hero-logo-placeholder {
  color: rgba(255, 255, 255, 0.8);
  font-size: 32px;
}

.hero-info {
  flex: 1;
  min-width: 0;
}

.eyebrow {
  color: var(--mx-sub);
  font-weight: 650;
  font-size: 12px;
  margin-bottom: 4px;
}

h1 {
  margin: 0 0 8px;
  font-size: 26px;
  line-height: 1.15;
  font-weight: 800;
  color: var(--mx-text);
  letter-spacing: 0;
}

.meta-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  color: var(--mx-sub);
  font-size: 13px;
}

.address-text {
  display: flex;
  align-items: center;
  gap: 4px;
}

.address-text.missing {
  color: #f59e0b;
}

.completion-bar {
  max-width: 300px;
}

.completion-label {
  font-size: 12px;
  color: var(--mx-sub);
  font-weight: 500;
  margin-bottom: 4px;
}

.hero-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 16px;
  flex-shrink: 0;
}

.hero-stats {
  display: flex;
  gap: 16px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}

.stat-label {
  font-size: 12px;
  color: var(--mx-muted);
}

.stat-value {
  font-size: 13px;
  font-weight: 600;
  color: var(--mx-sub);
}

.hero-buttons {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.region-switcher {
  width: 200px;
}

.region-option {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

@media (max-width: 1050px) {
  .region-hero {
    flex-direction: column;
    align-items: stretch;
  }

  .hero-actions {
    align-items: stretch;
  }

  .hero-buttons {
    justify-content: flex-start;
  }

  .region-switcher {
    width: 100%;
  }
}
</style>
