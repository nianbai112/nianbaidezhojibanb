<template>
  <div :class="['stats-grid', countClass]">
    <div v-for="item in items" :key="item.label" class="glass-card kpi-card" :class="`tone-${item.tone || 'blue'}`">
      <div class="kpi-icon"><el-icon><component :is="item.icon || 'DataLine'" /></el-icon></div>
      <div>
        <div class="kpi-label">{{ item.label }} <el-icon><InfoFilled /></el-icon></div>
        <div class="kpi-value">{{ item.value }}</div>
        <div v-if="item.delta !== undefined" :class="['kpi-delta', { down: item.down }]">较昨日 {{ item.delta || '+0.0%' }}</div>
        <div v-else-if="item.sub" class="kpi-sub">{{ item.sub }}</div>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import type { StatItem } from '@/types/admin'
const props = defineProps<{ items: StatItem[] }>()
const countClass = computed(() => {
  const n = props.items.length
  if (n === 4) return 'four'
  if (n === 5) return 'five'
  if (n === 3 || n === 6) return 'three'
  return ''
})
</script>
