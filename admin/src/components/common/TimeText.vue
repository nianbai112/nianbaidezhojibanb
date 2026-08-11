<template>
  <span class="time-text" :title="fullTime">{{ display }}</span>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  time: string | Date | null | undefined
  format?: 'relative' | 'full' | 'date' | 'time'
}>()

const fullTime = computed(() => {
  if (!props.time) return ''
  const d = new Date(props.time)
  return d.toLocaleString('zh-CN')
})

const display = computed(() => {
  if (!props.time) return '-'
  const d = new Date(props.time)
  const now = new Date()

  if (props.format === 'full') return d.toLocaleString('zh-CN')
  if (props.format === 'date') return d.toLocaleDateString('zh-CN')
  if (props.format === 'time') return d.toLocaleTimeString('zh-CN')

  // Relative format
  const diff = now.getTime() - d.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  if (hours < 24) return `${hours}小时前`
  if (days < 7) return `${days}天前`
  return d.toLocaleDateString('zh-CN')
})
</script>

<style scoped>
.time-text {
  font-size: 13px;
  color: #64748b;
}
</style>
