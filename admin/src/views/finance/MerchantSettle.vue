<template>
  <div class="page-shell">
    <PageHeader title="商家结算" subtitle="管理商家结算记录" icon="Shop" />
    <div class="filter-bar">
      <el-select v-model="filters.status" placeholder="状态" clearable style="width: 120px" @change="loadData">
        <el-option label="待确认" value="pending" />
        <el-option label="已确认" value="confirmed" />
        <el-option label="已打款" value="paid" />
      </el-select>
      <el-button type="primary" @click="loadData">查询</el-button>
      <el-button @click="filters.status = ''; loadData()">重置</el-button>
    </div>
    <el-table :data="list" v-loading="loading" border stripe>
      <el-table-column prop="merchant.name" label="商家" width="150">
        <template #default="{ row }">{{ row.merchant?.name || row.merchantId }}</template>
      </el-table-column>
      <el-table-column prop="amount" label="结算金额" width="100">
        <template #default="{ row }">¥{{ Number(row.amount).toFixed(2) }}</template>
      </el-table-column>
      <el-table-column prop="fee" label="手续费" width="100">
        <template #default="{ row }">¥{{ Number(row.fee || 0).toFixed(2) }}</template>
      </el-table-column>
      <el-table-column prop="actualAmount" label="实际到账" width="100">
        <template #default="{ row }">¥{{ Number(row.actualAmount || row.amount).toFixed(2) }}</template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="80">
        <template #default="{ row }">
          <el-tag :type="row.status === 'confirmed' || row.status === 'paid' ? 'success' : 'warning'" size="small">
            {{ statusMap[row.status] || row.status }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" label="时间" width="170">
        <template #default="{ row }">{{ new Date(row.createdAt).toLocaleString('zh-CN') }}</template>
      </el-table-column>
      <el-table-column label="操作" width="120" fixed="right">
        <template #default="{ row }">
          <el-button v-if="row.status === 'pending'" size="small" type="success" @click="confirm(row)">确认</el-button>
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

const statusMap: Record<string, string> = { pending: '待确认', confirmed: '已确认', paid: '已打款' }
const loading = ref(false)
const list = ref<any[]>([])
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const filters = reactive({ status: '' })

const loadData = async () => {
  loading.value = true
  try {
    const res: any = await request.get('/admin/merchant-settlements', { params: { page: page.value, pageSize: pageSize.value, ...filters } })
    list.value = res?.list || res?.data?.list || []
    total.value = res?.total || res?.data?.total || 0
  } catch (e: any) { ElMessage.error(e?.message || '加载失败') } finally { loading.value = false }
}

const confirm = async (row: any) => {
  try {
    await ElMessageBox.confirm('确认该笔结算？', '确认', { type: 'warning' })
    await request.put(`/admin/merchant-settlements/${row.id}/confirm`, {})
    ElMessage.success('已确认')
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
