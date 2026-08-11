<template>
  <div class="empty-slot" :class="{ clickable: !!actionText }" @click.stop="emit('action')">
    <span class="es-icon" aria-hidden="true">{{ iconGlyph }}</span>
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

/** 空态图标只渲染受控文本，避免把字符串当作 HTML 注入。 */
const ICONS: Record<string, string> = {
  image: '▣',
  fire: '♨',
  feed: '☷',
  grid: '⊞',
  megaphone: '◁',
}

const iconGlyph = computed(() => ICONS[props.icon] || ICONS.image)
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
.es-icon { color: #9ca3af; font-size: 24px; line-height: 1; }
.es-text { font-size: 13px; color: #9ca3af; }
.es-action { font-size: 12.5px; color: #16a34a; font-weight: 600; }
.empty-slot.clickable:hover .es-action { text-decoration: underline; }
</style>
