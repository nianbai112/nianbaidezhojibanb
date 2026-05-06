<template>
  <div class="page-container">
    <div class="page-title mb-4">评分记录</div>

    <a-card size="small" class="mb-4">
      <a-row :gutter="12">
        <a-col :span="5">
          <a-select v-model:value="filters.itemId" placeholder="选择评分项目" allow-clear show-search option-filter-prop="label" @change="fetchList">
            <a-select-option v-for="it in items" :key="it.id" :value="it.id" :label="it.name">{{ it.name }}</a-select-option>
          </a-select>
        </a-col>
        <a-col :span="3"><a-input v-model:value="filters.userId" placeholder="用户ID" allow-clear @change="fetchList" /></a-col>
        <a-col :span="2"><a-input-number v-model:value="filters.scoreMin" :min="1" :max="5" placeholder="最低分" style="width:100%" @change="fetchList" /></a-col>
        <a-col :span="2"><a-input-number v-model:value="filters.scoreMax" :min="1" :max="5" placeholder="最高分" style="width:100%" @change="fetchList" /></a-col>
        <a-col :span="3"><a-input v-model:value="filters.keyword" placeholder="搜索内容" allow-clear @change="fetchList" /></a-col>
      </a-row>
    </a-card>

    <a-table :dataSource="list" :columns="columns" :loading="loading" :pagination="pagination" @change="handleTableChange" rowKey="id" size="small">
      <template #bodyCell="{ column, record }">
        <template v-if="column.dataIndex === 'user'">
          <a-space><a-avatar :src="record.User?.avatar" size="small" /><span>{{ record.User?.nickname || '-' }}</span></a-space>
        </template>
        <template v-else-if="column.dataIndex === 'score'">
          <a-rate :value="record.score" disabled :count="5" style="font-size:14px" />
        </template>
        <template v-else-if="column.dataIndex === 'action'">
          <a-popconfirm title="确定删除该评分记录？" @confirm="handleDelete(record.id)"><a class="text-danger">删除</a></a-popconfirm>
        </template>
      </template>
    </a-table>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { ratingApi } from '@/api/rating'
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()
const loading = ref(false)
const items = ref<any[]>([])
const list = ref<any[]>([])
const filters = reactive({
  itemId: undefined as string | undefined,
  userId: '',
  scoreMin: undefined as number | undefined,
  scoreMax: undefined as number | undefined,
  keyword: '',
})
const pagination = reactive({ current: 1, pageSize: 20, total: 0 })

const columns = [
  { title: '用户', dataIndex: 'user', width: 150 },
  { title: '评分项目', dataIndex: ['item', 'name'], width: 120 },
  { title: '分数', dataIndex: 'score', width: 130 },
  { title: '内容', dataIndex: 'content', ellipsis: true },
  { title: '点赞', dataIndex: 'likes', width: 60 },
  { title: '时间', dataIndex: 'createdAt', width: 160 },
  { title: '操作', dataIndex: 'action', width: 80 },
]

const fetchItems = async () => {
  const res = await ratingApi.getItemList({ page: 1, pageSize: 200, regionId: userStore.regionId || undefined })
  items.value = (res.data as any).list || []
}

const fetchList = async () => {
  loading.value = true
  try {
    const res = await ratingApi.getRecordList({
      page: pagination.current, pageSize: pagination.pageSize,
      itemId: filters.itemId,
      userId: filters.userId || undefined,
      scoreMin: filters.scoreMin,
      scoreMax: filters.scoreMax,
      keyword: filters.keyword || undefined,
      regionId: userStore.regionId || undefined,
    })
    const data = res.data as any
    list.value = data.list || []
    pagination.total = data.total || 0
  } finally { loading.value = false }
}

const handleTableChange = (pag: any) => { pagination.current = pag.current; fetchList() }

const handleDelete = async (id: string) => {
  try { await ratingApi.deleteRecord(id); message.success('已删除'); fetchList() } catch {}
}

onMounted(() => { fetchItems(); fetchList() })
</script>
