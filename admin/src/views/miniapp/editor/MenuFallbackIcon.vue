<template>
  <span class="menu-fallback-icon">
    <span aria-hidden="true">{{ glyph }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{ name?: string; path?: string }>(), { name: '', path: '' })

/** 只从受控映射中取文本图标，不插入 HTML/SVG 字符串。 */
const GLYPHS: Record<string, string> = {
  doc: '☷',
  food: '☕',
  recycle: '♻',
  flag: '⚑',
  grid: '⊞',
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
const glyph = computed(() => GLYPHS[kind.value])
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
.menu-fallback-icon > span { color: #16a34a; font-size: 24px; line-height: 1; }
</style>
