import axios from 'axios';
import { IpGeoService } from './ip-geo.service';

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('IpGeoService', () => {
  const config = { findUnique: jest.fn() };
  const service = new IpGeoService({ config } as any);

  beforeEach(() => jest.clearAllMocks());

  it('does not call the provider when the feature is disabled', async () => {
    config.findUnique.mockResolvedValue({ value: { enabled: false, appCode: 'test' } });

    await expect(service.resolve('8.8.8.8')).resolves.toBeNull();
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });

  it('uses AppCode authentication and maps the provider response', async () => {
    config.findUnique.mockResolvedValue({ value: { enabled: true, appCode: 'test-code' } });
    mockedAxios.get.mockResolvedValue({
      data: {
        status: 0,
        result: {
          location: { lat: 36.68, lng: 117.06 },
          ad_info: { nation: '中国', province: '山东省', city: '济南市', district: '历城区', adcode: 370112 },
        },
      },
    } as any);

    await expect(service.resolve('8.8.8.8')).resolves.toMatchObject({
      country: '中国', province: '山东省', city: '济南市', district: '历城区', adcode: '370112',
    });
    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://qryip.market.alicloudapi.com/lundear/qryip',
      expect.objectContaining({ params: { ip: '8.8.8.8' }, headers: { Authorization: 'APPCODE test-code' } }),
    );
  });

  it.each([
    { lat: '', lng: '', label: 'blank coordinates' },
    { lat: null, lng: null, label: 'null coordinates' },
    { lat: 0, lng: 0, label: 'zero coordinates' },
    { lat: 91, lng: 108, label: 'out-of-range coordinates' },
  ])('does not expose $label from a successful IP lookup', async ({ lat, lng }) => {
    config.findUnique.mockResolvedValue({ value: { enabled: true, appCode: 'test-code' } });
    mockedAxios.get.mockResolvedValue({
      data: {
        status: 0,
        result: {
          location: { lat, lng },
          ad_info: { nation: '中国', province: '重庆市', city: '重庆市' },
        },
      },
    } as any);

    await expect(service.resolve('8.8.8.8')).resolves.toMatchObject({
      latitude: null,
      longitude: null,
    });
  });
});
