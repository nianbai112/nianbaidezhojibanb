import { Injectable, Logger } from '@nestjs/common';
import { isIP } from 'node:net';
import axios from 'axios';
import { PrismaService } from '../../common/services/prisma.service';

const IP_GEO_ENDPOINT = 'https://qryip.market.alicloudapi.com/lundear/qryip';

export type IpGeoLocation = {
  ip: string;
  country: string;
  province: string;
  city: string;
  district: string;
  latitude: number | null;
  longitude: number | null;
  adcode: string;
  provider: 'aliyun-market-lundear';
};

type IpGeoConfig = {
  enabled?: boolean;
  appCode?: string;
  showCountry?: boolean;
  showProvince?: boolean;
  showCity?: boolean;
  showDistrict?: boolean;
};

@Injectable()
export class IpGeoService {
  private readonly logger = new Logger(IpGeoService.name);

  constructor(private readonly prisma: PrismaService) {}

  async resolve(ip?: string | null): Promise<IpGeoLocation | null> {
    const normalizedIp = this.normalizePublicIp(ip);
    if (!normalizedIp) return null;

    const config = await this.getConfig();
    const appCode = String(config.appCode || '').trim();
    if (!config.enabled || !appCode) return null;

    try {
      const { data } = await axios.get(IP_GEO_ENDPOINT, {
        params: { ip: normalizedIp },
        headers: { Authorization: `APPCODE ${appCode}` },
        timeout: 5000,
      });
      if (Number(data?.status) !== 0) return null;

      const adInfo = data?.result?.ad_info || {};
      const point = data?.result?.location || {};
      return {
        ip: normalizedIp,
        country: this.text(adInfo.nation),
        province: this.text(adInfo.province),
        city: this.text(adInfo.city),
        district: this.text(adInfo.district),
        latitude: this.numberOrNull(point.lat),
        longitude: this.numberOrNull(point.lng),
        adcode: this.text(adInfo.adcode),
        provider: 'aliyun-market-lundear',
      };
    } catch (error: any) {
      this.logger.warn(`IP 归属地查询失败（${normalizedIp}）：${error?.message || '未知错误'}`);
      return null;
    }
  }

  async visibleLocation(location: Omit<IpGeoLocation, 'provider'> & { provider?: IpGeoLocation['provider'] } | null) {
    if (!location) return null;
    const config = await this.getConfig();
    if (!config.enabled) return null;
    return {
      ...location,
      country: config.showCountry === false ? '' : location.country,
      province: config.showProvince === false ? '' : location.province,
      city: config.showCity === false ? '' : location.city,
      district: config.showDistrict === false ? '' : location.district,
    };
  }

  async recordForUser(userId: string, location: IpGeoLocation) {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        lastLoginIp: location.ip,
        lastLoginCountry: location.country || null,
        lastLoginProvince: location.province || null,
        lastLoginCity: location.city || null,
        lastLoginDistrict: location.district || null,
        lastLoginLocationSource: location.provider,
        lastLoginLocatedAt: new Date(),
      },
    });
  }

  private async getConfig(): Promise<IpGeoConfig> {
    const config = await this.prisma.config.findUnique({ where: { key: 'ip_geo' } });
    return config?.value && typeof config.value === 'object' ? (config.value as IpGeoConfig) : {};
  }

  private normalizePublicIp(value?: string | null) {
    const ip = String(value || '').split(',')[0].trim().replace(/^::ffff:/i, '');
    const family = isIP(ip);
    if (!family || this.isPrivateIp(ip, family)) return '';
    return ip;
  }

  private isPrivateIp(ip: string, family: number) {
    if (family === 4) {
      const [a, b] = ip.split('.').map(Number);
      return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127)
        || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
    }
    const normalized = ip.toLowerCase();
    return normalized === '::1' || normalized === '::' || normalized.startsWith('fc')
      || normalized.startsWith('fd') || normalized.startsWith('fe80:');
  }

  private text(value: unknown) {
    return String(value ?? '').trim();
  }

  private numberOrNull(value: unknown) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
}
