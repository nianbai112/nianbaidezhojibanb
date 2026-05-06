<template>
  <div class="page-container">
    <!-- 筛选栏 -->
    <FilterBar @search="onSearch" @reset="onReset" show-expand>
      <a-input v-model:value="filter.orderNo" placeholder="订单号" allow-clear style="width:180px" />
      <a-input v-model:value="filter.keyword" placeholder="用户/收货人/电话" allow-clear style="width:180px" />
      <a-select v-model:value="filter.regionId" placeholder="区域" allow-clear style="width:140px" :options="regionOpts" />
      <a-select v-model:value="filter.status" placeholder="订单状态" allow-clear style="width:140px">
        <a-select-option value="pending_pay">待支付</a-select-option>
        <a-select-option value="paid">已支付</a-select-option>
        <a-select-option value="shipped">已发货</a-select-option>
        <a-select-option value="delivered">已送达</a-select-option>
        <a-select-option value="completed">已完成</a-select-option>
        <a-select-option value="cancelled">已取消</a-select-option>
        <a-select-option value="refunding">退款中</a-select-option>
        <a-select-option value="refunded">已退款</a-select-option>
      </a-select>
      <a-select v-model:value="filter.payStatus" placeholder="支付状态" allow-clear style="width:130px">
        <a-select-option value="paid">已支付</a-select-option>
        <a-select-option value="pending">待支付</a-select-option>
        <a-select-option value="refunding">退款中</a-select-option>
        <a-select-option value="refunded">已退款</a-select-option>
      </a-select>
      <template #expand>
        <a-range-picker v-model:value="filter.dateRange" style="width:240px" />
      </template>
    </FilterBar>

    <!-- 表格卡片 -->
    <div class="page-card">
      <DataTable
        :columns="columns"
        :data-source="list"
        :loading="loading"
        :total="total"
        v-model:page="page"
        v-model:page-size="pageSize"
        size="small"
        bordered
      >
        <template #user="{ record }">
          <a-space :size="8">
            <a-avatar :src="record.userAvatar" :size="28" />
            <span>{{ record.userNickname || '-' }}</span>
          </a-space>
        </template>
        <template #amount="{ record }">
          <span class="money">¥{{ record.payAmount.toFixed(2) }}</span>
        </template>
        <template #status="{ record }">
          <StatusTag :status="record.status" type="order" />
        </template>
        <template #payStatus="{ record }">
          <StatusTag :status="record.payStatus" type="payment" />
        </template>
        <template #time="{ record }">
          <span class="time-text">{{ formatTime(record.createdAt) }}</span>
        </template>
        <template #action="{ record }">
          <a-space :size="4">
            <a-button type="link" size="small" @click="$router.push(`/shop/order/${record.id}`)">详情</a-button>
            <a-dropdown>
              <a-button type="link" size="small">更多 <DownOutlined /></a-button>
              <template #overlay>
                <a-menu @click="(e:any) => onAction(e.key, record)">
                  <a-menu-item key="status">更改状态</a-menu-item>
                  <a-menu-item key="cancel" :disabled="record.status==='completed'||record.status==='cancelled'" :danger="true">取消订单</a-menu-item>
                  <a-menu-item key="refund" :disabled="record.refundStatus!=='none'&&record.refundStatus!==undefined">处理退款</a-menu-item>
                  <a-menu-item key="remark">添加备注</a-menu-item>
                </a-menu>
              </template>
            </a-dropdown>
          </a-space>
        </template>
      </DataTable>
    </div>

    <!-- 状态变更弹窗 -->
    <a-modal v-model:visible="statusModal.visible" title="更改订单状态" @ok="doStatusChange" :confirm-loading="statusModal.loading" width="380">
      <a-form :label-col="{ span: 6 }">
        <a-form-item label="当前状态">
          <a-tag>{{ statusModal.record?.status }}</a-tag>
        </a-form-item>
        <a-form-item label="目标状态">
          <a-select v-model:value="statusModal.targetStatus" style="width:100%">
            <a-select-option v-for="s in statusModal.allowTransitions" :key="s" :value="s">{{ statusLabel(s) }}</a-select-option>
          </a-select>
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 取消订单弹窗 -->
    <a-modal v-model:visible="cancelModal.visible" title="取消订单" @ok="doCancel" :confirm-loading="cancelModal.loading" width="400">
      <a-form-item label="取消原因">
        <a-textarea v-model:value="cancelModal.reason" placeholder="请输入取消原因" :rows="3" />
      </a-form-item>
    </a-modal>

    <!-- 退款弹窗 -->
    <a-modal v-model:visible="refundModal.visible" title="处理退款" @ok="doRefund" :confirm-loading="refundModal.loading" width="420">
      <a-descriptions :column="1" size="small" bordered>
        <a-descriptions-item label="订单号">{{ refundModal.record?.orderNo }}</a-descriptions-item>
        <a-descriptions-item label="实付金额">¥{{ refundModal.record?.payAmount?.toFixed(2) }}</a-descriptions-item>
      </a-descriptions>
      <a-form-item label="退款金额" style="margin-top:12px">
        <a-input-number v-model:value="refundModal.amount" :min="0" :max="refundModal.record?.payAmount" style="width:100%" prefix="¥" />
      </a-form-item>
      <a-form-item label="退款原因">
        <a-textarea v-model:value="refundModal.reason" placeholder="请输入退款原因" :rows="2" />
      </a-form-item>
      <a-form-item label="操作">
        <a-radio-group v-model:value="refundModal.action">
          <a-radio value="approve">同意退款</a-radio>
          <a-radio value="reject">拒绝退款</a-radio>
        </a-radio-group>
      </a-form-item>
    </a-modal>

    <!-- 备注弹窗 -->
    <a-modal v-model:visible="remarkModal.visible" title="添加备注" @ok="doRemark" :confirm-loading="remarkModal.loading" width="400">
      <a-textarea v-model:value="remarkModal.content" placeholder="请输入备注内容" :rows="4" />
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { DownOutlined } from '@ant-design/icons-vue'
import { shopApi } from '@/api/shop'
import { areaApi } from '@/api/area'
import { formatTime, formatMoney } from '@/utils/format'
import FilterBar from '@/components/common/FilterBar.vue'
import DataTable from '@/components/common/DataTable.vue'
import StatusTag from '@/components/common/StatusTag.vue'
import type { Dayjs } from 'dayjs'

const loading = ref(false)
const list = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const regionOpts = ref<{ label: string; value: string }[]>([])

const filter = reactive({
  orderNo: '',
  keyword: '',
  regionId: undefined as string | undefined,
  status: undefined as string | undefined,
  payStatus: undefined as string | undefined,
  dateRange: undefined as [Dayjs, Dayjs] | undefined,
})

const columns: any[] = [
  { title: '订单号', dataIndex: 'orderNo', width: 180 },
  { title: '用户', dataIndex: 'user', width: 130, slot: 'user' },
  { title: '商品', dataIndex: 'productName', width: 200, ellipsis: true },
  { title: '数量', dataIndex: 'quantity', width: 60, align: 'center' },
  { title: '金额', dataIndex: 'amount', width: 100, slot: 'amount', align: 'right' },
  { title: '订单状态', dataIndex: 'status', width: 90, slot: 'status', align: 'center' },
  { title: '支付状态', dataIndex: 'payStatus', width: 90, slot: 'payStatus', align: 'center' },
  { title: '区域', dataIndex: 'regionName', width: 90 },
  { title: '下单时间', dataIndex: 'time', width: 160, slot: 'time' },
  { title: '操作', dataIndex: 'action', width: 120, slot: 'action', fixed: 'right' },
]

// 状态流转映射
const statusTransitions: Record<string, string[]> = {
  pending_pay: ['paid', 'cancelled'],
  paid: ['shipped', 'refunding', 'cancelled'],
  shipped: ['delivered', 'refunding'],
  delivered: ['completed', 'refunding'],
  completed: [],
  cancelled: [],
  refunding: ['refunded'],
  refunded: [],
}

function statusLabel(s: string) {
  const map: Record<string, string> = {
    pending_pay: '待支付', paid: '已支付', shipped: '已发货',
    delivered: '已送达', completed: '已完成', cancelled: '已取消',
    refunding: '退款中', refunded: '已退款',
  }
  return map[s] || s
}

// 弹窗状态
const statusModal = reactive({ visible: false, loading: false, record: null as any, targetStatus: '', allowTransitions: [] as string[] })
const cancelModal = reactive({ visible: false, loading: false, record: null as any, reason: '' })
const refundModal = reactive({ visible: false, loading: false, record: null as any, amount: 0, reason: '', action: 'approve' as string })
const remarkModal = reactive({ visible: false, loading: false, record: null as any, content: '' })

async function fetchRegions() {
  try {
    const res = await areaApi.getList({ page: 1, pageSize: 100 })
    const body: any = res.data?.data || res.data || {}
    const regions = body.list || body.data || []
    regionOpts.value = (regions as any[]).map((r: any) => ({ label: r.name, value: r.id }))
  } catch { /* ignore */ }
}

async function fetchList() {
  loading.value = true
  try {
    const params: any = {
      page: page.value,
      pageSize: pageSize.value,
      orderNo: filter.orderNo || undefined,
      keyword: filter.keyword || undefined,
      regionId: filter.regionId || undefined,
      status: filter.status || undefined,
      payStatus: filter.payStatus || undefined,
    }
    if (filter.dateRange) {
      params.startAt = filter.dateRange[0].format('YYYY-MM-DD')
      params.endAt = filter.dateRange[1].format('YYYY-MM-DD')
    }
    const res = await shopApi.getOrderList(params)
    const body: any = res.data?.data || res.data || {}
    list.value = body.list || []
    total.value = body.total || 0
  } catch { /* handled */ } finally { loading.value = false }
}

function onSearch() { page.value = 1; fetchList() }
function onReset() {
  filter.orderNo = ''
  filter.keyword = ''
  filter.regionId = undefined
  filter.status = undefined
  filter.payStatus = undefined
  filter.dateRange = undefined
  onSearch()
}

function onAction(key: string, record: any) {
  switch (key) {
    case 'status':
      statusModal.record = record
      statusModal.targetStatus = ''
      statusModal.allowTransitions = statusTransitions[record.status] || []
      statusModal.visible = true
      break
    case 'cancel':
      cancelModal.record = record
      cancelModal.reason = ''
      cancelModal.visible = true
      break
    case 'refund':
      refundModal.record = record
      refundModal.amount = record.payAmount || 0
      refundModal.reason = ''
      refundModal.action = 'approve'
      refundModal.visible = true
      break
    case 'remark':
      remarkModal.record = record
      remarkModal.content = ''
      remarkModal.visible = true
      break
  }
}

async function doStatusChange() {
  if (!statusModal.targetStatus) { message.warning('请选择目标状态'); return }
  statusModal.loading = true
  try {
    await shopApi.updateOrderStatus(statusModal.record.id, statusModal.targetStatus)
    message.success('状态更新成功')
    statusModal.visible = false
    fetchList()
  } catch { /* handled */ } finally { statusModal.loading = false }
}

async function doCancel() {
  cancelModal.loading = true
  try {
    await shopApi.cancelOrder(cancelModal.record.id, cancelModal.reason || '管理员取消')
    message.success('订单已取消')
    cancelModal.visible = false
    fetchList()
  } catch { /* handled */ } finally { cancelModal.loading = false }
}

async function doRefund() {
  refundModal.loading = true
  try {
    if (refundModal.action === 'approve') {
      await shopApi.approveRefund(refundModal.record.id, refundModal.reason)
      message.success('退款已批准')
    } else {
      await shopApi.rejectRefund(refundModal.record.id, refundModal.reason)
      message.success('已拒绝退款')
    }
    refundModal.visible = false
    fetchList()
  } catch { /* handled */ } finally { refundModal.loading = false }
}

async function doRemark() {
  remarkModal.loading = true
  try {
    await shopApi.updateOrderStatus(remarkModal.record.id, remarkModal.record.status)
    message.success('备注已保存')
    remarkModal.visible = false
  } catch { /* handled */ } finally { remarkModal.loading = false }
}

onMounted(() => {
  fetchRegions()
  fetchList()
})
</script>

<style lang="less" scoped>
.money { font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace; color: #374151; }
.time-text { font-size: 12px; color: #6b7280; }
</style>
