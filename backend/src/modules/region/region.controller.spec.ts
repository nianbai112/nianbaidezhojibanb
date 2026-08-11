import { RegionController } from './region.controller';

describe('RegionController location recommendation', () => {
  it('returns a coarse location without recording it for an anonymous visitor', async () => {
    const ipGeo = {
      resolve: jest.fn().mockResolvedValue({ ip: '8.8.8.8' }),
      visibleLocation: jest.fn().mockResolvedValue({
        country: '中国', province: '山东省', city: '济南市', district: '',
        latitude: 36.68, longitude: 117.06, provider: 'aliyun-market-lundear',
      }),
      recordForUser: jest.fn(),
    };
    const controller = new RegionController({} as any, ipGeo as any);

    await expect(controller.getLocationRecommendation({
      headers: { 'x-forwarded-for': '8.8.8.8, 10.0.0.1' },
    } as any)).resolves.toMatchObject({ status: 0, city: '济南市' });

    expect(ipGeo.resolve).toHaveBeenCalledWith('8.8.8.8');
    expect(ipGeo.recordForUser).not.toHaveBeenCalled();
  });
});
