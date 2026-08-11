<template>
  <el-drawer
    :model-value="modelValue"
    title="校园地图版本历史"
    size="520px"
    append-to-body
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <el-alert
      title="回滚会复制历史内容并发布为一个新版本，历史记录不会被覆盖。"
      type="info"
      :closable="false"
      show-icon
    />

    <div class="version-list" v-loading="loading">
      <el-empty v-if="!loading && !versions.length" description="还没有已发布版本" />
      <article v-for="item in versions" :key="item.id" class="version-card">
        <div class="version-heading">
          <div>
            <strong>版本 v{{ item.version }}</strong>
            <el-tag v-if="item.version === activeVersion" type="success" size="small">当前线上</el-tag>
            <el-tag v-if="item.rollbackOfId" type="warning" size="small">回滚发布</el-tag>
          </div>
          <el-button
            v-if="item.version !== activeVersion"
            type="primary"
            plain
            size="small"
            :loading="restoringId === item.id"
            @click="restore(item)"
          >
            回滚到此版本
          </el-button>
        </div>
        <div class="version-meta">
          <span>{{ formatDate(item.publishedAt) }}</span>
          <span>{{ Number(item.featureCount || 0) }} 个要素</span>
          <span>{{ Number(item.layerCount || 0) }} 个图层</span>
          <span>{{ formatBytes(item.byteSize) }}</span>
        </div>
      </article>
    </div>

    <el-pagination
      v-if="total > pageSize"
      v-model:current-page="page"
      :page-size="pageSize"
      :total="total"
      layout="prev, pager, next"
      @current-change="loadVersions"
    />
  </el-drawer>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { fetchRegionCampusMapVersions, rollbackRegionCampusMapVersion } from '@/api/admin'

type CampusMapVersionSummary = {
  id: string
  version: number
  featureCount?: number
  layerCount?: number
  byteSize?: number
  rollbackOfId?: string | null
  publishedAt?: string
}

const props = defineProps<{
  modelValue: boolean
  regionId: string
  activeVersion: number
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  restored: []
}>()

const loading = ref(false)
const restoringId = ref('')
const versions = ref<CampusMapVersionSummary[]>([])
const page = ref(1)
const pageSize = 20
const total = ref(0)

watch(() => [props.modelValue, props.regionId], ([opened]) => {
  if (!opened || !props.regionId) return
  page.value = 1
  loadVersions()
})

async function loadVersions() {
  if (!props.regionId) return
  loading.value = true
  try {
    const result: any = await fetchRegionCampusMapVersions(props.regionId, {
      page: page.value,
      pageSize,
    })
    const data = result?.data || result || {}
    versions.value = Array.isArray(data.list) ? data.list : []
    total.value = Number(data.total || 0)
  } catch (error: any) {
    ElMessage.error(error?.message || '版本历史加载失败')
  } finally {
    loading.value = false
  }
}

async function restore(item: CampusMapVersionSummary) {
  try {
    await ElMessageBox.confirm(
      `确定回滚到 v${item.version} 吗？系统会发布一个新的回滚版本。`,
      '回滚校园地图',
      {
        confirmButtonText: '确认回滚并发布',
        cancelButtonText: '取消',
        type: 'warning',
      },
    )
  } catch {
    return
  }

  restoringId.value = item.id
  try {
    await rollbackRegionCampusMapVersion(props.regionId, item.id)
    ElMessage.success(`已回滚到 v${item.version} 并发布新版本`)
    emit('restored')
    await loadVersions()
  } catch (error: any) {
    ElMessage.error(error?.message || '校园地图回滚失败')
  } finally {
    restoringId.value = ''
  }
}

function formatDate(value?: string) {
  if (!value) return '未知时间'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false })
}

function formatBytes(value?: number) {
  const bytes = Number(value || 0)
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
</script>

<style scoped>
.version-list {
  display: grid;
  gap: 12px;
  min-height: 180px;
  margin: 16px 0;
}

.version-card {
  display: grid;
  gap: 10px;
  padding: 14px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  background: var(--el-bg-color);
}

.version-heading,
.version-heading > div,
.version-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.version-heading {
  justify-content: space-between;
}

.version-meta {
  flex-wrap: wrap;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.version-meta span + span::before {
  margin-right: 8px;
  content: '·';
}
</style>
