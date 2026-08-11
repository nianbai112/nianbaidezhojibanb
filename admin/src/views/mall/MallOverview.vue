<template>
  <div class="page-shell">
    <PageHeader title="商城概览">
      <template #actions>
        <el-button @click="loadStats" :loading="loading">
          <el-icon><Refresh /></el-icon>
          刷新
        </el-button>
      </template>
    </PageHeader>

    <StatGrid :items="statItems" />

    <el-row :gutter="20" style="margin-top: 20px">
      <el-col :span="12">
        <el-card>
          <template #header>
            <span>近7天订单趋势</span>
          </template>
          <div class="chart-placeholder">
            <EmptyState v-if="!recentOrders.length" description="暂无数据" />
            <div v-else class="trend-list">
              <div v-for="item in recentOrders" :key="item.date" class="trend-item">
                <span class="trend-date">{{ item.date }}</span>
                <span class="trend-count">{{ item.count }} 单</span>
                <span class="trend-amount">¥{{ Number(item.amount || 0).toFixed(2) }}</span>
              </div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card>
          <template #header>
            <span>热销商品 TOP 10</span>
          </template>
          <el-table :data="hotProducts" size="small">
            <el-table-column type="index" label="排名" width="60" />
            <el-table-column prop="name" label="商品名称" min-width="150" show-overflow-tooltip />
            <el-table-column prop="saleCount" label="销量" width="80" />
            <el-table-column prop="price" label="价格" width="100">
              <template #default="{ row }">¥{{ Number(row.price || 0).toFixed(2) }}</template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { request } from '@/api/request'
import { ElMessage } from 'element-plus'
import EmptyState from '@/components/common/EmptyState.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import StatGrid from '@/components/glass/StatGrid.vue'
import type { StatItem } from '@/types/admin'

const loading = ref(false)
const stats = ref({
  todayOrders: 0,
  todayGMV: 0,
  totalProducts: 0,
  pendingShip: 0,
  pendingRefund: 0,
  lowStock: 0,
  totalMerchants: 0,
  totalOrders: 0,
})
const recentOrders = ref<any[]>([])
const hotProducts = ref<any[]>([])

const statItems = computed<StatItem[]>(() => [
  { label: '今日订单数', value: stats.value.todayOrders, icon: 'Document', tone: 'blue' },
  { label: '今日成交金额', value: `¥${Number(stats.value.todayGMV || 0).toFixed(2)}`, icon: 'Money', tone: 'green' },
  { label: '商品总数', value: stats.value.totalProducts, icon: 'Goods', tone: 'orange' },
  { label: '待发货订单', value: stats.value.pendingShip, icon: 'Van', tone: 'red' },
  { label: '待处理退款', value: stats.value.pendingRefund, icon: 'RefreshRight', tone: 'blue' },
  { label: '低库存商品', value: stats.value.lowStock, icon: 'Warning', tone: 'purple' },
  { label: '商户数量', value: stats.value.totalMerchants, icon: 'Shop', tone: 'cyan' },
  { label: '累计订单', value: stats.value.totalOrders, icon: 'TrendCharts', tone: 'orange' },
])

const loadStats = async () => {
  loading.value = true
  try {
    const res = await request.get('/mall/admin/overview')
    const data = (res as any).data || res
    stats.value = {
      todayOrders: data.todayOrders || 0,
      todayGMV: data.todayGMV || 0,
      totalProducts: data.totalProducts || 0,
      pendingShip: data.pendingShip || 0,
      pendingRefund: data.pendingRefund || 0,
      lowStock: data.lowStock || 0,
      totalMerchants: data.totalMerchants || 0,
      totalOrders: data.totalOrders || 0,
    }
    recentOrders.value = data.recentOrders || []
    hotProducts.value = data.hotProducts || []
  } catch (error) {
    console.error('加载统计数据失败:', error)
    ElMessage.error('加载统计数据失败')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadStats()
})
</script>

<style scoped>
.trend-list {
  max-height: 300px;
  overflow-y: auto;
}

.trend-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid var(--mx-border);
}

.trend-date {
  color: var(--mx-sub);
  width: 100px;
}

.trend-count {
  color: var(--el-color-primary);
  width: 80px;
  text-align: center;
}

.trend-amount {
  color: var(--el-color-success);
  width: 100px;
  text-align: right;
}
</style>
