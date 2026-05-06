<template>
  <div class="page-container">
    <FilterBar @search="onSearch" @reset="onReset">
      <a-input v-model:value="f.orderNo" placeholder="订单号" allow-clear style="width:180px" />
      <a-input v-model:value="f.buyerId" placeholder="买家ID" allow-clear style="width:140px" />
      <a-input v-model:value="f.sellerId" placeholder="卖家ID" allow-clear style="width:140px" />
      <a-select v-model:value="f.status" placeholder="状态" allow-clear style="width:120px">
        <a-select-option value="pending_pay">待支付</a-select-option>
        <a-select-option value="paid">已支付</a-select-option>
        <a-select-option value="shipped">已发货</a-select-option>
        <a-select-option value="completed">已完成</a-select-option>
        <a-select-option value="cancelled">已取消</a-select-option>
        <a-select-option value="refunded">已退款</a-select-option>
      </a-select>
    </FilterBar>
    <div class="page-card">
      <DataTable :columns="cols" :data-source="list" :loading="ld" :total="t" v-model:page="p" v-model:page-size="ps">
        <template #price="{ record }">{{ (Number(record.price)).toFixed(2) }}</template>
        <template #status="{ record }">
          <a-tag :color="statusColor(record.status)">{{ statusLabel(record.status) }}</a-tag>
        </template>
      </DataTable>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { secondHandApi } from '@/api/secondHand'
import FilterBar from '@/components/common/FilterBar.vue'
import DataTable from '@/components/common/DataTable.vue'

const ld = ref(false), list = ref<any[]>([]), t = ref(0), p = ref(1), ps = ref(20)
const f = reactive({ orderNo: '', buyerId: '', sellerId: '', status: undefined as string | undefined })

const statusMap: Record<string, string> = {
  pending_pay: '待支付', paid: '已支付', shipped: '已发货', completed: '已完成', cancelled: '已取消', refunded: '已退款',
}
const statusColor = (s: string) => {
  const m: Record<string, string> = { pending_pay: 'orange', paid: 'blue', shipped: 'cyan', completed: 'green', cancelled: 'default', refunded: 'red' }
  return m[s] || 'default'
}
const statusLabel = (s: string) => statusMap[s] || s

const cols = [
  { title: '订单号', dataIndex: 'orderNo', width: 180 },
  { title: '买家ID', dataIndex: 'buyerId', width: 130 },
  { title: '卖家ID', dataIndex: 'sellerId', width: 130 },
  { title: '金额', dataIndex: 'price', width: 90, slot: 'price' },
  { title: '状态', dataIndex: 'status', width: 90, slot: 'status' },
  { title: '支付渠道', dataIndex: 'payChannel', width: 100 },
  { title: '创建时间', dataIndex: 'createdAt', width: 160 },
]

async function fetchList() {
  ld.value = true
  try {
    const r = await secondHandApi.getOrderList({
      page: p.value, pageSize: ps.value,
      orderNo: f.orderNo || undefined,
      buyerId: f.buyerId || undefined,
      sellerId: f.sellerId || undefined,
      status: f.status,
    })
    const data = r.data as any
    list.value = data.list || data.data?.list || []
    t.value = data.total || data.data?.total || 0
  } catch { /* ignore */ }
  finally { ld.value = false }
}

function onSearch() { p.value = 1; fetchList() }
function onReset() { f.orderNo = ''; f.buyerId = ''; f.sellerId = ''; f.status = undefined; onSearch() }

fetchList()
</script>
