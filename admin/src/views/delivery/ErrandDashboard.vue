<template>
  <div class="page-shell errand-dashboard">
    <PageHeader
      title="跑腿代拿工作台"
      subtitle="统一查看代取快递、代寄快递、外卖代拿和万能任务的服务状态"
      icon="Van"
    >
      <template #actions>
        <el-select v-model="selectedRegionId" placeholder="全部区域" clearable filterable class="region-select" @change="loadAll">
          <el-option v-for="region in regions" :key="region.id" :label="region.name" :value="region.id" />
        </el-select>
        <el-button :loading="loading" @click="loadAll">刷新</el-button>
        <el-button type="primary" @click="$router.push('/errand/orders')">查看订单</el-button>
      </template>
    </PageHeader>

    <div class="metric-grid">
      <div v-for="item in metrics" :key="item.label" class="metric-card">
        <div class="metric-icon" :class="item.tone">
          <el-icon><component :is="item.icon" /></el-icon>
        </div>
        <div>
          <p>{{ item.label }}</p>
          <strong>{{ item.value }}</strong>
          <span>{{ item.hint }}</span>
        </div>
      </div>
    </div>

    <div class="ops-strip">
      <div>
        <p>服务开关</p>
        <strong>{{ feeConfig.isOpen ? '正在接单' : '已关闭' }}</strong>
      </div>
      <el-switch
        v-model="feeConfig.isOpen"
        active-text="开放"
        inactive-text="关闭"
        :loading="savingSwitch"
        @change="saveServiceSwitch"
      />
      <div>
        <p>基础费用</p>
        <strong>¥{{ money(feeConfig.basePrice) }}</strong>
      </div>
      <div>
        <p>取件点</p>
        <strong>{{ stats.pickupPointCount || 0 }} 个</strong>
      </div>
      <div>
        <p>物品规格</p>
        <strong>{{ stats.itemSizeCount || 0 }} 个</strong>
      </div>
    </div>

    <div class="content-grid">
      <el-card class="panel-card" shadow="never">
        <template #header>
          <div class="card-title">
            <span>近 7 天订单趋势</span>
            <small>来自 errand_orders</small>
          </div>
        </template>
        <div v-if="trends.length" class="trend-list">
          <div v-for="item in trends" :key="item.date" class="trend-row">
            <span>{{ item.date.slice(5) }}</span>
            <div class="trend-bar">
              <i :style="{ width: trendWidth(item.count) }"></i>
            </div>
            <strong>{{ item.count }} 单</strong>
            <em>¥{{ money(item.income) }}</em>
          </div>
        </div>
        <el-empty v-else description="暂无趋势数据" />
      </el-card>

      <el-card class="panel-card" shadow="never">
        <template #header>
          <div class="card-title">
            <span>服务类型分布</span>
            <small>运营判断入口是否冷启动</small>
          </div>
        </template>
        <div class="type-list">
          <div v-for="item in typeRows" :key="item.type" class="type-row">
            <span>{{ labelOf(errandTypeOptions, item.type) }}</span>
            <strong>{{ item.count }} 单</strong>
            <em>¥{{ money(item.amount) }}</em>
          </div>
          <el-empty v-if="!typeRows.length" description="暂无服务类型数据" />
        </div>
      </el-card>

      <el-card class="panel-card quick-card" shadow="never">
        <template #header>
          <div class="card-title">
            <span>运营入口</span>
            <small>配置好后小程序端才像一个完整服务</small>
          </div>
        </template>
        <div class="quick-grid">
          <button @click="$router.push('/errand/config')">计费与页面</button>
          <button @click="$router.push('/errand/pickup-points')">取件点管理</button>
          <button @click="$router.push('/errand/item-sizes')">物品大小</button>
          <button @click="$router.push('/errand/riders')">骑手审核</button>
        </div>
      </el-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import PageHeader from '@/components/common/PageHeader.vue'
import { fetchRegions } from '@/api/admin'
import {
  errandTypeOptions,
  fetchErrandFeeConfig,
  fetchErrandStats,
  labelOf,
  saveErrandFeeConfig,
} from '@/api/errand'

const regions = ref<any[]>([])
const selectedRegionId = ref('')
const loading = ref(false)
const savingSwitch = ref(false)
const stats = ref<any>({})
const feeConfig = ref<any>({ isOpen: true, basePrice: 0 })

const trends = computed<any[]>(() => Array.isArray(stats.value.trends) ? stats.value.trends : [])
const typeRows = computed<any[]>(() => Array.isArray(stats.value.serviceTypes) ? stats.value.serviceTypes : [])
const maxTrendCount = computed(() => Math.max(1, ...trends.value.map(item => Number(item.count || 0))))

const metrics = computed(() => [
  { label: '今日订单', value: stats.value.todayOrders || 0, hint: `今日收入 ¥${money(stats.value.todayIncome)}`, icon: 'Tickets', tone: 'blue' },
  { label: '待接订单', value: stats.value.waitingOrders || 0, hint: '需要骑手接单', icon: 'Clock', tone: 'orange' },
  { label: '进行中', value: stats.value.workingOrders || 0, hint: '已接单/配送中', icon: 'Position', tone: 'cyan' },
  { label: '在线骑手', value: `${stats.value.activeRiders || 0}/${stats.value.allRiders || 0}`, hint: '在线 / 全部骑手', icon: 'User', tone: 'green' },
  { label: '完成率', value: `${stats.value.completionRate || 0}%`, hint: `${stats.value.completedOrders || 0} 单完成`, icon: 'CircleCheck', tone: 'purple' },
  { label: '累计收入', value: `¥${money(stats.value.totalIncome)}`, hint: `${stats.value.totalOrders || 0} 单累计`, icon: 'Money', tone: 'red' },
])

function money(value: any) {
  const n = Number(value || 0)
  return Number.isFinite(n) ? n.toFixed(2) : '0.00'
}

function trendWidth(count: any) {
  return `${Math.max(6, (Number(count || 0) / maxTrendCount.value) * 100)}%`
}

async function loadRegions() {
  regions.value = await fetchRegions()
  if (!selectedRegionId.value) selectedRegionId.value = regions.value[0]?.id || ''
}

async function loadAll() {
  loading.value = true
  try {
    await loadRegions()
    const params = selectedRegionId.value ? { regionId: selectedRegionId.value } : {}
    const [statsData, feeData] = await Promise.all([
      fetchErrandStats(params),
      fetchErrandFeeConfig(selectedRegionId.value),
    ])
    stats.value = statsData || {}
    feeConfig.value = { ...feeConfig.value, ...(feeData || {}) }
  } catch (e: any) {
    ElMessage.error(e?.message || '加载跑腿工作台失败')
  } finally {
    loading.value = false
  }
}

async function saveServiceSwitch() {
  if (!selectedRegionId.value) {
    ElMessage.warning('请先选择区域')
    return
  }
  savingSwitch.value = true
  try {
    await saveErrandFeeConfig(selectedRegionId.value, feeConfig.value)
    ElMessage.success(feeConfig.value.isOpen ? '已开放跑腿接单' : '已关闭跑腿接单')
  } catch (e: any) {
    ElMessage.error(e?.message || '保存服务开关失败')
  } finally {
    savingSwitch.value = false
  }
}

onMounted(loadAll)
</script>

<style scoped>
.errand-dashboard {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.region-select {
  width: 220px;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 16px;
}

.metric-card,
.ops-strip,
.panel-card {
  border: 1px solid rgba(203, 213, 225, 0.78);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 14px 34px rgba(15, 23, 42, 0.05);
}

.metric-card {
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 102px;
  padding: 18px;
}

.metric-icon {
  width: 46px;
  height: 46px;
  display: grid;
  place-items: center;
  border-radius: 15px;
  color: #fff;
}

.metric-icon.blue { background: linear-gradient(135deg, #2563eb, #38bdf8); }
.metric-icon.orange { background: linear-gradient(135deg, #f97316, #facc15); }
.metric-icon.cyan { background: linear-gradient(135deg, #06b6d4, #22c55e); }
.metric-icon.green { background: linear-gradient(135deg, #16a34a, #86efac); }
.metric-icon.purple { background: linear-gradient(135deg, #7c3aed, #38bdf8); }
.metric-icon.red { background: linear-gradient(135deg, #ef4444, #f97316); }

.metric-card p,
.ops-strip p {
  margin: 0 0 6px;
  color: #64748b;
  font-size: 13px;
  font-weight: 700;
}

.metric-card strong {
  display: block;
  color: #0f172a;
  font-size: 25px;
  font-weight: 800;
}

.metric-card span,
.ops-strip span,
.card-title small {
  display: block;
  color: #64748b;
  font-size: 12px;
  font-weight: 600;
}

.ops-strip {
  display: grid;
  grid-template-columns: 1.2fr auto repeat(3, 1fr);
  align-items: center;
  gap: 18px;
  padding: 18px 22px;
}

.ops-strip strong {
  color: #0f172a;
  font-size: 18px;
  font-weight: 800;
}

.content-grid {
  display: grid;
  grid-template-columns: 1.25fr 1fr 0.9fr;
  gap: 18px;
}

.card-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  color: #0f172a;
  font-weight: 800;
}

.trend-list,
.type-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.trend-row,
.type-row {
  display: grid;
  grid-template-columns: 48px 1fr 60px 76px;
  align-items: center;
  gap: 10px;
  color: #475569;
  font-size: 13px;
  font-weight: 700;
}

.trend-bar {
  height: 10px;
  border-radius: 999px;
  background: #eef2ff;
  overflow: hidden;
}

.trend-bar i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #2563eb, #22c55e);
}

.trend-row em,
.type-row em {
  color: #0f766e;
  font-style: normal;
}

.type-row {
  grid-template-columns: 1fr 72px 82px;
  padding: 12px;
  border-radius: 14px;
  background: #f8fafc;
}

.quick-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.quick-grid button {
  height: 64px;
  border: 1px solid #dbe7f6;
  border-radius: 14px;
  background: linear-gradient(135deg, #f8fbff, #edf6ff);
  color: #1e3a8a;
  font-weight: 800;
  cursor: pointer;
}

@media (max-width: 1400px) {
  .metric-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .content-grid { grid-template-columns: 1fr; }
}
</style>
