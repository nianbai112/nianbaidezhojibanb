export type CampusProjectMetadata = {
  officialNumber: number;
  officialName: string;
  engineeringAlias: string;
  phase: 'phase1' | 'future';
  constructionStatus: 'built' | 'under_construction' | 'planned' | 'renovating';
  visibilityScope: 'phase1_active' | 'phase1_review' | 'future_reference';
  semanticType: string;
  searchable: boolean;
  navigable: boolean;
  geometryStatus: 'verified_polygon' | 'verified_point' | 'point_only' | 'unmatched';
  sourceConfidence: 'official_signage_and_cad' | 'official_signage_only';
  artworkFeatureKey: string;
  artworkAnchorX: number;
  artworkAnchorY: number;
  artworkGeometry: { type: 'Point'; coordinates: [number, number] };
};

type ProjectSeed = [officialNumber: number, officialName: string, semanticType: string];

// 画师 AI 原文件的页面尺寸与文字中心坐标。这里保存的是 PDF/SVG 顶部向下坐标，
// 写入数据库时转换为后台画布使用的左下原点坐标。真实经纬度仍由骑手现场采集，
// 两套坐标绝不互相替代。
export const ILLUSTRATED_ARTWORK_WIDTH = 2761.14;
export const ILLUSTRATED_ARTWORK_HEIGHT = 2990.41;
export const ILLUSTRATED_LABEL_ANCHORS_FROM_TOP: Readonly<Record<number, readonly [number, number]>> = {
  1: [302.44, 1715.91], 2: [233.14, 1933.59], 3: [535.15, 1648.29],
  4: [672.78, 1858.49], 5: [720.94, 1655.22], 6: [890.06, 1733.56],
  7: [742.48, 2130.70], 8: [655.81, 2242.13], 9: [832.20, 1364.73],
  10: [1061.05, 1372.11], 11: [934.26, 1507.70], 12: [1196.67, 1447.56],
  13: [1116.64, 1603.29], 14: [971.98, 2370.60], 15: [1150.91, 1948.63],
  16: [1658.55, 2021.58], 17: [1706.55, 2138.70], 18: [1375.77, 1448.04],
  19: [1144.27, 1017.71], 20: [1389.63, 1171.86], 21: [1416.85, 1687.17],
  22: [2063.94, 1444.38], 23: [1226.54, 695.50], 24: [1532.91, 854.83],
  25: [1433.48, 780.17], 26: [1335.45, 549.79], 27: [1602.70, 530.79],
  28: [1459.99, 348.84], 29: [1955.93, 737.25], 30: [1859.70, 1084.44],
  31: [2256.82, 1018.03], 32: [1742.73, 454.41], 33: [1980.33, 617.82],
  34: [1677.75, 212.79], 35: [2068.77, 435.85], 36: [2330.11, 691.65],
  37: [1304.99, 49.90], 38: [1235.49, 395.45],
};

function artworkMetadata(officialNumber: number) {
  const [x, yFromTop] = ILLUSTRATED_LABEL_ANCHORS_FROM_TOP[officialNumber];
  const y = Number((ILLUSTRATED_ARTWORK_HEIGHT - yFromTop).toFixed(2));
  return {
    artworkFeatureKey: `illustrated-place-${officialNumber}`,
    artworkAnchorX: x,
    artworkAnchorY: y,
    artworkGeometry: { type: 'Point' as const, coordinates: [x, y] as [number, number] },
  };
}

const BUILT_PROJECTS: ProjectSeed[] = [
  [1, '第三校门', 'gate'],
  [2, '停车场', 'parking'],
  [3, '天枢楼', 'building'],
  [4, '天启楼', 'building'],
  [5, '天工楼', 'building'],
  [6, '天霁楼', 'building'],
  [7, '人和楼', 'building'],
  [8, '人仁楼', 'building'],
  [9, '龙韬楼', 'building'],
  [10, '龙衍楼', 'building'],
  [11, '龙翰楼', 'building'],
  [12, '龙煜楼', 'building'],
  [13, '龙渊楼', 'building'],
  [16, '贤怡苑', 'building'],
  [17, '贤朗苑', 'building'],
];

const FUTURE_PROJECTS: ProjectSeed[] = [
  [14, '地润书院', 'building'],
  [15, '学生餐厅', 'canteen'],
  [18, '第二校门', 'gate'],
  [19, '和沐书院', 'building'],
  [20, '运动场', 'sports'],
  [21, '校园景云街', 'service'],
  [22, '第一校门', 'gate'],
  [23, '教学楼A', 'teaching'],
  [24, '科研楼', 'research'],
  [25, '教学楼B', 'teaching'],
  [26, '学生公寓A', 'dorm'],
  [27, '学生公寓B', 'dorm'],
  [28, '学生公寓C', 'dorm'],
  [29, '图书馆', 'library'],
  [30, '体育馆', 'sports'],
  [31, '学生公寓E', 'dorm'],
  [32, '学生餐厅A', 'canteen'],
  [33, '学生餐厅B', 'canteen'],
  [34, '学生公寓D', 'dorm'],
  [35, '校史馆', 'museum'],
  [36, '学生公寓F', 'dorm'],
  [37, '教师公寓', 'dorm'],
  [38, '北大门', 'gate'],
];

const builtCatalog = BUILT_PROJECTS.map<CampusProjectMetadata>(([officialNumber, officialName, semanticType]) => ({
  officialNumber,
  officialName,
  engineeringAlias: '',
  phase: 'phase1',
  constructionStatus: 'built',
  visibilityScope: 'phase1_active',
  semanticType,
  searchable: false,
  navigable: false,
  geometryStatus: 'verified_point',
  sourceConfidence: 'official_signage_and_cad',
  ...artworkMetadata(officialNumber),
}));

const futureCatalog = FUTURE_PROJECTS.map<CampusProjectMetadata>(([officialNumber, officialName, semanticType]) => ({
  officialNumber,
  officialName,
  engineeringAlias: '',
  phase: 'future',
  constructionStatus: 'under_construction',
  visibilityScope: 'future_reference',
  semanticType,
  searchable: false,
  navigable: false,
  geometryStatus: 'verified_point',
  sourceConfidence: 'official_signage_and_cad',
  ...artworkMetadata(officialNumber),
}));

export const CAMPUS_PROJECT_CATALOG: readonly CampusProjectMetadata[] = [...builtCatalog, ...futureCatalog]
  .sort((left, right) => left.officialNumber - right.officialNumber);

const catalogByNumber = new Map(CAMPUS_PROJECT_CATALOG.map((item) => [item.officialNumber, item]));

function booleanValue(value: unknown, fallback: boolean) {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
}

export function normalizeCampusProjectMetadata(value: unknown): Partial<CampusProjectMetadata> {
  if (!value || typeof value !== 'object') return {};
  const input = value as Record<string, unknown>;
  const parsedNumber = Number(input.officialNumber);
  const officialNumber = Number.isInteger(parsedNumber) && parsedNumber > 0 ? parsedNumber : undefined;
  const managed = officialNumber !== undefined || Boolean(input.visibilityScope || input.constructionStatus);
  if (!managed) return {};

  const catalogItem = officialNumber === undefined ? undefined : catalogByNumber.get(officialNumber);
  const normalized: Partial<CampusProjectMetadata> = {
    officialName: String(input.officialName ?? catalogItem?.officialName ?? '').trim(),
    engineeringAlias: String(input.engineeringAlias ?? catalogItem?.engineeringAlias ?? '').trim(),
    phase: input.phase === 'future' || input.phase === 'phase1'
      ? input.phase
      : (catalogItem?.phase ?? 'phase1'),
    constructionStatus: input.constructionStatus === 'under_construction'
      || input.constructionStatus === 'built'
      || input.constructionStatus === 'planned'
      || input.constructionStatus === 'renovating'
      ? input.constructionStatus
      : (catalogItem?.constructionStatus ?? 'built'),
    visibilityScope: input.visibilityScope === 'phase1_active'
      || input.visibilityScope === 'phase1_review'
      || input.visibilityScope === 'future_reference'
      ? input.visibilityScope
      : (catalogItem?.visibilityScope ?? 'phase1_review'),
    semanticType: String(input.semanticType ?? catalogItem?.semanticType ?? 'building').trim() || 'building',
    searchable: booleanValue(input.searchable, catalogItem?.searchable ?? false),
    navigable: booleanValue(input.navigable, catalogItem?.navigable ?? false),
    geometryStatus: input.geometryStatus === 'verified_polygon'
      || input.geometryStatus === 'verified_point'
      || input.geometryStatus === 'point_only'
      || input.geometryStatus === 'unmatched'
      ? input.geometryStatus
      : (catalogItem?.geometryStatus ?? 'unmatched'),
    sourceConfidence: input.sourceConfidence === 'official_signage_and_cad'
      || input.sourceConfidence === 'official_signage_only'
      ? input.sourceConfidence
      : (catalogItem?.sourceConfidence ?? 'official_signage_only'),
  };
  if (officialNumber !== undefined) normalized.officialNumber = officialNumber;
  return normalized;
}

export function isPublicCampusProject(value: Partial<CampusProjectMetadata> & { publishStatus?: string }) {
  const managed = Boolean(value.officialNumber || value.visibilityScope || value.constructionStatus);
  if (!managed) return true;
  if (value.publishStatus !== undefined) {
    return value.publishStatus === 'published'
      && value.visibilityScope === 'phase1_active'
      && value.geometryStatus !== 'unmatched';
  }
  return value.constructionStatus === 'built'
    && value.visibilityScope === 'phase1_active'
    && value.geometryStatus !== 'unmatched';
}

export function validateCampusProjectCollection(features: unknown[]): string[] {
  const errors: string[] = [];
  const seenNumbers = new Set<number>();

  for (const feature of features) {
    const record = feature && typeof feature === 'object' ? feature as Record<string, unknown> : {};
    const properties = record.properties && typeof record.properties === 'object'
      ? record.properties as Record<string, unknown>
      : record;
    const officialNumber = Number(properties.officialNumber);
    if (!Number.isInteger(officialNumber) || officialNumber <= 0) continue;

    if (seenNumbers.has(officialNumber)) {
      errors.push(`重复官方编号 ${officialNumber}`);
    }
    seenNumbers.add(officialNumber);

    if (!String(properties.officialName ?? '').trim()) {
      errors.push(`官方编号 ${officialNumber} 缺少正式名称`);
    }
    if (properties.constructionStatus === 'under_construction' && properties.searchable === true) {
      errors.push(`在建项目 ${officialNumber} 不能开启搜索`);
    }
    if (properties.constructionStatus === 'under_construction' && properties.navigable === true) {
      errors.push(`在建项目 ${officialNumber} 不能开启导航`);
    }
    if (properties.visibilityScope === 'phase1_active' && properties.geometryStatus === 'unmatched') {
      errors.push(`官方编号 ${officialNumber} 未匹配几何不能进入一期活动层`);
    }
  }

  return errors;
}
