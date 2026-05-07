<template>
  <div :class="['stats-grid', countClass]">
    <div v-for="item in items" :key="item.label" class="glass-card kpi-card" :class="`tone-${item.tone || 'blue'}`">
      <div class="kpi-icon"><el-icon><component :is="item.icon || 'DataLine'" /></el-icon></div>
      <div>
        <div class="kpi-label">{{ item.label }} <el-icon><InfoFilled /></el-icon></div>
        <div class="kpi-value">{{ item.value }}</div>
        <div :class="['kpi-delta', { down: item.down }]">较昨日 {{ item.delta || '+0.0%' }}</div>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import type { StatItem } from '@/types/admin'
const props = defineProps<{ items: StatItem[] }>()
const countClass = computed(() => props.items.length === 4 ? 'four' : props.items.length === 5 ? 'five' : '')
</script>
