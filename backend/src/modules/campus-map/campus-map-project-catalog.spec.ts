import {
  CAMPUS_PROJECT_CATALOG,
  isPublicCampusProject,
  validateCampusProjectCollection,
} from './campus-map-project-catalog';

describe('campus project catalog', () => {
  it('contains 1-38 with correct built/future split', () => {
    const built = CAMPUS_PROJECT_CATALOG.filter((item) => item.constructionStatus === 'built');
    const future = CAMPUS_PROJECT_CATALOG.filter((item) => item.constructionStatus === 'under_construction');

    expect(built.map((item) => item.officialNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 16, 17]);
    expect(future.map((item) => item.officialNumber)).toEqual([14, 15, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38]);
    // 编号连续 1-38，38号北大门已包含
    const allNumbers = CAMPUS_PROJECT_CATALOG.map((item) => item.officialNumber).sort((a, b) => a - b);
    expect(allNumbers[0]).toBe(1);
    expect(allNumbers[allNumbers.length - 1]).toBe(38);
    expect(allNumbers).toHaveLength(38);
    expect(CAMPUS_PROJECT_CATALOG.find((item) => item.officialNumber === 21)).toMatchObject({
      officialName: '校园景云街',
      semanticType: 'service',
    });
    expect(CAMPUS_PROJECT_CATALOG.find((item) => item.officialNumber === 34)).toMatchObject({
      officialName: '学生公寓D',
      artworkAnchorX: 1677.75,
      artworkAnchorY: 2777.62,
      geometryStatus: 'verified_point',
    });
    expect(CAMPUS_PROJECT_CATALOG.find((item) => item.officialNumber === 37)).toMatchObject({
      officialName: '教师公寓',
      artworkAnchorX: 1304.99,
      artworkAnchorY: 2940.51,
      geometryStatus: 'verified_point',
    });
  });

  it('never exposes future or unmatched projects publicly', () => {
    expect(isPublicCampusProject({
      constructionStatus: 'built',
      visibilityScope: 'phase1_active',
      geometryStatus: 'verified_polygon',
    })).toBe(true);
    expect(isPublicCampusProject({
      constructionStatus: 'under_construction',
      visibilityScope: 'future_reference',
      geometryStatus: 'verified_polygon',
    })).toBe(false);
    expect(isPublicCampusProject({
      constructionStatus: 'built',
      visibilityScope: 'phase1_review',
      geometryStatus: 'unmatched',
    })).toBe(false);
    expect(isPublicCampusProject({ semanticType: 'road' })).toBe(true);
  });

  it('rejects duplicate numbers and future navigation', () => {
    expect(validateCampusProjectCollection([
      { properties: { officialNumber: 3, officialName: '天枢楼', constructionStatus: 'built', visibilityScope: 'phase1_active' } },
      { properties: { officialNumber: 3, officialName: '天枢楼', constructionStatus: 'built', visibilityScope: 'phase1_active' } },
      { properties: { officialNumber: 15, officialName: '学生餐厅', constructionStatus: 'under_construction', visibilityScope: 'future_reference', navigable: true } },
    ])).toEqual(expect.arrayContaining([
      expect.stringContaining('重复官方编号 3'),
      expect.stringContaining('在建项目 15 不能开启导航'),
    ]));
  });

  it('rejects blank names and invalid active geometry', () => {
    expect(validateCampusProjectCollection([
      { officialNumber: 4, officialName: ' ', constructionStatus: 'built', visibilityScope: 'phase1_active', geometryStatus: 'unmatched' },
    ])).toEqual(expect.arrayContaining([
      expect.stringContaining('官方编号 4 缺少正式名称'),
      expect.stringContaining('官方编号 4 未匹配几何不能进入一期活动层'),
    ]));
  });
});
