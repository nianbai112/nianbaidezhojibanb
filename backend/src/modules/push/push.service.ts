import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';

export interface PushMessagePayload {
  platform?: string;
  title: string;
  content: string;
  data?: Record<string, any>;
}

/**
 * uni-push（个推）离线推送服务。
 *
 * 密钥通过环境变量配置，未配置时所有方法返回 false 静默跳过，不影响主流程：
 *   UNI_PUSH_APPID
 *   UNI_PUSH_APPKEY
 *   UNI_PUSH_MASTER_SECRET
 *
 * 接入时在 DCloud 后台创建 uni-push 应用，填入上述三个值，并在 DCloud 后台开通
 * 对应平台的推送服务后即可生效。具体接口地址与请求体可参考个推官方 REST 文档
 * （v2：先 POST /v2/{appId}/auth 取 token，再 POST /v2/{appId}/push/single/cid 单推）。
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(private readonly config: ConfigService) {}

  private credentials() {
    const appId = this.config.get('UNI_PUSH_APPID');
    const appKey = this.config.get('UNI_PUSH_APPKEY');
    const masterSecret = this.config.get('UNI_PUSH_MASTER_SECRET');
    return appId && appKey && masterSecret ? { appId, appKey, masterSecret } : null;
  }

  isConfigured(): boolean {
    return Boolean(this.credentials());
  }

  /** 向单个客户端推送离线消息；未配置密钥或推送失败时返回 false */
  async sendToClient(clientId: string, payload: PushMessagePayload): Promise<boolean> {
    const creds = this.credentials();
    if (!creds || !clientId) return false;
    try {
      const authToken = await this.authToken(creds);
      if (!authToken) return false;
      const title = String(payload.title || '').slice(0, 32);
      const content = String(payload.content || '').slice(0, 100);
      const data = JSON.stringify(payload.data || {});
      const body = {
        request_id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        audience: { cid: [clientId] },
        settings: { ttl: 24 * 60 * 60 * 1000 },
        push_message: payload.platform?.toLowerCase() === 'ios'
          ? { transmission: JSON.stringify({ title, content, payload: payload.data || {} }) }
          : { notification: { title, body: content, click_type: 'payload', payload: data } },
        // https://docs.getui.com/getui/server/rest_v2/common_args/
        // Android 离线点击先打开首页，由前台查询补齐订单与待转单。
        push_channel: {
          ios: { type: 'notify', payload: data, aps: { alert: { title, body: content }, sound: 'default', 'content-available': 0 } },
          android: { ups: {
            notification: { title, body: content, click_type: 'startapp' },
            ...(this.config.get('UNI_PUSH_ANDROID_OPTIONS')
              ? { options: JSON.parse(this.config.get<string>('UNI_PUSH_ANDROID_OPTIONS') || '{}') } : {}),
          } },
        },
      };
      const response = await fetch(`https://restapi.getui.com/v2/${creds.appId}/push/single/cid`, {
        method: 'POST',
        signal: AbortSignal.timeout(10000),
        headers: { 'Content-Type': 'application/json', token: authToken },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        this.logger.warn(`uni-push 单推失败: HTTP ${response.status}`);
        return false;
      }
      const result: any = await response.json().catch(() => null);
      if (result?.code !== 0) {
        this.logger.warn(`uni-push 业务拒绝: code=${result?.code ?? 'invalid_response'}`);
        return false;
      }
      const statuses = Object.values(result.data || {}).flatMap((value) =>
        value && typeof value === 'object' ? Object.values(value) : [value]);
      return statuses.some((status) => ['successed_online', 'successed_offline'].includes(String(status)));
    } catch (error: any) {
      this.logger.warn(`uni-push 单推异常: ${error?.message || 'unknown'}`);
      return false;
    }
  }

  private async authToken(creds: { appId: string; appKey: string; masterSecret: string }): Promise<string | null> {
    const timestamp = String(Date.now());
    const sign = createHash('sha256').update(`${creds.appKey}${timestamp}${creds.masterSecret}`).digest('hex');
    const response = await fetch(`https://restapi.getui.com/v2/${creds.appId}/auth`, {
      method: 'POST',
      signal: AbortSignal.timeout(10000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sign, timestamp, appkey: creds.appKey }),
    });
    if (!response.ok) return null;
    const result: any = await response.json().catch(() => null);
    return result?.code === 0 ? result?.data?.token || null : null;
  }
}
