<template>
  <div class="side-panels-wrap">
    <div class="glass-card">
      <div class="card-header"><div class="card-title">{{ chartTitle || '数据分布' }}</div></div>
      <div class="card-body">
        <div class="donut" :data-center="centerText || '暂无统计\\A 0'"></div>
        <div class="side-list" style="margin-top:16px">
          <div v-for="item in displayLegend" :key="item.name" class="side-item">
            <div class="side-left"><span :style="{background:item.color}" style="width:8px;height:8px;border-radius:50%"></span><b>{{ item.name }}</b></div><span>{{ item.percent }}</span>
          </div>
        </div>
      </div>
    </div>
    <div class="glass-card">
      <div class="card-header"><div class="card-title">{{ sideTitle || '待处理事项' }}</div><el-button link type="primary" size="small">更多 →</el-button></div>
      <div class="card-body">
        <div class="side-list">
          <div class="side-item" v-for="item in metrics" :key="item.title">
            <div class="side-left">
              <div class="side-icon"><el-icon><component :is="item.icon || 'Bell'" /></el-icon></div>
              <div><div class="name-main">{{ item.title }}</div><div class="name-sub">{{ item.desc }}</div></div>
            </div>
            <div class="side-num">{{ item.value }}</div>
          </div>
          <div v-if="!metrics?.length" class="empty-metrics">暂无待处理事项</div>
        </div>
      </div>
    </div>
    <div class="glass-card">
      <div class="card-header"><div class="card-title">{{ trendTitle || '近7日趋势' }}</div></div>
      <div class="card-body"><div class="chart-placeholder" style="min-height:180px"><div class="chart-line"></div></div></div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import type { SideMetric } from '@/types/admin'

interface LegendItem { name: string; percent: string; color: string }

const props = defineProps<{
  chartTitle?: string
  sideTitle?: string
  trendTitle?: string
  centerText?: string
  metrics?: SideMetric[]
  legend?: LegendItem[]
}>()

const defaultLegend: LegendItem[] = []

const displayLegend = computed(() => props.legend || defaultLegend)
</script>
<style scoped>
.side-panels-wrap {
  display: grid;
  gap: 24px;
}
.empty-metrics {
  text-align: center;
  color: #94a3b8;
  padding: 24px 0;
  font-size: 13px;
}
</style>
