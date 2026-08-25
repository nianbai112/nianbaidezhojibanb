<template>
  <section id="map" class="map-section">
    <header class="section-head">
      <p class="eyebrow">02 / CAMPUS MAP</p>
      <h2>把整个校园，铺在一张图上</h2>
    </header>
    <div class="map-grid">
      <div class="map-panel">
        <div class="map-panel-head">
          <span>{{ mapTitle }}</span>
          <span>{{ sourceLabel }}</span>
        </div>
        <div class="map-canvas">
          <div v-if="loading" class="map-loading">地图加载中…</div>
          <template v-else>
            <div v-if="schoolNotice" class="map-notice">{{ schoolNotice }}</div>
            <svg :viewBox="`0 0 ${W} ${H}`" class="map-svg" role="img" aria-label="灵萌校园地图">
              <!-- 后台发布的校园底图 -->
              <image
                v-if="baseImage"
                :href="baseImage.url"
                :x="baseImage.x"
                :y="baseImage.y"
                :width="baseImage.width"
                :height="baseImage.height"
                :opacity="baseImage.opacity"
                preserveAspectRatio="none"
                class="map-base-image"
              />
              <!-- 区块与道路 -->
              <path
                v-for="f in shapes"
                :key="f.key"
                :d="f.d"
                :class="['map-feature', f.kind, { active: activeName === f.name, unopened: f.unopened }]"
                :style="shapeStyle(f)"
                :fill-rule="f.holes ? 'evenodd' : 'nonzero'"
                @mouseenter="activeName = f.name"
                @mouseleave="activeName = ''"
                @click="selectFeature(f)"
              />
              <!-- 区块名称 -->
              <text
                v-for="f in labeledShapes"
                :key="`${f.key}-label`"
                :x="f.labelAt[0]"
                :y="f.labelAt[1]"
                class="map-label"
              >{{ f.name }}</text>
              <!-- 兴趣点 -->
              <g
                v-for="f in pois"
                :key="f.key"
                :class="['map-poi', { active: activeName === f.name, unopened: f.unopened }]"
                @mouseenter="activeName = f.name"
                @mouseleave="activeName = ''"
                @click="selectFeature(f)"
              >
                <circle :cx="f.at[0]" :cy="f.at[1]" r="14" class="poi-halo" />
                <circle :cx="f.at[0]" :cy="f.at[1]" r="6" class="poi-dot" :style="f.color ? { fill: f.color } : undefined" />
                <text :x="f.at[0] + 20" :y="f.at[1] + 5" class="poi-label">{{ f.name }}</text>
              </g>
            </svg>
            <div v-if="activeName && !selected" class="map-tooltip">{{ activeName }}</div>
            <!-- 点击/触摸后的详情卡（移动端可用） -->
            <div v-if="selected" class="map-detail-card">
              <button type="button" class="map-detail-close" aria-label="关闭" @click="selected = null">×</button>
              <strong>{{ selected.name }}</strong>
              <span class="map-detail-kind">{{ selected.kindLabel }}</span>
              <p v-if="selected.unopened" class="map-detail-unopened">
                {{ selected.message || '暂未开放，敬请期待' }}
              </p>
            </div>
            <p v-if="errorNote" class="map-error-note">{{ errorNote }}</p>
          </template>
        </div>
      </div>
      <aside class="map-side">
        <p class="eyebrow">LEGEND / 图例</p>
        <ul class="map-legend">
          <li><span class="chip building"></span>教学与办公</li>
          <li><span class="chip dorm"></span>宿舍与生活</li>
          <li><span class="chip sport"></span>运动场地</li>
          <li><span class="chip nature"></span>景观绿地</li>
          <li><span class="chip poi"></span>出入口与点位</li>
        </ul>
        <p class="eyebrow">PLACES / 场所</p>
        <ul class="map-places">
          <li v-for="p in placeNames" :key="p">
            <button type="button" class="map-place-btn" @click="selectByName(p)">{{ p }}</button>
          </li>
        </ul>
      </aside>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { gsap } from 'gsap'

const W = 1000
const H = 640
const PAD = 36

type FeatureProps = {
  name?: string
  title?: string
  Text?: string
  semanticType?: string
  kind?: string
  type?: string
  color?: string
  serviceStatus?: string
  unavailableMessage?: string
}
type RenderShape = {
  key: string
  d: string
  kind: string
  name: string
  holes: boolean
  labelAt: [number, number]
  color: string
  unopened: boolean
  message: string
  kindLabel: string
}
type RenderPoi = {
  key: string
  at: [number, number]
  name: string
  kind: string
  color: string
  unopened: boolean
  message: string
  kindLabel: string
}
type SelectedFeature = { name: string; kindLabel: string; unopened: boolean; message: string }
type BaseImage = { url: string; x: number; y: number; width: number; height: number; opacity: number }

const shapes = ref<RenderShape[]>([])
const pois = ref<RenderPoi[]>([])
const baseImage = ref<BaseImage | null>(null)
const mapTitle = ref('校园地图')
const sourceLabel = ref('')
const activeName = ref('')
const selected = ref<SelectedFeature | null>(null)
const loading = ref(true)
const errorNote = ref('')
const schoolNotice = ref('')

const labeledShapes = computed(() => shapes.value.filter(s => s.name && s.kind !== 'road'))
const placeNames = computed(() => {
  const names = [...shapes.value.map(s => s.name), ...pois.value.map(p => p.name)].filter(Boolean)
  return Array.from(new Set(names)).slice(0, 8)
})

/* ---------- 后台语义类型 → 官网图例分类 ---------- */
const SEMANTIC_KIND: Record<string, string> = {
  library: 'building', teaching: 'building', office: 'building',
  research: 'building', museum: 'building', building: 'building',
  dorm: 'dorm', canteen: 'dorm',
  sports: 'sport', sport: 'sport',
  nature: 'nature', water: 'nature', green: 'nature',
  gate: 'poi', parking: 'poi', express: 'poi', shop: 'poi',
  clinic: 'poi', toilet: 'poi', bus: 'poi', service: 'poi', entrance: 'poi',
}
const KIND_LABEL: Record<string, string> = {
  building: '教学与办公',
  dorm: '宿舍与生活',
  sport: '运动场地',
  nature: '景观绿地',
  road: '道路',
  poi: '出入口与点位',
}

function classify(feature: any, layerName: string): string {
  const props: FeatureProps = feature?.properties || {}
  // 优先使用后台配置的语义类型，正则只做兜底
  const semantic = String(props.semanticType || props.kind || '').toLowerCase()
  if (semantic && SEMANTIC_KIND[semantic]) return SEMANTIC_KIND[semantic]
  const text = `${layerName} ${props.kind || ''} ${props.type || ''} ${props.name || ''}`.toLowerCase()
  const g = feature?.geometry?.type || ''
  if (/road|path|way|路|道|street/.test(text) || g.includes('LineString')) return 'road'
  if (/water|lake|river|湖|河|水/.test(text)) return 'nature'
  if (/green|park|garden|绿|园|林|草/.test(text)) return 'nature'
  if (/sport|playground|field|gym|操场|球场|运动|体育/.test(text)) return 'sport'
  if (/dorm|宿舍|寝|公寓|生活/.test(text)) return 'dorm'
  if (/gate|entrance|door|门|口/.test(text)) return 'poi'
  return 'building'
}

function featureName(props: FeatureProps): string {
  return String(props?.name || props?.title || props?.Text || '')
}

function availabilityOf(props: FeatureProps) {
  const unopened = props?.serviceStatus === 'unopened'
  return { unopened, message: unopened ? String(props?.unavailableMessage || '') : '' }
}

function shapeStyle(f: RenderShape) {
  if (!f.color || f.kind === 'road') return undefined
  return { stroke: f.color, fill: f.color, fillOpacity: 0.16 }
}

function selectFeature(f: RenderShape | RenderPoi) {
  if (f.kind === 'road') return
  selected.value = { name: f.name || '未命名', kindLabel: f.kindLabel, unopened: f.unopened, message: f.message }
  activeName.value = ''
}

function selectByName(name: string) {
  const target = shapes.value.find(s => s.name === name) || pois.value.find(p => p.name === name)
  if (target) selectFeature(target)
}

/* ---------- 投影：GeoJSON 坐标 → SVG 视图坐标 ---------- */
function buildProjection(features: any[], bbox?: number[], xScale = 1) {
  let [minX, minY, maxX, maxY] = bbox && bbox.length === 4 ? bbox : [Infinity, Infinity, -Infinity, -Infinity]
  if (minX === Infinity) {
    features.forEach(f => walkCoords(f?.geometry?.coordinates, ([x, y]) => {
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }))
  }
  const spanX = (maxX - minX || 1) * xScale
  const spanY = maxY - minY || 1
  const k = Math.min((W - PAD * 2) / spanX, (H - PAD * 2) / spanY)
  const offX = (W - spanX * k) / 2
  const offY = (H - spanY * k) / 2
  const project = ([x, y]: number[]): [number, number] => [
    offX + (x - minX) * xScale * k,
    offY + (maxY - y) * k, // 北在上
  ]
  const tl = project([minX, maxY])
  const br = project([maxX, minY])
  return { project, rect: { x: tl[0], y: tl[1], width: br[0] - tl[0], height: br[1] - tl[1] } }
}

function walkCoords(node: any, fn: (c: number[]) => void) {
  if (!Array.isArray(node)) return
  if (typeof node[0] === 'number') { fn(node); return }
  for (const child of node) walkCoords(child, fn)
}

function pathFromRings(rings: number[][][], project: (c: number[]) => [number, number]) {
  return rings
    .map(ring => ring.map((c, i) => `${i ? 'L' : 'M'}${project(c)[0].toFixed(1)},${project(c)[1].toFixed(1)}`).join('') + 'Z')
    .join('')
}

function pathFromLine(points: number[][], project: (c: number[]) => [number, number]) {
  return points.map((c, i) => `${i ? 'L' : 'M'}${project(c)[0].toFixed(1)},${project(c)[1].toFixed(1)}`).join('')
}

function centroidOf(rings: number[][][], project: (c: number[]) => [number, number]): [number, number] {
  const ring = rings[0] || []
  let sx = 0, sy = 0
  ring.forEach(c => { const p = project(c); sx += p[0]; sy += p[1] })
  const n = ring.length || 1
  return [sx / n, sy / n]
}

function ingestManifest(manifest: any) {
  const layers = Array.isArray(manifest?.layers) ? manifest.layers : []
  const features: any[] = []
  layers.forEach((layer: any) => {
    // 契约修复：后端输出 inlineData，老数据用 data，两者都要认
    const data = layer?.data || layer?.inlineData
    const list = Array.isArray(data?.features) ? data.features : []
    list.forEach((f: any) => features.push({ ...f, __layer: layer?.name || layer?.title || layer?.id || '' }))
  })

  const bbox = Array.isArray(manifest?.renderBBox) ? manifest.renderBBox : manifest?.bbox
  // 高德经纬度按经度 cos(纬度) 修正，避免图形横向拉伸
  const isAmap = String(manifest?.coordinateSystem?.type || '').toLowerCase() === 'amap' || Boolean(manifest?.amap)
  const xScale = isAmap && bbox && bbox.length === 4
    ? Math.cos(((bbox[1] + bbox[3]) / 2) * Math.PI / 180) || 1
    : 1
  const { project, rect } = buildProjection(features, bbox, xScale)

  // 后台上传的校园底图（图片模式）
  const imageMap = manifest?.imageMap
  baseImage.value = imageMap?.imageUrl
    ? {
        url: String(imageMap.imageUrl),
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        opacity: Number.isFinite(Number(imageMap.opacity)) ? Number(imageMap.opacity) : 1,
      }
    : null

  if (!features.length) return baseImage.value !== null

  const outShapes: RenderShape[] = []
  const outPois: RenderPoi[] = []

  features.forEach((f, i) => {
    const g = f?.geometry || {}
    const props: FeatureProps = f?.properties || {}
    const name = featureName(props)
    const kind = classify(f, f.__layer)
    const color = String(props.color || '')
    const { unopened, message } = availabilityOf(props)
    const kindLabel = KIND_LABEL[kind] || '校园设施'
    if (g.type === 'Polygon' || g.type === 'MultiPolygon') {
      const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates
      const d = polys.map((rings: number[][][]) => pathFromRings(rings, project)).join('')
      outShapes.push({ key: `s${i}`, d, kind, name, holes: true, labelAt: centroidOf(polys[0], project), color, unopened, message, kindLabel })
    } else if (g.type === 'LineString' || g.type === 'MultiLineString') {
      const lines = g.type === 'LineString' ? [g.coordinates] : g.coordinates
      const d = lines.map((pts: number[][]) => pathFromLine(pts, project)).join('')
      outShapes.push({ key: `s${i}`, d, kind: 'road', name, holes: false, labelAt: [0, 0], color: '', unopened: false, message: '', kindLabel: KIND_LABEL.road })
    } else if (g.type === 'Point' || g.type === 'MultiPoint') {
      const pts = g.type === 'Point' ? [g.coordinates] : g.coordinates
      pts.forEach((c: number[], j: number) => outPois.push({ key: `p${i}-${j}`, at: project(c), name, kind, color, unopened, message, kindLabel }))
    }
  })

  shapes.value = outShapes
  pois.value = outPois
  mapTitle.value = manifest?.title || '校园地图'
  return true
}

/* ---------- 回退示意图（后台未发布地图时） ---------- */
function ingestFallback() {
  const demo = {
    title: '灵萌校园示意图',
    layers: [{
      name: 'demo',
      data: {
        features: [
          { properties: { name: '主干道', kind: 'road' }, geometry: { type: 'LineString', coordinates: [[500, 60], [500, 660]] } },
          { properties: { name: '环校路', kind: 'road' }, geometry: { type: 'LineString', coordinates: [[120, 300], [880, 300]] } },
          { properties: { name: '图书馆', kind: 'building', semanticType: 'library' }, geometry: { type: 'Polygon', coordinates: [[[410, 290], [590, 290], [590, 420], [410, 420], [410, 290]]] } },
          { properties: { name: '教学楼 A', kind: 'building', semanticType: 'teaching' }, geometry: { type: 'Polygon', coordinates: [[[170, 340], [340, 340], [340, 480], [170, 480], [170, 340]]] } },
          { properties: { name: '教学楼 B', kind: 'building', semanticType: 'teaching' }, geometry: { type: 'Polygon', coordinates: [[[170, 520], [340, 520], [340, 650], [170, 650], [170, 520]]] } },
          { properties: { name: '学生宿舍', kind: 'dorm', semanticType: 'dorm' }, geometry: { type: 'Polygon', coordinates: [[[650, 510], [870, 510], [870, 640], [650, 640], [650, 510]]] } },
          { properties: { name: '食堂', kind: 'dorm', semanticType: 'canteen' }, geometry: { type: 'Polygon', coordinates: [[[650, 360], [870, 360], [870, 470], [650, 470], [650, 360]]] } },
          { properties: { name: '操场', kind: 'sport', semanticType: 'sports' }, geometry: { type: 'Polygon', coordinates: [[[150, 110], [370, 110], [370, 260], [150, 260], [150, 110]]] } },
          { properties: { name: '镜湖', kind: 'nature' }, geometry: { type: 'Polygon', coordinates: [[[620, 120], [800, 110], [880, 200], [830, 260], [650, 240], [620, 120]]] } },
          { properties: { name: '南门', kind: 'gate', semanticType: 'gate' }, geometry: { type: 'Point', coordinates: [500, 60] } },
        ],
      },
    }],
  }
  const ok = ingestManifest(demo)
  if (ok) sourceLabel.value = '示意地图 · 后台发布后自动替换'
}

/* ---------- 拉取后端地图 ---------- */
async function loadMap() {
  loading.value = true
  try {
    const response = await fetch('/api/campus-map/site')
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const payload = await response.json()
    const manifest = payload?.data || payload
    // 学校未开通：展示管理员配置的说明，而不是假装没配置
    if (manifest?.availability?.status === 'unopened') {
      schoolNotice.value = manifest.availability.unavailableMessage || '校园地图暂未开通，敬请期待'
      mapTitle.value = manifest.title || '校园地图'
      sourceLabel.value = '暂未开通'
      ingestManifest(manifest)
      return
    }
    if (manifest?.enabled && ingestManifest(manifest)) {
      sourceLabel.value = `后端发布 · ${manifest.sourceRegionId === 'global' ? '全校区' : manifest.sourceRegionId}`
      return
    }
    ingestFallback()
  } catch {
    errorNote.value = '地图数据暂时加载失败，当前显示示意图'
    ingestFallback()
  } finally {
    loading.value = false
  }
}

/* ---------- 入场动效：建筑升起 + 点位弹入（IntersectionObserver 驱动） ---------- */
let tl: gsap.core.Timeline | null = null
let io: IntersectionObserver | null = null

function initMotion() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const canvas = document.querySelector('.map-canvas')
  if (!canvas) return

  tl = gsap.timeline({ paused: true, defaults: { ease: 'power3.out' } })
    .fromTo('.map-panel', { y: 40, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.9 })
    .fromTo('.map-feature',
      { autoAlpha: 0, scale: 0.92, transformOrigin: '50% 50%' },
      { autoAlpha: 1, scale: 1, duration: 0.7, stagger: 0.05 }, '-=0.4')
    .fromTo('.map-label', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.5, stagger: 0.05 }, '-=0.3')
    .fromTo('.map-poi',
      { autoAlpha: 0, scale: 0, transformOrigin: '50% 50%' },
      { autoAlpha: 1, scale: 1, duration: 0.6, ease: 'back.out(2)', stagger: 0.12 }, '-=0.2')
    .fromTo('.map-side li', { x: 20, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: 0.5, stagger: 0.06 }, '-=0.5')

  io = new IntersectionObserver(entries => {
    if (entries.some(e => e.isIntersecting)) {
      tl?.play()
      io?.disconnect()
    }
  }, { threshold: 0.15 })
  io.observe(canvas)
}

onMounted(async () => {
  await loadMap()
  initMotion()
})

onBeforeUnmount(() => {
  io?.disconnect()
  tl?.kill()
})
</script>
