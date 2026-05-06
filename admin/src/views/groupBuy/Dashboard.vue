<template>
  <div class="page-container">
    <FilterBar @search="onSearch" @reset="onReset">
      <a-select v-model:value="regionId" placeholder="选择区域" allow-clear style="width:200px" :options="regionOpts" :field-names="{ value: 'id', label: 'name' }" show-search option-filter-prop="name" />
    </FilterBar>

    <a-spin :spinning="loading">
      <a-row :gutter="16" style="margin-bottom:16px">
        <a-col :span="4">
          <a-card><a-statistic title="总营收 (元)" :value="stats.totalRevenue" :precision="2" /></a-card>
        </a-col>
        <a-col :span="4">
          <a-card><a-statistic title="今日订单" :value="stats.todayOrders" /></a-card>
        </a-col>
        <a-col :span="4">
          <a-card><a-statistic title="总订单数" :value="stats.totalOrders" /></a-card>
        </a-col>
        <a-col :span="4">
          <a-card><a-statistic title="核销率" :value="stats.verifyRate" suffix="%" /></a-card>
        </a-col>
        <a-col :span="4">
          <a-card><a-statistic title="退款率" :value="stats.refundRate" suffix="%" /></a-card>
        </a-col>
        <a-col :span="4">
          <a-card><a-statistic title="上架套餐" :value="stats.activePackages" :suffix="'/ ' + stats.totalPackages" /></a-card>
        </a-col>
      </a-row>

      <div class="page-card" style="margin-bottom:16px">
        <div class="page-header"><span class="page-title">近7日订单趋势</span></div>
        <div style="height:280px;display:flex;align-items:flex-end;justify-content:space-around;padding:16px 0">
          <div v-for="item in stats.trends" :key="item.date" style="display:flex;flex-direction:column;align-items:center;width:10%">
            <div style="margin-bottom:8px;font-size:13px;font-weight:500">{{ item.count }}单</div>
            <div :style="{ height: Math.max(item.count * 4, 10) + 'px', width: '100%', backgroundColor: '#409EFF', borderRadius: '4px 4px 0 0', minWidth: '30px' }"></div>
            <div style="margin-top:8px;font-size:11px;color:#999">{{ item.date.slice(5) }}</div>
          </div>
        </div>
      </div>

      <div class="page-card">
        <div class="page-header"><span class="page-title">套餐销量 Top 10</span></div>
        <DataTable :columns="topColumns" :data-source="stats.topPackages" :loading="false" :total="0" :show-pagination="false" />
      </div>
    </a-spin>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { groupBuyApi } from '@/api'
import type { GroupBuyStats } from '@/api/groupBuy'
import { useUserStore } from '@/stores/user'
import { shopApi } from '@/api/shop'
import FilterBar from '@/components/common/FilterBar.vue'
import DataTable from '@/components/common/DataTable.vue'

const userStore = useUserStore()
const loading = ref(false)
const regionId = ref(userStore.regionId || undefined)
const regionOpts = ref<any[]>([])

const stats = ref<GroupBuyStats>({
  totalPackages: 0, activePackages: 0, totalOrders: 0, todayOrders: 0,
  totalRevenue: 0, verifyRate: '0', refundRate: '0', trends: [], topPackages: []
})

const topColumns = [
  { title: '排名', dataIndex: '_rank', width: 60 },
  { title: '套餐名称', dataIndex: 'name' },
  { title: '销量', dataIndex: 'soldCount', width: 100 },
  { title: '单价', dataIndex: 'price', width: 100 },
]

async function fetchStats() {
  loading.value = true
  try {
    const res = await groupBuyApi.getAdminStats(regionId.value)
    if (res.data) {
      const d = res.data as any
      stats.value = { ...stats.value, ...d }
      if (stats.value.topPackages?.length) {
        stats.value.topPackages = stats.value.topPackages.map((p: any, i: number) => ({ ...p, _rank: i + 1 }))
      }
    }
  } finally { loading.value = false }
}

async function loadRegions() {
  try {
    const res = await shopApi.getMerchantList({ page: 1, pageSize: 1000 })
    const merchants = (res.data?.data?.list || res.data?.list || []) as any[]
    const map = new Map<string, any>()
    merchants.forEach((m: any) => { if (m.regionId && !map.has(m.regionId)) map.set(m.regionId, { id: m.regionId, name: m.regionName || m.regionId }) })
    regionOpts.value = Array.from(map.values())
  } catch { /* ignore */ }
}

function onSearch() { fetchStats() }
function onReset() { regionId.value = undefined; fetchStats() }

onMounted(() => { loadRegions(); fetchStats() })
</script>
