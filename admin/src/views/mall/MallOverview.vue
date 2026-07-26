<template>
  <div class="page-container">
    <div class="page-header">
      <h2>商城概览</h2>
      <el-button @click="loadStats" :loading="loading">
        <el-icon><Refresh /></el-icon>
        刷新
      </el-button>
    </div>

    <el-row :gutter="20" class="stat-cards">
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-item">
            <div class="stat-icon" style="background: #409eff">
              <el-icon><Document /></el-icon>
            </div>
            <div class="stat-content">
              <div class="stat-value">{{ stats.todayOrders }}</div>
              <div class="stat-label">今日订单数</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-item">
            <div class="stat-icon" style="background: #67c23a">
              <el-icon><Money /></el-icon>
            </div>
            <div class="stat-content">
              <div class="stat-value">¥{{ Number(stats.todayGMV || 0).toFixed(2) }}</div>
              <div class="stat-label">今日成交金额</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-item">
            <div class="stat-icon" style="background: #e6a23c">
              <el-icon><Goods /></el-icon>
            </div>
            <div class="stat-content">
              <div class="stat-value">{{ stats.totalProducts }}</div>
              <div class="stat-label">商品总数</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-item">
            <div class="stat-icon" style="background: #f56c6c">
              <el-icon><Van /></el-icon>
            </div>
            <div class="stat-content">
              <div class="stat-value">{{ stats.pendingShip }}</div>
              <div class="stat-label">待发货订单</div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" class="stat-cards">
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-item">
            <div class="stat-icon" style="background: #909399">
              <el-icon><RefreshRight /></el-icon>
            </div>
            <div class="stat-content">
              <div class="stat-value">{{ stats.pendingRefund }}</div>
              <div class="stat-label">待处理退款</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-item">
            <div class="stat-icon" style="background: #b37feb">
              <el-icon><Warning /></el-icon>
            </div>
            <div class="stat-content">
              <div class="stat-value">{{ stats.lowStock }}</div>
              <div class="stat-label">低库存商品</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-item">
            <div class="stat-icon" style="background: #36cfc9">
              <el-icon><Shop /></el-icon>
            </div>
            <div class="stat-content">
              <div class="stat-value">{{ stats.totalMerchants }}</div>
              <div class="stat-label">商户数量</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-item">
            <div class="stat-icon" style="background: #ffc53d">
              <el-icon><TrendCharts /></el-icon>
            </div>
            <div class="stat-content">
              <div class="stat-value">{{ stats.totalOrders }}</div>
              <div class="stat-label">累计订单</div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" style="margin-top: 20px">
      <el-col :span="12">
        <el-card>
          <template #header>
            <span>近7天订单趋势</span>
          </template>
          <div class="chart-placeholder">
            <el-empty v-if="!recentOrders.length" description="暂无数据" />
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
import { ref, onMounted } from 'vue'
import { request } from '@/api/request'
import { ElMessage } from 'element-plus'

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
.page-container {
  padding: 20px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.stat-cards {
  margin-bottom: 20px;
}

.stat-card {
  cursor: pointer;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 16px;
}

.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 24px;
}

.stat-content {
  flex: 1;
}

.stat-value {
  font-size: 24px;
  font-weight: bold;
  color: #303133;
}

.stat-label {
  font-size: 14px;
  color: #909399;
  margin-top: 4px;
}

.trend-list {
  max-height: 300px;
  overflow-y: auto;
}

.trend-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid #f0f0f0;
}

.trend-date {
  color: #606266;
  width: 100px;
}

.trend-count {
  color: #409eff;
  width: 80px;
  text-align: center;
}

.trend-amount {
  color: #67c23a;
  width: 100px;
  text-align: right;
}
</style>
