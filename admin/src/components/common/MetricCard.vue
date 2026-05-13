<template>
  <div class="metric-card glass-card" :class="[`tone-${tone}`]">
    <div class="metric-icon">
      <el-icon :size="20"><component :is="icon" /></el-icon>
    </div>
    <div class="metric-content">
      <div class="metric-label">{{ label }}</div>
      <div class="metric-value">{{ value }}</div>
      <div class="metric-delta" v-if="delta">
        <span :class="{ down: isDown }">{{ delta }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  label: string
  value: string | number
  delta?: string
  icon?: string
  tone?: 'blue' | 'green' | 'purple' | 'orange' | 'red' | 'cyan'
}>()

const isDown = computed(() => props.delta?.startsWith('-') || props.delta?.startsWith('↓'))
</script>

<style scoped>
.metric-card {
  padding: 16px 20px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.8);
  display: flex;
  align-items: center;
  gap: 16px;
}

.metric-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
}

.tone-blue .metric-icon { background: linear-gradient(135deg, #3b82f6, #60a5fa); }
.tone-green .metric-icon { background: linear-gradient(135deg, #10b981, #34d399); }
.tone-purple .metric-icon { background: linear-gradient(135deg, #8b5cf6, #a78bfa); }
.tone-orange .metric-icon { background: linear-gradient(135deg, #f59e0b, #fbbf24); }
.tone-red .metric-icon { background: linear-gradient(135deg, #ef4444, #f87171); }
.tone-cyan .metric-icon { background: linear-gradient(135deg, #06b6d4, #22d3ee); }

.metric-label {
  font-size: 12px;
  color: #64748b;
  font-weight: 600;
}

.metric-value {
  font-size: 24px;
  font-weight: 800;
  color: #1e293b;
  margin-top: 2px;
}

.metric-delta {
  font-size: 12px;
  color: #10b981;
  font-weight: 600;
  margin-top: 2px;
}

.metric-delta .down {
  color: #ef4444;
}
</style>
