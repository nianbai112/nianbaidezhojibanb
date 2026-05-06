<template>
  <div class="page-container">
    <FilterBar @search="onSearch" @reset="onReset">
      <a-select v-model:value="filter.type" placeholder="类型" allow-clear style="width:120px">
        <a-select-option value="FULL_REDUCTION">满减</a-select-option>
        <a-select-option value="DISCOUNT">折扣</a-select-option>
        <a-select-option value="EXCHANGE">兑换</a-select-option>
      </a-select>
      <a-select v-model:value="filter.status" placeholder="状态" allow-clear style="width:120px">
        <a-select-option value="active">启用</a-select-option>
        <a-select-option value="inactive">停用</a-select-option>
      </a-select>
      <a-select v-model:value="filter.regionId" placeholder="区域" allow-clear style="width:160px" :options="regionOpts" :field-names="{ value: 'id', label: 'name' }" show-search option-filter-prop="name" />
      <a-input v-model:value="filter.keyword" placeholder="名称/兑换码" allow-clear style="width:180px" />
      <template #extra>
        <a-button type="primary" @click="onCreate">新建优惠券</a-button>
      </template>
    </FilterBar>

    <div class="page-card">
      <div class="page-header"><span class="page-title">优惠券管理</span></div>
      <DataTable :columns="columns" :data-source="list" :loading="loading" :total="total" v-model:page="page" v-model:page-size="pageSize" @change="fetchList">
        <template #type="{ record }">
          <a-tag :color="typeColor(record.type)">{{ typeLabel(record.type) }}</a-tag>
        </template>
        <template #value="{ record }">
          <span v-if="record.type === 'FULL_REDUCTION'">满{{ fmt(record.minAmount) }}减{{ fmt(record.value) }}</span>
          <span v-else-if="record.type === 'DISCOUNT'">{{ record.value }}折</span>
          <span v-else style="color:#8b5cf6">兑换</span>
        </template>
        <template #stats="{ record }">
          <span>领{{ record.receivedCount }}/用{{ record.usedCount }}/总{{ record.totalCount }}</span>
        </template>
        <template #period="{ record }">
          <span style="font-size:12px">{{ record.startAt?.slice(0,10) }} ~ {{ record.endAt?.slice(0,10) }}</span>
        </template>
        <template #status="{ record }">
          <a-switch :checked="record.status === 'active'" size="small" @change="onToggle(record)" />
        </template>
        <template #action="{ record }">
          <a-space>
            <a @click="onEdit(record)">编辑</a>
            <a @click="onCopy(record)">复制</a>
            <a-popconfirm title="确定删除?" @confirm="onDelete(record.id)">
              <a style="color:#ef4444">删除</a>
            </a-popconfirm>
          </a-space>
        </template>
      </DataTable>
    </div>

    <!-- 新建/编辑 Modal -->
    <a-modal v-model:open="modalVisible" :title="isEdit ? '编辑优惠券' : '新建优惠券'" width="720px" :confirm-loading="submitLoading" @ok="onSubmit" @cancel="onModalCancel">
      <a-form layout="vertical">
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="名称" required>
              <a-input v-model:value="form.name" placeholder="优惠券名称" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="类型" required>
              <a-select v-model:value="form.type" @change="onTypeChange">
                <a-select-option value="FULL_REDUCTION">满减</a-select-option>
                <a-select-option value="DISCOUNT">折扣</a-select-option>
                <a-select-option value="EXCHANGE">兑换</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16" v-if="form.type !== 'EXCHANGE'">
          <a-col :span="12">
            <a-form-item :label="form.type === 'DISCOUNT' ? '折扣率(%)' : '减免金额(元)'" required>
              <a-input-number v-model:value="form.value" :min="0.01" :precision="2" style="width:100%" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="最低消费(元)">
              <a-input-number v-model:value="form.minAmount" :min="0" :precision="2" style="width:100%" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16" v-if="form.type === 'EXCHANGE'">
          <a-col :span="12">
            <a-form-item label="兑换码">
              <a-input v-model:value="form.code" placeholder="用户兑换时输入的码" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="8">
            <a-form-item label="发行总量" required>
              <a-input-number v-model:value="form.totalCount" :min="1" style="width:100%" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="每人限领">
              <a-input-number v-model:value="form.limitPerUser" :min="1" style="width:100%" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="状态">
              <a-select v-model:value="form.status">
                <a-select-option value="active">启用</a-select-option>
                <a-select-option value="inactive">停用</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="开始时间" required>
              <a-date-picker v-model:value="form.startAt" show-time value-format="YYYY-MM-DD HH:mm:ss" style="width:100%" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="结束时间" required>
              <a-date-picker v-model:value="form.endAt" show-time value-format="YYYY-MM-DD HH:mm:ss" style="width:100%" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="适用区域">
              <a-select v-model:value="form.regionId" placeholder="不限" allow-clear :options="regionOpts" :field-names="{ value: 'id', label: 'name' }" show-search option-filter-prop="name" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="适用商家">
              <a-select v-model:value="form.merchantId" placeholder="不限" allow-clear :options="merchantOpts" :field-names="{ value: 'id', label: 'name' }" show-search option-filter-prop="name" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item label="描述">
          <a-textarea v-model:value="form.description" :rows="2" placeholder="优惠券使用说明" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { message } from 'ant-design-vue'
import { marketingApi } from '@/api/marketing'
import { shopApi } from '@/api/shop'
import FilterBar from '@/components/common/FilterBar.vue'
import DataTable from '@/components/common/DataTable.vue'

const loading = ref(false)
const list = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const filter = reactive({ keyword: '', type: undefined as string | undefined, status: undefined as string | undefined, regionId: undefined as string | undefined })
const regionOpts = ref<any[]>([])
const merchantOpts = ref<any[]>([])

const columns = [
  { title: '名称', dataIndex: 'name', width: 160, ellipsis: true },
  { title: '类型', dataIndex: 'type', width: 70, slot: 'type' },
  { title: '优惠', dataIndex: 'value', width: 130, slot: 'value' },
  { title: '领取/使用', dataIndex: 'stats', width: 130, slot: 'stats' },
  { title: '有效期', dataIndex: 'period', width: 180, slot: 'period' },
  { title: '状态', dataIndex: 'status', width: 70, slot: 'status' },
  { title: '创建时间', dataIndex: 'createdAt', width: 160 },
  { title: '操作', dataIndex: 'action', width: 140, slot: 'action', fixed: 'right' },
]

function typeColor(t: string) { return t === 'FULL_REDUCTION' ? 'blue' : t === 'DISCOUNT' ? 'green' : 'purple' }
function typeLabel(t: string) { return t === 'FULL_REDUCTION' ? '满减' : t === 'DISCOUNT' ? '折扣' : t === 'EXCHANGE' ? '兑换' : t }
function fmt(v: any) { const n = Number(v); return Number.isNaN(n) ? '0' : n.toFixed(0) }

async function fetchList() {
  loading.value = true
  try {
    const params: any = { page: page.value, pageSize: pageSize.value, type: filter.type, status: filter.status, regionId: filter.regionId, keyword: filter.keyword || undefined }
    const res = await marketingApi.getCouponList(params)
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
    merchantOpts.value = merchants.map((m: any) => ({ id: m.id, name: m.name }))
  } catch { /* ignore */ }
}

function onSearch() { page.value = 1; fetchList() }
function onReset() { filter.keyword = ''; filter.type = undefined; filter.status = undefined; filter.regionId = undefined; onSearch() }

async function onToggle(record: any) {
  try {
    await marketingApi.toggleCouponStatus(record.id)
    message.success(record.status === 'active' ? '已停用' : '已启用')
    fetchList()
  } catch { message.error('操作失败') }
}

async function onDelete(id: string) {
  try {
    await marketingApi.deleteCoupon(id)
    message.success('已删除')
    fetchList()
  } catch { message.error('删除失败') }
}

// Modal
const modalVisible = ref(false)
const isEdit = ref(false)
const editId = ref<string | null>(null)
const submitLoading = ref(false)
const form = reactive({
  name: '', type: 'FULL_REDUCTION' as string, value: 0, minAmount: 0,
  totalCount: 100, limitPerUser: 1, startAt: '', endAt: '', status: 'active',
  description: '', code: '', regionId: undefined as string | undefined, merchantId: undefined as string | undefined,
})

function resetForm() {
  Object.assign(form, { name: '', type: 'FULL_REDUCTION', value: 0, minAmount: 0, totalCount: 100, limitPerUser: 1, startAt: '', endAt: '', status: 'active', description: '', code: '', regionId: undefined, merchantId: undefined })
}

function onTypeChange() {
  if (form.type === 'EXCHANGE') { form.value = 0; form.minAmount = 0 }
}

function onCreate() { isEdit.value = false; editId.value = null; resetForm(); modalVisible.value = true }
function onEdit(record: any) {
  isEdit.value = true; editId.value = record.id
  Object.assign(form, {
    name: record.name, type: record.type, value: Number(record.value), minAmount: Number(record.minAmount),
    totalCount: record.totalCount, limitPerUser: record.limitPerUser || 1,
    startAt: record.startAt, endAt: record.endAt, status: record.status,
    description: record.description || '', code: record.code || '',
    regionId: record.regionId, merchantId: record.merchantId,
  })
  modalVisible.value = true
}

async function onCopy(record: any) {
  try {
    await marketingApi.copyCoupon(record.id)
    message.success('已复制')
    fetchList()
  } catch { message.error('复制失败') }
}

async function onSubmit() {
  if (!form.name || !form.startAt || !form.endAt) return message.warning('请填写必填项')
  if (form.type !== 'EXCHANGE' && form.value <= 0) return message.warning('请填写优惠金额/折扣')
  submitLoading.value = true
  try {
    const data: any = { ...form, regionId: form.regionId || undefined, merchantId: form.merchantId || undefined, code: form.code || undefined, description: form.description || undefined }
    if (isEdit.value && editId.value) {
      await marketingApi.updateCoupon(editId.value, data)
      message.success('已更新')
    } else {
      await marketingApi.saveCoupon(data)
      message.success('已创建')
    }
    modalVisible.value = false
    fetchList()
  } finally { submitLoading.value = false }
}

function onModalCancel() { modalVisible.value = false }

loadRegions()
fetchList()
</script>
