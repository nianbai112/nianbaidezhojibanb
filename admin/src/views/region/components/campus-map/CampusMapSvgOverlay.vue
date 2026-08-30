<template>
  <div
    class="svg-overlay-root"
    :class="{ 'svg-overlay-root--active': interactive }"
    :style="rootStyle"
  >
    <div
      class="svg-overlay-handle"
      :class="{ 'svg-overlay-handle--dragging': dragging }"
      :style="handleStyle"
      @mousedown.stop="onDragStart"
      @touchstart.stop.passive="onTouchStart"
    >
      <img
        :src="svgUrl"
        class="svg-overlay-img"
        draggable="false"
        alt=""
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'

export type SvgOverlayTransform = {
  x: number
  y: number
  scale: number
  rotation: number
  opacity: number
}

const props = defineProps<{
  svgUrl: string
  transform: SvgOverlayTransform
  interactive: boolean
}>()

const emit = defineEmits<{
  'update:transform': [value: SvgOverlayTransform]
}>()

const dragging = ref(false)
let dragStartX = 0
let dragStartY = 0
let originX = 0
let originY = 0

const rootStyle = computed(() => ({
  pointerEvents: (props.interactive ? 'auto' : 'none') as 'auto' | 'none',
  opacity: props.transform.opacity,
}))

const handleStyle = computed(() => ({
  transform: `translate(${props.transform.x}px, ${props.transform.y}px) rotate(${props.transform.rotation}deg) scale(${props.transform.scale})`,
  cursor: props.interactive ? (dragging.value ? 'grabbing' : 'grab') : 'default',
}))

function onDragStart(event: MouseEvent) {
  if (!props.interactive) return
  dragging.value = true
  dragStartX = event.clientX
  dragStartY = event.clientY
  originX = props.transform.x
  originY = props.transform.y
  window.addEventListener('mousemove', onDragMove)
  window.addEventListener('mouseup', onDragEnd)
}

function onTouchStart(event: TouchEvent) {
  if (!props.interactive || !event.touches[0]) return
  dragging.value = true
  dragStartX = event.touches[0].clientX
  dragStartY = event.touches[0].clientY
  originX = props.transform.x
  originY = props.transform.y
  window.addEventListener('touchmove', onTouchMove, { passive: false })
  window.addEventListener('touchend', onDragEnd)
}

function onDragMove(event: MouseEvent) {
  if (!dragging.value) return
  emit('update:transform', {
    ...props.transform,
    x: originX + event.clientX - dragStartX,
    y: originY + event.clientY - dragStartY,
  })
}

function onTouchMove(event: TouchEvent) {
  if (!dragging.value || !event.touches[0]) return
  event.preventDefault()
  emit('update:transform', {
    ...props.transform,
    x: originX + event.touches[0].clientX - dragStartX,
    y: originY + event.touches[0].clientY - dragStartY,
  })
}

function onDragEnd() {
  dragging.value = false
  window.removeEventListener('mousemove', onDragMove)
  window.removeEventListener('mouseup', onDragEnd)
  window.removeEventListener('touchmove', onTouchMove)
  window.removeEventListener('touchend', onDragEnd)
}

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onDragMove)
  window.removeEventListener('mouseup', onDragEnd)
  window.removeEventListener('touchmove', onTouchMove)
  window.removeEventListener('touchend', onDragEnd)
})
</script>

<style scoped>
.svg-overlay-root {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 10;
}

.svg-overlay-root--active {
  pointer-events: auto;
}

.svg-overlay-handle {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: center center;
  user-select: none;
  will-change: transform;
}

.svg-overlay-img {
  display: block;
  max-width: none;
  width: 100%;
  height: auto;
  pointer-events: none;
}
</style>
