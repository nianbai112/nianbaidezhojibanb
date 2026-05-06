<template>
  <div
    class="mascot-wrapper"
    :class="[`mood-${mood}`, { 'reduced-motion': reducedMotion }]"
    @mousemove="onMouseMove"
    @mouseleave="onMouseLeave"
  >
    <svg
      viewBox="0 0 200 240"
      class="mascot-svg"
      xmlns="http://www.w3.org/2000/svg"
    >
      <!-- 身体阴影 -->
      <ellipse cx="100" cy="225" rx="55" ry="8" class="shadow" />

      <!-- 身体 -->
      <g class="body-group">
        <!-- 主体 -->
        <path
          d="M55 180 C55 130, 60 80, 100 75 C140 80, 145 130, 145 180 C145 205, 130 215, 100 215 C70 215, 55 205, 55 180Z"
          class="body-fill"
        />
        <!-- 肚子高光 -->
        <ellipse cx="100" cy="160" rx="28" ry="32" class="belly-highlight" />
        <!-- 领结/装饰 -->
        <path d="M85 110 L115 110 L100 125Z" class="accent-shape" />
      </g>

      <!-- 头部 -->
      <g class="head-group">
        <!-- 耳朵/触角 -->
        <ellipse cx="65" cy="55" rx="10" ry="18" class="ear left" transform="rotate(-20 65 55)" />
        <ellipse cx="135" cy="55" rx="10" ry="18" class="ear right" transform="rotate(20 135 55)" />

        <!-- 头主体 -->
        <rect x="45" y="35" width="110" height="90" rx="42" class="head-fill" />

        <!-- 脸部 -->
        <g class="face">
          <!-- 眼睛组 -->
          <g class="eyes">
            <!-- 左眼 -->
            <g class="eye left" :transform="`translate(${eyeOffsetX}, ${eyeOffsetY})`">
              <ellipse cx="78" cy="82" rx="14" ry="16" class="eye-white" />
              <circle cx="78" cy="82" r="7" class="eye-pupil" />
              <circle cx="80" cy="80" r="2.5" class="eye-shine" />
              <!-- 眨眼遮罩 -->
              <rect
                x="60" y="64"
                width="36" height="36"
                class="eyelid"
                :style="{ transform: `scaleY(${eyelidScale})` }"
              />
            </g>
            <!-- 右眼 -->
            <g class="eye right" :transform="`translate(${eyeOffsetX}, ${eyeOffsetY})`">
              <ellipse cx="122" cy="82" rx="14" ry="16" class="eye-white" />
              <circle cx="122" cy="82" r="7" class="eye-pupil" />
              <circle cx="124" cy="80" r="2.5" class="eye-shine" />
              <rect
                x="104" y="64"
                width="36" height="36"
                class="eyelid"
                :style="{ transform: `scaleY(${eyelidScale})` }"
              />
            </g>
          </g>

          <!-- 眉毛 -->
          <g class="eyebrows" :transform="`translate(0, ${eyebrowOffset})`">
            <path d="M68 58 Q78 54 88 58" class="eyebrow left" />
            <path d="M112 58 Q122 54 132 58" class="eyebrow right" />
          </g>

          <!-- 嘴巴 -->
          <path
            :d="mouthPath"
            class="mouth"
            fill="none"
            stroke-linecap="round"
          />

          <!-- 脸颊红晕 -->
          <ellipse cx="58" cy="102" rx="8" ry="5" class="cheek" />
          <ellipse cx="142" cy="102" rx="8" ry="5" class="cheek" />

          <!-- 捂眼手（password 状态） -->
          <g class="hands" :style="{ opacity: handsOpacity }">
            <ellipse cx="72" cy="84" rx="16" ry="12" class="hand left" transform="rotate(-15 72 84)" />
            <ellipse cx="128" cy="84" rx="16" ry="12" class="hand right" transform="rotate(15 128 84)" />
          </g>
        </g>
      </g>
    </svg>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'

export type MascotMood = 'idle' | 'usernameFocus' | 'passwordFocus' | 'typing' | 'error' | 'success'

const props = defineProps<{
  mood: MascotMood
}>()

/* ───── reduced motion ───── */
const reducedMotion = ref(false)
const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
function updateMotion() { reducedMotion.value = mediaQuery.matches }
onMounted(() => {
  updateMotion()
  mediaQuery.addEventListener?.('change', updateMotion)
})
onUnmounted(() => {
  mediaQuery.removeEventListener?.('change', updateMotion)
})

/* ───── 鼠标跟随 ───── */
const eyeOffsetX = ref(0)
const eyeOffsetY = ref(0)
const mouseActive = ref(false)

function onMouseMove(e: MouseEvent) {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  const maxOffset = 5
  const dx = Math.max(-maxOffset, Math.min(maxOffset, (e.clientX - cx) / 20))
  const dy = Math.max(-maxOffset, Math.min(maxOffset, (e.clientY - cy) / 20))
  eyeOffsetX.value = dx
  eyeOffsetY.value = dy
  mouseActive.value = true
}

function onMouseLeave() {
  eyeOffsetX.value = 0
  eyeOffsetY.value = 0
  mouseActive.value = false
}

/* ───── 自动眨眼 ───── */
const eyelidScale = ref(0)
let blinkTimer: ReturnType<typeof setTimeout> | null = null

function scheduleBlink() {
  if (reducedMotion.value || props.mood === 'passwordFocus') return
  const delay = 3000 + Math.random() * 4000
  blinkTimer = setTimeout(() => {
    eyelidScale.value = 1
    setTimeout(() => { eyelidScale.value = 0 }, 150)
    scheduleBlink()
  }, delay)
}

onMounted(scheduleBlink)
onUnmounted(() => { if (blinkTimer) clearTimeout(blinkTimer) })

watch(() => props.mood, (m) => {
  if (m === 'passwordFocus') {
    eyelidScale.value = 1
    if (blinkTimer) clearTimeout(blinkTimer)
  } else {
    eyelidScale.value = 0
    scheduleBlink()
  }
})

/* ───── 眉毛偏移 ───── */
const eyebrowOffset = computed(() => {
  switch (props.mood) {
    case 'error': return -4
    case 'success': return 2
    case 'usernameFocus': return -1
    default: return 0
  }
})

/* ───── 嘴巴路径 ───── */
const mouthPath = computed(() => {
  switch (props.mood) {
    case 'idle':
      return 'M88 112 Q100 118 112 112'
    case 'usernameFocus':
      return 'M86 112 Q100 120 114 112'
    case 'passwordFocus':
      return 'M92 116 Q100 112 108 116'
    case 'typing':
      return 'M88 112 Q100 118 112 112'
    case 'error':
      return 'M90 118 Q100 110 110 118'
    case 'success':
      return 'M84 110 Q100 124 116 110'
    default:
      return 'M88 112 Q100 118 112 112'
  }
})

/* ───── 捂眼手透明度 ───── */
const handsOpacity = computed(() => {
  return props.mood === 'passwordFocus' ? 1 : 0
})
</script>

<style lang="less" scoped>
.mascot-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  user-select: none;
  -webkit-user-select: none;
}

.mascot-svg {
  width: 220px;
  height: 264px;
  overflow: visible;
}

/* 阴影 */
.shadow {
  fill: rgba(0, 0, 0, 0.06);
  transition: rx 0.6s ease, ry 0.6s ease;
}

/* 身体 */
.body-group {
  transform-origin: 100px 180px;
  animation: bodyBreathe 3s ease-in-out infinite;
}
.mood-passwordFocus .body-group,
.mood-error .body-group,
.mood-success .body-group {
  animation: none;
}

.body-fill {
  fill: #e8f4f8;
  stroke: #d0e8f0;
  stroke-width: 1.5;
}
.belly-highlight {
  fill: rgba(255, 255, 255, 0.5);
}
.accent-shape {
  fill: #3B82F6;
}

/* 头部 */
.head-group {
  transform-origin: 100px 80px;
  transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.ear {
  fill: #e8f4f8;
  stroke: #d0e8f0;
  stroke-width: 1.5;
  transform-origin: center;
  transition: transform 0.3s ease;
}

.head-fill {
  fill: #ffffff;
  stroke: #e5e7eb;
  stroke-width: 1.5;
}

/* 眼睛 */
.eyes {
  transition: transform 0.3s ease;
}

.eye-white {
  fill: #ffffff;
  stroke: #e5e7eb;
  stroke-width: 1;
}
.eye-pupil {
  fill: #1f2937;
  transition: r 0.2s ease;
}
.eye-shine {
  fill: #ffffff;
}

.eyelid {
  fill: #ffffff;
  transform-origin: center;
  transition: transform 0.15s ease;
}

/* 眉毛 */
.eyebrow {
  fill: none;
  stroke: #9ca3af;
  stroke-width: 2.5;
  stroke-linecap: round;
  transition: transform 0.3s ease, d 0.3s ease;
}

/* 嘴巴 */
.mouth {
  stroke: #6b7280;
  stroke-width: 2.5;
  transition: d 0.3s ease;
}

/* 脸颊 */
.cheek {
  fill: rgba(248, 113, 113, 0.18);
  transition: opacity 0.3s ease;
}

/* 捂眼手 */
.hands {
  transition: opacity 0.3s ease;
}
.hand {
  fill: #e8f4f8;
  stroke: #d0e8f0;
  stroke-width: 1.5;
}

/* ───── 状态动画 ───── */

/* idle: 身体呼吸 */
@keyframes bodyBreathe {
  0%, 100% { transform: scale(1) translateY(0); }
  50% { transform: scale(1.015) translateY(-1px); }
}

/* typing: 轻微晃动 */
.mood-typing .head-group {
  animation: typingShake 0.15s ease-in-out infinite;
}
@keyframes typingShake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-0.5px); }
  75% { transform: translateX(0.5px); }
}

/* error: 摇头 */
.mood-error .head-group {
  animation: headShake 0.5s ease-in-out;
}
@keyframes headShake {
  0%, 100% { transform: rotate(0deg); }
  20% { transform: rotate(-6deg); }
  40% { transform: rotate(5deg); }
  60% { transform: rotate(-4deg); }
  80% { transform: rotate(2deg); }
}

/* success: 点头 */
.mood-success .head-group {
  animation: headNod 0.5s ease-in-out;
}
@keyframes headNod {
  0%, 100% { transform: rotate(0deg); }
  30% { transform: rotate(5deg); }
  60% { transform: rotate(-2deg); }
}

/* usernameFocus: 耳朵微动 */
.mood-usernameFocus .ear.left {
  animation: earWiggle 0.6s ease-in-out;
}
@keyframes earWiggle {
  0%, 100% { transform: rotate(-20deg); }
  50% { transform: rotate(-25deg); }
}

/* ───── 柔和高亮（success 状态） ───── */
.mood-success .body-fill {
  filter: drop-shadow(0 0 12px rgba(59, 130, 246, 0.25));
  transition: filter 0.4s ease;
}
.mood-success .head-fill {
  filter: drop-shadow(0 0 8px rgba(59, 130, 246, 0.2));
}

/* ───── reduced motion ───── */
.reduced-motion .body-group,
.reduced-motion .head-group,
.reduced-motion .ear,
.reduced-motion .eyes {
  animation: none !important;
  transition: none !important;
}
</style>
