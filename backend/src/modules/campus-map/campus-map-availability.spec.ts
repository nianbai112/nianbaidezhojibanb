import {
  normalizeCampusAvailability,
  normalizeCampusFeatureProperties,
  validateCampusAvailabilityManifest,
} from './campus-map-availability';

describe('campus map availability', () => {
  it('defaults legacy school manifests to open and trims messages', () => {
    expect(normalizeCampusAvailability(undefined)).toEqual({
      status: 'open',
      unavailableMessage: '',
    });
    expect(normalizeCampusAvailability({
      status: 'unopened',
      unavailableMessage: '  正在校准  ',
    })).toEqual({
      status: 'unopened',
      unavailableMessage: '正在校准',
    });
  });

  it('forces unavailable active buildings to remain searchable and non-navigable', () => {
    expect(normalizeCampusFeatureProperties({
      constructionStatus: 'built',
      visibilityScope: 'phase1_active',
      serviceStatus: 'unopened',
      unavailableMessage: '暂未开放',
      searchable: false,
      navigable: true,
    })).toEqual(expect.objectContaining({
      searchable: true,
      navigable: false,
    }));
  });

  it('does not let service status expose future projects', () => {
    expect(normalizeCampusFeatureProperties({
      constructionStatus: 'under_construction',
      visibilityScope: 'future_reference',
      serviceStatus: 'open',
      searchable: true,
      navigable: true,
    })).toEqual(expect.objectContaining({
      searchable: false,
      navigable: false,
    }));
  });

  it('preserves planned/renovating construction and limited/closed service states', () => {
    expect(normalizeCampusFeatureProperties({
      constructionStatus: 'planned',
      visibilityScope: 'phase1_active',
      serviceStatus: 'limited',
      searchable: true,
      navigable: true,
    })).toMatchObject({
      constructionStatus: 'planned',
      serviceStatus: 'limited',
      searchable: false,
      navigable: false,
    });

    expect(normalizeCampusFeatureProperties({
      constructionStatus: 'renovating',
      visibilityScope: 'phase1_active',
      serviceStatus: 'limited',
      searchable: true,
      navigable: true,
    })).toMatchObject({
      constructionStatus: 'renovating',
      serviceStatus: 'limited',
      searchable: true,
      navigable: true,
    });

    for (const serviceStatus of ['closed', 'temporarily_closed']) {
      expect(normalizeCampusFeatureProperties({
        constructionStatus: 'renovating',
        visibilityScope: 'phase1_active',
        serviceStatus,
        unavailableMessage: '临时不可用',
        searchable: false,
        navigable: true,
      })).toMatchObject({
        constructionStatus: 'renovating',
        serviceStatus,
        unavailableMessage: '临时不可用',
        searchable: true,
        navigable: false,
      });
    }
  });

  it('rejects missing explanations and unavailable navigation', () => {
    const errors = validateCampusAvailabilityManifest({
      availability: {
        status: 'unopened',
        unavailableMessage: '',
      },
      layers: [{
        inlineData: {
          features: [{
            properties: {
              title: '天枢楼',
              constructionStatus: 'built',
              visibilityScope: 'phase1_active',
              serviceStatus: 'unopened',
              unavailableMessage: '',
              navigable: true,
            },
          }],
        },
      }],
    });

    expect(errors).toEqual(expect.arrayContaining([
      '学校未开通时必须填写说明',
      '未开放建筑“天枢楼”必须填写说明',
      '未开放建筑“天枢楼”不能开启导航',
    ]));
  });
});
