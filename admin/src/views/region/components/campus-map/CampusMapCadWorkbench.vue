<template>
  <div class="cad-workbench" :style="canvasStyle">
    <div ref="mapRef" class="cad-map"></div>

    <div class="cad-toolbar">
      <button type="button" @click="fitView">适配</button>
      <span>{{ featureRecords.length }} 对象 / {{ layerRows.length }} 图层</span>
    </div>

    <div v-if="layerRows.length" class="cad-layer-panel">
      <div class="cad-layer-title">图层</div>
      <button
        v-for="layer in layerRows"
        :key="layer.name"
        type="button"
        class="cad-layer-row"
        :class="{ muted: hiddenLayerKeys.has(layer.name) }"
        @click="toggleLayer(layer.name)"
      >
        <span>{{ layer.name }}</span>
        <small>{{ layer.count }}</small>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import 'ol/ol.css'
import Map from 'ol/Map'
import View from 'ol/View'
import Feature from 'ol/Feature'
import Projection from 'ol/proj/Projection'
import Point from 'ol/geom/Point'
import LineString from 'ol/geom/LineString'
import Polygon from 'ol/geom/Polygon'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import { Circle as CircleStyle, Fill, Stroke, Style, Text } from 'ol/style'
import { defaults as defaultControls } from 'ol/control'
import { defaults as defaultInteractions } from 'ol/interaction'
import { cadFeatureRecords, cadLayerRows, isCadLayerVisible } from './cadWorkbenchModel.mjs'

type RatioPoint = {
  xRatio: number
  yRatio: number
}

type CadItem = {
  id: string
  xRatio?: number
  yRatio?: number
  title?: string
  color?: string
  sourceLayer?: string
  points?: RatioPoint[]
}

type EditableKind = 'poi' | 'area' | 'route' | 'calibration'

const props = defineProps<{
  pois: CadItem[]
  areas: CadItem[]
  routes: CadItem[]
  calibrationPoints: CadItem[]
  draftAreaPoints: RatioPoint[]
  draftRoutePoints: RatioPoint[]
  selectedId: string
  canvasStyle: Record<string, string>
}>()

const emit = defineEmits<{
  (event: 'canvas-click', point: RatioPoint): void
  (event: 'select-layer-item', kind: EditableKind, id: string): void
}>()

const mapRef = ref<HTMLElement>()
const hiddenLayerKeys = ref(new Set<string>())
const source = new VectorSource()
const projection = new Projection({
  code: 'CAD_RATIO',
  units: 'pixels',
  extent: [0, 0, 100, 100],
})
const layer = new VectorLayer({
  source,
  style: featureStyle,
})

let map: Map | null = null

const featureRecords = computed(() => cadFeatureRecords({
  pois: props.pois,
  areas: props.areas,
  routes: props.routes,
  calibrationPoints: props.calibrationPoints,
}))
const layerRows = computed(() => cadLayerRows(featureRecords.value))

onMounted(() => {
  map = new Map({
    target: mapRef.value,
    layers: [layer],
    controls: defaultControls({ attribution: false, rotate: false }),
    interactions: defaultInteractions({ altShiftDragRotate: false, pinchRotate: false }),
    view: new View({
      projection,
      center: [50, 50],
      zoom: 3,
      minZoom: 1,
      maxZoom: 10,
      extent: [-25, -25, 125, 125],
    }),
  })
  map.on('singleclick', handleMapClick)
  updateFeatures()
  nextTick(() => fitView())
})

onBeforeUnmount(() => {
  if (map) {
    map.un('singleclick', handleMapClick)
    map.setTarget(undefined)
    map = null
  }
})

watch(() => [
  props.pois,
  props.areas,
  props.routes,
  props.calibrationPoints,
  props.draftAreaPoints,
  props.draftRoutePoints,
  hiddenLayerKeys.value,
], updateFeatures, { deep: true })

watch(() => props.selectedId, () => {
  layer.changed()
})

function toggleLayer(layerName: string) {
  const next = new Set(hiddenLayerKeys.value)
  if (next.has(layerName)) next.delete(layerName)
  else next.add(layerName)
  hiddenLayerKeys.value = next
}

function updateFeatures() {
  source.clear()
  featureRecords.value.forEach((record: any) => {
    if (!isCadLayerVisible(record.layer, hiddenLayerKeys.value)) return
    const feature = createFeature(record)
    if (feature) source.addFeature(feature)
  })
  addDraftFeature('draftArea', props.draftAreaPoints)
  addDraftFeature('draftRoute', props.draftRoutePoints)
}

function createFeature(record: any) {
  let geometry = null
  if (record.kind === 'poi' || record.kind === 'calibration') {
    geometry = new Point(toCoordinate(record))
  } else if (record.kind === 'area') {
    const ring = record.points.map(toCoordinate)
    if (ring.length < 3) return null
    ring.push(ring[0])
    geometry = new Polygon([ring])
  } else if (record.kind === 'route') {
    if (record.points.length < 2) return null
    geometry = new LineString(record.points.map(toCoordinate))
  }
  if (!geometry) return null
  const feature = new Feature({ geometry })
  feature.setProperties({
    id: record.id,
    kind: record.kind,
    title: record.title,
    color: record.color,
    layer: record.layer,
  })
  return feature
}

function addDraftFeature(kind: 'draftArea' | 'draftRoute', points: RatioPoint[]) {
  if (!points.length) return
  const coords = points.map(toCoordinate)
  const geometry = kind === 'draftArea' && coords.length >= 3
    ? new Polygon([[...coords, coords[0]]])
    : new LineString(coords)
  const feature = new Feature({ geometry })
  feature.setProperties({ kind, title: kind === 'draftArea' ? '区域草稿' : '路线草稿' })
  source.addFeature(feature)
}

function handleMapClick(event: any) {
  if (!map) return
  const feature = map.forEachFeatureAtPixel(event.pixel, (item) => item)
  const kind = feature?.get('kind')
  const id = feature?.get('id')
  if (id && (kind === 'poi' || kind === 'area' || kind === 'route' || kind === 'calibration')) {
    emit('select-layer-item', kind, id)
    return
  }
  emit('canvas-click', fromCoordinate(event.coordinate))
}

function fitView() {
  if (!map) return
  map.getView().fit([0, 0, 100, 100], {
    padding: [42, 42, 42, 42],
    duration: 120,
    nearest: true,
  })
}

function toCoordinate(point: RatioPoint) {
  return [clampRatio(point.xRatio) * 100, (1 - clampRatio(point.yRatio)) * 100]
}

function fromCoordinate(coordinate: number[]) {
  return {
    xRatio: clampRatio(coordinate[0] / 100),
    yRatio: clampRatio(1 - coordinate[1] / 100),
  }
}

function clampRatio(value: number) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  return Math.min(1, Math.max(0, numeric))
}

function featureStyle(feature: any) {
  const kind = feature.get('kind')
  const id = feature.get('id')
  const selected = id && id === props.selectedId
  const color = feature.get('color') || (kind === 'route' ? '#f97316' : kind === 'calibration' ? '#dc2626' : '#2563eb')
  const width = selected ? 4 : 2

  if (kind === 'area' || kind === 'draftArea') {
    return new Style({
      stroke: new Stroke({ color: selected ? '#111827' : color, width }),
      fill: new Fill({ color: kind === 'draftArea' ? 'rgba(20, 184, 166, .16)' : 'rgba(37, 99, 235, .12)' }),
      text: selected ? labelText(feature.get('title')) : undefined,
    })
  }

  if (kind === 'route' || kind === 'draftRoute') {
    return new Style({
      stroke: new Stroke({
        color: selected ? '#111827' : color,
        width: kind === 'draftRoute' ? 3 : width + 1,
        lineDash: kind === 'draftRoute' ? [8, 8] : undefined,
      }),
      text: selected ? labelText(feature.get('title')) : undefined,
    })
  }

  return new Style({
    image: new CircleStyle({
      radius: selected ? 8 : 6,
      fill: new Fill({ color }),
      stroke: new Stroke({ color: '#ffffff', width: 2 }),
    }),
    text: labelText(feature.get('title'), selected ? 18 : 14),
  })
}

function labelText(title = '', offsetY = 14) {
  return new Text({
    text: String(title || ''),
    offsetY,
    font: '12px sans-serif',
    fill: new Fill({ color: '#111827' }),
    stroke: new Stroke({ color: 'rgba(255,255,255,.92)', width: 4 }),
    overflow: true,
  })
}
</script>

<style scoped>
.cad-workbench {
  position: relative;
  width: 100%;
  min-height: 620px;
  max-height: 860px;
  overflow: hidden;
  border: 1px solid #d8e1ee;
  border-radius: 6px;
  background-color: var(--mx-soft);
  background-position: center;
  background-repeat: no-repeat;
  background-size: 100% 100%;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .72);
}

.cad-map {
  position: absolute;
  inset: 0;
}

.cad-toolbar,
.cad-layer-panel {
  position: absolute;
  z-index: 2;
  border: 1px solid rgba(148, 163, 184, .28);
  border-radius: 6px;
  background: rgba(255, 255, 255, .92);
  box-shadow: 0 10px 28px rgba(15, 23, 42, .12);
  backdrop-filter: blur(12px);
}

.cad-toolbar {
  top: 14px;
  left: 14px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 10px;
  color: var(--mx-sub);
  font-size: 12px;
}

.cad-toolbar button,
.cad-layer-row {
  border: 0;
  background: transparent;
  color: var(--el-color-primary-dark-2);
  cursor: pointer;
  font: inherit;
}

.cad-layer-panel {
  right: 14px;
  top: 14px;
  width: 176px;
  max-height: 340px;
  overflow: auto;
  padding: 8px;
}

.cad-layer-title {
  margin-bottom: 6px;
  color: var(--mx-text);
  font-size: 12px;
  font-weight: 800;
}

.cad-layer-row {
  display: grid;
  width: 100%;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  border-radius: 6px;
  padding: 7px 8px;
  color: var(--el-text-color-regular);
  text-align: left;
}

.cad-layer-row:hover {
  background: var(--el-color-primary-light-9);
}

.cad-layer-row span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cad-layer-row small {
  color: var(--mx-sub);
}

.cad-layer-row.muted {
  color: var(--mx-muted);
  text-decoration: line-through;
}

@media (max-width: 768px) {
  .cad-workbench {
    min-height: 460px;
  }

  .cad-layer-panel {
    top: auto;
    right: 10px;
    bottom: 10px;
    width: 150px;
    max-height: 180px;
  }
}
</style>
