#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const BUNDLE_FILE = path.join(__dirname, 'data/cqcx-navigation-20260908.json');
const clone = (value) => JSON.parse(JSON.stringify(value));
const geometryKey = (geometry) => JSON.stringify((geometry?.coordinates || [])
  .filter((point, index, points) => index === 0 || JSON.stringify(point) !== JSON.stringify(points[index - 1])));
const stableId = (prefix, value) => `${prefix}-${createHash('sha256').update(value).digest('hex').slice(0, 24)}`;

function nearestPoint(graph, coordinate) {
  const scaleX = 111320 * Math.cos(coordinate[1] * Math.PI / 180);
  let best = null;
  for (const edge of graph.edges) {
    if (!edge.sourceRouteId || !edge.public || edge.pedestrian === false || edge.closed || edge.construction) continue;
    for (let index = 1; index < edge.coordinates.length; index++) {
      const a = edge.coordinates[index - 1], b = edge.coordinates[index];
      const vx = (b[0] - a[0]) * scaleX, vy = (b[1] - a[1]) * 111320;
      const px = (coordinate[0] - a[0]) * scaleX, py = (coordinate[1] - a[1]) * 111320;
      const t = Math.max(0, Math.min(1, (px * vx + py * vy) / (vx * vx + vy * vy || 1)));
      const distanceM = Math.hypot(px - t * vx, py - t * vy);
      if (!best || distanceM < best.distanceM) best = {
        longitude: a[0] + t * (b[0] - a[0]), latitude: a[1] + t * (b[1] - a[1]),
        distanceM, sourceRouteId: edge.sourceRouteId,
      };
    }
  }
  return best;
}

function mergeRoutes(current, bundle) {
  if (current.regionId !== bundle.regionId) throw new Error('区域不匹配，未写入任何数据');
  if (!['amap', 'gcj02'].includes(String(current.coordinateSystem?.type).toLowerCase())) {
    throw new Error('这份道路包只适用当前 GCJ-02 草稿，不能用经纬度覆盖插画像素');
  }
  const manifest = clone(current);
  const layer = manifest.layers.find((item) => item.id === 'operator_routes');
  if (!layer) throw new Error('当前草稿缺少 operator_routes 图层');
  const data = layer.inlineData || layer.data;
  if (!Array.isArray(data?.features)) throw new Error('当前道路图层无效');
  const byId = new Map();
  for (const feature of data.features) {
    const id = feature.properties?.id;
    if (!id || byId.has(id)) throw new Error(`当前草稿道路 ID 缺失或重复：${id || '空'}`);
    byId.set(id, feature);
  }
  if (bundle.routes.length !== 148 || new Set(bundle.routes.map((row) => row.id)).size !== 148) {
    throw new Error('确认包应当包含 148 个唯一道路 ID');
  }
  for (const row of bundle.routes) {
    let feature = byId.get(row.id);
    if (!feature) {
      if (row.sourceObjectId) throw new Error(`实采道路 ${row.id} 不在当前草稿，请恢复原审核记录后重试`);
      feature = { type: 'Feature', properties: { id: row.id, title: row.title, category: 'road' }, geometry: row.geometry };
      data.features.push(feature);
    } else {
      const actual = geometryKey(feature.geometry);
      if (![geometryKey(row.baselineGeometry), geometryKey(row.geometry)].includes(actual)) {
        throw new Error(`道路 ${row.id} 在确认后已被修改，保留当前数据并停止导入`);
      }
    }
    const properties = feature.properties;
    if (properties.closed || properties.construction || properties.pedestrian === false) {
      throw new Error(`道路 ${row.id} 当前禁止步行或施工，保留限制并停止导入`);
    }
    if ((properties.sourceObjectId || null) !== (row.sourceObjectId || null)) {
      throw new Error(`道路 ${row.id} 的实采来源已改变，停止导入`);
    }
    if (!row.sourceObjectId) {
      if (properties.collectionSource && properties.collectionSource !== 'admin_planned') {
        throw new Error(`道路 ${row.id} 的来源不属于管理员规划路线`);
      }
      feature.geometry = clone(row.geometry);
      properties.plannedGeometryGcj02 = clone(row.geometry);
      properties.collectionSource = 'admin_planned';
      // 正式状态仍由服务端发布流程写入，不能伪造为骑手实采。
      delete properties.verificationStatus;
      delete properties.publicationApproved;
    }
    properties.public = true;
    properties.pedestrian = true;
    properties.passabilityConfirmation = {
      basis: 'owner_field_confirmation', confirmedOn: '2026-09-08', scope: 'walking', bundleId: bundle.id,
    };
    if (row.artworkGeometry) properties.artworkGeometry = clone(row.artworkGeometry);
  }
  manifest.imageMap = { ...manifest.imageMap, imageUrl: bundle.imageUrl };
  manifest.artworkId = bundle.artworkId;
  return manifest;
}

async function prepareImport(service, tx, current, catalog, bundle) {
  const manifest = mergeRoutes(current, bundle);
  await service.reconcileApprovedRouteFeatures(tx, bundle.regionId, manifest);
  const navigation = service.compilePublishedNavigation(manifest, []);
  service.assertPublishedNavigationClosure([], navigation);
  const included = new Set(navigation?.graph.edges.map((edge) => edge.sourceRouteId));
  const missing = bundle.routes.filter((row) => !included.has(row.id));
  if (missing.length) throw new Error(`未进入导航图：${missing.map((row) => row.id).join('、')}`);

  const places = clone(catalog);
  const updates = [];
  const entrances = [];
  const canEnable = (place) => place && place.publishStatus === 'published' && place.visibilityScope === 'phase1_active'
    && ['open', 'limited'].includes(place.serviceStatus) && place.coordinateStatus === 'verified'
    && Number.isFinite(place.longitude) && Number.isFinite(place.latitude)
    && place.entrances.some((entrance) => ['open', 'limited'].includes(entrance.serviceStatus));
  const targetIds = new Set(bundle.places.map((row) => row.placeId));
  places.forEach((place) => { if (targetIds.has(place.id) && canEnable(place)) place.navigable = true; });
  service.compilePublishedNavigation(manifest, places);
  for (const row of bundle.places) {
    const place = places.find((item) => item.id === row.placeId);
    if (!canEnable(place)) continue;
    const aliases = [...new Set([...(place.engineeringAlias || '').split(/[，,；;、\n]/), ...row.appendAliases].filter(Boolean))].join('、');
    place.engineeringAlias = aliases;
    place.navigable = true;
    if (row.searchable === true) place.searchable = true;
    updates.push({ id: place.id, data: { navigable: true, engineeringAlias: aliases,
      ...(row.searchable === true ? { searchable: true } : {}) } });
    // 先复用真实入口；无连接入口时才补“道路到达点”。原采集坐标、入口与照片不变。
    if (place.entranceNodeIds.length) continue;
    const closest = nearestPoint(navigation.graph, [place.longitude, place.latitude]);
    if (!closest || closest.distanceM > 150) throw new Error(`地点 ${place.title || place.officialName} 距现有道路超过 150 米，无法生成道路到达点`);
    const entrance = {
      id: stableId('road-access', `${bundle.id}:${place.id}`), placeId: place.id,
      name: `${place.title || place.officialName}附近道路到达点`,
      longitude: closest.longitude, latitude: closest.latitude, coordinateType: 'gcj02',
      serviceStatus: 'open', isPrimary: false, sourceType: 'admin_planned_road_access',
      addressDescription: `沿已确认道路导航至此，距地点标记约 ${Math.round(closest.distanceM)} 米；进入地点请按现场指引。`,
    };
    place.entrances.push({ ...entrance, address: entrance.addressDescription });
    entrances.push(entrance);
  }
  const compiled = service.compilePublishedNavigation(manifest, places);
  service.assertPublishedNavigationClosure(places, compiled);
  service.assertIllustratedNavigationCalibration(manifest, places, compiled);
  return { manifest, places, updates, entrances, navigation: compiled,
    report: { bundleId: bundle.id, roads: bundle.routes.length,
      nodes: Object.keys(compiled.graph.nodes).length, edges: compiled.graph.edges.length,
      connectedPlaces: places.filter((place) => place.navigable && place.entranceNodeIds?.length).length,
      supplementalRoadAccessPoints: entrances.map(({ id, name, longitude, latitude, addressDescription }) => ({ id, name, longitude, latitude, addressDescription })),
      artworkMappings: bundle.routes.filter((row) => row.artworkGeometry).length,
    } };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('在 backend 目录构建后执行：\n  node scripts/import-cqcx-navigation.cjs             # 只读检查\n  node scripts/import-cqcx-navigation.cjs --apply     # 备份、合并和发布（事务）');
    return;
  }
  if (args.some((arg) => arg !== '--apply')) throw new Error('仅支持 --apply 或 --help');
  require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
  const { PrismaClient } = require('@prisma/client');
  const { CampusMapService } = require('../dist/src/modules/campus-map/campus-map.service');
  const prisma = new PrismaClient();
  const bundle = JSON.parse(fs.readFileSync(BUNDLE_FILE, 'utf8'));
  const apply = args.includes('--apply');
  const actor = bundle.id;
  try {
    const result = await prisma.$transaction(async (tx) => {
      const map = await tx.campusMap.findUnique({ where: { regionId: bundle.regionId }, include: { draft: true, activeVersion: true } });
      if (!map?.draft) throw new Error('学校草稿不存在，未写入任何数据');
      // 嵌套服务流程使用同一事务，任意保存、校验或发布失败都会整体回滚。
      const scoped = new Proxy(tx, { get: (target, key) => key === '$transaction'
        ? (callback) => callback(tx) : Reflect.get(target, key) });
      const service = new CampusMapService(scoped);
      const places = await service.buildPublishedPlaceCatalog(tx, bundle.regionId);
      const prepared = await prepareImport(service, tx, map.draft.manifest, places, bundle);
      if (!apply) return { ...prepared.report, applied: false, draftRevision: map.draft.revision };
      const alreadyApplied = map.activeVersion?.manifest?.layers?.find((layer) => layer.id === 'operator_routes')
        ?.inlineData?.features?.filter((feature) => feature.properties?.passabilityConfirmation?.bundleId === bundle.id && feature.properties.public === true).length === 148;
      if (alreadyApplied && map.draft.basedOnVersionId === map.activeVersionId
        && map.activeVersion.manifest.imageMap?.imageUrl === bundle.imageUrl) {
        return { ...prepared.report, applied: false, alreadyApplied: true, activeVersion: map.activeVersion.version };
      }
      const backupDir = path.resolve(__dirname, '../backups/campus-map');
      fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
      const backupFile = path.join(backupDir, `${bundle.id}-${Date.now()}-r${map.draft.revision}.json`);
      fs.writeFileSync(backupFile, JSON.stringify({ regionId: bundle.regionId, map, places,
        supplementalEntranceIds: prepared.entrances.map((entrance) => entrance.id) }, null, 2), { mode: 0o600, flag: 'wx' });
      for (const update of prepared.updates) {
        await tx.campusMapProject.update({ where: { id: update.id }, data: { ...update.data, updatedBy: actor } });
      }
      for (const entrance of prepared.entrances) {
        await tx.campusMapPlaceEntrance.create({ data: { ...entrance, createdBy: actor, updatedBy: actor } });
      }
      const saved = await service.saveDraft(bundle.regionId, { config: prepared.manifest }, actor, map.draft.revision);
      const published = await service.publishDraft(bundle.regionId, actor, saved.workflow.draftRevision);
      return { ...prepared.report, applied: true, backupFile,
        draftRevision: saved.workflow.draftRevision, activeVersion: published.workflow.activeVersion };
    }, { isolationLevel: 'Serializable', maxWait: 10000, timeout: 60000 });
    console.log(JSON.stringify(result, null, 2));
  } finally { await prisma.$disconnect(); }
}

module.exports = { mergeRoutes, prepareImport, nearestPoint };
if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
