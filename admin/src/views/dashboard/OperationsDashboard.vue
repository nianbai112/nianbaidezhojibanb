<template>
  <div class="page-shell">
    <GlassPageHeader title="运营控制台" subtitle="实时掌握平台运营数据，智能决策，驱动业务增长">
      <template #actions><el-button :icon="Calendar">2025-05-19</el-button><el-button :icon="Refresh">刷新</el-button></template>
    </GlassPageHeader>
    <StatGrid :items="stats" />
    <div class="dashboard-grid">
      <div class="glass-card span-2"><div class="card-header"><div class="card-title">订单趋势（近7天）</div><el-select model-value="订单数" style="width:110px"><el-option label="订单数" value="订单数" /></el-select></div><div class="card-body"><div class="chart-placeholder"><div class="chart-line"></div><div class="axis">05-13　　05-14　　05-15　　05-16　　05-17　　05-18　　05-19</div></div></div></div>
      <div class="glass-card"><div class="card-header"><div class="card-title">订单来源分布</div></div><div class="card-body"><div class="donut" data-center="总订单数\A 17,892"></div><div class="legend"><p><i></i>小程序 42.35% 7,574</p><p><i></i>APP 28.41% 5,079</p><p><i></i>H5 15.32% 2,740</p></div></div></div>
      <div class="glass-card"><div class="card-header"><div class="card-title">待办事项</div><el-button link type="primary">全部(6) →</el-button></div><div class="card-body"><div class="side-list"><div class="side-item" v-for="item in todos" :key="item.title"><div class="side-left"><div class="side-icon"><el-icon><component :is="item.icon" /></el-icon></div><div><div class="name-main">{{ item.title }}</div><div class="name-sub">{{ item.desc }}</div></div></div><div class="side-num">{{ item.value }}</div></div></div></div></div>
      <div class="glass-card"><div class="card-header"><div class="card-title">区域运营排行</div></div><div class="card-body"><table class="soft-table"><tbody><tr v-for="(r,i) in regionRank" :key="r.name"><td>{{ i+1 }}</td><td><b>{{ r.name }}</b></td><td>{{ r.orders }}</td><td class="money">{{ r.gmv }}</td><td style="color:#16a34a">{{ r.growth }}</td></tr></tbody></table></div></div>
      <div class="glass-card span-2"><div class="card-header"><div class="card-title">商家销售排行（今日）</div><el-button link type="primary">更多 →</el-button></div><div class="card-body"><table class="soft-table"><tbody><tr v-for="(m,i) in merchantRank" :key="m.name"><td>{{ i+1 }}</td><td><div class="user-line"><div class="avatar store">{{ m.name.slice(0,1) }}</div><b>{{ m.name }}</b></div></td><td>{{ m.orders }} 单</td><td class="money">{{ m.gmv }}</td></tr></tbody></table></div></div>
      <div class="glass-card"><div class="card-header"><div class="card-title">快捷入口</div></div><div class="card-body"><div class="quick-grid"><button v-for="q in quick" :key="q"><el-icon><Operation /></el-icon>{{ q }}</button></div></div></div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import GlassPageHeader from '@/components/glass/GlassPageHeader.vue'
import StatGrid from '@/components/glass/StatGrid.vue'
import { Calendar, Refresh, Operation } from '@element-plus/icons-vue'
import { fetchDashboard } from '@/api/admin'

const stats = ref<any[]>([
  {label:'今日订单',value:'2,458',delta:'+12.6%',tone:'blue',icon:'Goods'}, {label:'今日GMV',value:'¥78,945.32',delta:'+18.7%',tone:'purple',icon:'Wallet'}, {label:'活跃用户',value:'12,532',delta:'+8.3%',tone:'green',icon:'User'}, {label:'待审核',value:156,delta:'-5.4%',down:true,tone:'orange',icon:'Document'}, {label:'新增商家',value:23,delta:'+21.1%',tone:'cyan',icon:'Shop'}, {label:'待处理退款',value:38,delta:'-15.2%',down:true,tone:'red',icon:'Money'}
])
const todos = [{title:'商家入驻审核',desc:'等待审核的商家申请',value:23,icon:'Shop'},{title:'商品审核',desc:'等待审核的商品',value:45,icon:'Goods'},{title:'订单异常处理',desc:'需要处理的异常订单',value:12,icon:'Warning'},{title:'用户举报',desc:'待处理的用户举报',value:8,icon:'ChatDotRound'},{title:'退款处理',desc:'待处理的退款申请',value:38,icon:'Money'}]
const regionRank = ref([{name:'东校区',orders:'4,568',gmv:'¥185,432.21',growth:'+12.6%'},{name:'西校区',orders:'3,782',gmv:'¥152,341.32',growth:'+8.3%'},{name:'南校区',orders:'2,945',gmv:'¥118,742.11',growth:'+15.7%'},{name:'北校区',orders:'2,156',gmv:'¥85,654.32',growth:'+2.1%'}])
const merchantRank = [{name:'蜜雪冰城（东校区店）',orders:256,gmv:'¥6,584.21'},{name:'塔斯汀·中国汉堡',orders:198,gmv:'¥5,432.11'},{name:'瑞幸咖啡（西校区店）',orders:176,gmv:'¥4,321.34'},{name:'杨国福麻辣烫',orders:155,gmv:'¥3,654.21'}]
const quick = ['发布公告','优惠券管理','创建活动','数据报表','用户管理','商家管理','订单查询','系统设置']

onMounted(async () => {
  try {
    const data: any = await fetchDashboard()
    const s = data.stats || {}
    stats.value = [
      {label:'今日订单', value:s.todayOrders ?? s.orderCount ?? '0', delta:'+0.0%', tone:'blue', icon:'Goods'},
      {label:'今日GMV', value:`¥${Number(s.todayGmv ?? s.gmv ?? 0).toLocaleString()}`, delta:'+0.0%', tone:'purple', icon:'Wallet'},
      {label:'活跃用户', value:s.activeUsers ?? s.userCount ?? '0', delta:'+0.0%', tone:'green', icon:'User'},
      {label:'待审核', value:s.pendingAudit ?? s.pendingCount ?? 0, delta:'待处理', tone:'orange', icon:'Document'},
      {label:'新增商家', value:s.newMerchants ?? s.merchantCount ?? 0, delta:'+0.0%', tone:'cyan', icon:'Shop'},
      {label:'待处理退款', value:s.pendingRefunds ?? 0, delta:'待处理', tone:'red', icon:'Money'}
    ]
    if (data.regions?.length) {
      regionRank.value = data.regions.slice(0, 5).map((r: any) => ({
        name: r.name || r.regionName || '-',
        orders: Number(r.orderCount || r.orders || 0).toLocaleString(),
        gmv: `¥${Number(r.gmv || r.amount || 0).toLocaleString()}`,
        growth: r.growth || '+0.0%'
      }))
    }
  } catch {
    // Dashboard keeps its designed preview data when the optional stats endpoint is unavailable.
  }
})
</script>
<style scoped lang="scss">
.dashboard-grid { display:grid; grid-template-columns:1.3fr 1fr .95fr; gap:18px; align-items:start; }
.span-2 { grid-column:span 2; }
.axis { position:absolute; left:30px; bottom:16px; color:#94a3b8; font-size:12px; }
.legend p { color:#64748b; font-weight:800; font-size:13px; }
.legend i { display:inline-block; width:8px; height:8px; border-radius:50%; background:#1f6fff; margin-right:8px; }
.quick-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:12px; }
.quick-grid button { border:0; min-height:78px; border-radius:17px; background:rgba(239,246,255,.76); color:#1f6fff; font-weight:900; display:grid; place-items:center; gap:6px; cursor:pointer; }
@media(max-width:1200px){ .dashboard-grid{ grid-template-columns:1fr; } .span-2{ grid-column:auto; } }
</style>
