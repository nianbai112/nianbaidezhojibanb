<template>
  <div class="page-container">
    <div class="page-header">
      <h2>数据概览</h2>
      <div class="header-actions">
        <el-date-picker v-model="dateRange" type="daterange" range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期" style="width: 240px" @change="loadData" />
        <el-button type="primary" :loading="loading" @click="loadData(true)">刷新</el-button>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card glass-card" v-for="stat in stats" :key="stat.label">
        <div class="stat-icon" :style="{ background: stat.color }">
          <el-icon><component :is="stat.icon" /></el-icon>
        </div>
        <div class="stat-info">
          <div class="stat-value">{{ stat.value }}</div>
          <div class="stat-label">{{ stat.label }}</div>
        </div>
        <div class="stat-trend" :class="stat.trend > 0 ? 'up' : 'down'" v-if="stat.trend !== undefined">
          {{ stat.trend > 0 ? '+' : '' }}{{ stat.trend }}%
        </div>
      </div>
    </div>

    <div class="charts-grid">
      <div class="glass-card">
        <h3>用户增长趋势</h3>
        <div class="chart-placeholder">
          <div v-for="(item, index) in userTrend" :key="index" class="trend-bar">
            <div class="bar-label">{{ item.date }}</div>
            <div class="bar-track">
              <div class="bar-fill" :style="{ width: (item.count / maxTrend * 100) + '%' }"></div>
            </div>
            <div class="bar-value">{{ item.count }}</div>
          </div>
        </div>
      </div>

      <div class="glass-card">
        <h3>区域数据对比</h3>
        <div class="region-list">
          <div v-for="region in regionData" :key="region.id" class="region-item">
            <div class="region-name">{{ region.name }}</div>
            <div class="region-stats">
              <span>用户: {{ region.users }}</span>
              <span>帖子: {{ region.posts }}</span>
              <span>订单: {{ region.orders }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { User, Document, Tickets, Wallet, Shop, Van } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { request } from '@/api/request'

const dateRange = ref<any>(null)
const loading = ref(false)
const stats = ref<any[]>([])
const userTrend = ref<any[]>([])
const regionData = ref<any[]>([])

const maxTrend = computed(() => Math.max(...userTrend.value.map(i => i.count), 1))

const loadData = async (showSuccess = false) => {
  loading.value = true
  try {
    const params: any = {}
    if (dateRange.value) {
      params.startDate = dateRange.value[0]?.toISOString()
      params.endDate = dateRange.value[1]?.toISOString()
    }

    const [overview, users, regions] = await Promise.all([
      request.get('/admin/analytics/overview', { params }),
      request.get('/admin/analytics/users', { params }),
      request.get('/admin/analytics/regions', { params }),
    ])

    const data = overview.data?.data || {}
    const gmvData = data.gmv || {}
    stats.value = [
      { label: '总用户', value: data.users?.total || 0, icon: 'User', color: '#409eff', trend: data.users?.trend ?? 0 },
      { label: '新增用户', value: data.users?.new || 0, icon: 'User', color: '#67c23a', trend: data.users?.trend ?? 0 },
      { label: '总帖子', value: data.content?.totalPosts || 0, icon: 'Document', color: '#e6a23c', trend: data.content?.trend ?? 0 },
      { label: '总订单', value: data.orders?.total || 0, icon: 'Tickets', color: '#f56c6c', trend: data.orders?.trend ?? 0 },
      { label: '商家数', value: data.merchants?.total || 0, icon: 'Shop', color: '#909399', trend: 0 },
      { label: '活跃商家', value: data.merchants?.active || 0, icon: 'Shop', color: '#67c23a', trend: 0 },
    ]

    userTrend.value = users.data?.data?.trend || []
    regionData.value = regions.data?.data || []
    if (showSuccess === true) ElMessage.success('数据概览已刷新')
  } catch (error: any) {
    ElMessage.error(error?.message || '加载数据失败')
    stats.value = [
      { label: '总用户', value: 0, icon: 'User', color: '#409eff', trend: 0 },
      { label: '新增用户', value: 0, icon: 'User', color: '#67c23a', trend: 0 },
      { label: '总帖子', value: 0, icon: 'Document', color: '#e6a23c', trend: 0 },
      { label: '总订单', value: 0, icon: 'Tickets', color: '#f56c6c', trend: 0 },
      { label: '商家数', value: 0, icon: 'Shop', color: '#909399', trend: 0 },
      { label: '活跃商家', value: 0, icon: 'Shop', color: '#67c23a', trend: 0 },
    ]
    userTrend.value = []
    regionData.value = []
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadData()
})
</script>

<style scoped>
.page-container { padding: 20px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
.header-actions { display: flex; gap: 12px; align-items: center; }
.stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 24px; }
.stat-card { display: flex; align-items: center; padding: 20px; gap: 16px; }
.stat-icon { width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: #fff; }
.stat-info { flex: 1; }
.stat-value { font-size: 24px; font-weight: 600; }
.stat-label { font-size: 14px; color: #666; }
.stat-trend { font-size: 14px; font-weight: 500; }
.stat-trend.up { color: #67c23a; }
.stat-trend.down { color: #f56c6c; }
.charts-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
.glass-card { background: rgba(255,255,255,0.8); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.3); border-radius: 12px; padding: 20px; }
.glass-card h3 { margin-bottom: 16px; font-size: 16px; font-weight: 600; }
.chart-placeholder { display: flex; flex-direction: column; gap: 8px; }
.trend-bar { display: flex; align-items: center; gap: 8px; }
.bar-label { width: 60px; font-size: 12px; color: #666; }
.bar-track { flex: 1; height: 20px; background: #f0f0f0; border-radius: 4px; overflow: hidden; }
.bar-fill { height: 100%; background: linear-gradient(90deg, #409eff, #67c23a); border-radius: 4px; transition: width 0.3s; }
.bar-value { width: 40px; text-align: right; font-size: 12px; font-weight: 500; }
.region-list { display: flex; flex-direction: column; gap: 12px; }
.region-item { padding: 12px; background: #f5f7fa; border-radius: 8px; }
.region-name { font-weight: 600; margin-bottom: 8px; }
.region-stats { display: flex; gap: 16px; font-size: 14px; color: #666; }
</style>
