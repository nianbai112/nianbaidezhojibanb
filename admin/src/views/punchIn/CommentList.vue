<template>
  <div class="page-container">
    <FilterBar @search="onSearch" @reset="onReset">
      <a-input v-model:value="f.keyword" placeholder="评论内容/用户/地点" allow-clear style="width:200px" />
      <a-input v-model:value="f.locationId" placeholder="地点ID" allow-clear style="width:160px" />
      <a-select v-model:value="f.status" placeholder="状态" allow-clear style="width:100px">
        <a-select-option value="NORMAL">正常</a-select-option>
        <a-select-option value="DELETED">已删除</a-select-option>
      </a-select>
      <a-range-picker v-model:value="f.dateRange" style="width:240px" />
    </FilterBar>
    <div class="page-card">
      <div class="page-header">
        <span class="page-title">评论管理</span>
      </div>
      <DataTable :columns="cols" :data-source="list" :loading="ld" :total="t" v-model:page="p" v-model:page-size="ps">
        <template #avatar="{ record }">
          <a-avatar v-if="record.User?.avatar" :src="record.User.avatar" :size="32" />
          <a-avatar v-else :size="32">{{ record.User?.nickname?.charAt(0) || '?' }}</a-avatar>
        </template>
        <template #status="{ record }">
          <a-tag :color="record.status === 'NORMAL' ? 'green' : 'red'">{{ record.status === 'NORMAL' ? '正常' : '已删除' }}</a-tag>
        </template>
        <template #content="{ record }">
          <span :style="{ color: record.status === 'DELETED' ? '#ccc' : '' }">{{ record.content?.substring(0, 80) }}{{ record.content?.length > 80 ? '...' : '' }}</span>
        </template>
        <template #action="{ record }">
          <a-popconfirm title="确定删除该评论吗？相关回复也会被删除" @confirm="onDelete(record)">
            <a style="color:#ff4d4f">删除</a>
          </a-popconfirm>
        </template>
      </DataTable>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { message } from 'ant-design-vue'
import { punchInApi } from '@/api/punchIn'
import FilterBar from '@/components/common/FilterBar.vue'
import DataTable from '@/components/common/DataTable.vue'
import dayjs from 'dayjs'

const ld = ref(false), list = ref<any[]>([]), t = ref(0), p = ref(1), ps = ref(20)
const f = reactive({ keyword: '', locationId: '', status: undefined as string | undefined, dateRange: null as any, startDate: '', endDate: '' })

const cols = [
  { title: 'ID', dataIndex: 'id', width: 180, ellipsis: true },
  { title: '用户', dataIndex: 'User', width: 50, slot: 'avatar' },
  { title: '昵称', dataIndex: ['User', 'nickname'], width: 120 },
  { title: '地点', dataIndex: ['location', 'name'], width: 150 },
  { title: '内容', dataIndex: 'content', width: 200, slot: 'content' },
  { title: '回复数', dataIndex: ['_count', 'replies'], width: 70 },
  { title: '状态', dataIndex: 'status', width: 70, slot: 'status' },
  { title: '时间', dataIndex: 'createdAt', width: 170 },
  { title: '操作', dataIndex: 'action', width: 70, slot: 'action' },
]

async function fetchData() {
  ld.value = true
  try {
    const params: any = { page: p.value, pageSize: ps.value }
    if (f.keyword) params.keyword = f.keyword
    if (f.locationId) params.locationId = f.locationId
    if (f.status) params.status = f.status
    if (f.dateRange) {
      params.startDate = dayjs(f.dateRange[0]).format('YYYY-MM-DD')
      params.endDate = dayjs(f.dateRange[1]).format('YYYY-MM-DD')
    }
    const res = await punchInApi.getCommentList(params)
    list.value = res.data.data?.list || []
    t.value = res.data.data?.total || 0
  } catch { /* handled */ }
  finally { ld.value = false }
}

function onSearch() { p.value = 1; fetchData() }
function onReset() { f.keyword = ''; f.locationId = ''; f.status = undefined; f.dateRange = null; onSearch() }

async function onDelete(r: any) {
  await punchInApi.deleteComment(r.id)
  message.success('已删除')
  fetchData()
}

fetchData()
</script>
