<template>
  <div class="table-page">
    <div class="table-toolbar">
      <div>
        <div class="page-title">文件管理</div>
        <p class="page-desc">管理用户上传的文件，支持按类型/场景筛选和批量删除</p>
      </div>
      <a-space>
        <a-button danger :disabled="selectedIds.length === 0" @click="handleBatchDelete">批量删除 ({{ selectedIds.length }})</a-button>
      </a-space>
    </div>

    <div class="filter-bar">
      <a-space>
        <a-input-search v-model:value="search.keyword" placeholder="文件名搜索" allow-clear style="width:220px" @search="doSearch" />
        <a-select v-model:value="search.fileType" placeholder="文件类型" allow-clear style="width:130px" @change="doSearch">
          <a-select-option value="image">图片</a-select-option>
          <a-select-option value="video">视频</a-select-option>
          <a-select-option value="audio">音频</a-select-option>
          <a-select-option value="document">文档</a-select-option>
        </a-select>
        <a-select v-model:value="search.scene" placeholder="上传场景" allow-clear style="width:130px" @change="doSearch">
          <a-select-option value="avatar">头像</a-select-option>
          <a-select-option value="post">帖子</a-select-option>
          <a-select-option value="admin">后台</a-select-option>
          <a-select-option value="region">区域</a-select-option>
          <a-select-option value="config">配置</a-select-option>
          <a-select-option value="ad">广告</a-select-option>
        </a-select>
      </a-space>
    </div>

    <div class="table-container">
      <a-table
        :dataSource="list"
        :columns="columns"
        :loading="loading"
        :pagination="pagination"
        rowKey="id"
        :rowSelection="{ selectedRowKeys: selectedIds, onChange: onSelectChange }"
        @change="onTableChange"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'fileName'">
            <div class="file-name-cell">
              <img v-if="record.fileType === 'image' && record.url" :src="record.url" class="file-thumb" />
              <span>{{ record.fileName }}</span>
            </div>
          </template>
          <template v-else-if="column.dataIndex === 'fileSize'">
            {{ formatSize(record.fileSize) }}
          </template>
          <template v-else-if="column.dataIndex === 'fileType'">
            <a-tag>{{ record.fileType }}</a-tag>
          </template>
          <template v-else-if="column.dataIndex === 'scene'">
            <a-tag v-if="record.scene" color="blue">{{ record.scene }}</a-tag>
            <span v-else class="text-secondary">-</span>
          </template>
          <template v-else-if="column.dataIndex === 'url'">
            <a :href="record.url" target="_blank" class="file-link">查看</a>
          </template>
          <template v-else-if="column.dataIndex === 'action'">
            <a-popconfirm title="确定要删除该文件吗？" @confirm="handleDelete(record.id)">
              <a class="text-danger">删除</a>
            </a-popconfirm>
          </template>
        </template>
      </a-table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { systemApi } from '@/api/system'

const loading = ref(false)
const list = ref<any[]>([])
const selectedIds = ref<string[]>([])

const search = reactive({ keyword: '', fileType: '', scene: '' })
const pagination = reactive({
  current: 1,
  pageSize: 20,
  total: 0,
  showSizeChanger: true,
  showTotal: (total: number) => `共 ${total} 条`,
})

const columns = [
  { title: '文件名', dataIndex: 'fileName', width: 260 },
  { title: '大小', dataIndex: 'fileSize', width: 100 },
  { title: '类型', dataIndex: 'fileType', width: 80 },
  { title: '场景', dataIndex: 'scene', width: 80 },
  { title: 'URL', dataIndex: 'url', width: 80 },
  { title: '上传时间', dataIndex: 'createdAt', width: 170 },
  { title: '操作', dataIndex: 'action', width: 80 },
]

onMounted(() => fetchList())

function formatSize(bytes: number) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let size = bytes
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++ }
  return `${size.toFixed(i > 0 ? 1 : 0)} ${units[i]}`
}

async function fetchList() {
  loading.value = true
  try {
    const res = await systemApi.getUploadFiles({
      page: pagination.current,
      pageSize: pagination.pageSize,
      keyword: search.keyword || undefined,
      fileType: search.fileType || undefined,
      scene: search.scene || undefined,
    })
    const data = (res.data?.data || res.data || {}) as any
    list.value = data.list || []
    pagination.total = data.total || 0
  } catch (err: any) {
    message.error(err?.response?.data?.message || '获取文件列表失败')
  } finally {
    loading.value = false
  }
}

function doSearch() {
  pagination.current = 1
  fetchList()
}

function onTableChange(pag: any) {
  pagination.current = pag.current
  pagination.pageSize = pag.pageSize
  fetchList()
}

function onSelectChange(keys: any[]) {
  selectedIds.value = keys as string[]
}

async function handleDelete(id: string) {
  try {
    await systemApi.deleteUploadFile(id)
    message.success('已删除')
    fetchList()
  } catch (err: any) {
    message.error(err?.response?.data?.message || '删除失败')
  }
}

async function handleBatchDelete() {
  try {
    await systemApi.batchDeleteUploadFiles({ ids: selectedIds.value })
    message.success(`已删除 ${selectedIds.value.length} 个文件`)
    selectedIds.value = []
    fetchList()
  } catch (err: any) {
    message.error(err?.response?.data?.message || '批量删除失败')
  }
}
</script>

<style scoped lang="less">
.table-page {
  padding: 24px;
}
.table-toolbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 16px;
}
.page-title {
  font-size: 18px;
  font-weight: 600;
  color: #111827;
}
.page-desc {
  margin: 4px 0 0;
  color: #6b7280;
  font-size: 13px;
}
.filter-bar {
  margin-bottom: 16px;
}
.table-container {
  background: #fff;
  border-radius: 8px;
  padding: 16px;
}
.file-name-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}
.file-thumb {
  width: 36px;
  height: 36px;
  border-radius: 4px;
  object-fit: cover;
  flex-shrink: 0;
}
.file-link {
  word-break: break-all;
}
</style>
