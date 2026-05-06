<template>
  <div class="image-preview-group">
    <a-image
      v-for="(url, index) in urls"
      :key="index"
      :src="url"
      :width="width"
      :height="height"
      :style="{ objectFit: 'cover', borderRadius: '4px', marginRight: '8px', marginBottom: '8px' }"
      :preview="{ visible: previewIndex === index }"
      @click="previewIndex = index"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const props = withDefaults(defineProps<{
  urls?: string | string[]
  width?: number
  height?: number
}>(), {
  width: 80,
  height: 80,
})

const urls = computed(() => {
  if (!props.urls) return []
  return Array.isArray(props.urls) ? props.urls : [props.urls]
})

const previewIndex = ref(-1)
</script>
