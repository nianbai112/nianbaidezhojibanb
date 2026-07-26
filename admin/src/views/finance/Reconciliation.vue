<template>
  <div class="page-shell">
    <PageHeader title="对账中心" subtitle="财务对账管理" icon="Checked" />
    <div class="filter-bar">
      <el-date-picker v-model="dateRange" type="daterange" range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期" style="width: 240px" @change="loadData" />
      <el-button type="primary" @click="loadData">查询</el-button>
    </div>
    <el-table :data="list" v-loading="loading" border stripe>
      <el-table-column prop="date" label="日期" width="120" />
      <el-table-column prop="orderCount" label="订单数" width="100" />
      <el-table-column prop="payAmount" label="支付金额" width="120">
        <template #default="{ row }">¥{{ Number(row.payAmount || 0).toFixed(2) }}</template>
      </el-table-column>
      <el-table-column prop="refundAmount" label="退款金额" width="120">
        <template #default="{ row }">¥{{ Number(row.refundAmount || 0).toFixed(2) }}</template>
      </el-table-column>
      <el-table-column prop="netAmount" label="净收入" width="120">
        <template #default="{ row }">¥{{ Number(row.netAmount || 0).toFixed(2) }}</template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="80">
        <template #default="{ row }">
          <el-tag :type="row.status === 'reconciled' ? 'success' : 'warning'" size="small">
            {{ row.status === 'reconciled' ? '已对账' : '待对账' }}
          </el-tag>
        </template>
      </el-table-column>
    </el-table>
    <div class="pagination-bar">
      <el-pagination v-model:current-page="page" v-model:page-size="pageSize" :total="total" :page-sizes="[10,20,50]" layout="total, sizes, prev, pager, next" @size-change="loadData" @current-change="loadData" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import PageHeader from '@/components/common/PageHeader.vue'
import { request } from '@/api/request'

const loading = ref(false)
const list = ref<any[]>([])
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const dateRange = ref<any>(null)

const loadData = async () => {
  loading.value = true
  try {
    const params: any = { page: page.value, pageSize: pageSize.value }
    if (dateRange.value?.[0]) params.startDate = dateRange.value[0].toISOString()
    if (dateRange.value?.[1]) params.endDate = dateRange.value[1].toISOString()
    const res: any = await request.get('/admin/reconciliation', { params })
    list.value = res?.list || res?.data?.list || []
    total.value = res?.total || res?.data?.total || 0
  } catch (e: any) { ElMessage.error(e?.message || '加载失败') } finally { loading.value = false }
}

onMounted(() => loadData())
</script>

<style scoped>
.page-shell { padding: 24px; }
.filter-bar { display: flex; gap: 12px; margin: 16px 0; }
.pagination-bar { display: flex; justify-content: flex-end; margin-top: 16px; }
</style>
