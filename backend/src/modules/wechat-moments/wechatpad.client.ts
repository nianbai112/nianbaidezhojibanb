import axios, { AxiosInstance } from 'axios';

/**
 * 个微协议（wechatpad.apifox.cn）朋友圈相关接口的最小客户端。
 *
 * 发图文朋友圈是三步：
 *   1. 网关 POST /cdn/get_cdn_info           → cdn 凭证（整包原样转给第 2 步）
 *   2. 自建 CDN POST /v1/cdn/upload_sns_image → cdnid / width / height
 *   3. 网关 POST /sns/post_image_by_cdnid    → 发布，resp.id 为朋友圈 id（uint64）
 */

export interface WechatpadConfig {
  baseUrl: string;
  appKey: string;
  appSecret: string;
  deviceId: string;
  cdnBaseUrl: string;
  cdnToken?: string;
  timeoutMs?: number;
}

export interface SnsImage {
  cdnid: string;
  width: number;
  height: number;
  totalSize: number;
}

export interface PostMomentResult {
  snsId: string;
  mediaCount: number;
  raw: any;
}

export class WechatpadError extends Error {
  /**
   * ambiguous = 请求可能已经到达对方但没拿到结果（超时/连接中断）。
   * 对“发布”这一步而言，意味着朋友圈可能已经发出，不能自动重试，否则会重复发。
   */
  constructor(
    message: string,
    readonly ambiguous = false,
    readonly detail?: unknown,
  ) {
    super(message);
    this.name = 'WechatpadError';
  }
}

/**
 * 朋友圈 id 是 uint64（如 14962494110775251489），超过 JS 安全整数范围，
 * 直接 JSON.parse 会丢精度导致以后无法删除。这里把 16 位以上的整数先转成字符串。
 */
export function parseJsonKeepingBigInts(text: string): any {
  if (typeof text !== 'string') return text;
  const trimmed = text.trim();
  if (!trimmed) return {};
  // Match complete JSON strings first, so numbers inside message content stay untouched.
  const safe = trimmed.replace(/"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g, (token) => {
    if (token.startsWith('"') || !/^-?\d+$/.test(token)) return token;
    return Number.isSafeInteger(Number(token)) ? token : JSON.stringify(token);
  });
  return JSON.parse(safe);
}

/** 只保留 cdnid 中段；误传完整 URL（cdnMidUrl）会导致微信 ret=201 */
export function normalizeCdnid(value: unknown): string {
  const raw = String(value || '').trim();
  const match = raw.match(/\/mmsns\/([^/?#]+)/);
  return match ? match[1] : raw;
}

/**
 * 文档中的单图格式：顶层 cdnid/width/height/total_size。
 * 多图时额外带 medias 数组（每项同样字段）。多图字段名文档未写明，需向协议方确认，
 * 发布后会用返回的 resp.medias 数量核对是否真的发出了全部图片。
 */
export function buildMomentBody(deviceId: string, images: SnsImage[]) {
  if (!images.length) throw new WechatpadError('没有可发布的图片');
  const toMedia = (img: SnsImage) => ({
    cdnid: img.cdnid,
    width: img.width,
    height: img.height,
    total_size: img.totalSize,
  });
  const first = toMedia(images[0]);
  return {
    device_id: deviceId,
    content: '',
    ...first,
    ...(images.length > 1 ? { medias: images.map(toMedia) } : {}),
  };
}

export class WechatpadClient {
  private readonly http: AxiosInstance;

  constructor(
    private readonly config: WechatpadConfig,
    http?: AxiosInstance,
  ) {
    this.http =
      http ||
      axios.create({
        timeout: config.timeoutMs || 30000,
        transformResponse: [(data) => data],
        responseType: 'text',
      });
  }

  /** 朋友圈图片使用 sns 凭证池，与 upload_sns_image 对应。 */
  async getCdnInfo(pool: 'sns' | 'dns' | 'app' | '' = 'sns'): Promise<Record<string, any>> {
    const data = await this.request('获取CDN凭证', `${this.gateway()}/cdn/get_cdn_info`, {
      device_id: this.config.deviceId,
      pool,
    });
    if (!data || typeof data !== 'object' || !Object.keys(data).length) {
      throw new WechatpadError('获取CDN凭证失败：返回为空', false, data);
    }
    return data;
  }

  async uploadSnsImage(cdnInfo: Record<string, any>, image: Buffer): Promise<{ cdnid: string; width: number; height: number }> {
    const headers: Record<string, string> = {};
    if (this.config.cdnToken) headers['X-Cdn-Token'] = this.config.cdnToken;
    const data = await this.request(
      '上传朋友圈图片',
      `${trimSlash(this.config.cdnBaseUrl)}/v1/cdn/upload_sns_image`,
      // wxcdnd 不接受同时传入两个同义字段；CDN 请求也不能携带网关密钥。
      { cdn_info: cdnInfo, image: image.toString('base64') },
      headers,
      false,
      false,
    ).catch((error: WechatpadError) => {
      if (/HTTP 404/.test(error.message)) {
        throw new WechatpadError(
          `上传朋友圈图片失败：${trimSlash(this.config.cdnBaseUrl)} 上没有图片上传接口（HTTP 404）。请向 wxbot 确认图片服务（wxcdnd）的地址，填到后台「图片服务地址」`,
          false,
          error.detail,
        );
      }
      throw error;
    });
    const errcode = Number(data?.base?.errcode ?? data?.errcode ?? 0);
    const cdnid = normalizeCdnid(data?.cdnid ?? data?.data?.cdnid);
    if (errcode !== 0 || !cdnid) {
      throw new WechatpadError(`上传朋友圈图片失败：${data?.base?.errmsg || data?.errmsg || '未返回 cdnid'}`, false, data);
    }
    return {
      cdnid,
      width: Number(data?.width ?? data?.data?.width) || 0,
      height: Number(data?.height ?? data?.data?.height) || 0,
    };
  }

  async postImages(images: SnsImage[]): Promise<PostMomentResult> {
    const data = await this.request(
      '发布朋友圈',
      `${this.gateway()}/sns/post_image_by_cdnid`,
      buildMomentBody(this.config.deviceId, images),
      {},
      true,
    );
    const resp = data?.resp;
    const snsId = resp?.id !== undefined && resp?.id !== null ? String(resp.id) : '';
    if (!snsId || snsId === '0') {
      throw new WechatpadError(`发布朋友圈失败：${data?.errmsg || data?.message || '未返回朋友圈 id'}`, false, data);
    }
    return { snsId, mediaCount: Array.isArray(resp?.medias) ? resp.medias.length : 0, raw: data };
  }

  /** An HTTP 200 alone is not a delivery receipt. Unknown shapes require operator review. */
  async sendText(to: string, content: string): Promise<{ messageId: string | null; confirmed: boolean }> {
    const data = await this.request('发送文本', `${this.gateway()}/message/send`,
      { device_id: this.config.deviceId, to, content }, {}, true);
    let successful = false;
    for (const result of messageReceiptNodes(data)) {
      const codes = [result.ret, result.base?.ret, result.base_resp?.ret, result.baseResponse?.ret]
        .filter((value) => value !== undefined && value !== null);
      if (codes.some((value) => Number(value) !== 0) || result.ok === false) {
        throw new WechatpadError('协议拒绝发送文本', false);
      }
      successful ||= result.ok === true || codes.some((value) => Number(value) === 0);
    }
    const messageId = extractMessageId(data);
    if (!messageId && String(data?.errmsg || data?.error || '').trim() && !successful) {
      throw new WechatpadError('协议拒绝发送文本', false);
    }
    return { messageId, confirmed: Boolean(messageId && successful) };
  }

  // ---------------------------------------------------------------------
  // 设备与登录（后台“朋友圈同步”页面使用）
  // ---------------------------------------------------------------------

  /** 可用设备规格 */
  async deviceSpecs(): Promise<any> {
    return this.request('获取设备规格', `${this.gateway()}/device/specs`, {});
  }

  /** 创建（初始化）设备，返回 device_id */
  async initDevice(specKey?: string): Promise<{ deviceId: string; raw: any }> {
    const data = await this.request('创建设备', `${this.gateway()}/device/init`, specKey ? { spec_key: specKey } : {});
    const deviceId = String(data?.device_id ?? data?.data?.device_id ?? data?.deviceId ?? '').trim();
    if (!deviceId) throw new WechatpadError(`创建设备失败：${data?.errmsg || data?.message || '未返回 device_id'}`, false, data);
    return { deviceId, raw: data };
  }

  /** 登录二维码（PNG）。网关若返回 JSON，则尝试从中取出图片 */
  async loginQrImage(): Promise<{ mimeType: string; buffer: Buffer } | { url: string }> {
    const deviceId = encodeURIComponent(this.config.deviceId);
    try {
      const res = await this.http.post(`${this.gateway()}/login/qr?device_id=${deviceId}`, { device_id: this.config.deviceId }, {
        headers: this.authHeaders(),
        responseType: 'arraybuffer',
        transformResponse: [(data) => data],
      });
      const buffer = Buffer.from(res.data as ArrayBuffer);
      const contentType = String(res.headers?.['content-type'] || '');
      if (contentType.startsWith('image/') || buffer.subarray(0, 4).toString('hex') === '89504e47') {
        return { mimeType: contentType.startsWith('image/') ? contentType : 'image/png', buffer };
      }
      const json = parseJsonKeepingBigInts(buffer.toString('utf8'));
      return extractQrFromJson(json);
    } catch (error: any) {
      if (error instanceof WechatpadError) throw error;
      throw this.toError('获取登录二维码', error, false);
    }
  }

  /** 登录状态快照（原样返回，字段以协议为准） */
  async loginStatus(): Promise<any> {
    const deviceId = encodeURIComponent(this.config.deviceId);
    try {
      const res = await this.http.get(`${this.gateway()}/login/qr/status?device_id=${deviceId}`, {
        headers: this.authHeaders(),
        transformResponse: [(data) => data],
        responseType: 'text',
      });
      return typeof res.data === 'string' ? parseJsonKeepingBigInts(res.data) : res.data;
    } catch (error: any) {
      throw this.toError('查询登录状态', error, false);
    }
  }

  /** 免扫码：推送到手机上确认登录（需要该微信号之前在这台设备登录过） */
  async loginPush(): Promise<any> {
    const deviceId = encodeURIComponent(this.config.deviceId);
    return this.request('推送手机登录', `${this.gateway()}/login/push?device_id=${deviceId}`, { device_id: this.config.deviceId });
  }

  /** 新设备登录时的滑块验证 ticket 回传 */
  async submitVerifyTicket(ticket: string): Promise<any> {
    return this.request('提交滑块验证', `${this.gateway()}/login/verify`, { device_id: this.config.deviceId, ticket });
  }

  /** 设置事件回调地址（传空字符串 = 取消） */
  async setCallback(callbackUrl: string): Promise<any> {
    return this.request('设置回调地址', `${this.gateway()}/device/callback`, { device_id: this.config.deviceId, callback_url: callbackUrl });
  }

  /** 解除因回调连续失败被自动暂停的推送 */
  async resumeWebhook(): Promise<any> {
    const deviceId = encodeURIComponent(this.config.deviceId);
    return this.request('恢复回调推送', `${this.gateway()}/device/webhook/resume?device_id=${deviceId}`, { device_id: this.config.deviceId });
  }

  private authHeaders() {
    return { 'X-App-Key': this.config.appKey, 'X-App-Secret': this.config.appSecret };
  }

  private toError(label: string, error: any, sideEffect: boolean): WechatpadError {
    const status = error?.response?.status;
    if (status) {
      let payload: any = error.response.data;
      try {
        if (Buffer.isBuffer(payload)) payload = payload.toString('utf8');
        else if (payload instanceof ArrayBuffer) payload = Buffer.from(new Uint8Array(payload)).toString('utf8');
        payload = typeof payload === 'string' ? parseJsonKeepingBigInts(payload) : payload;
      } catch {
        // keep raw text
      }
      const msg = payload?.errmsg || payload?.message || payload?.error || (typeof payload === 'string' ? payload.slice(0, 200) : '');
      return new WechatpadError(`${label}失败：HTTP ${status}${msg ? ` ${msg}` : ''}`, sideEffect && (status >= 500 || status === 408), payload);
    }
    return new WechatpadError(`${label}失败：${error?.code || error?.message || '网络错误'}`, sideEffect, error?.code);
  }

  private gateway() {
    return trimSlash(this.config.baseUrl);
  }

  private async request(label: string, url: string, body: unknown, extraHeaders: Record<string, string> = {}, sideEffect = false, gatewayAuth = true) {
    try {
      const res = await this.http.post(url, body, {
        headers: { 'Content-Type': 'application/json', ...(gatewayAuth ? this.authHeaders() : {}), ...extraHeaders },
        maxRedirects: 0,
        transformResponse: [(data) => data],
        responseType: 'text',
      });
      return typeof res.data === 'string' ? parseJsonKeepingBigInts(res.data) : res.data;
    } catch (error: any) {
      if (error instanceof WechatpadError) throw error;
      // 没有响应：请求可能已送达。只有“发布”这一步需要当作结果未知。
      throw this.toError(label, error, sideEffect);
    }
  }
}

function trimSlash(url: string) {
  return String(url || '').trim().replace(/\/+$/, '');
}

/** Only response envelopes are searched; echoed request data is not a receipt. */
function messageReceiptNodes(data: unknown): Record<string, any>[] {
  const nodes: Record<string, any>[] = [];
  const visit = (value: any, depth: number) => {
    if (!value || typeof value !== 'object' || depth > 3) return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }
    nodes.push(value);
    for (const key of ['data', 'resp', 'result', 'results', 'list']) {
      if (Object.prototype.hasOwnProperty.call(value, key)) visit(value[key], depth + 1);
    }
  };
  visit(data, 0);
  return nodes;
}

/** Recognize common message-ID spellings, without accepting rounded or conflicting IDs. */
export function extractMessageId(data: unknown): string | null {
  const ids = new Set<string>();
  const keys = ['new_msg_id', 'newMsgId', 'NewMsgId', 'msg_svr_id', 'msgSvrId', 'svr_id', 'svrId', 'msg_id', 'msgId', 'MsgId'];
  for (const node of messageReceiptNodes(data)) {
    for (const key of keys) {
      const value = node[key];
      if (typeof value !== 'string' && !(typeof value === 'number' && Number.isSafeInteger(value) && value > 0)) continue;
      const id = String(value).trim();
      if (id && id !== '0') ids.add(id);
    }
  }
  return ids.size === 1 ? [...ids][0] : null;
}

/** 网关以 JSON 返回二维码时，常见字段：base64 图片 / data URI / 图片链接 */
export function extractQrFromJson(json: any): { mimeType: string; buffer: Buffer } | { url: string } {
  const candidates: unknown[] = [];
  const visit = (value: any, depth = 0) => {
    if (!value || depth > 3) return;
    if (typeof value === 'string') candidates.push(value);
    else if (typeof value === 'object') Object.values(value).forEach((v) => visit(v, depth + 1));
  };
  visit(json);
  for (const item of candidates) {
    const text = String(item).trim();
    const dataUri = text.match(/^data:(image\/[a-z]+);base64,(.+)$/i);
    if (dataUri) return { mimeType: dataUri[1], buffer: Buffer.from(dataUri[2], 'base64') };
    if (/^iVBORw0KGgo/.test(text)) return { mimeType: 'image/png', buffer: Buffer.from(text, 'base64') };
    if (/^\/9j\//.test(text)) return { mimeType: 'image/jpeg', buffer: Buffer.from(text, 'base64') };
  }
  const url = candidates.map(String).find((text) => /^https?:\/\/\S+/i.test(text));
  if (url) return { url };
  throw new WechatpadError(`获取登录二维码失败：${json?.errmsg || json?.message || '返回中没有二维码'}`, false, json);
}
