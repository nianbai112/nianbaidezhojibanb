<template>
  <el-empty :description="description" :image-size="imageSize">
    <template #image>
      <svg
        class="empty-illustration"
        viewBox="0 0 120 84"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <!-- 漂浮点 -->
        <circle cx="42" cy="14" r="3" fill="var(--el-color-primary-light-8)" />
        <circle cx="60" cy="8" r="4" fill="var(--el-color-primary-light-7)" />
        <circle cx="78" cy="14" r="3" fill="var(--el-color-primary-light-9)" />
        <!-- 托盘后沿 -->
        <path
          d="M30 34 H90 L100 50 H20 L30 34 Z"
          fill="#fff"
          stroke="var(--mx-border-strong)"
          stroke-width="2.5"
          stroke-linejoin="round"
        />
        <!-- 托盘主体 -->
        <path
          d="M16 50 H104 V64 C104 68.4 100.4 72 96 72 H24 C19.6 72 16 68.4 16 64 V50 Z"
          fill="var(--mx-soft)"
          stroke="var(--mx-border-strong)"
          stroke-width="2.5"
          stroke-linejoin="round"
        />
        <!-- 托盘凹槽 -->
        <path
          d="M48 50 H72 V55 C72 57.8 69.8 60 67 60 H53 C50.2 60 48 57.8 48 55 V50 Z"
          fill="#fff"
          stroke="var(--mx-border-strong)"
          stroke-width="2.5"
          stroke-linejoin="round"
        />
      </svg>
    </template>
    <slot />
  </el-empty>
</template>

<script setup lang="ts">
// P4 全站统一空状态：代码绘制的线条托盘插画，替代 Element 默认灰图。
// 用法与 el-empty 一致：<EmptyState description="暂无数据" :image-size="64" />
withDefaults(
  defineProps<{
    description?: string
    imageSize?: number
  }>(),
  {
    description: '暂无数据',
    imageSize: 160,
  },
)
</script>

<style scoped>
.empty-illustration {
  width: 100%;
  height: 100%;
  display: block;
}
</style>
