<template>
  <div class="page-container">
    <FilterBar @search="onSearch" @reset="onReset">
      <a-select v-model:value="filter.couponId" placeholder="优惠券" allow-clear show-search option-filter-prop="name" style="width:200px" :options="couponOpts" :field-names="{ value: 'id', label: 'name' }" />
      <a-input v-model:value="filter.userId" placeholder="用户ID" allow-clear style="width:150px" />
      <a-select v-model:value="filter.status" placeholder="状态" allow-clear style="width:120px">
        <a-select-option value="unused">未使用</a-select-option>
        <a-select-option value="used">已使用</a-select-option>
        <a-select-option value="expired">已过期</a-select-option>
      </a-select>
      <a-range-picker v-model:value="filter.dateRange" style="width:240px" value-format="YYYY-MM-DD" />
    </FilterBar>

    <div class="page-card">
      <div class="page-header"><span class="page-title">优惠券使用记录</span></div>
      <DataTable :columns="columns" :data-source="list" :loading="loading" :total="total" v-model:page="page" v-model:page-size="pageSize" @change="fetchList">
        <template #user="{ record }">
          <a-space>
            <a-avatar v-if="record.user?.avatar" :src="record.user.avatar" :size="24" />
            <span>{{ record.user?.nickname || record.userId }}</span>
          </a-space>
        </template>
        <template #couponName="{ record }">
          <span>{{ record.coupon?.name || record.couponId }}</span>
        </template>
        <template #couponType="{ record }">
          <a-tag :color="typeColor(record.coupon?.type)">{{ typeLabel(record.coupon?.type) }}</a-tag>
        </template>
        <template #status="{ record }">
          <a-tag :color="usageStatusColor(record.status)">{{ usageStatusLabel(record.status) }}</a-tag>
        </template>
        <template #usedAt="{ record }">{{ record.usedAt || '-' }}</template>
        <template #orderNo="{ record }">
          <span style="font-family:'SF Mono',Monaco,monospace;font-size:12px">{{ record.orderNo || '-' }}</span>
        </template>
      </DataTable>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { marketingApi } from '@/api/marketing'
import FilterBar from '@/components/common/FilterBar.vue'
import DataTable from '@/components/common/DataTable.vue'

const loading = ref(false)
const list = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const filter = reactive({ couponId: undefined as string | undefined, userId: '', status: undefined as string | undefined, dateRange: undefined as any })
const couponOpts = ref<any[]>([])

const columns = [
  { title: '用户', dataIndex: 'userNickname', width: 140, slot: 'user' },
  { title: '优惠券', dataIndex: 'couponName', width: 160, slot: 'couponName', ellipsis: true },
  { title: '类型', dataIndex: 'couponType', width: 70, slot: 'couponType' },
  { title: '状态', dataIndex: 'status', width: 80, slot: 'status' },
  { title: '使用时间', dataIndex: 'usedAt', width: 160, slot: 'usedAt' },
  { title: '关联订单', dataIndex: 'orderNo', width: 180, slot: 'orderNo' },
  { title: '领取时间', dataIndex: 'createdAt', width: 160 },
]

function typeColor(t: string) { return t === 'FULL_REDUCTION' ? 'blue' : t === 'DISCOUNT' ? 'green' : 'purple' }
function typeLabel(t: string) { return t === 'FULL_REDUCTION' ? '满减' : t === 'DISCOUNT' ? '折扣' : t === 'EXCHANGE' ? '兑换' : t || '-' }
function usageStatusColor(s: string) { return s === 'used' ? 'green' : s === 'unused' ? 'blue' : 'orange' }
function usageStatusLabel(s: string) { return s === 'used' ? '已使用' : s === 'unused' ? '未使用' : s === 'expired' ? '已过期' : s }

async function fetchList() {
  loading.value = true
  try {
    const params: any = { page: page.value, pageSize: pageSize.value, couponId: filter.couponId, userId: filter.userId || undefined, status: filter.status }
    if (filter.dateRange?.length === 2) { params.startDate = filter.dateRange[0]; params.endDate = filter.dateRange[1] }
    const res = await marketingApi.getCouponUsageList(params)
    list.value = (res.data?.data?.list || res.data?.list || []) as any[]
    total.value = res.data?.data?.total || res.data?.total || 0
  } finally { loading.value = false }
}

async function loadCoupons() {
  try {
    const res = await marketingApi.getCouponList({ page: 1, pageSize: 500 })
    couponOpts.value = (res.data?.data?.list || res.data?.list || []) as any[]
  } catch { /* ignore */ }
}

function onSearch() { page.value = 1; fetchList() }
function onReset() { filter.couponId = undefined; filter.userId = ''; filter.status = undefined; filter.dateRange = undefined; onSearch() }

loadCoupons()
fetchList()
</script>
