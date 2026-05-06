<template>
  <div class="page-container">
    <div class="page-title mb-4">评论管理</div>

    <a-card size="small" class="mb-4">
      <a-row :gutter="12">
        <a-col :span="3">
          <a-select v-model:value="f.status" placeholder="状态" allow-clear style="width:100%" @change="onSearch">
            <a-select-option value="active">正常</a-select-option>
            <a-select-option value="deleted">已删除</a-select-option>
          </a-select>
        </a-col>
      </a-row>
    </a-card>

    <a-table :dataSource="list" :columns="cols" :loading="ld" :pagination="{ current: p, pageSize: ps, total: t }" @change="onTableChange" rowKey="id" size="small">
      <template #bodyCell="{ column, record }">
        <template v-if="column.dataIndex === 'user'">
          <a-space v-if="record.user">
            <a-avatar :src="record.user.avatar" size="small" />
            <span>{{ record.user.nickname || '-' }}</span>
          </a-space>
        </template>
        <template v-else-if="column.dataIndex === 'resource'">
          {{ record.resource?.title || record.resourceId }}
        </template>
        <template v-else-if="column.dataIndex === 'status'">
          <a-tag :color="record.status === 'active' ? 'green' : 'red'">
            {{ record.status === 'active' ? '正常' : '已删除' }}
          </a-tag>
        </template>
        <template v-else-if="column.dataIndex === 'action'">
          <a-space>
            <a v-if="record.status === 'active'" @click="onDelete(record)" v-permission="'netdisk:audit'" style="color:#ff4d4f">删除</a>
            <a v-else @click="onRestore(record)" v-permission="'netdisk:audit'">恢复</a>
          </a-space>
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
  { title: '用户', dataIndex: 'user', width: 140 },
  { title: '资源', dataIndex: 'resource', width: 180 },
  { title: '内容', dataIndex: 'content', width: 240 },
  { title: '状态', dataIndex: 'status', width: 80 },
  { title: '时间', dataIndex: 'createdAt', width: 160 },
  { title: '操作', dataIndex: 'action', width: 80 },
]

async function fetchList() {
  ld.value = true
  try {
    const params: any = { page: p.value, pageSize: ps.value }
    if (f.status) params.status = f.status
    const res = await netdiskApi.getCommentList(params)
    const data = res.data as any
    list.value = data.list || []
    t.value = data.total || 0
  } catch { /* ignore */ }
  finally { ld.value = false }
}

function onSearch() { p.value = 1; fetchList() }
function onTableChange(pag: any) { p.value = pag.current; fetchList() }

async function onDelete(r: any) {
  await netdiskApi.updateCommentStatus(r.id, 'deleted')
  message.success('已删除'); fetchList()
}
async function onRestore(r: any) {
  await netdiskApi.updateCommentStatus(r.id, 'active')
  message.success('已恢复'); fetchList()
}

onMounted(() => fetchList())
</script>
