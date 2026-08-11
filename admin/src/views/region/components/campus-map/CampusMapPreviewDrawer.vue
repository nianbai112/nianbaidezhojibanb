<template>
  <el-drawer
    :model-value="modelValue"
    title="小程序近似预览"
    size="420px"
    append-to-body
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div class="mini-preview-panel drawer-panel">
      <div class="preview-note">最终效果以微信小程序实际渲染为准</div>
      <div class="mini-preview-map">
        <svg class="mini-preview-layer" viewBox="0 0 100 100" preserveAspectRatio="none">
          <polygon
            v-for="area in polygons"
            :key="area.id"
            :points="area.points"
            class="mini-preview-area"
          />
          <polyline
            v-for="route in polylines"
            :key="route.id"
            :points="route.points"
            class="mini-preview-route"
          />
        </svg>
        <span
          v-for="marker in markers"
          :key="marker.id"
          class="mini-preview-marker"
          :style="{ left: `${marker.x}%`, top: `${marker.y}%`, background: marker.color || '#2563eb' }"
        >
          {{ marker.title }}
        </span>
        <span class="mini-preview-user">我</span>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
defineProps<{
  modelValue: boolean
  markers: Array<{ id: string; title: string; x: number; y: number; color?: string }>
  polylines: Array<{ id: string; points: string }>
  polygons: Array<{ id: string; points: string }>
}>()

defineEmits<{
  'update:modelValue': [value: boolean]
}>()
</script>

<style scoped>
.drawer-panel {
  margin-bottom: 0;
}

.mini-preview-panel {
  display: grid;
  gap: 10px;
  margin-bottom: 12px;
  padding: 12px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #fff;
}

.mini-preview-map {
  position: relative;
  height: 220px;
  overflow: hidden;
  border: 1px solid #dbe4f0;
  border-radius: 6px;
  background:
    linear-gradient(90deg, rgba(148, 163, 184, .14) 1px, transparent 1px),
    linear-gradient(rgba(148, 163, 184, .14) 1px, transparent 1px),
    #f8fafc;
  background-size: 28px 28px;
}

.preview-note {
  border: 1px solid #bfdbfe;
  border-radius: 6px;
  padding: 8px 10px;
  background: #eff6ff;
  color: #1d4ed8;
  font-size: 12px;
  font-weight: 800;
}

.mini-preview-layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.mini-preview-area {
  fill: rgba(37, 99, 235, .14);
  stroke: #2563eb;
  stroke-width: .5;
}

.mini-preview-route {
  fill: none;
  stroke: #f97316;
  stroke-linecap: round;
  stroke-width: .7;
}

.mini-preview-marker,
.mini-preview-user {
  position: absolute;
  transform: translate(-50%, -100%);
  max-width: 72px;
  overflow: hidden;
  border-radius: 6px;
  padding: 3px 6px;
  background: #2563eb;
  color: #fff;
  font-size: 11px;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
  box-shadow: 0 8px 18px rgba(15, 23, 42, .14);
}

.mini-preview-user {
  left: 50%;
  top: 54%;
  background: #ef4444;
}
</style>
