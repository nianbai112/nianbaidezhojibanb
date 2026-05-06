<template>
  <div class="page-container">
    <FilterBar @search="onSearch" @reset="onReset">
      <a-select v-model:value="filter.regionId" placeholder="区域" allow-clear style="width:180px" :options="regionOpts" :field-names="{ value: 'id', label: 'name' }" show-search option-filter-prop="name" />
      <a-select v-model:value="filter.categoryId" placeholder="分类" allow-clear style="width:160px" :options="categoryOpts" :field-names="{ value: 'id', label: 'name' }" show-search option-filter-prop="name" />
      <a-select v-model:value="filter.status" placeholder="状态" allow-clear style="width:100px">
        <a-select-option value="active">上架</a-select-option>
        <a-select-option value="inactive">下架</a-select-option>
      </a-select>
      <a-input v-model:value="filter.keyword" placeholder="套餐名称" allow-clear style="width:180px" />
      <template #extra>
        <a-button type="primary" @click="onCreate"><plus-outlined />新增套餐</a-button>
      </template>
    </FilterBar>

    <div class="page-card">
      <div class="page-header"><span class="page-title">套餐管理</span></div>
      <DataTable :columns="columns" :data-source="list" :loading="loading" :total="total" v-model:page="page" v-model:page-size="pageSize" @change="fetchList">
        <template #cover="{ record }">
          <a-image v-if="record.cover" :src="record.cover" :width="44" :height="44" style="object-fit:cover;border-radius:4px" />
          <span v-else style="color:#ccc">-</span>
        </template>
        <template #price="{ record }">
          <span style="color:#ff4d4f;font-weight:500">¥{{ record.price }}</span>
          <span v-if="record.originPrice" style="text-decoration:line-through;color:#999;font-size:12px;margin-left:4px">¥{{ record.originPrice }}</span>
        </template>
        <template #stock="{ record }">{{ record.stock }} / <span style="color:#409EFF">{{ record.soldCount }}</span></template>
        <template #period="{ record }">
          <span style="font-size:12px">{{ record.startAt?.slice(0,10) }} ~ {{ record.endAt?.slice(0,10) }}</span>
        </template>
        <template #status="{ record }">
          <a-tag :color="record.status === 'active' ? 'green' : 'default'">{{ record.status === 'active' ? '上架' : '下架' }}</a-tag>
        </template>
        <template #action="{ record }">
          <a-space>
            <a @click="onEdit(record)">编辑</a>
            <a-popconfirm title="确定删除该套餐？" @confirm="onDelete(record.id)">
              <a style="color:#ff4f4f">删除</a>
            </a-popconfirm>
          </a-space>
        </template>
      </DataTable>
    </div>

    <a-modal v-model:open="visible" :title="editingId ? '编辑套餐' : '新增套餐'" width="720px" :confirm-loading="submitting" @ok="onSubmit">
      <a-form layout="vertical">
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="所属分类">
              <a-select v-model:value="form.categoryId" placeholder="选择分类" :options="categoryOpts" :field-names="{ value: 'id', label: 'name' }" show-search option-filter-prop="name" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="所属商家">
              <a-select v-model:value="form.merchantId" placeholder="选择商家" allow-clear :options="merchantOpts" :field-names="{ value: 'id', label: 'name' }" show-search option-filter-prop="name" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item label="名称" required>
          <a-input v-model:value="form.name" placeholder="套餐名称" />
        </a-form-item>
        <a-form-item label="封面图 URL">
          <a-input v-model:value="form.cover" placeholder="封面链接" />
        </a-form-item>
        <a-row :gutter="16">
          <a-col :span="8">
            <a-form-item label="团购价 (元)" required>
              <a-input-number v-model:value="form.price" :min="0" :precision="2" style="width:100%" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="原价 (元)">
              <a-input-number v-model:value="form.originPrice" :min="0" :precision="2" style="width:100%" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="库存">
              <a-input-number v-model:value="form.stock" :min="0" style="width:100%" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="开始时间" required>
              <a-date-picker v-model:value="form.startAt" show-time style="width:100%" value-format="YYYY-MM-DD HH:mm:ss" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="结束时间" required>
              <a-date-picker v-model:value="form.endAt" show-time style="width:100%" value-format="YYYY-MM-DD HH:mm:ss" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item label="描述">
          <a-textarea v-model:value="form.description" :rows="2" placeholder="简要描述" />
        </a-form-item>
        <a-form-item label="详情">
          <a-textarea v-model:value="form.detail" :rows="3" placeholder="套餐详情" />
        </a-form-item>
        <a-form-item label="购买须知">
          <a-textarea v-model:value="form.buyNotes" :rows="2" placeholder="购买须知" />
        </a-form-item>
        <a-form-item label="核销说明">
          <a-textarea v-model:value="form.verifyInfo" :rows="2" placeholder="核销说明" />
        </a-form-item>
        <a-form-item label="轮播图片">
          <div v-for="(img, i) in form.images" :key="i" style="display:flex;align-items:center;margin-bottom:6px">
            <a-input v-model:value="form.images[i]" placeholder="图片链接" style="flex:1" />
            <a-button type="link" danger @click="form.images.splice(i,1)" style="margin-left:4px">删除</a-button>
          </div>
          <a-button type="dashed" size="small" @click="form.images.push('')">+ 添加图片</a-button>
        </a-form-item>
        <a-row :gutter="16">
          <a-col :span="8">
            <a-form-item label="平台抽成 (%)">
              <a-input-number v-model:value="form.commissionRate" :min="0" :max="100" :precision="1" style="width:100%" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="区域抽成 (%)">
              <a-input-number v-model:value="form.regionCommissionRate" :min="0" :max="100" :precision="1" style="width:100%" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="状态">
              <a-select v-model:value="form.status">
                <a-select-option value="active">上架</a-select-option>
                <a-select-option value="inactive">下架</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>
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
const filter = reactive({ regionId: userStore.regionId || undefined as string | undefined, categoryId: undefined as string | undefined, status: undefined as string | undefined, keyword: '' })
const regionOpts = ref<any[]>([])
const categoryOpts = ref<any[]>([])
const merchantOpts = ref<any[]>([])
const visible = ref(false)
const editingId = ref('')
const submitting = ref(false)

const defaultForm = {
  regionId: undefined as string | undefined,
  categoryId: undefined as string | undefined, merchantId: undefined as string | undefined,
  name: '', cover: '', images: [] as string[],
  description: '', detail: '', buyNotes: '', verifyInfo: '',
  price: 0, originPrice: 0, stock: 0,
  startAt: '', endAt: '', status: 'active' as string,
  commissionRate: undefined as number | undefined, regionCommissionRate: undefined as number | undefined,
}
const form = reactive({ ...defaultForm })

const columns = [
  { title: '封面', dataIndex: 'cover', width: 60, slot: 'cover' },
  { title: '名称', dataIndex: 'name', width: 160, ellipsis: true },
  { title: '分类', dataIndex: 'Category', width: 100 },
  { title: '商家', dataIndex: 'Merchant', width: 100 },
  { title: '价格', dataIndex: 'price', width: 130, slot: 'price' },
  { title: '库存/已售', dataIndex: 'stock', width: 100, slot: 'stock' },
  { title: '有效期', dataIndex: 'period', width: 190, slot: 'period' },
  { title: '状态', dataIndex: 'status', width: 70, slot: 'status' },
  { title: '创建时间', dataIndex: 'createdAt', width: 150 },
  { title: '操作', dataIndex: 'action', width: 120, slot: 'action', fixed: 'right' },
]

async function fetchList() {
  loading.value = true
  try {
    const res = await groupBuyApi.getPackages({
      page: page.value, pageSize: pageSize.value,
      regionId: filter.regionId,
      categoryId: filter.categoryId,
      status: filter.status,
      keyword: filter.keyword || undefined,
    })
    list.value = (res.data?.list || []).map((p: any) => ({
      ...p,
      Category: p.Category?.name || '-',
      Merchant: p.Merchant?.name || '-',
    }))
    total.value = res.data?.total || 0
  } finally { loading.value = false }
}

async function loadOptions() {
  try {
    const [merchantRes, catRes] = await Promise.all([
      shopApi.getMerchantList({ page: 1, pageSize: 1000 }),
      groupBuyApi.getCategories({ page: 1, pageSize: 1000 }),
    ])
    const merchants = (merchantRes.data?.data?.list || merchantRes.data?.list || []) as any[]
    const map = new Map<string, any>()
    merchants.forEach((m: any) => { if (m.regionId && !map.has(m.regionId)) map.set(m.regionId, { id: m.regionId, name: m.regionName || m.regionId }) })
    regionOpts.value = Array.from(map.values())
    merchantOpts.value = merchants.map((m: any) => ({ id: m.id, name: m.name }))
    categoryOpts.value = catRes.data?.list || []
  } catch { /* ignore */ }
}

function onSearch() { page.value = 1; fetchList() }
function onReset() { filter.regionId = undefined; filter.categoryId = undefined; filter.status = undefined; filter.keyword = ''; onSearch() }

function onCreate() {
  editingId.value = ''
  Object.assign(form, { ...defaultForm, images: [] })
  visible.value = true
}

function onEdit(record: any) {
  editingId.value = record.id
  Object.assign(form, {
    categoryId: record.categoryId,
    merchantId: record.merchantId,
    name: record.name,
    cover: record.cover || '',
    images: Array.isArray(record.images) ? [...record.images] : [],
    description: record.description || '',
    detail: record.detail || '',
    buyNotes: record.buyNotes || '',
    verifyInfo: record.verifyInfo || '',
    price: Number(record.price) || 0,
    originPrice: Number(record.originPrice) || 0,
    stock: record.stock || 0,
    startAt: record.startAt ? formatDate(record.startAt) : '',
    endAt: record.endAt ? formatDate(record.endAt) : '',
    status: record.status || 'active',
    commissionRate: record.commissionRate !== undefined ? Number(record.commissionRate) : undefined,
    regionCommissionRate: record.regionCommissionRate !== undefined ? Number(record.regionCommissionRate) : undefined,
  })
  visible.value = true
}

function formatDate(val: string): string {
  try { return new Date(val).toISOString().replace('T', ' ').substring(0, 19) } catch { return val }
}

async function onSubmit() {
  if (!form.name || form.price <= 0 || !form.startAt || !form.endAt) return message.warning('请完整填写必填项（名称、价格、有效期）')
  submitting.value = true
  try {
    const payload: any = {
      ...form,
      regionId: form.regionId || filter.regionId || userStore.regionId,
      images: form.images.filter((u: string) => u.trim()),
      startAt: new Date(form.startAt).toISOString(),
      endAt: new Date(form.endAt).toISOString(),
    }
    if (editingId.value) {
      await groupBuyApi.updatePackage(editingId.value, payload)
    } else {
      await groupBuyApi.createPackage(payload)
    }
    message.success('保存成功')
    visible.value = false
    fetchList()
  } finally { submitting.value = false }
}

async function onDelete(id: string) {
  try {
    await groupBuyApi.deletePackage(id)
    message.success('已删除')
    fetchList()
  } catch { /* ignore */ }
}

loadOptions()
fetchList()
</script>
