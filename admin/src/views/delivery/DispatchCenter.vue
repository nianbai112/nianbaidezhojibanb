<template>
  <div class="page-shell">
    <PageHeader title="调度中心" subtitle="订单调度管理" icon="Position" />
    <div class="filter-bar">
      <el-input v-model="filters.keyword" placeholder="搜索订单号" clearable style="width: 200px" @clear="loadData" @keyup.enter="loadData" />
      <el-select v-model="filters.status" placeholder="状态" clearable style="width: 120px" @change="loadData">
        <el-option label="待接单" value="PENDING_ACCEPT" />
        <el-option label="已接单" value="ACCEPTED" />
        <el-option label="进行中" value="IN_PROGRESS" />
        <el-option label="已完成" value="COMPLETED" />
      </el-select>
      <el-button type="primary" @click="loadData">查询</el-button>
      <el-button @click="resetFilters">重置</el-button>
    </div>
    <el-table :data="list" v-loading="loading" border stripe>
      <el-table-column prop="orderNo" label="订单号" width="200" show-overflow-tooltip />
      <el-table-column prop="title" label="标题" min-width="150" show-overflow-tooltip />
      <el-table-column prop="user.nickname" label="用户" width="100">
        <template #default="{ row }">{{ row.user?.nickname || row.userId }}</template>
      </el-table-column>
      <el-table-column prop="rider.realName" label="骑手" width="100">
        <template #default="{ row }">{{ row.rider?.realName || '未分配' }}</template>
      </el-table-column>
      <el-table-column prop="price" label="金额" width="100">
        <template #default="{ row }">¥{{ Number(row.price).toFixed(2) }}</template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="80">
        <template #default="{ row }">
          <el-tag :type="statusTypeMap[row.status]" size="small">{{ statusMap[row.status] || row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" label="下单时间" width="170">
        <template #default="{ row }">{{ new Date(row.createdAt).toLocaleString('zh-CN') }}</template>
      </el-table-column>
      <el-table-column label="操作" width="120" fixed="right">
        <template #default="{ row }">
          <el-button v-if="row.status === 'PENDING_ACCEPT'" size="small" type="warning" @click="cancelOrder(row)">取消</el-button>
          <span v-else>-</span>
        </template>
      </el-table-column>
    </el-table>
    <div class="pagination-bar">
      <el-pagination v-model:current-page="page" v-model:page-size="pageSize" :total="total" :page-sizes="[10,20,50]" layout="total, sizes, prev, pager, next" @size-change="loadData" @current-change="loadData" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import PageHeader from '@/components/common/PageHeader.vue'
import { request } from '@/api/request'
import { ElMessage, ElMessageBox } from 'element-plus'

const statusMap: Record<string, string> = { PENDING_PAY: '待付款', PENDING_ACCEPT: '待接单', ACCEPTED: '已接单', IN_PROGRESS: '进行中', ARRIVED: '已到达', COMPLETED: '已完成', CANCELLED: '已取消' }
const statusTypeMap: Record<string, string> = { PENDING_PAY: 'warning', PENDING_ACCEPT: 'warning', ACCEPTED: 'primary', IN_PROGRESS: 'primary', COMPLETED: 'success', CANCELLED: 'info' }
const loading = ref(false)
const list = ref<any[]>([])
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const filters = reactive({ keyword: '', status: '' })

const loadData = async () => {
  loading.value = true
  try {
    const res: any = await request.get('/admin/errand/orders', { params: { page: page.value, pageSize: pageSize.value, ...filters } })
    list.value = res?.list || res?.data?.list || []
    total.value = res?.total || res?.data?.total || 0
  } catch (e: any) { ElMessage.error(e?.message || '加载失败') } finally { loading.value = false }
}

const resetFilters = () => {
  Object.assign(filters, { keyword: '', status: '' })
  loadData()
}

const cancelOrder = async (row: any) => {
  try {
    await ElMessageBox.confirm('确定取消该订单？', '确认', { type: 'warning' })
    await request.put(`/admin/errand/orders/${row.id}/cancel`, { reason: '后台取消' })
    ElMessage.success('已取消'); loadData()
  } catch (e: any) { if (e !== 'cancel') ElMessage.error('操作失败') }
}

onMounted(() => loadData())
</script>

<style scoped>
.page-shell { padding: 24px; }
.filter-bar { display: flex; gap: 12px; margin: 16px 0; flex-wrap: wrap; }
.pagination-bar { display: flex; justify-content: flex-end; margin-top: 16px; }
</style>
