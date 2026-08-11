<template>
  <div class="page-shell">
    <PageHeader title="提现审核" subtitle="审核用户提现申请" icon="Wallet" />
    <div class="filter-bar">
      <el-input v-model="filters.keyword" placeholder="搜索提现ID/用户/账号" clearable style="width: 220px" @clear="loadData" @keyup.enter="loadData" />
      <el-select v-model="filters.status" placeholder="状态" clearable style="width: 120px" @change="loadData">
        <el-option label="待审核" value="PENDING" />
        <el-option label="处理中" value="PROCESSING" />
        <el-option label="成功" value="SUCCESS" />
        <el-option label="已拒绝" value="REJECTED" />
      </el-select>
      <el-button type="primary" @click="loadData">查询</el-button>
      <el-button @click="resetFilters">重置</el-button>
    </div>
    <el-table :data="list" v-loading="loading" border stripe>
      <el-table-column prop="user.nickname" label="用户" width="120">
        <template #default="{ row }">{{ row.user?.nickname || row.userId }}</template>
      </el-table-column>
      <el-table-column prop="amount" label="金额" width="100">
        <template #default="{ row }">¥{{ Number(row.amount).toFixed(2) }}</template>
      </el-table-column>
      <el-table-column prop="channel" label="渠道" width="80" />
      <el-table-column prop="account" label="收款账号" width="180" show-overflow-tooltip />
      <el-table-column prop="realName" label="真实姓名" width="100" />
      <el-table-column prop="status" label="状态" width="80">
        <template #default="{ row }">
          <el-tag :type="statusTypeMap[row.status]" size="small">{{ statusMap[row.status] || row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="failReason" label="原因" width="150" show-overflow-tooltip />
      <el-table-column prop="createdAt" label="申请时间" width="170">
        <template #default="{ row }">{{ new Date(row.createdAt).toLocaleString('zh-CN') }}</template>
      </el-table-column>
      <el-table-column label="操作" width="150" fixed="right">
        <template #default="{ row }">
          <template v-if="row.status === 'PENDING'">
            <el-button size="small" type="success" @click="review(row, true)">通过</el-button>
            <el-button size="small" type="danger" @click="review(row, false)">拒绝</el-button>
          </template>
          <el-button v-else-if="row.status === 'PROCESSING'" size="small" type="primary" @click="complete(row)">确认打款</el-button>
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
import { useRoute } from 'vue-router'
import PageHeader from '@/components/common/PageHeader.vue'
import { request } from '@/api/request'
import { ElMessage, ElMessageBox } from 'element-plus'

const statusMap: Record<string, string> = { PENDING: '待审核', PROCESSING: '处理中', SUCCESS: '成功', FAILED: '失败', REJECTED: '已拒绝' }
const statusTypeMap: Record<string, string> = { PENDING: 'warning', PROCESSING: 'primary', SUCCESS: 'success', FAILED: 'danger', REJECTED: 'danger' }
const loading = ref(false)
const route = useRoute()
const list = ref<any[]>([])
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const filters = reactive({ keyword: '', status: '' })

const loadData = async () => {
  loading.value = true
  try {
    const res: any = await request.get('/admin/withdrawals', { params: { page: page.value, pageSize: pageSize.value, ...filters } })
    list.value = res?.list || res?.data?.list || []
    total.value = res?.total || res?.data?.total || 0
  } catch (e: any) { ElMessage.error(e?.message || '加载失败') } finally { loading.value = false }
}

const resetFilters = () => {
  filters.keyword = ''
  filters.status = ''
  loadData()
}

const review = async (row: any, approved: boolean) => {
  try {
    if (!approved) {
      const { value: reason } = await ElMessageBox.prompt('请输入拒绝原因', '拒绝提现', { inputPlaceholder: '拒绝原因', type: 'warning' })
      await request.put(`/admin/withdrawals/${row.id}/review`, { approved: false, reason })
    } else {
      await ElMessageBox.confirm('确定通过该提现申请？', '确认', { type: 'warning' })
      await request.put(`/admin/withdrawals/${row.id}/review`, { approved: true })
    }
    ElMessage.success('操作成功')
    loadData()
  } catch (e: any) { if (e !== 'cancel') ElMessage.error('操作失败') }
}

const complete = async (row: any) => {
  try {
    const { value: transferNo } = await ElMessageBox.prompt('请输入打款流水号', '确认提现打款', { inputPlaceholder: '支付平台或银行流水号', inputValidator: (value) => value?.trim() ? true : '打款流水号不能为空' })
    await request.put(`/admin/withdrawals/${row.id}/complete`, { transferNo: transferNo.trim() })
    ElMessage.success('已确认打款')
    loadData()
  } catch (e: any) { if (e !== 'cancel') ElMessage.error(e?.message || '操作失败') }
}

const applyRouteQuery = () => {
  const keyword = route.query.businessId || route.query.keyword || route.query.focusId
  if (keyword) filters.keyword = String(keyword)
  if (route.query.status) filters.status = String(route.query.status)
}

onMounted(() => {
  applyRouteQuery()
  loadData()
})
</script>

<style scoped>
.page-shell { padding: 24px; }
.filter-bar { display: flex; gap: 12px; margin: 16px 0; flex-wrap: wrap; }
.pagination-bar { display: flex; justify-content: flex-end; margin-top: 16px; }
</style>
