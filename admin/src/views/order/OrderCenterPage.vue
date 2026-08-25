<template>
  <div class="page-shell">
    <PageHeader title="统一订单检索" subtitle="跨业务查询与导出；外卖处置请从订单履约或售后处理进入">
      <template #actions>
        <el-button @click="exportOrders">
          <el-icon><Download /></el-icon>
          导出订单
        </el-button>
      </template>
    </PageHeader>

    <div class="filter-bar">
      <el-input v-model="filters.keyword" placeholder="搜索订单号" clearable style="width: 200px" @clear="loadOrders" @keyup.enter="loadOrders" />
      <el-select v-model="filters.orderType" placeholder="订单类型" clearable style="width: 120px" @change="loadOrders">
        <el-option label="普通订单" value="order" />
        <el-option label="商城订单" value="mall" />
        <el-option label="跑腿订单" value="errand" />
        <el-option label="团购订单" value="groupbuy" />
        <el-option label="活动订单" value="activity" />
        <el-option label="置顶订单" value="topup" />
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
          ¥{{ Number(row.amount || 0).toFixed(2) }}
        </template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="getStatusType(row)" size="small">
            {{ getStatusLabel(row) }}
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
            <el-tag :type="getStatusType(selectedOrder)">{{ getStatusLabel(selectedOrder) }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="金额">¥{{ orderAmount.toFixed(2) }}</el-descriptions-item>
          <el-descriptions-item label="用户">{{ selectedOrder.user?.nickname || '-' }}</el-descriptions-item>
          <el-descriptions-item label="商户">{{ selectedOrder.merchant?.name || '-' }}</el-descriptions-item>
          <el-descriptions-item label="下单时间">{{ formatDate(selectedOrder.createdAt) }}</el-descriptions-item>
        </el-descriptions>
        <section v-if="deliveryNodes.length" class="delivery-evidence">
          <h4>配送证据</h4>
          <div v-for="node in deliveryNodes" :key="node.id || `${node.nodeType}-${node.createdAt}`" class="node-row">
            <strong>{{ deliveryNodeLabel(node.nodeLabel || node.nodeType) }}</strong>
            <span>{{ formatDate(node.createdAt) }}</span>
            <small v-if="node.remark">{{ node.remark }}</small>
            <small v-if="hasLocation(node)">送达坐标：{{ Number(node.lat).toFixed(6) }}, {{ Number(node.lng).toFixed(6) }}</small>
            <div v-if="nodeProofImages(node).length" class="node-proofs">
              <el-image v-for="image in nodeProofImages(node)" :key="image" :src="image" fit="cover" :preview-src-list="nodeProofImages(node)" />
            </div>
          </div>
        </section>
      </div>
      <template #footer><el-button @click="showDetailDialog = false">关闭</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, reactive, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Download } from '@element-plus/icons-vue'
import { request } from '@/api/request'
import PageHeader from '@/components/common/PageHeader.vue'

const loading = ref(false)
const route = useRoute()
const showDetailDialog = ref(false)
const orders = ref<any[]>([])
const selectedOrder = ref<any>(null)
const orderAmount = computed(() => Number(selectedOrder.value?.amount || selectedOrder.value?.orderAmount || 0))
const dateRange = ref<any>(null)
const deliveryNodes = computed(() => selectedOrder.value?.deliveryNodes || [])
const focusOrderId = ref('')
const focusOrderType = ref('order')

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
const hasLocation = (node: any) => node?.lat != null && node?.lng != null && Number.isFinite(Number(node.lat)) && Number.isFinite(Number(node.lng))
const nodeProofImages = (node: any) => (node?.proofImages || node?.proof_images || []).filter((image: any) => typeof image === 'string' && image)
const deliveryNodeLabel = (value?: string) => ({
  merchant_accepted: '商家已接单', merchant_completed: '商家已送达', accepted: '骑手已接单',
  in_progress: '骑手已取货', arrived: '骑手已送达', completed: '订单已完成', cancelled: '订单已取消',
}[value || ''] || value || '配送状态更新')

const isShopOrder = (row: any) => row?.orderType === '外卖订单' || row?.orderType === '宿舍小店订单'

const refundStatusLabel: Record<string, string> = { refunding: '退款中', refunded: '已退款', partial: '部分退款' }

const statusLabelMap: Record<string, string> = {
  pending_pay: '待付款',
  pending_accept: '待接单',
  pending: '待处理',
  unpaid: '待付款',
  paid: '已付款',
  accepted: '已接单',
  shipped: '已发货',
  in_progress: '配送中',
  arrived: '已送达',
  delivered: '已送达',
  received: '已收货',
  completed: '已完成',
  cancelled: '已取消',
  refunding: '退款中',
  refunded: '已退款',
}

const statusTypeMap: Record<string, string> = {
  pending_pay: 'warning',
  pending_accept: 'warning',
  pending: 'warning',
  unpaid: 'warning',
  paid: 'primary',
  accepted: 'primary',
  shipped: 'primary',
  in_progress: 'primary',
  arrived: 'success',
  delivered: 'success',
  received: 'success',
  completed: 'success',
  cancelled: 'info',
  refunding: 'danger',
  refunded: 'info',
}

const normalizedStatus = (row: any) => String(row?.status || row?.orderStatus || '').toLowerCase()

const getStatusLabel = (row: any) => {
  const refund = String(row?.refundStatus || 'none')
  if (refundStatusLabel[refund]) return refundStatusLabel[refund]
  const status = normalizedStatus(row)
  if (status === 'shipped' && isShopOrder(row)) return '配送中'
  if (status === 'paid' && isShopOrder(row)) return '已支付待接单'
  return statusLabelMap[status] || row?.status || row?.orderStatus || '-'
}

const getStatusType = (row: any) => {
  const refund = String(row?.refundStatus || 'none')
  if (refund === 'refunding') return 'danger'
  if (refundStatusLabel[refund]) return 'info'
  return statusTypeMap[normalizedStatus(row)] || 'info'
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
    const payload: any = (res as any)?.data || res
    orders.value = payload?.list || []
    pagination.total = payload?.total || 0
    if (focusOrderId.value) {
      const orderId = focusOrderId.value
      const type = focusOrderType.value
      focusOrderId.value = ''
      await openDetail(orderId, type)
    }
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

const applyRouteQuery = () => {
  const keyword = route.query.businessId || route.query.keyword
  if (keyword) filters.keyword = String(keyword)
  const orderType = route.query.orderType || route.query.type
  if (orderType) filters.orderType = String(orderType)
  if (route.query.focusId) {
    focusOrderId.value = String(route.query.focusId)
    focusOrderType.value = String(orderType || 'order')
  }
}

const openDetail = async (orderId: string, type?: string) => {
  try {
    const res = await request.get(`/admin/order-center/orders/${orderId}`, {
      params: { type },
    })
    selectedOrder.value = (res as any)?.data || res
    showDetailDialog.value = true
  } catch (error) {
    ElMessage.error('获取订单详情失败')
  }
}

const viewDetail = (order: any) => openDetail(order.orderId, {
  普通订单: 'order', 商城订单: 'mall', 跑腿订单: 'errand', 团购订单: 'groupbuy',
  活动订单: 'activity', 置顶订单: 'topup', 二手订单: 'secondhand',
}[order.orderType])

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
  applyRouteQuery()
  loadOrders()
})
</script>

<style scoped>
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
.delivery-evidence { margin-top: 16px; }
.delivery-evidence h4 { margin: 0 0 8px; }
.node-row { display: grid; grid-template-columns: 1fr auto; gap: 4px 12px; padding: 12px 0; border-bottom: 1px solid #ebeef5; }
.node-row span, .node-row small { color: #7b8798; font-size: 12px; }
.node-row small, .node-proofs { grid-column: 1 / -1; }
.node-proofs { display: flex; gap: 8px; flex-wrap: wrap; }
.node-proofs :deep(.el-image) { width: 88px; height: 88px; border-radius: 6px; }
</style>
