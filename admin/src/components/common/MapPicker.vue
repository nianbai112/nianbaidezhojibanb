<template>
  <div class="map-picker">
    <div class="map-search">
      <a-input-search
        v-model:value="searchKeyword"
        placeholder="搜索地点后按回车..."
        allow-clear
        @search="onSearch"
        :loading="searching"
        style="margin-bottom: 12px"
      />
    </div>
    <div class="map-wrapper">
      <div ref="mapContainer" class="map-container"></div>
      <div v-if="loading" class="map-loading">
        <a-spin tip="地图加载中..." />
      </div>
      <div v-if="!loaded && !loading" class="map-placeholder">
        <EnvironmentOutlined />
        <span>点击下方按钮加载地图</span>
        <a-button type="primary" @click="initMap" :loading="loading">加载地图</a-button>
      </div>
    </div>
    <div class="map-footer" v-if="pickedLng != null && pickedLat != null">
      <div class="map-address">
        <EnvironmentOutlined style="color: #1677ff" />
        <span>{{ pickedAddress || `${pickedLng.toFixed(6)}, ${pickedLat.toFixed(6)}` }}</span>
      </div>
      <div class="map-coords">经度 {{ pickedLng.toFixed(6) }} / 纬度 {{ pickedLat.toFixed(6) }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onBeforeUnmount, nextTick } from 'vue'
import { EnvironmentOutlined } from '@ant-design/icons-vue'

const props = defineProps<{
  modelLng?: number | null
  modelLat?: number | null
}>()

const emit = defineEmits<{
  (e: 'update:modelLng', val: number): void
  (e: 'update:modelLat', val: number): void
  (e: 'update:modelAddress', val: string): void
}>()

const mapContainer = ref<HTMLDivElement>()
const loading = ref(false)
const searching = ref(false)
const loaded = ref(false)
const searchKeyword = ref('')
const pickedLng = ref<number | null>(props.modelLng ?? null)
const pickedLat = ref<number | null>(props.modelLat ?? null)
const pickedAddress = ref('')

let mapInstance: any = null
let markerInstance: any = null
let geocoderInstance: any = null
let placeSearchInstance: any = null
let autoCompleteInstance: any = null

watch(() => [props.modelLng, props.modelLat], ([lng, lat]) => {
  if (lng != null && lat != null) {
    pickedLng.value = lng
    pickedLat.value = lat
    if (mapInstance) {
      setMarker(lng, lat, pickedAddress.value || undefined)
    }
  }
})

function loadAmapScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).AMap) {
      resolve()
      return
    }
    const key = import.meta.env.VITE_AMAP_JS_KEY || import.meta.env.VITE_AMAP_KEY
    if (!key) {
      reject(new Error('未配置高德地图 Key（VITE_AMAP_KEY）'))
      return
    }
    // 安全密钥必须在脚本加载前设置（2.0 版本）
    const securityJsCode = import.meta.env.VITE_AMAP_SECURITY_CODE || ''
    if (securityJsCode) {
      ;(window as any)._AMapSecurityConfig = { securityJsCode }
    }

    const script = document.createElement('script')
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${key}&plugin=AMap.Geocoder,AMap.PlaceSearch,AMap.AutoComplete`
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('高德地图脚本加载失败'))
    document.head.appendChild(script)
  })
}

async function initMap() {
  if (loading.value) return
  loading.value = true
  try {
    await loadAmapScript()
    await nextTick()
    createMapInstance()
    loaded.value = true

    // 如果有初始坐标，设置标记
    if (pickedLng.value != null && pickedLat.value != null) {
      setTimeout(() => {
        setMarker(pickedLng.value!, pickedLat.value!, pickedAddress.value || undefined)
      }, 300)
    }
  } catch (e: any) {
    console.error('地图加载失败:', e.message)
  } finally {
    loading.value = false
  }
}

function createMapInstance() {
  const AMap = (window as any).AMap
  if (!AMap || !mapContainer.value) return

  const center: [number, number] =
    pickedLng.value != null && pickedLat.value != null
      ? [pickedLng.value, pickedLat.value]
      : [116.397428, 39.90923] // 默认北京天安门

  mapInstance = new AMap.Map(mapContainer.value, {
    zoom: 15,
    center,
    resizeEnable: true,
  })

  // 点击地图选点
  mapInstance.on('click', (e: any) => {
    const lng = e.lnglat.getLng()
    const lat = e.lnglat.getLat()
    reverseGeocode(lng, lat)
  })

  geocoderInstance = new AMap.Geocoder({ map: mapInstance })
  placeSearchInstance = new AMap.PlaceSearch({ map: mapInstance })

  if (AMap.AutoComplete) {
    autoCompleteInstance = new AMap.AutoComplete({ citylimit: false })
  }
}

function reverseGeocode(lng: number, lat: number) {
  if (!geocoderInstance) {
    setMarkerDirect(lng, lat, '')
    return
  }
  geocoderInstance.getAddress([lng, lat], (status: string, result: any) => {
    if (status === 'complete' && result?.info === 'OK') {
      const addr = result.regeocode?.formattedAddress || ''
      setMarker(lng, lat, addr)
    } else {
      setMarker(lng, lat, '')
    }
  })
}

function setMarker(lng: number, lat: number, address?: string) {
  setMarkerDirect(lng, lat, address)

  // 逆地理编码获取地址
  if (!address && geocoderInstance) {
    geocoderInstance.getAddress([lng, lat], (status: string, result: any) => {
      if (status === 'complete' && result?.info === 'OK') {
        const addr = result.regeocode?.formattedAddress || ''
        pickedAddress.value = addr
        emit('update:modelAddress', addr)
      }
    })
  }
}

function setMarkerDirect(lng: number, lat: number, address?: string) {
  const AMap = (window as any).AMap
  if (!AMap) return

  pickedLng.value = lng
  pickedLat.value = lat
  if (address !== undefined) {
    pickedAddress.value = address
    emit('update:modelAddress', address)
  }
  emit('update:modelLng', lng)
  emit('update:modelLat', lat)

  if (!mapInstance) return

  if (markerInstance) {
    markerInstance.setPosition([lng, lat])
  } else {
    markerInstance = new AMap.Marker({
      position: [lng, lat],
      map: mapInstance,
      animation: 'AMAP_ANIMATION_DROP',
      draggable: true,
    })
    // 拖拽结束后更新地址
    markerInstance.on('dragend', (e: any) => {
      const dragLng = e.lnglat.getLng()
      const dragLat = e.lnglat.getLat()
      reverseGeocode(dragLng, dragLat)
    })
  }
  mapInstance.setCenter([lng, lat])
}

async function onSearch(value: string) {
  if (!value || !value.trim()) return
  searching.value = true
  try {
    if (!loaded.value) {
      await initMap()
    }
    const AMap = (window as any).AMap
    if (!AMap || !placeSearchInstance) return

    placeSearchInstance.search(value, (status: string, result: any) => {
      searching.value = false
      if (status === 'complete' && result?.info === 'OK') {
        const pois = result.poiList?.pois || []
        if (pois.length > 0) {
          const poi = pois[0]
          const lng = poi.location.getLng()
          const lat = poi.location.getLat()
          const address = poi.pname + poi.cityname + poi.adname + poi.name
          setMarker(lng, lat, address)
        }
      }
    })
  } catch {
    searching.value = false
  }
}

onBeforeUnmount(() => {
  if (mapInstance) {
    mapInstance.destroy?.()
    mapInstance = null
  }
})
</script>

<style scoped>
.map-picker {
  border: 1px solid #e8e8e8;
  border-radius: 8px;
  overflow: hidden;
}
.map-search {
  padding: 10px 12px 0;
}
.map-wrapper {
  position: relative;
  width: 100%;
  height: 320px;
}
.map-container {
  width: 100%;
  height: 100%;
}
.map-loading,
.map-placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background: #fafafa;
  color: #999;
  font-size: 14px;
}
.map-placeholder .anticon {
  font-size: 36px;
}
.map-footer {
  padding: 10px 12px;
  background: #fafafa;
  border-top: 1px solid #f0f0f0;
}
.map-address {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #333;
}
.map-coords {
  margin-top: 4px;
  font-size: 12px;
  color: #999;
}
</style>
