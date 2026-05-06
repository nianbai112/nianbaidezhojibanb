<template>
  <div class="page-container">
    <div class="page-title mb-4">举报管理</div>

    <a-card size="small" class="mb-4">
      <a-row :gutter="12">
        <a-col :span="3">
          <a-select v-model:value="f.status" placeholder="状态" allow-clear style="width:100%" @change="onSearch">
            <a-select-option value="pending">待处理</a-select-option>
            <a-select-option value="resolved">已处理</a-select-option>
            <a-select-option value="rejected">已驳回</a-select-option>
          </a-select>
        </a-col>
      </a-row>
    </a-card>

    <a-table :dataSource="list" :columns="cols" :loading="ld" :pagination="{ current: p, pageSize: ps, total: t }" @change="onTableChange" rowKey="id" size="small">
      <template #bodyCell="{ column, record }">
        <template v-if="column.dataIndex === 'reporter'">
          <a-space v-if="record.reporter">
            <a-avatar :src="record.reporter.avatar" size="small" />
            <span>{{ record.reporter.nickname || '-' }}</span>
          </a-space>
        </template>
        <template v-else-if="column.dataIndex === 'status'">
          <a-tag :color="record.status === 'resolved' ? 'green' : record.status === 'rejected' ? 'default' : 'orange'">
            {{ record.status === 'resolved' ? '已处理' : record.status === 'rejected' ? '已驳回' : '待处理' }}
          </a-tag>
        </template>
        <template v-else-if="column.dataIndex === 'action'">
          <a-space v-if="record.status === 'pending'">
            <a @click="onHandle(record, 'resolved')" v-permission="'netdisk:audit'">已处理</a>
            <a @click="onHandle(record, 'rejected')" v-permission="'netdisk:audit'">驳回</a>
          </a-space>
          <span v-else style="color:#999">-</span>
        </template>
      </template>
    </a-table>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { netdiskApi } from '@/api/netdisk'

const ld = ref(false), list = ref<any[]>([]), t = ref(0), p = ref(1), ps = ref(20)
const f = reactive({ status: undefined as string | undefined })

const cols = [
  { title: '举报人', dataIndex: 'reporter', width: 140 },
  { title: '目标ID', dataIndex: 'targetId', width: 120 },
  { title: '原因', dataIndex: 'reason', width: 200 },
  { title: '状态', dataIndex: 'status', width: 90 },
  { title: '时间', dataIndex: 'createdAt', width: 160 },
  { title: '操作', dataIndex: 'action', width: 120 },
]

async function fetchList() {
  ld.value = true
  try {
    const params: any = { page: p.value, pageSize: ps.value }
    if (f.status) params.status = f.status
    const res = await netdiskApi.getReportList(params)
    const data = res.data as any
    list.value = data.list || []
    t.value = data.total || 0
  } catch { /* ignore */ }
  finally { ld.value = false }
}

function onSearch() { p.value = 1; fetchList() }
function onTableChange(pag: any) { p.value = pag.current; fetchList() }

async function onHandle(r: any, status: string) {
  await netdiskApi.handleReport(r.id, status)
  message.success(status === 'resolved' ? '已处理' : '已驳回')
  fetchList()
}

onMounted(() => fetchList())
</script>
