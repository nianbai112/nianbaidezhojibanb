<template>
  <!-- tmagic 活动页绝对定位渲染（共用）：375px 设计画布，按 width 等比缩放 -->
  <div class="tiv" :style="outerStyle">
    <div class="tiv-canvas" :style="canvasStyle">
      <template v-if="block.status === 'ready'">
        <template v-for="n in block.items" :key="n.key">
          <div v-if="n.ttype === 'text'" class="tiv-node tiv-text" :style="n.style">{{ n.text }}</div>
          <div v-else-if="n.ttype === 'img'" class="tiv-node tiv-img" :style="n.style">
            <img v-if="resolveSrc(n.src)" class="tiv-img-el" :src="resolveSrc(n.src)" alt="" @error="hideImg" />
            <div v-else class="tiv-img-ph">未设置图片</div>
          </div>
          <div v-else-if="n.ttype === 'button'" class="tiv-node tiv-btn" :style="n.style">{{ n.text || '按钮' }}</div>
        </template>
      </template>
      <div v-else-if="block.status === 'loading'" class="tiv-skeleton">{{ loadingText }}</div>
      <div v-else class="tiv-empty">{{ emptyText }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { TmagicBlock } from './normalize'

const props = withDefaults(
  defineProps<{
    block: TmagicBlock
    /** 渲染宽度（内部 375px 画布等比缩放到该宽度） */
    width?: number
    /** 页面背景色（DSL page.style.background） */
    background?: string
    /** 空态文案（status === 'empty' 时显示） */
    emptyText?: string
    loadingText?: string
    /** 空态 / 加载态占位高度 */
    placeholderHeight?: number
  }>(),
  { width: 375, background: '', emptyText: '活动页 · 暂无内容', loadingText: '活动页加载中…', placeholderHeight: 120 },
)

const scale = computed(() => props.width / 375)
const innerHeight = computed(() => {
  if (props.block.status === 'ready') return Math.max(props.block.height, 1)
  return props.placeholderHeight
})

const outerStyle = computed(() => ({
  width: `${props.width}px`,
  height: `${Math.round(innerHeight.value * scale.value)}px`,
  overflow: 'hidden',
}))
const canvasStyle = computed(() => ({
  width: '375px',
  height: `${innerHeight.value}px`,
  transform: scale.value === 1 ? undefined : `scale(${scale.value})`,
  transformOrigin: 'left top',
  background: props.background || undefined,
}))

/** 素材地址解析：http 直用；/static/* 走后端素材代理（与 HomeEditor resolveAsset 对齐） */
function resolveSrc(v: string) {
  const s = String(v || '').trim()
  if (!s) return ''
  if (/^https?:\/\//.test(s)) return s
  if (s.startsWith('/static/')) return `/miniapp-static/${s.slice('/static/'.length)}`
  if (s.startsWith('static/')) return `/miniapp-static/${s.slice('static/'.length)}`
  return s
}
function hideImg(e: Event) {
  (e.target as HTMLImageElement).style.display = 'none'
}
</script>

<style scoped>
.tiv {
  position: relative;
}
.tiv-canvas {
  position: relative;
  overflow: hidden;
}
.tiv-node {
  position: absolute;
  box-sizing: border-box;
}
.tiv-text {
  white-space: pre-wrap;
  word-break: break-all;
  line-height: 1.4;
  overflow: hidden;
}
.tiv-img {
  overflow: hidden;
  background: #eef2ea;
}
.tiv-img-el {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.tiv-img-ph {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: #9aa39a;
  border: 1px dashed #cfd8cc;
  box-sizing: border-box;
  border-radius: inherit;
}
.tiv-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  white-space: nowrap;
}
.tiv-skeleton {
  height: 100%;
  min-height: 60px;
  background: linear-gradient(90deg, #eef2ea 25%, #f7faf4 50%, #eef2ea 75%);
  background-size: 200% 100%;
  animation: tiv-shimmer 1.2s infinite;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: #8a9384;
}
@keyframes tiv-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
.tiv-empty {
  height: 100%;
  min-height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: #9aa39a;
  background: #f5f7f4;
  border: 1px dashed #d8ded5;
  box-sizing: border-box;
}
</style>
