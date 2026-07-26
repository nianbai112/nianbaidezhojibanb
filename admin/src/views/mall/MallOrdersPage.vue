<template>
  <div class="page-container">
    <div class="page-header">
      <h2>商城订单管理</h2>
      <el-button @click="exportOrders">
        <el-icon><Download /></el-icon>
        导出订单
      </el-button>
    </div>

    <div class="filter-bar">
      <el-input v-model="filters.keyword" placeholder="搜索订单号/收货人" clearable style="width: 200px" @clear="loadOrders" @keyup.enter="loadOrders" />
      <el-select v-model="filters.status" placeholder="订单状态" clearable style="width: 120px" @change="loadOrders">
        <el-option label="待付款" value="pending_pay" />
        <el-option label="已付款" value="paid" />
        <el-option label="已发货" value="shipped" />
        <el-option label="已收货" value="received" />
        <el-option label="已完成" value="completed" />
        <el-option label="已取消" value="cancelled" />
      </el-select>
      <el-date-picker v-model="dateRange" type="daterange" range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期" style="width: 240px" @change="handleDateChange" />
      <el-button type="primary" @click="loadOrders">查询</el-button>
      <el-button @click="resetFilters">重置</el-button>
    </div>

    <el-table :data="orders" v-loading="loading" border stripe>
      <el-table-column prop="orderNo" label="订单号" width="180" show-overflow-tooltip />
      <el-table-column prop="User.nickname" label="用户" width="100">
        <template #default="{ row }">
          {{ row.User?.nickname || '-' }}
        </template>
      </el-table-column>
      <el-table-column prop="receiverName" label="收货人" width="100" />
      <el-table-column prop="receiverPhone" label="收货电话" width="120" />
      <el-table-column prop="totalAmount" label="订单金额" width="100">
        <template #default="{ row }">
          ¥{{ Number(row.totalAmount || 0).toFixed(2) }}
        </template>
      </el-table-column>
      <el-table-column prop="payAmount" label="实付金额" width="100">
        <template #default="{ row }">
          ¥{{ Number(row.payAmount || 0).toFixed(2) }}
        </template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="getStatusType(row.status)" size="small">
            {{ getStatusLabel(row.status) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" label="下单时间" width="160">
        <template #default="{ row }">
          {{ formatDate(row.createdAt) }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="220" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="viewDetail(row)">详情</el-button>
          <el-button v-if="row.status === 'paid'" size="small" type="success" @click="deliverOrder(row)">发货</el-button>
          <el-button v-if="row.status === 'paid' || row.status === 'pending_pay'" size="small" type="warning" @click="cancelOrder(row)">取消</el-button>
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
          <el-descriptions-item label="状态">
            <el-tag :type="getStatusType(selectedOrder.status)">{{ getStatusLabel(selectedOrder.status) }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="用户">{{ selectedOrder.User?.nickname || '-' }}</el-descriptions-item>
          <el-descriptions-item label="收货人">{{ selectedOrder.receiverName }}</el-descriptions-item>
          <el-descriptions-item label="收货电话">{{ selectedOrder.receiverPhone }}</el-descriptions-item>
          <el-descriptions-item label="收货地址">{{ selectedOrder.receiverAddress }}</el-descriptions-item>
          <el-descriptions-item label="订单金额">¥{{ Number(selectedOrder.totalAmount || 0).toFixed(2) }}</el-descriptions-item>
          <el-descriptions-item label="实付金额">¥{{ Number(selectedOrder.payAmount || 0).toFixed(2) }}</el-descriptions-item>
          <el-descriptions-item label="快递公司">{{ selectedOrder.trackingCompany || '-' }}</el-descriptions-item>
          <el-descriptions-item label="快递单号">{{ selectedOrder.trackingNo || '-' }}</el-descriptions-item>
          <el-descriptions-item label="下单时间">{{ formatDate(selectedOrder.createdAt) }}</el-descriptions-item>
          <el-descriptions-item label="支付时间">{{ formatDate(selectedOrder.payTime) }}</el-descriptions-item>
          <el-descriptions-item label="发货时间">{{ formatDate(selectedOrder.deliverTime) }}</el-descriptions-item>
          <el-descriptions-item label="退款状态">
            <el-tag v-if="selectedOrder.refundStatus && selectedOrder.refundStatus !== 'none'" :type="selectedOrder.refundStatus === 'refunded' ? 'danger' : 'warning'" size="small">
              {{ selectedOrder.refundStatus === 'refunding' ? '退款中' : selectedOrder.refundStatus === 'refunded' ? '已退款' : selectedOrder.refundStatus }}
            </el-tag>
            <span v-else>无</span>
          </el-descriptions-item>
        </el-descriptions>

        <h4 style="margin-top: 16px;">商品明细</h4>
        <el-table :data="selectedOrder.items || []" size="small" border style="margin-top: 8px">
          <el-table-column prop="productName" label="商品名称" min-width="150" />
          <el-table-column prop="skuName" label="规格" width="120" />
          <el-table-column prop="price" label="单价" width="100">
            <template #default="{ row }">¥{{ Number(row.price || 0).toFixed(2) }}</template>
          </el-table-column>
          <el-table-column prop="quantity" label="数量" width="80" />
          <el-table-column label="小计" width="100">
            <template #default="{ row }">¥{{ (Number(row.price || 0) * row.quantity).toFixed(2) }}</template>
          </el-table-column>
        </el-table>
      </div>
    </el-dialog>

    <!-- Deliver Dialog -->
    <el-dialog v-model="showDeliverDialog" title="订单发货" width="500px">
      <el-form :model="deliverForm" label-width="100px">
        <el-form-item label="快递公司" required>
          <el-select v-model="deliverForm.trackingCompany" placeholder="选择快递公司" filterable style="width: 100%">
            <el-option label="顺丰速运" value="顺丰速运" />
            <el-option label="中通快递" value="中通快递" />
            <el-option label="圆通速递" value="圆通速递" />
            <el-option label="韵达快递" value="韵达快递" />
            <el-option label="申通快递" value="申通快递" />
            <el-option label="极兔速递" value="极兔速递" />
            <el-option label="邮政快递" value="邮政快递" />
            <el-option label="京东物流" value="京东物流" />
            <el-option label="其他" value="其他" />
          </el-select>
        </el-form-item>
        <el-form-item label="快递单号" required>
          <el-input v-model="deliverForm.trackingNo" placeholder="请输入快递单号" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showDeliverDialog = false">取消</el-button>
        <el-button type="primary" @click="submitDeliver" :loading="submitting">确定发货</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Download } from '@element-plus/icons-vue'
import { request } from '@/api/request'

const loading = ref(false)
const submitting = ref(false)
const showDetailDialog = ref(false)
const showDeliverDialog = ref(false)
const orders = ref<any[]>([])
const selectedOrder = ref<any>(null)
const dateRange = ref<any>(null)

const filters = reactive({
  keyword: '',
  status: '',
  startDate: '',
  endDate: '',
})

const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0,
})

const deliverForm = reactive({
  trackingCompany: '',
  trackingNo: '',
})

const formatDate = (date: string) => {
  if (!date) return '-'
  return new Date(date).toLocaleString('zh-CN')
}

const getStatusType = (status: string) => {
  const map: Record<string, string> = {
    pending_pay: 'warning',
    paid: 'primary',
    shipped: 'success',
    received: 'success',
    completed: 'success',
    cancelled: 'info',
    refunding: 'danger',
    refunded: 'danger',
  }
  return map[status] || 'info'
}

const getStatusLabel = (status: string) => {
  const map: Record<string, string> = {
    pending_pay: '待付款',
    paid: '已付款',
    shipped: '已发货',
    received: '已收货',
    completed: '已完成',
    cancelled: '已取消',
    refunding: '退款中',
    refunded: '已退款',
  }
  return map[status] || status
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
    const res = await request.get('/mall/orders/admin/list', {
      params: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        ...filters,
      },
    })
    const data = (res as any).data || res
    orders.value = data.list || []
    pagination.total = data.total || 0
  } catch (error) {
    ElMessage.error('加载订单列表失败')
  } finally {
    loading.value = false
  }
}

const resetFilters = () => {
  filters.keyword = ''
  filters.status = ''
  filters.startDate = ''
  filters.endDate = ''
  dateRange.value = null
  loadOrders()
}

const viewDetail = async (order: any) => {
  try {
    const res = await request.get(`/mall/orders/admin/${order.id}`)
    selectedOrder.value = (res as any).data || res
    showDetailDialog.value = true
  } catch (error) {
    ElMessage.error('获取订单详情失败')
  }
}

const deliverOrder = (order: any) => {
  selectedOrder.value = order
  deliverForm.trackingCompany = ''
  deliverForm.trackingNo = ''
  showDeliverDialog.value = true
}

const submitDeliver = async () => {
  if (!deliverForm.trackingCompany || !deliverForm.trackingNo) {
    ElMessage.warning('请填写快递信息')
    return
  }
  submitting.value = true
  try {
    await request.put(`/mall/orders/admin/${selectedOrder.value.id}/delivery`, {
      trackingCompany: deliverForm.trackingCompany,
      trackingNo: deliverForm.trackingNo,
    })
    ElMessage.success('发货成功')
    showDeliverDialog.value = false
    loadOrders()
  } catch (error) {
    ElMessage.error('发货失败')
  } finally {
    submitting.value = false
  }
}

const cancelOrder = async (order: any) => {
  try {
    await ElMessageBox.confirm('确定取消该订单吗？取消后将恢复库存。', '确认取消', { type: 'warning' })
    await request.put(`/mall/orders/admin/${order.id}/status`, { status: 'cancelled', reason: '后台取消' })
    ElMessage.success('订单已取消')
    loadOrders()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('操作失败')
    }
  }
}

const exportOrders = async () => {
  try {
    const res: any = await request.get('/mall/orders/admin/export', {
      params: { ...filters },
    })
    const csv = res?.csv || res?.data?.csv
    if (!csv) {
      ElMessage.warning('没有可导出的数据')
      return
    }
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `商城订单_${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
    ElMessage.success(`导出成功，共 ${res?.count || res?.data?.count || 0} 条`)
  } catch (error) {
    ElMessage.error('导出失败')
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
