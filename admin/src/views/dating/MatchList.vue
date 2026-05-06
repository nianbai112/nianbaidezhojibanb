<template>
  <div class="page-container">
    <FilterBar @search="onSearch" @reset="onReset">
      <a-input v-model:value="filter.userId" placeholder="用户ID" allow-clear style="width:200px" />
      <a-select v-model:value="filter.status" placeholder="状态" allow-clear style="width:130px">
        <a-select-option value="PENDING">待匹配</a-select-option>
        <a-select-option value="MATCHED">已匹配</a-select-option>
        <a-select-option value="REJECTED">已拒绝</a-select-option>
      </a-select>
      <a-select v-model:value="filter.matchType" placeholder="匹配类型" allow-clear style="width:130px">
        <a-select-option value="interest">兴趣匹配</a-select-option>
        <a-select-option value="appearance">颜值匹配</a-select-option>
        <a-select-option value="random">随机匹配</a-select-option>
      </a-select>
      <a-range-picker v-model:value="filter.dateRange" value-format="YYYY-MM-DD" :placeholder="['开始日期','结束日期']" style="width:240px" />
    </FilterBar>

    <div class="page-card">
      <div class="page-header"><span class="page-title">匹配记录</span></div>
      <DataTable :columns="columns" :data-source="list" :loading="loading" :total="total" v-model:page="page" v-model:page-size="pageSize" @change="fetchList">
        <template #userA="{ record }">
          <a-space>
            <a-avatar :src="record.user?.avatar" :size="32" />
            <span>{{ record.user?.nickname || record.userId }}</span>
          </a-space>
        </template>
        <template #userB="{ record }">
          <a-space>
            <a-avatar :src="record.target?.avatar" :size="32" />
            <span>{{ record.target?.nickname || record.targetId }}</span>
          </a-space>
        </template>
        <template #matchType="{ record }">
          <a-tag :color="record.matchType === 'interest' ? 'blue' : record.matchType === 'appearance' ? 'pink' : 'default'">
            {{ record.matchType === 'interest' ? '兴趣' : record.matchType === 'appearance' ? '颜值' : '随机' }}
          </a-tag>
        </template>
        <template #status="{ record }">
          <a-tag :color="record.status === 'MATCHED' ? 'green' : record.status === 'REJECTED' ? 'red' : 'orange'">
            {{ record.status === 'MATCHED' ? '已匹配' : record.status === 'REJECTED' ? '已拒绝' : '待匹配' }}
          </a-tag>
        </template>
      </DataTable>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { datingApi } from '@/api/dating'
import FilterBar from '@/components/common/FilterBar.vue'
import DataTable from '@/components/common/DataTable.vue'

const loading = ref(false)
const list = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const filter = reactive({ userId: '', status: undefined as string | undefined, matchType: undefined as string | undefined, dateRange: undefined as [string, string] | undefined })

const columns = [
  { title: '用户A', dataIndex: 'user', width: 180, slot: 'userA' },
  { title: '用户B', dataIndex: 'target', width: 180, slot: 'userB' },
  { title: '匹配类型', dataIndex: 'matchType', width: 90, slot: 'matchType' },
  { title: '状态', dataIndex: 'status', width: 80, slot: 'status' },
  { title: '时间', dataIndex: 'createdAt', width: 160 },
]

async function fetchList() {
  loading.value = true
  try {
    const params: any = { page: page.value, pageSize: pageSize.value, userId: filter.userId || undefined, status: filter.status, matchType: filter.matchType }
    if (filter.dateRange?.length === 2) {
      params.startDate = filter.dateRange[0]
      params.endDate = filter.dateRange[1]
    }
    const res = await datingApi.getMatchList(params)
    list.value = (res.data?.data?.list || res.data?.list || []) as any[]
    total.value = res.data?.data?.total || res.data?.total || 0
  } finally { loading.value = false }
}

function onSearch() { page.value = 1; fetchList() }
function onReset() { filter.userId = ''; filter.status = undefined; filter.matchType = undefined; filter.dateRange = undefined; onSearch() }

fetchList()
</script>
