<template>
  <div class="page-shell">
    <GlassPageHeader title="运营控制台" subtitle="实时掌握平台运营数据，智能决策，驱动业务增长">
      <template #actions><el-button :icon="Calendar">{{ today }}</el-button><el-button :icon="Refresh" :loading="loading" @click="loadData">刷新</el-button></template>
    </GlassPageHeader>
    <StatGrid :items="stats" />

    <section class="dashboard-primary">
      <div class="glass-card chart-main">
        <div class="card-header">
          <div class="card-title">订单趋势（近7天）</div>
          <el-tag v-if="trends.length" size="small" effect="plain">真实订单</el-tag>
        </div>
        <div class="card-body">
          <EmptyState v-if="!trends.length" description="暂无真实趋势数据" />
          <div v-else class="trend-chart">
            <div class="trend-summary">
              <div>
                <span>近 7 天订单</span>
                <b>{{ trendTotal.count }} 单</b>
              </div>
              <div>
                <span>近 7 天 GMV</span>
                <b>¥{{ trendTotal.amount.toLocaleString() }}</b>
              </div>
            </div>
            <svg class="trend-svg" viewBox="0 0 640 220" preserveAspectRatio="none" role="img">
              <defs>
                <linearGradient id="trendFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stop-color="var(--el-color-primary)" stop-opacity=".22" />
                  <stop offset="100%" stop-color="var(--el-color-primary)" stop-opacity="0" />
                </linearGradient>
              </defs>
              <path :d="trendAreaPath" fill="url(#trendFill)" />
              <polyline :points="trendPolyline" fill="none" stroke="var(--el-color-primary)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
              <g v-for="p in trendPoints" :key="p.date">
                <circle :cx="p.x" :cy="p.y" r="4.5" fill="var(--mx-card)" stroke="var(--el-color-primary)" stroke-width="3" />
              </g>
            </svg>
            <div class="trend-axis">
              <span v-for="p in trendPoints" :key="p.date">{{ p.label }}</span>
            </div>
          </div>
        </div>
      </div>
      <div class="glass-card">
        <div class="card-header"><div class="card-title">订单来源分布</div></div>
        <div class="card-body">
          <EmptyState v-if="!orderSources.length" description="暂无真实来源数据" />
          <div v-else class="source-list">
            <div v-for="s in orderSources" :key="s.name" class="source-item">
              <div class="source-row"><b>{{ s.name }}</b><span>{{ s.count }} 单</span></div>
              <el-progress :percentage="Number(s.percentage || 0)" :show-text="false" :stroke-width="8" />
              <div class="source-percent">{{ s.percentage }}%</div>
            </div>
          </div>
        </div>
      </div>
      <div class="glass-card">
        <div class="card-header"><div class="card-title">待办事项</div></div>
        <div class="card-body">
          <EmptyState v-if="!todoItems.length" description="暂无待办事项" />
          <div v-else class="side-list">
            <div class="side-item" v-for="item in todoItems" :key="item.title">
              <div class="side-left">
                <div class="side-icon"><el-icon><component :is="item.icon" /></el-icon></div>
                <div><div class="name-main">{{ item.title }}</div><div class="name-sub">{{ item.desc }}</div></div>
              </div>
              <div class="side-num">{{ item.value }}</div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="dashboard-secondary">
      <div class="glass-card">
        <div class="card-header"><div class="card-title">区域运营排行</div></div>
        <div class="card-body">
          <EmptyState v-if="!regionRank.length" description="暂无区域数据" />
          <table v-else class="soft-table"><tbody>
            <tr v-for="(r,i) in regionRank" :key="r.name">
              <td>{{ i+1 }}</td><td><b>{{ r.name }}</b></td><td>{{ r.orders }}</td><td class="money">{{ r.gmv }}</td><td style="color:var(--el-color-success)">{{ r.growth }}</td>
            </tr>
          </tbody></table>
        </div>
      </div>
      <div class="glass-card">
        <div class="card-header"><div class="card-title">商家销售排行（今日）</div></div>
        <div class="card-body">
          <EmptyState v-if="!merchantRank.length" description="暂无今日销售数据" />
          <table v-else class="soft-table"><tbody>
            <tr v-for="(m,i) in merchantRank" :key="m.name">
              <td>{{ i+1 }}</td><td><div class="user-line"><div class="avatar store">{{ m.name.slice(0,1) }}</div><b>{{ m.name }}</b></div></td>
              <td>{{ m.orders }} 单</td><td class="money">¥{{ Number(m.gmv||0).toLocaleString() }}</td>
            </tr>
          </tbody></table>
        </div>
      </div>
      <div class="glass-card">
        <div class="card-header"><div class="card-title">快捷入口</div></div>
        <div class="card-body">
          <div class="quick-grid">
            <button v-for="q in quick" :key="q" @click="goQuick(q)"><el-icon><Operation /></el-icon>{{ q }}</button>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import GlassPageHeader from '@/components/glass/GlassPageHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import StatGrid from '@/components/glass/StatGrid.vue'
import { Calendar, Refresh, Operation, Shop, Goods, Warning, ChatDotRound, Money, User, Document } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { fetchDashboard } from '@/api/admin'

const router = useRouter()
const loading = ref(false)
const today = new Date().toISOString().slice(0, 10)

const stats = ref<any[]>([
  {label:'今日订单',value:0,delta:'-',tone:'blue',icon:'Goods'},
  {label:'今日GMV',value:'¥0',delta:'-',tone:'purple',icon:'Wallet'},
  {label:'活跃用户',value:0,delta:'-',tone:'green',icon:'User'},
  {label:'待审核',value:0,delta:'-',tone:'orange',icon:'Document'},
  {label:'新增商家',value:0,delta:'-',tone:'cyan',icon:'Shop'},
  {label:'待处理退款',value:0,delta:'-',tone:'red',icon:'Money'}
])
const trends = ref<any[]>([])
const orderSources = ref<any[]>([])
const todoItems = ref<any[]>([])
const regionRank = ref<any[]>([])
const merchantRank = ref<any[]>([])

const trendTotal = computed(() => ({
  count: trends.value.reduce((sum, item) => sum + Number(item.count || 0), 0),
  amount: trends.value.reduce((sum, item) => sum + Number(item.amount || 0), 0)
}))

const trendPoints = computed(() => {
  const rows = trends.value.slice(0, 7)
  const max = Math.max(1, ...rows.map((item) => Number(item.count || 0)))
  const width = 640
  const height = 220
  const paddingX = 24
  const paddingY = 24
  const innerW = width - paddingX * 2
  const innerH = height - paddingY * 2
  return rows.map((item, index) => {
    const value = Number(item.count || 0)
    const x = paddingX + (rows.length === 1 ? innerW / 2 : (innerW / (rows.length - 1)) * index)
    const y = paddingY + innerH - (value / max) * innerH
    return {
      x,
      y,
      date: item.date,
      label: String(item.date || '').slice(5),
      value
    }
  })
})

const trendPolyline = computed(() => trendPoints.value.map((p) => `${p.x},${p.y}`).join(' '))
const trendAreaPath = computed(() => {
  const points = trendPoints.value
  if (!points.length) return ''
  const first = points[0]
  const last = points[points.length - 1]
  return `M ${first.x} 220 L ${points.map((p) => `${p.x} ${p.y}`).join(' L ')} L ${last.x} 220 Z`
})

const quick = ['优惠券管理','创建活动','用户管理','商家管理','订单查询','系统设置']

function goQuick(name: string) {
  const map: Record<string, string> = { '优惠券管理':'/marketing/coupons', '创建活动':'/marketing/campaigns', '用户管理':'/user/list', '商家管理':'/merchant/list', '订单查询':'/order/center', '系统设置':'/system/settings' }
  router.push(map[name] || '/dashboard')
}

async function loadData() {
  loading.value = true
  try {
    const data: any = await fetchDashboard()
    const d = data.stats || {}
    stats.value = [
      {label:'今日订单', value:d.todayOrders ?? 0, delta:'-', tone:'blue', icon:'Goods'},
      {label:'今日GMV', value:`¥${Number(d.todayGmv ?? 0).toLocaleString()}`, delta:'-', tone:'purple', icon:'Wallet'},
      {label:'活跃用户', value:d.activeUsers ?? 0, delta:'-', tone:'green', icon:'User'},
      {label:'待审核', value:d.pendingCount ?? 0, delta:'-', tone:'orange', icon:'Document'},
      {label:'新增商家', value:d.newMerchants ?? 0, delta:'-', tone:'cyan', icon:'Shop'},
      {label:'待处理退款', value:d.pendingRefunds ?? 0, delta:'-', tone:'red', icon:'Money'}
    ]
    trends.value = (data.trends || []).slice(0, 7)
    regionRank.value = (data.regions || []).slice(0, 5).map((r: any) => ({
      name: r.name || r.regionName || '-',
      orders: Number(r.orderCount || r.orders || 0).toLocaleString(),
      gmv: `¥${Number(r.gmv || r.amount || 0).toLocaleString()}`,
      growth: r.growth || '-'
    }))
    orderSources.value = (data.orderSources?.sources || []).slice(0, 4)
    const todos = data.todos
    if (todos) {
      const items: any[] = []
      if (todos.pendingCerts > 0) items.push({ title: '学生认证审核', desc: '等待审核的学生认证', value: todos.pendingCerts, icon: User })
      if (todos.pendingMerchants > 0) items.push({ title: '商家入驻审核', desc: '等待审核的商家申请', value: todos.pendingMerchants, icon: Shop })
      if (todos.pendingProducts > 0) items.push({ title: '商品待审核', desc: '等待审核的商品', value: todos.pendingProducts, icon: Goods })
      if (todos.abnormalOrders > 0) items.push({ title: '异常订单', desc: '需要处理的异常订单', value: todos.abnormalOrders, icon: Warning })
      if (todos.pendingReports > 0) items.push({ title: '用户举报', desc: '待处理的用户举报', value: todos.pendingReports, icon: ChatDotRound })
      if (todos.pendingRefunds > 0) items.push({ title: '退款待处理', desc: '待处理的退款申请', value: todos.pendingRefunds, icon: Money })
      if (todos.pendingWithdraws > 0) items.push({ title: '提现审核', desc: '等待财务审核的提现', value: todos.pendingWithdraws, icon: Money })
      if (todos.pendingPosts > 0) items.push({ title: '内容待审', desc: '等待审核的帖子内容', value: todos.pendingPosts, icon: Document })
      if (todos.pendingComments > 0) items.push({ title: '评论待审', desc: '等待审核的评论内容', value: todos.pendingComments, icon: ChatDotRound })
      todoItems.value = items
    }
    const rank = data.merchantRank?.rank || []
    merchantRank.value = rank.map((m: any) => ({ name: m.name, orders: m.orders || 0, gmv: m.gmv || 0 }))
  } catch (e: any) {
    ElMessage.error(e?.message || '加载仪表盘数据失败')
    stats.value = [
      {label:'今日订单',value:0,delta:'-',tone:'blue',icon:'Goods'},
      {label:'今日GMV',value:'¥0',delta:'-',tone:'purple',icon:'Wallet'},
      {label:'活跃用户',value:0,delta:'-',tone:'green',icon:'User'},
      {label:'待审核',value:0,delta:'-',tone:'orange',icon:'Document'},
      {label:'新增商家',value:0,delta:'-',tone:'cyan',icon:'Shop'},
      {label:'待处理退款',value:0,delta:'-',tone:'red',icon:'Money'}
    ]
    trends.value = []
    regionRank.value = []
    orderSources.value = []
    todoItems.value = []
    merchantRank.value = []
  } finally {
    loading.value = false
  }
}

onMounted(() => loadData())
</script>
<style scoped lang="scss">
.dashboard-primary {
  display: grid;
  grid-template-columns: 1.4fr 1fr 1fr;
  gap: 24px;
  align-items: start;
}
.chart-main { grid-column: span 1; }
.dashboard-secondary {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
  align-items: start;
}
.trend-chart { min-height: 282px; }
.trend-summary { display:flex; gap:14px; margin-bottom:12px; }
.trend-summary div { flex:1; padding:12px 14px; border-radius:14px; background:var(--mx-soft); border:1px solid var(--mx-border); }
.trend-summary span { display:block; color:var(--mx-sub); font-size:12px; font-weight:850; }
.trend-summary b { display:block; margin-top:6px; color:var(--mx-text); font-size:22px; font-weight:950; }
.trend-svg { width:100%; height:220px; display:block; border-radius: 14px; background:var(--mx-soft); border:1px solid var(--mx-border); }
.trend-axis { display:grid; grid-template-columns:repeat(7,1fr); gap:6px; margin-top:10px; color:var(--mx-sub); font-size:12px; font-weight:800; text-align:center; }
.source-list { display:grid; gap:14px; }
.source-item { padding:12px; border-radius:14px; background:var(--mx-soft); border:1px solid var(--mx-border); }
.source-row { display:flex; justify-content:space-between; gap:10px; margin-bottom:8px; color:var(--mx-sub); font-size:13px; }
.source-row b { color:var(--mx-text); }
.source-percent { margin-top:6px; color:var(--mx-sub); font-size:12px; font-weight:900; }
.quick-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:12px; }
.quick-grid button { border:0; min-height:68px; border-radius: 14px; background:var(--mx-hover); color:var(--el-color-primary); font-weight:900; display:grid; place-items:center; gap:6px; cursor:pointer; transition:.15s ease; }
.quick-grid button:hover { background:var(--el-color-primary-light-8); }
@media(max-width:1200px){
  .dashboard-primary{ grid-template-columns:1fr; }
  .dashboard-secondary{ grid-template-columns:1fr; }
}
@media(min-width:1201px) and (max-width:1400px){
  .dashboard-primary{ grid-template-columns:1.4fr 1fr; }
  .dashboard-primary .glass-card:last-child{ grid-column:1/-1; }
  .dashboard-secondary{ grid-template-columns:1fr 1fr; }
  .dashboard-secondary .glass-card:last-child{ grid-column:1/-1; }
}
</style>
