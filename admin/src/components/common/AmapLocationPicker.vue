<template>
  <el-dialog
    :model-value="visible"
    @update:model-value="$emit('update:visible', $event)"
    width="960px"
    class="location-picker-dialog"
    modal-class="location-picker-modal"
    append-to-body
    align-center
    :close-on-click-modal="false"
    :lock-scroll="true"
    @opened="initMap"
  >
    <template #header>
      <div class="dialog-head">
        <div>
          <div class="dialog-title">选择地图位置</div>
          <div class="dialog-desc">搜索地点后选择，或直接点击地图微调区域中心点</div>
        </div>
      </div>
    </template>

    <div class="amap-picker">
      <div class="picker-toolbar">
        <div class="search-panel">
          <el-input
            v-model="searchKeyword"
            placeholder="搜索学校、商圈、地址..."
            clearable
            @input="onSearchInput"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
        </div>
        <div class="picker-hint">
          拖动蓝色标记可微调
        </div>
      </div>

      <div class="picker-layout">
        <div v-if="searchResults.length" class="search-results">
          <div class="search-results-title">搜索结果</div>
          <div
            v-for="item in searchResults"
            :key="item.id"
            class="search-item"
            @click="selectSearchResult(item)"
          >
            <div class="search-item-name">{{ item.name }}</div>
            <div class="search-item-address">{{ item.address || item.district }}</div>
          </div>
        </div>
        <div class="map-shell">
          <div ref="mapContainer" class="amap-container"></div>
        </div>
      </div>

      <div class="location-summary">
        <div class="info-row">
          <span class="info-label">地址：</span>
          <span class="info-value">{{ selectedLocation.address || '未选择' }}</span>
        </div>
        <div class="info-row">
          <span class="info-label">坐标：</span>
          <span class="info-value">
            {{ selectedLocation.longitude ? `${selectedLocation.longitude}, ${selectedLocation.latitude}` : '未选择' }}
          </span>
        </div>
        <div class="info-row" v-if="selectedLocation.poiName">
          <span class="info-label">POI：</span>
          <span class="info-value">{{ selectedLocation.poiName }}</span>
        </div>
      </div>
    </div>
    <template #footer>
      <div class="dialog-footer">
        <el-button @click="cancelPicker">取消</el-button>
        <el-button type="primary" @click="confirmLocation" :disabled="!selectedLocation.longitude">
          确认选择
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, watch, onBeforeUnmount } from 'vue'
import { Search } from '@element-plus/icons-vue'
import AMapLoader from '@amap/amap-jsapi-loader'
import { amapPlaceSearch, amapRegeocode, fetchAmapRuntimeConfig } from '@/api/admin'

interface LocationResult {
  longitude: number
  latitude: number
  address: string
  province: string
  city: string
  district: string
  adcode: string
  poiName: string
}

interface SearchResult {
  id: string
  name: string
  address: string
  district: string
  location: { lng: number; lat: number }
}

const props = defineProps<{
  visible: boolean
  defaultCenter?: [number, number]
  defaultCity?: string
  serviceRadius?: number
  distanceLimit?: number
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  confirm: [location: LocationResult]
  cancel: []
}>()

const mapContainer = ref<HTMLElement>()
const searchKeyword = ref('')
const searchResults = ref<SearchResult[]>([])

const selectedLocation = reactive<LocationResult>({
  longitude: 0,
  latitude: 0,
  address: '',
  province: '',
  city: '',
  district: '',
  adcode: '',
  poiName: ''
})

let map: any = null
let marker: any = null
let circle: any = null
let runtimeConfig: Record<string, any> = {}
let searchTimer: ReturnType<typeof setTimeout> | null = null
let searchRequestSeq = 0

async function initMap() {
  if (map) return

  try {
    const configRes: any = await fetchAmapRuntimeConfig()
    const config = configRes?.data || configRes || {}
    runtimeConfig = config

    const jsApiKey = config.jsApiKey || ''
    const securityJsCode = config.securityJsCode || ''
    const serviceHost = config.serviceHost || ''

    if (!jsApiKey) {
      console.error('未配置高德 JS API Key')
      return
    }

    if (serviceHost) {
      (window as any)._AMapSecurityConfig = serviceHost
        ? { serviceHost }
        : undefined
    } else if (securityJsCode && securityJsCode !== jsApiKey && securityJsCode !== '******') {
      (window as any)._AMapSecurityConfig = { securityJsCode }
    }

    const AMap = await AMapLoader.load({
      key: jsApiKey,
      version: '2.0',
      plugins: ['AMap.Scale', 'AMap.ToolBar']
    })

    const center = props.defaultCenter
      || (config.defaultLongitude && config.defaultLatitude
        ? [config.defaultLongitude, config.defaultLatitude]
        : [113.264385, 23.129112])

    map = new AMap.Map(mapContainer.value, {
      zoom: 13,
      center: center,
      resizeEnable: true
    })

    map.addControl(new AMap.Scale())
    map.addControl(new AMap.ToolBar())

    marker = new AMap.Marker({
      position: center,
      draggable: true,
      cursor: 'move'
    })
    map.add(marker)

    if (props.serviceRadius && props.serviceRadius > 0) {
      circle = new AMap.Circle({
        center: center,
        radius: props.serviceRadius,
        strokeColor: '#409eff',
        strokeWeight: 2,
        strokeOpacity: 0.8,
        fillColor: '#409eff',
        fillOpacity: 0.1,
        cursor: 'pointer'
      })
      map.add(circle)
    }

    map.on('click', (e: any) => {
      const lnglat = e.lnglat
      updateMarkerPosition(lnglat.lng, lnglat.lat)
    })

    marker.on('dragend', () => {
      const pos = marker.getPosition()
      updateMarkerPosition(pos.lng, pos.lat)
    })

    if (props.defaultCenter) {
      updateMarkerPosition(props.defaultCenter[0], props.defaultCenter[1])
    }
  } catch (error) {
    console.error('初始化地图失败:', error)
  }
}

async function updateMarkerPosition(lng: number, lat: number) {
  marker.setPosition([lng, lat])
  if (circle) {
    circle.setCenter([lng, lat])
  }
  map.setCenter([lng, lat])

  selectedLocation.longitude = lng
  selectedLocation.latitude = lat

  try {
    const res: any = await amapRegeocode(lng, lat)
    if (res?.success === false) return
    const addr = res?.data || res || {}
    selectedLocation.address = normalizeLocationText(addr.formattedAddress || addr.address)
    selectedLocation.province = normalizeLocationText(addr.province)
    selectedLocation.city = normalizeLocationText(addr.city)
    selectedLocation.district = normalizeLocationText(addr.district)
    selectedLocation.adcode = normalizeLocationText(addr.adcode)
  } catch {
    // 地图选点已完成，逆地址解析失败时保留坐标，允许用户手动补地址。
  }
}

function onSearchInput(value: string) {
  const keyword = value.trim()
  if (searchTimer) clearTimeout(searchTimer)
  if (!keyword) {
    searchResults.value = []
    return
  }

  const requestSeq = ++searchRequestSeq
  searchTimer = setTimeout(async () => {
    try {
      const city = props.defaultCity || runtimeConfig.defaultCity || '全国'
      const res: any = await amapPlaceSearch(keyword, city)
      if (requestSeq !== searchRequestSeq) return
      if (res?.success === false) {
        searchResults.value = []
        return
      }
      const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : []
      searchResults.value = list
        .map((item: any, index: number) => ({
          id: item.id || `${item.name || keyword}_${index}`,
          name: normalizeLocationText(item.name) || keyword,
          address: normalizeLocationText(item.address),
          district: normalizeLocationText(item.district),
          location: { lng: Number(item.longitude), lat: Number(item.latitude) }
        }))
        .filter((item: SearchResult) => Number.isFinite(item.location.lng) && Number.isFinite(item.location.lat))
    } catch {
      searchResults.value = []
    }
  }, 300)
}

function selectSearchResult(item: SearchResult) {
  searchResults.value = []
  searchKeyword.value = item.name

  if (item.location) {
    updateMarkerPosition(item.location.lng, item.location.lat)
    selectedLocation.poiName = item.name
  }
}

function confirmLocation() {
  emit('confirm', { ...selectedLocation })
  emit('update:visible', false)
}

function normalizeLocationText(value: any): string {
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined && item !== null && String(item).trim())
      .map((item) => String(item).trim())
      .join(' ')
  }
  if (value === undefined || value === null) return ''
  return String(value).trim()
}

function cancelPicker() {
  emit('cancel')
  emit('update:visible', false)
}

function applyDefaultCenter() {
  if (!map || !marker || !props.defaultCenter) return
  const [lng, lat] = props.defaultCenter
  if (!Number.isFinite(lng) || !Number.isFinite(lat) || !lng || !lat) return
  map.resize?.()
  updateMarkerPosition(lng, lat)
}

watch(() => props.visible, (val) => {
  if (!val) {
    searchKeyword.value = ''
    searchResults.value = []
    if (searchTimer) clearTimeout(searchTimer)
  } else if (map) {
    setTimeout(applyDefaultCenter, 0)
  }
})

watch(() => props.defaultCenter, () => {
  if (props.visible && map) applyDefaultCenter()
})

onBeforeUnmount(() => {
  if (searchTimer) clearTimeout(searchTimer)
  if (map) {
    map.destroy()
    map = null
  }
})
</script>

<style scoped>
:global(.location-picker-modal) {
  backdrop-filter: blur(2px);
}

:global(.location-picker-dialog) {
  max-width: calc(100vw - 48px);
  max-height: calc(100vh - 64px);
  margin: 0 !important;
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 24px 70px rgba(15, 23, 42, 0.22);
  display: flex;
  flex-direction: column;
}

:global(.location-picker-dialog .el-dialog__header) {
  margin: 0;
  padding: 18px 24px 14px;
  border-bottom: 1px solid #e7edf6;
  background: linear-gradient(180deg, #ffffff, #f8fbff);
}

:global(.location-picker-dialog .el-dialog__body) {
  flex: 1;
  min-height: 0;
  padding: 16px 24px 12px;
  overflow: auto;
}

:global(.location-picker-dialog .el-dialog__footer) {
  padding: 14px 24px 18px;
  border-top: 1px solid #e8eef7;
  background: #fff;
}

:global(.location-picker-dialog .el-dialog__headerbtn) {
  top: 15px;
  right: 18px;
}

.dialog-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-right: 36px;
}

.dialog-title {
  color: #101828;
  font-size: 17px;
  font-weight: 800;
  line-height: 24px;
}

.dialog-desc {
  color: #667085;
  font-size: 12px;
  line-height: 18px;
  margin-top: 2px;
}

.amap-picker {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}

.picker-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: #f7faff;
  border: 1px solid #e2ebf7;
  border-radius: 10px;
}

.search-panel {
  flex: 1;
  min-width: 0;
}

.picker-hint {
  flex: none;
  color: #64748b;
  font-size: 12px;
  line-height: 20px;
  padding: 6px 10px;
  background: #f5f8ff;
  border: 1px solid #dbe7ff;
  border-radius: 6px;
}

.picker-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
  min-height: 0;
}

.search-results {
  background: #fff;
  border: 1px solid #d8e2f0;
  border-radius: 10px;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
  max-height: 132px;
  overflow-y: auto;
  padding: 4px;
}

.search-results-title {
  color: #64748b;
  font-size: 12px;
  line-height: 20px;
  padding: 4px 10px 6px;
}

.search-item {
  padding: 9px 10px;
  cursor: pointer;
  border-radius: 6px;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.search-item:hover {
  background: #f3f7ff;
}

.search-item-name {
  font-size: 14px;
  color: #303133;
  margin-bottom: 4px;
  font-weight: 600;
}

.search-item-address {
  font-size: 12px;
  color: #7a8798;
}

.map-shell {
  padding: 1px;
  background: linear-gradient(180deg, #dbeafe, #eef4ff);
  border-radius: 10px;
}

.amap-container {
  height: clamp(260px, 42vh, 360px);
  border-radius: 10px;
  overflow: hidden;
  background: #eef4ff;
}

.location-summary {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 18px;
  padding: 14px 16px;
  background: #f8fbff;
  border: 1px solid #dfe8f5;
  border-radius: 10px;
}

.info-row {
  display: flex;
  align-items: flex-start;
  min-width: 0;
}

.info-row:first-child {
  grid-column: 1 / -1;
}

.info-label {
  color: #909399;
  font-size: 13px;
  min-width: 46px;
  line-height: 20px;
}

.info-value {
  color: #303133;
  font-size: 13px;
  line-height: 20px;
  word-break: break-all;
  min-width: 0;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.dialog-footer :deep(.el-button) {
  min-width: 88px;
}

@media (max-width: 760px) {
  .location-summary {
    grid-template-columns: 1fr;
  }

  .amap-container {
    height: 300px;
  }

  .picker-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .picker-hint {
    width: fit-content;
  }

  :global(.location-picker-dialog) {
    max-width: calc(100vw - 24px);
    max-height: calc(100vh - 24px);
  }
}
</style>
