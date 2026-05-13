<template>
  <div class="section-card glass-card">
    <div class="section-head">
      <div class="card-title">地理位置与服务范围</div>
      <el-button type="primary" @click="showAmapPicker = true">从高德地图选择</el-button>
    </div>

    <div class="location-info" v-if="latitude && longitude">
      <div class="location-detail">
        <div class="location-row">
          <span class="location-label">地址：</span>
          <span class="location-value">{{ address || '未获取' }}</span>
        </div>
        <div class="location-row">
          <span class="location-label">坐标：</span>
          <span class="location-value">{{ longitude }}, {{ latitude }}</span>
        </div>
      </div>
    </div>
    <div v-else class="location-empty">
      <el-icon><Location /></el-icon>
      <span>未选择位置，请点击上方按钮从地图选择</span>
    </div>

    <el-form label-position="top" style="margin-top: 16px">
      <div class="form-grid three relaxed">
        <el-form-item label="纬度">
          <el-input-number v-model="latitude" :precision="6" :step="0.001" style="width:100%" />
        </el-form-item>
        <el-form-item label="经度">
          <el-input-number v-model="longitude" :precision="6" :step="0.001" style="width:100%" />
        </el-form-item>
        <el-form-item label="服务半径（米）">
          <el-slider v-model="serviceRadius" :min="500" :max="50000" :step="500" show-input :format-tooltip="(v: number) => `${v}米`" />
        </el-form-item>
        <el-form-item label="距离限制（米）">
          <el-input-number v-model="distanceLimit" :min="0" :step="1000" style="width:100%" />
          <div class="form-tip">0 表示不限制。用户超出此距离将被拦截。</div>
        </el-form-item>
      </div>
    </el-form>

    <AmapLocationPicker
      v-model:visible="showAmapPicker"
      :default-center="latitude && longitude ? [longitude, latitude] : undefined"
      :service-radius="serviceRadius"
      :distance-limit="distanceLimit"
      @confirm="onAmapConfirm"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { Location } from '@element-plus/icons-vue'
import AmapLocationPicker from '@/components/common/AmapLocationPicker.vue'

interface Props {
  latitude?: number | null
  longitude?: number | null
  address?: string
  serviceRadius?: number
  distanceLimit?: number
}

const props = withDefaults(defineProps<Props>(), {
  latitude: null,
  longitude: null,
  address: '',
  serviceRadius: 5000,
  distanceLimit: 0
})

const emit = defineEmits<{
  'update:latitude': [value: number | null]
  'update:longitude': [value: number | null]
  'update:address': [value: string]
  'update:serviceRadius': [value: number]
  'update:distanceLimit': [value: number]
}>()

const showAmapPicker = ref(false)

const latitude = computed({
  get: () => props.latitude,
  set: (val) => emit('update:latitude', val)
})

const longitude = computed({
  get: () => props.longitude,
  set: (val) => emit('update:longitude', val)
})

const address = computed({
  get: () => props.address,
  set: (val) => emit('update:address', val)
})

const serviceRadius = computed({
  get: () => props.serviceRadius,
  set: (val) => emit('update:serviceRadius', val)
})

const distanceLimit = computed({
  get: () => props.distanceLimit,
  set: (val) => emit('update:distanceLimit', val)
})

function onAmapConfirm(location: any) {
  latitude.value = location.latitude
  longitude.value = location.longitude
  address.value = location.address || ''
}
</script>

<style scoped lang="scss">
.section-card {
  padding: 0;
}

.section-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 20px 24px 4px;
}

.location-info {
  padding: 16px 24px;
}

.location-detail {
  background: rgba(255, 255, 255, 0.6);
  border-radius: 12px;
  padding: 16px;
  border: 1px solid rgba(226, 232, 240, 0.6);
}

.location-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
}

.location-row:not(:last-child) {
  border-bottom: 1px solid rgba(226, 232, 240, 0.4);
}

.location-label {
  color: #64748b;
  font-size: 13px;
  min-width: 60px;
}

.location-value {
  color: #334155;
  font-size: 13px;
  font-weight: 500;
}

.location-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 32px 24px;
  color: #94a3b8;
  font-size: 14px;
}

.section-card :deep(.el-form) {
  padding: 16px 24px 24px;
}

.relaxed {
  gap: 16px 24px;
}

.form-tip {
  color: #94a3b8;
  font-size: 12px;
  margin-top: 4px;
}
</style>
