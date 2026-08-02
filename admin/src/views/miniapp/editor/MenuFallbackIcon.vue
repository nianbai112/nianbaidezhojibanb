<template>
  <span class="menu-fallback-icon">
    <svg viewBox="0 0 24 24" fill="none" stroke="#16A34A" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" v-html="inner" />
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{ name?: string; path?: string }>(), { name: '', path: '' })

/** 金刚区统一线性兜底图标：24px / 线宽 1.5 / 品牌绿 #16A34A */
const PATHS: Record<string, string> = {
  doc: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8.5 8h7M8.5 12h7M8.5 16h4.5"/>',
  food: '<path d="M4 10h16v8a2 2 0 01-2 2H6a2 2 0 01-2-2v-8z"/><path d="M4 10c0-3.2 3.6-5.5 8-5.5s8 2.3 8 5.5"/><path d="M12 4.5V10"/>',
  recycle: '<path d="M4.5 12a7.5 7.5 0 0113-5.2"/><path d="M17.8 3.2v3.8h-3.8"/><path d="M19.5 12a7.5 7.5 0 01-13 5.2"/><path d="M6.2 20.8v-3.8h3.8"/>',
  flag: '<path d="M6 21V4"/><path d="M6 5h11l-2.5 3.5L17 12H6"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
}

/** 按入口名称/路径智能选图标 */
const kind = computed(() => {
  const s = `${props.name} ${props.path}`.toLowerCase()
  if (/笔记|post|note/.test(s)) return 'doc'
  if (/外卖|merchant|餐|food/.test(s)) return 'food'
  if (/二手|secondhand|recycle/.test(s)) return 'recycle'
  if (/活动|selection|event|flag/.test(s)) return 'flag'
  return 'grid'
})
const inner = computed(() => PATHS[kind.value])
</script>

<style scoped>
.menu-fallback-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: rgba(22, 163, 74, 0.10);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.menu-fallback-icon svg { width: 24px; height: 24px; display: block; }
</style>
