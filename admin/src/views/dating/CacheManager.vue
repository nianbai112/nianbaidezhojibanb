<template>
  <div class="page-container">
    <div class="page-card">
      <div class="page-header">
        <span class="page-title">缓存管理</span>
        <a-button danger size="small" @click="onClearAll">清除全部</a-button>
      </div>
      <a-table :columns="columns" :data-source="keys" :loading="loading" row-key="key" :pagination="false" size="small">
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'ttl'">
            <a-tag :color="record.ttl < 0 ? 'default' : record.ttl < 300 ? 'orange' : 'green'">
              {{ record.ttl < 0 ? '永久' : `${record.ttl}s` }}
            </a-tag>
          </template>
          <template v-else-if="column.dataIndex === 'action'">
            <a-popconfirm title="确定清除?" @confirm="onClearOne(record.key)">
              <a style="color:#ef4444">清除</a>
            </a-popconfirm>
          </template>
        </template>
      </a-table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { message } from 'ant-design-vue'
import { datingApi } from '@/api/dating'

const loading = ref(false)
const keys = ref<{ key: string; ttl: number }[]>([])

const columns = [
  { title: '缓存 Key', dataIndex: 'key', ellipsis: true },
  { title: 'TTL', dataIndex: 'ttl', width: 120 },
  { title: '操作', dataIndex: 'action', width: 80 },
]

async function fetchKeys() {
  loading.value = true
  try {
    const res = await datingApi.getCacheInfo()
    keys.value = res.data?.data?.keys || res.data?.keys || []
  } finally { loading.value = false }
}

async function onClearOne(key: string) {
  try {
    await datingApi.clearCache(key)
    message.success('已清除')
    fetchKeys()
  } catch { message.error('清除失败') }
}

async function onClearAll() {
  try {
    await datingApi.clearCache()
    message.success('已清除全部缓存')
    fetchKeys()
  } catch { message.error('清除失败') }
}

fetchKeys()
</script>
