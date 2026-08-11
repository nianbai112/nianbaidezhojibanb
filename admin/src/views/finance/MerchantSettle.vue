<template>
  <div class="page-shell">
    <PageHeader title="商家结算" subtitle="管理商家结算记录" icon="Shop" />
    <div class="filter-bar">
      <el-select v-model="filters.status" placeholder="状态" clearable style="width: 120px" @change="loadData">
        <el-option label="待确认" value="pending" />
        <el-option label="处理中" value="processing" />
        <el-option label="已核算待线下打款" value="completed" />
        <el-option label="已登记线下打款" value="paid" />
        <el-option label="失败" value="failed" />
      </el-select>
      <el-select v-model="filters.merchantId" placeholder="商家" clearable filterable style="width: 200px" @change="loadData">
        <el-option v-for="merchant in merchants" :key="merchant.id" :label="merchant.name" :value="merchant.id" />
      </el-select>
      <el-button type="primary" @click="loadData">查询</el-button>
      <el-button @click="resetFilters">重置</el-button>
      <el-button type="success" @click="generateVisible = true">生成结算单</el-button>
    </div>
    <el-table :data="list" v-loading="loading" border stripe>
      <el-table-column prop="merchant.name" label="商家" width="150">
        <template #default="{ row }">{{ row.merchant?.name || row.merchantId }}</template>
      </el-table-column>
      <el-table-column label="类型" width="100">
        <template #default="{ row }"><el-tag size="small" :type="row.isAdjustment ? 'danger' : 'info'">{{ row.isAdjustment ? '退款调整' : '周期结算' }}</el-tag></template>
      </el-table-column>
      <el-table-column prop="amount" label="订单货款" width="100">
        <template #default="{ row }">¥{{ Number(row.amount).toFixed(2) }}</template>
      </el-table-column>
      <el-table-column prop="platformFee" label="平台费用" width="100">
        <template #default="{ row }">¥{{ Number(row.platformFee || 0).toFixed(2) }}</template>
      </el-table-column>
      <el-table-column prop="netAmount" label="应付商家" width="110">
        <template #default="{ row }">¥{{ Number(row.netAmount ?? (Number(row.amount || 0) - Number(row.platformFee || 0))).toFixed(2) }}</template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="80">
        <template #default="{ row }">
          <el-tag :type="row.status === 'paid' ? 'success' : row.status === 'completed' ? 'primary' : row.status === 'failed' ? 'danger' : 'warning'" size="small">
            {{ statusText(row) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" label="时间" width="170">
        <template #default="{ row }">{{ new Date(row.createdAt).toLocaleString('zh-CN') }}</template>
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
    <el-dialog v-model="generateVisible" title="生成商家结算单" width="480px" destroy-on-close>
      <el-form label-width="90px">
        <el-form-item label="商家" required>
          <el-select v-model="generateForm.merchantId" filterable placeholder="选择商家" style="width: 100%">
            <el-option v-for="merchant in merchants" :key="merchant.id" :label="merchant.name" :value="merchant.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="结算周期" required>
          <el-date-picker v-model="generateForm.dates" type="daterange" value-format="YYYY-MM-DD" start-placeholder="开始日期" end-placeholder="结束日期" style="width: 100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="generateVisible = false">取消</el-button>
        <el-button type="primary" :loading="generating" @click="generateSettlement">生成</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import PageHeader from '@/components/common/PageHeader.vue'
import { request } from '@/api/request'
import { getMerchants } from '@/api/merchant'
import { ElMessage, ElMessageBox } from 'element-plus'

const statusMap: Record<string, string> = { pending: '待确认', processing: '处理中', completed: '已核算待线下打款', paid: '已登记线下打款', failed: '失败' }
const statusText = (row: any) => row.isAdjustment && row.status === 'paid' ? '已登记抵扣' : row.isAdjustment && row.status === 'completed' ? '待登记抵扣' : statusMap[row.status] || row.status
const route = useRoute()
const loading = ref(false)
const list = ref<any[]>([])
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const filters = reactive({ status: '', merchantId: '' })
const merchants = ref<any[]>([])
const generateVisible = ref(false)
const generating = ref(false)
const generateForm = reactive<{ merchantId: string; dates: string[] }>({ merchantId: '', dates: [] })

const loadData = async () => {
  loading.value = true
  try {
    const res: any = await request.get('/admin/merchant-settlements', { params: { page: page.value, pageSize: pageSize.value, ...filters } })
    list.value = res?.list || res?.data?.list || []
    total.value = res?.total || res?.data?.total || 0
  } catch (e: any) { ElMessage.error(e?.message || '加载失败') } finally { loading.value = false }
}

const resetFilters = () => {
  Object.assign(filters, { status: '', merchantId: '' })
  page.value = 1
  loadData()
}

const confirm = async (row: any) => {
  try {
    await ElMessageBox.confirm('确认该笔核算？确认后仍需登记实际打款流水。', '确认核算', { type: 'warning' })
    await request.put(`/admin/merchant-settlements/${row.id}/confirm`, {})
    ElMessage.success('已确认')
    loadData()
  } catch (e: any) { if (e !== 'cancel') ElMessage.error('操作失败') }
}

const pay = async (row: any) => {
  try {
    const { value: transferNo } = await ElMessageBox.prompt('请输入线下打款流水号', '登记打款', { inputPattern: /\S+/, inputErrorMessage: '打款流水号不能为空' })
    await request.put(`/admin/merchant-settlements/${row.id}/pay`, { transferNo })
    ElMessage.success('已登记线下打款')
    loadData()
  } catch (e: any) { if (e !== 'cancel') ElMessage.error(e?.message || '登记打款失败') }
}

const offset = async (row: any) => {
  try {
    const { value: reference } = await ElMessageBox.prompt('请输入抵扣凭证或后续结算单号', '登记退款差额抵扣', { inputPattern: /\S+/, inputErrorMessage: '抵扣凭证不能为空' })
    await request.put(`/admin/merchant-settlements/${row.id}/offset`, { reference })
    ElMessage.success('已登记抵扣')
    loadData()
  } catch (e: any) { if (e !== 'cancel') ElMessage.error(e?.message || '登记抵扣失败') }
}

const loadMerchants = async () => {
  try {
    const res: any = await getMerchants({ page: 1, pageSize: 500 })
    merchants.value = res?.list || res?.data?.list || []
  } catch (e: any) { ElMessage.error(e?.message || '加载商家列表失败') }
}

const applyMerchantContext = () => {
  filters.merchantId = typeof route.query.merchantId === 'string' ? route.query.merchantId : ''
}

const generateSettlement = async () => {
  if (!generateForm.merchantId || generateForm.dates.length !== 2) {
    ElMessage.warning('请选择商家和完整结算周期')
    return
  }
  try {
    await ElMessageBox.confirm('只会纳入周期内已完成订单，生成后需另行确认并登记线下打款。', '确认生成结算单', { type: 'warning' })
    generating.value = true
    const [startDate, endDate] = generateForm.dates
    const res: any = await request.post('/admin/settlements/generate', {
      merchantId: generateForm.merchantId,
      startAt: `${startDate}T00:00:00.000`,
      endAt: `${endDate}T23:59:59.999`,
    })
    ElMessage.success(res?.message || '结算单已生成，等待确认核算')
    generateVisible.value = false
    Object.assign(generateForm, { merchantId: '', dates: [] })
    await loadData()
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(e?.message || '生成结算单失败')
  } finally { generating.value = false }
}

watch(() => route.query.merchantId, () => {
  applyMerchantContext()
  page.value = 1
  loadData()
})

onMounted(() => { applyMerchantContext(); Promise.all([loadData(), loadMerchants()]) })
</script>

<style scoped>
.page-shell { padding: 24px; }
.filter-bar { display: flex; gap: 12px; margin: 16px 0; flex-wrap: wrap; }
.pagination-bar { display: flex; justify-content: flex-end; margin-top: 16px; }
</style>
