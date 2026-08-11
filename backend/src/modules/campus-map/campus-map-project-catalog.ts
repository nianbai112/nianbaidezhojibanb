export type CampusProjectMetadata = {
  officialNumber: number;
  officialName: string;
  engineeringAlias: string;
  phase: 'phase1' | 'future';
  constructionStatus: 'built' | 'under_construction';
  visibilityScope: 'phase1_active' | 'phase1_review' | 'future_reference';
  semanticType: string;
  searchable: boolean;
  navigable: boolean;
  geometryStatus: 'verified_polygon' | 'verified_point' | 'point_only' | 'unmatched';
  sourceConfidence: 'official_signage_and_cad' | 'official_signage_only';
};

type ProjectSeed = [officialNumber: number, officialName: string, semanticType: string];

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
  [21, '行政综合楼', 'office'],
  [22, '第一校门', 'gate'],
  [23, '教学楼 A', 'teaching'],
  [24, '科研楼', 'research'],
  [25, '教学楼 B', 'teaching'],
  [26, '学生公寓 A', 'dorm'],
  [27, '学生公寓 B', 'dorm'],
  [28, '学生公寓 C', 'dorm'],
  [29, '图书馆', 'library'],
  [30, '体育馆', 'sports'],
  [31, '学生公寓 E', 'dorm'],
  [32, '学生餐厅 A', 'canteen'],
  [33, '学生餐厅 B', 'canteen'],
  [34, '学生公寓 D', 'dorm'],
  [35, '校史馆', 'museum'],
  [36, '学生公寓 F', 'dorm'],
  [37, '教师公寓', 'dorm'],
];

const builtCatalog = BUILT_PROJECTS.map<CampusProjectMetadata>(([officialNumber, officialName, semanticType]) => ({
  officialNumber,
  officialName,
  engineeringAlias: '',
  phase: 'phase1',
  constructionStatus: 'built',
  visibilityScope: 'phase1_review',
  semanticType,
  searchable: false,
  navigable: false,
  geometryStatus: 'unmatched',
  sourceConfidence: 'official_signage_only',
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
  geometryStatus: 'unmatched',
  sourceConfidence: 'official_signage_only',
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
    constructionStatus: input.constructionStatus === 'under_construction' || input.constructionStatus === 'built'
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

export function isPublicCampusProject(value: Partial<CampusProjectMetadata>) {
  const managed = Boolean(value.officialNumber || value.visibilityScope || value.constructionStatus);
  if (!managed) return true;
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
