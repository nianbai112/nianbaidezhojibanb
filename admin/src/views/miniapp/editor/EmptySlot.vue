<template>
  <div class="empty-slot" :class="{ clickable: !!actionText }" @click.stop="emit('action')">
    <span class="es-icon" v-html="svg" />
    <span class="es-text">{{ text }}</span>
    <span v-if="actionText" class="es-action">{{ actionText }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{ icon?: string; text: string; actionText?: string }>(), {
  icon: 'image',
  actionText: '',
})
const emit = defineEmits<{ (e: 'action'): void }>()

/** 统一空态线性图标：24px / 线宽 1.5 / 单色 #9CA3AF */
const ICONS: Record<string, string> = {
  image:
    '<svg viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M4.5 18l4.5-4.5 3 3 3.5-3.5L20 17"/></svg>',
  fire:
    '<svg viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3s5.5 4.6 5.5 9.3a5.5 5.5 0 01-11 0c0-2.1 1.1-3.7 2.2-5.2.5 1.5 1.4 2.2 2.4 2.2-.5-2 .3-4.6.9-6.3z"/></svg>',
  feed:
    '<svg viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8.5 8h7M8.5 12h7M8.5 16h4.5"/></svg>',
  grid:
    '<svg viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg>',
  megaphone:
    '<svg viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10v4l3 .6V9.4L4 10z"/><path d="M7 9.4L18 5v14l-11-4.4"/><path d="M10 15.5V18a2 2 0 004 0v-1.7"/></svg>',
}

const svg = computed(() => ICONS[props.icon] || ICONS.image)
</script>

<style scoped>
.empty-slot {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 22px 12px;
  border: 1.5px dashed #d1d5db;
  background: #f9fafb;
  border-radius: 8px;
  width: 100%;
}
.empty-slot.clickable { cursor: pointer; }
.es-icon { line-height: 0; }
.es-icon :deep(svg) { width: 24px; height: 24px; display: block; }
.es-text { font-size: 13px; color: #9ca3af; }
.es-action { font-size: 12.5px; color: #16a34a; font-weight: 600; }
.empty-slot.clickable:hover .es-action { text-decoration: underline; }
</style>
