<template>
  <el-dialog
    :model-value="visible"
    @update:model-value="$emit('update:visible', $event)"
    title="选择位置"
    width="800px"
    :close-on-click-modal="false"
    @opened="initMap"
  >
    <div class="amap-picker">
      <div class="amap-search">
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
        <div v-if="searchResults.length" class="search-results">
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
      </div>
      <div ref="mapContainer" class="amap-container"></div>
      <div class="amap-info">
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
      <el-button @click="$emit('cancel')">取消</el-button>
      <el-button type="primary" @click="confirmLocation" :disabled="!selectedLocation.longitude">
        确认选择
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, watch, onBeforeUnmount } from 'vue'
import { Search } from '@element-plus/icons-vue'
import AMapLoader from '@amap/amap-jsapi-loader'
import { fetchAmapConfig } from '@/api/admin'

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
let autoComplete: any = null
let placeSearch: any = null
let geocoder: any = null

async function initMap() {
  if (map) return

  try {
    const configRes: any = await fetchAmapConfig()
    const config = configRes?.data || configRes || {}

    const jsApiKey = config.jsApiKey || ''
    const securityJsCode = config.securityJsCode || ''
    const serviceHost = config.serviceHost || ''

    if (!jsApiKey) {
      console.error('未配置高德 JS API Key')
      return
    }

    if (securityJsCode) {
      (window as any)._AMapSecurityConfig = serviceHost
        ? { serviceHost }
        : { securityJsCode }
    }

    const AMap = await AMapLoader.load({
      key: jsApiKey,
      version: '2.0',
      plugins: ['AMap.Scale', 'AMap.ToolBar', 'AMap.AutoComplete', 'AMap.PlaceSearch', 'AMap.Geocoder']
    })

    const center = props.defaultCenter || config.defaultLongitude && config.defaultLatitude
      ? [config.defaultLongitude, config.defaultLatitude]
      : [113.264385, 23.129112]

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

    geocoder = new AMap.Geocoder()

    autoComplete = new AMap.AutoComplete({
      city: props.defaultCity || config.defaultCity || '全国'
    })

    placeSearch = new AMap.PlaceSearch({
      city: props.defaultCity || config.defaultCity || '全国',
      pageSize: 10
    })

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

function updateMarkerPosition(lng: number, lat: number) {
  marker.setPosition([lng, lat])
  if (circle) {
    circle.setCenter([lng, lat])
  }
  map.setCenter([lng, lat])

  selectedLocation.longitude = lng
  selectedLocation.latitude = lat

  geocoder.getAddress([lng, lat], (status: string, result: any) => {
    if (status === 'complete' && result.regeocode) {
      const addr = result.regeocode
      selectedLocation.address = addr.formattedAddress || ''
      selectedLocation.province = addr.addressComponent?.province || ''
      selectedLocation.city = addr.addressComponent?.city || ''
      selectedLocation.district = addr.addressComponent?.district || ''
      selectedLocation.adcode = addr.addressComponent?.adcode || ''
    }
  })
}

function onSearchInput(value: string) {
  if (!value.trim()) {
    searchResults.value = []
    return
  }

  autoComplete.search(value, (status: string, result: any) => {
    if (status === 'complete' && result.tips) {
      searchResults.value = result.tips
        .filter((tip: any) => tip.location)
        .map((tip: any) => ({
          id: tip.id || Math.random().toString(),
          name: tip.name,
          address: tip.address,
          district: tip.district,
          location: tip.location
        }))
    } else {
      searchResults.value = []
    }
  })
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

watch(() => props.visible, (val) => {
  if (!val) {
    searchKeyword.value = ''
    searchResults.value = []
  }
})

onBeforeUnmount(() => {
  if (map) {
    map.destroy()
    map = null
  }
})
</script>

<style scoped>
.amap-picker {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.amap-search {
  position: relative;
}

.search-results {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: #fff;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
  z-index: 100;
  max-height: 240px;
  overflow-y: auto;
}

.search-item {
  padding: 10px 16px;
  cursor: pointer;
  border-bottom: 1px solid #f0f0f0;
}

.search-item:hover {
  background: #f5f7fa;
}

.search-item:last-child {
  border-bottom: none;
}

.search-item-name {
  font-size: 14px;
  color: #303133;
  margin-bottom: 4px;
}

.search-item-address {
  font-size: 12px;
  color: #909399;
}

.amap-container {
  height: 400px;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid #dcdfe6;
}

.amap-info {
  padding: 12px;
  background: #f5f7fa;
  border-radius: 8px;
}

.info-row {
  display: flex;
  margin-bottom: 8px;
}

.info-row:last-child {
  margin-bottom: 0;
}

.info-label {
  color: #909399;
  font-size: 13px;
  min-width: 60px;
}

.info-value {
  color: #303133;
  font-size: 13px;
  word-break: break-all;
}
</style>
