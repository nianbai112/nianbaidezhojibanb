<template>
  <div class="page-container">
    <FilterBar @search="onSearch" @reset="onReset">
      <a-select v-model:value="filter.regionId" placeholder="区域" allow-clear style="width:180px" :options="regionOpts" :field-names="{ value: 'id', label: 'name' }" show-search option-filter-prop="name" />
      <a-select v-model:value="filter.packageId" placeholder="套餐" allow-clear style="width:180px" :options="packageOpts" :field-names="{ value: 'id', label: 'name' }" show-search option-filter-prop="name" />
      <a-select v-model:value="filter.rating" placeholder="评分" allow-clear style="width:100px">
        <a-select-option :value="5">5星</a-select-option>
        <a-select-option :value="4">4星</a-select-option>
        <a-select-option :value="3">3星</a-select-option>
        <a-select-option :value="2">2星</a-select-option>
        <a-select-option :value="1">1星</a-select-option>
      </a-select>
      <a-select v-model:value="filter.status" placeholder="状态" allow-clear style="width:100px">
        <a-select-option value="approved">已通过</a-select-option>
        <a-select-option value="rejected">已拒绝</a-select-option>
        <a-select-option value="hidden">已隐藏</a-select-option>
      </a-select>
    </FilterBar>

    <div class="page-card">
      <div class="page-header"><span class="page-title">评价管理</span></div>
      <DataTable :columns="columns" :data-source="list" :loading="loading" :total="total" v-model:page="page" v-model:page-size="pageSize" @change="fetchList">
        <template #user="{ record }">
          <a-space>
            <a-avatar v-if="record.User?.avatar" :src="record.User.avatar" :size="24" />
            <span>{{ record.User?.nickname || '-' }}</span>
          </a-space>
        </template>
        <template #package="{ record }">{{ record.Package?.name || '-' }}</template>
        <template #orderNo="{ record }">{{ record.Order?.orderNo || '-' }}</template>
        <template #rating="{ record }">
          <a-rate :value="record.rating" disabled style="font-size:14px" />
        </template>
        <template #images="{ record }">
          <a-space v-if="record.images?.length">
            <a-image v-for="(img, i) in record.images" :key="i" :src="img" :width="36" :height="36" style="object-fit:cover;border-radius:4px;cursor:pointer" />
          </a-space>
          <span v-else style="color:#ccc">-</span>
        </template>
        <template #status="{ record }">
          <a-tag :color="record.status === 'approved' ? 'green' : record.status === 'rejected' ? 'red' : 'orange'">
            {{ record.status === 'approved' ? '通过' : record.status === 'rejected' ? '拒绝' : '隐藏' }}
          </a-tag>
        </template>
        <template #reply="{ record }">
          <span v-if="record.reply" style="color:#409EFF;max-width:120px;display:inline-block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ record.reply }}</span>
          <span v-else style="color:#ccc">未回复</span>
        </template>
        <template #action="{ record }">
          <a-space>
            <a v-if="record.status !== 'approved'" @click="onAudit(record.id, 'approved')">通过</a>
            <a v-if="record.status !== 'rejected'" style="color:#ff4f4f" @click="onAudit(record.id, 'rejected')">拒绝</a>
            <a v-if="record.status !== 'hidden'" style="color:#faad14" @click="onAudit(record.id, 'hidden')">隐藏</a>
            <a @click="onReply(record)">回复</a>
            <a-popconfirm title="确定删除该评价？" @confirm="onDelete(record.id)">
              <a style="color:#ff4f4f">删除</a>
            </a-popconfirm>
          </a-space>
        </template>
      </DataTable>
    </div>

    <a-modal v-model:open="replyVisible" title="回复评价" :width="520" :confirm-loading="replyLoading" @ok="onReplySubmit">
      <a-form layout="vertical">
        <a-form-item label="评价内容">
          <div style="background:#f5f5f5;padding:12px;border-radius:4px;max-height:120px;overflow-y:auto">
            <a-rate :value="replyRecord?.rating" disabled style="font-size:12px" />
            <p style="margin:4px 0 0;color:#666">{{ replyRecord?.content }}</p>
          </div>
        </a-form-item>
        <a-form-item v-if="replyRecord?.images?.length" label="评价图片">
          <a-image v-for="(img, i) in replyRecord.images" :key="i" :src="img" :width="80" :height="80" style="object-fit:cover;border-radius:4px;margin-right:4px" />
        </a-form-item>
        <a-form-item label="回复内容">
          <a-textarea v-model:value="replyContent" placeholder="输入回复内容" :rows="3" />
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
const filter = reactive({ regionId: userStore.regionId || undefined as string | undefined, packageId: undefined as string | undefined, rating: undefined as number | undefined, status: undefined as string | undefined })
const regionOpts = ref<any[]>([])
const packageOpts = ref<any[]>([])

const columns = [
  { title: '用户', dataIndex: 'User', width: 120, slot: 'user' },
  { title: '套餐', dataIndex: 'Package', width: 150, slot: 'package' },
  { title: '订单号', dataIndex: 'orderNo', width: 140, slot: 'orderNo' },
  { title: '评分', dataIndex: 'rating', width: 150, slot: 'rating' },
  { title: '内容', dataIndex: 'content', width: 200, ellipsis: true },
  { title: '图片', dataIndex: 'images', width: 80, slot: 'images' },
  { title: '状态', dataIndex: 'status', width: 70, slot: 'status' },
  { title: '回复', dataIndex: 'reply', width: 140, slot: 'reply' },
  { title: '时间', dataIndex: 'createdAt', width: 150 },
  { title: '操作', dataIndex: 'action', width: 220, slot: 'action', fixed: 'right' },
]

async function fetchList() {
  loading.value = true
  try {
    const res = await groupBuyApi.getReviews({
      page: page.value, pageSize: pageSize.value,
      regionId: filter.regionId,
      rating: filter.rating,
      status: filter.status,
    })
    list.value = res.data?.list || []
    total.value = res.data?.total || 0
  } finally { loading.value = false }
}

async function loadOptions() {
  try {
    const [merchantRes, pkgRes] = await Promise.all([
      shopApi.getMerchantList({ page: 1, pageSize: 1000 }),
      groupBuyApi.getPackages({ page: 1, pageSize: 1000 }),
    ])
    const merchants = (merchantRes.data?.data?.list || merchantRes.data?.list || []) as any[]
    const map = new Map<string, any>()
    merchants.forEach((m: any) => { if (m.regionId && !map.has(m.regionId)) map.set(m.regionId, { id: m.regionId, name: m.regionName || m.regionId }) })
    regionOpts.value = Array.from(map.values())
    packageOpts.value = pkgRes.data?.list || []
  } catch { /* ignore */ }
}

function onSearch() { page.value = 1; fetchList() }
function onReset() { filter.regionId = undefined; filter.packageId = undefined; filter.rating = undefined; filter.status = undefined; onSearch() }

async function onAudit(id: string, status: string) {
  try {
    await groupBuyApi.auditReview(id, status)
    message.success('状态已更新')
    fetchList()
  } catch { /* ignore */ }
}

async function onDelete(id: string) {
  try {
    await groupBuyApi.deleteReview(id)
    message.success('已删除')
    fetchList()
  } catch { /* ignore */ }
}

const replyVisible = ref(false)
const replyLoading = ref(false)
const replyRecord = ref<any>(null)
const replyContent = ref('')

function onReply(record: any) {
  replyRecord.value = record
  replyContent.value = record.reply || ''
  replyVisible.value = true
}

async function onReplySubmit() {
  if (!replyRecord.value) return
  replyLoading.value = true
  try {
    await groupBuyApi.replyReview(replyRecord.value.id, replyContent.value)
    message.success('回复成功')
    replyVisible.value = false
    fetchList()
  } finally { replyLoading.value = false }
}

loadOptions()
fetchList()
</script>
