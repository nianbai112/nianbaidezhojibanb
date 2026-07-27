<template>
  <div class="page-shell">
    <PageHeader title="平台补贴" subtitle="查看会员、新用户、拉新和运营活动产生的补贴成本，确认补贴最终补给骑手、商家还是平台" icon="Wallet">
      <template #actions>
        <el-button type="primary" :loading="loading" @click="loadData">刷新</el-button>
      </template>
    </PageHeader>

    <div class="filter-bar">
      <el-date-picker
        v-model="dateRange"
        type="daterange"
        range-separator="至"
        start-placeholder="开始日期"
        end-placeholder="结束日期"
        style="width: 280px"
        @change="handleSearch"
      />
      <el-input v-model="query.keyword" placeholder="补贴单号/订单号/用户ID" clearable style="width: 240px" @keyup.enter="handleSearch" />
      <el-select v-model="query.sourceType" placeholder="补贴来源" clearable style="width: 150px" @change="handleSearch">
        <el-option v-for="item in sourceOptions" :key="item.value" :label="item.label" :value="item.value" />
      </el-select>
      <el-select v-model="query.receiverType" placeholder="补贴对象" clearable style="width: 140px" @change="handleSearch">
        <el-option v-for="item in receiverOptions" :key="item.value" :label="item.label" :value="item.value" />
      </el-select>
      <el-select v-model="query.status" placeholder="状态" clearable style="width: 130px" @change="handleSearch">
        <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
      </el-select>
      <el-button @click="handleSearch">查询</el-button>
    </div>

    <div class="summary-grid" v-loading="loading">
      <div class="summary-item">
        <span>补贴总额</span>
        <strong>{{ money(overview.amount) }}</strong>
        <em>{{ overview.count || 0 }} 笔</em>
      </div>
      <div class="summary-item">
        <span>补给骑手</span>
        <strong>{{ money(receiverAmount('rider')) }}</strong>
        <em>免配送费、跑腿折扣不影响骑手收入</em>
      </div>
      <div class="summary-item">
        <span>补给商家</span>
        <strong>{{ money(receiverAmount('merchant')) }}</strong>
        <em>会员价、商品优惠由平台补差</em>
      </div>
      <div class="summary-item">
        <span>已锁定结算</span>
        <strong>{{ money(statusAmount('locked')) }}</strong>
        <em>已绑定到结算单，等待完成打款闭环</em>
      </div>
    </div>

    <el-row :gutter="16" class="section-row">
      <el-col :span="12">
        <el-card shadow="never">
          <template #header><span>按来源看成本</span></template>
          <div class="stat-list">
            <div v-for="item in overview.bySource || []" :key="item.key" class="stat-row">
              <span>{{ sourceLabel(item.key) }}</span>
              <b>{{ money(item.amount) }}</b>
              <em>{{ item.count }} 笔</em>
            </div>
            <EmptyState v-if="!(overview.bySource || []).length" description="暂无补贴来源" :image-size="72" />
          </div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="never">
          <template #header><span>按对象看流向</span></template>
          <div class="stat-list">
            <div v-for="item in overview.byReceiver || []" :key="item.key" class="stat-row">
              <span>{{ receiverLabel(item.key) }}</span>
              <b>{{ money(item.amount) }}</b>
              <em>{{ item.count }} 笔</em>
            </div>
            <EmptyState v-if="!(overview.byReceiver || []).length" description="暂无补贴对象" :image-size="72" />
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-card shadow="never" class="ledger-card">
      <template #header>
        <div class="card-title">
          <span>补贴明细</span>
          <el-tag type="info" effect="plain">每一笔都绑定业务订单</el-tag>
        </div>
      </template>
      <el-table :data="list" v-loading="loading" border stripe empty-text="暂无补贴记录">
        <el-table-column prop="subsidyNo" label="补贴单号" min-width="180" show-overflow-tooltip />
        <el-table-column label="来源" width="120">
          <template #default="{ row }">{{ row.sourceText || sourceLabel(row.sourceType) }}</template>
        </el-table-column>
        <el-table-column prop="benefitKey" label="权益/活动键" min-width="180" show-overflow-tooltip />
        <el-table-column label="业务订单" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">{{ row.orderNo || row.orderId }}</template>
        </el-table-column>
        <el-table-column label="订单类型" width="120">
          <template #default="{ row }">{{ orderTypeLabel(row.orderType) }}</template>
        </el-table-column>
        <el-table-column label="补贴对象" width="110">
          <template #default="{ row }">{{ row.receiverText || receiverLabel(row.receiverType) }}</template>
        </el-table-column>
        <el-table-column label="金额" width="120" align="right">
          <template #default="{ row }"><b>{{ money(row.amount) }}</b></template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="statusType(row.status)" size="small">{{ row.statusText || statusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="settlementId" label="结算单" min-width="160" show-overflow-tooltip />
        <el-table-column prop="description" label="说明" min-width="220" show-overflow-tooltip />
        <el-table-column label="创建时间" width="180">
          <template #default="{ row }">{{ dateTime(row.createdAt) }}</template>
        </el-table-column>
      </el-table>
      <div class="pagination-bar">
        <el-pagination
          v-model:current-page="query.page"
          v-model:page-size="query.pageSize"
          :total="total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next"
          @size-change="loadList"
          @current-change="loadList"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import EmptyState from '@/components/common/EmptyState.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import { request } from '@/api/request'

const loading = ref(false)
const dateRange = ref<any>(null)
const overview = ref<any>({})
const list = ref<any[]>([])
const total = ref(0)
const query = reactive({
  page: 1,
  pageSize: 20,
  keyword: '',
  sourceType: '',
  receiverType: '',
  status: '',
})

const sourceOptions = [
  { label: '会员权益', value: 'membership' },
  { label: '优惠券', value: 'coupon' },
  { label: '新用户活动', value: 'new_user' },
  { label: '拉新活动', value: 'referral' },
  { label: '运营活动', value: 'campaign' },
  { label: '人工补贴', value: 'manual' },
]
const receiverOptions = [
  { label: '骑手', value: 'rider' },
  { label: '商家', value: 'merchant' },
  { label: '平台', value: 'platform' },
  { label: '用户', value: 'user' },
]
const statusOptions = [
  { label: '待结算', value: 'pending' },
  { label: '已锁定', value: 'locked' },
  { label: '已结算', value: 'settled' },
  { label: '已取消', value: 'cancelled' },
]

const money = (value: any) => `¥${Number(value || 0).toFixed(2)}`
const dateTime = (value: any) => value ? new Date(value).toLocaleString('zh-CN') : '-'
const labelOf = (list: Array<{ label: string; value: string }>, value: string) => list.find(item => item.value === value)?.label || value || '-'
const sourceLabel = (value: string) => labelOf(sourceOptions, value)
const receiverLabel = (value: string) => labelOf(receiverOptions, value)
const statusLabel = (value: string) => labelOf(statusOptions, value)
const statusType = (value: string) => ({ pending: 'warning', locked: 'primary', settled: 'success', cancelled: 'info' }[value] || 'info')
const orderTypeLabel = (value: string) => ({
  order: '外卖/小店',
  mall_order: '商城订单',
  errand_order: '跑腿订单',
  activity_order: '活动订单',
}[value] || value || '-')
const receiverAmount = (key: string) => (overview.value.byReceiver || []).find((item: any) => item.key === key)?.amount || 0
const statusAmount = (key: string) => (overview.value.byStatus || []).find((item: any) => item.key === key)?.amount || 0

const params = () => {
  const p: any = {
    ...query,
    keyword: query.keyword || undefined,
    sourceType: query.sourceType || undefined,
    receiverType: query.receiverType || undefined,
    status: query.status || undefined,
  }
  if (dateRange.value?.length === 2) {
    p.startDate = dateRange.value[0]
    p.endDate = dateRange.value[1]
  }
  return p
}

const loadOverview = async () => {
  overview.value = await request.get('/admin/finance/subsidies/overview', { params: params() })
}
const loadList = async () => {
  const res: any = await request.get('/admin/finance/subsidies', { params: params() })
  list.value = res.list || []
  total.value = res.total || 0
}
const loadData = async () => {
  loading.value = true
  try {
    await Promise.all([loadOverview(), loadList()])
  } finally {
    loading.value = false
  }
}
const handleSearch = async () => {
  query.page = 1
  await loadData()
}

onMounted(loadData)
</script>

<style scoped>
.page-shell {
  padding: 18px;
}
.filter-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin: 16px 0;
}
.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}
.summary-item {
  min-height: 98px;
  padding: 16px;
  border: 1px solid var(--mx-border);
  border-radius: 6px;
  background: var(--mx-card);
}
.summary-item span,
.summary-item em {
  display: block;
  color: var(--mx-sub);
  font-size: 13px;
  font-style: normal;
}
.summary-item strong {
  display: block;
  margin: 10px 0 6px;
  color: var(--mx-text);
  font-size: 26px;
  line-height: 1.1;
}
.section-row,
.ledger-card {
  margin-top: 16px;
}
.card-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.stat-list {
  display: grid;
  gap: 10px;
}
.stat-row {
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--mx-border);
}
.stat-row:last-child {
  border-bottom: 0;
}
.stat-row span {
  color: var(--el-text-color-regular);
}
.stat-row b {
  color: var(--mx-text);
}
.stat-row em {
  color: var(--mx-muted);
  font-style: normal;
}
.pagination-bar {
  display: flex;
  justify-content: flex-end;
  margin-top: 14px;
}
@media (max-width: 1200px) {
  .summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
