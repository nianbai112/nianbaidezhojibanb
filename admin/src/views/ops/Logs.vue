<template>
  <div class="ops-page" style="padding:24px">
    <a-page-header title="日志中心" sub-title="仅超级管理员可见">
      <template #extra>
        <a-button danger @click="showCleanupModal = true">清理日志</a-button>
      </template>
    </a-page-header>

    <a-form layout="inline" style="margin-bottom:16px">
      <a-form-item label="级别">
        <a-select v-model:value="query.level" allow-clear placeholder="全部" style="width:100px" @change="handleSearch">
          <a-select-option value="info">info</a-select-option>
          <a-select-option value="warn">warn</a-select-option>
          <a-select-option value="error">error</a-select-option>
        </a-select>
      </a-form-item>
      <a-form-item label="模块">
        <a-select v-model:value="query.module" allow-clear placeholder="全部" style="width:120px" @change="handleSearch">
          <a-select-option value="request">request</a-select-option>
          <a-select-option value="payment">payment</a-select-option>
          <a-select-option value="upload">upload</a-select-option>
          <a-select-option value="admin">admin</a-select-option>
          <a-select-option value="bot">bot</a-select-option>
          <a-select-option value="ai">ai</a-select-option>
          <a-select-option value="task">task</a-select-option>
          <a-select-option value="security">security</a-select-option>
          <a-select-option value="system">system</a-select-option>
        </a-select>
      </a-form-item>
      <a-form-item label="关键词">
        <a-input v-model:value="query.keyword" placeholder="message/path" @press-enter="handleSearch" />
      </a-form-item>
      <a-form-item label="时间">
        <a-range-picker v-model:value="dateRange" show-time @change="handleDateChange" />
      </a-form-item>
      <a-form-item>
        <a-button type="primary" @click="handleSearch">搜索</a-button>
        <a-button style="margin-left:8px" @click="resetQuery">重置</a-button>
      </a-form-item>
    </a-form>

    <a-table
      :columns="columns"
      :data-source="list"
      :pagination="{ current: query.page, pageSize: query.pageSize, total, onChange: handlePageChange }"
      :loading="loading"
      row-key="id"
      size="small"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'level'">
          <a-tag :color="levelColor(record.level)">{{ record.level }}</a-tag>
        </template>
        <template v-if="column.key === 'statusCode'">
          <span :style="{ color: record.statusCode >= 500 ? '#ef4444' : record.statusCode >= 400 ? '#f59e0b' : '#6b7280' }">{{ record.statusCode }}</span>
        </template>
        <template v-if="column.key === 'action'">
          <a-button type="link" size="small" @click="openDetail(record)">详情</a-button>
        </template>
      </template>
    </a-table>

    <!-- 详情 Drawer -->
    <a-drawer v-model:open="detailVisible" title="日志详情" width="600">
      <a-descriptions :column="1" size="small" bordered v-if="detailRecord">
        <a-descriptions-item label="ID">{{ detailRecord.id }}</a-descriptions-item>
        <a-descriptions-item label="时间">{{ dayjs(detailRecord.createdAt).format('YYYY-MM-DD HH:mm:ss') }}</a-descriptions-item>
        <a-descriptions-item label="级别"><a-tag :color="levelColor(detailRecord.level)">{{ detailRecord.level }}</a-tag></a-descriptions-item>
        <a-descriptions-item label="模块">{{ detailRecord.module }}</a-descriptions-item>
        <a-descriptions-item label="方法">{{ detailRecord.method }}</a-descriptions-item>
        <a-descriptions-item label="路径">{{ detailRecord.path }}</a-descriptions-item>
        <a-descriptions-item label="状态码">{{ detailRecord.statusCode }}</a-descriptions-item>
        <a-descriptions-item label="耗时">{{ detailRecord.durationMs }}ms</a-descriptions-item>
        <a-descriptions-item label="IP">{{ detailRecord.ip }}</a-descriptions-item>
        <a-descriptions-item label="UserAgent">{{ detailRecord.userAgent }}</a-descriptions-item>
        <a-descriptions-item label="RequestId">{{ detailRecord.requestId }}</a-descriptions-item>
        <a-descriptions-item label="adminId">{{ detailRecord.adminId }}</a-descriptions-item>
        <a-descriptions-item label="userId">{{ detailRecord.userId }}</a-descriptions-item>
        <a-descriptions-item label="消息">{{ detailRecord.message }}</a-descriptions-item>
        <a-descriptions-item label="详情">
          <pre style="background:#f3f4f6;padding:8px;border-radius:4px;overflow:auto">{{ JSON.stringify(detailRecord.detail, null, 2) }}</pre>
        </a-descriptions-item>
      </a-descriptions>
    </a-drawer>

    <!-- 清理 Modal -->
    <a-modal v-model:open="showCleanupModal" title="清理日志" @ok="handleCleanup" :confirm-loading="cleaning">
      <a-alert type="warning" message="此操作不可恢复，请谨慎" show-icon style="margin-bottom:16px" />
      <a-form layout="vertical">
        <a-form-item label="删除多少天之前的日志" required>
          <a-input-number v-model:value="cleanupDays" :min="7" style="width:100%" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { message } from 'ant-design-vue'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import { opsApi } from '@/api/ops'

const query = reactive({
  page: 1,
  pageSize: 20,
  level: undefined as string | undefined,
  module: undefined as string | undefined,
  keyword: '',
  startTime: '',
  endTime: '',
})

const dateRange = ref<[Dayjs, Dayjs] | null>(null)
const list = ref<any[]>([])
const total = ref(0)
const loading = ref(false)

const detailVisible = ref(false)
const detailRecord = ref<any>(null)

const showCleanupModal = ref(false)
const cleaning = ref(false)
const cleanupDays = ref(30)

const columns = [
  { title: '时间', dataIndex: 'createdAt', key: 'createdAt', width: 170, customRender: ({ text }: any) => dayjs(text).format('MM-DD HH:mm:ss') },
  { title: '级别', key: 'level', width: 80 },
  { title: '模块', dataIndex: 'module', width: 100 },
  { title: '方法', dataIndex: 'method', width: 80 },
  { title: '路径', dataIndex: 'path', ellipsis: true },
  { title: '状态码', key: 'statusCode', width: 80 },
  { title: '耗时', dataIndex: 'durationMs', width: 80, customRender: ({ text }: any) => text ? `${text}ms` : '-' },
  { title: '消息', dataIndex: 'message', ellipsis: true },
  { title: '操作', key: 'action', width: 80 },
]

function levelColor(level: string) {
  if (level === 'error') return 'error'
  if (level === 'warn') return 'warning'
  return 'default'
}

async function fetchLogs() {
  loading.value = true
  try {
    const res = await opsApi.getLogs({ ...query })
    if (res.data?.code === 0) {
      list.value = res.data.data?.list || []
      total.value = res.data.data?.total || 0
    }
  } catch (err: any) {
    message.error(err.response?.data?.message || '获取日志失败')
  } finally {
    loading.value = false
  }
}

function handleSearch() {
  query.page = 1
  fetchLogs()
}

function handlePageChange(page: number, pageSize: number) {
  query.page = page
  query.pageSize = pageSize
  fetchLogs()
}

function handleDateChange(dates: [Dayjs, Dayjs] | null) {
  if (dates) {
    query.startTime = dates[0].toISOString()
    query.endTime = dates[1].toISOString()
  } else {
    query.startTime = ''
    query.endTime = ''
  }
}

function resetQuery() {
  query.level = undefined
  query.module = undefined
  query.keyword = ''
  query.startTime = ''
  query.endTime = ''
  dateRange.value = null
  query.page = 1
  fetchLogs()
}

function openDetail(record: any) {
  detailRecord.value = record
  detailVisible.value = true
}

async function handleCleanup() {
  if (!cleanupDays.value || cleanupDays.value < 7) {
    message.error('最小值为 7 天')
    return
  }
  cleaning.value = true
  try {
    const res = await opsApi.cleanupLogs({ beforeDays: cleanupDays.value })
    if (res.data?.code === 0) {
      message.success(`已清理 ${res.data.data?.deletedCount || 0} 条日志`)
      showCleanupModal.value = false
      fetchLogs()
    } else {
      message.error(res.data?.message || '清理失败')
    }
  } catch (err: any) {
    message.error(err.response?.data?.message || '清理请求失败')
  } finally {
    cleaning.value = false
  }
}

fetchLogs()
</script>
