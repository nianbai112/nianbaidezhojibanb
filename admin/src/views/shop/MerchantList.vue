<template>
  <div class="page-container">
    <FilterBar @search="onSearch" @reset="onReset">
      <a-input v-model:value="filter.keyword" placeholder="商家名称" allow-clear style="width:200px" />
      <a-select v-model:value="filter.regionId" placeholder="所在区域" allow-clear style="width:150px" :options="regionOpts" :field-names="{ value: 'id', label: 'name' }" show-search option-filter-prop="name" />
      <a-select v-model:value="filter.categoryId" placeholder="经营类目" allow-clear style="width:150px" :options="categoryOpts" :field-names="{ value: 'id', label: 'name' }" show-search option-filter-prop="name" />
      <a-select v-model:value="filter.auditStatus" placeholder="审核状态" allow-clear style="width:120px">
        <a-select-option value="pending">待审核</a-select-option>
        <a-select-option value="approved">已通过</a-select-option>
        <a-select-option value="rejected">已拒绝</a-select-option>
      </a-select>
    </FilterBar>
    <div class="page-card">
      <DataTable
        :columns="columns"
        :data-source="list"
        :loading="loading"
        :total="total"
        v-model:page="page"
        v-model:page-size="pageSize"
        v-model:selected-keys="selectedKeys"
        :row-selection="true"
        :batch-actions="batchActions"
        @change="onTableChange"
        @batch-action="onBatchAction"
      >
        <template #logo="{ record }"><a-image :src="record.logo" :width="44" :height="44" style="object-fit:cover;border-radius:4px" /></template>
        <template #auditStatus="{ record }"><StatusTag :status="record.auditStatus" type="audit" /></template>
        <template #status="{ record }"><StatusTag :status="record.status===1?'active':'disabled'" type="user" /></template>
        <template #action="{ record }">
          <a-space>
            <a-button type="link" size="small" @click="$router.push('/shop/merchant/'+record.id)">详情</a-button>
            <template v-if="record.auditStatus==='pending'">
              <a-button type="link" size="small" style="color:#10b981" @click="onAudit(record,'approve')">通过</a-button>
              <a-button type="link" size="small" danger @click="onAudit(record,'reject')">拒绝</a-button>
            </template>
            <a-button type="link" size="small" @click="onToggleStatus(record)">{{record.status===1?'关闭':'启用'}}</a-button>
          </a-space>
        </template>
      </DataTable>
    </div>
    <AuditModal v-model:visible="auditVisible" @submit="onAuditSubmit" />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { message } from 'ant-design-vue'
import { shopApi } from '@/api/shop'
import FilterBar from '@/components/common/FilterBar.vue'
import DataTable from '@/components/common/DataTable.vue'
import StatusTag from '@/components/common/StatusTag.vue'
import AuditModal from '@/components/common/AuditModal.vue'

const loading = ref(false)
const list = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const selectedKeys = ref<(string|number)[]>([])
const filter = reactive({ keyword: '', regionId: undefined as string|undefined, categoryId: undefined as string|undefined, auditStatus: undefined as string|undefined })
const auditVisible = ref(false)
const auditMerchant = ref<any>(null)
const regionOpts = ref<any[]>([])
const categoryOpts = ref<any[]>([])

const columns = [
  { title: 'Logo', dataIndex: 'logo', width: 60, slot: 'logo' },
  { title: '名称', dataIndex: 'name', width: 160 },
  { title: '联系人', dataIndex: 'contactPerson', width: 100 },
  { title: '电话', dataIndex: 'phone', width: 130 },
  { title: '区域', dataIndex: 'regionName', width: 100 },
  { title: '类目', dataIndex: 'categoryName', width: 100 },
  { title: '审核', dataIndex: 'auditStatus', width: 80, slot: 'auditStatus' },
  { title: '状态', dataIndex: 'status', width: 70, slot: 'status' },
  { title: '评分', dataIndex: 'score', width: 60 },
  { title: '订单', dataIndex: 'orderCount', width: 60 },
  { title: '入驻时间', dataIndex: 'createdAt', width: 160 },
  { title: '操作', dataIndex: 'action', width: 220, slot: 'action', fixed: 'right' },
]

const batchActions = [
  { key: 'approve', label: '批量通过' },
  { key: 'reject', label: '批量拒绝', danger: true },
  { key: 'close', label: '批量关闭', danger: true },
]

async function fetchList() {
  loading.value = true
  try {
    const res = await shopApi.getMerchantList({ page: page.value, pageSize: pageSize.value, ...filter })
    list.value = (res.data?.data?.list || res.data?.list || []) as any[]
    total.value = res.data?.data?.total || res.data?.total || 0
  } catch {} finally { loading.value = false }
}

async function loadOptions() {
  try {
    const [merchantRes, catRes] = await Promise.all([
      shopApi.getMerchantList({ page: 1, pageSize: 1000 }),
      shopApi.getCategoryTree(),
    ])
    // Use the list to extract unique regions for region filter (in a real app this would be a dedicated regions API)
    const merchants = merchantRes.data.data?.list || []
    const regionMap = new Map<string, any>()
    merchants.forEach((m: any) => { if (m.regionId && !regionMap.has(m.regionId)) regionMap.set(m.regionId, { id: m.regionId, name: m.regionName || m.regionId }) })
    regionOpts.value = Array.from(regionMap.values())
    categoryOpts.value = catRes.data.data || []
  } catch { /* handled */ }
}

function onSearch() { page.value = 1; fetchList() }
function onReset() { filter.keyword = ''; filter.regionId = undefined; filter.categoryId = undefined; filter.auditStatus = undefined; onSearch() }
function onTableChange() { fetchList() }

async function onBatchAction(action: string, keys: (string|number)[]) {
  await shopApi.batchOp({ ids: keys, action })
  message.success('操作成功')
  selectedKeys.value = []
  fetchList()
}

function onAudit(record: any, _action: string) { auditMerchant.value = record; auditVisible.value = true }

async function onAuditSubmit(action: 'approve'|'reject', remark: string) {
  if (!auditMerchant.value) return
  if (action === 'approve') await shopApi.approveMerchant(auditMerchant.value.id, remark)
  else await shopApi.rejectMerchant(auditMerchant.value.id, remark)
  message.success('操作成功')
  auditVisible.value = false
  fetchList()
}

async function onToggleStatus(record: any) {
  await shopApi.toggleMerchantStatus(record.id, record.status === 1 ? 0 : 1)
  message.success('已更新')
  fetchList()
}

loadOptions()
fetchList()
</script>
