<template>
  <div class="page-shell">
    <PageHeader title="财务总览" subtitle="平台收款、提现、骑手待结算和异常资金统一看板" icon="DataLine" />

    <div class="toolbar">
      <el-date-picker
        v-model="dateRange"
        type="daterange"
        range-separator="至"
        start-placeholder="开始日期"
        end-placeholder="结束日期"
        style="width: 280px"
        @change="loadOverview"
      />
      <el-button type="primary" :loading="loading" @click="loadOverview">刷新</el-button>
    </div>

    <StatGrid v-loading="loading" :items="statItems" />

    <el-row :gutter="16" class="section-row">
      <el-col :span="14">
        <el-card shadow="never">
          <template #header>
            <div class="card-title">
              <span>骑手待结算收益</span>
              <el-tag type="warning" size="small">完成订单后进入这里</el-tag>
            </div>
          </template>
          <el-table :data="overview.latestRiderEarnings || []" size="small" max-height="340" empty-text="暂无未结算骑手收益">
            <el-table-column label="来源" width="92">
              <template #default="{ row }">
                <el-tag size="small" :type="row.source === 'errand' ? 'primary' : 'success'">
                  {{ row.source === 'errand' ? '跑腿' : '配送' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="orderNo" label="订单号" min-width="170" show-overflow-tooltip />
            <el-table-column prop="riderName" label="骑手" width="120" show-overflow-tooltip />
            <el-table-column prop="title" label="任务/商家" min-width="140" show-overflow-tooltip />
            <el-table-column label="收益" width="100" align="right">
              <template #default="{ row }">{{ money(row.amount) }}</template>
            </el-table-column>
            <el-table-column label="完成时间" width="170">
              <template #default="{ row }">{{ dateTime(row.completeTime) }}</template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>

      <el-col :span="10">
        <el-card shadow="never">
          <template #header><span>待处理资金事项</span></template>
          <div class="todo-list">
            <div class="todo-item">
              <span>待审核提现</span>
              <b>{{ overview.cards?.pendingWithdrawals?.count || 0 }} 笔</b>
            </div>
            <div class="todo-item">
              <span>待处理骑手结算</span>
              <b>{{ overview.cards?.pendingRiderSettlements?.count || 0 }} 张</b>
            </div>
            <div class="todo-item">
              <span>未生成结算的骑手订单</span>
              <b>{{ overview.cards?.unsettledRiderIncome?.count || 0 }} 单</b>
            </div>
            <div class="todo-item">
              <span>异常资金单</span>
              <b>{{ overview.cards?.abnormalOrders?.count || 0 }} 条</b>
            </div>
          </div>
        </el-card>

        <el-card shadow="never" class="mini-card">
          <template #header><span>最近骑手结算单</span></template>
          <el-table :data="overview.latestRiderSettlements || []" size="small" max-height="220" empty-text="暂无结算单">
            <el-table-column prop="settlementNo" label="结算单号" min-width="160" show-overflow-tooltip />
            <el-table-column label="金额" width="96" align="right">
              <template #default="{ row }">{{ money(row.payableAmount) }}</template>
            </el-table-column>
            <el-table-column label="状态" width="86">
              <template #default="{ row }">
                <el-tag size="small" :type="settlementTag(row.status)">{{ settlementStatus[row.status] || row.status }}</el-tag>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="16" class="section-row">
      <el-col :span="12">
        <el-card shadow="never">
          <template #header><span>近期支付订单</span></template>
          <el-table :data="overview.latestPayments || []" size="small" max-height="300" empty-text="暂无支付订单">
            <el-table-column prop="orderNo" label="业务订单号" min-width="170" show-overflow-tooltip />
            <el-table-column label="订单类型" width="120">
              <template #default="{ row }">
                <el-tooltip :content="bizTypeTip(row.bizType)" placement="top" :disabled="!bizTypeTip(row.bizType)">
                  <el-tag size="small" :type="bizTypeTag(row.bizType)">
                    {{ bizTypeLabel(row.bizType) }}
                  </el-tag>
                </el-tooltip>
              </template>
            </el-table-column>
            <el-table-column label="金额" width="100" align="right">
              <template #default="{ row }">{{ money(row.amount) }}</template>
            </el-table-column>
            <el-table-column label="支付时间" width="170">
              <template #default="{ row }">{{ dateTime(row.payTime || row.createdAt) }}</template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="never">
          <template #header><span>近期提现申请</span></template>
          <el-table :data="overview.latestWithdrawals || []" size="small" max-height="300" empty-text="暂无提现申请">
            <el-table-column prop="userName" label="用户" min-width="120" show-overflow-tooltip />
            <el-table-column label="金额" width="100" align="right">
              <template #default="{ row }">{{ money(row.amount) }}</template>
            </el-table-column>
            <el-table-column prop="channel" label="渠道" width="90" />
            <el-table-column label="状态" width="90">
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
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import PageHeader from '@/components/common/PageHeader.vue'
import StatGrid from '@/components/glass/StatGrid.vue'
import type { StatItem } from '@/types/admin'
import { request } from '@/api/request'

const loading = ref(false)
const dateRange = ref<any>(null)
const overview = ref<any>({ cards: {}, latestPayments: [], latestWithdrawals: [], latestRiderEarnings: [], latestRiderSettlements: [] })

const settlementStatus: Record<string, string> = { PENDING: '待确认', CONFIRMED: '待打款', PAID: '已打款', REJECTED: '已驳回' }
const withdrawStatusMap: Record<string, string> = { PENDING: '待审核', PROCESSING: '处理中', SUCCESS: '成功', FAILED: '失败', REJECTED: '已拒绝' }
const bizTypeMap: Record<string, { label: string; tag: 'success' | 'warning' | 'info' | 'primary' | 'danger'; tip?: string }> = {
  topup: { label: '笔记置顶', tag: 'warning', tip: '用户购买笔记付费置顶产生的收入' },
  errand_order: { label: '跑腿订单', tag: 'primary', tip: '用户发布跑腿任务后支付的订单' },
  delivery_order: { label: '配送订单', tag: 'primary', tip: '同城或商户配送服务订单' },
  mall_order: { label: '商城订单', tag: 'success', tip: '商城商品交易订单' },
  order: { label: '宿舍小店', tag: 'success', tip: '宿舍小店商品订单' },
  recharge: { label: '余额充值', tag: 'info', tip: '用户向钱包余额充值' },
  group_buy_order: { label: '拼团订单', tag: 'success', tip: '团购或拼团活动订单' },
  second_hand_order: { label: '二手订单', tag: 'info', tip: '二手交易订单' },
  dating_order: { label: '交友订单', tag: 'info', tip: '交友服务相关订单' },
}

const money = (value: any) => `¥${Number(value || 0).toFixed(2)}`
const dateTime = (value: any) => value ? new Date(value).toLocaleString('zh-CN') : '-'
const settlementTag = (status: string) => status === 'PAID' ? 'success' : status === 'CONFIRMED' ? 'primary' : status === 'REJECTED' ? 'danger' : 'warning'
const bizTypeMeta = (value: string) => bizTypeMap[value] || { label: value || '未知订单', tag: 'info' as const, tip: value ? `未配置中文名称：${value}` : '' }
const bizTypeLabel = (value: string) => bizTypeMeta(value).label
const bizTypeTag = (value: string) => bizTypeMeta(value).tag
const bizTypeTip = (value: string) => bizTypeMeta(value).tip || ''

const statItems = computed<StatItem[]>(() => [
  {
    key: 'todayIncome',
    label: '今日实收',
    value: money(overview.value.cards?.todayIncome?.amount || 0),
    sub: `${overview.value.cards?.todayIncome?.count || 0} 笔支付`,
    icon: 'Money',
    tone: 'green',
  },
  {
    key: 'unsettledRiderIncome',
    label: '骑手待结算',
    value: money(overview.value.cards?.unsettledRiderIncome?.amount || 0),
    sub: `${overview.value.cards?.unsettledRiderIncome?.riderCount || 0} 位骑手 / ${overview.value.cards?.unsettledRiderIncome?.count || 0} 单`,
    icon: 'Van',
    tone: 'orange',
  },
  {
    key: 'pendingWithdrawals',
    label: '待审核提现',
    value: money(overview.value.cards?.pendingWithdrawals?.amount || 0),
    sub: `${overview.value.cards?.pendingWithdrawals?.count || 0} 笔申请`,
    icon: 'Wallet',
    tone: 'cyan',
  },
  {
    key: 'pendingRiderSettlements',
    label: '待处理结算',
    value: money(overview.value.cards?.pendingRiderSettlements?.amount || 0),
    sub: `${overview.value.cards?.pendingRiderSettlements?.count || 0} 张结算单`,
    icon: 'Tickets',
    tone: 'blue',
  },
  {
    key: 'abnormalOrders',
    label: '异常资金单',
    value: overview.value.cards?.abnormalOrders?.count || 0,
    sub: '需要人工核查',
    icon: 'Warning',
    tone: 'red',
  },
  {
    key: 'periodIncome',
    label: '周期实收',
    value: money(overview.value.cards?.periodIncome?.amount || 0),
    sub: `${overview.value.cards?.periodIncome?.count || 0} 笔支付`,
    icon: 'TrendCharts',
    tone: 'purple',
  },
])

import { formatDateRangeParams } from '@/utils/date'

const loadOverview = async () => {
  loading.value = true
  try {
    const params: any = {}
    if (dateRange.value?.length === 2) {
      const { startDate, endDate } = formatDateRangeParams(dateRange.value)
      if (startDate) params.startDate = startDate
      if (endDate) params.endDate = endDate
    }
    overview.value = await request.get('/admin/finance/overview', { params })
  } catch (e: any) {
    ElMessage.error(e?.message || '加载财务总览失败')
  } finally {
    loading.value = false
  }
}

onMounted(() => loadOverview())
</script>

<style scoped>
.page-shell { padding: 24px; }
.toolbar { display: flex; gap: 12px; align-items: center; margin: 16px 0; }
.section-row { margin-top: 16px; }
.card-title { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.todo-list { display: grid; gap: 10px; }
.todo-item { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; background: #f8fbff; border: 1px solid #e6eef9; border-radius: 6px; color: #475467; }
.todo-item b { color: #101828; }
.mini-card { margin-top: 16px; }
</style>
