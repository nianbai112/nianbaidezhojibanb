<template>
  <div class="mini-program-preview">
    <div class="phone-frame">
      <!-- 手机顶部刘海 -->
      <div class="phone-notch">
        <div class="notch-camera"></div>
      </div>

      <!-- 状态栏 -->
      <div class="status-bar">
        <span class="time">{{ currentTime }}</span>
        <div class="status-icons">
          <svg class="icon signal" viewBox="0 0 24 24" fill="currentColor">
            <path d="M2 22h20V2z" opacity="0.3"/>
            <path d="M2 22h20V2z"/>
          </svg>
          <svg class="icon wifi" viewBox="0 0 24 24" fill="currentColor">
            <path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9zm8 8l3 3 3-3c-1.65-1.66-4.34-1.66-6 0zm-4-4l2 2c2.76-2.76 7.24-2.76 10 0l2-2C15.14 9.14 8.87 9.14 5 13z"/>
          </svg>
          <div class="battery">
            <div class="battery-level"></div>
          </div>
        </div>
      </div>

      <!-- 导航栏 -->
      <div class="nav-bar" :style="navBarStyle">
        <div class="nav-left">
          <svg v-if="showBack" class="nav-back" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
          </svg>
        </div>
        <div class="nav-title">{{ navTitle }}</div>
        <div class="nav-right">
          <svg class="nav-more" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
          </svg>
        </div>
      </div>

      <!-- 内容区域 -->
      <div class="content-area" ref="contentRef">
        <slot></slot>
      </div>

      <!-- 底部导航 -->
      <div v-if="showTabbar" class="tabbar-area">
        <slot name="tabbar"></slot>
      </div>

      <!-- 底部安全区 -->
      <div class="safe-area-bottom">
        <div class="home-indicator"></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'

const props = defineProps<{
  navTitle?: string
  showBack?: boolean
  showTabbar?: boolean
  navBackgroundColor?: string
  navTextStyle?: 'black' | 'white'
}>()

const currentTime = ref('')
let timer: ReturnType<typeof setInterval> | null = null

const updateTime = () => {
  const now = new Date()
  const hours = now.getHours().toString().padStart(2, '0')
  const minutes = now.getMinutes().toString().padStart(2, '0')
  currentTime.value = `${hours}:${minutes}`
}

const navBarStyle = computed(() => ({
  backgroundColor: props.navBackgroundColor || '#ffffff',
  color: props.navTextStyle === 'white' ? '#ffffff' : '#000000'
}))

onMounted(() => {
  updateTime()
  timer = setInterval(updateTime, 60000)
})

onUnmounted(() => {
  if (timer) {
    clearInterval(timer)
  }
})
</script>

<style scoped>
.mini-program-preview {
  display: flex;
  justify-content: center;
  align-items: flex-start;
}

.phone-frame {
  width: 375px;
  height: 812px;
  background: #ffffff;
  border-radius: 44px;
  box-shadow:
    inset 0 0 0 2px #1a1a1a,
    inset 0 0 0 4px #333333,
    0 0 0 2px #1a1a1a,
    0 0 0 4px #333333,
    0 20px 60px rgba(0, 0, 0, 0.3),
    0 0 0 1px rgba(255, 255, 255, 0.1) inset;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  position: relative;
}

.phone-notch {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 160px;
  height: 34px;
  background: #1a1a1a;
  border-radius: 0 0 24px 24px;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
}

.notch-camera {
  width: 12px;
  height: 12px;
  background: #333;
  border-radius: 50%;
  border: 2px solid #222;
}

.status-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 28px 4px;
  height: 54px;
  background: #ffffff;
  position: relative;
  z-index: 50;
}

.time {
  font-size: 15px;
  font-weight: 600;
  color: #000000;
  letter-spacing: 0.5px;
}

.status-icons {
  display: flex;
  gap: 6px;
  align-items: center;
}

.icon {
  width: 16px;
  height: 16px;
  color: #000000;
}

.signal {
  width: 18px;
  height: 18px;
}

.battery {
  width: 25px;
  height: 12px;
  border: 1.5px solid #000000;
  border-radius: 3px;
  padding: 1.5px;
  position: relative;
}

.battery::after {
  content: '';
  position: absolute;
  right: -4px;
  top: 50%;
  transform: translateY(-50%);
  width: 2px;
  height: 6px;
  background: #000000;
  border-radius: 0 1px 1px 0;
}

.battery-level {
  width: 100%;
  height: 100%;
  background: #000000;
  border-radius: 1px;
}

.nav-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 44px;
  padding: 0 16px;
  position: relative;
  z-index: 40;
}

.nav-left {
  width: 40px;
  display: flex;
  align-items: center;
}

.nav-back {
  width: 24px;
  height: 24px;
}

.nav-title {
  font-size: 17px;
  font-weight: 600;
  text-align: center;
  flex: 1;
}

.nav-right {
  width: 40px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.nav-more {
  width: 24px;
  height: 24px;
}

.content-area {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  background: #f5f5f5;
  -webkit-overflow-scrolling: touch;
}

.content-area::-webkit-scrollbar {
  display: none;
}

.tabbar-area {
  background: #ffffff;
  border-top: 0.5px solid #e5e5e5;
}

.safe-area-bottom {
  height: 34px;
  background: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
}

.home-indicator {
  width: 134px;
  height: 5px;
  background: #000000;
  border-radius: 3px;
  opacity: 0.2;
}
</style>
