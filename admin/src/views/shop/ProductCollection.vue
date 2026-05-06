<template>
  <div class="page-container">
    <FilterBar @search="onSearch" @reset="onReset">
      <a-input v-model:value="f.keyword" placeholder="商品名称" allow-clear style="width:180px" />
      <a-select v-model:value="f.categoryId" placeholder="类目" allow-clear style="width:150px" :options="categoryOpts" :field-names="{ value: 'id', label: 'name' }" show-search option-filter-prop="name" />
      <a-select v-model:value="f.merchantId" placeholder="商家" allow-clear style="width:180px" :options="merchantOpts" :field-names="{ value: 'id', label: 'name' }" show-search option-filter-prop="name" />
      <a-select v-model:value="f.status" placeholder="状态" allow-clear style="width:110px">
        <a-select-option value="on_sale">上架</a-select-option>
        <a-select-option value="off_sale">下架</a-select-option>
      </a-select>
      <template #extra>
        <a-button @click="onExport">导出</a-button>
        <a-button type="primary" :disabled="selectedKeys.length === 0" @click="onBatchCollect" style="margin-left:8px">采集到目标商家</a-button>
      </template>
    </FilterBar>

    <div class="page-card">
      <div class="page-header"><span class="page-title">商品采集</span></div>
      <DataTable :columns="cols" :data-source="list" :loading="ld" :total="t" v-model:page="p" v-model:page-size="ps" v-model:selected-keys="selectedKeys" :row-selection="true">
        <template #images="{ record }">
          <a-image v-if="record.images?.[0]" :src="record.images[0]" :width="44" :height="44" style="object-fit:cover;border-radius:4px" />
        </template>
        <template #price="{ record }">¥{{ Number(record.price).toFixed(2) }}</template>
        <template #status="{ record }">
          <a-tag :color="record.status === 'on_sale' ? 'green' : 'default'">{{ record.status === 'on_sale' ? '上架' : '下架' }}</a-tag>
        </template>
      </DataTable>
    </div>

    <a-modal v-model:open="collectVisible" title="采集到目标商家" :width="400" :confirm-loading="collecting" @ok="onCollectConfirm">
      <a-form layout="vertical">
        <a-form-item label="目标商家">
          <a-select v-model:value="targetMerchantId" placeholder="选择目标商家" :options="merchantOpts" :field-names="{ value: 'id', label: 'name' }" show-search option-filter-prop="name" />
        </a-form-item>
        <p style="color:#999">已选择 {{ selectedKeys.length }} 个商品</p>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { message } from 'ant-design-vue'
import { shopApi } from '@/api/shop'
import FilterBar from '@/components/common/FilterBar.vue'
import DataTable from '@/components/common/DataTable.vue'

const ld = ref(false), list = ref<any[]>([]), t = ref(0), p = ref(1), ps = ref(20)
const f = reactive({ keyword: '', categoryId: undefined as string | undefined, merchantId: undefined as string | undefined, status: undefined as string | undefined })
const selectedKeys = ref<(string | number)[]>([])
const categoryOpts = ref<any[]>([])
const merchantOpts = ref<any[]>([])

const cols = [
  { title: '图片', dataIndex: 'images', width: 60, slot: 'images' },
  { title: '名称', dataIndex: 'name', width: 200, ellipsis: true },
  { title: '商家', dataIndex: ['merchant', 'name'], width: 120 },
  { title: '类目', dataIndex: ['category', 'name'], width: 100 },
  { title: '价格', dataIndex: 'price', width: 90, slot: 'price' },
  { title: '库存', dataIndex: 'stock', width: 70 },
  { title: '销量', dataIndex: 'saleCount', width: 70 },
  { title: '状态', dataIndex: 'status', width: 70, slot: 'status' },
  { title: '创建时间', dataIndex: 'createdAt', width: 160 },
]

async function fetchData() {
  ld.value = true
  try {
    const params: any = { page: p.value, pageSize: ps.value }
    if (f.keyword) params.keyword = f.keyword
    if (f.categoryId) params.categoryId = f.categoryId
    if (f.merchantId) params.merchantId = f.merchantId
    if (f.status) params.status = f.status
    const res = await shopApi.getProductCollection(params)
    list.value = res.data.data?.list || []
    t.value = res.data.data?.total || 0
  } catch { /* handled */ }
  finally { ld.value = false }
}

async function loadOptions() {
  try {
    const [merchantRes, catRes] = await Promise.all([
      shopApi.getMerchantList({ page: 1, pageSize: 1000 }),
      shopApi.getCategoryTree(),
    ])
    merchantOpts.value = merchantRes.data.data?.list || []
    categoryOpts.value = catRes.data.data || []
  } catch { /* handled */ }
}

function onSearch() { p.value = 1; fetchData() }
function onReset() { f.keyword = ''; f.categoryId = undefined; f.merchantId = undefined; f.status = undefined; onSearch() }

function onExport() { message.info('导出功能开发中') }

const collectVisible = ref(false), targetMerchantId = ref(''), collecting = ref(false)

function onBatchCollect() {
  if (selectedKeys.value.length === 0) { message.warning('请选择商品'); return }
  targetMerchantId.value = ''
  collectVisible.value = true
}

async function onCollectConfirm() {
  if (!targetMerchantId.value) { message.warning('请选择目标商家'); return }
  collecting.value = true
  try {
    await shopApi.batchCollectProducts({ targetMerchantId: targetMerchantId.value, productIds: selectedKeys.value as string[] })
    message.success(`已采集 ${selectedKeys.value.length} 个商品`)
    collectVisible.value = false
    selectedKeys.value = []
    fetchData()
  } catch { /* handled */ }
  finally { collecting.value = false }
}

loadOptions()
fetchData()
</script>
