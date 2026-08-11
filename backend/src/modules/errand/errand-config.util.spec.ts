import {
  buildMiniErrandConfig,
  mergeErrandExtendedConfig,
  normalizeErrandExtendedConfig,
} from './errand-config.util';

describe('errand risk tag config', () => {
  it('uses scene-specific default risk tags instead of one generic list', () => {
    const normalized = normalizeErrandExtendedConfig({}, 2);

    const pickupKeys = normalized.riskTagConfig.express_pickup.map((item: any) => item.key);
    const sendKeys = normalized.riskTagConfig.express_send.map((item: any) => item.key);
    const foodKeys = normalized.riskTagConfig.food_delivery.map((item: any) => item.key);

    expect(pickupKeys).toEqual(expect.arrayContaining(['large', 'heavy', 'fragile', 'valuable']));
    expect(pickupKeys).not.toContain('cake');
    expect(sendKeys).toEqual(expect.arrayContaining(['valuable', 'fragile', 'large', 'heavy', 'liquid', 'prohibited']));
    expect(sendKeys).not.toContain('cake');
    expect(foodKeys).toEqual(expect.arrayContaining(['cake', 'liquid', 'hot', 'cold']));
  });

  it('exposes risk tag config to the mini-program config payload', () => {
    const miniConfig = buildMiniErrandConfig(
      { id: 'cfg-1', regionId: 'region-1', basePrice: 2, isOpen: true },
      {
        riskTagConfig: {
          food_delivery: [
            { key: 'cake', label: '蛋糕', desc: '需平放', enabled: true },
          ],
        },
      },
    );

    expect(miniConfig.risk_tag_config.food_delivery).toHaveLength(1);
    expect(miniConfig.risk_tag_config.food_delivery[0]).toMatchObject({
      key: 'cake',
      label: '蛋糕',
    });
    expect(miniConfig.riskTagConfig).toBe(miniConfig.risk_tag_config);
  });

  it('round-trips closure switches without losing existing extended config', () => {
    const merged = mergeErrandExtendedConfig(
      { serviceSwitches: { express: false }, auto_receipt_enabled: false },
      { closureVersion: 2, settlementV2Enabled: false },
      3,
    );

    expect(merged).toMatchObject({
      closureVersion: 2,
      autoReceiptEnabled: false,
      settlementV2Enabled: false,
      serviceSwitches: expect.objectContaining({ express: false }),
    });
    expect(buildMiniErrandConfig(
      { id: 'cfg-1', regionId: 'region-1', basePrice: 3, isOpen: true },
      merged,
    )).toMatchObject({
      closure_version: 2,
      auto_receipt_enabled: false,
      settlement_v2_enabled: false,
    });
  });
});
