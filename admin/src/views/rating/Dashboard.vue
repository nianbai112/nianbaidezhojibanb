<template>
  <div class="page-container">
    <div class="page-title mb-4">评分系统概览</div>

    <a-row :gutter="16" class="mb-4">
      <a-col :span="6"><a-card size="small"><a-statistic title="总评分数" :value="dashboard.totalRatings" /></a-card></a-col>
      <a-col :span="6"><a-card size="small"><a-statistic title="平均分" :value="dashboard.avgScore" :precision="2" /></a-card></a-col>
      <a-col :span="6"><a-card size="small"><a-statistic title="评分项目数" :value="dashboard.totalItems" /></a-card></a-col>
      <a-col :span="6"><a-card size="small"><a-statistic title="分类数" :value="dashboard.totalCategories" /></a-card></a-col>
    </a-row>

    <a-card size="small" title="评分分布" class="mb-4">
      <a-row :gutter="16">
        <a-col :span="4" v-for="(count, i) in dashboard.scoreDistribution" :key="i">
          <a-card size="small" :body-style="{ textAlign: 'center', padding: '12px' }">
            <a-rate :value="i + 1" disabled :count="i + 1" style="font-size:14px" />
            <div style="margin-top:4px;font-size:18px;font-weight:bold">{{ count }}</div>
          </a-card>
        </a-col>
      </a-row>
    </a-card>

    <a-card size="small" title="最新评分">
      <a-table :dataSource="dashboard.recentRatings" :columns="recentColumns" :pagination="false" rowKey="id" size="small">
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'user'">
            <a-space><a-avatar :src="record.User?.avatar" size="small" /><span>{{ record.User?.nickname || '-' }}</span></a-space>
          </template>
          <template v-else-if="column.dataIndex === 'score'">
            <a-rate :value="record.score" disabled :count="5" style="font-size:14px" />
          </template>
        </template>
      </a-table>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ratingApi } from '@/api/rating'
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()
const dashboard = ref<any>({ totalRatings: 0, avgScore: 0, totalItems: 0, totalCategories: 0, scoreDistribution: [], recentRatings: [] })

const recentColumns = [
  { title: '用户', dataIndex: 'user', width: 150 },
  { title: '评分项目', dataIndex: ['item', 'name'], width: 150 },
  { title: '分数', dataIndex: 'score', width: 120 },
  { title: '内容', dataIndex: 'content', ellipsis: true },
  { title: '时间', dataIndex: 'createdAt', width: 160 },
]

const fetchDashboard = async () => {
  try {
    const res = await ratingApi.getDashboard(userStore.regionId || undefined)
    dashboard.value = res.data as any
  } catch {}
}

onMounted(() => { fetchDashboard() })
</script>
