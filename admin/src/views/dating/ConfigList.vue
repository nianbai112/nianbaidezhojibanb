<template>
  <div class="page-container">
    <FilterBar @search="onSearch" @reset="onReset">
      <a-select v-model:value="filter.regionId" placeholder="区域" allow-clear style="width:160px" :options="regionOpts" :field-names="{ value: 'id', label: 'name' }" show-search option-filter-prop="name" />
    </FilterBar>

    <div class="page-card">
      <div class="page-header"><span class="page-title">配置管理</span></div>
      <DataTable :columns="columns" :data-source="list" :loading="loading" :total="total" v-model:page="page" v-model:page-size="pageSize" @change="fetchList">
        <template #isOpen="{ record }">
          <a-switch :checked="record.isOpen" size="small" @change="(v: boolean) => onToggleOpen(record, v)" />
        </template>
        <template #price="{ record }">{{ fmt(record.price) }}</template>
        <template #requireAudit="{ record }">
          <a-tag :color="record.requireAudit ? 'blue' : 'default'">{{ record.requireAudit ? '是' : '否' }}</a-tag>
        </template>
        <template #action="{ record }">
          <a @click="onEdit(record)">编辑</a>
        </template>
      </DataTable>
    </div>

    <a-modal v-model:open="modalVisible" title="编辑配置" width="520px" :confirm-loading="submitLoading" @ok="onSubmit">
      <a-form layout="vertical">
        <a-form-item label="开启匹配">
          <a-switch v-model:checked="form.isOpen" />
        </a-form-item>
        <a-form-item label="匹配价格(元)">
          <a-input-number v-model:value="form.price" :min="0" :precision="2" style="width:100%" />
        </a-form-item>
        <a-form-item label="每日匹配上限">
          <a-input-number v-model:value="form.dailyMatchLimit" :min="1" style="width:100%" />
        </a-form-item>
        <a-form-item label="需要审核">
          <a-switch v-model:checked="form.requireAudit" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { message } from 'ant-design-vue'
import { datingApi } from '@/api/dating'
import { shopApi } from '@/api/shop'
import FilterBar from '@/components/common/FilterBar.vue'
import DataTable from '@/components/common/DataTable.vue'

const loading = ref(false)
const list = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const filter = reactive({ regionId: undefined as string | undefined })
const regionOpts = ref<any[]>([])

const columns = [
  { title: '区域', dataIndex: 'regionId', width: 160 },
  { title: '开启', dataIndex: 'isOpen', width: 70, slot: 'isOpen' },
  { title: '价格(元)', dataIndex: 'price', width: 100, slot: 'price' },
  { title: '每日上限', dataIndex: 'dailyMatchLimit', width: 80 },
  { title: '审核', dataIndex: 'requireAudit', width: 70, slot: 'requireAudit' },
  { title: '更新时间', dataIndex: 'updatedAt', width: 160 },
  { title: '操作', dataIndex: 'action', width: 80, slot: 'action', fixed: 'right' },
]

function fmt(v: any) { const n = Number(v); return Number.isNaN(n) ? '0.00' : n.toFixed(2) }

async function fetchList() {
  loading.value = true
  try {
    const params: any = { page: page.value, pageSize: pageSize.value, regionId: filter.regionId }
    const res = await datingApi.getConfigList(params)
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
function onReset() { filter.regionId = undefined; onSearch() }

async function onToggleOpen(record: any, v: boolean) {
  try {
    await datingApi.updateConfig(record.id, { isOpen: v })
    message.success(v ? '已开启' : '已关闭')
    fetchList()
  } catch { message.error('操作失败') }
}

const modalVisible = ref(false)
const editId = ref('')
const submitLoading = ref(false)
const form = reactive({ isOpen: true, price: 0, dailyMatchLimit: 10, requireAudit: true })

function onEdit(record: any) {
  editId.value = record.id
  form.isOpen = record.isOpen
  form.price = Number(record.price)
  form.dailyMatchLimit = record.dailyMatchLimit
  form.requireAudit = record.requireAudit
  modalVisible.value = true
}

async function onSubmit() {
  submitLoading.value = true
  try {
    await datingApi.updateConfig(editId.value, { ...form })
    message.success('已更新')
    modalVisible.value = false
    fetchList()
  } finally { submitLoading.value = false }
}

loadRegions()
fetchList()
</script>
