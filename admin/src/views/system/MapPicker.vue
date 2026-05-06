<template>
  <div class="detail-page">
    <div class="detail-header">
      <div><span class="page-title">地图选点</span>
        <p class="page-desc">在地图上选取坐标点，用于小程序内位置展示</p>
      </div>
    </div>

    <div class="map-section">
      <div class="map-controls">
        <a-space>
          <a-input-search v-model:value="searchAddr" placeholder="搜索地址" style="width:280px" @search="searchPlace" />
          <a-tag v-if="marker.lat && marker.lng" color="blue">
            当前坐标: {{ marker.lat.toFixed(6) }}, {{ marker.lng.toFixed(6) }}
          </a-tag>
          <a-button @click="getCurrentLocation">获取当前位置</a-button>
          <a-button @click="clearMarker">清除标记</a-button>
        </a-space>
      </div>

      <div class="map-container" ref="mapRef" @click="onMapClick">
        <div v-if="!mapLoaded" class="map-loading">
          <a-spin tip="加载地图中..." />
        </div>
      </div>

      <div v-if="marker.address" class="marker-info">
        <a-descriptions :column="2" size="small" bordered>
          <a-descriptions-item label="地址">{{ marker.address }}</a-descriptions-item>
          <a-descriptions-item label="纬度">{{ marker.lat.toFixed(6) }}</a-descriptions-item>
          <a-descriptions-item label="经度">{{ marker.lng.toFixed(6) }}</a-descriptions-item>
          <a-descriptions-item label="名称">{{ marker.name || '-' }}</a-descriptions-item>
        </a-descriptions>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'

const mapRef = ref<HTMLElement | null>(null)
const mapLoaded = ref(false)
const searchAddr = ref('')

let mapInstance: any = null
let mapMarker: any = null

const marker = reactive({
  lat: 0,
  lng: 0,
  address: '',
  name: '',
})

function loadMapScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).TMap) { resolve(); return }
    const script = document.createElement('script')
    const key = import.meta.env.VITE_TENCENT_MAP_KEY || 'OB4BZ-D4W3U-B7VVO-4PJWW-6TKDJ-WPB77'
    script.src = `https://map.qq.com/api/gljs?v=1.exp&key=${key}&libraries=service`
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('地图加载失败'))
    document.head.appendChild(script)
  })
}

onMounted(async () => {
  try {
    await loadMapScript()
    initMap()
  } catch {
    message.info('腾讯地图加载失败，请检查网络或地图 API Key 配置。您仍可手动输入坐标。')
    mapLoaded.value = true
  }
})

function initMap() {
  const TMap = (window as any).TMap
  if (!TMap || !mapRef.value) return

  const center = new TMap.LatLng(39.9042, 116.4074) // 默认北京
  mapInstance = new TMap.Map(mapRef.value, {
    center,
    zoom: 12,
    viewMode: '2D',
  })
  mapLoaded.value = true
}

function setMarker(lat: number, lng: number, address = '', name = '') {
  const TMap = (window as any).TMap
  if (!TMap || !mapInstance) return

  if (mapMarker) {
    mapMarker.setMap(null)
    mapMarker = null
  }

  const pos = new TMap.LatLng(lat, lng)
  mapMarker = new TMap.MultiMarker({
    map: mapInstance,
    geometries: [{ id: 'pick', styleId: 'marker', position: pos }],
  })
  mapInstance.setCenter(pos)
  mapInstance.setZoom(15)

  marker.lat = lat
  marker.lng = lng
  marker.address = address
  marker.name = name
}

function clearMarker() {
  if (mapMarker) { mapMarker.setMap(null); mapMarker = null }
  marker.lat = 0
  marker.lng = 0
  marker.address = ''
  marker.name = ''
}

function onMapClick(e: any) {
  const lat = e.latLng.getLat()
  const lng = e.latLng.getLng()
  setMarker(lat, lng)
  reverseGeocode(lat, lng)
}

function reverseGeocode(lat: number, lng: number) {
  const TMap = (window as any).TMap
  if (!TMap) return

  const geocoder = new TMap.service.Geocoder()
  geocoder.getAddress({ location: new TMap.LatLng(lat, lng) }).then((res: any) => {
    if (res.status === 0 && res.result) {
      marker.address = res.result.address || ''
      marker.name = res.result.formatted_addresses?.recommend || ''
    }
  }).catch(() => {})
}

function searchPlace() {
  if (!searchAddr.value) return
  const TMap = (window as any).TMap
  if (!TMap) return message.warning('地图未加载')

  const geocoder = new TMap.service.Geocoder()
  geocoder.getLocation({ address: searchAddr.value }).then((res: any) => {
    if (res.status === 0 && res.result && res.result.location) {
      const { lat, lng } = res.result.location
      setMarker(lat, lng, searchAddr.value, res.result.title || '')
    } else {
      message.warning('未找到该地址')
    }
  }).catch(() => {
    message.error('搜索失败')
  })
}

function getCurrentLocation() {
  if (!navigator.geolocation) {
    message.warning('浏览器不支持获取位置')
    return
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      setMarker(pos.coords.latitude, pos.coords.longitude)
      reverseGeocode(pos.coords.latitude, pos.coords.longitude)
    },
    () => message.warning('获取位置失败，请确认浏览器已授权位置权限'),
    { enableHighAccuracy: true, timeout: 10000 },
  )
}
</script>

<style scoped lang="less">
.detail-page {
  padding: 24px;
}
.detail-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 20px;
}
.page-title {
  font-size: 18px;
  font-weight: 600;
  color: #111827;
}
.page-desc {
  margin: 4px 0 0;
  color: #6b7280;
  font-size: 13px;
}
.map-section {
  background: #fff;
  border-radius: 8px;
  padding: 16px;
}
.map-controls {
  margin-bottom: 12px;
}
.map-container {
  width: 100%;
  height: 520px;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
  overflow: hidden;
  cursor: crosshair;
}
.map-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  background: #f9fafb;
}
.marker-info {
  margin-top: 16px;
}
</style>
