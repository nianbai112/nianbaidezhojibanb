<template>
  <div class="page-shell">
    <PageHeader title="财务总览" subtitle="平台收款、抽成、提现、流水、对账统一看板" icon="DataLine">
      <template #actions>
        <el-date-picker
          v-model="dateRange"
          type="daterange"
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          value-format="YYYY-MM-DD"
          style="width: 260px"
          @change="handleDateChange"
        />
        <el-button :loading="loading" @click="loadAll">刷新</el-button>
      </template>
    </PageHeader>

    <!-- 汇总卡片 -->
    <StatGrid v-loading="overviewLoading" :items="statItems" />

    <!-- 待处理事项 -->
    <div class="todo-row">
      <div v-for="item in todoItems" :key="item.label" class="todo-card" :class="item.tone">
        <span class="todo-label">{{ item.label }}</span>
        <strong class="todo-val">{{ item.value }}</strong>
        <span class="todo-sub">{{ item.sub }}</span>
      </div>
    </div>

    <!-- 主 Tab 看板 -->
    <el-card shadow="never" class="tab-card">
      <el-tabs v-model="activeTab" @tab-change="onTabChange">

        <!-- ① 抽成总览 -->
        <el-tab-pane label="平台抽成" name="commission">
          <div class="tab-toolbar">
            <span class="tab-section-title">各业务板块抽成比例与期间实收</span>
          </div>

          <!-- 费率配置卡片 -->
          <div class="fee-grid">
            <div
              v-for="cfg in feeConfigs"
              :key="cfg.bizType"
              class="fee-item"
              :class="{ disabled: !cfg.enabled }"
            >
              <div class="fee-item-head">
                <span class="fee-label">{{ cfg.label }}</span>
                <el-tag :type="cfg.enabled ? 'success' : 'info'" size="small" effect="light">
                  {{ cfg.enabled ? '已开启' : '已关闭' }}
                </el-tag>
              </div>
              <div class="fee-item-remark">{{ cfg.remark }}</div>

              <template v-if="cfg.bizType === 'order'">
                <div class="fee-region-hint">
                  <el-icon><InfoFilled /></el-icon>
                  外卖按区域单独配置，见下方「外卖区域费率」
                </div>
              </template>
              <template v-else-if="editingBiz === cfg.bizType">
                <div class="fee-edit-row">
                  <div class="fee-edit-field">
                    <span class="fee-edit-label">比例费率（%）</span>
                    <el-input-number v-model="editingBizRate" :min="0" :max="100" :precision="2" :step="0.5" size="small" style="width:110px" />
                  </div>
                  <div class="fee-edit-field">
                    <span class="fee-edit-label">每单固定（元）</span>
                    <el-input-number v-model="editingBizFixed" :min="0" :precision="2" :step="0.1" size="small" style="width:110px" />
                  </div>
                  <div class="fee-edit-field">
                    <span class="fee-edit-label">开启</span>
                    <el-switch v-model="editingBizEnabled" />
                  </div>
                </div>
                <div class="fee-preview">
                  预览：¥100 → 平台抽 <strong>¥{{ previewFee(editingBizRate, editingBizFixed) }}</strong>，到手 <strong>¥{{ (100 - Number(previewFee(editingBizRate, editingBizFixed))).toFixed(2) }}</strong>
                </div>
                <div class="fee-edit-actions">
                  <el-button type="primary" size="small" :loading="savingBiz === cfg.bizType" @click="saveBiz(cfg)">保存</el-button>
                  <el-button size="small" @click="editingBiz = null">取消</el-button>
                </div>
              </template>
              <template v-else>
                <div class="fee-current-row">
                  <span class="fee-rate-big">{{ cfg.rate > 0 ? (cfg.rate * 100).toFixed(2) + '%' : '0%' }}<span v-if="cfg.fixedFee > 0" class="fee-fixed">+¥{{ cfg.fixedFee }}/单</span></span>
                  <el-button size="small" link type="primary" @click="startBizEdit(cfg)">修改</el-button>
                </div>
              </template>
            </div>
          </div>

          <!-- 抽成计算器 -->
          <div class="calc-section">
            <div class="calc-title">抽成计算器</div>
            <div class="calc-row">
              <div class="calc-field">
                <span class="calc-label">金额（元）</span>
                <el-input-number v-model="calcAmount" :min="0" :max="99999" :precision="2" :step="10" style="width:140px" @change="recalc" />
              </div>
              <div class="calc-field">
                <span class="calc-label">业务板块</span>
                <el-select v-model="calcBizType" style="width:150px" @change="recalc">
                  <el-option v-for="b in feeConfigs" :key="b.bizType" :label="b.label" :value="b.bizType" />
                  <el-option label="自定义费率" value="__custom__" />
                </el-select>
              </div>
              <div v-if="calcBizType === '__custom__'" class="calc-field">
                <span class="calc-label">自定义费率（%）</span>
                <el-input-number v-model="calcCustomRate" :min="0" :max="100" :precision="2" :step="1" style="width:120px" @change="recalc" />
              </div>
            </div>
            <div class="calc-result-row">
              <div class="calc-block">
                <span class="calc-block-label">交易金额</span>
                <span class="calc-block-val">{{ money(calcAmount) }}</span>
              </div>
              <span class="calc-op">×</span>
              <div class="calc-block">
                <span class="calc-block-label">费率</span>
                <span class="calc-block-val">{{ calcResult.rateDisplay }}</span>
              </div>
              <span class="calc-op">=</span>
              <div class="calc-block accent">
                <span class="calc-block-label">平台抽成</span>
                <span class="calc-block-val">{{ money(calcResult.platformFee) }}</span>
              </div>
              <span class="calc-sep">｜</span>
              <div class="calc-block">
                <span class="calc-block-label">对方到手</span>
                <span class="calc-block-val payout">{{ money(calcResult.payout) }}</span>
              </div>
            </div>
            <div v-if="calcResult.remark" class="calc-remark"><el-icon><InfoFilled /></el-icon> {{ calcResult.remark }}</div>
          </div>

          <!-- 期间板块实收 -->
          <div class="sub-section-title" style="margin-top:24px">期间各板块实收</div>
          <el-table :data="bizBreakdown" stripe size="small" :default-sort="{ prop: 'totalPlatformFee', order: 'descending' }">
            <el-table-column label="板块" min-width="110">
              <template #default="{ row }">{{ row.label }}</template>
            </el-table-column>
            <el-table-column label="配置费率" width="110" align="center">
              <template #default="{ row }">
                <span v-if="row.bizType === 'order'" class="text-muted">按区域</span>
                <span v-else>{{ row.rate > 0 ? (row.rate * 100).toFixed(2) + '%' : '—' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="交易额" width="120" align="right" prop="totalAmount">
              <template #default="{ row }">{{ money(row.totalAmount) }}</template>
            </el-table-column>
            <el-table-column label="平台实收" width="120" align="right" prop="totalPlatformFee">
              <template #default="{ row }">
                <span :class="row.totalPlatformFee > 0 ? 'text-green' : 'text-muted'">{{ money(row.totalPlatformFee) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="实际费率" width="95" align="center">
              <template #default="{ row }">
                <el-tag v-if="row.totalAmount > 0" :type="bizRateTag(row)" size="small">{{ bizEffRate(row) }}%</el-tag>
                <span v-else class="text-muted">—</span>
              </template>
            </el-table-column>
            <el-table-column label="笔数" width="70" align="right" prop="orderCount">
              <template #default="{ row }">{{ row.orderCount || 0 }}</template>
            </el-table-column>
          </el-table>

          <!-- 外卖区域费率 -->
          <div class="sub-section-title" style="margin-top:24px">外卖区域费率配置</div>
          <el-table :data="regionRates" stripe size="small" :default-sort="{ prop: 'totalPlatformFee', order: 'descending' }">
            <el-table-column prop="regionName" label="区域" min-width="110" />
            <el-table-column label="费率" width="280">
              <template #default="{ row }">
                <div class="rate-cell">
                  <span class="rate-val">{{ (row.commissionRate * 100).toFixed(2) }}%</span>
                  <template v-if="editingRegion === row.regionId">
                    <el-input-number v-model="editingRegionRate" :min="0" :max="100" :precision="2" :step="0.5" size="small" style="width:90px" />
                    <el-button size="small" type="primary" :loading="savingRegion === row.regionId" @click="saveRegion(row)">保存</el-button>
                    <el-button size="small" @click="editingRegion = null">取消</el-button>
                  </template>
                  <el-button v-else size="small" link type="primary" @click="startRegionEdit(row)">修改</el-button>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="期间货款" width="120" align="right" prop="totalAmount">
              <template #default="{ row }">{{ money(row.totalAmount) }}</template>
            </el-table-column>
            <el-table-column label="期间实收" width="120" align="right" prop="totalPlatformFee">
              <template #default="{ row }">
                <span :class="row.totalPlatformFee > 0 ? 'text-green' : 'text-muted'">{{ money(row.totalPlatformFee) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="实际费率" width="95" align="center">
              <template #default="{ row }">
                <el-tag v-if="row.totalAmount > 0" :type="regionRateTag(row)" size="small">{{ regionEffRate(row) }}%</el-tag>
                <span v-else class="text-muted">—</span>
              </template>
            </el-table-column>
            <el-table-column label="笔数" width="80" align="right" prop="orderCount">
              <template #default="{ row }">{{ row.orderCount || 0 }}</template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <!-- ② 支付订单 -->
        <el-tab-pane label="支付订单" name="payments">
          <div class="tab-toolbar">
            <el-input v-model="payFilters.keyword" placeholder="搜索订单号" clearable style="width:200px" @keyup.enter="loadPayments" />
            <el-select v-model="payFilters.status" placeholder="状态" clearable style="width:110px" @change="loadPayments">
              <el-option label="成功" value="paid" />
              <el-option label="待支付" value="pending" />
              <el-option label="退款中" value="refunding" />
            </el-select>
            <el-button @click="loadPayments">查询</el-button>
            <el-button @click="() => { Object.assign(payFilters, { keyword: '', status: '' }); loadPayments() }">重置</el-button>
          </div>
          <el-table :data="payments" v-loading="payLoading" stripe size="small">
            <el-table-column prop="orderNo" label="订单号" min-width="180" show-overflow-tooltip />
            <el-table-column label="类型" width="110">
              <template #default="{ row }">
                <el-tag size="small" :type="bizTypeTag(row.bizType)">{{ bizTypeLabel(row.bizType) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="金额" width="100" align="right">
              <template #default="{ row }">{{ money(row.amount) }}</template>
            </el-table-column>
            <el-table-column label="状态" width="80" align="center">
              <template #default="{ row }">
                <el-tag :type="row.status === 'paid' ? 'success' : row.status === 'failed' ? 'danger' : 'warning'" size="small">
                  {{ payStatusMap[row.status] || row.status }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="时间" width="160">
              <template #default="{ row }">{{ dt(row.payTime || row.createdAt) }}</template>
            </el-table-column>
          </el-table>
          <div class="pg-row">
            <el-pagination v-model:current-page="payPage" v-model:page-size="payPageSize" :total="payTotal" :page-sizes="[20,50]" layout="total, sizes, prev, pager, next" @size-change="loadPayments" @current-change="loadPayments" />
          </div>
        </el-tab-pane>

        <!-- ③ 退款记录 -->
        <el-tab-pane label="退款记录" name="refunds">
          <div class="tab-toolbar">
            <el-input v-model="refundFilters.keyword" placeholder="退款单号/订单号" clearable style="width:220px" @keyup.enter="loadRefunds" />
            <el-select v-model="refundFilters.status" placeholder="状态" clearable style="width:110px" @change="loadRefunds">
              <el-option label="成功" value="SUCCESS" />
              <el-option label="处理中" value="PROCESSING" />
              <el-option label="失败" value="FAILED" />
            </el-select>
            <el-button @click="loadRefunds">查询</el-button>
          </div>
          <el-table :data="refunds" v-loading="refundLoading" stripe size="small">
            <el-table-column prop="refundNo" label="退款单号" min-width="170" show-overflow-tooltip />
            <el-table-column prop="orderNo" label="原订单号" min-width="170" show-overflow-tooltip />
            <el-table-column label="来源" width="110">
              <template #default="{ row }">{{ bizTypeLabel(row.bizType) }}</template>
            </el-table-column>
            <el-table-column label="金额" width="100" align="right">
              <template #default="{ row }">{{ money(row.amount) }}</template>
            </el-table-column>
            <el-table-column prop="reason" label="原因" min-width="130" show-overflow-tooltip />
            <el-table-column label="状态" width="80" align="center">
              <template #default="{ row }">
                <el-tag :type="row.status === 'SUCCESS' ? 'success' : row.status === 'FAILED' ? 'danger' : 'warning'" size="small">
                  {{ refundStatusMap[row.status] || row.status }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="时间" width="160">
              <template #default="{ row }">{{ dt(row.createdAt) }}</template>
            </el-table-column>
          </el-table>
          <div class="pg-row">
            <el-pagination v-model:current-page="refundPage" v-model:page-size="refundPageSize" :total="refundTotal" :page-sizes="[20,50]" layout="total, sizes, prev, pager, next" @size-change="loadRefunds" @current-change="loadRefunds" />
          </div>
        </el-tab-pane>

        <!-- ④ 用户流水 -->
        <el-tab-pane label="用户流水" name="wallet">
          <div class="tab-toolbar">
            <el-input v-model="walletFilters.keyword" placeholder="搜索用户ID" clearable style="width:200px" @keyup.enter="loadWallet" />
            <el-select v-model="walletFilters.type" placeholder="类型" clearable style="width:110px" @change="loadWallet">
              <el-option label="充值" value="RECHARGE" />
              <el-option label="提现" value="WITHDRAW" />
              <el-option label="支付" value="PAY" />
              <el-option label="退款" value="REFUND" />
              <el-option label="佣金" value="COMMISSION" />
            </el-select>
            <el-button @click="loadWallet">查询</el-button>
          </div>
          <el-table :data="walletLogs" v-loading="walletLoading" stripe size="small">
            <el-table-column prop="userId" label="用户ID" width="130" show-overflow-tooltip />
            <el-table-column prop="type" label="类型" width="80" />
            <el-table-column label="金额" width="100" align="right">
              <template #default="{ row }">{{ money(row.amount) }}</template>
            </el-table-column>
            <el-table-column label="余额" width="100" align="right">
              <template #default="{ row }">{{ money(row.balance) }}</template>
            </el-table-column>
            <el-table-column prop="orderNo" label="关联订单" min-width="170" show-overflow-tooltip />
            <el-table-column prop="description" label="描述" min-width="140" show-overflow-tooltip />
            <el-table-column label="状态" width="80" align="center">
              <template #default="{ row }">
                <el-tag :type="row.status === 'SUCCESS' ? 'success' : 'warning'" size="small">
                  {{ row.status === 'SUCCESS' ? '成功' : row.status }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="时间" width="160">
              <template #default="{ row }">{{ dt(row.createdAt) }}</template>
            </el-table-column>
          </el-table>
          <div class="pg-row">
            <el-pagination v-model:current-page="walletPage" v-model:page-size="walletPageSize" :total="walletTotal" :page-sizes="[20,50]" layout="total, sizes, prev, pager, next" @size-change="loadWallet" @current-change="loadWallet" />
          </div>
        </el-tab-pane>

        <!-- ⑤ 提现审核 -->
        <el-tab-pane label="提现审核" name="withdrawals">
          <div class="tab-toolbar">
            <el-input v-model="wdFilters.keyword" placeholder="用户ID/账号" clearable style="width:200px" @keyup.enter="loadWithdrawals" />
            <el-select v-model="wdFilters.status" placeholder="状态" clearable style="width:110px" @change="loadWithdrawals">
              <el-option label="待审核" value="PENDING" />
              <el-option label="处理中" value="PROCESSING" />
              <el-option label="已通过" value="SUCCESS" />
              <el-option label="已拒绝" value="REJECTED" />
            </el-select>
            <el-button @click="loadWithdrawals">查询</el-button>
          </div>
          <el-table :data="withdrawals" v-loading="wdLoading" stripe size="small">
            <el-table-column label="用户" width="120">
              <template #default="{ row }">{{ row.user?.nickname || row.userId }}</template>
            </el-table-column>
            <el-table-column label="金额" width="100" align="right">
              <template #default="{ row }">{{ money(row.amount) }}</template>
            </el-table-column>
            <el-table-column prop="channel" label="渠道" width="80" />
            <el-table-column prop="account" label="收款账号" min-width="160" show-overflow-tooltip />
            <el-table-column label="状态" width="80" align="center">
              <template #default="{ row }">
                <el-tag :type="wdStatusType[row.status]" size="small">{{ wdStatusMap[row.status] || row.status }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="申请时间" width="160">
              <template #default="{ row }">{{ dt(row.createdAt) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="150" fixed="right">
              <template #default="{ row }">
                <template v-if="row.status === 'PENDING'">
                  <el-button size="small" type="success" @click="wdReview(row, true)">通过</el-button>
                  <el-button size="small" type="danger" @click="wdReview(row, false)">拒绝</el-button>
                </template>
                <el-button v-else-if="row.status === 'PROCESSING'" size="small" type="primary" @click="wdComplete(row)">确认打款</el-button>
                <span v-else class="text-muted">—</span>
              </template>
            </el-table-column>
          </el-table>
          <div class="pg-row">
            <el-pagination v-model:current-page="wdPage" v-model:page-size="wdPageSize" :total="wdTotal" :page-sizes="[20,50]" layout="total, sizes, prev, pager, next" @size-change="loadWithdrawals" @current-change="loadWithdrawals" />
          </div>
        </el-tab-pane>

        <!-- ⑥ 补贴与对账 -->
        <el-tab-pane label="补贴与对账" name="subsidy">
          <div class="subsidy-row">
            <el-card shadow="never" class="subsidy-stat-card">
              <div class="subsidy-stat-label">补贴总额</div>
              <div class="subsidy-stat-val">{{ money(subsidyOverview.amount) }}</div>
              <div class="subsidy-stat-sub">{{ subsidyOverview.count || 0 }} 笔</div>
            </el-card>
            <el-card shadow="never" class="subsidy-stat-card">
              <div class="subsidy-stat-label">补给骑手</div>
              <div class="subsidy-stat-val">{{ money(subsidyReceiverAmount('rider')) }}</div>
            </el-card>
            <el-card shadow="never" class="subsidy-stat-card">
              <div class="subsidy-stat-label">补给商家</div>
              <div class="subsidy-stat-val">{{ money(subsidyReceiverAmount('merchant')) }}</div>
            </el-card>
            <el-card shadow="never" class="subsidy-stat-card">
              <div class="subsidy-stat-label">净收入（支付-退款）</div>
              <div class="subsidy-stat-val">{{ money(reconcileSummary.netIncome) }}</div>
            </el-card>
          </div>

          <div class="sub-section-title" style="margin-top:20px">按来源看补贴成本</div>
          <el-table :data="subsidyOverview.bySource || []" size="small" stripe>
            <el-table-column label="来源" min-width="140">
              <template #default="{ row }">{{ subsidySourceLabel(row.key) }}</template>
            </el-table-column>
            <el-table-column label="金额" width="120" align="right">
              <template #default="{ row }">{{ money(row.amount) }}</template>
            </el-table-column>
            <el-table-column label="笔数" width="80" align="right" prop="count" />
          </el-table>

          <div class="sub-section-title" style="margin-top:24px">每日对账明细</div>
          <el-table :data="reconcileList" v-loading="reconcileLoading" size="small" stripe>
            <el-table-column prop="date" label="日期" width="120" />
            <el-table-column prop="orderCount" label="订单数" width="90" align="right" />
            <el-table-column label="支付金额" width="120" align="right">
              <template #default="{ row }">{{ money(row.payAmount) }}</template>
            </el-table-column>
            <el-table-column label="退款金额" width="120" align="right">
              <template #default="{ row }">{{ money(row.refundAmount) }}</template>
            </el-table-column>
            <el-table-column label="净收入" width="120" align="right">
              <template #default="{ row }">{{ money(row.netAmount) }}</template>
            </el-table-column>
            <el-table-column label="状态" width="90" align="center">
              <template #default="{ row }">
                <el-tag :type="row.status === 'reconciled' ? 'success' : 'warning'" size="small">
                  {{ row.status === 'reconciled' ? '已对账' : '待对账' }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
          <div class="pg-row">
            <el-pagination v-model:current-page="reconcilePage" v-model:page-size="reconcilePageSize" :total="reconcileTotal" :page-sizes="[20,50]" layout="total, sizes, prev, pager, next" @size-change="loadReconcile" @current-change="loadReconcile" />
          </div>
        </el-tab-pane>

      </el-tabs>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { InfoFilled } from '@element-plus/icons-vue'
import PageHeader from '@/components/common/PageHeader.vue'
import StatGrid from '@/components/glass/StatGrid.vue'
import { request } from '@/api/request'

// ── 日期范围 ──
const dateRange = ref<any>(null)
const loading = ref(false)

function getDateParams() {
  const p: any = {}
  if (dateRange.value?.[0]) p.start = dateRange.value[0]
  if (dateRange.value?.[1]) p.end = dateRange.value[1]
  return p
}

function handleDateChange() { loadAll() }

// ── 统一加载 ──
function loadAll() {
  loadOverview()
  loadCommission()
  if (activeTab.value === 'payments') loadPayments()
  if (activeTab.value === 'refunds') loadRefunds()
  if (activeTab.value === 'wallet') loadWallet()
  if (activeTab.value === 'withdrawals') loadWithdrawals()
  if (activeTab.value === 'subsidy') { loadSubsidy(); loadReconcile() }
}

function onTabChange(tab: string) {
  activeTab.value = tab
  if (tab === 'payments' && !payments.value.length) loadPayments()
  if (tab === 'refunds' && !refunds.value.length) loadRefunds()
  if (tab === 'wallet' && !walletLogs.value.length) loadWallet()
  if (tab === 'withdrawals' && !withdrawals.value.length) loadWithdrawals()
  if (tab === 'subsidy') { if (!reconcileList.value.length) loadReconcile(); if (!subsidyOverview.value.bySource) loadSubsidy() }
}

const activeTab = ref('commission')

// ── 财务总览卡片 ──
const overviewLoading = ref(false)
const overview = ref<any>({ cards: {} })

const statItems = computed(() => [
  { label: '今日实收', value: money(overview.value.cards?.todayIncome?.amount || 0), sub: `${overview.value.cards?.todayIncome?.count || 0} 笔支付`, icon: 'Money', tone: 'green' as const },
  { label: '周期实收', value: money(overview.value.cards?.periodIncome?.amount || 0), sub: `${overview.value.cards?.periodIncome?.count || 0} 笔支付`, icon: 'TrendCharts', tone: 'cyan' as const },
  { label: '骑手待结算', value: money(overview.value.cards?.unsettledRiderIncome?.amount || 0), sub: `${overview.value.cards?.unsettledRiderIncome?.count || 0} 单`, icon: 'Van', tone: 'orange' as const },
  { label: '待审核提现', value: money(overview.value.cards?.pendingWithdrawals?.amount || 0), sub: `${overview.value.cards?.pendingWithdrawals?.count || 0} 笔`, icon: 'Wallet', tone: 'blue' as const },
])

const todoItems = computed(() => [
  { label: '待审核提现', value: overview.value.cards?.pendingWithdrawals?.count || 0, sub: '笔，需人工审核', tone: 'warn' },
  { label: '待处理骑手结算', value: overview.value.cards?.pendingRiderSettlements?.count || 0, sub: '张结算单', tone: 'warn' },
  { label: '未生成结算的骑手订单', value: overview.value.cards?.unsettledRiderIncome?.count || 0, sub: '单', tone: 'info' },
  { label: '异常资金单', value: overview.value.cards?.abnormalOrders?.count || 0, sub: '条，需人工核查', tone: 'danger' },
])

async function loadOverview() {
  overviewLoading.value = true
  try {
    overview.value = await request.get('/admin/finance/overview', { params: getDateParams() })
  } catch (e: any) { ElMessage.error(e?.message || '加载财务总览失败') }
  finally { overviewLoading.value = false }
}

// ── 抽成 ──
const feeConfigs = ref<any[]>([])
const bizBreakdown = ref<any[]>([])
const regionRates = ref<any[]>([])
const commissionSummary = ref<any>({})

const editingBiz = ref<string | null>(null)
const editingBizRate = ref(0)
const editingBizFixed = ref(0)
const editingBizEnabled = ref(true)
const savingBiz = ref<string | null>(null)

const editingRegion = ref<string | null>(null)
const editingRegionRate = ref(0)
const savingRegion = ref<string | null>(null)

function previewFee(rate: number, fixed: number) {
  return Math.max(0, Math.min(Math.round((100 * (rate / 100) + fixed) * 100) / 100, 100)).toFixed(2)
}
function startBizEdit(cfg: any) {
  editingBiz.value = cfg.bizType
  editingBizRate.value = Number((cfg.rate * 100).toFixed(2))
  editingBizFixed.value = Number(cfg.fixedFee || 0)
  editingBizEnabled.value = cfg.enabled !== false
}
async function saveBiz(cfg: any) {
  savingBiz.value = cfg.bizType
  try {
    await request.put(`/admin/config/biz-fee-configs/${cfg.bizType}`, { rate: editingBizRate.value / 100, fixedFee: editingBizFixed.value, enabled: editingBizEnabled.value })
    cfg.rate = editingBizRate.value / 100; cfg.fixedFee = editingBizFixed.value; cfg.enabled = editingBizEnabled.value
    const row = bizBreakdown.value.find(b => b.bizType === cfg.bizType)
    if (row) { row.rate = cfg.rate; row.fixedFee = cfg.fixedFee; row.enabled = cfg.enabled }
    editingBiz.value = null
    ElMessage.success(`「${cfg.label}」抽成比例已保存`)
    recalc()
  } catch (e: any) { ElMessage.error(e?.message || '保存失败') }
  finally { savingBiz.value = null }
}
function startRegionEdit(row: any) { editingRegion.value = row.regionId; editingRegionRate.value = Number((row.commissionRate * 100).toFixed(2)) }
async function saveRegion(row: any) {
  savingRegion.value = row.regionId
  try {
    await request.put(`/admin/finance/commission-rate/${row.regionId}`, { commissionRate: editingRegionRate.value / 100 })
    row.commissionRate = editingRegionRate.value / 100
    editingRegion.value = null
    ElMessage.success(`「${row.regionName}」已更新为 ${editingRegionRate.value}%`)
  } catch (e: any) { ElMessage.error(e?.message || '保存失败') }
  finally { savingRegion.value = null }
}

function bizEffRate(row: any) { return row.totalAmount > 0 ? ((row.totalPlatformFee / row.totalAmount) * 100).toFixed(2) : '0.00' }
function bizRateTag(row: any) {
  if (row.bizType === 'order') return 'info'
  const diff = Math.abs(row.rate * 100 - parseFloat(bizEffRate(row)))
  return diff < 0.5 ? 'success' : diff < 2 ? 'warning' : 'danger'
}
function regionEffRate(row: any) { return row.totalAmount > 0 ? ((row.totalPlatformFee / row.totalAmount) * 100).toFixed(2) : '0.00' }
function regionRateTag(row: any) {
  const diff = Math.abs(row.commissionRate * 100 - parseFloat(regionEffRate(row)))
  return diff < 0.5 ? 'success' : diff < 2 ? 'warning' : 'danger'
}

async function loadCommission() {
  try {
    const [ov, feeRes]: any[] = await Promise.all([
      request.get('/admin/finance/commission-overview', { params: getDateParams() }),
      request.get('/admin/config/biz-fee-configs'),
    ])
    commissionSummary.value = ov?.summary || {}
    bizBreakdown.value = ov?.bizBreakdown || []
    regionRates.value = ov?.regionRates || []
    feeConfigs.value = (feeRes?.data || ov?.feeConfigs || []).map((c: any) => ({ ...c, rate: Number(c.rate || 0), fixedFee: Number(c.fixedFee || 0) }))
    recalc()
  } catch {}
}

// ── 抽成计算器 ──
const calcAmount = ref(100)
const calcBizType = ref('errand_order')
const calcCustomRate = ref(5)
const calcResult = ref({ platformFee: 0, payout: 100, rateDisplay: '0%', fixedFee: 0, remark: '' })

function recalc() {
  const amount = calcAmount.value || 0
  let rate = 0, fixedFee = 0, remark = ''
  if (calcBizType.value === '__custom__') {
    rate = (calcCustomRate.value || 0) / 100
  } else if (calcBizType.value === 'order') {
    const w = regionRates.value.reduce((a, r) => ({ f: a.f + (r.totalPlatformFee || 0), a: a.a + (r.totalAmount || 0) }), { f: 0, a: 0 })
    rate = w.a > 0 ? w.f / w.a : 0
    remark = '外卖按区域费率，此处为各区域加权平均值，实际以区域配置为准'
  } else {
    const cfg = feeConfigs.value.find(c => c.bizType === calcBizType.value)
    if (cfg) { rate = Number(cfg.rate || 0); fixedFee = Number(cfg.fixedFee || 0); remark = cfg.remark || '' }
  }
  const fee = Math.max(0, Math.min(Math.round((amount * rate + fixedFee) * 100) / 100, amount))
  calcResult.value = { platformFee: fee, payout: Math.max(0, amount - fee), rateDisplay: (rate * 100).toFixed(2) + '%', fixedFee, remark }
}

// ── 支付订单 ──
const payments = ref<any[]>([])
const payLoading = ref(false)
const payPage = ref(1); const payPageSize = ref(20); const payTotal = ref(0)
const payFilters = reactive({ keyword: '', status: '' })
const payStatusMap: Record<string, string> = { paid: '成功', pending: '待支付', paying: '支付中', failed: '失败', closed: '已关闭', refunding: '退款中', refunded: '已退款' }

async function loadPayments() {
  payLoading.value = true
  try {
    const res: any = await request.get('/admin/finance/payment-orders', { params: { page: payPage.value, pageSize: payPageSize.value, ...payFilters, ...getDateParams() } })
    payments.value = res?.list || res?.data?.list || []
    payTotal.value = res?.total || res?.data?.total || 0
  } catch {} finally { payLoading.value = false }
}

// ── 退款 ──
const refunds = ref<any[]>([])
const refundLoading = ref(false)
const refundPage = ref(1); const refundPageSize = ref(20); const refundTotal = ref(0)
const refundFilters = reactive({ keyword: '', status: '' })
const refundStatusMap: Record<string, string> = { SUCCESS: '成功', PROCESSING: '处理中', FAILED: '失败' }

async function loadRefunds() {
  refundLoading.value = true
  try {
    const res: any = await request.get('/admin/finance/refund-orders', { params: { page: refundPage.value, pageSize: refundPageSize.value, ...refundFilters, ...getDateParams() } })
    refunds.value = res?.list || res?.data?.list || []
    refundTotal.value = res?.total || res?.data?.total || 0
  } catch {} finally { refundLoading.value = false }
}

// ── 用户流水 ──
const walletLogs = ref<any[]>([])
const walletLoading = ref(false)
const walletPage = ref(1); const walletPageSize = ref(20); const walletTotal = ref(0)
const walletFilters = reactive({ keyword: '', type: '' })

async function loadWallet() {
  walletLoading.value = true
  try {
    const res: any = await request.get('/admin/finance/user-wallet-logs', { params: { page: walletPage.value, pageSize: walletPageSize.value, ...walletFilters, ...getDateParams() } })
    walletLogs.value = res?.list || res?.data?.list || []
    walletTotal.value = res?.total || res?.data?.total || 0
  } catch {} finally { walletLoading.value = false }
}

// ── 提现审核 ──
const withdrawals = ref<any[]>([])
const wdLoading = ref(false)
const wdPage = ref(1); const wdPageSize = ref(20); const wdTotal = ref(0)
const wdFilters = reactive({ keyword: '', status: '' })
const wdStatusMap: Record<string, string> = { PENDING: '待审核', PROCESSING: '处理中', SUCCESS: '成功', FAILED: '失败', REJECTED: '已拒绝' }
const wdStatusType: Record<string, string> = { PENDING: 'warning', PROCESSING: 'primary', SUCCESS: 'success', FAILED: 'danger', REJECTED: 'danger' }

async function loadWithdrawals() {
  wdLoading.value = true
  try {
    const res: any = await request.get('/admin/finance/withdrawals', { params: { page: wdPage.value, pageSize: wdPageSize.value, ...wdFilters } })
    withdrawals.value = res?.list || res?.data?.list || []
    wdTotal.value = res?.total || res?.data?.total || 0
  } catch {} finally { wdLoading.value = false }
}

async function wdReview(row: any, approved: boolean) {
  try {
    if (!approved) {
      const { value: reason } = await ElMessageBox.prompt('请输入拒绝原因', '拒绝提现', { inputPlaceholder: '拒绝原因', type: 'warning' })
      await request.put(`/admin/withdrawals/${row.id}/review`, { approved: false, reason })
    } else {
      await ElMessageBox.confirm('确定通过该提现申请？', '确认', { type: 'warning' })
      await request.put(`/admin/withdrawals/${row.id}/review`, { approved: true })
    }
    ElMessage.success('操作成功'); loadWithdrawals()
  } catch (e: any) { if (e !== 'cancel') ElMessage.error('操作失败') }
}

async function wdComplete(row: any) {
  try {
    const { value: transferNo } = await ElMessageBox.prompt('请输入打款流水号', '确认打款', { inputValidator: (v) => v?.trim() ? true : '不能为空' })
    await request.put(`/admin/withdrawals/${row.id}/complete`, { transferNo: transferNo.trim() })
    ElMessage.success('已确认打款'); loadWithdrawals()
  } catch (e: any) { if (e !== 'cancel') ElMessage.error(e?.message || '操作失败') }
}

// ── 补贴与对账 ──
const subsidyOverview = ref<any>({ amount: 0, count: 0, bySource: [], byReceiver: [] })
const reconcileList = ref<any[]>([])
const reconcileSummary = ref<any>({})
const reconcileLoading = ref(false)
const reconcilePage = ref(1); const reconcilePageSize = ref(20); const reconcileTotal = ref(0)

function subsidyReceiverAmount(key: string) {
  const item = (subsidyOverview.value.byReceiver || []).find((r: any) => r.key === key)
  return item?.amount || 0
}

const subsidySourceLabels: Record<string, string> = {
  membership: '会员折扣', errand_discount: '跑腿折扣', new_user: '新用户优惠',
  coupon: '优惠券', activity: '活动补贴', invite: '邀请奖励',
}
function subsidySourceLabel(key: string) { return subsidySourceLabels[key] || key }

async function loadSubsidy() {
  try {
    const res: any = await request.get('/admin/finance/subsidies/overview', { params: getDateParams() })
    subsidyOverview.value = res?.data || res || {}
  } catch {}
}

async function loadReconcile() {
  reconcileLoading.value = true
  try {
    const res: any = await request.get('/admin/finance/reconciliation', { params: { page: reconcilePage.value, pageSize: reconcilePageSize.value, ...getDateParams() } })
    reconcileList.value = res?.list || res?.data?.list || []
    reconcileTotal.value = res?.total || res?.data?.total || 0
    reconcileSummary.value = res?.summary || res?.data?.summary || {}
  } catch {} finally { reconcileLoading.value = false }
}

// ── 共用辅助 ──
const money = (v: any) => `¥${Number(v || 0).toFixed(2)}`
const dt = (v: any) => v ? new Date(v).toLocaleString('zh-CN') : '—'

const bizTypeLabels: Record<string, { label: string; tag: any }> = {
  order: { label: '外卖订单', tag: 'success' },
  errand_order: { label: '跑腿订单', tag: 'primary' },
  mall_order: { label: '商城订单', tag: 'success' },
  recharge: { label: '余额充值', tag: 'info' },
  topup: { label: '付费置顶', tag: 'warning' },
  group_buy_order: { label: '拼团订单', tag: 'success' },
  second_hand_order: { label: '二手订单', tag: 'info' },
  dating_order: { label: '交友订单', tag: 'info' },
  activity_order: { label: '活动报名', tag: 'warning' },
  membership: { label: '会员购买', tag: 'warning' },
  delivery_order: { label: '配送订单', tag: 'primary' },
}
function bizTypeLabel(t: string) { return bizTypeLabels[t]?.label || t || '未知' }
function bizTypeTag(t: string) { return bizTypeLabels[t]?.tag || 'info' }

onMounted(() => {
  loadOverview()
  loadCommission()
})
</script>

<style scoped>
.page-shell { padding: 24px; display: flex; flex-direction: column; gap: 20px; }

/* 待处理事项 */
.todo-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
.todo-card { padding: 14px 16px; border-radius: 10px; border: 1px solid var(--el-border-color-light); background: var(--el-fill-color-blank); display: flex; flex-direction: column; gap: 4px; }
.todo-card.warn { border-color: var(--el-color-warning-light-5); background: var(--el-color-warning-light-9); }
.todo-card.danger { border-color: var(--el-color-danger-light-5); background: var(--el-color-danger-light-9); }
.todo-label { font-size: 12px; color: var(--el-text-color-placeholder); }
.todo-val { font-size: 24px; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--el-text-color-primary); line-height: 1.2; }
.todo-sub { font-size: 12px; color: var(--el-text-color-placeholder); }

/* Tab 卡片 */
.tab-card { }
.tab-toolbar { display: flex; gap: 10px; align-items: center; margin-bottom: 14px; flex-wrap: wrap; }
.tab-section-title { font-weight: 700; font-size: 14px; color: var(--el-text-color-primary); }
.sub-section-title { font-weight: 700; font-size: 13px; color: var(--el-text-color-regular); padding-bottom: 8px; border-bottom: 1px solid var(--el-border-color-lighter); }

/* 费率卡片 */
.fee-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; margin-bottom: 24px; }
.fee-item { padding: 14px 16px; border: 1px solid var(--el-border-color-light); border-radius: 10px; background: var(--el-fill-color-blank); display: flex; flex-direction: column; gap: 8px; transition: border-color 0.15s; }
.fee-item:hover { border-color: var(--el-color-primary-light-5); }
.fee-item.disabled { opacity: 0.7; background: var(--el-fill-color-lighter); }
.fee-item-head { display: flex; align-items: center; justify-content: space-between; }
.fee-label { font-weight: 700; font-size: 14px; }
.fee-item-remark { font-size: 12px; color: var(--el-text-color-placeholder); min-height: 16px; line-height: 1.5; }
.fee-region-hint { display: flex; align-items: center; gap: 5px; font-size: 12px; color: var(--el-text-color-placeholder); padding: 6px 10px; background: var(--el-fill-color-light); border-radius: 6px; }
.fee-current-row { display: flex; align-items: center; gap: 10px; }
.fee-rate-big { font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--el-color-primary); }
.fee-fixed { font-size: 12px; color: var(--el-text-color-placeholder); margin-left: 4px; }
.fee-edit-row { display: flex; flex-wrap: wrap; gap: 10px; }
.fee-edit-field { display: flex; flex-direction: column; gap: 4px; }
.fee-edit-label { font-size: 12px; color: var(--el-text-color-placeholder); }
.fee-preview { font-size: 12px; color: var(--el-text-color-regular); padding: 7px 10px; background: var(--el-color-primary-light-9); border-radius: 6px; }
.fee-preview strong { color: var(--el-color-primary); font-variant-numeric: tabular-nums; }
.fee-edit-actions { display: flex; gap: 8px; }

/* 计算器 */
.calc-section { padding: 16px; background: var(--el-fill-color-light); border-radius: 10px; margin-bottom: 4px; }
.calc-title { font-weight: 700; font-size: 13px; margin-bottom: 12px; }
.calc-row { display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-end; margin-bottom: 14px; }
.calc-field { display: flex; flex-direction: column; gap: 5px; }
.calc-label { font-size: 12px; color: var(--el-text-color-placeholder); }
.calc-result-row { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 10px; }
.calc-op { font-size: 18px; color: var(--el-text-color-placeholder); font-weight: 300; }
.calc-sep { font-size: 18px; color: var(--el-border-color); margin: 0 4px; }
.calc-block { display: flex; flex-direction: column; gap: 2px; }
.calc-block-label { font-size: 11px; color: var(--el-text-color-placeholder); }
.calc-block-val { font-size: 18px; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--el-text-color-primary); }
.calc-block.accent .calc-block-val { color: var(--el-color-success-dark-2); font-size: 20px; }
.payout { color: var(--el-color-primary) !important; }
.calc-remark { display: flex; align-items: flex-start; gap: 5px; font-size: 12px; color: var(--el-text-color-placeholder); }

/* 区域费率 */
.rate-cell { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.rate-val { font-weight: 600; font-variant-numeric: tabular-nums; }

/* 补贴汇总 */
.subsidy-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; }
.subsidy-stat-card { text-align: center; }
.subsidy-stat-label { font-size: 12px; color: var(--el-text-color-placeholder); margin-bottom: 6px; }
.subsidy-stat-val { font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--el-text-color-primary); }
.subsidy-stat-sub { font-size: 12px; color: var(--el-text-color-placeholder); margin-top: 4px; }

/* 通用 */
.pg-row { display: flex; justify-content: flex-end; margin-top: 14px; }
.text-green { color: var(--el-color-success-dark-2); font-weight: 700; font-variant-numeric: tabular-nums; }
.text-muted { color: var(--el-text-color-placeholder); }
</style>
