<template>
  <div class="page-shell">
    <PageHeader title="商家结算" subtitle="核算商家货款；退款差额仅可登记抵扣" icon="Wallet" />
    <div class="filter-bar">
      <el-input v-model="filters.keyword" placeholder="搜索商家名称" clearable style="width: 200px" @clear="loadData" @keyup.enter="loadData" />
      <el-select v-model="filters.status" placeholder="状态" clearable style="width: 120px" @change="loadData">
        <el-option label="待确认" value="pending" />
        <el-option label="处理中" value="processing" />
        <el-option label="已完成" value="completed" />
        <el-option label="失败" value="failed" />
      </el-select>
      <el-button type="primary" @click="loadData">查询</el-button>
      <el-button @click="resetFilters">重置</el-button>
    </div>
    <el-table :data="list" v-loading="loading" border stripe>
      <el-table-column prop="settlementNo" label="结算单号" width="180" show-overflow-tooltip />
      <el-table-column prop="merchant" label="商家" min-width="150">
        <template #default="{ row }">
          <div class="merchant-cell">
            <el-image v-if="row.merchantLogo || row.merchant?.logo" :src="row.merchantLogo || row.merchant?.logo" style="width: 32px; height: 32px; border-radius: 6px; margin-right: 8px;" />
            <span>{{ row.merchantName || row.merchant?.name || row.merchantId }}</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="类型" width="100">
        <template #default="{ row }"><el-tag size="small" :type="row.isAdjustment ? 'danger' : 'info'">{{ row.isAdjustment ? '退款调整' : '周期结算' }}</el-tag></template>
      </el-table-column>
      <el-table-column prop="amount" label="订单货款" width="120">
        <template #default="{ row }">¥{{ Number(row.amount || row.totalAmount || 0).toFixed(2) }}</template>
      </el-table-column>
      <el-table-column prop="platformFee" label="平台费用" width="100">
        <template #default="{ row }">¥{{ Number(row.platformFee || 0).toFixed(2) }}</template>
      </el-table-column>
      <el-table-column prop="netAmount" label="应付商家" width="110">
        <template #default="{ row }">¥{{ Number(row.netAmount ?? (Number(row.amount || 0) - Number(row.platformFee || 0))).toFixed(2) }}</template>
      </el-table-column>
      <el-table-column prop="orderCount" label="订单数" width="80" />
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="statusTypeMap[row.status] || 'info'" size="small">
            {{ statusText(row) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" label="时间" width="170">
        <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="120" fixed="right">
        <template #default="{ row }">
          <el-button v-if="row.status === 'pending'" size="small" type="success" @click="confirm(row)">确认核算</el-button>
          <el-button v-else-if="row.status === 'completed' && row.netAmount < 0" size="small" type="warning" @click="offset(row)">登记抵扣</el-button>
          <el-button v-else-if="row.status === 'completed'" size="small" type="primary" @click="pay(row)">登记打款</el-button>
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
import { getMerchantSettlements, confirmMerchantSettlement, payMerchantSettlement, offsetMerchantSettlement } from '@/api/merchant'
import { ElMessage, ElMessageBox } from 'element-plus'

const statusMap: Record<string, string> = {
  pending: '待确认',
  processing: '处理中',
  completed: '已核算待线下打款',
  paid: '已登记线下打款',
  failed: '失败',
  confirmed: '已确认'
}
const statusTypeMap: Record<string, string> = {
  pending: 'warning',
  processing: 'primary',
  completed: 'primary',
  paid: 'success',
  failed: 'danger',
  confirmed: 'success'
}
const statusText = (row: any) => row.isAdjustment && row.status === 'paid' ? '已登记抵扣' : row.isAdjustment && row.status === 'completed' ? '待登记抵扣' : statusMap[row.status] || row.status

const loading = ref(false)
const list = ref<any[]>([])
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const filters = reactive({ keyword: '', status: '' })

const formatDate = (d: any) => d ? new Date(d).toLocaleString('zh-CN') : '-'

const loadData = async () => {
  loading.value = true
  try {
    const res: any = await getMerchantSettlements({ page: page.value, pageSize: pageSize.value, ...filters })
    list.value = res?.list || res?.data?.list || []
    total.value = res?.total ?? res?.data?.total ?? 0
  } catch (e: any) {
    ElMessage.error(e?.message || '加载结算列表失败')
  } finally {
    loading.value = false
  }
}

const resetFilters = () => {
  Object.assign(filters, { keyword: '', status: '' })
  page.value = 1
  loadData()
}

const confirm = async (row: any) => {
  try {
    await ElMessageBox.confirm('确认该笔核算？确认后仍需登记实际打款流水。', '确认核算', { type: 'warning' })
    await confirmMerchantSettlement(row.id)
    ElMessage.success('已确认')
    loadData()
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(e?.message || '操作失败')
  }
}

const pay = async (row: any) => {
  try {
    const { value: transferNo } = await ElMessageBox.prompt('请输入线下打款流水号', '登记打款', { inputPattern: /\S+/, inputErrorMessage: '打款流水号不能为空' })
    await payMerchantSettlement(row.id, transferNo)
    ElMessage.success('已登记线下打款')
    loadData()
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(e?.message || '登记打款失败')
  }
}

const offset = async (row: any) => {
  try {
    const { value: reference } = await ElMessageBox.prompt('请输入抵扣凭证或后续结算单号', '登记退款差额抵扣', { inputPattern: /\S+/, inputErrorMessage: '抵扣凭证不能为空' })
    await offsetMerchantSettlement(row.id, reference)
    ElMessage.success('已登记抵扣')
    loadData()
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(e?.message || '登记抵扣失败')
  }
}

onMounted(() => loadData())
</script>

<style scoped>
.page-shell { padding: 24px; }
.filter-bar { display: flex; gap: 12px; margin: 16px 0; flex-wrap: wrap; }
.pagination-bar { display: flex; justify-content: flex-end; margin-top: 16px; }
.merchant-cell { display: flex; align-items: center; }
</style>
