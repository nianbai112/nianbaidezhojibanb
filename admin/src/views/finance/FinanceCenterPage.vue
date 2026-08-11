<template>
  <div class="page-shell">
    <PageHeader title="财务中心" />

    <el-tabs v-model="activeTab" @tab-change="handleTabChange">
      <el-tab-pane label="支付订单" name="payments" />
      <el-tab-pane label="退款订单" name="refunds" />
      <el-tab-pane label="提现管理" name="withdrawals" />
      <el-tab-pane label="用户流水" name="wallet-logs" />
      <el-tab-pane label="对账中心" name="reconciliation" />
      <el-tab-pane label="异常订单" name="abnormal" />
    </el-tabs>

    <div class="filter-bar">
      <el-date-picker v-model="dateRange" type="daterange" range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期" style="width: 240px" @change="handleDateChange" />
      <el-button type="primary" @click="loadData">查询</el-button>
      <el-button @click="resetFilters">重置</el-button>
    </div>

    <!-- Payment Orders -->
    <template v-if="activeTab === 'payments'">
      <el-table :data="paymentOrders" v-loading="loading" border stripe>
        <el-table-column prop="orderNo" label="订单号" width="180" />
        <el-table-column prop="userName" label="用户" width="120" />
        <el-table-column prop="amount" label="金额" width="100">
          <template #default="{ row }">
            ¥{{ (row.amount / 100).toFixed(2) }}
          </template>
        </el-table-column>
        <el-table-column prop="channel" label="支付渠道" width="100" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'paid' ? 'success' : 'info'" size="small">
              {{ row.status === 'paid' ? '已支付' : row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="时间" width="160">
          <template #default="{ row }">
            {{ formatDate(row.createdAt) }}
          </template>
        </el-table-column>
      </el-table>
    </template>

    <!-- Refund Orders -->
    <template v-if="activeTab === 'refunds'">
      <el-table :data="refundOrders" v-loading="loading" border stripe>
        <el-table-column prop="refundNo" label="退款单号" width="180" />
        <el-table-column prop="userName" label="用户" width="120" />
        <el-table-column prop="merchantName" label="商户" width="120" />
        <el-table-column prop="amount" label="退款金额" width="100">
          <template #default="{ row }">
            ¥{{ Number(row.amount || 0).toFixed(2) }}
          </template>
        </el-table-column>
        <el-table-column prop="reason" label="原因" min-width="150" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'completed' ? 'success' : row.status === 'rejected' ? 'danger' : 'warning'" size="small">
              {{ row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="时间" width="160">
          <template #default="{ row }">
            {{ formatDate(row.createdAt) }}
          </template>
        </el-table-column>
      </el-table>
    </template>

    <!-- Withdrawals -->
    <template v-if="activeTab === 'withdrawals'">
      <el-table :data="withdrawals" v-loading="loading" border stripe>
        <el-table-column prop="userName" label="用户" width="120" />
        <el-table-column prop="amount" label="提现金额" width="100">
          <template #default="{ row }">
            ¥{{ (row.amount / 100).toFixed(2) }}
          </template>
        </el-table-column>
        <el-table-column prop="fee" label="手续费" width="80">
          <template #default="{ row }">
            ¥{{ (row.fee / 100).toFixed(2) }}
          </template>
        </el-table-column>
        <el-table-column prop="actualAmount" label="实际到账" width="100">
          <template #default="{ row }">
            ¥{{ (row.actualAmount / 100).toFixed(2) }}
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)" size="small">
              {{ getStatusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="时间" width="160">
          <template #default="{ row }">
            {{ formatDate(row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button v-if="row.status === 'PENDING'" size="small" type="success" @click="reviewWithdrawal(row, true)">通过</el-button>
            <el-button v-if="row.status === 'PENDING'" size="small" type="danger" @click="reviewWithdrawal(row, false)">拒绝</el-button>
          </template>
        </el-table-column>
      </el-table>
    </template>

    <!-- Wallet Logs -->
    <template v-if="activeTab === 'wallet-logs'">
      <el-table :data="walletLogs" v-loading="loading" border stripe>
        <el-table-column prop="userName" label="用户" width="120" />
        <el-table-column prop="type" label="类型" width="100" />
        <el-table-column prop="amount" label="金额" width="100">
          <template #default="{ row }">
            <span :style="{ color: row.amount > 0 ? '#67c23a' : '#f56c6c' }">
              {{ row.amount > 0 ? '+' : '' }}{{ (row.amount / 100).toFixed(2) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="balance" label="余额" width="100">
          <template #default="{ row }">
            ¥{{ (row.balance / 100).toFixed(2) }}
          </template>
        </el-table-column>
        <el-table-column prop="description" label="描述" min-width="150" />
        <el-table-column prop="createdAt" label="时间" width="160">
          <template #default="{ row }">
            {{ formatDate(row.createdAt) }}
          </template>
        </el-table-column>
      </el-table>
    </template>

    <!-- Reconciliation -->
    <template v-if="activeTab === 'reconciliation'">
      <div v-loading="loading" class="reconciliation-cards">
        <el-card>
          <template #header>收入</template>
          <div class="stat-value">¥{{ (reconciliation.income?.total / 100).toFixed(2) }}</div>
          <div class="stat-count">{{ reconciliation.income?.count }} 笔</div>
        </el-card>
        <el-card>
          <template #header>退款</template>
          <div class="stat-value">¥{{ (reconciliation.refund?.total / 100).toFixed(2) }}</div>
          <div class="stat-count">{{ reconciliation.refund?.count }} 笔</div>
        </el-card>
        <el-card>
          <template #header>提现</template>
          <div class="stat-value">¥{{ (reconciliation.withdraw?.total / 100).toFixed(2) }}</div>
          <div class="stat-count">{{ reconciliation.withdraw?.count }} 笔</div>
        </el-card>
        <el-card>
          <template #header>净收入</template>
          <div class="stat-value" :style="{ color: reconciliation.netIncome > 0 ? '#67c23a' : '#f56c6c' }">
            ¥{{ (reconciliation.netIncome / 100).toFixed(2) }}
          </div>
        </el-card>
      </div>
    </template>

    <!-- Abnormal Orders -->
    <template v-if="activeTab === 'abnormal'">
      <el-table :data="abnormalOrders" v-loading="loading" border stripe>
        <el-table-column prop="orderNo" label="订单号" width="180" />
        <el-table-column prop="type" label="异常类型" width="120">
          <template #default="{ row }">
            <el-tag type="warning" size="small">{{ row.type }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="description" label="描述" min-width="200" />
        <el-table-column prop="amount" label="金额" width="100">
          <template #default="{ row }">
            ¥{{ (row.amount / 100).toFixed(2) }}
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="时间" width="160">
          <template #default="{ row }">
            {{ formatDate(row.createdAt) }}
          </template>
        </el-table-column>
      </el-table>
    </template>

    <div class="pagination-bar">
      <el-pagination
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.pageSize"
        :total="pagination.total"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next, jumper"
        @size-change="loadData"
        @current-change="loadData"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { request } from '@/api/request'
import PageHeader from '@/components/common/PageHeader.vue'

const activeTab = ref('payments')
const loading = ref(false)
const dateRange = ref<any>(null)

const paymentOrders = ref<any[]>([])
const refundOrders = ref<any[]>([])
const withdrawals = ref<any[]>([])
const walletLogs = ref<any[]>([])
const reconciliation = ref<any>({})
const abnormalOrders = ref<any[]>([])

const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0,
})

const filters = reactive({
  startDate: '',
  endDate: '',
})

const formatDate = (date: string) => {
  if (!date) return '-'
  return new Date(date).toLocaleString('zh-CN')
}

const getStatusType = (status: string) => {
  const map: Record<string, string> = {
    PENDING: 'warning',
    PROCESSING: 'primary',
    SUCCESS: 'success',
    FAILED: 'danger',
    REJECTED: 'danger',
  }
  return map[status] || 'info'
}

const getStatusLabel = (status: string) => {
  const map: Record<string, string> = {
    PENDING: '待审核',
    PROCESSING: '处理中',
    SUCCESS: '已成功',
    FAILED: '失败',
    REJECTED: '已拒绝',
  }
  return map[status] || status
}

const handleDateChange = (val: any) => {
  if (val) {
    filters.startDate = val[0]?.toISOString?.() || ''
    filters.endDate = val[1]?.toISOString?.() || ''
  } else {
    filters.startDate = ''
    filters.endDate = ''
  }
  loadData()
}

const handleTabChange = () => {
  pagination.page = 1
  loadData()
}

const loadData = async () => {
  loading.value = true
  try {
    const params = {
      page: pagination.page,
      pageSize: pagination.pageSize,
      ...filters,
    }

    switch (activeTab.value) {
      case 'payments': {
        const res = await request.get('/admin/finance/payment-orders', { params })
        paymentOrders.value = res.data?.list || []
        pagination.total = res.data?.total || 0
        break
      }
      case 'refunds': {
        const res = await request.get('/admin/finance/refund-orders', { params })
        refundOrders.value = res.data?.list || []
        pagination.total = res.data?.total || 0
        break
      }
      case 'withdrawals': {
        const res = await request.get('/admin/finance/withdrawals', { params })
        withdrawals.value = res.data?.list || []
        pagination.total = res.data?.total || 0
        break
      }
      case 'wallet-logs': {
        const res = await request.get('/admin/finance/user-wallet-logs', { params })
        walletLogs.value = res.data?.list || []
        pagination.total = res.data?.total || 0
        break
      }
      case 'reconciliation': {
        const res = await request.get('/admin/finance/reconciliation', { params: filters })
        reconciliation.value = res.data || {}
        break
      }
      case 'abnormal': {
        const res = await request.get('/admin/finance/abnormal-orders', { params })
        abnormalOrders.value = res.data?.list || []
        pagination.total = res.data?.total || 0
        break
      }
    }
  } catch (error) {
    ElMessage.error('加载数据失败')
  } finally {
    loading.value = false
  }
}

const resetFilters = () => {
  filters.startDate = ''
  filters.endDate = ''
  dateRange.value = null
  loadData()
}

const reviewWithdrawal = async (withdrawal: any, approved: boolean) => {
  try {
    const action = approved ? '通过' : '拒绝'
    await ElMessageBox.confirm(`确定${action}该提现申请吗？`, '确认操作', { type: 'warning' })
    await request.put(`/admin/finance/withdrawals/${withdrawal.id}/review`, {
      approved,
      reason: approved ? '' : '管理员拒绝',
    })
    ElMessage.success(`已${action}`)
    loadData()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('操作失败')
    }
  }
}

onMounted(() => {
  loadData()
})
</script>

<style scoped>
.filter-bar {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}
.pagination-bar {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}
.reconciliation-cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
  margin-bottom: 20px;
}
.stat-value {
  font-size: 24px;
  font-weight: bold;
  margin-bottom: 8px;
}
.stat-count {
  color: #909399;
  font-size: 14px;
}
</style>
