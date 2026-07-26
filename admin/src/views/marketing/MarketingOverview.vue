<template>
  <div class="page-shell">
    <PageHeader title="营销概览" subtitle="查看营销数据概览" icon="DataLine" />
    <el-row :gutter="20" style="margin-top: 20px" v-loading="loading">
      <el-col :span="6" v-for="card in statCards" :key="card.label">
        <el-card shadow="hover" class="overview-stat-card">
          <div class="overview-stat">
            <div class="overview-stat-value">{{ card.value }}</div>
            <div class="overview-stat-label">{{ card.label }}</div>
            <div class="overview-stat-source">{{ card.source }}</div>
          </div>
        </el-card>
      </el-col>
    </el-row>
    <el-row :gutter="20" style="margin-top: 20px">
      <el-col :span="12">
        <el-card>
          <template #header><span>近期优惠券</span></template>
          <el-table :data="recentCoupons" size="small" max-height="300" empty-text="暂无真实优惠券数据">
            <el-table-column prop="name" label="名称" min-width="120" />
            <el-table-column prop="type" label="类型" width="80" />
            <el-table-column prop="receivedCount" label="已领取" width="80" />
            <el-table-column prop="usedCount" label="已使用" width="80" />
          </el-table>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card>
          <template #header><span>近期活动</span></template>
          <el-table :data="recentActivities" size="small" max-height="300" empty-text="暂无真实活动数据">
            <el-table-column prop="title" label="活动名称" min-width="120" />
            <el-table-column prop="status" label="状态" width="80" />
            <el-table-column prop="joinCount" label="参与人数" width="80" />
          </el-table>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import PageHeader from '@/components/common/PageHeader.vue'
import { request } from '@/api/request'

const loading = ref(false)
const statCards = ref([
  { label: '优惠券总数', value: '0', source: '优惠券表' },
  { label: '活动总数', value: '0', source: '活动表' },
  { label: '团购活动', value: '0', source: '团购套餐表' },
  { label: '弹窗广告', value: '0', source: '广告位表' },
])
const recentCoupons = ref<any[]>([])
const recentActivities = ref<any[]>([])

function getPagePayload(res: any) {
  const data = res?.data || res || {}
  return {
    list: Array.isArray(data.list) ? data.list : [],
    total: Number(data.total ?? 0)
  }
}

async function loadOverview() {
  loading.value = true
  try {
    const [couponsRes, activitiesRes, groupBuysRes, popupsRes] = await Promise.allSettled([
      request.get('/admin/marketing/coupons', { params: { page: 1, pageSize: 5 } }),
      request.get('/admin/marketing/activities', { params: { page: 1, pageSize: 5 } }),
      request.get('/admin/marketing/group-buys', { params: { page: 1, pageSize: 1 } }),
      request.get('/admin/marketing/popups', { params: { page: 1, pageSize: 1 } }),
    ])
    if (couponsRes.status === 'fulfilled') {
      const d = getPagePayload(couponsRes.value)
      recentCoupons.value = d.list
      statCards.value[0].value = String(d.total)
    }
    if (activitiesRes.status === 'fulfilled') {
      const d = getPagePayload(activitiesRes.value)
      recentActivities.value = d.list
      statCards.value[1].value = String(d.total)
    }
    if (groupBuysRes.status === 'fulfilled') {
      statCards.value[2].value = String(getPagePayload(groupBuysRes.value).total)
    }
    if (popupsRes.status === 'fulfilled') {
      statCards.value[3].value = String(getPagePayload(popupsRes.value).total)
    }
    const failed = [couponsRes, activitiesRes, groupBuysRes, popupsRes].some(r => r.status === 'rejected')
    if (failed) ElMessage.warning('部分营销数据加载失败，已保留为 0')
  } catch (e: any) {
    ElMessage.error(e?.message || '加载营销概览失败')
  } finally {
    loading.value = false
  }
}

onMounted(loadOverview)
</script>

<style scoped>
.page-shell { padding: 24px; }
.overview-stat-card :deep(.el-card__body) { padding: 20px; }
.overview-stat { text-align: center; }
.overview-stat-value { font-size: 28px; font-weight: 900; color: #1f2937; line-height: 1; }
.overview-stat-label { font-size: 14px; color: #64748b; margin-top: 10px; font-weight: 800; }
.overview-stat-source { font-size: 12px; color: #94a3b8; margin-top: 6px; }
</style>
