<template>
  <div class="page-shell">
    <PageHeader title="财务总览" subtitle="查看平台财务数据概览" icon="DataLine" />
    <el-row :gutter="20" style="margin-top: 20px">
      <el-col :span="6" v-for="card in statCards" :key="card.label">
        <el-card shadow="hover">
          <div style="text-align: center;">
            <div style="font-size: 28px; font-weight: bold; color: #303133;">{{ card.value }}</div>
            <div style="font-size: 14px; color: #909399; margin-top: 8px;">{{ card.label }}</div>
          </div>
        </el-card>
      </el-col>
    </el-row>
    <el-row :gutter="20" style="margin-top: 20px">
      <el-col :span="12">
        <el-card>
          <template #header><span>近期支付宝转账</span></template>
          <el-table :data="recentTransfers" size="small" max-height="300">
            <el-table-column prop="transferNo" label="转账单号" width="180" show-overflow-tooltip />
            <el-table-column prop="payeeName" label="收款人" width="120" />
            <el-table-column prop="amount" label="金额" width="100">
              <template #default="{ row }">¥{{ Number(row.amount).toFixed(2) }}</template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="80">
              <template #default="{ row }">
                <el-tag :type="row.status === 'success' ? 'success' : row.status === 'failed' ? 'danger' : 'warning'" size="small">
                  {{ statusMap[row.status] || row.status }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card>
          <template #header><span>近期提现申请</span></template>
          <el-table :data="recentWithdrawals" size="small" max-height="300">
            <el-table-column prop="user.nickname" label="用户" width="100">
              <template #default="{ row }">{{ row.user?.nickname || '-' }}</template>
            </el-table-column>
            <el-table-column prop="amount" label="金额" width="100">
              <template #default="{ row }">¥{{ Number(row.amount).toFixed(2) }}</template>
            </el-table-column>
            <el-table-column prop="channel" label="渠道" width="80" />
            <el-table-column prop="status" label="状态" width="80">
              <template #default="{ row }">
                <el-tag :type="row.status === 'SUCCESS' ? 'success' : row.status === 'REJECTED' ? 'danger' : 'warning'" size="small">
                  {{ withdrawStatusMap[row.status] || row.status }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import PageHeader from '@/components/common/PageHeader.vue'
import { request } from '@/api/request'

const statusMap: Record<string, string> = { pending: '待处理', processing: '处理中', success: '成功', failed: '失败' }
const withdrawStatusMap: Record<string, string> = { PENDING: '待审核', PROCESSING: '处理中', SUCCESS: '成功', FAILED: '失败', REJECTED: '已拒绝' }

const statCards = ref([
  { label: '待审核提现', value: '0' },
  { label: '待确认结算', value: '0' },
  { label: '异常资金单', value: '0' },
  { label: '今日转账', value: '0' },
])
const recentTransfers = ref<any[]>([])
const recentWithdrawals = ref<any[]>([])

onMounted(async () => {
  try {
    const [transfersRes, withdrawalsRes, abnormalRes] = await Promise.allSettled([
      request.get('/admin/alipay/transfers', { params: { page: 1, pageSize: 5 } }),
      request.get('/admin/withdrawals', { params: { page: 1, pageSize: 5, status: 'PENDING' } }),
      request.get('/admin/abnormal-orders', { params: { page: 1, pageSize: 1 } }),
    ])
    if (transfersRes.status === 'fulfilled') {
      const d: any = transfersRes.value
      recentTransfers.value = d?.list || d?.data?.list || []
    }
    if (withdrawalsRes.status === 'fulfilled') {
      const d: any = withdrawalsRes.value
      recentWithdrawals.value = d?.list || d?.data?.list || []
      statCards.value[0].value = String(d?.total || d?.data?.total || 0)
    }
    if (abnormalRes.status === 'fulfilled') {
      const d: any = abnormalRes.value
      statCards.value[2].value = String(d?.total || d?.data?.total || 0)
    }
  } catch (e: any) { ElMessage.error(e?.message || '加载失败') }
})
</script>

<style scoped>
.page-shell { padding: 24px; }
</style>
