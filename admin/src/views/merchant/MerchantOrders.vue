<template>
  <div class="page-shell">
    <PageHeader :title="isDormShopPage ? '小店订单' : '订单履约'" :subtitle="isDormShopPage ? '管理宿舍小店订单，配送由店主自送' : '聚焦待接单、配送中和履约异常订单'" icon="Tickets" />
    <div class="filter-bar">
      <el-input v-model="filters.keyword" placeholder="搜索订单号/用户" clearable style="width: 200px" @clear="loadData" @keyup.enter="loadData" />
      <el-select v-model="filters.status" placeholder="状态" clearable style="width: 120px" @change="loadData">
        <el-option label="待付款" value="PENDING_PAY" />
        <el-option label="已支付待接单" value="PAID" />
        <el-option label="配送中" value="SHIPPED" />
        <el-option label="已送达" value="DELIVERED" />
        <el-option label="已完成" value="COMPLETED" />
        <el-option label="已取消" value="CANCELLED" />
        <el-option label="退款中" value="REFUNDING" />
        <el-option label="已退款" value="REFUNDED" />
        <el-option label="部分退款" value="PARTIAL_REFUND" />
      </el-select>
      <el-select v-model="filters.merchantId" placeholder="商家" clearable filterable style="width: 180px" @change="loadData">
        <el-option v-for="merchant in merchantList" :key="merchant.id" :label="merchant.name" :value="merchant.id" />
      </el-select>
      <el-button type="primary" @click="loadData">查询</el-button>
      <el-button @click="resetFilters">重置</el-button>
    </div>
    <el-alert v-if="isFulfillmentAlert" title="当前展示商家未接单、餐品无人接、骑手未取餐及取餐后未送达的外卖订单" type="warning" :closable="false" show-icon />
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
      <el-table-column prop="deliveryMode" label="配送方式" width="110">
        <template #default="{ row }">{{ deliveryModeLabel(row.deliveryMode) }}</template>
      </el-table-column>
      <el-table-column prop="deliveryDisplayMode" label="用户可见" width="110">
        <template #default="{ row }">{{ displayModeLabel(row.deliveryDisplayMode) }}</template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="statusType(row)" size="small">{{ displayStatus(row) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column v-if="isFulfillmentAlert" label="预警原因" min-width="250">
        <template #default="{ row }">
          <el-tag :type="fulfillmentAlertType(row.fulfillmentAlert?.code)" size="small">{{ row.fulfillmentAlert?.label || '履约异常' }}</el-tag>
          <div class="alert-hint">已等待 {{ row.fulfillmentAlert?.waitMinutes || 10 }} 分钟 · {{ row.fulfillmentAlert?.suggestion || '请查看订单详情处理' }}</div>
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" label="下单时间" width="170">
        <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="210" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="viewDetail(row)">详情</el-button>
          <el-button v-if="canReleaseRider(row)" size="small" type="warning" @click="releaseRider(row)">退回骑手池</el-button>
        </template>
      </el-table-column>
    </el-table>
    <div class="pagination-bar">
      <el-pagination v-model:current-page="page" v-model:page-size="pageSize" :total="total" :page-sizes="[10,20,50]" layout="total, sizes, prev, pager, next" @size-change="loadData" @current-change="loadData" />
    </div>

    <el-dialog v-model="detailVisible" title="订单详情" width="700px">
      <div v-if="detail" class="detail-panel">
        <el-alert class="fulfillment-guide" :type="fulfillmentGuide.type" :title="fulfillmentGuide.title" :description="fulfillmentGuide.description" :closable="false" show-icon />
        <div v-if="canReleaseRider(detail)" class="guide-action"><el-button type="warning" @click="releaseRider(detail)">骑手未取餐，退回骑手池</el-button></div>
        <el-descriptions :column="2" border>
          <el-descriptions-item label="订单号">{{ detail.orderNo }}</el-descriptions-item>
          <el-descriptions-item label="状态">{{ displayStatus(detail) }}</el-descriptions-item>
          <el-descriptions-item label="用户">{{ detail.userName || detail.user?.nickname || detail.userId }}</el-descriptions-item>
          <el-descriptions-item label="商家">{{ detail.merchantName || detail.merchant?.name || '-' }}</el-descriptions-item>
          <el-descriptions-item label="商品金额">¥{{ Number(detail.goodsAmount || detail.productAmount || 0).toFixed(2) }}</el-descriptions-item>
          <el-descriptions-item label="配送方式">{{ deliveryModeLabel(detail.deliveryMode) }}</el-descriptions-item>
          <el-descriptions-item label="用户可见">{{ displayModeLabel(detail.deliveryDisplayMode) }}</el-descriptions-item>
          <el-descriptions-item label="配送费">¥{{ Number(detail.freightAmount || detail.deliveryFee || 0).toFixed(2) }}</el-descriptions-item>
          <el-descriptions-item label="实付金额">¥{{ Number(detail.payAmount || detail.amount || 0).toFixed(2) }}</el-descriptions-item>
          <el-descriptions-item v-if="detail.refundStatus && detail.refundStatus !== 'none'" label="退款状态">{{ refundStatusText(detail.refundStatus) }}</el-descriptions-item>
          <el-descriptions-item v-if="Number(detail.refundAmount || 0) > 0" label="退款金额">¥{{ Number(detail.refundAmount).toFixed(2) }}</el-descriptions-item>
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
        <div v-if="deliveryNodes.length" class="section-title">配送节点</div>
        <div v-if="deliveryNodes.length" class="node-list">
          <div v-for="node in deliveryNodes" :key="node.id || `${node.nodeType}-${node.createdAt}`" class="node-row">
            <strong>{{ node.nodeLabel || deliveryNodeLabel(node.nodeType) }}</strong>
            <span>{{ formatDate(node.createdAt) }}</span>
            <small v-if="node.remark">{{ node.remark }}</small>
            <small v-if="hasLocation(node)">送达坐标：{{ Number(node.lat).toFixed(6) }}, {{ Number(node.lng).toFixed(6) }}</small>
            <div v-if="nodeProofImages(node).length" class="node-proofs">
              <el-image v-for="image in nodeProofImages(node)" :key="image" :src="image" fit="cover" :preview-src-list="nodeProofImages(node)" />
            </div>
          </div>
        </div>
        <div v-if="detail.riskEvents?.length" class="section-title">异常记录</div>
        <div v-if="detail.riskEvents?.length" class="node-list">
          <div v-for="event in detail.riskEvents" :key="event.id" class="node-row risk">
            <strong>{{ event.description || event.eventType }}</strong>
            <span>{{ formatDate(event.createdAt) }} · {{ event.handled ? '已处理' : '待处理' }}</span>
          </div>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, reactive, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import PageHeader from '@/components/common/PageHeader.vue'
import { getMerchantOrders, getMerchantOrderDetail, getMerchants, releaseMerchantOrderRider } from '@/api/merchant'
import { ElMessage, ElMessageBox } from 'element-plus'

const statusMap: Record<string, string> = {
  PENDING_PAY: '待付款', PAID: '已支付待接单', SHIPPED: '配送中',
  DELIVERED: '已送达', RECEIVED: '已收货', COMPLETED: '已完成',
  CANCELLED: '已取消', REFUNDING: '退款中', REFUNDED: '已退款'
}
const statusTypeMap: Record<string, string> = {
  PENDING_PAY: 'warning', PAID: 'warning', SHIPPED: 'primary',
  DELIVERED: 'success', RECEIVED: 'success', COMPLETED: 'success', CANCELLED: 'info',
  REFUNDING: 'danger', REFUNDED: 'info'
}
const refundStatusMap: Record<string, string> = { refunding: '退款中', refunded: '已退款', partial: '部分退款' }
const refundStatusText = (value?: string) => refundStatusMap[String(value || '')] || String(value || '-')
const displayStatus = (row: any) => {
  const refundStatus = String(row?.refundStatus || 'none')
  if (refundStatus === 'refunding' || refundStatus === 'refunded') return refundStatusText(refundStatus)
  const base = statusMap[row?.status] || row?.status || '-'
  return refundStatus === 'partial' ? `${base}（部分退款 ¥${Number(row?.refundAmount || 0).toFixed(2)}）` : base
}
const statusType = (row: any) => {
  const refundStatus = String(row?.refundStatus || 'none')
  if (refundStatus === 'refunding') return 'danger'
  if (refundStatus === 'refunded') return 'info'
  if (refundStatus === 'partial') return 'warning'
  return statusTypeMap[row?.status] || 'info'
}
const route = useRoute()
const isDormShopPage = computed(() => route.path.includes('/dorm-'))
const businessType = computed(() => isDormShopPage.value ? 'dorm_shop' : 'takeaway')
const deliveryModeLabel = (value?: string) => {
  if (value === 'self_delivery') return '店主自送'
  if (value === 'rider_delivery') return '叫骑手配送'
  return '平台配送'
}
const displayModeLabel = (value?: string) => value === 'live_map' ? '实时轨迹' : '状态节点'
const deliveryNodeLabel = (value?: string) => {
  const map: Record<string, string> = {
    merchant_accepted: '商家已接单',
    merchant_completed: '商家已送达',
    accepted: '骑手已接单',
    in_progress: '骑手已取货',
    arrived: '骑手已送达',
    completed: '订单已完成',
    cancelled: '订单已取消',
  }
  return map[value || ''] || '配送状态更新'
}

const loading = ref(false)
const list = ref<any[]>([])
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const filters = reactive({ keyword: '', status: '', merchantId: '' })
const merchantList = ref<any[]>([])
const isFulfillmentAlert = computed(() => route.query.alert === 'fulfillment')
const detailVisible = ref(false)
const detail = ref<any>(null)
const deliveryNodes = computed(() => detail.value?.deliveryNodes || [])

const formatDate = (d: any) => d ? new Date(d).toLocaleString('zh-CN') : '-'
const fulfillmentAlertType = (code?: string) => ['merchant_unaccepted', 'rider_delivery_overdue'].includes(String(code || '')) ? 'danger' : 'warning'
const hasLocation = (node: any) => node?.lat != null && node?.lng != null && Number.isFinite(Number(node.lat)) && Number.isFinite(Number(node.lng))
const nodeProofImages = (node: any) => (node?.proofImages || node?.proof_images || []).filter((image: any) => typeof image === 'string' && image)
const canReleaseRider = (row: any) => row?.fulfillmentAlert?.code === 'rider_pickup_overdue'
const fulfillmentGuide = computed(() => {
  const order = detail.value || {}
  const alert = order.fulfillmentAlert || {}
  if (['refunding', 'refunded'].includes(String(order.refundStatus || '').toLowerCase())) {
    return { type: 'warning', title: refundStatusText(order.refundStatus), description: '退款状态优先于履约状态，请在售后处理或退款资金记录中跟进结果。' }
  }
  if (alert.label) return { type: fulfillmentAlertType(alert.code), title: alert.label, description: alert.suggestion || '请查看订单、商家与骑手信息后处理。' }
  if (order.status === 'PENDING_PAY') return { type: 'info', title: '等待用户付款', description: '未支付订单无需人工派单或催商家接单。' }
  if (order.status === 'PAID' && !order.merchantAcceptTime) return { type: 'warning', title: '等待商家接单', description: '先联系商家确认是否营业、是否缺货；商家接单并备餐完成后才会进入骑手履约。' }
  if (order.status === 'PAID' && order.readyTime && !order.riderId) return { type: 'warning', title: '餐品已备好，等待骑手', description: '订单已具备骑手接单条件，请关注是否进入骑手池。' }
  if (order.status === 'SHIPPED' && order.riderId && !order.pickupTime) return { type: 'warning', title: '骑手待取餐', description: '骑手尚未取餐；只有系统标记为取餐超时后，才可安全退回骑手池。' }
  if (order.status === 'SHIPPED' && order.pickupTime && !order.deliverTime) return { type: 'primary', title: '配送中', description: '请依据配送节点和异常记录判断是否需要介入，不要提前结束订单。' }
  return { type: 'success', title: '当前无需人工履约处置', description: '可查看配送节点、异常记录或后续售后信息。' }
})

const loadData = async () => {
  loading.value = true
  try {
    const res: any = await getMerchantOrders({ page: page.value, pageSize: pageSize.value, businessType: businessType.value, alert: isFulfillmentAlert.value ? 'fulfillment' : undefined, ...filters })
    list.value = res?.list || res?.data?.list || []
    total.value = res?.total ?? res?.data?.total ?? 0
  } catch (e: any) {
    ElMessage.error(e?.message || '加载订单失败')
  } finally {
    loading.value = false
  }
}

const resetFilters = () => {
  Object.assign(filters, { keyword: '', status: '', merchantId: '' })
  page.value = 1
  loadData()
}

const applyMerchantContext = () => {
  filters.merchantId = typeof route.query.merchantId === 'string' ? route.query.merchantId : ''
}

const loadMerchants = async () => {
  try {
    const res: any = await getMerchants({ page: 1, pageSize: 500, businessType: businessType.value })
    merchantList.value = res?.list || res?.data?.list || []
  } catch {
    merchantList.value = []
  }
}

const viewDetail = async (row: any) => {
  try {
    const res: any = await getMerchantOrderDetail(row.id)
    detail.value = { ...(res?.data ?? res), fulfillmentAlert: row.fulfillmentAlert }
    detailVisible.value = true
  } catch (e: any) {
    ElMessage.error(e?.message || '获取订单详情失败')
  }
}

const releaseRider = async (row: any) => {
  try {
    await ElMessageBox.confirm('骑手尚未取餐。退回后订单会重新进入骑手大厅，已取餐订单不能使用此操作。', '退回骑手池', { type: 'warning' })
    await releaseMerchantOrderRider(row.id)
    ElMessage.success('已退回骑手池，等待其他骑手接单')
    if (detail.value?.id === row.id) detailVisible.value = false
    loadData()
  } catch (e: any) {
    if (e !== 'cancel' && e !== 'close') ElMessage.error(e?.message || '退回骑手池失败')
  }
}

watch(() => route.query.merchantId, () => {
  applyMerchantContext()
  page.value = 1
  loadData()
})

onMounted(() => { applyMerchantContext(); loadData(); loadMerchants() })
</script>

<style scoped>
.page-shell { padding: 24px; }
.filter-bar { display: flex; gap: 12px; margin: 16px 0; flex-wrap: wrap; }
.pagination-bar { display: flex; justify-content: flex-end; margin-top: 16px; }
.detail-panel { max-height: 60vh; overflow-y: auto; }
.fulfillment-guide { margin-bottom: 14px; }
.guide-action { display: flex; justify-content: flex-end; margin: -2px 0 14px; }
.section-title { margin: 16px 0 8px; font-weight: 600; }
.node-list { border: 1px solid #ebeef5; border-radius: 6px; padding: 0 12px; }
.node-row { display: grid; grid-template-columns: 1fr auto; gap: 4px 12px; padding: 12px 0; border-bottom: 1px solid #ebeef5; }
.node-row:last-child { border-bottom: 0; }
.node-row strong { color: #172033; }
.node-row span, .node-row small { color: #7b8798; font-size: 12px; }
.node-row small { grid-column: 1 / -1; }
.node-proofs { grid-column: 1 / -1; display: flex; gap: 8px; flex-wrap: wrap; }
.node-proofs :deep(.el-image) { width: 88px; height: 88px; border-radius: 6px; }
.node-row.risk strong { color: #dc2626; }
.alert-hint { margin-top: 5px; color: #7b8798; font-size: 12px; line-height: 18px; }
</style>
