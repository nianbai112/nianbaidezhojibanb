<template>
  <div class="page-container">
    <div class="page-header">
      <h2>推荐池</h2>
      <el-button type="primary" @click="loadPool">刷新</el-button>
    </div>

    <div class="filter-bar glass-card">
      <el-select v-model="filters.targetType" placeholder="类型" clearable style="width: 120px">
        <el-option label="帖子" value="post" />
        <el-option label="商家" value="merchant" />
        <el-option label="商品" value="product" />
      </el-select>
      <el-button type="primary" @click="loadPool">查询</el-button>
    </div>

    <div class="glass-card" style="padding: 20px;">
      <el-table :data="pool" v-loading="loading">
        <el-table-column prop="targetType" label="类型" width="80" />
        <el-table-column prop="targetId" label="目标ID" min-width="150" show-overflow-tooltip />
        <el-table-column prop="regionId" label="区域" width="100" />
        <el-table-column prop="score" label="分数" width="100">
          <template #default="{ row }">{{ row.score?.toFixed(1) }}</template>
        </el-table-column>
        <el-table-column prop="expireAt" label="过期时间" width="180">
          <template #default="{ row }">{{ row.expireAt ? new Date(row.expireAt).toLocaleString('zh-CN') : '-' }}</template>
        </el-table-column>
      </el-table>
      <el-pagination v-if="total > pageSize" :current-page="page" :page-size="pageSize" :total="total" @current-change="handlePageChange" layout="prev, pager, next" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { request } from '@/api/request'

const loading = ref(false)
const pool = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(50)
const filters = reactive({ targetType: '' })

const loadPool = async () => {
  loading.value = true
  try {
    const res = await request.get('/admin/recommend/pool', { params: { page: page.value, pageSize: pageSize.value, ...filters } })
    pool.value = res.data?.list || []
    total.value = res.data?.total || 0
  } catch { pool.value = [] } finally { loading.value = false }
}

const handlePageChange = (p: number) => { page.value = p; loadPool() }
onMounted(() => loadPool())
</script>

<style scoped>
.page-container { padding: 20px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.filter-bar { display: flex; gap: 12px; padding: 16px; margin-bottom: 16px; align-items: center; }
.glass-card { background: rgba(255,255,255,0.8); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.3); border-radius: 12px; }
.el-pagination { margin-top: 16px; justify-content: flex-end; }
</style>
