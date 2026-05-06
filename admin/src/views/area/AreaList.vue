<template>
  <div class="page-container">
    <FilterBar @search="onSearch" @reset="onReset">
      <a-input v-model:value="filter.keyword" placeholder="区域名称/编码" allow-clear style="width:200px" />
      <a-select v-model:value="filter.status" placeholder="状态" allow-clear style="width:120px">
        <a-select-option :value="1">启用</a-select-option>
        <a-select-option :value="0">关闭</a-select-option>
      </a-select>
    </FilterBar>

    <div class="page-card">
      <DataTable
        :columns="columns"
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
        <template #toolbar>
          <a-button type="primary" @click="onCreate">
            <plus-outlined /> 新建区域
          </a-button>
        </template>

        <template #coverImage="{ record }">
          <a-image :src="record.coverImage" :width="60" :height="40" style="object-fit:cover;border-radius:4px" />
        </template>

        <template #status="{ record }">
          <StatusTag :status="record.status === 1 ? 'active' : 'disabled'" type="user" />
        </template>

        <template #studentOnly="{ record }">
          <a-tag :color="record.studentOnly ? 'blue' : 'default'">
            {{ record.studentOnly ? '仅限学生' : '不限' }}
          </a-tag>
        </template>

        <template #action="{ record }">
          <a-space>
            <a @click="onDetail(record.id)">详情</a>
            <a @click="onEdit(record.id)">编辑</a>
            <a @click="onDecoration(record.id)">装修</a>
            <a-popconfirm title="确定切换状态?" @confirm="onToggleStatus(record)">
              <a :type="record.status === 1 ? 'danger' : undefined">
                {{ record.status === 1 ? '关闭' : '启用' }}
              </a>
            </a-popconfirm>
            <a-popconfirm
              title="确定删除这个区域？关联的区域装修、公告、导航也会删除。"
              ok-text="删除"
              cancel-text="取消"
              @confirm="onDelete(record)"
            >
              <a style="color:#ef4444">删除</a>
            </a-popconfirm>
          </a-space>
        </template>
      </DataTable>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { Modal, message } from 'ant-design-vue'
import { PlusOutlined } from '@ant-design/icons-vue'
import { areaApi } from '@/api/area'
import FilterBar from '@/components/common/FilterBar.vue'
import DataTable from '@/components/common/DataTable.vue'
import StatusTag from '@/components/common/StatusTag.vue'
import type { Area } from '@/types/area'

const router = useRouter()

const loading = ref(false)
const list = ref<Area[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const selectedKeys = ref<(string | number)[]>([])

const filter = reactive({ keyword: '', status: undefined as number | undefined })

const columns = [
  { title: 'ID', dataIndex: 'id', width: 60 },
  { title: '封面', dataIndex: 'coverImage', width: 80, slot: 'coverImage' },
  { title: '区域名称', dataIndex: 'name', width: 150 },
  { title: '编码', dataIndex: 'code', width: 100 },
  { title: '城市', dataIndex: 'city', width: 100 },
  { title: '学生限制', dataIndex: 'studentOnly', width: 90, slot: 'studentOnly' },
  { title: '状态', dataIndex: 'status', width: 80, slot: 'status' },
  { title: '排序', dataIndex: 'sort', width: 60 },
  { title: '创建时间', dataIndex: 'createdAt', width: 160 },
  { title: '操作', dataIndex: 'action', width: 240, slot: 'action', fixed: 'right' },
]

const batchActions = [
  { key: 'enable', label: '批量启用' },
  { key: 'disable', label: '批量关闭', danger: true },
  { key: 'delete', label: '批量删除', danger: true },
]

async function fetchList() {
  loading.value = true
  try {
    const res = await areaApi.getList({
      page: page.value,
      pageSize: pageSize.value,
      keyword: filter.keyword,
      status: filter.status,
    })
    list.value = res.data.data.list
    total.value = res.data.data.total
  } catch { /* handled by interceptor */ }
  finally { loading.value = false }
}

function onSearch() { page.value = 1; fetchList() }
function onReset() { filter.keyword = ''; filter.status = undefined; onSearch() }
function onTableChange() { fetchList() }

async function onBatchAction(action: string, keys: (string | number)[]) {
  if (action === 'delete') {
    Modal.confirm({
      title: `确定删除选中的 ${keys.length} 个区域？`,
      content: '删除后区域装修、公告、导航、TabBar 等配置会一起删除，请谨慎操作。',
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      async onOk() {
        await areaApi.batchOp({ ids: keys, action: 'delete' })
        message.success('删除成功')
        selectedKeys.value = []
        fetchList()
      },
    })
    return
  }

  const status = action === 'enable' ? 1 : 0
  await areaApi.batchOp({ ids: keys, action: 'status', data: { status } })
  message.success('操作成功')
  selectedKeys.value = []
  fetchList()
}

function onCreate() {
  router.push('/area/create')
}

function onEdit(id: number) {
  router.push(`/area/edit/${id}`)
}

function onDetail(id: number) { router.push(`/area/detail/${id}`) }
function onDecoration(id: number) { router.push(`/area/decoration/${id}`) }

async function onToggleStatus(record: Area) {
  await areaApi.toggleStatus(record.id, record.status === 1 ? 0 : 1)
  message.success('状态已更新')
  fetchList()
}

async function onDelete(record: Area) {
  await areaApi.delete(record.id)
  message.success('区域已删除')
  fetchList()
}

fetchList()
</script>
