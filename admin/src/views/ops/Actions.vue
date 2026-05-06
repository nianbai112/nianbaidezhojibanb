<template>
  <div class="ops-page" style="padding:24px">
    <a-page-header title="运维操作记录" sub-title="仅超级管理员可见" />

    <a-table
      :columns="columns"
      :data-source="list"
      :pagination="{ current: query.page, pageSize: query.pageSize, total, onChange: handlePageChange }"
      :loading="loading"
      row-key="id"
      size="small"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'status'">
          <a-tag :color="statusColor(record.status)">{{ record.status }}</a-tag>
        </template>
        <template v-if="column.key === 'detail'">
          <pre v-if="record.detail" style="margin:0;font-size:12px;background:#f3f4f6;padding:4px 8px;border-radius:4px">{{ JSON.stringify(record.detail, null, 2) }}</pre>
          <span v-else>-</span>
        </template>
      </template>
    </a-table>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { message } from 'ant-design-vue'
import dayjs from 'dayjs'
import { opsApi } from '@/api/ops'

const query = reactive({ page: 1, pageSize: 20 })
const list = ref<any[]>([])
const total = ref(0)
const loading = ref(false)

const columns = [
  { title: '时间', dataIndex: 'createdAt', key: 'createdAt', width: 170, customRender: ({ text }: any) => dayjs(text).format('YYYY-MM-DD HH:mm:ss') },
  { title: '管理员ID', dataIndex: 'adminId', width: 200 },
  { title: '操作', dataIndex: 'action', width: 140 },
  { title: '原因', dataIndex: 'reason', ellipsis: true },
  { title: '状态', key: 'status', width: 100 },
  { title: 'IP', dataIndex: 'ip', width: 140 },
  { title: '完成时间', dataIndex: 'finishedAt', width: 170, customRender: ({ text }: any) => text ? dayjs(text).format('MM-DD HH:mm:ss') : '-' },
  { title: '详情', key: 'detail' },
]

function statusColor(status: string) {
  if (status === 'success') return 'success'
  if (status === 'failed') return 'error'
  if (status === 'pending') return 'processing'
  return 'default'
}

async function fetchActions() {
  loading.value = true
  try {
    const res = await opsApi.getActions({ ...query })
    if (res.data?.code === 0) {
      list.value = res.data.data?.list || []
      total.value = res.data.data?.total || 0
    }
  } catch (err: any) {
    message.error(err.response?.data?.message || '获取操作记录失败')
  } finally {
    loading.value = false
  }
}

function handlePageChange(page: number, pageSize: number) {
  query.page = page
  query.pageSize = pageSize
  fetchActions()
}

fetchActions()
</script>
