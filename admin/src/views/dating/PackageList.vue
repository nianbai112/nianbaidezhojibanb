<template>
  <div class="page-container">
    <FilterBar @search="onSearch" @reset="onReset">
      <a-select v-model:value="filter.regionId" placeholder="区域" allow-clear style="width:160px" :options="regionOpts" :field-names="{ value: 'id', label: 'name' }" show-search option-filter-prop="name" />
      <template #extra>
        <a-button type="primary" @click="onCreate">新建套餐</a-button>
      </template>
    </FilterBar>

    <div class="page-card">
      <div class="page-header"><span class="page-title">套餐管理</span></div>
      <DataTable :columns="columns" :data-source="list" :loading="loading" :total="total" v-model:page="page" v-model:page-size="pageSize" @change="fetchList">
        <template #price="{ record }">{{ fmt(record.price) }}</template>
        <template #region="{ record }">{{ record.region?.name || record.regionId || '-' }}</template>
        <template #action="{ record }">
          <a-space>
            <a @click="onEdit(record)">编辑</a>
            <a-popconfirm title="确定删除?" @confirm="onDelete(record.id)">
              <a style="color:#ef4444">删除</a>
            </a-popconfirm>
          </a-space>
        </template>
      </DataTable>
    </div>

    <a-modal v-model:open="modalVisible" :title="editId ? '编辑套餐' : '新建套餐'" width="600px" :confirm-loading="submitLoading" @ok="onSubmit">
      <a-form layout="vertical">
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="名称" required>
              <a-input v-model:value="form.name" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="区域">
              <a-select v-model:value="form.regionId" placeholder="选填" allow-clear :options="regionOpts" :field-names="{ value: 'id', label: 'name' }" show-search option-filter-prop="name" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="8">
            <a-form-item label="价格(元)" required>
              <a-input-number v-model:value="form.price" :min="0" :precision="2" style="width:100%" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="匹配次数">
              <a-input-number v-model:value="form.matchCount" :min="1" style="width:100%" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="有效天数">
              <a-input-number v-model:value="form.validDays" :min="1" style="width:100%" placeholder="0=永久" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="排序">
              <a-input-number v-model:value="form.sortOrder" style="width:100%" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item label="描述">
          <a-textarea v-model:value="form.description" :rows="2" />
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
  { title: '名称', dataIndex: 'name', width: 150 },
  { title: '区域', dataIndex: 'region', width: 120, slot: 'region' },
  { title: '价格', dataIndex: 'price', width: 90, slot: 'price' },
  { title: '匹配次数', dataIndex: 'matchCount', width: 80 },
  { title: '有效天数', dataIndex: 'validDays', width: 80, format: (v: any) => v ? `${v}天` : '永久' },
  { title: '排序', dataIndex: 'sortOrder', width: 60 },
  { title: '操作', dataIndex: 'action', width: 120, slot: 'action', fixed: 'right' },
]

function fmt(v: any) { const n = Number(v); return Number.isNaN(n) ? '0.00' : n.toFixed(2) }

async function fetchList() {
  loading.value = true
  try {
    const res = await datingApi.getPackageList({ page: page.value, pageSize: pageSize.value, regionId: filter.regionId })
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

async function onDelete(id: string) {
  try {
    await datingApi.deletePackage(id)
    message.success('已删除')
    fetchList()
  } catch { message.error('删除失败') }
}

// Modal
const modalVisible = ref(false)
const editId = ref('')
const submitLoading = ref(false)
const form = reactive({ name: '', regionId: undefined as string | undefined, price: 0, matchCount: 1, validDays: undefined as number | undefined, sortOrder: 0, description: '' })

function onCreate() { editId.value = ''; resetForm(); modalVisible.value = true }
function onEdit(record: any) {
  editId.value = record.id
  form.name = record.name
  form.regionId = record.regionId
  form.price = Number(record.price)
  form.matchCount = record.matchCount
  form.validDays = record.validDays
  form.sortOrder = record.sortOrder
  form.description = record.description || ''
  modalVisible.value = true
}
function resetForm() { Object.assign(form, { name: '', regionId: undefined, price: 0, matchCount: 1, validDays: undefined, sortOrder: 0, description: '' }) }

async function onSubmit() {
  if (!form.name) return message.warning('请输入名称')
  submitLoading.value = true
  try {
    const data: any = { ...form, regionId: form.regionId || undefined, description: form.description || undefined }
    if (editId.value) {
      await datingApi.updatePackage(editId.value, data)
      message.success('已更新')
    } else {
      await datingApi.createPackage(data)
      message.success('已创建')
    }
    modalVisible.value = false
    fetchList()
  } finally { submitLoading.value = false }
}

loadRegions()
fetchList()
</script>
