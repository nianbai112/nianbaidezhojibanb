<template>
  <div class="page-shell">
    <PageHeader title="外卖订单" subtitle="管理外卖订单" icon="Tickets" />
    <div class="filter-bar">
      <el-input v-model="filters.keyword" placeholder="搜索订单号/用户" clearable style="width: 200px" @clear="loadData" @keyup.enter="loadData" />
      <el-select v-model="filters.status" placeholder="状态" clearable style="width: 120px" @change="loadData">
        <el-option label="待付款" value="PENDING_PAY" />
        <el-option label="待接单" value="PENDING_ACCEPT" />
        <el-option label="已接单" value="ACCEPTED" />
        <el-option label="进行中" value="IN_PROGRESS" />
        <el-option label="已完成" value="COMPLETED" />
        <el-option label="已取消" value="CANCELLED" />
        <el-option label="退款中" value="REFUNDING" />
        <el-option label="已退款" value="REFUNDED" />
      </el-select>
      <el-button type="primary" @click="loadData">查询</el-button>
      <el-button @click="resetFilters">重置</el-button>
    </div>
    <el-table :data="list" v-loading="loading" border stripe>
      <el-table-column prop="orderNo" label="订单号" width="190" show-overflow-tooltip />
      <el-table-column prop="user" label="用户" width="120">
        <template #default="{ row }">
          <div>{{ row.userName || row.user?.nickname || row.userId }}</div>
        </template>
      </el-table-column>
      <el-table-column prop="merchantName" label="商家" min-width="140" show-overflow-tooltip>
        <template #default="{ row }">{{ row.merchantName || row.merchant?.name || '-' }}</template>
      </el-table-column>
      <el-table-column prop="payAmount" label="金额" width="100">
        <template #default="{ row }">¥{{ Number(row.payAmount || row.amount || 0).toFixed(2) }}</template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="statusTypeMap[row.status]" size="small">{{ statusMap[row.status] || row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" label="下单时间" width="170">
        <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="120" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="viewDetail(row)">详情</el-button>
        </template>
      </el-table-column>
    </el-table>
    <div class="pagination-bar">
      <el-pagination v-model:current-page="page" v-model:page-size="pageSize" :total="total" :page-sizes="[10,20,50]" layout="total, sizes, prev, pager, next" @size-change="loadData" @current-change="loadData" />
    </div>

    <el-dialog v-model="detailVisible" title="订单详情" width="700px">
      <div v-if="detail" class="detail-panel">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="订单号">{{ detail.orderNo }}</el-descriptions-item>
          <el-descriptions-item label="状态">{{ statusMap[detail.status] || detail.status }}</el-descriptions-item>
          <el-descriptions-item label="用户">{{ detail.userName || detail.user?.nickname || detail.userId }}</el-descriptions-item>
          <el-descriptions-item label="商家">{{ detail.merchantName || detail.merchant?.name || '-' }}</el-descriptions-item>
          <el-descriptions-item label="商品金额">¥{{ Number(detail.goodsAmount || detail.productAmount || 0).toFixed(2) }}</el-descriptions-item>
          <el-descriptions-item label="配送费">¥{{ Number(detail.freightAmount || detail.deliveryFee || 0).toFixed(2) }}</el-descriptions-item>
          <el-descriptions-item label="实付金额">¥{{ Number(detail.payAmount || detail.amount || 0).toFixed(2) }}</el-descriptions-item>
          <el-descriptions-item label="下单时间">{{ formatDate(detail.createdAt) }}</el-descriptions-item>
          <el-descriptions-item label="收货人">{{ detail.receiverName || '-' }}</el-descriptions-item>
          <el-descriptions-item label="收货电话">{{ detail.receiverPhone || '-' }}</el-descriptions-item>
          <el-descriptions-item label="收货地址" :span="2">{{ detail.receiverAddress || '-' }}</el-descriptions-item>
          <el-descriptions-item label="备注" :span="2">{{ detail.remark || '-' }}</el-descriptions-item>
        </el-descriptions>
        <div class="section-title">商品列表</div>
        <el-table :data="detail.items || []" border size="small">
          <el-table-column prop="productName" label="商品名" />
          <el-table-column prop="quantity" label="数量" width="80" />
          <el-table-column prop="price" label="单价" width="100">
            <template #default="{ row }">¥{{ Number(row.price || 0).toFixed(2) }}</template>
          </el-table-column>
        </el-table>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import PageHeader from '@/components/common/PageHeader.vue'
import { getMerchantOrders, getMerchantOrderDetail } from '@/api/merchant'
import { ElMessage } from 'element-plus'

const statusMap: Record<string, string> = {
  PENDING_PAY: '待付款', PENDING_ACCEPT: '待接单', ACCEPTED: '已接单',
  IN_PROGRESS: '进行中', ARRIVED: '已到达', COMPLETED: '已完成',
  CANCELLED: '已取消', REFUNDING: '退款中', REFUNDED: '已退款'
}
const statusTypeMap: Record<string, string> = {
  PENDING_PAY: 'warning', PENDING_ACCEPT: 'warning', ACCEPTED: 'primary',
  IN_PROGRESS: 'primary', COMPLETED: 'success', CANCELLED: 'info',
  REFUNDING: 'danger', REFUNDED: 'info'
}

const loading = ref(false)
const list = ref<any[]>([])
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const filters = reactive({ keyword: '', status: '' })
const detailVisible = ref(false)
const detail = ref<any>(null)

const formatDate = (d: any) => d ? new Date(d).toLocaleString('zh-CN') : '-'

const loadData = async () => {
  loading.value = true
  try {
    const res: any = await getMerchantOrders({ page: page.value, pageSize: pageSize.value, ...filters })
    list.value = res?.list || res?.data?.list || []
    total.value = res?.total ?? res?.data?.total ?? 0
  } catch (e: any) {
    ElMessage.error(e?.message || '加载订单失败')
  } finally {
    loading.value = false
  }
}

const resetFilters = () => {
  Object.assign(filters, { keyword: '', status: '' })
  page.value = 1
  loadData()
}

const viewDetail = async (row: any) => {
  try {
    const res: any = await getMerchantOrderDetail(row.id)
    detail.value = res?.data ?? res
    detailVisible.value = true
  } catch (e: any) {
    ElMessage.error(e?.message || '获取订单详情失败')
  }
}

onMounted(() => loadData())
</script>

<style scoped>
.page-shell { padding: 24px; }
.filter-bar { display: flex; gap: 12px; margin: 16px 0; flex-wrap: wrap; }
.pagination-bar { display: flex; justify-content: flex-end; margin-top: 16px; }
.detail-panel { max-height: 60vh; overflow-y: auto; }
.section-title { margin: 16px 0 8px; font-weight: 600; }
</style>
