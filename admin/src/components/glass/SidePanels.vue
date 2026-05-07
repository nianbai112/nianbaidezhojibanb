<template>
  <div class="page-shell">
    <div class="glass-card">
      <div class="card-header"><div class="card-title">{{ chartTitle || '数据分布' }}</div></div>
      <div class="card-body">
        <div class="donut" :data-center="centerText"></div>
        <div class="side-list" style="margin-top:16px">
          <div v-for="(item,idx) in legend" :key="item.name" class="side-item">
            <div class="side-left"><span :style="{background:item.color}" style="width:8px;height:8px;border-radius:50%"></span><b>{{ item.name }}</b></div><span>{{ item.percent }}</span>
          </div>
        </div>
      </div>
    </div>
    <div class="glass-card">
      <div class="card-header"><div class="card-title">{{ sideTitle || '待处理事项' }}</div><el-button link type="primary">更多 →</el-button></div>
      <div class="card-body"><div class="side-list"><div class="side-item" v-for="item in metrics" :key="item.title"><div class="side-left"><div class="side-icon"><el-icon><component :is="item.icon || 'Bell'" /></el-icon></div><div><div class="name-main">{{ item.title }}</div><div class="name-sub">{{ item.desc }}</div></div></div><div class="side-num">{{ item.value }}</div></div></div></div>
    </div>
    <div class="glass-card">
      <div class="card-header"><div class="card-title">近7日趋势</div></div>
      <div class="card-body"><div class="chart-placeholder" style="min-height:180px"><div class="chart-line"></div></div></div>
    </div>
  </div>
</template>
<script setup lang="ts">
import type { SideMetric } from '@/types/admin'
defineProps<{ chartTitle?:string; sideTitle?:string; metrics?:SideMetric[] }>()
const centerText = '今日总数\\A 2,458'
const legend = [{name:'小程序',percent:'42.35%',color:'#1f6fff'},{name:'APP',percent:'28.41%',color:'#14b8a6'},{name:'H5',percent:'15.32%',color:'#f59e0b'},{name:'商家端',percent:'8.71%',color:'#8b5cf6'}]
</script>
