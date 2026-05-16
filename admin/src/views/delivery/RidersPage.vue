<template>
  <div class="page-shell">
    <PageHeader title="骑手管理" subtitle="管理骑手信息" icon="User" />
    <div class="filter-bar">
      <el-input v-model="filters.keyword" placeholder="搜索姓名/手机号" clearable style="width: 200px" @clear="loadData" @keyup.enter="loadData" />
      <el-select v-model="filters.auditStatus" placeholder="审核状态" clearable style="width: 120px" @change="loadData">
        <el-option label="待审核" value="pending" />
        <el-option label="已通过" value="approved" />
        <el-option label="已拒绝" value="rejected" />
      </el-select>
      <el-select v-model="filters.status" placeholder="在线状态" clearable style="width: 120px" @change="loadData">
        <el-option label="离线" value="offline" />
        <el-option label="在线" value="online" />
        <el-option label="忙碌" value="busy" />
      </el-select>
      <el-button type="primary" @click="loadData">查询</el-button>
      <el-button @click="resetFilters">重置</el-button>
    </div>
    <el-table :data="list" v-loading="loading" border stripe>
      <el-table-column prop="realName" label="姓名" width="100" />
      <el-table-column prop="phone" label="手机号" width="120" />
      <el-table-column prop="verifyStatus" label="审核" width="90">
        <template #default="{ row }">
          <el-tag :type="auditTypeMap[row.verifyStatus]" size="small">{{ auditMap[row.verifyStatus] || row.verifyStatus }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="status" label="在线状态" width="90">
        <template #default="{ row }">
          <el-tag :type="statusTypeMap[row.status]" size="small">{{ statusMap[row.status] || row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="rating" label="评分" width="80" />
      <el-table-column prop="totalOrders" label="总订单" width="80" />
      <el-table-column prop="todayOrders" label="今日订单" width="80" />
      <el-table-column prop="createdAt" label="注册时间" width="170">
        <template #default="{ row }">{{ new Date(row.createdAt).toLocaleString('zh-CN') }}</template>
      </el-table-column>
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <template v-if="row.verifyStatus === 'pending'">
            <el-button size="small" type="success" @click="audit(row, 'approved')">通过</el-button>
            <el-button size="small" type="danger" @click="audit(row, 'rejected')">拒绝</el-button>
          </template>
          <template v-else>
            <el-button v-if="row.verifyStatus === 'approved' && row.status !== 'offline'" size="small" type="warning" @click="updateStatus(row, 'offline')">下线</el-button>
            <el-button v-if="row.verifyStatus === 'approved' && row.status !== 'online'" size="small" type="success" @click="updateStatus(row, 'online')">上线</el-button>
          </template>
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

const auditMap: Record<string, string> = { pending: '待审核', approved: '已通过', rejected: '已拒绝' }
const auditTypeMap: Record<string, string> = { pending: 'warning', approved: 'success', rejected: 'danger' }
const statusMap: Record<string, string> = { offline: '离线', online: '在线', busy: '忙碌' }
const statusTypeMap: Record<string, string> = { offline: 'info', online: 'success', busy: 'warning' }
const loading = ref(false)
const list = ref<any[]>([])
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const filters = reactive({ keyword: '', auditStatus: '', status: '' })

const loadData = async () => {
  loading.value = true
  try {
    const res: any = await request.get('/admin/riders', { params: { page: page.value, pageSize: pageSize.value, ...filters } })
    list.value = res?.list || res?.data?.list || []
    total.value = res?.total || res?.data?.total || 0
  } catch (e: any) { ElMessage.error(e?.message || '加载失败') } finally { loading.value = false }
}

const resetFilters = () => {
  Object.assign(filters, { keyword: '', auditStatus: '', status: '' })
  loadData()
}

const audit = async (row: any, status: string) => {
  try {
    await ElMessageBox.confirm(status === 'approved' ? '通过该骑手？' : '拒绝该骑手？', '确认', { type: 'warning' })
    await request.put(`/admin/riders/${row.id}/audit`, { status })
    ElMessage.success('操作成功'); loadData()
  } catch (e: any) { if (e !== 'cancel') ElMessage.error('操作失败') }
}

const updateStatus = async (row: any, status: string) => {
  try {
    await request.put(`/admin/riders/${row.id}/status`, { status })
    ElMessage.success('状态已更新'); loadData()
  } catch (e) { ElMessage.error('操作失败') }
}

onMounted(() => loadData())
</script>

<style scoped>
.page-shell { padding: 24px; }
.filter-bar { display: flex; gap: 12px; margin: 16px 0; flex-wrap: wrap; }
.pagination-bar { display: flex; justify-content: flex-end; margin-top: 16px; }
</style>
