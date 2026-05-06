<template>
  <div class="page-container">
    <FilterBar @search="onSearch" @reset="onReset">
      <a-select v-model:value="filter.regionId" placeholder="区域" allow-clear style="width:200px" :options="regionOpts" :field-names="{ value: 'id', label: 'name' }" show-search option-filter-prop="name" />
      <a-select v-model:value="filter.type" placeholder="类型" allow-clear style="width:140px">
        <a-select-option value="commission">佣金收入</a-select-option>
        <a-select-option value="withdraw">提现支出</a-select-option>
        <a-select-option value="adjust">手动调整</a-select-option>
        <a-select-option value="reward">奖励</a-select-option>
      </a-select>
      <a-range-picker v-model:value="filter.dateRange" style="width:240px" value-format="YYYY-MM-DD" />
      <template #extra>
        <a-button type="primary" @click="onAdjust">调整余额</a-button>
      </template>
    </FilterBar>

    <div class="page-card">
      <div class="page-header"><span class="page-title">区域余额变动记录</span></div>
      <DataTable :columns="columns" :data-source="list" :loading="loading" :total="total" v-model:page="page" v-model:page-size="pageSize" @change="fetchList">
        <template #type="{ record }">
          <a-tag :color="typeColor(record.type)">{{ typeLabel(record.type) }}</a-tag>
        </template>
        <template #amount="{ record }">
          <span :style="{ color: Number(record.amount) >= 0 ? '#10b981' : '#ef4444', fontFamily: 'SF Mono, Monaco, monospace' }">
            {{ Number(record.amount) >= 0 ? '+' : '' }}¥{{ Math.abs(Number(record.amount)).toFixed(2) }}
          </span>
        </template>
        <template #balance="{ record }">
          <span style="font-family:'SF Mono',Monaco,monospace">¥{{ Number(record.balance).toFixed(2) }}</span>
        </template>
      </DataTable>
    </div>

    <!-- 调整余额 Modal -->
    <a-modal v-model:open="adjustVisible" title="调整区域余额" :confirm-loading="adjustLoading" @ok="onAdjustSubmit">
      <a-form layout="vertical">
        <a-form-item label="区域" required>
          <a-select v-model:value="adjustForm.regionId" placeholder="选择区域" :options="regionOpts" :field-names="{ value: 'id', label: 'name' }" show-search option-filter-prop="name" />
        </a-form-item>
        <a-form-item label="类型">
          <a-select v-model:value="adjustForm.type">
            <a-select-option value="commission">佣金收入</a-select-option>
            <a-select-option value="withdraw">提现支出</a-select-option>
            <a-select-option value="adjust">手动调整</a-select-option>
            <a-select-option value="reward">奖励</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="金额 (元)" required>
          <a-input-number v-model:value="adjustForm.amount" :precision="2" style="width:100%" placeholder="正数增加、负数减少" />
        </a-form-item>
        <a-form-item label="备注">
          <a-textarea v-model:value="adjustForm.description" :rows="2" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { message } from 'ant-design-vue'
import { financeApi } from '@/api/finance'
import { shopApi } from '@/api/shop'
import FilterBar from '@/components/common/FilterBar.vue'
import DataTable from '@/components/common/DataTable.vue'

const loading = ref(false)
const list = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const filter = reactive({ regionId: undefined as string | undefined, type: undefined as string | undefined, dateRange: undefined as any })
const regionOpts = ref<any[]>([])

const columns = [
  { title: '区域', dataIndex: 'regionName', width: 140 },
  { title: '类型', dataIndex: 'type', width: 90, slot: 'type' },
  { title: '变动金额', dataIndex: 'amount', width: 120, slot: 'amount' },
  { title: '变动后余额', dataIndex: 'balance', width: 130, slot: 'balance' },
  { title: '关联单号', dataIndex: 'orderNo', width: 180, ellipsis: true },
  { title: '备注', dataIndex: 'description', width: 160, ellipsis: true },
  { title: '操作人', dataIndex: 'operatorName', width: 100 },
  { title: '时间', dataIndex: 'createdAt', width: 160 },
]

function typeColor(t: string) { return t === 'commission' ? 'blue' : t === 'withdraw' ? 'orange' : t === 'adjust' ? 'purple' : 'green' }
function typeLabel(t: string) { return t === 'commission' ? '佣金' : t === 'withdraw' ? '提现' : t === 'adjust' ? '调整' : t === 'reward' ? '奖励' : t }

async function fetchList() {
  loading.value = true
  try {
    const params: any = { page: page.value, pageSize: pageSize.value, regionId: filter.regionId, type: filter.type }
    if (filter.dateRange?.length === 2) { params.startAt = filter.dateRange[0]; params.endAt = filter.dateRange[1] }
    const res = await financeApi.getRegionBalanceLogs(params)
    list.value = (res.data?.data?.list || res.data?.list || []) as any[]
    total.value = res.data?.data?.total || res.data?.total || 0
  } finally { loading.value = false }
}

async function loadRegions() {
  try {
    const res = await shopApi.getMerchantList({ page: 1, pageSize: 1000 })
    const merchants = (res.data?.data?.list || res.data?.list || []) as any[]
    const map = new Map<string, any>()
    merchants.forEach((m: any) => { if (m.regionId && !map.has(m.regionId)) map.set(m.regionId, { id: m.regionId, name: m.regionName || m.regionId }) })
    regionOpts.value = Array.from(map.values())
  } catch { /* ignore */ }
}

function onSearch() { page.value = 1; fetchList() }
function onReset() { filter.regionId = undefined; filter.type = undefined; filter.dateRange = undefined; onSearch() }

// Adjust
const adjustVisible = ref(false)
const adjustLoading = ref(false)
const adjustForm = reactive({ regionId: undefined as string | undefined, amount: 0, type: 'adjust', description: '' })

function onAdjust() { Object.assign(adjustForm, { regionId: undefined, amount: 0, type: 'adjust', description: '' }); adjustVisible.value = true }

async function onAdjustSubmit() {
  if (!adjustForm.regionId || adjustForm.amount === 0) return message.warning('请选择区域并输入金额')
  adjustLoading.value = true
  try {
    await financeApi.adjustRegionBalance(adjustForm as any)
    message.success('调整成功')
    adjustVisible.value = false
    fetchList()
  } finally { adjustLoading.value = false }
}

loadRegions()
fetchList()
</script>
