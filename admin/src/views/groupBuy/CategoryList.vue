<template>
  <div class="page-container">
    <FilterBar @search="onSearch" @reset="onReset">
      <a-select v-model:value="filter.regionId" placeholder="区域" allow-clear style="width:180px" :options="regionOpts" :field-names="{ value: 'id', label: 'name' }" show-search option-filter-prop="name" />
      <template #extra>
        <a-button type="primary" @click="onCreate"><plus-outlined />新增分类</a-button>
      </template>
    </FilterBar>

    <div class="page-card">
      <div class="page-header"><span class="page-title">分类管理</span></div>
      <DataTable :columns="columns" :data-source="list" :loading="loading" :total="total" v-model:page="page" v-model:page-size="pageSize" @change="fetchList">
        <template #icon="{ record }">
          <a-image v-if="record.icon" :src="record.icon" :width="40" :height="40" style="object-fit:cover;border-radius:4px" />
          <span v-else style="color:#ccc">-</span>
        </template>
        <template #status="{ record }">
          <a-switch :checked="record.status === 'active'" checked-children="启用" un-checked-children="禁用" @change="(val: boolean) => onToggleStatus(record, val)" />
        </template>
        <template #action="{ record }">
          <a-space>
            <a @click="onEdit(record)">编辑</a>
            <a-popconfirm title="确定删除此分类？" @confirm="onDelete(record.id)">
              <a style="color:#ff4f4f">删除</a>
            </a-popconfirm>
          </a-space>
        </template>
      </DataTable>
    </div>

    <a-modal v-model:open="visible" :title="editingId ? '编辑分类' : '新增分类'" :confirm-loading="submitting" @ok="onSubmit">
      <a-form layout="vertical">
        <a-form-item label="名称" required>
          <a-input v-model:value="form.name" placeholder="分类名称" />
        </a-form-item>
        <a-form-item label="图标 URL">
          <a-input v-model:value="form.icon" placeholder="图标链接" />
        </a-form-item>
        <a-form-item label="排序">
          <a-input-number v-model:value="form.sortOrder" :min="0" style="width:100%" />
        </a-form-item>
        <a-form-item label="状态">
          <a-select v-model:value="form.status">
            <a-select-option value="active">启用</a-select-option>
            <a-select-option value="inactive">禁用</a-select-option>
          </a-select>
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { message } from 'ant-design-vue'
import { groupBuyApi } from '@/api'
import { useUserStore } from '@/stores/user'
import { shopApi } from '@/api/shop'
import FilterBar from '@/components/common/FilterBar.vue'
import DataTable from '@/components/common/DataTable.vue'

const userStore = useUserStore()
const loading = ref(false)
const list = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const filter = reactive({ regionId: userStore.regionId || undefined as string | undefined })
const regionOpts = ref<any[]>([])
const visible = ref(false)
const editingId = ref('')
const submitting = ref(false)
const form = reactive({ name: '', icon: '', sortOrder: 0, status: 'active' })

const columns = [
  { title: '图标', dataIndex: 'icon', width: 60, slot: 'icon' },
  { title: '名称', dataIndex: 'name', width: 160 },
  { title: '排序', dataIndex: 'sortOrder', width: 80 },
  { title: '状态', dataIndex: 'status', width: 80, slot: 'status' },
  { title: '创建时间', dataIndex: 'createdAt', width: 160 },
  { title: '操作', dataIndex: 'action', width: 120, slot: 'action', fixed: 'right' },
]

async function fetchList() {
  loading.value = true
  try {
    const res = await groupBuyApi.getCategories({ page: page.value, pageSize: pageSize.value, regionId: filter.regionId })
    list.value = res.data?.list || []
    total.value = res.data?.total || 0
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

function onCreate() {
  editingId.value = ''
  Object.assign(form, { name: '', icon: '', sortOrder: 0, status: 'active' })
  visible.value = true
}

function onEdit(record: any) {
  editingId.value = record.id
  Object.assign(form, { name: record.name, icon: record.icon || '', sortOrder: record.sortOrder || 0, status: record.status || 'active' })
  visible.value = true
}

async function onToggleStatus(record: any, val: boolean) {
  try {
    await groupBuyApi.updateCategory(record.id, { status: val ? 'active' : 'inactive' })
    message.success('状态已更新')
    fetchList()
  } catch { /* ignore */ }
}

async function onSubmit() {
  if (!form.name) return message.warning('请输入名称')
  submitting.value = true
  try {
    const payload = { ...form, regionId: filter.regionId || userStore.regionId }
    if (editingId.value) {
      await groupBuyApi.updateCategory(editingId.value, payload)
    } else {
      await groupBuyApi.createCategory(payload)
    }
    message.success('保存成功')
    visible.value = false
    fetchList()
  } finally { submitting.value = false }
}

async function onDelete(id: string) {
  try {
    await groupBuyApi.deleteCategory(id)
    message.success('已删除')
    fetchList()
  } catch { /* ignore */ }
}

loadRegions()
fetchList()
</script>
