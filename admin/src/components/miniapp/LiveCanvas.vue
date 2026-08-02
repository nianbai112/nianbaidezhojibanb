<template>
  <div class="lc">
    <div class="lc-status">
      <span class="lc-dot" :class="{ live: frameAt && !error }" />
      <span v-if="error" class="lc-error">{{ error }}</span>
      <span v-else-if="frameAt">真实画面 · {{ frameTime }} · 点按/滑动 = 真实操作</span>
      <span v-else>正在连接真实小程序…</span>
      <el-button size="small" text :icon="Refresh" :loading="refreshing" @click="manualRefresh" />
    </div>

    <div class="lc-phone" ref="phoneRef">
      <img v-if="frameUrl" :src="frameUrl" class="lc-frame" draggable="false" alt="" />
      <div v-else class="lc-placeholder">
        <el-icon class="is-loading" :size="22"><Loading /></el-icon>
        <p>{{ error ? '连接失败，点右上角重试' : '正在启动真实小程序…' }}</p>
      </div>
      <!-- 交互层：捕获点按与滑动 -->
      <div
        class="lc-touch"
        @mousedown="onDown"
        @mousemove="onMove"
        @mouseup="onUp"
        @mouseleave="onLeave"
      >
        <div v-if="dragging" class="lc-swipe-line" :style="swipeLineStyle" />
      </div>
    </div>

    <div class="lc-hint">点击画面 = 真实点击 · 拖动 = 真实滑动 · 底部 Tab 可直接点</div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Loading, Refresh } from '@element-plus/icons-vue'
import { request } from '@/api/request'

const frameUrl = ref('')
const frameAt = ref(0)
const error = ref('')
const refreshing = ref(false)
const phoneRef = ref<HTMLElement>()

let timer: ReturnType<typeof setInterval> | undefined
let destroyed = false

const frameTime = computed(() => (frameAt.value ? new Date(frameAt.value).toLocaleTimeString('zh-CN') : ''))

async function poll() {
  try {
    const res: any = await request.get('/admin/miniapp/preview/frame')
    const d = res.data || {}
    if (d.lastError) error.value = d.lastError
    else if (frameAt.value && d.frameAt) error.value = ''
    if (d.frameAt && d.frameAt !== frameAt.value) {
      frameAt.value = d.frameAt
      frameUrl.value = d.frameUrl
      error.value = ''
    }
  } catch { /* 网络异常下一轮再试 */ }
}

async function manualRefresh() {
  refreshing.value = true
  try {
    await request.post('/admin/miniapp/preview/refresh')
    error.value = ''
    await poll()
  } catch (e: any) {
    error.value = e?.message || '刷新失败'
  } finally {
    refreshing.value = false
  }
}

// ============ 点按 / 滑动回传 ============
const dragging = ref(false)
let startX = 0
let startY = 0
let curX = 0
let curY = 0

const swipeLineStyle = computed(() => {
  const x = Math.min(startX, curX)
  const y = Math.min(startY, curY)
  const w = Math.abs(curX - startX)
  const h = Math.abs(curY - startY)
  return { left: `${x}px`, top: `${y}px`, width: `${Math.max(w, 2)}px`, height: `${Math.max(h, 2)}px` }
})

function norm(e: MouseEvent) {
  const rect = phoneRef.value!.getBoundingClientRect()
  return {
    x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
    y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
  }
}

const onDown = (e: MouseEvent) => {
  const rect = phoneRef.value!.getBoundingClientRect()
  startX = curX = e.clientX - rect.left
  startY = curY = e.clientY - rect.top
  dragging.value = true
}
const onMove = (e: MouseEvent) => {
  if (!dragging.value) return
  const rect = phoneRef.value!.getBoundingClientRect()
  curX = e.clientX - rect.left
  curY = e.clientY - rect.top
}
const onUp = async (e: MouseEvent) => {
  if (!dragging.value) return
  dragging.value = false
  const dist = Math.hypot(curX - startX, curY - startY)
  const p1 = norm(e)
  if (dist < 12) {
    await request.post('/admin/miniapp/preview/tap', { x: p1.x, y: p1.y }).catch(() => {})
  } else {
    const rect = phoneRef.value!.getBoundingClientRect()
    const p2 = {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    }
    const pStart = {
      x: Math.min(1, Math.max(0, startX / rect.width)),
      y: Math.min(1, Math.max(0, startY / rect.height)),
    }
    await request.post('/admin/miniapp/preview/swipe', { x1: pStart.x, y1: pStart.y, x2: p2.x, y2: p2.y }).catch(() => {})
  }
  // 后端已补帧，立刻拉一次
  poll()
}
const onLeave = () => { dragging.value = false }

onMounted(() => {
  poll()
  timer = setInterval(() => { if (!destroyed) poll() }, 2500)
})
onBeforeUnmount(() => {
  destroyed = true
  clearInterval(timer)
})
</script>

<style scoped>
.lc { display: flex; flex-direction: column; gap: 10px; }
.lc-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--mx-muted, #7d8ba3);
}
.lc-dot { width: 8px; height: 8px; border-radius: 50%; background: #c4cabe; flex: 0 0 auto; }
.lc-dot.live { background: #10b981; box-shadow: 0 0 6px #10b98188; }
.lc-error { color: var(--el-color-warning, #f59e0b); }
.lc-status .el-button { margin-left: auto; }

.lc-phone {
  position: relative;
  width: 100%;
  aspect-ratio: 375 / 720;
  border-radius: 18px;
  border: 2px solid #172033;
  background: #f4f7f1;
  overflow: hidden;
  user-select: none;
}
.lc-frame {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  pointer-events: none;
}
.lc-placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--mx-muted, #7d8ba3);
  font-size: 13px;
}
.lc-touch {
  position: absolute;
  inset: 0;
  cursor: pointer;
  z-index: 2;
}
.lc-swipe-line {
  position: absolute;
  border: 2px dashed var(--el-color-primary, #2563eb);
  border-radius: 8px;
  pointer-events: none;
}
.lc-hint {
  text-align: center;
  font-size: 11.5px;
  color: var(--mx-muted, #7d8ba3);
}
</style>
