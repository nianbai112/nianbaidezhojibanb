<template>
  <div class="page-container">
    <FilterBar @search="onSearch" @reset="onReset">
      <a-input v-model:value="filter.keyword" placeholder="代理人姓名/手机号" allow-clear style="width:200px" />
      <a-input v-model:value="filter.region" placeholder="所属区域" allow-clear style="width:180px" />
    </FilterBar>
    <div class="page-card">
      <DataTable
        :columns="columns"
        :data-source="list"
        :loading="loading"
        :total="total"
        v-model:page="page"
        v-model:page-size="pageSize"
        @change="onTableChange"
      >
        <template #avatar="{ record }">
          <a-avatar :src="record.avatar" :size="40" />
        </template>
        <template #status="{ record }">
          <StatusTag :status="record.status === 1 ? 'active' : 'disabled'" type="user" />
        </template>
        <template #action="{ record }">
          <a-button type="link" size="small" @click="onViewDetail(record)">详情</a-button>
        </template>
      </DataTable>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { message } from 'ant-design-vue'
import { cityAgentApi } from '@/api/cityAgent'
import FilterBar from '@/components/common/FilterBar.vue'
import DataTable from '@/components/common/DataTable.vue'
import StatusTag from '@/components/common/StatusTag.vue'

const loading = ref(false)
const list = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const filter = reactive({ keyword: '', region: '' })

const columns = [
  { title: '头像', dataIndex: 'avatar', width: 60, slot: 'avatar' },
  { title: '姓名', dataIndex: 'name', width: 120 },
  { title: '手机号', dataIndex: 'phone', width: 130 },
  { title: '邮箱', dataIndex: 'email', width: 160 },
  { title: '所属城市', dataIndex: 'city', width: 120 },
  { title: '所属区域', dataIndex: 'region', width: 140 },
  { title: '服务商家数', dataIndex: 'merchantCount', width: 100 },
  { title: '状态', dataIndex: 'status', width: 80, slot: 'status' },
  { title: '入驻时间', dataIndex: 'createdAt', width: 160 },
  { title: '操作', dataIndex: 'action', width: 80, slot: 'action', fixed: 'right' },
]

async function fetchList() {
  loading.value = true
  try {
    const res = await cityAgentApi.getAgents({ page: page.value, pageSize: pageSize.value, ...filter })
    list.value = (res.data?.data?.list || res.data?.list || []) as any[]
    total.value = res.data?.data?.total || res.data?.total || 0
  } catch {
    // handled by interceptor
  } finally {
    loading.value = false
  }
}

function onSearch() {
  page.value = 1
  fetchList()
}

function onReset() {
  filter.keyword = ''
  filter.region = ''
  onSearch()
}

function onTableChange() {
  fetchList()
}

function onViewDetail(record: any) {
  message.info(`代理人详情页暂未创建，当前代理人ID: ${record.id}`)
}

fetchList()
</script>
