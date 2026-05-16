<template>
  <div class="page-container">
    <div class="page-header">
      <h2>搜索关键词分析</h2>
      <el-button type="primary" :loading="loading" @click="loadKeywords(true)">刷新</el-button>
    </div>

    <div class="glass-card" style="padding: 20px;">
      <el-table :data="keywords" v-loading="loading">
        <el-table-column type="index" label="排名" width="80" />
        <el-table-column prop="keyword" label="关键词" min-width="200" />
        <el-table-column prop="count" label="搜索次数" width="120" />
        <el-table-column label="占比" width="120">
          <template #default="{ row }">{{ totalCount > 0 ? ((row.count / totalCount) * 100).toFixed(1) : '0.0' }}%</template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { request } from '@/api/request'

const loading = ref(false)
const keywords = ref([])
const totalCount = computed(() => keywords.value.reduce((sum: number, k: any) => sum + k.count, 0))
const unwrap = (res: any) => res?.data ?? res ?? {}

const loadKeywords = async (showSuccess = false) => {
  loading.value = true
  try {
    const res = await request.get('/admin/tracking/search-keywords', { params: { limit: 100 } })
    keywords.value = unwrap(res)?.keywords || []
    if (showSuccess) ElMessage.success('搜索关键词已刷新')
  } catch (error: any) {
    ElMessage.error(error?.message || '加载搜索关键词失败')
    keywords.value = []
  } finally { loading.value = false }
}

onMounted(() => loadKeywords())
</script>

<style scoped>
.page-container { padding: 20px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.glass-card { background: rgba(255,255,255,0.8); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.3); border-radius: 12px; }
</style>
