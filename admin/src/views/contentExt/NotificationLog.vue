<template>
  <div class="page-container">
    <FilterBar @search="onSearch" @reset="onReset">
      <a-input v-model:value="filter.userId" placeholder="用户ID" allow-clear style="width:160px" />
      <a-select v-model:value="filter.type" placeholder="通知类型" allow-clear style="width:120px">
        <a-select-option value="SYSTEM">系统</a-select-option>
        <a-select-option value="LIKE">点赞</a-select-option>
        <a-select-option value="COMMENT">评论</a-select-option>
        <a-select-option value="FOLLOW">关注</a-select-option>
        <a-select-option value="ORDER">订单</a-select-option>
        <a-select-option value="DELIVERY">配送</a-select-option>
        <a-select-option value="WALLET">钱包</a-select-option>
      </a-select>
      <a-select v-model:value="filter.isRead" placeholder="读取状态" allow-clear style="width:110px">
        <a-select-option value="unread">未读</a-select-option>
        <a-select-option value="read">已读</a-select-option>
      </a-select>
    </FilterBar>

    <div class="page-card">
      <DataTable
        :columns="columns as any"
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
        <template #user="{ record }">
          <a-space :size="8">
            <a-avatar v-if="record.user" :src="record.user.avatar" :size="24" />
            <span>{{ record.user?.nickname || record.userId || '-' }}</span>
          </a-space>
        </template>
        <template #type="{ record }">
          <a-tag :color="typeColorMap[record.type] || 'default'">{{ typeMap[record.type] || record.type }}</a-tag>
        </template>
        <template #isRead="{ record }">
          <a-badge :status="record.isRead ? 'default' : 'processing'" :text="record.isRead ? '已读' : '未读'" />
        </template>
        <template #action="{ record }">
          <a-popconfirm title="确定删除?" @confirm="onDelete(record.id)">
            <a-button type="link" size="small" danger>删除</a-button>
          </a-popconfirm>
        </template>
      </DataTable>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { contentExtApi } from '@/api/contentExt'
import FilterBar from '@/components/common/FilterBar.vue'
import DataTable from '@/components/common/DataTable.vue'

const loading = ref(false)
const list = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const selectedKeys = ref<(string | number)[]>([])

const filter = reactive({
  userId: '',
  type: undefined as string | undefined,
  isRead: undefined as string | undefined,
})

const typeMap: Record<string, string> = {
  SYSTEM: '系统', LIKE: '点赞', COMMENT: '评论', FOLLOW: '关注',
  ORDER: '订单', DELIVERY: '配送', WALLET: '钱包', CIRCLE: '圈子',
}
const typeColorMap: Record<string, string> = {
  SYSTEM: 'blue', LIKE: 'red', COMMENT: 'orange', FOLLOW: 'purple',
  ORDER: 'green', DELIVERY: 'cyan', WALLET: 'gold',
}

const columns = [
  { title: 'ID', dataIndex: 'id', width: 70 },
  { title: '用户', dataIndex: 'user', width: 140, slot: 'user' },
  { title: '类型', dataIndex: 'type', width: 80, slot: 'type' },
  { title: '标题', dataIndex: 'title', width: 180, ellipsis: true },
  { title: '内容', dataIndex: 'content', ellipsis: true },
  { title: '状态', dataIndex: 'isRead', width: 80, slot: 'isRead' },
  { title: '时间', dataIndex: 'createdAt', width: 160 },
  { title: '操作', dataIndex: 'action', width: 80, slot: 'action', fixed: 'right' },
]

const batchActions = [
  { key: 'delete', label: '批量删除', danger: true },
]

async function fetchList() {
  loading.value = true
  try {
    const params: any = { page: page.value, pageSize: pageSize.value }
    if (filter.userId) params.userId = filter.userId
    if (filter.type) params.type = filter.type
    if (filter.isRead) params.isRead = filter.isRead === 'read'
    const res = await contentExtApi.getNotifications(params)
    const body: any = res.data?.data || res.data || {}
    list.value = body.list || []
    total.value = body.total || 0
  } catch { /* ignore */ } finally { loading.value = false }
}

function onSearch() { page.value = 1; fetchList() }
function onReset() { filter.userId = ''; filter.type = undefined; filter.isRead = undefined; onSearch() }
function onTableChange() { fetchList() }

async function onBatchAction(action: string, keys: (string | number)[]) {
  if (action === 'delete') {
    try {
      for (const id of keys) { await contentExtApi.deleteNotification(String(id)) }
      message.success('已批量删除')
      selectedKeys.value = []
      fetchList()
    } catch { message.error('批量删除失败') }
  }
}

async function onDelete(id: string) {
  try {
    await contentExtApi.deleteNotification(id)
    message.success('已删除')
    fetchList()
  } catch { /* ignore */ }
}

onMounted(() => fetchList())
</script>
