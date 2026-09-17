import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CampusMapService } from './campus-map.service';

const scriptDir = join(__dirname, '../../../scripts');
const { mergeRoutes, prepareImport } = require(join(scriptDir, 'import-cqcx-navigation.cjs'));
const bundle = JSON.parse(readFileSync(join(scriptDir, 'data/cqcx-navigation-20260908.json'), 'utf8'));
const copy = (value: any) => JSON.parse(JSON.stringify(value));

function fixture() {
  const rider = bundle.routes.find((row: any) => row.sourceObjectId);
  const tx = { campusMapCollectionObject: { findMany: jest.fn().mockResolvedValue([{
    id: rider.sourceObjectId, sessionId: 'test-approved-session', geometry: rider.geometry, properties: {}, attachments: [],
    applyResult: { applied: true, routeQuality: { source: 'server_ack' } },
  }]) } };
  const manifest = { regionId: bundle.regionId, coordinateSystem: { type: 'amap' },
    imageMap: { imageUrl: '/admin/assets/cqcx-campus-map.svg', width: 2761.14, height: 2990.41 },
    layers: [{ id: 'operator_pois', inlineData: { features: [{ properties: { id: 'keep-me' }, geometry: { type: 'Point', coordinates: [108.75, 30.97] } }] } },
      { id: 'operator_routes', inlineData: { features: bundle.routes.map((row: any) => ({
        type: 'Feature', properties: { id: row.id, title: row.title, public: false,
          ...(row.sourceObjectId ? { sourceObjectId: row.sourceObjectId, collectionSource: 'rider_app_approved' } : {}) },
        geometry: copy(row.baselineGeometry),
      })) } }] };
  const places = bundle.places.map((row: any) => ({
    id: row.placeId, title: row.title, officialName: row.title, officialNumber: row.officialNumber,
    publishStatus: 'published', visibilityScope: 'phase1_active', serviceStatus: 'open',
    coordinateStatus: 'verified', longitude: row.referencePoint[0], latitude: row.referencePoint[1],
    engineeringAlias: '保留已有别名', navigable: false, entrances: copy(row.referenceEntrances),
  }));
  return { service: new CampusMapService({} as any) as any, tx, manifest, places };
}

describe('CQ campus navigation deployment import', () => {
  it('connects all 148 real route geometries and 16 destinations, preserving sources and other layers', async () => {
    const { service, tx, manifest, places } = fixture();
    const before = copy({ manifest, places });
    const result = await prepareImport(service, tx, manifest, places, bundle);
    expect({ manifest, places }).toEqual(before);
    expect(result.manifest.layers[0]).toEqual(manifest.layers[0]);
    expect(result.report).toMatchObject({ roads: 148, connectedPlaces: 16, artworkMappings: 10 });
    expect(new Set(result.navigation.graph.edges.map((edge: any) => edge.sourceRouteId).filter(Boolean)).size).toBe(148);
    expect(() => service.assertPublishedNavigationClosure(result.places, result.navigation)).not.toThrow();
    expect(result.entrances.length).toBeGreaterThan(0);
    expect(result.entrances.every((entrance: any) => entrance.name.endsWith('附近道路到达点')
      && entrance.sourceType === 'admin_planned_road_access' && !entrance.isPrimary)).toBe(true);
    result.places.forEach((place: any) => {
      expect(place.engineeringAlias).toContain('保留已有别名');
      const source = places.find((item: any) => item.id === place.id);
      source.entrances.forEach((entrance: any) => expect(place.entrances.find((item: any) => item.id === entrance.id))
        .toMatchObject(entrance));
    });
    const routes = result.manifest.layers[1].inlineData.features;
    expect(routes.filter((feature: any) => feature.properties.verificationStatus === 'planned')).toHaveLength(147);
    expect(routes.filter((feature: any) => feature.properties.collectionSource === 'rider_app_approved')).toHaveLength(1);
    const repeated = await prepareImport(service, tx, result.manifest, result.places, bundle);
    expect(repeated.entrances).toHaveLength(0);
    expect(repeated.manifest.layers[1].inlineData.features).toHaveLength(148);
  });

  it('does not reopen a withdrawn place or overwrite a changed road or another school', async () => {
    const { service, tx, manifest, places } = fixture();
    places[0].serviceStatus = 'closed';
    const prepared = await prepareImport(service, tx, manifest, places, bundle);
    expect(prepared.updates.some((item: any) => item.id === places[0].id)).toBe(false);
    manifest.layers[1].inlineData.features[0].geometry.coordinates[0][0] += 0.001;
    expect(() => mergeRoutes(manifest, bundle)).toThrow('确认后已被修改');
    expect(() => mergeRoutes({ ...manifest, regionId: 'another-school' }, bundle)).toThrow('区域不匹配');
    const fresh = fixture().manifest;
    fresh.layers[1].inlineData.features[0].properties.closed = true;
    expect(() => mergeRoutes(fresh, bundle)).toThrow('禁止步行或施工');
  });
});

describe('route interior junctions', () => {
  function compile(branch: number[][], properties: any = {}) {
    const service: any = new CampusMapService({} as any);
    const road = (id: string, coordinates: number[][], extra = {}) => ({ properties: {
      id, public: true, collectionSource: 'admin_planned', verificationStatus: 'planned', publicationApproved: true,
      sourceGeometryGcj02: { type: 'LineString', coordinates }, ...extra,
    } });
    const main = [[108.75, 30.97], [108.752, 30.97]];
    const manifest = { layers: [{ id: 'operator_routes', inlineData: { features: [
      road('main', main), road('branch', branch, properties),
    ] } }] };
    return { service, manifest, navigation: service.compilePublishedNavigation(manifest, []) };
  }

  it('splits a main road at a T junction and measures the actual snapped graph geometry', () => {
    const { service, navigation } = compile([[108.751, 30.97004], [108.751, 30.971]]);
    expect(() => service.assertPublishedNavigationClosure([], navigation)).not.toThrow();
    expect(navigation.graph.edges.filter((edge: any) => edge.sourceRouteId === 'main')).toHaveLength(2);
    navigation.graph.edges.forEach((edge: any) => {
      expect(edge.coordinates[0]).toEqual(navigation.graph.nodes[edge.a].gcj02);
      expect(edge.coordinates.at(-1)).toEqual(navigation.graph.nodes[edge.b].gcj02);
      expect(edge.lengthM).toBeGreaterThan(0);
    });
  });

  it('splits roads at entrance projections while keeping public junctions independent from place withdrawal', () => {
    const { service, manifest } = compile([[108.751, 30.97], [108.751, 30.971]]);
    const places = [108.7502, 108.7504].map((longitude, index) => ({
      id: `place-${index}`, navigable: true, serviceStatus: 'open', entrances: [{
        id: `door-${index}`, longitude, latitude: 30.97, serviceStatus: 'open',
      }],
    }));
    const navigation = service.compilePublishedNavigation(manifest, places);
    const between = navigation.graph.edges.find((edge: any) => Math.abs(edge.coordinates[0][0] - 108.7502) < 1e-8
      && Math.abs(edge.coordinates.at(-1)[0] - 108.7504) < 1e-8);
    expect(between.lengthM).toBeLessThan(20);
    const graph = copy(navigation.graph);
    Object.entries(graph.nodes).forEach(([id, node]: [string, any]) => { if (node.kind === 'entrance') delete graph.nodes[id]; });
    graph.edges = graph.edges.filter((edge: any) => graph.nodes[edge.a] && graph.nodes[edge.b]);
    expect(() => service.assertPublishedNavigationClosure([], { graph })).not.toThrow();
  });

  it.each([
    { points: [[108.751, 30.969], [108.751, 30.971]], properties: {} },
    { points: [[108.751, 30.97], [108.751, 30.971]], properties: { bridge: true } },
    { points: [[108.751, 30.9702], [108.751, 30.971]], properties: {} },
    { points: [[108.75, 30.97], [108.75, 30.971]], properties: { level: 1 } },
  ])('does not connect crossing-only, different-level, or distant roads: %j', ({ points, properties }) => {
    const { service, navigation } = compile(points, properties);
    expect(() => service.assertPublishedNavigationClosure([], navigation)).toThrow('存在断点');
  });
});
