<template>
  <div class="page-container">
    <div class="page-header">
      <h2>统一订单中心</h2>
      <el-button @click="exportOrders">
        <el-icon><Download /></el-icon>
        导出订单
      </el-button>
    </div>

    <div class="filter-bar">
      <el-input v-model="filters.keyword" placeholder="搜索订单号" clearable style="width: 200px" @clear="loadOrders" @keyup.enter="loadOrders" />
      <el-select v-model="filters.orderType" placeholder="订单类型" clearable style="width: 120px" @change="loadOrders">
        <el-option label="普通订单" value="order" />
        <el-option label="商城订单" value="mall" />
        <el-option label="跑腿订单" value="errand" />
        <el-option label="团购订单" value="groupbuy" />
        <el-option label="活动订单" value="activity" />
        <el-option label="充值订单" value="topup" />
        <el-option label="二手订单" value="secondhand" />
      </el-select>
      <el-date-picker v-model="dateRange" type="daterange" range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期" style="width: 240px" @change="handleDateChange" />
      <el-button type="primary" @click="loadOrders">查询</el-button>
      <el-button @click="resetFilters">重置</el-button>
    </div>

    <el-table :data="orders" v-loading="loading" border stripe>
      <el-table-column prop="orderNo" label="订单号" width="180" />
      <el-table-column prop="orderType" label="订单类型" width="100">
        <template #default="{ row }">
          <el-tag size="small">{{ row.orderType }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="user.nickname" label="用户" width="120">
        <template #default="{ row }">
          {{ row.user?.nickname || '-' }}
        </template>
      </el-table-column>
      <el-table-column prop="merchant.name" label="商户" width="120">
        <template #default="{ row }">
          {{ row.merchant?.name || '-' }}
        </template>
      </el-table-column>
      <el-table-column prop="amount" label="金额" width="100">
        <template #default="{ row }">
          ¥{{ (row.amount / 100).toFixed(2) }}
        </template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="getStatusType(row.status)" size="small">
            {{ row.status }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" label="下单时间" width="160">
        <template #default="{ row }">
          {{ formatDate(row.createdAt) }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="100" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="viewDetail(row)">详情</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="pagination-bar">
      <el-pagination
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.pageSize"
        :total="pagination.total"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next, jumper"
        @size-change="loadOrders"
        @current-change="loadOrders"
      />
    </div>

    <!-- Detail Dialog -->
    <el-dialog v-model="showDetailDialog" title="订单详情" width="700px">
      <div v-if="selectedOrder" class="order-detail">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="订单号">{{ selectedOrder.orderNo }}</el-descriptions-item>
          <el-descriptions-item label="订单类型">{{ selectedOrder.orderType }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="getStatusType(selectedOrder.status)">{{ selectedOrder.status }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="金额">¥{{ (selectedOrder.amount / 100).toFixed(2) }}</el-descriptions-item>
          <el-descriptions-item label="用户">{{ selectedOrder.user?.nickname || '-' }}</el-descriptions-item>
          <el-descriptions-item label="商户">{{ selectedOrder.merchant?.name || '-' }}</el-descriptions-item>
          <el-descriptions-item label="下单时间">{{ formatDate(selectedOrder.createdAt) }}</el-descriptions-item>
        </el-descriptions>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Download } from '@element-plus/icons-vue'
import { request } from '@/api/request'

const loading = ref(false)
const showDetailDialog = ref(false)
const orders = ref<any[]>([])
const selectedOrder = ref<any>(null)
const dateRange = ref<any>(null)

const filters = reactive({
  keyword: '',
  orderType: '',
  startDate: '',
  endDate: '',
})

const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0,
})

const formatDate = (date: string) => {
  if (!date) return '-'
  return new Date(date).toLocaleString('zh-CN')
}

const getStatusType = (status: string) => {
  if (status?.includes('pay') || status?.includes('pending')) return 'warning'
  if (status?.includes('complete') || status?.includes('success')) return 'success'
  if (status?.includes('cancel') || status?.includes('refund')) return 'danger'
  return 'info'
}

const handleDateChange = (val: any) => {
  if (val) {
    filters.startDate = val[0]?.toISOString?.() || ''
    filters.endDate = val[1]?.toISOString?.() || ''
  } else {
    filters.startDate = ''
    filters.endDate = ''
  }
  loadOrders()
}

const loadOrders = async () => {
  loading.value = true
  try {
    const res = await request.get('/admin/order-center/orders', {
      params: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        ...filters,
      },
    })
    orders.value = res.data?.list || []
    pagination.total = res.data?.total || 0
  } catch (error) {
    ElMessage.error('加载订单列表失败')
  } finally {
    loading.value = false
  }
}

const resetFilters = () => {
  filters.keyword = ''
  filters.orderType = ''
  filters.startDate = ''
  filters.endDate = ''
  dateRange.value = null
  loadOrders()
}

const viewDetail = async (order: any) => {
  try {
    const res = await request.get(`/admin/order-center/orders/${order.orderId}`, {
      params: { type: order.orderType === '普通订单' ? 'order' : order.orderType === '商城订单' ? 'mall' : undefined },
    })
    selectedOrder.value = res.data
    showDetailDialog.value = true
  } catch (error) {
    ElMessage.error('获取订单详情失败')
  }
}

const exportOrders = async () => {
  try {
    const res: any = await request.get('/admin/order-center/export', { params: { ...filters } })
    const csv = res?.csv || res?.data?.csv
    if (!csv) { ElMessage.warning('没有可导出的数据'); return }
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `订单_${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
    ElMessage.success('导出成功')
  } catch (error) {
    ElMessage.info('导出功能暂不可用')
  }
}

onMounted(() => {
  loadOrders()
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
.filter-bar {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}
.pagination-bar {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}
.order-detail {
  max-height: 60vh;
  overflow-y: auto;
}
</style>
