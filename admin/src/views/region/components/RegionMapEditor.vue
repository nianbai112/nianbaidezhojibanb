<template>
  <div class="section-card glass-card">
    <div class="section-head">
      <div>
        <div class="card-title">地理位置与服务范围</div>
        <div class="card-subtitle">用于判断用户是否在运营区域内，并作为跑腿接单的服务中心点。</div>
      </div>
      <el-button type="primary" @click="showAmapPicker = true">
        <el-icon><Location /></el-icon>
        从高德地图选择
      </el-button>
    </div>

    <div class="location-panel">
      <div class="location-state" :class="{ active: latitude && longitude }">
        <el-icon><Location /></el-icon>
      </div>
      <div class="location-main">
        <div class="location-kicker">{{ latitude && longitude ? '已完成定位' : '尚未定位' }}</div>
        <div class="location-address">{{ address || '请选择地图位置，或手动填写详细地址' }}</div>
        <div class="location-meta">
          <span>经度 {{ longitude || '-' }}</span>
          <span>纬度 {{ latitude || '-' }}</span>
          <span>服务半径 {{ serviceRadius || 0 }} 米</span>
        </div>
      </div>
    </div>

    <el-form label-position="top" style="margin-top: 16px">
      <div class="location-form-grid">
        <el-form-item label="经度">
          <el-input-number v-model="longitude" :precision="6" :step="0.001" style="width:100%" />
        </el-form-item>
        <el-form-item label="纬度">
          <el-input-number v-model="latitude" :precision="6" :step="0.001" style="width:100%" />
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
  align-items: flex-start;
  gap: 16px;
  padding: 22px 24px 12px;
}

.card-title {
  color: var(--mx-text);
  font-size: 16px;
  font-weight: 700;
  line-height: 24px;
}

.card-subtitle {
  color: var(--mx-sub);
  font-size: 13px;
  line-height: 20px;
  margin-top: 4px;
}

.location-panel {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 14px;
  margin: 0 24px;
  padding: 16px;
  background: linear-gradient(180deg, var(--mx-soft), #ffffff);
  border: 1px solid var(--mx-border-strong);
  border-radius: 10px;
}

.location-state {
  width: 42px;
  height: 42px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--mx-muted);
  background: var(--el-fill-color);
  font-size: 20px;
}

.location-state.active {
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}

.location-main {
  min-width: 0;
}

.location-kicker {
  color: var(--mx-sub);
  font-size: 13px;
  line-height: 20px;
}

.location-address {
  color: #172033;
  font-size: 15px;
  font-weight: 700;
  line-height: 24px;
  margin-top: 2px;
  word-break: break-word;
}

.location-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.location-meta span {
  color: #42526b;
  font-size: 12px;
  line-height: 20px;
  padding: 3px 8px;
  background: #f1f5fb;
  border: 1px solid var(--mx-border);
  border-radius: 6px;
}

.section-card :deep(.el-form) {
  padding: 16px 24px 24px;
}

.location-form-grid {
  display: grid;
  grid-template-columns: minmax(160px, 220px) minmax(160px, 220px) minmax(280px, 1fr);
  gap: 14px 18px;
  align-items: start;
}

.location-form-grid .el-form-item:nth-child(4) {
  grid-column: 1 / 3;
}

.form-tip {
  color: var(--mx-muted);
  font-size: 12px;
  margin-top: 4px;
}

@media (max-width: 960px) {
  .section-head {
    flex-direction: column;
  }

  .location-form-grid {
    grid-template-columns: 1fr;
  }

  .location-form-grid .el-form-item:nth-child(4) {
    grid-column: auto;
  }
}
</style>
