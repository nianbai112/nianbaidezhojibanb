<template>
  <div class="page-shell">
    <PageHeader title="退款订单" subtitle="查看退款订单记录" icon="Money" />
    <div class="filter-bar">
      <el-input v-model="filters.keyword" placeholder="搜索退款单号" clearable style="width: 200px" @clear="loadData" @keyup.enter="loadData" />
      <el-select v-model="filters.status" placeholder="状态" clearable style="width: 120px" @change="loadData">
        <el-option label="成功" value="SUCCESS" />
        <el-option label="处理中" value="PROCESSING" />
        <el-option label="失败" value="FAILED" />
      </el-select>
      <el-button type="primary" @click="loadData">查询</el-button>
      <el-button @click="resetFilters">重置</el-button>
    </div>
    <el-table :data="list" v-loading="loading" border stripe>
      <el-table-column prop="refundNo" label="退款单号" width="200" show-overflow-tooltip />
      <el-table-column prop="orderNo" label="原订单号" width="200" show-overflow-tooltip />
      <el-table-column prop="user.nickname" label="用户" width="120">
        <template #default="{ row }">{{ row.user?.nickname || row.userId }}</template>
      </el-table-column>
      <el-table-column prop="amount" label="退款金额" width="100">
        <template #default="{ row }">¥{{ Number(row.amount).toFixed(2) }}</template>
      </el-table-column>
      <el-table-column prop="reason" label="原因" min-width="150" show-overflow-tooltip />
      <el-table-column prop="status" label="状态" width="80">
        <template #default="{ row }">
          <el-tag :type="row.status === 'SUCCESS' ? 'success' : row.status === 'FAILED' ? 'danger' : 'warning'" size="small">
            {{ statusMap[row.status] || row.status }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" label="时间" width="170">
        <template #default="{ row }">{{ new Date(row.createdAt).toLocaleString('zh-CN') }}</template>
      </el-table-column>
    </el-table>
    <div class="pagination-bar">
      <el-pagination v-model:current-page="page" v-model:page-size="pageSize" :total="total" :page-sizes="[10,20,50]" layout="total, sizes, prev, pager, next" @size-change="loadData" @current-change="loadData" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import PageHeader from '@/components/common/PageHeader.vue'
import { request } from '@/api/request'

const statusMap: Record<string, string> = { SUCCESS: '成功', PROCESSING: '处理中', FAILED: '失败' }
const loading = ref(false)
const list = ref<any[]>([])
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const filters = reactive({ keyword: '', status: '' })

const loadData = async () => {
  loading.value = true
  try {
    const res: any = await request.get('/admin/refund-orders', { params: { page: page.value, pageSize: pageSize.value, ...filters } })
    list.value = res?.list || res?.data?.list || []
    total.value = res?.total || res?.data?.total || 0
  } catch (e: any) { ElMessage.error(e?.message || '加载失败') } finally { loading.value = false }
}

const resetFilters = () => {
  Object.assign(filters, { keyword: '', status: '' })
  loadData()
}

onMounted(() => loadData())
</script>

<style scoped>
.page-shell { padding: 24px; }
.filter-bar { display: flex; gap: 12px; margin: 16px 0; flex-wrap: wrap; }
.pagination-bar { display: flex; justify-content: flex-end; margin-top: 16px; }
</style>
