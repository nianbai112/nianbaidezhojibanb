<template>
  <div class="page-container">
    <FilterBar @search="onSearch" @reset="onReset">
      <a-input v-model:value="filter.keyword" placeholder="举报人/被举报人" allow-clear style="width:180px" />
      <a-select v-model:value="filter.status" placeholder="处理状态" allow-clear style="width:120px">
        <a-select-option value="pending">待处理</a-select-option>
        <a-select-option value="handled">已处理</a-select-option>
        <a-select-option value="ignored">已忽略</a-select-option>
      </a-select>
      <a-select v-model:value="filter.targetType" placeholder="举报类型" allow-clear style="width:120px">
        <a-select-option value="post">帖子</a-select-option>
        <a-select-option value="comment">评论</a-select-option>
        <a-select-option value="user">用户</a-select-option>
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
        @change="onTableChange"
      >
        <template #targetType="{ record }">
          <a-tag :color="targetTypeColor[record.targetType] || 'default'">{{ targetTypeLabel[record.targetType] || record.targetType }}</a-tag>
        </template>
        <template #status="{ record }">
          <StatusTag :status="record.status" type="audit" />
        </template>
        <template #action="{ record }">
          <a-space>
            <a-button type="link" size="small" @click="openDetail(record)">详情</a-button>
            <template v-if="record.status === 'pending'">
              <a-button type="link" size="small" style="color:#10b981" @click="onHandle(record, 'handled')">处理</a-button>
              <a-button type="link" size="small" style="color:#9ca3af" @click="onHandle(record, 'ignored')">忽略</a-button>
            </template>
          </a-space>
        </template>
      </DataTable>
    </div>

    <!-- 举报详情弹窗 -->
    <a-modal v-model:visible="detailVisible" title="举报详情" :footer="null" width="560">
      <template v-if="detailReport">
        <a-descriptions :column="1" size="small" bordered>
          <a-descriptions-item label="举报人">{{ detailReport.reporterName || detailReport.reporterId }}</a-descriptions-item>
          <a-descriptions-item label="被举报人">{{ detailReport.reportedName || detailReport.reportedId || '-' }}</a-descriptions-item>
          <a-descriptions-item label="举报类型">
            <a-tag :color="targetTypeColor[detailReport.targetType] || 'default'">{{ targetTypeLabel[detailReport.targetType] || detailReport.targetType }}</a-tag>
          </a-descriptions-item>
          <a-descriptions-item label="目标ID">{{ detailReport.targetId }}</a-descriptions-item>
          <a-descriptions-item label="举报原因">{{ detailReport.reason || '-' }}</a-descriptions-item>
          <a-descriptions-item label="详细描述">{{ detailReport.description || '-' }}</a-descriptions-item>
          <a-descriptions-item label="证据图片" v-if="detailReport.images?.length">
            <a-image v-for="(url, i) in detailReport.images" :key="i" :src="url" :width="80" :height="80" style="object-fit:cover;border-radius:4px;margin-right:8px" />
          </a-descriptions-item>
          <a-descriptions-item label="处理状态">
            <StatusTag :status="detailReport.status" type="audit" />
          </a-descriptions-item>
          <a-descriptions-item label="处理结果" v-if="detailReport.handleResult">{{ detailReport.handleResult }}</a-descriptions-item>
          <a-descriptions-item label="处理时间" v-if="detailReport.handledAt">{{ detailReport.handledAt }}</a-descriptions-item>
          <a-descriptions-item label="举报时间">{{ detailReport.createdAt }}</a-descriptions-item>
        </a-descriptions>

        <div v-if="detailReport.status === 'pending'" style="margin-top:16px;text-align:right">
          <a-space>
            <a-button @click="detailVisible = false">关闭</a-button>
            <a-button type="primary" @click="onHandle(detailReport, 'handled'); detailVisible = false">标记已处理</a-button>
            <a-button @click="onHandle(detailReport, 'ignored'); detailVisible = false">忽略</a-button>
          </a-space>
        </div>
      </template>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { message } from 'ant-design-vue'
import { contentApi } from '@/api/content'
import FilterBar from '@/components/common/FilterBar.vue'
import DataTable from '@/components/common/DataTable.vue'
import StatusTag from '@/components/common/StatusTag.vue'

const loading = ref(false)
const list = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)

const filter = reactive({
  keyword: '',
  status: undefined as string | undefined,
  targetType: undefined as string | undefined,
})

const detailVisible = ref(false)
const detailReport = ref<any>(null)

const targetTypeLabel: Record<string, string> = { post: '帖子', comment: '评论', user: '用户' }
const targetTypeColor: Record<string, string> = { post: 'blue', comment: 'orange', user: 'purple' }

const columns = [
  { title: '举报人', dataIndex: 'reporterName', width: 100 },
  { title: '被举报人', dataIndex: 'reportedName', width: 100 },
  { title: '类型', dataIndex: 'targetType', width: 80, slot: 'targetType' },
  { title: '目标ID', dataIndex: 'targetId', width: 110 },
  { title: '原因', dataIndex: 'reason', width: 130, ellipsis: true },
  { title: '状态', dataIndex: 'status', width: 80, slot: 'status' },
  { title: '举报时间', dataIndex: 'createdAt', width: 160 },
  { title: '操作', dataIndex: 'action', width: 140, slot: 'action', fixed: 'right' },
]

async function fetchList() {
  loading.value = true
  try {
    const params: any = { page: page.value, pageSize: pageSize.value, status: filter.status, targetType: filter.targetType }
    if (filter.keyword) params.keyword = filter.keyword
    const res = await contentApi.getReportList(params)
    const body: any = res.data?.data || res.data || {}
    list.value = body.list || []
    total.value = body.total || 0
  } catch { /* handled */ } finally { loading.value = false }
}

function onSearch() { page.value = 1; fetchList() }
function onReset() { filter.keyword = ''; filter.status = undefined; filter.targetType = undefined; onSearch() }
function onTableChange() { fetchList() }

function openDetail(record: any) {
  detailReport.value = record
  detailVisible.value = true
}

async function onHandle(record: any, result: string) {
  try {
    await contentApi.handleReport(record.id, result, result === 'handled' ? '已处理' : '已忽略')
    message.success('操作成功')
    fetchList()
  } catch { message.error('操作失败') }
}

fetchList()
</script>
