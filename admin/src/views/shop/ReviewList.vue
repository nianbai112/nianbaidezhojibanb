<template>
  <div class="page-container">
    <FilterBar @search="onSearch" @reset="onReset">
      <a-input v-model:value="filter.keyword" placeholder="评价内容" allow-clear style="width:180px" />
      <a-select v-model:value="filter.rating" placeholder="评分" allow-clear style="width:100px">
        <a-select-option :value="5">5星</a-select-option>
        <a-select-option :value="4">4星</a-select-option>
        <a-select-option :value="3">3星</a-select-option>
        <a-select-option :value="2">2星</a-select-option>
        <a-select-option :value="1">1星</a-select-option>
      </a-select>
      <a-select v-model:value="filter.merchantId" placeholder="商家" allow-clear style="width:160px" :options="merchantOpts" :field-names="{ value: 'id', label: 'name' }" show-search option-filter-prop="name" />
    </FilterBar>
    <div class="page-card">
      <DataTable
        :columns="columns"
        :data-source="list"
        :loading="loading"
        :total="total"
        v-model:page="page"
        v-model:page-size="pageSize"
        @change="onTableChange"
      >
        <template #user="{ record }">
          <a-space>
            <a-avatar v-if="record.userAvatar" :src="record.userAvatar" :size="24" />
            <span>{{ record.userNickname }}</span>
            <a-tag v-if="record.isAnonymous" color="orange" style="font-size:11px">匿名</a-tag>
          </a-space>
        </template>
        <template #rating="{ record }">
          <a-rate :value="record.rating" disabled style="font-size:14px" />
        </template>
        <template #images="{ record }">
          <a-space v-if="record.images?.length">
            <a-image v-for="(img, i) in record.images" :key="i" :src="img" :width="40" :height="40" style="object-fit:cover;border-radius:4px;cursor:pointer" />
          </a-space>
          <span v-else style="color:#ccc">-</span>
        </template>
        <template #reply="{ record }">
          <span v-if="record.reply || record.merchantReply" style="color:#409EFF">{{ record.reply || record.merchantReply }}</span>
          <span v-else style="color:#ccc">未回复</span>
        </template>
        <template #action="{ record }">
          <a-space>
            <a @click="onReply(record)">回复</a>
            <a @click="onToggleHide(record)">{{ record.status === 0 ? '显示' : '隐藏' }}</a>
            <a-popconfirm title="确定删除?" @confirm="onDelete(record.id)">
              <a style="color:#ef4444">删除</a>
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
import { shopApi } from '@/api/shop'
import FilterBar from '@/components/common/FilterBar.vue'
import DataTable from '@/components/common/DataTable.vue'

const loading = ref(false)
const list = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const filter = reactive({ keyword: '', rating: undefined as number | undefined, merchantId: undefined as string | undefined })
const merchantOpts = ref<any[]>([])

const columns = [
  { title: '用户', dataIndex: 'userNickname', width: 120, slot: 'user' },
  { title: '商品', dataIndex: 'productName', width: 120, ellipsis: true },
  { title: '评分', slot: 'rating', width: 120 },
  { title: '内容', dataIndex: 'content', width: 240, ellipsis: true },
  { title: '图片', dataIndex: 'images', width: 100, slot: 'images' },
  { title: '回复', dataIndex: 'reply', width: 160, slot: 'reply' },
  { title: '时间', dataIndex: 'createdAt', width: 160 },
  { title: '操作', dataIndex: 'action', width: 140, slot: 'action', fixed: 'right' },
]

async function fetchList() {
  loading.value = true
  try {
    const res = await shopApi.getReviewList({
      page: page.value,
      pageSize: pageSize.value,
      keyword: filter.keyword || undefined,
      rating: filter.rating,
      merchantId: filter.merchantId ? Number(filter.merchantId) : undefined,
    })
    list.value = res.data?.data?.list ?? []
    total.value = res.data?.data?.total ?? 0
  } catch {
    list.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

async function loadMerchants() {
  try {
    const res = await shopApi.getMerchantList({ page: 1, pageSize: 1000 })
    merchantOpts.value = res.data.data?.list || []
  } catch { /* handled */ }
}

function onTableChange() { fetchList() }
function onSearch() { page.value = 1; fetchList() }
function onReset() { filter.keyword = ''; filter.rating = undefined; filter.merchantId = undefined; onSearch() }

async function onDelete(id: number) {
  try {
    await shopApi.deleteReview(id)
    message.success('已删除')
    fetchList()
  } catch {
    message.error('删除失败')
  }
}

async function onToggleHide(record: any) {
  message.info('隐藏/显示功能开发中')
}

const replyVisible = ref(false)
const replyLoading = ref(false)
const replyRecord = ref<any>(null)
const replyContent = ref('')

function onReply(record: any) {
  replyRecord.value = record
  replyContent.value = record.reply || record.merchantReply || ''
  replyVisible.value = true
}

async function onReplySubmit() {
  if (!replyRecord.value) return
  replyLoading.value = true
  try {
    await shopApi.replyReview(replyRecord.value.id, replyContent.value)
    message.success('回复成功')
    replyVisible.value = false
    fetchList()
  } catch {
    message.error('回复失败')
  } finally {
    replyLoading.value = false
  }
}

loadMerchants()
fetchList()
</script>
