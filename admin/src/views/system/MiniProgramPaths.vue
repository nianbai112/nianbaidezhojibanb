<template>
  <div class="page-shell">
    <GlassPageHeader title="小程序页面路径" subtitle="从小程序源码 app.json 整理出的真实页面路径，供 Tabbar、分享卡片、消息跳转和页面装修复制使用">
      <template #actions>
        <el-button :icon="RefreshRight" :loading="loading" @click="loadPaths(true)">重新扫描</el-button>
        <el-button type="primary" :icon="DocumentCopy" @click="copyAll">复制全部</el-button>
      </template>
    </GlassPageHeader>

    <div class="path-toolbar glass-card">
      <el-input v-model="keyword" clearable placeholder="搜索页面名称、路径、分包" class="path-search" />
      <el-select v-model="groupFilter" clearable placeholder="筛选分组" style="width: 180px">
        <el-option v-for="group in groups" :key="group" :label="group" :value="group" />
      </el-select>
      <el-tag effect="plain">{{ filteredPaths.length }} 个页面</el-tag>
      <span v-if="sourceDir" class="source-hint">来源：{{ sourceDir }}</span>
    </div>

    <div class="path-grid" v-loading="loading">
      <div v-for="item in filteredPaths" :key="item.fullPath" class="path-card glass-card">
        <div class="path-card-head">
          <div>
            <div class="path-title">{{ item.title }}</div>
            <div class="path-group">{{ item.group }}</div>
          </div>
          <el-tag size="small" :type="item.tabbar ? 'primary' : 'info'" effect="plain">{{ item.tabbar ? 'Tabbar' : item.kind }}</el-tag>
        </div>
        <div class="path-value">{{ item.fullPath }}</div>
        <div class="path-actions">
          <el-button size="small" type="primary" plain :icon="DocumentCopy" @click="copyPath(item.fullPath)">复制路径</el-button>
          <el-button size="small" :icon="DocumentCopy" @click="copyPath('/' + item.fullPath)">复制 / 路径</el-button>
        </div>
      </div>
    </div>

    <el-empty v-if="!loading && !filteredPaths.length" description="没有扫描到页面路径" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { DocumentCopy, RefreshRight } from '@element-plus/icons-vue'
import GlassPageHeader from '@/components/glass/GlassPageHeader.vue'
import { fetchMiniProgramPaths } from '@/api/admin'

interface MiniPath {
  title: string
  group: string
  kind: string
  fullPath: string
  tabbar?: boolean
}

const keyword = ref('')
const groupFilter = ref('')
const loading = ref(false)
const sourceDir = ref('')
const paths = ref<MiniPath[]>([])

const groups = computed(() => Array.from(new Set(paths.value.map((item) => item.group))))
const filteredPaths = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  return paths.value.filter((item) => {
    const hitGroup = !groupFilter.value || item.group === groupFilter.value
    const hitKeyword = !q || `${item.title} ${item.group} ${item.fullPath}`.toLowerCase().includes(q)
    return hitGroup && hitKeyword
  })
})

async function copyPath(value: string) {
  await navigator.clipboard.writeText(value)
  ElMessage.success('路径已复制')
}

async function copyAll() {
  await copyPath(filteredPaths.value.map((item) => `${item.title}\t${item.fullPath}`).join('\n'))
}

async function loadPaths(showSuccess = false) {
  loading.value = true
  try {
    const res: any = await fetchMiniProgramPaths()
    const list = res?.list || res?.data?.list || []
    paths.value = list.map((item: any) => ({
      title: item.title || item.fullPath || item.path,
      group: item.group || (item.packageName === 'main' ? '主包' : item.packageName || '未分组'),
      kind: item.kind || '页面',
      fullPath: item.fullPath || item.path,
      tabbar: item.tabbar,
    }))
    sourceDir.value = res?.sourceDir || res?.data?.sourceDir || ''
    if (showSuccess) ElMessage.success(`已扫描 ${paths.value.length} 个小程序页面`)
  } catch (e: any) {
    paths.value = []
    ElMessage.error(e?.message || '扫描小程序页面路径失败')
  } finally {
    loading.value = false
  }
}

onMounted(() => loadPaths())
</script>

<style scoped lang="scss">
.path-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px;
  flex-wrap: wrap;
}
.path-search { max-width: 420px; }
.source-hint {
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
}
.path-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}
.path-card {
  padding: 16px;
  display: grid;
  gap: 12px;
}
.path-card-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}
.path-title {
  color: #0f172a;
  font-size: 16px;
  font-weight: 950;
}
.path-group {
  margin-top: 3px;
  color: #64748b;
  font-size: 12px;
  font-weight: 850;
}
.path-value {
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(248, 250, 252, .9);
  border: 1px solid rgba(226, 232, 240, .85);
  color: #334155;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  word-break: break-all;
}
.path-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
@media (max-width: 1280px) {
  .path-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 780px) {
  .path-toolbar { flex-direction: column; align-items: stretch; }
  .path-grid { grid-template-columns: 1fr; }
}
</style>
