<template>
  <div class="page-shell">
    <PageHeader title="商家审核" subtitle="审核商家入驻申请" icon="Checked" />
    <div class="filter-bar">
      <el-input v-model="filters.keyword" placeholder="搜索商家名称" clearable style="width: 200px" @clear="loadData" @keyup.enter="loadData" />
      <el-select v-model="filters.status" placeholder="审核状态" clearable style="width: 120px" @change="loadData">
        <el-option label="待审核" value="pending" />
        <el-option label="已通过" value="approved" />
        <el-option label="已拒绝" value="rejected" />
        <el-option label="已关闭" value="closed" />
      </el-select>
      <el-button type="primary" @click="loadData">查询</el-button>
      <el-button @click="resetFilters">重置</el-button>
    </div>
    <el-table :data="list" v-loading="loading" border stripe>
      <el-table-column prop="name" label="商家名称" min-width="150" />
      <el-table-column prop="contactPerson" label="联系人" width="100" />
      <el-table-column prop="phone" label="电话" width="120" />
      <el-table-column prop="address" label="地址" min-width="150" show-overflow-tooltip />
      <el-table-column prop="status" label="状态" width="80">
        <template #default="{ row }">
          <el-tag :type="statusTypeMap[row.status]" size="small">{{ statusMap[row.status] || row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" label="申请时间" width="170">
        <template #default="{ row }">{{ new Date(row.createdAt).toLocaleString('zh-CN') }}</template>
      </el-table-column>
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <template v-if="row.status === 'pending'">
            <el-button size="small" type="success" @click="audit(row, 'approved')">通过</el-button>
            <el-button size="small" type="danger" @click="audit(row, 'rejected')">拒绝</el-button>
          </template>
          <el-button v-if="row.status === 'approved'" size="small" type="warning" @click="audit(row, 'closed')">关闭</el-button>
          <span v-if="row.status === 'rejected' || row.status === 'closed'">-</span>
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

const statusMap: Record<string, string> = { pending: '待审核', approved: '已通过', rejected: '已拒绝', closed: '已关闭' }
const statusTypeMap: Record<string, string> = { pending: 'warning', approved: 'success', rejected: 'danger', closed: 'info' }
const loading = ref(false)
const list = ref<any[]>([])
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const filters = reactive({ keyword: '', status: '' })

const loadData = async () => {
  loading.value = true
  try {
    const res: any = await request.get('/admin/merchants', { params: { page: page.value, pageSize: pageSize.value, ...filters } })
    list.value = res?.list || res?.data?.list || []
    total.value = res?.total || res?.data?.total || 0
  } catch (e: any) {
    ElMessage.error(e?.message || '加载审核列表失败')
  } finally {
    loading.value = false
  }
}

const resetFilters = () => {
  Object.assign(filters, { keyword: '', status: '' })
  loadData()
}

const audit = async (row: any, status: string) => {
  try {
    const msg = status === 'approved' ? '通过该商家申请？' : status === 'rejected' ? '拒绝该商家申请？' : '关闭该商家？'
    if (status === 'rejected') {
      const { value: reason } = await ElMessageBox.prompt('请输入拒绝原因', '拒绝商家', { inputPlaceholder: '拒绝原因', type: 'warning' })
      await request.put(`/admin/merchants/${row.id}/audit`, { status, remark: reason })
    } else {
      await ElMessageBox.confirm(msg, '确认', { type: 'warning' })
      await request.put(`/admin/merchants/${row.id}/audit`, { status })
    }
    ElMessage.success('操作成功')
    loadData()
  } catch (e: any) { if (e !== 'cancel') ElMessage.error('操作失败') }
}

onMounted(() => loadData())
</script>

<style scoped>
.page-shell { padding: 24px; }
.filter-bar { display: flex; gap: 12px; margin: 16px 0; flex-wrap: wrap; }
.pagination-bar { display: flex; justify-content: flex-end; margin-top: 16px; }
</style>
