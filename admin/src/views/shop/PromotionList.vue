<template>
  <div class="page-container">
    <div class="page-card">
      <div class="page-header">
        <span class="page-title">促销活动</span>
        <a-button type="primary" @click="onCreate">
          <PlusOutlined />
          新建活动
        </a-button>
      </div>
      <DataTable
        :columns="columns"
        :data-source="list"
        :loading="loading"
        :total="total"
        v-model:page="page"
        v-model:page-size="pageSize"
        @change="onTableChange"
      >
        <template #status="{ record }">
          <a-tag :color="record.status === 1 ? 'green' : 'default'">
            {{ record.status === 1 ? '启用中' : '已停用' }}
          </a-tag>
        </template>
        <template #action="{ record }">
          <a-space>
            <a @click="onEdit(record)">编辑</a>
            <a @click="onToggle(record)">
              {{ record.status === 1 ? '停用' : '启用' }}
            </a>
          </a-space>
        </template>
      </DataTable>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { message } from 'ant-design-vue'
import { PlusOutlined } from '@ant-design/icons-vue'
import { shopApi } from '@/api/shop'
import type { Promotion } from '@/types/shop'
import DataTable from '@/components/common/DataTable.vue'

const loading = ref(false)
const list = ref<Promotion[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)

const columns = [
  { title: '名称', dataIndex: 'name' },
  { title: '类型', dataIndex: 'type', width: 100 },
  { title: '开始时间', dataIndex: 'startTime', width: 160 },
  { title: '结束时间', dataIndex: 'endTime', width: 160 },
  { title: '状态', dataIndex: 'status', width: 80, slot: 'status' },
  { title: '操作', dataIndex: 'action', width: 120, slot: 'action', fixed: 'right' },
]

async function fetchList() {
  loading.value = true
  try {
    const res = await shopApi.getPromotionList({
      page: page.value,
      pageSize: pageSize.value,
    })
    list.value = res.data?.data?.list ?? []
    total.value = res.data?.data?.total ?? 0
  } catch {
    list.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

function onTableChange() {
  fetchList()
}

function onCreate() {
  message.info('新建促销活动功能开发中')
}

function onEdit(_record: Promotion) {
  message.info('编辑促销活动功能开发中')
}

async function onToggle(record: Promotion) {
  try {
    await shopApi.togglePromotionStatus(
      record.id,
      record.status === 1 ? 0 : 1,
    )
    message.success('状态已更新')
    fetchList()
  } catch {
    message.error('操作失败，请稍后重试')
  }
}

fetchList()
</script>

<style scoped>
</style>
