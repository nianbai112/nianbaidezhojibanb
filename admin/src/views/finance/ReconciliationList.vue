<template>
  <div class="page-container">
    <div class="page-card">
      <div class="page-header">
        <span class="page-title">对账导出</span>
        <a-button type="primary" @click="onGenerate">生成今日对账</a-button>
      </div>

      <DataTable
        :columns="columns"
        :data-source="list"
        :loading="loading"
        :total="total"
        v-model:page="page"
        v-model:page-size="pageSize"
      >
        <template #totalAmount="{ record }">
          {{ (record.totalAmount / 100).toFixed(2) }}
        </template>
        <template #netAmount="{ record }">
          {{ (record.netAmount / 100).toFixed(2) }}
        </template>
        <template #action="{ record }">
          <a-space>
            <a v-if="record.status === 'done'" @click="onExport(record)">下载</a>
            <a-tag v-else color="processing">生成中</a-tag>
          </a-space>
        </template>
      </DataTable>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { message } from 'ant-design-vue'
import { financeApi } from '@/api/finance'
import DataTable from '@/components/common/DataTable.vue'

// 对账导出列表

const loading = ref(false)
const list = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)

const columns = [
  { title: '日期', dataIndex: 'date', width: 120 },
  { title: '类型', dataIndex: 'type', width: 80 },
  { title: '总订单', dataIndex: 'totalOrders', width: 80 },
  { title: '总额', dataIndex: 'totalAmount', width: 100, slot: 'totalAmount' },
  { title: '退款', dataIndex: 'totalRefund', width: 80 },
  { title: '净额', dataIndex: 'netAmount', width: 100, slot: 'netAmount' },
  { title: '状态', dataIndex: 'status', width: 80 },
  { title: '操作', dataIndex: 'action', width: 100, slot: 'action' },
]

async function fetchList() {
  loading.value = true
  try {
    // 获取对账列表
    const res = await financeApi.getReconciliationList({
      page: page.value,
      pageSize: pageSize.value,
    })
    list.value = (res.data?.data?.list || res.data?.list || []) as any[]
    total.value = res.data?.data?.total || res.data?.total || 0
  } catch (err: any) {
    message.error(err?.message || '获取对账列表失败')
  } finally {
    loading.value = false
  }
}

async function onGenerate() {
  try {
    await financeApi.generateReconciliation(
      new Date().toISOString().slice(0, 10),
      'daily',
    )
    message.success('已提交生成')
    fetchList()
  } catch (err: any) {
    message.error(err?.message || '生成失败')
  }
}

async function onExport(record: any) {
  try {
    const res = await financeApi.exportReconciliation(record.id)
    const fileUrl = res.data?.data?.fileUrl || res.data?.fileUrl
    if (fileUrl) {
      window.open(fileUrl)
    } else {
      message.info('对账数据已导出（JSON格式）')
    }
  } catch (err: any) {
    message.error(err?.message || '导出失败')
  }
}

fetchList()
</script>

<style lang="less" scoped>
</style>
