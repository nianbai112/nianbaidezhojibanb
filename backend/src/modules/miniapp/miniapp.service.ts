import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/services/prisma.service';
import axios from 'axios';

@Injectable()
export class MiniappService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private get appId() {
    return this.config.get<string>('WX_MINI_APPID') || '';
  }
  private get appSecret() {
    return this.config.get<string>('WX_MINI_SECRET') || '';
  }

  /** 获取微信接口 access_token */
  private async getAccessToken(): Promise<string> {
    const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${this.appId}&secret=${this.appSecret}`;
    const res = await axios.get(url);
    if (res.data.errcode) {
      throw new BadRequestException(`获取微信 access_token 失败: ${res.data.errmsg}`);
    }
    return res.data.access_token;
  }

  // =================== 小程序码管理 ===================
  /** 生成小程序码（wxacode/getunlimited） */
  async generateQrcode(dto: { path: string; width?: number; envVersion?: string }) {
    const token = await this.getAccessToken();
    const url = `https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${token}`;
    const res = await axios.post(url, {
      scene: 'default',
      page: dto.path || 'pages/index/index',
      width: dto.width || 430,
      env_version: dto.envVersion || 'release',
    }, { responseType: 'arraybuffer' });

    // 返回 base64 图片
    const base64 = Buffer.from(res.data).toString('base64');
    return { qrcode: `data:image/png;base64,${base64}`, path: dto.path };
  }

  // =================== 小程序页面路径管理 ===================
  /** 获取所有已登记页面路径（存储在 Config 中） */
  async getPagePaths() {
    const cfg = await this.prisma.config.findUnique({ where: { key: 'miniapp.page_paths' } });
    return (cfg?.value as any[]) || [];
  }

  /** 更新页面路径列表 */
  async updatePagePaths(paths: any[]) {
    await this.prisma.config.upsert({
      where: { key: 'miniapp.page_paths' },
      update: { value: paths },
      create: { key: 'miniapp.page_paths', value: paths, group: 'miniapp', desc: '小程序页面路径配置' },
    });
    return { success: true, count: paths.length };
  }

  // =================== 订阅消息模板 ===================
  /** 获取已添加的消息模板列表 */
  async getSubscribeTemplates() {
    const token = await this.getAccessToken();
    const url = `https://api.weixin.qq.com/wxaapi/newtmpl/gettemplate?access_token=${token}`;
    const res = await axios.get(url);
    if (res.data.errcode && res.data.errcode !== 0) {
      throw new BadRequestException(`获取模板失败: ${res.data.errmsg}`);
    }
    return res.data.data || [];
  }

  /** 添加订阅消息模板 */
  async addSubscribeTemplate(dto: { tid: string; kidList?: number[] }) {
    const token = await this.getAccessToken();
    const url = `https://api.weixin.qq.com/wxaapi/newtmpl/addtemplate?access_token=${token}`;
    const res = await axios.post(url, { tid: dto.tid, kidList: dto.kidList || [] });
    if (res.data.errcode && res.data.errcode !== 0) {
      throw new BadRequestException(`添加模板失败: ${res.data.errmsg}`);
    }
    return { priTmplId: res.data.priTmplId };
  }

  /** 删除订阅消息模板 */
  async deleteSubscribeTemplate(priTmplId: string) {
    const token = await this.getAccessToken();
    const url = `https://api.weixin.qq.com/wxaapi/newtmpl/deltemplate?access_token=${token}`;
    const res = await axios.post(url, { priTmplId });
    if (res.data.errcode && res.data.errcode !== 0) {
      throw new BadRequestException(`删除模板失败: ${res.data.errmsg}`);
    }
    return { success: true };
  }

  // =================== 小程序版本 ===================
  /** 获取代码版本（模拟，实际需配合CI/CD） */
  async getVersionInfo() {
    const cfg = await this.prisma.config.findUnique({ where: { key: 'miniapp.version_info' } });
    return (cfg?.value as any) || { version: 'N/A', uploadedAt: null, desc: '暂无版本信息' };
  }

  /** 记录已上传的版本信息 */
  async recordUpload(dto: { version?: string; desc?: string }) {
    const value = { version: dto.version || '1.0.0', desc: dto.desc || '', uploadedAt: new Date().toISOString() };
    await this.prisma.config.upsert({
      where: { key: 'miniapp.version_info' },
      update: { value },
      create: { key: 'miniapp.version_info', value, group: 'miniapp', desc: '小程序上传版本信息' },
    });
    return value;
  }
}
