<template>
  <div class="page-shell dash">
    <GlassPageHeader title="运营控制台" subtitle="实时掌握平台运营脉搏，待办优先，数据驱动决策">
      <template #actions>
        <el-button :icon="Calendar">{{ today }}</el-button>
        <el-button type="primary" :icon="Refresh" :loading="loading" @click="loadData">刷新</el-button>
      </template>
    </GlassPageHeader>

    <!-- 核心 KPI -->
    <section class="kpi-hero">
      <div v-for="k in heroCards" :key="k.label" class="glass-card hero-card">
        <div class="hero-top">
          <span class="hero-label">{{ k.label }}</span>
          <span class="hero-icon" :class="`tone-${k.tone}`"><el-icon :size="18"><component :is="k.icon" /></el-icon></span>
        </div>
        <div class="hero-value">{{ k.value }}</div>
        <div class="hero-foot">
          <template v-if="k.delta !== null">
            <span class="delta-chip" :class="k.deltaDir">
              <el-icon v-if="k.deltaDir === 'up'"><Top /></el-icon>
              <el-icon v-else-if="k.deltaDir === 'down'"><Bottom /></el-icon>
              {{ k.deltaText }}
            </span>
            <span class="hero-sub">较昨日</span>
          </template>
          <span v-else class="hero-sub">{{ k.sub }}</span>
        </div>
        <ChartBox v-if="k.spark.length > 1" class="hero-spark" :option="sparkOption(k.spark, k.color)" :height="42" />
      </div>
    </section>

    <!-- 平台累计 -->
    <section class="glass-card total-strip">
      <div v-for="t in totals" :key="t.label" class="total-item">
        <span class="t-value">{{ t.value }}</span>
        <span class="t-label">{{ t.label }}</span>
      </div>
    </section>

    <!-- 待办行动区 -->
    <section class="glass-card">
      <div class="card-header">
        <div class="card-title">待办事项</div>
        <el-tag :type="todoTotal ? 'danger' : 'success'" effect="light" round>
          {{ todoTotal ? `${todoTotal} 项待处理` : '全部处理完毕' }}
        </el-tag>
      </div>
      <div class="card-body">
        <div class="todo-grid">
          <button
            v-for="t in todoCards"
            :key="t.key"
            class="todo-chip"
            :class="{ active: t.count > 0 }"
            @click="router.push(t.route)"
          >
            <span class="todo-icon"><el-icon :size="16"><component :is="t.icon" /></el-icon></span>
            <span class="todo-label">{{ t.label }}</span>
            <span class="todo-count">{{ t.count }}</span>
            <el-icon class="todo-arrow" :size="13"><ArrowRight /></el-icon>
          </button>
        </div>
      </div>
    </section>

    <!-- 趋势 + 来源 -->
    <section class="dash-main">
      <div class="glass-card">
        <div class="card-header">
          <div class="card-title">经营趋势（近7天）</div>
          <div class="trend-total">
            订单 <b>{{ trendTotal.orders.toLocaleString() }}</b>
            <i />
            GMV <b>¥{{ trendTotal.gmv.toLocaleString() }}</b>
          </div>
        </div>
        <div class="card-body">
          <EmptyState v-if="!trends.length" description="暂无趋势数据" />
          <ChartBox v-else :option="trendOption" :height="320" />
        </div>
      </div>
      <div class="glass-card">
        <div class="card-header"><div class="card-title">订单来源分布</div></div>
        <div class="card-body">
          <EmptyState v-if="!orderSources.length" description="暂无来源数据" />
          <template v-else>
            <ChartBox :option="sourceOption" :height="210" />
            <div class="source-legend">
              <div v-for="(s, i) in orderSources" :key="s.name" class="sl-item">
                <span class="sl-dot" :style="{ background: PALETTE[i % PALETTE.length] }" />
                <span class="sl-name">{{ s.name }}</span>
                <span class="sl-count">{{ s.count }} 单</span>
                <b>{{ s.percentage }}%</b>
              </div>
            </div>
          </template>
        </div>
      </div>
    </section>

    <!-- 排行 -->
    <section class="dash-rank">
      <div class="glass-card">
        <div class="card-header"><div class="card-title">区域运营排行</div></div>
        <div class="card-body">
          <EmptyState v-if="!regionRank.length" description="暂无区域数据" />
          <div v-else class="region-list">
            <div v-for="(r, i) in regionRank" :key="r.name" class="region-row">
              <span class="rank-no" :class="{ top: i < 3 }">{{ i + 1 }}</span>
              <div class="region-main">
                <div class="region-head">
                  <b>{{ r.name }}</b>
                  <span class="region-orders">{{ r.orders.toLocaleString() }} 单</span>
                </div>
                <div class="rank-bar"><i :style="{ width: r.pct + '%' }" /></div>
                <div class="region-sub">商家 {{ r.merchants }} · 用户 {{ r.users.toLocaleString() }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="glass-card">
        <div class="card-header"><div class="card-title">商家销售排行（今日）</div></div>
        <div class="card-body">
          <EmptyState v-if="!merchantRank.length" description="暂无今日销售数据" />
          <div v-else class="merchant-list">
            <div v-for="(m, i) in merchantRank" :key="m.name" class="merchant-row">
              <span class="rank-no" :class="[`medal-${i + 1}`, { top: i < 3 }]">{{ i + 1 }}</span>
              <span class="avatar store">{{ m.name.slice(0, 1) }}</span>
              <div class="merchant-main">
                <div class="name-main">{{ m.name }}</div>
                <div class="name-sub">{{ m.orders }} 单</div>
              </div>
              <b class="merchant-gmv">¥{{ Number(m.gmv || 0).toLocaleString() }}</b>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import GlassPageHeader from '@/components/glass/GlassPageHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import ChartBox from '@/components/common/ChartBox.vue'
import {
  ArrowRight, Bottom, Calendar, ChatDotRound, ChatLineSquare, Document,
  Goods, Money, Refresh, Shop, Timer, Top, User, UserFilled, Wallet, Warning
} from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import type { EChartsCoreOption } from 'echarts/core'
import { fetchDashboard } from '@/api/admin'

const PALETTE = ['#2563eb', '#10b981', '#f59e0b', '#7c3aed', '#0ea5e9', '#ef4444']

const router = useRouter()
const loading = ref(false)
const today = new Date().toISOString().slice(0, 10)

interface TrendDay { date: string; orders: number; gmv: number; users: number }

const raw = ref<any>({})
const trends = ref<TrendDay[]>([])
const orderSources = ref<any[]>([])
const regionRank = ref<any[]>([])
const merchantRank = ref<any[]>([])

const fen2yuan = (v: any) => Number(v || 0) / 100
const fmtMoney = (v: number) => {
  if (v >= 10000) return (v / 10000).toFixed(v >= 100000 ? 0 : 1) + 'w'
  return v.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
}

function deltaOf(growth: any) {
  const g = Number(growth || 0)
  return {
    dir: g > 0 ? 'up' : g < 0 ? 'down' : 'flat',
    text: `${g > 0 ? '+' : ''}${g}%`
  }
}

// ============ KPI 主卡 ============
const heroCards = computed(() => {
  const d = raw.value || {}
  const sparkOf = (pick: (t: TrendDay) => number) => trends.value.map(pick)
  const gmv = deltaOf(d.gmvGrowth)
  const ord = deltaOf(d.orderGrowth)
  const usr = deltaOf(d.userGrowth)
  return [
    {
      label: '今日GMV', value: `¥${fmtMoney(fen2yuan(d.todayGmv))}`,
      delta: d.gmvGrowth ?? 0, deltaDir: gmv.dir, deltaText: gmv.text,
      icon: Wallet, tone: 'purple', color: '#7c3aed', spark: sparkOf((t) => t.gmv)
    },
    {
      label: '今日订单', value: Number(d.todayOrders ?? 0).toLocaleString(),
      delta: d.orderGrowth ?? 0, deltaDir: ord.dir, deltaText: ord.text,
      icon: Goods, tone: 'blue', color: '#2563eb', spark: sparkOf((t) => t.orders)
    },
    {
      label: '今日活跃用户', value: Number(d.todayActiveUsers ?? 0).toLocaleString(),
      delta: null, sub: `近7日活跃 ${Number(d.dauEstimate ?? 0).toLocaleString()}`,
      icon: User, tone: 'green', color: '#10b981', spark: sparkOf((t) => t.users)
    },
    {
      label: '今日新增用户', value: Number(d.todayNewUsers ?? 0).toLocaleString(),
      delta: d.userGrowth ?? 0, deltaDir: usr.dir, deltaText: usr.text,
      icon: UserFilled, tone: 'orange', color: '#f59e0b', spark: sparkOf((t) => t.users)
    }
  ]
})

const totals = computed(() => {
  const d = raw.value || {}
  return [
    { label: '累计GMV', value: `¥${fmtMoney(fen2yuan(d.totalGmv))}` },
    { label: '总订单', value: Number(d.totalOrders ?? 0).toLocaleString() },
    { label: '总用户', value: Number(d.totalUsers ?? 0).toLocaleString() },
    { label: '活跃商家', value: Number(d.activeMerchantCount ?? 0).toLocaleString() },
    { label: '覆盖区域', value: Number(d.regionCount ?? 0).toLocaleString() }
  ]
})

// ============ 待办 ============
const TODO_DEFS = [
  { key: 'pendingRefunds', label: '退款售后', route: '/merchant/refunds', icon: Money },
  { key: 'pendingWithdraws', label: '提现审核', route: '/finance/withdrawals', icon: Wallet },
  { key: 'pendingOrderAppeals', label: '订单申诉', route: '/order/appeals', icon: ChatLineSquare },
  { key: 'abnormalOrders', label: '异常订单', route: '/order/center', icon: Warning },
  { key: 'takeawayFulfillmentAlerts', label: '履约预警', route: '/merchant/orders', icon: Timer },
  { key: 'contentAudit', label: '内容审核', route: '/content/audit', icon: Document },
  { key: 'entryAudit', label: '入驻与认证', route: '/merchant/audit', icon: Shop }
]

const todoCards = ref(TODO_DEFS.map((d) => ({ ...d, count: 0 })))
const todoTotal = computed(() => todoCards.value.reduce((s, t) => s + t.count, 0))

// ============ 图表 ============
const trendTotal = computed(() => ({
  orders: trends.value.reduce((s, t) => s + t.orders, 0),
  gmv: Math.round(trends.value.reduce((s, t) => s + t.gmv, 0) * 100) / 100
}))

const trendOption = computed<EChartsCoreOption>(() => ({
  color: ['#2563eb', '#7c3aed'],
  tooltip: {
    trigger: 'axis',
    borderColor: 'var(--mx-border)' as any,
    textStyle: { fontSize: 12 }
  },
  legend: { data: ['订单量', 'GMV(¥)'], right: 0, top: 0, itemWidth: 14, itemHeight: 8, textStyle: { color: '#526174', fontSize: 12 } },
  grid: { left: 4, right: 8, top: 36, bottom: 0, containLabel: true },
  xAxis: {
    type: 'category',
    data: trends.value.map((t) => t.date),
    axisLine: { lineStyle: { color: '#e3e9f2' } },
    axisTick: { show: false },
    axisLabel: { color: '#7d8ba3', fontSize: 12 }
  },
  yAxis: [
    {
      type: 'value', name: '订单', nameTextStyle: { color: '#7d8ba3', fontSize: 11 },
      splitLine: { lineStyle: { color: '#eef2f8', type: 'dashed' } },
      axisLabel: { color: '#7d8ba3', fontSize: 11 }
    },
    {
      type: 'value', name: 'GMV', nameTextStyle: { color: '#7d8ba3', fontSize: 11 },
      splitLine: { show: false },
      axisLabel: { color: '#7d8ba3', fontSize: 11 }
    }
  ],
  series: [
    {
      name: '订单量', type: 'bar', data: trends.value.map((t) => t.orders),
      barWidth: '42%',
      itemStyle: {
        borderRadius: [5, 5, 0, 0],
        color: {
          type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: '#5b8def' },
            { offset: 1, color: '#2563eb' }
          ]
        }
      }
    },
    {
      name: 'GMV(¥)', type: 'line', yAxisIndex: 1, smooth: true,
      data: trends.value.map((t) => Math.round(t.gmv * 100) / 100),
      symbol: 'circle', symbolSize: 7,
      lineStyle: { width: 3 },
      areaStyle: {
        color: {
          type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(124,58,237,.16)' },
            { offset: 1, color: 'rgba(124,58,237,0)' }
          ]
        }
      }
    }
  ]
}))

const sourceOption = computed<EChartsCoreOption>(() => {
  const total = orderSources.value.reduce((s, x) => s + Number(x.count || 0), 0)
  return {
    color: PALETTE,
    tooltip: { trigger: 'item', formatter: '{b}: {c} 单 ({d}%)', textStyle: { fontSize: 12 } },
    title: {
      text: total.toLocaleString(), subtext: '总订单',
      left: 'center', top: '36%',
      textStyle: { fontSize: 24, fontWeight: 700, color: '#0f172a' },
      subtextStyle: { fontSize: 12, color: '#7d8ba3' }
    },
    series: [
      {
        type: 'pie', radius: ['62%', '82%'], center: ['50%', '46%'],
        avoidLabelOverlap: true,
        itemStyle: { borderColor: '#fff', borderWidth: 3, borderRadius: 6 },
        label: { show: false },
        emphasis: { scaleSize: 6 },
        data: orderSources.value.map((s) => ({ name: s.name, value: s.count }))
      }
    ]
  }
})

function sparkOption(data: number[], color: string): EChartsCoreOption {
  return {
    grid: { left: 0, right: 0, top: 4, bottom: 0 },
    xAxis: { type: 'category', show: false, boundaryGap: false, data: data.map((_, i) => i) },
    yAxis: { type: 'value', show: false, min: 0 },
    tooltip: { show: false },
    series: [
      {
        type: 'line', data, smooth: true, symbol: 'none',
        lineStyle: { width: 2, color },
        areaStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: color + '33' },
              { offset: 1, color: color + '00' }
            ]
          }
        }
      }
    ]
  }
}

// ============ 数据加载 ============
async function loadData() {
  loading.value = true
  try {
    const data: any = await fetchDashboard()
    raw.value = data.stats || {}
    // 后端趋势字段为 { date, users, orders, gmv(分), posts }
    trends.value = (data.trends || []).slice(0, 7).map((t: any) => ({
      date: String(t.date || ''),
      orders: Number(t.orders ?? t.count ?? 0),
      gmv: fen2yuan(t.gmv ?? t.amount ?? 0),
      users: Number(t.users ?? 0)
    }))
    orderSources.value = (data.orderSources?.sources || []).slice(0, 5)
    merchantRank.value = (data.merchantRank?.rank || []).slice(0, 6)

    const regions = (data.regions || []).slice(0, 5).map((r: any) => ({
      name: r.name || r.regionName || '-',
      orders: Number(r.orderCount || r.orders || 0),
      merchants: Number(r.merchantCount || 0),
      users: Number(r.userCount || 0)
    }))
    const maxOrders = Math.max(1, ...regions.map((r: any) => r.orders))
    regionRank.value = regions.map((r: any) => ({ ...r, pct: Math.max(4, Math.round((r.orders / maxOrders) * 100)) }))

    const todos = data.todos || {}
    const counts: Record<string, number> = {
      ...todos,
      contentAudit: Number(todos.pendingPosts || 0) + Number(todos.pendingComments || 0) + Number(todos.pendingReports || 0),
      entryAudit: Number(todos.pendingCerts || 0) + Number(todos.pendingMerchants || 0) + Number(todos.pendingProducts || 0)
    }
    todoCards.value = TODO_DEFS.map((d) => ({ ...d, count: Number(counts[d.key] || 0) }))
  } catch (e: any) {
    ElMessage.error(e?.message || '加载仪表盘数据失败')
    raw.value = {}
    trends.value = []
    orderSources.value = []
    regionRank.value = []
    merchantRank.value = []
    todoCards.value = TODO_DEFS.map((d) => ({ ...d, count: 0 }))
  } finally {
    loading.value = false
  }
}

onMounted(() => loadData())
</script>

<style scoped lang="scss">
/* ===== KPI 主卡 ===== */
.kpi-hero {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}
.hero-card {
  padding: 18px 18px 10px;
  display: flex;
  flex-direction: column;
  transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease;
}
.hero-card:hover {
  transform: translateY(-2px);
  border-color: var(--el-color-primary-light-7);
  box-shadow: var(--mx-shadow);
}
.hero-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.hero-label {
  color: var(--mx-sub);
  font-size: 13.5px;
  font-weight: 600;
}
.hero-icon {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}
.hero-icon.tone-purple { color: #7c3aed; background: #f1ebfd; }
.hero-icon.tone-green { color: var(--el-color-success); background: var(--el-color-success-light-9); }
.hero-icon.tone-orange { color: var(--el-color-warning); background: var(--el-color-warning-light-9); }
.hero-value {
  margin-top: 10px;
  font-size: 30px;
  line-height: 1.15;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: -.5px;
}
.hero-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  min-height: 22px;
}
.delta-chip {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  color: var(--mx-sub);
  background: var(--mx-soft);
}
.delta-chip.up { color: var(--el-color-success); background: var(--el-color-success-light-9); }
.delta-chip.down { color: var(--el-color-danger); background: var(--el-color-danger-light-9); }
.hero-sub {
  color: var(--mx-muted);
  font-size: 12px;
}
.hero-spark {
  margin: 8px -6px 0;
}

/* ===== 平台累计条 ===== */
.total-strip {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  padding: 14px 18px;
}
.total-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  align-items: center;
  position: relative;
}
.total-item + .total-item::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 1px;
  height: 26px;
  background: var(--mx-border);
}
.t-value {
  font-size: 18px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.t-label {
  color: var(--mx-muted);
  font-size: 12px;
}

/* ===== 待办 ===== */
.todo-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 10px;
}
.todo-chip {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid var(--mx-border);
  border-radius: 12px;
  background: var(--mx-soft);
  cursor: pointer;
  font-size: 13.5px;
  color: var(--mx-sub);
  transition: border-color .15s ease, background .15s ease, transform .15s ease;
}
.todo-chip:hover {
  transform: translateY(-1px);
  border-color: var(--el-color-primary-light-7);
  background: var(--mx-hover);
}
.todo-icon {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  color: var(--mx-muted);
  background: #fff;
  border: 1px solid var(--mx-border);
  flex: 0 0 auto;
}
.todo-label { font-weight: 600; }
.todo-count {
  margin-left: auto;
  font-weight: 700;
  font-size: 15px;
  font-variant-numeric: tabular-nums;
  color: var(--mx-muted);
}
.todo-arrow { color: var(--mx-muted); opacity: .6; }
.todo-chip.active {
  border-color: var(--el-color-danger-light-7);
  background: var(--el-color-danger-light-9);
  color: var(--mx-text);
}
.todo-chip.active .todo-icon {
  color: var(--el-color-danger);
  border-color: var(--el-color-danger-light-7);
  background: #fff;
}
.todo-chip.active .todo-count { color: var(--el-color-danger); }
.todo-chip.active .todo-arrow { color: var(--el-color-danger); opacity: 1; }

/* ===== 主图区 ===== */
.dash-main {
  display: grid;
  grid-template-columns: 1.7fr 1fr;
  gap: 16px;
  align-items: stretch;
}
.trend-total {
  color: var(--mx-sub);
  font-size: 12.5px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.trend-total b {
  color: var(--mx-text);
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}
.trend-total i {
  width: 1px;
  height: 12px;
  background: var(--mx-border-strong);
}

/* ===== 来源图例 ===== */
.source-legend {
  margin-top: 8px;
  display: grid;
  gap: 8px;
}
.sl-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  color: var(--mx-sub);
}
.sl-dot {
  width: 8px;
  height: 8px;
  border-radius: 3px;
  flex: 0 0 auto;
}
.sl-name { font-weight: 600; color: var(--mx-text); }
.sl-count { margin-left: auto; font-variant-numeric: tabular-nums; }
.sl-item b {
  min-width: 46px;
  text-align: right;
  color: var(--mx-text);
  font-variant-numeric: tabular-nums;
}

/* ===== 排行 ===== */
.dash-rank {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  align-items: start;
}
.rank-no {
  width: 24px;
  height: 24px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  font-size: 12px;
  font-weight: 800;
  color: var(--mx-muted);
  background: var(--mx-soft);
  flex: 0 0 auto;
}
.rank-no.top { color: #fff; background: var(--el-color-primary); }
.rank-no.medal-1 { background: #f59e0b; }
.rank-no.medal-2 { background: #94a3b8; }
.rank-no.medal-3 { background: #d08b4e; }

.region-list { display: grid; gap: 14px; }
.region-row { display: flex; gap: 12px; align-items: flex-start; }
.region-main { flex: 1; min-width: 0; }
.region-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 6px;
}
.region-head b { font-size: 14px; }
.region-orders {
  color: var(--mx-text);
  font-weight: 700;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}
.rank-bar {
  height: 6px;
  border-radius: 999px;
  background: var(--mx-soft);
  overflow: hidden;
}
.rank-bar i {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #5b8def, #2563eb);
  transition: width .4s ease;
}
.region-sub {
  margin-top: 5px;
  color: var(--mx-muted);
  font-size: 12px;
}

.merchant-list { display: grid; gap: 4px; }
.merchant-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 8px;
  border-radius: 10px;
  transition: background .15s ease;
}
.merchant-row:hover { background: var(--mx-hover); }
.merchant-main { flex: 1; min-width: 0; }
.merchant-gmv {
  font-size: 14px;
  font-variant-numeric: tabular-nums;
  color: var(--mx-text);
}

/* ===== 响应式 ===== */
@media (max-width: 1400px) {
  .kpi-hero { grid-template-columns: repeat(2, 1fr); }
  .dash-main { grid-template-columns: 1fr; }
}
@media (max-width: 980px) {
  .kpi-hero { grid-template-columns: 1fr; }
  .total-strip { grid-template-columns: repeat(2, 1fr); gap: 12px; }
  .total-item + .total-item::before { display: none; }
  .dash-rank { grid-template-columns: 1fr; }
}
</style>
