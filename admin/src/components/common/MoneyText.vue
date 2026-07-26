<template>
  <span class="money-text" :class="{ negative: isNegative }">
    {{ formatted }}
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  amount: number
  currency?: string
  cents?: boolean
}>()

const isNegative = computed(() => props.amount < 0)

const formatted = computed(() => {
  const value = props.cents ? props.amount / 100 : props.amount
  const symbol = props.currency === 'USD' ? '$' : '¥'
  return `${symbol}${Math.abs(value).toFixed(2)}`
})
</script>

<style scoped>
.money-text {
  font-weight: 600;
  color: #1e293b;
  font-variant-numeric: tabular-nums;
}

.money-text.negative {
  color: #ef4444;
}
</style>
