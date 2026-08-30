#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

function option(name, fallback = '') {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? String(process.argv[index + 1] || '') : fallback;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function featureCollection(features) {
  return { type: 'FeatureCollection', features };
}

function isPair(value) {
  return Array.isArray(value)
    && value.length >= 2
    && Number.isFinite(Number(value[0]))
    && Number.isFinite(Number(value[1]));
}

function geometryPairs(geometry) {
  const pairs = [];
  const walk = (value) => {
    if (isPair(value) && !Array.isArray(value[0])) {
      pairs.push([Number(value[0]), Number(value[1])]);
      return;
    }
    if (Array.isArray(value)) value.forEach(walk);
  };
  walk(geometry?.coordinates);
  return pairs;
}

function polygonArea(feature) {
  const ring = feature?.geometry?.coordinates?.[0];
  if (!Array.isArray(ring) || ring.length < 3) return 0;
  let area = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index];
    const next = ring[(index + 1) % ring.length];
    area += Number(current?.[0] || 0) * Number(next?.[1] || 0)
      - Number(next?.[0] || 0) * Number(current?.[1] || 0);
  }
  return Math.abs(area / 2);
}

function stableProjectProperties(catalog, geometryStatus) {
  const built = catalog.constructionStatus === 'built';
  return {
    officialNumber: Number(catalog.officialNumber),
    officialName: String(catalog.officialName || catalog.title || ''),
    engineeringAlias: String(catalog.engineeringAlias || ''),
    phase: built ? 'phase1' : 'future',
    constructionStatus: built ? 'built' : 'under_construction',
    visibilityScope: built ? 'phase1_active' : 'future_reference',
    semanticType: String(catalog.semanticType || 'building'),
    searchable: built,
    navigable: false,
    geometryStatus,
    sourceConfidence: 'official_signage_and_cad',
    serviceStatus: built ? 'open' : 'unopened',
    unavailableMessage: built ? '' : '项目尚未开放',
  };
}

const dataDir = path.resolve(option('data-dir'));
const catalogFile = path.resolve(option('catalog'));
const outputFile = path.resolve(option('output'));
const regionId = option('region-id');
if (!dataDir || !catalogFile || !outputFile || !regionId) {
  throw new Error('用法: --data-dir <GCJ02目录> --catalog <项目目录GeoJSON> --region-id <区域ID> --output <文件>');
}

const pathNetwork = readJson(path.join(dataDir, 'campus-path-network-gcj02.geojson'));
const realBuildings = readJson(path.join(dataDir, 'campus-buildings-real-gcj02.geojson'));
const poiGroups = readJson(path.join(dataDir, 'campus-poi-groups-gcj02.geojson'));
const catalogGeoJson = readJson(catalogFile);

const catalog = new Map(
  (catalogGeoJson.features || [])
    .map((feature) => feature?.properties || {})
    .filter((item) => Number.isInteger(Number(item.officialNumber)))
    .map((item) => [Number(item.officialNumber), item]),
);

const groupCoordinateByNumber = new Map();
for (const feature of poiGroups.features || []) {
  const coordinate = feature?.geometry?.coordinates;
  if (!isPair(coordinate)) continue;
  for (const value of feature?.properties?.officialNumbers || []) {
    const number = Number(value);
    if (Number.isInteger(number) && number > 0) groupCoordinateByNumber.set(number, coordinate);
  }
}

const realCoordinateByNumber = new Map();
const realPolygonsByNumber = new Map();
for (const feature of realBuildings.features || []) {
  const number = Number(feature?.properties?.officialNumber);
  const coordinate = feature?.properties?.cx_gcj02;
  if (!Number.isInteger(number) || number <= 0) continue;
  if (isPair(coordinate) && !realCoordinateByNumber.has(number)) realCoordinateByNumber.set(number, coordinate);
  if (feature?.geometry?.type === 'Polygon') {
    const existing = realPolygonsByNumber.get(number);
    if (!existing || polygonArea(feature) > polygonArea(existing)) realPolygonsByNumber.set(number, feature);
  }
}

const routes = (pathNetwork.features || [])
  .filter((feature) => feature?.geometry?.type === 'LineString')
  .filter((feature) => feature?.properties?.verificationStatus === 'verified')
  .map((feature, index) => ({
    type: 'Feature',
    properties: {
      id: String(feature?.properties?.id || `verified-road-${index + 1}`),
      title: `校内道路 ${String(feature?.properties?.id || index + 1)}`,
      category: 'road',
      semanticType: 'road',
      sourceLayer: 'campus-path-network-gcj02',
      provider: 'amap',
      coordinateType: 'gcj02',
      verificationStatus: 'verified',
    },
    geometry: feature.geometry,
  }));

const areas = [];
for (const [number, source] of [...realPolygonsByNumber.entries()].sort((left, right) => left[0] - right[0])) {
  const item = catalog.get(number);
  if (!item || item.constructionStatus !== 'built') continue;
  const project = stableProjectProperties(item, 'verified_polygon');
  delete project.officialNumber;
  areas.push({
    type: 'Feature',
    properties: {
      id: `building-area-${number}`,
      title: String(item.officialName || item.title || `建筑 ${number}`),
      category: 'building',
      provider: 'amap',
      coordinateType: 'gcj02',
      sourceLayer: 'campus-buildings-real-gcj02',
      ...project,
    },
    geometry: source.geometry,
  });
}

const pois = [];
for (const [number, item] of [...catalog.entries()].sort((left, right) => left[0] - right[0])) {
  const coordinate = realCoordinateByNumber.get(number) || groupCoordinateByNumber.get(number);
  if (!isPair(coordinate)) continue;
  const project = stableProjectProperties(item, 'verified_point');
  pois.push({
    type: 'Feature',
    properties: {
      id: `project-${number}`,
      title: String(item.officialName || item.title || `项目 ${number}`),
      category: String(item.semanticType || 'building'),
      provider: 'amap',
      coordinateType: 'gcj02',
      sourceLayer: realCoordinateByNumber.has(number)
        ? 'campus-buildings-real-gcj02'
        : 'campus-poi-groups-gcj02',
      ...project,
    },
    geometry: { type: 'Point', coordinates: [Number(coordinate[0]), Number(coordinate[1])] },
  });
}

const allPairs = [...routes, ...areas, ...pois].flatMap((feature) => geometryPairs(feature.geometry));
if (!allPairs.length) throw new Error('没有生成任何可绘制坐标');
for (const [longitude, latitude] of allPairs) {
  if (longitude < 108.70 || longitude > 108.80 || latitude < 30.94 || latitude > 31.01) {
    throw new Error(`检测到超出校园范围的坐标: ${longitude},${latitude}`);
  }
}
const longitudes = allPairs.map((item) => item[0]);
const latitudes = allPairs.map((item) => item[1]);
const bbox = [Math.min(...longitudes), Math.min(...latitudes), Math.max(...longitudes), Math.max(...latitudes)];
const center = [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];

const manifest = {
  schemaVersion: 1,
  enabled: true,
  availability: { status: 'open', unavailableMessage: '' },
  regionId,
  title: '重庆城乡发展职业学院校园地图',
  mapId: `campus-map-${regionId}`,
  version: new Date().toISOString().slice(0, 10),
  coordinateSystem: { type: 'amap', source: 'gcj02', unit: 'degree' },
  amap: {
    enabled: true,
    provider: 'amap',
    coordinateType: 'gcj02',
    center,
    zoom: 17,
    city: '重庆',
    bounds: bbox,
  },
  positioning: {
    enabled: true,
    coordinateType: 'gcj02',
    projection: 'amap-gcj02',
    permissionPurpose: '用于在校园地图中显示你所在的位置，并计算到目标地点的距离',
    calibrationPoints: [],
  },
  bbox,
  renderBBox: bbox,
  layers: [
    {
      id: 'operator_areas',
      role: 'area',
      title: '已核验建筑轮廓',
      load: 'inline',
      inlineData: featureCollection(areas),
      style: { stroke: '#64748b', fill: 'rgba(100, 116, 139, 0.16)', width: 1.4 },
      featureCount: areas.length,
    },
    {
      id: 'operator_routes',
      role: 'road',
      title: '已核验校园道路',
      load: 'inline',
      inlineData: featureCollection(routes),
      style: { stroke: '#22c55e', fill: '', width: 2.4 },
      featureCount: routes.length,
    },
    {
      id: 'operator_pois',
      role: 'poi',
      title: '官方编号地点',
      load: 'inline',
      inlineData: featureCollection(pois),
      style: { stroke: '#2563eb', fill: '#2563eb', width: 1, pointRadius: 5, showLabel: true },
      featureCount: pois.length,
    },
  ],
  recommendedInitialLayers: ['operator_areas', 'operator_routes', 'operator_pois'],
  recommendedRouteLayers: ['operator_routes'],
  poiCandidateLayers: ['operator_pois'],
};

fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ outputFile, routes: routes.length, areas: areas.length, pois: pois.length, bbox }));
