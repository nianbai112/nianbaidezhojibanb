<template>
  <div class="page-container">
    <div class="page-header">
      <h2>用户分析</h2>
      <div class="header-actions">
        <el-date-picker v-model="dateRange" type="daterange" range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期" style="width: 240px" @change="loadData" />
        <el-button type="primary" :loading="loading" @click="loadData(true)">刷新</el-button>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card glass-card">
        <div class="stat-value">{{ data.total || 0 }}</div>
        <div class="stat-label">总用户</div>
      </div>
      <div class="stat-card glass-card">
        <div class="stat-value">{{ data.new || 0 }}</div>
        <div class="stat-label">新增用户</div>
      </div>
      <div class="stat-card glass-card">
        <div class="stat-value">{{ data.active || 0 }}</div>
        <div class="stat-label">活跃用户</div>
      </div>
      <div class="stat-card glass-card">
        <div class="stat-value">{{ data.certified || 0 }}</div>
        <div class="stat-label">已认证用户</div>
      </div>
    </div>

    <div class="glass-card">
      <h3>用户增长趋势</h3>
      <div class="trend-chart">
        <div v-for="(item, index) in data.trend" :key="index" class="trend-item">
          <div class="trend-date">{{ item.date }}</div>
          <div class="trend-bar-wrapper">
            <div class="trend-bar" :style="{ height: (item.count / maxCount * 100) + '%' }"></div>
          </div>
          <div class="trend-count">{{ item.count }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { request } from '@/api/request'

const dateRange = ref<any>(null)
const loading = ref(false)
const data = ref<any>({})

const maxCount = computed(() => Math.max(...(data.value.trend?.map((i: any) => i.count) || [1]), 1))

const loadData = async (showSuccess = false) => {
  loading.value = true
  try {
    const params: any = {}
    if (dateRange.value) {
      params.startDate = dateRange.value[0]?.toISOString()
      params.endDate = dateRange.value[1]?.toISOString()
    }
    const res = await request.get('/admin/analytics/users', { params })
    data.value = res.data?.data || {}
    if (showSuccess === true) ElMessage.success('用户分析已刷新')
  } catch (error: any) {
    ElMessage.error(error?.message || '加载数据失败')
    data.value = {}
  } finally {
    loading.value = false
  }
}

onMounted(() => { loadData() })
</script>

<style scoped>
.page-container { padding: 20px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
.header-actions { display: flex; gap: 12px; align-items: center; }
.stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
.stat-card { padding: 20px; text-align: center; }
.stat-value { font-size: 28px; font-weight: 600; color: #303133; }
.stat-label { font-size: 14px; color: #909399; margin-top: 4px; }
.glass-card { background: rgba(255,255,255,0.8); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.3); border-radius: 12px; padding: 20px; }
.glass-card h3 { margin-bottom: 16px; }
.trend-chart { display: flex; align-items: flex-end; gap: 8px; height: 200px; padding: 0 20px; }
.trend-item { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; }
.trend-date { font-size: 10px; color: #909399; }
.trend-bar-wrapper { width: 100%; height: 150px; display: flex; align-items: flex-end; }
.trend-bar { width: 100%; background: linear-gradient(180deg, #409eff, #79bbff); border-radius: 4px 4px 0 0; transition: height 0.3s; }
.trend-count { font-size: 12px; font-weight: 500; }
</style>
