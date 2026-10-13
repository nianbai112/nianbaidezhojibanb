import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import axios from 'axios';
export type Division = { code: string; name: string };
@Injectable()
export class AdministrativeDivisionService {
  private cache = new Map<string, { until: number; rows: Division[] }>();
  private flights = new Map<string, Promise<Division[]>>();
  constructor(private readonly config: ConfigService) {}
  async children(parent = ''): Promise<Division[]> {
    if (parent && !/^\d{6}$/.test(parent)) throw new BadRequestException('行政区划编码无效');
    const cached = this.cache.get(parent);
    if (cached && cached.until > Date.now()) return cached.rows.map(row => ({ ...row }));
    const pending = this.flights.get(parent); if (pending) return pending;
    const task = this.fetchChildren(parent); this.flights.set(parent, task);
    try { return await task; } finally { this.flights.delete(parent); }
  }
  private async fetchChildren(parent: string): Promise<Division[]> {
    const key = String(this.config.get('TENCENT_MAP_WEB_SERVICE_KEY') || '').trim();
    const secret = String(this.config.get('TENCENT_MAP_WEB_SERVICE_SECRET') || '').trim();
    if (!key) throw new ServiceUnavailableException('省市区服务尚未配置，请联系管理员');
    const path = '/ws/district/v1/getchildren';
    const query = `${parent ? `id=${parent}&` : ''}key=${encodeURIComponent(key)}`;
    const signature = secret ? '&sig=' + createHash('md5').update(path + '?' + query + secret).digest('hex') : '';
    let data: any;
    try { ({ data } = await axios.get('https://apis.map.qq.com' + path + '?' + query + signature, { timeout: 8000, maxRedirects: 0, maxContentLength: 1024 * 1024 })); }
    catch { throw new ServiceUnavailableException('省市区服务暂不可用，请稍后重试'); }
    if (data?.status !== 0 || !Array.isArray(data?.result) || (data.result.length > 0 && !Array.isArray(data.result[0]))) throw new ServiceUnavailableException('省市区服务返回异常，请稍后重试');
    // Six-digit county-level codes only; township codes are not shipping districts.
    const seen = new Set<string>();
    const rows: Division[] = (data.result[0] || []).filter((r: any) => /^\d{6}$/.test(String(r?.id)) && typeof r?.fullname === 'string' && r.fullname.trim())
      .map((r: any) => ({ code: String(r.id), name: r.fullname.trim() })).filter((r: Division) => { if (seen.has(r.code)) return false; seen.add(r.code); return true; });
    if (this.cache.size >= 4000) this.cache.delete(this.cache.keys().next().value);
    this.cache.set(parent, { until: Date.now() + 24 * 60 * 60 * 1000, rows });
    return rows.map(row => ({ ...row }));
  }
  async validatePath(provinceCode: string, cityCode: string, districtCode: string) {
    if (![provinceCode, cityCode, districtCode].every(code => /^\d{6}$/.test(code))) throw new BadRequestException('请完整选择省、市、区县');
    const province = (await this.children()).find(row => row.code === provinceCode);
    if (!province) throw new BadRequestException('请选择有效省份');
    const provinceChildren = await this.children(provinceCode);
    // Municipalities may have counties directly under their official province code.
    // Mixed province-direct counties also retain their real code in the city selector.
    const directCounties = provinceChildren.length > 0 && provinceChildren.every(row => !row.code.endsWith('00'));
    const city = cityCode === provinceCode && directCounties ? province : provinceChildren.find(row => row.code === cityCode);
    if (!city) throw new BadRequestException('城市不属于所选省份');
    const countyRows = city.code === province.code ? provinceChildren : await this.children(city.code);
    const district = countyRows.find(row => row.code === districtCode) || (countyRows.length === 0 && districtCode === city.code ? city : undefined);
    if (!district) throw new BadRequestException('区县不属于所选城市');
    return { provinceCode, cityCode, districtCode, label: [...new Set([province.name, city.name, district.name])].join(' ') };
  }
  // Shipping owners use the same verified selection; clients cannot invent region codes.
  async validateSelection(value: { provinceCode: string; cityCode: string; districtCode: string }, level: 'province' | 'city' | 'district') {
    const result = await this.validatePath(value.provinceCode, value.cityCode, value.districtCode);
    if (!['province', 'city', 'district'].includes(level)) throw new BadRequestException('地区适用层级无效');
    return { code: result[level === 'province' ? 'provinceCode' : level === 'city' ? 'cityCode' : 'districtCode'], label: result.label };
  }
}
