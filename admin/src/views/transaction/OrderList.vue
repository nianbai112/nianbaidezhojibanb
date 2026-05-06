<template>
  <div class="page-container">
    <FilterBar @search="onSearch" @reset="onReset">
      <a-input v-model:value="filter.orderNo" placeholder="订单号" allow-clear style="width:200px" />
      <a-input v-model:value="filter.keyword" placeholder="用户/商品关键词" allow-clear style="width:180px" />
      <a-select v-model:value="filter.status" placeholder="状态" allow-clear style="width:130px">
        <a-select-option value="pending_pay">待支付</a-select-option>
        <a-select-option value="pending_deliver">待发货</a-select-option>
        <a-select-option value="delivering">配送中</a-select-option>
        <a-select-option value="delivered">已送达</a-select-option>
        <a-select-option value="completed">已完成</a-select-option>
        <a-select-option value="cancelled">已取消</a-select-option>
        <a-select-option value="refunding">退款中</a-select-option>
        <a-select-option value="refunded">已退款</a-select-option>
      </a-select>
      <a-range-picker v-model:value="filter.dateRange" style="width:240px" />
    </FilterBar>

    <div class="page-card">
      <DataTable
        :columns="columns"
        :data-source="list"
        :loading="loading"
        :total="total"
        v-model:page="page"
        v-model:page-size="pageSize"
        @change="onTableChange"
      >
        <template #status="{ record }"><StatusTag :status="record.status" type="order" /></template>
        <template #payAmount="{ record }"><span class="money">¥{{ formatMoney(record.payAmount) }}</span></template>
        <template #action="{ record }">
          <a-button type="link" size="small" @click="openDetail(record)">详情</a-button>
        </template>
      </DataTable>
    </div>

    <!-- Detail Drawer -->
    <a-drawer
      :open="drawerVisible"
      title="订单详情"
      :width="560"
      @close="drawerVisible = false"
    >
      <template v-if="detail">
        <a-descriptions :column="1" bordered size="small" class="detail-desc">
          <a-descriptions-item label="订单号">{{ detail.orderNo }}</a-descriptions-item>
          <a-descriptions-item label="状态"><StatusTag :status="detail.status" type="order" /></a-descriptions-item>
          <a-descriptions-item label="用户">{{ detail.userNickname }}</a-descriptions-item>
          <a-descriptions-item label="商家">{{ detail.merchantName }}</a-descriptions-item>
          <a-descriptions-item label="商品">{{ detail.productName }}</a-descriptions-item>
          <a-descriptions-item label="规格">{{ detail.skuName || '-' }}</a-descriptions-item>
          <a-descriptions-item label="数量">{{ detail.quantity }}</a-descriptions-item>
          <a-descriptions-item label="单价">¥{{ formatMoney(detail.unitPrice) }}</a-descriptions-item>
          <a-descriptions-item label="总价">¥{{ formatMoney(detail.totalAmount) }}</a-descriptions-item>
          <a-descriptions-item label="优惠">¥{{ formatMoney(detail.discountAmount) }}</a-descriptions-item>
          <a-descriptions-item label="运费">¥{{ formatMoney(detail.freightAmount) }}</a-descriptions-item>
          <a-descriptions-item label="实付金额"><span class="money">¥{{ formatMoney(detail.payAmount) }}</span></a-descriptions-item>
          <a-descriptions-item label="支付方式">{{ detail.payMethod || '-' }}</a-descriptions-item>
          <a-descriptions-item label="收货人">{{ detail.receiverName }} {{ detail.receiverPhone }}</a-descriptions-item>
          <a-descriptions-item label="收货地址">{{ detail.receiverAddress }}</a-descriptions-item>
          <a-descriptions-item label="买家备注">{{ detail.buyerRemark || '-' }}</a-descriptions-item>
          <a-descriptions-item label="支付时间">{{ detail.payTime || '-' }}</a-descriptions-item>
          <a-descriptions-item label="发货时间">{{ detail.deliverTime || '-' }}</a-descriptions-item>
          <a-descriptions-item label="完成时间">{{ detail.completeTime || '-' }}</a-descriptions-item>
          <a-descriptions-item label="下单时间">{{ detail.createdAt }}</a-descriptions-item>
        </a-descriptions>

        <!-- Status Timeline -->
        <div class="timeline-title">状态轨迹</div>
        <a-timeline class="detail-timeline">
          <a-timeline-item v-if="detail.createdAt" color="blue">下单 {{ detail.createdAt }}</a-timeline-item>
          <a-timeline-item v-if="detail.payTime" color="green">支付 {{ detail.payTime }}</a-timeline-item>
          <a-timeline-item v-if="detail.deliverTime" color="cyan">发货 {{ detail.deliverTime }}</a-timeline-item>
          <a-timeline-item v-if="detail.completeTime" color="green">完成 {{ detail.completeTime }}</a-timeline-item>
          <a-timeline-item v-if="detail.status === 'cancelled'" color="red">已取消</a-timeline-item>
          <a-timeline-item v-if="detail.status === 'refunding' || detail.status === 'refunded'" color="purple">
            {{ detail.status === 'refunded' ? '已退款' : '退款中' }}
          </a-timeline-item>
        </a-timeline>
      </template>
      <div v-else class="empty-detail">
        <a-empty description="暂无数据" />
      </div>
    </a-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { message } from 'ant-design-vue'
import { shopApi } from '@/api/shop'
import { formatMoney } from '@/utils/format'
import FilterBar from '@/components/common/FilterBar.vue'
import DataTable from '@/components/common/DataTable.vue'
import StatusTag from '@/components/common/StatusTag.vue'
import type { Dayjs } from 'dayjs'

const loading = ref(false)
const list = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const filter = reactive({
  orderNo: '',
  keyword: '',
  status: undefined as string | undefined,
  dateRange: undefined as [Dayjs, Dayjs] | undefined,
})

const drawerVisible = ref(false)
const detailLoading = ref(false)
const detail = ref<any>(null)

const columns = [
  { title: '订单号', dataIndex: 'orderNo', width: 190 },
  { title: '用户', dataIndex: 'userNickname', width: 100 },
  { title: '商家', dataIndex: 'merchantName', width: 120, ellipsis: true },
  { title: '商品', dataIndex: 'productName', width: 180, ellipsis: true },
  { title: '实付金额', dataIndex: 'payAmount', width: 100, slot: 'payAmount' },
  { title: '状态', dataIndex: 'status', width: 90, slot: 'status' },
  { title: '下单时间', dataIndex: 'createdAt', width: 160 },
  { title: '操作', dataIndex: 'action', width: 70, slot: 'action', fixed: 'right' },
]

async function fetchList() {
  loading.value = true
  try {
    const params: any = { page: page.value, pageSize: pageSize.value, orderNo: filter.orderNo, keyword: filter.keyword, status: filter.status }
    if (filter.dateRange) {
      params.dateRange = [filter.dateRange[0].format('YYYY-MM-DD'), filter.dateRange[1].format('YYYY-MM-DD')]
    }
    const res = await shopApi.getOrderList(params)
    list.value = (res.data?.data?.list || res.data?.list || []) as any[]
    total.value = res.data?.data?.total || res.data?.total || 0
  } catch { /* handled */ } finally { loading.value = false }
}

function onSearch() { page.value = 1; fetchList() }
function onReset() { filter.orderNo = ''; filter.keyword = ''; filter.status = undefined; filter.dateRange = undefined; onSearch() }
function onTableChange() { fetchList() }

async function openDetail(record: any) {
  drawerVisible.value = true
  detail.value = null
  detailLoading.value = true
  try {
    const res = await shopApi.getOrderDetail(record.id)
    detail.value = res.data?.data || res.data || record
  } catch {
    detail.value = record
  } finally {
    detailLoading.value = false
  }
}

fetchList()
</script>

<style lang="less" scoped>
.money { font-family: 'SF Mono', Monaco, monospace; color: #374151; }
.detail-desc { margin-bottom: 20px; }
.timeline-title { font-weight: 600; font-size: 14px; margin-bottom: 12px; color: #1f2937; }
.detail-timeline { padding-left: 8px; }
.empty-detail { padding: 40px 0; }
</style>
