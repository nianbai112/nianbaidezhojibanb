<template>
  <div class="page-container">
    <div class="page-title mb-4">配送统计</div>

    <a-spin :spinning="loading">
      <a-row :gutter="16" class="mb-4">
        <a-col :span="6">
          <a-card>
            <a-statistic title="总订单数" :value="stats.totalOrders" />
          </a-card>
        </a-col>
        <a-col :span="6">
          <a-card>
            <a-statistic title="今日单量" :value="stats.todayOrders" />
          </a-card>
        </a-col>
        <a-col :span="6">
          <a-card>
            <a-statistic title="活跃骑手" :value="stats.activeRiders" />
          </a-card>
        </a-col>
        <a-col :span="6">
          <a-card>
            <a-statistic title="总收入(元)" :value="totalIncome" :precision="2" />
          </a-card>
        </a-col>
      </a-row>

      <a-row :gutter="16" class="mb-4">
        <a-col :span="6">
          <a-card>
            <a-statistic title="已完成订单" :value="stats.completedOrders" />
          </a-card>
        </a-col>
        <a-col :span="6">
          <a-card>
            <a-statistic title="完成率" :value="stats.completionRate" suffix="%" :precision="2" />
          </a-card>
        </a-col>
      </a-row>

      <a-card title="近7日订单趋势">
        <div style="height: 300px; display: flex; align-items: flex-end; justify-content: space-around;">
          <div v-for="item in stats.trends" :key="item.date" style="display: flex; flex-direction: column; align-items: center; width: 10%;">
            <div style="margin-bottom: 8px;">{{ item.count }}</div>
            <div :style="{ height: Math.max(item.count * 5, 10) + 'px', width: '100%', backgroundColor: '#409EFF', borderRadius: '4px 4px 0 0' }"></div>
            <div style="margin-top: 8px; font-size: 12px; color: #666;">{{ item.date.slice(5) }}</div>
          </div>
        </div>
      </a-card>
    </a-spin>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { errandApi } from '@/api'
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()
const loading = ref(false)
const stats = ref({
  totalOrders: 0,
  todayOrders: 0,
  activeRiders: 0,
  completedOrders: 0,
  totalIncome: 0,
  completionRate: 0,
  trends: [] as any[],
})

const totalIncome = computed(() => {
  return (Number(stats.value.totalIncome) || 0) / 100
})

const fetchStats = async () => {
  loading.value = true
  try {
    const res = await errandApi.getDeliveryStats(userStore.regionId)
    if (res.data) {
      const d = res.data as any
      stats.value = { ...stats.value, ...d }
    }
  } finally { loading.value = false }
}

onMounted(() => { fetchStats() })
</script>
