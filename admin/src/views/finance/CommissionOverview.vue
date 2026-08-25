<template>
  <div class="page-shell">
    <PageHeader title="抽成总览" subtitle="各业务板块抽成比例设置、实收汇总及示例计算" icon="PieChart">
      <template #actions>
        <el-date-picker
          v-model="dateRange"
          type="daterange"
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          value-format="YYYY-MM-DD"
          style="width: 260px"
          @change="load"
        />
        <el-button :loading="loading" @click="load">刷新</el-button>
      </template>
    </PageHeader>

    <!-- 汇总卡片 -->
    <StatGrid v-loading="loading" :items="statItems" />

    <!-- ① 各业务板块抽成比例设置 -->
    <el-card shadow="never">
      <template #header>
        <div class="card-title-text">各业务板块抽成比例设置</div>
        <div class="card-subtitle">直接在这里修改每个板块的抽成比例，保存后立即对新订单生效</div>
      </template>

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
              外卖按区域单独配置，在下方「外卖区域配置」表格中修改
            </div>
          </template>
          <template v-else-if="editingBiz === cfg.bizType">
            <div class="fee-edit-row">
              <div class="fee-edit-field">
                <span class="fee-edit-label">比例费率（%）</span>
                <el-input-number
                  v-model="editingBizRate"
                  :min="0" :max="100" :precision="2" :step="0.5"
                  size="small" style="width: 120px"
                />
              </div>
              <div class="fee-edit-field">
                <span class="fee-edit-label">每单固定费（元）</span>
                <el-input-number
                  v-model="editingBizFixed"
                  :min="0" :precision="2" :step="0.1"
                  size="small" style="width: 120px"
                />
              </div>
              <div class="fee-edit-field">
                <span class="fee-edit-label">是否开启</span>
                <el-switch v-model="editingBizEnabled" />
              </div>
            </div>
            <div class="fee-edit-preview">
              预览：交易 ¥100 → 平台抽
              <strong>¥{{ previewFee(editingBizRate, editingBizFixed) }}</strong>，
              对方到手 <strong>¥{{ (100 - Number(previewFee(editingBizRate, editingBizFixed))).toFixed(2) }}</strong>
            </div>
            <div class="fee-edit-actions">
              <el-button type="primary" size="small" :loading="savingBiz === cfg.bizType" @click="saveBiz(cfg)">保存</el-button>
              <el-button size="small" @click="cancelBizEdit">取消</el-button>
            </div>
          </template>
          <template v-else>
            <div class="fee-current-row">
              <span class="fee-current-rate">
                {{ cfg.rate > 0 ? (cfg.rate * 100).toFixed(2) + '%' : '0%' }}
                <span v-if="cfg.fixedFee > 0" class="fee-fixed-tag">+ ¥{{ cfg.fixedFee }}/单</span>
              </span>
              <el-button size="small" link type="primary" @click="startBizEdit(cfg)">修改</el-button>
            </div>
          </template>
        </div>
      </div>
    </el-card>

    <!-- ② 抽成计算器 -->
    <el-card shadow="never">
      <template #header>
        <div class="card-title-text">抽成计算器</div>
        <div class="card-subtitle">输入金额，选择板块，立即看到平台抽多少、对方到手多少</div>
      </template>
      <div class="calc-body">
        <div class="calc-inputs">
          <div class="calc-field">
            <span class="calc-label">交易金额（元）</span>
            <el-input-number
              v-model="calcAmount"
              :min="0" :max="99999" :precision="2" :step="10"
              style="width: 160px"
              @change="recalc"
            />
          </div>
          <div class="calc-field">
            <span class="calc-label">业务板块</span>
            <el-select v-model="calcBizType" style="width: 160px" @change="recalc">
              <el-option v-for="b in feeConfigs" :key="b.bizType" :label="b.label" :value="b.bizType" />
              <el-option label="自定义费率" value="__custom__" />
            </el-select>
          </div>
          <div v-if="calcBizType === '__custom__'" class="calc-field">
            <span class="calc-label">自定义费率（%）</span>
            <el-input-number
              v-model="calcCustomRate"
              :min="0" :max="100" :precision="2" :step="1"
              style="width: 120px"
              @change="recalc"
            />
          </div>
        </div>

        <div class="calc-result-row">
          <div class="calc-block">
            <span class="calc-block-label">交易金额</span>
            <span class="calc-block-value">{{ money(calcAmount) }}</span>
          </div>
          <span class="calc-op">×</span>
          <div class="calc-block">
            <span class="calc-block-label">费率</span>
            <span class="calc-block-value">{{ calcResult.rateDisplay }}</span>
          </div>
          <span v-if="calcResult.fixedFee > 0" class="calc-op">+</span>
          <div v-if="calcResult.fixedFee > 0" class="calc-block">
            <span class="calc-block-label">固定费</span>
            <span class="calc-block-value">{{ money(calcResult.fixedFee) }}</span>
          </div>
          <span class="calc-op">=</span>
          <div class="calc-block accent">
            <span class="calc-block-label">平台抽成</span>
            <span class="calc-block-value">{{ money(calcResult.platformFee) }}</span>
          </div>
        </div>

        <div class="calc-payout-row">
          对方到手：<strong>{{ money(calcResult.payout) }}</strong>
          <span class="calc-payout-sub">（{{ money(calcAmount) }} − {{ money(calcResult.platformFee) }}）</span>
        </div>
        <div v-if="calcResult.remark" class="calc-remark">
          <el-icon><InfoFilled /></el-icon> {{ calcResult.remark }}
        </div>
      </div>
    </el-card>

    <!-- ③ 各板块时段实收 -->
    <el-card shadow="never">
      <template #header>
        <div class="card-title-text">各业务板块期间实收</div>
      </template>
      <el-table :data="bizBreakdown" v-loading="loading" stripe :default-sort="{ prop: 'totalPlatformFee', order: 'descending' }">
        <el-table-column label="板块" min-width="120">
          <template #default="{ row }">
            <div class="biz-name-cell">
              <span>{{ row.label }}</span>
              <el-tag v-if="!row.enabled" type="info" size="small" effect="light">未开启</el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="配置费率" width="130" align="center">
          <template #default="{ row }">
            <span v-if="row.bizType === 'order'" class="rate-muted">按区域</span>
            <span v-else>{{ row.rate > 0 ? (row.rate * 100).toFixed(2) + '%' : '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="期间交易额" width="130" align="right" sortable prop="totalAmount">
          <template #default="{ row }">{{ money(row.totalAmount) }}</template>
        </el-table-column>
        <el-table-column label="期间平台实收" width="140" align="right" sortable prop="totalPlatformFee">
          <template #default="{ row }">
            <span class="money-accent" :class="{ dim: row.totalPlatformFee === 0 }">{{ money(row.totalPlatformFee) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="实际费率" width="100" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.totalAmount > 0" :type="bizRateTag(row)" size="small">
              {{ bizEffRate(row) }}%
            </el-tag>
            <span v-else class="rate-muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="笔数" width="80" align="right" prop="orderCount">
          <template #default="{ row }">{{ row.orderCount || 0 }}</template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- ④ 外卖区域配置 -->
    <el-card shadow="never">
      <template #header>
        <div class="card-title-text">外卖区域抽成配置</div>
        <div class="card-subtitle">每个区域可以独立设置，修改后立即对新结算单生效</div>
      </template>
      <el-table :data="regionRates" v-loading="loading" stripe :default-sort="{ prop: 'totalPlatformFee', order: 'descending' }">
        <el-table-column prop="regionName" label="区域" min-width="120" />
        <el-table-column label="抽成比例" width="300">
          <template #default="{ row }">
            <div class="rate-cell">
              <span class="rate-value">{{ (row.commissionRate * 100).toFixed(2) }}%</span>
              <template v-if="editingRegion === row.regionId">
                <el-input-number v-model="editingRegionRate" :min="0" :max="100" :precision="2" :step="0.5" size="small" style="width:100px" />
                <el-button size="small" type="primary" :loading="savingRegion === row.regionId" @click="saveRegion(row)">保存</el-button>
                <el-button size="small" @click="cancelRegionEdit">取消</el-button>
              </template>
              <el-button v-else size="small" link type="primary" @click="startRegionEdit(row)">修改</el-button>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="期间货款" width="130" align="right" prop="totalAmount">
          <template #default="{ row }">{{ money(row.totalAmount) }}</template>
        </el-table-column>
        <el-table-column label="期间实收" width="130" align="right" prop="totalPlatformFee">
          <template #default="{ row }">
            <span class="money-accent" :class="{ dim: row.totalPlatformFee === 0 }">{{ money(row.totalPlatformFee) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="实际费率" width="100" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.totalAmount > 0" :type="regionRateTag(row)" size="small">{{ regionEffRate(row) }}%</el-tag>
            <span v-else class="rate-muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="结算笔数" width="90" align="right" prop="orderCount">
          <template #default="{ row }">{{ row.orderCount || 0 }}</template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- ⑤ 每日趋势 -->
    <el-card v-if="dailyTrend.length" shadow="never">
      <template #header><span class="card-title-text">每日平台实收趋势（全业务合计）</span></template>
      <div class="trend-chart">
        <div class="trend-axis">
          <span v-for="tick in yTicks" :key="tick" class="y-tick">{{ tick }}</span>
        </div>
        <div class="trend-bars">
          <div v-for="d in dailyTrend" :key="d.date" class="trend-col">
            <el-tooltip :content="`${d.date}  实收 ${money(d.platformFee)}  货款 ${money(d.amount)}`" placement="top">
              <div class="trend-bar" :style="{ height: barHeight(d.platformFee) + 'px' }" />
            </el-tooltip>
            <span class="trend-label">{{ d.date.slice(5) }}</span>
          </div>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { InfoFilled } from '@element-plus/icons-vue'
import PageHeader from '@/components/common/PageHeader.vue'
import StatGrid from '@/components/glass/StatGrid.vue'
import { request } from '@/api/request'

const loading = ref(false)
const dateRange = ref<any>(null)
const summary = ref<any>({})
const bizBreakdown = ref<any[]>([])
const regionRates = ref<any[]>([])
const dailyTrend = ref<any[]>([])
const feeConfigs = ref<any[]>([])

// ── 业务费率编辑 ──
const editingBiz = ref<string | null>(null)
const editingBizRate = ref(0)
const editingBizFixed = ref(0)
const editingBizEnabled = ref(true)
const savingBiz = ref<string | null>(null)

function previewFee(rate: number, fixed: number) {
  return Math.max(0, Math.min(Math.round((100 * (rate / 100) + fixed) * 100) / 100, 100)).toFixed(2)
}

function startBizEdit(cfg: any) {
  editingBiz.value = cfg.bizType
  editingBizRate.value = Number((cfg.rate * 100).toFixed(2))
  editingBizFixed.value = Number(cfg.fixedFee || 0)
  editingBizEnabled.value = cfg.enabled !== false
}
function cancelBizEdit() { editingBiz.value = null }

async function saveBiz(cfg: any) {
  savingBiz.value = cfg.bizType
  try {
    await request.put(`/admin/config/biz-fee-configs/${cfg.bizType}`, {
      rate: editingBizRate.value / 100,
      fixedFee: editingBizFixed.value,
      enabled: editingBizEnabled.value,
    })
    cfg.rate = editingBizRate.value / 100
    cfg.fixedFee = editingBizFixed.value
    cfg.enabled = editingBizEnabled.value
    // 同步到 bizBreakdown
    const row = bizBreakdown.value.find(b => b.bizType === cfg.bizType)
    if (row) { row.rate = cfg.rate; row.fixedFee = cfg.fixedFee; row.enabled = cfg.enabled }
    editingBiz.value = null
    ElMessage.success(`「${cfg.label}」抽成比例已保存`)
    recalc()
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败')
  } finally { savingBiz.value = null }
}

// ── 区域费率编辑 ──
const editingRegion = ref<string | null>(null)
const editingRegionRate = ref(0)
const savingRegion = ref<string | null>(null)

function startRegionEdit(row: any) {
  editingRegion.value = row.regionId
  editingRegionRate.value = Number((row.commissionRate * 100).toFixed(2))
}
function cancelRegionEdit() { editingRegion.value = null }

async function saveRegion(row: any) {
  savingRegion.value = row.regionId
  try {
    await request.put(`/admin/finance/commission-rate/${row.regionId}`, { commissionRate: editingRegionRate.value / 100 })
    row.commissionRate = editingRegionRate.value / 100
    editingRegion.value = null
    ElMessage.success(`「${row.regionName}」抽成比例已更新为 ${editingRegionRate.value}%`)
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败')
  } finally { savingRegion.value = null }
}

// ── 计算器 ──
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
    remark = '外卖按各区域独立费率计算，此处为当前时段加权平均值，以区域实际配置为准'
  } else {
    const cfg = feeConfigs.value.find(c => c.bizType === calcBizType.value)
    if (cfg) { rate = Number(cfg.rate || 0); fixedFee = Number(cfg.fixedFee || 0); remark = cfg.remark || '' }
  }
  const fee = Math.max(0, Math.min(Math.round((amount * rate + fixedFee) * 100) / 100, amount))
  calcResult.value = { platformFee: fee, payout: Math.max(0, amount - fee), rateDisplay: (rate * 100).toFixed(2) + '%', fixedFee, remark }
}

// ── 辅助 ──
const money = (v: any) => `¥${Number(v || 0).toFixed(2)}`

function bizEffRate(row: any) {
  return row.totalAmount > 0 ? ((row.totalPlatformFee / row.totalAmount) * 100).toFixed(2) : '0.00'
}
function bizRateTag(row: any) {
  if (row.bizType === 'order') return 'info'
  const diff = Math.abs(row.rate * 100 - parseFloat(bizEffRate(row)))
  return diff < 0.5 ? 'success' : diff < 2 ? 'warning' : 'danger'
}
function regionEffRate(row: any) {
  return row.totalAmount > 0 ? ((row.totalPlatformFee / row.totalAmount) * 100).toFixed(2) : '0.00'
}
function regionRateTag(row: any) {
  const diff = Math.abs(row.commissionRate * 100 - parseFloat(regionEffRate(row)))
  return diff < 0.5 ? 'success' : diff < 2 ? 'warning' : 'danger'
}

const barMaxH = 80
const maxFee = computed(() => Math.max(...dailyTrend.value.map(d => d.platformFee || 0), 1))
function barHeight(fee: number) { return Math.max(2, (fee / maxFee.value) * barMaxH) }
const yTicks = computed(() => [money(maxFee.value), money(maxFee.value / 2), '¥0'])

const statItems = computed(() => [
  { label: '期间平台总实收', value: money(summary.value.totalPlatformFee || 0), sub: `${summary.value.orderCount || 0} 笔合计`, icon: 'Money', tone: 'green' as const },
  { label: '期间交易总金额', value: money(summary.value.totalAmount || 0), sub: '全业务合计', icon: 'Tickets', tone: 'cyan' as const },
  { label: '综合实际费率', value: `${summary.value.effectiveRate || '0.00'}%`, sub: '总实收 ÷ 总交易额', icon: 'TrendCharts', tone: 'orange' as const },
  { label: '配置区域数', value: regionRates.value.length, sub: '含无结算区域', icon: 'MapLocation' },
])

async function load() {
  loading.value = true
  try {
    const params: any = {}
    if (dateRange.value?.[0]) params.start = dateRange.value[0]
    if (dateRange.value?.[1]) params.end = dateRange.value[1]
    const [ov, feeRes]: any[] = await Promise.all([
      request.get('/admin/finance/commission-overview', { params }),
      request.get('/admin/config/biz-fee-configs'),
    ])
    summary.value = ov?.summary || {}
    bizBreakdown.value = ov?.bizBreakdown || []
    regionRates.value = ov?.regionRates || []
    dailyTrend.value = ov?.dailyTrend || []
    feeConfigs.value = (feeRes?.data || ov?.feeConfigs || []).map((c: any) => ({
      ...c,
      rate: Number(c.rate || 0),
      fixedFee: Number(c.fixedFee || 0),
    }))
    recalc()
  } catch (e: any) {
    ElMessage.error(e?.message || '加载失败')
  } finally { loading.value = false }
}

onMounted(load)
</script>

<style scoped>
.page-shell { padding: 24px; display: flex; flex-direction: column; gap: 20px; }

/* 卡片头 */
.card-title-text { font-weight: 700; font-size: 14px; color: var(--el-text-color-primary); }
.card-subtitle { font-size: 12px; color: var(--el-text-color-placeholder); margin-top: 3px; }

/* 费率配置卡片 */
.fee-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 14px;
}
.fee-item {
  padding: 16px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 10px;
  background: var(--el-fill-color-blank);
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: border-color 0.15s;
}
.fee-item:hover { border-color: var(--el-color-primary-light-5); }
.fee-item.disabled { background: var(--el-fill-color-lighter); opacity: 0.75; }

.fee-item-head { display: flex; align-items: center; justify-content: space-between; }
.fee-label { font-weight: 700; font-size: 14px; color: var(--el-text-color-primary); }
.fee-item-remark { font-size: 12px; color: var(--el-text-color-placeholder); line-height: 1.5; min-height: 18px; }

.fee-current-row { display: flex; align-items: center; gap: 10px; }
.fee-current-rate { font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--el-color-primary); }
.fee-fixed-tag { font-size: 12px; color: var(--el-text-color-placeholder); margin-left: 4px; }

.fee-region-hint {
  display: flex; align-items: center; gap: 5px;
  font-size: 12px; color: var(--el-text-color-placeholder);
  padding: 8px 10px; background: var(--el-fill-color-light); border-radius: 6px;
}

.fee-edit-row { display: flex; flex-wrap: wrap; gap: 12px; }
.fee-edit-field { display: flex; flex-direction: column; gap: 4px; }
.fee-edit-label { font-size: 12px; color: var(--el-text-color-placeholder); }

.fee-edit-preview {
  font-size: 13px; color: var(--el-text-color-regular);
  padding: 8px 10px; background: var(--el-color-primary-light-9); border-radius: 6px;
}
.fee-edit-preview strong { color: var(--el-color-primary); font-variant-numeric: tabular-nums; }
.fee-edit-actions { display: flex; gap: 8px; }

/* 计算器 */
.calc-body { display: flex; flex-direction: column; gap: 16px; }
.calc-inputs { display: flex; flex-wrap: wrap; gap: 20px; align-items: flex-end; }
.calc-field { display: flex; flex-direction: column; gap: 6px; }
.calc-label { font-size: 13px; font-weight: 500; color: var(--el-text-color-regular); }

.calc-result-row {
  display: flex; align-items: center; flex-wrap: wrap; gap: 10px;
  padding: 16px 20px; background: var(--el-fill-color-light); border-radius: 10px;
}
.calc-op { font-size: 20px; color: var(--el-text-color-placeholder); font-weight: 300; }
.calc-block { display: flex; flex-direction: column; gap: 3px; }
.calc-block-label { font-size: 11px; color: var(--el-text-color-placeholder); letter-spacing: 0.03em; }
.calc-block-value { font-size: 18px; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--el-text-color-primary); }
.calc-block.accent .calc-block-value { color: var(--el-color-success-dark-2); font-size: 22px; }

.calc-payout-row { font-size: 14px; color: var(--el-text-color-regular); }
.calc-payout-row strong { font-size: 18px; font-variant-numeric: tabular-nums; color: var(--el-color-primary); }
.calc-payout-sub { font-size: 12px; color: var(--el-text-color-placeholder); margin-left: 6px; }
.calc-remark { display: flex; align-items: flex-start; gap: 5px; font-size: 12px; color: var(--el-text-color-placeholder); line-height: 1.6; }

/* 表格 */
.biz-name-cell { display: flex; align-items: center; gap: 6px; }
.rate-cell { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.rate-value { font-weight: 600; font-variant-numeric: tabular-nums; }
.rate-muted { color: var(--el-text-color-placeholder); font-size: 12px; }
.money-accent { font-variant-numeric: tabular-nums; font-weight: 700; color: var(--el-color-success-dark-2); }
.money-accent.dim { color: var(--el-text-color-placeholder); font-weight: 400; }

/* 趋势图 */
.trend-chart { display: flex; gap: 8px; align-items: flex-end; padding: 8px 0; overflow-x: auto; }
.trend-axis { display: flex; flex-direction: column; justify-content: space-between; height: 100px; text-align: right; font-size: 11px; color: var(--el-text-color-placeholder); font-variant-numeric: tabular-nums; padding-bottom: 20px; min-width: 60px; }
.y-tick { line-height: 1; }
.trend-bars { display: flex; align-items: flex-end; gap: 4px; min-height: 100px; flex: 1; }
.trend-col { display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 28px; }
.trend-bar { width: 20px; border-radius: 4px 4px 0 0; background: var(--el-color-primary-light-5); cursor: pointer; transition: background 0.15s; }
.trend-bar:hover { background: var(--el-color-primary); }
.trend-label { font-size: 10px; color: var(--el-text-color-placeholder); white-space: nowrap; }
</style>
