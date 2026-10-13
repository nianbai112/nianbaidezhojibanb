import { BadRequestException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { createHash, createPrivateKey, createPublicKey, JsonWebKey, KeyObject, sign, timingSafeEqual, verify } from 'crypto';
import { RedisService } from '../../common/services/redis.service';

export type AppOAuthIdentity = {
  provider: 'wechat' | 'apple';
  appId: string;
  subject: string;
  unionId?: string;
  // 仅服务端生命周期层使用，必须加密落库，不能展开到公开登录响应或写入日志。
  appleRefreshToken?: string;
  appleAuthorizedAtMs?: number;
};

export type AppleNotification = {
  id: string;
  appId: string;
  subject: string;
  type: 'consent-revoked' | 'account-deleted' | 'email-enabled' | 'email-disabled';
  issuedAtMs: number;
  eventTimeMs: number;
};

type AppleConfig = { clientId: string; teamId: string; keyId: string; privateKey: KeyObject };
type AppleJwk = JsonWebKey & { kid?: string; alg?: string; use?: string };

const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_TOKEN_URL = `${APPLE_ISSUER}/auth/token`;
const APPLE_REVOKE_URL = `${APPLE_ISSUER}/auth/revoke`;
const APPLE_KEYS_URL = `${APPLE_ISSUER}/auth/keys`;
const WECHAT_TOKEN_URL = 'https://api.weixin.qq.com/sns/oauth2/access_token';
const HTTP_OPTIONS = {
  timeout: 10000,
  maxRedirects: 0,
  maxContentLength: 65536,
  maxBodyLength: 16384,
};

// App OAuth 使用移动应用自身的凭据，不能回退到微信小程序或管理后台 JWT 配置。
// 只接受一次性 code；客户端提供的 openid、email、identityToken 都不是此服务的身份来源。
@Injectable()
export class AppOauthService {
  private appleKeys: AppleJwk[] = [];
  private appleKeysExpireAt = 0;
  // Public notifications contain attacker-controlled kid values. Bound refresh
  // attempts per service instance, including failures, without trusting stale keys.
  private appleKeysNextRefreshAt = 0;
  private appleKeysRequest?: Promise<void>;

  constructor(private readonly config: ConfigService, private readonly redis: RedisService) {}

  async verifyWechatCode(input: unknown): Promise<AppOAuthIdentity> {
    const code = this.authorizationCode(input);
    const appId = this.setting('WX_APP_APPID');
    const secret = this.setting('WX_APP_SECRET');
    if (!/^wx[a-zA-Z0-9]{16}$/.test(appId) || !secret) throw this.notConfigured();
    await this.reserveCode('wechat', appId, code);

    let data: any;
    try {
      const response = await axios.get(WECHAT_TOKEN_URL, {
        ...HTTP_OPTIONS,
        params: { appid: appId, secret, code, grant_type: 'authorization_code' },
      });
      data = response.data;
    } catch {
      // 不透出 axios 原始异常：其中 config.params 含应用密钥和一次性凭证。
      throw this.providerUnavailable();
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw this.providerUnavailable();
    if (data.errcode) {
      if ([40029, 40163, 40226].includes(Number(data.errcode))) throw this.invalidCode();
      throw this.providerUnavailable();
    }
    if (!this.identifier(data.openid) || !this.identifier(data.access_token, 4096) ||
        !Number.isFinite(data.expires_in) || data.expires_in <= 0 ||
        typeof data.scope !== 'string' || !data.scope.split(',').map((scope: string) => scope.trim()).includes('snsapi_userinfo')) {
      throw this.invalidIdentity();
    }
    if (data.unionid != null && data.unionid !== '' && !this.identifier(data.unionid)) throw this.invalidIdentity();
    return { provider: 'wechat', appId, subject: data.openid, ...(data.unionid ? { unionId: data.unionid } : {}) };
  }

  // expectedNonce 仅允许来自服务端保存的授权上下文，不能把客户端 DTO.nonce 直接传入。
  // 未传 nonce 时依赖 Apple 一次性 code 换码和 Redis 防重放；不宣称绑定了发起设备/会话。
  async verifyAppleCode(input: unknown, expectedNonce?: string): Promise<AppOAuthIdentity> {
    const code = this.authorizationCode(input);
    const settings = this.appleConfig();
    if (expectedNonce !== undefined && !this.identifier(expectedNonce, 256)) {
      throw new BadRequestException({ code: 'APP_OAUTH_NONCE_INVALID', message: '授权校验信息无效，请重新授权' });
    }
    const clientSecret = this.createAppleClientSecret(settings);
    await this.reserveCode('apple', settings.clientId, code);

    // 原生 App 授权未使用 redirect_uri；服务端不接收客户端指定的回调或令牌端点。
    const body = new URLSearchParams({
      client_id: settings.clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
    }).toString();
    let data: any;
    try {
      const response = await axios.post(APPLE_TOKEN_URL, body, {
        ...HTTP_OPTIONS,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      data = response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 400 && error.response?.data?.error === 'invalid_grant') {
        throw this.invalidCode();
      }
      throw this.providerUnavailable();
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw this.invalidIdentity();
    if (data.error === 'invalid_grant') throw this.invalidCode();
    if (data.error) throw this.providerUnavailable();
    if (!this.identifier(data.access_token, 4096) || !this.identifier(data.refresh_token, 4096) || data.token_type !== 'Bearer' ||
        !Number.isFinite(data.expires_in) || data.expires_in <= 0) throw this.invalidIdentity();
    const claims = await this.verifyAppleIdentityToken(data.id_token, settings.clientId, code, data.access_token, expectedNonce);
    // refresh_token 只交给内部加密持久化层；身份映射仍只依赖 appId + sub，不能用令牌或 email 合并。
    return {
      provider: 'apple', appId: settings.clientId, subject: claims.sub,
      appleRefreshToken: data.refresh_token,
      appleAuthorizedAtMs: (claims.auth_time ?? claims.iat) * 1000,
    };
  }

  async revokeAppleToken(appId: string, token: string): Promise<void> {
    const settings = this.appleConfig();
    if (appId !== settings.clientId || !this.identifier(token, 4096)) {
      throw new BadRequestException({ code: 'APPLE_REVOKE_INPUT_INVALID', message: 'Apple 撤销凭证不完整或应用不匹配' });
    }
    const body = new URLSearchParams({
      client_id: settings.clientId,
      client_secret: this.createAppleClientSecret(settings),
      token,
      token_type_hint: 'refresh_token',
    }).toString();
    try {
      const response = await axios.post(APPLE_REVOKE_URL, body, {
        ...HTTP_OPTIONS,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      // Apple 200 表示已撤销或此前已无效；400 invalid_client/invalid_request 都不能伪装成功。
      if (response.status !== 200 || response.data?.error) throw new Error('revocation rejected');
    } catch {
      throw new ServiceUnavailableException({ code: 'APPLE_REVOKE_UNCONFIRMED', message: 'Apple 授权撤销尚未确认，请稍后重试' });
    }
  }

  // 接收外层 JSON 的 payload 字符串。验签不消费 jti；去重、水位与账号变更须由调用方同事务持久化。
  async verifyAppleNotification(input: unknown): Promise<AppleNotification> {
    const clientId = this.appleClientId();
    let claims: Record<string, any>;
    try {
      claims = await this.verifyAppleSignedToken(input);
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw this.invalidNotification();
    }
    const now = Date.now();
    const nowSeconds = Math.floor(now / 1000);
    // 通知不是 ID token：官方通知示例不含顶层 sub/exp，不得因此拒绝真实通知。
    if (claims.iss !== APPLE_ISSUER || claims.aud !== clientId || !this.identifier(claims.jti, 191) ||
        !Number.isSafeInteger(claims.iat) || claims.iat <= 0 || claims.iat > nowSeconds ||
        (claims.exp !== undefined && (!Number.isSafeInteger(claims.exp) || claims.exp <= nowSeconds || claims.exp <= claims.iat)) ||
        (claims.nbf !== undefined && (!Number.isSafeInteger(claims.nbf) || claims.nbf < 0 || claims.nbf > nowSeconds))) {
      throw this.invalidNotification();
    }
    let event = claims.events;
    if (typeof event === 'string') {
      if (!event || event.length > 8192) throw this.invalidNotification();
      try { event = JSON.parse(event); } catch { throw this.invalidNotification(); }
    }
    if (!event || typeof event !== 'object' || Array.isArray(event) || !this.identifier(event.sub, 191)) throw this.invalidNotification();
    const type = event.type === 'account-delete' ? 'account-deleted' : event.type;
    if (!['consent-revoked', 'account-deleted', 'email-enabled', 'email-disabled'].includes(type)) throw this.invalidNotification();
    if (!Number.isSafeInteger(event.event_time) || event.event_time <= 0) throw this.invalidNotification();
    // 官方示例使用 Unix 秒；兼容毫秒格式并统一为毫秒。数值/签名合法后才进入业务层。
    const eventTimeMs = event.event_time < 100000000000 ? event.event_time * 1000 : event.event_time;
    const issuedAtMs = claims.iat * 1000;
    if (!Number.isSafeInteger(eventTimeMs) || eventTimeMs > now || eventTimeMs > issuedAtMs + 999 ||
        (claims.sub !== undefined && claims.sub !== event.sub)) throw this.invalidNotification();
    // 不设置未经官方约定的最大消息年龄：迟到事件必须交由持久化事件水位处理，不能静默丢弃。
    // 不返回 email/raw JWT，避免误把通知邮箱当作账号归并依据或记录不必要的个人数据。
    return { id: claims.jti, appId: clientId, subject: event.sub, type, issuedAtMs, eventTimeMs };
  }

  private setting(name: string): string {
    const value = this.config.get<unknown>(name);
    return typeof value === 'string' ? value.trim() : '';
  }

  private appleConfig(): AppleConfig {
    const clientId = this.appleClientId();
    const teamId = this.setting('APPLE_TEAM_ID');
    const keyId = this.setting('APPLE_KEY_ID');
    const pem = this.setting('APPLE_PRIVATE_KEY').replace(/\\n/g, '\n');
    if (!/^[A-Z0-9]{10}$/.test(teamId) || !/^[A-Z0-9]{10}$/.test(keyId) || !pem) throw this.notConfigured();
    try {
      const privateKey = createPrivateKey(pem);
      if (privateKey.asymmetricKeyType !== 'ec' || privateKey.asymmetricKeyDetails?.namedCurve !== 'prime256v1') throw new Error('invalid key');
      return { clientId, teamId, keyId, privateKey };
    } catch {
      throw this.notConfigured();
    }
  }

  private appleClientId(): string {
    const clientId = this.setting('APPLE_APP_CLIENT_ID');
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{1,190}$/.test(clientId)) throw this.notConfigured();
    return clientId;
  }

  private createAppleClientSecret(settings: AppleConfig): string {
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'ES256', kid: settings.keyId, typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ iss: settings.teamId, iat: now, exp: now + 300, aud: APPLE_ISSUER, sub: settings.clientId })).toString('base64url');
    const input = `${header}.${payload}`;
    try {
      const signature = sign('sha256', Buffer.from(input), { key: settings.privateKey, dsaEncoding: 'ieee-p1363' });
      return `${input}.${signature.toString('base64url')}`;
    } catch {
      throw this.notConfigured();
    }
  }

  private async reserveCode(provider: AppOAuthIdentity['provider'], appId: string, code: string): Promise<void> {
    // Apple/微信 code 均只使用一次。保留消费标记 10 分钟，网络失败也不释放；客户端需重新授权。
    // 不使用 withLock：它会在 finally 释放；也不允许 Redis 故障时回退到单进程内存。
    const hash = createHash('sha256').update(JSON.stringify([provider, appId, code])).digest('hex');
    let reserved: boolean;
    try {
      reserved = await this.redis.getLock(`auth:app-oauth:code:${hash}`, 600);
    } catch {
      throw new ServiceUnavailableException({ code: 'APP_OAUTH_REPLAY_STORE_UNAVAILABLE', message: '登录校验服务暂不可用，请稍后重新授权' });
    }
    if (!reserved) throw new UnauthorizedException({ code: 'APP_OAUTH_CODE_REPLAYED', message: '授权凭证已使用，请重新授权' });
  }

  private async verifyAppleIdentityToken(token: unknown, clientId: string, code: string, accessToken: string, expectedNonce?: string): Promise<Record<string, any>> {
    const claims = await this.verifyAppleSignedToken(token);
    const now = Math.floor(Date.now() / 1000);
    // 原生 App 只接受自己的单一 audience，不接受客户端自报的 bundle ID 或多 audience token。
    if (claims.iss !== APPLE_ISSUER || claims.aud !== clientId || !this.identifier(claims.sub, 191) ||
        !Number.isSafeInteger(claims.exp) || claims.exp <= now || !Number.isSafeInteger(claims.iat) ||
        claims.iat > now + 60 || claims.iat < 0 || claims.exp <= claims.iat ||
        (claims.nbf !== undefined && (!Number.isSafeInteger(claims.nbf) || claims.nbf > now)) ||
        (claims.auth_time !== undefined && (!Number.isSafeInteger(claims.auth_time) || claims.auth_time < 0 || claims.auth_time > claims.iat))) throw this.invalidIdentity();
    if (expectedNonce !== undefined && !this.constantEqual(claims.nonce, expectedNonce)) {
      throw new UnauthorizedException({ code: 'APP_OAUTH_NONCE_INVALID', message: '授权校验信息不一致，请重新授权' });
    }
    // token endpoint 直接将身份令牌绑定到服务器提交的 code；OIDC c_hash/at_hash 如存在，仍须核验。
    if (claims.c_hash !== undefined && !this.constantEqual(claims.c_hash, this.oidcHash(code))) throw this.invalidIdentity();
    if (claims.at_hash !== undefined && !this.constantEqual(claims.at_hash, this.oidcHash(accessToken))) throw this.invalidIdentity();
    return claims;
  }

  private async verifyAppleSignedToken(token: unknown): Promise<Record<string, any>> {
    if (typeof token !== 'string' || token.length > 16384) throw this.invalidIdentity();
    const parts = token.split('.');
    if (parts.length !== 3 || parts.some((part) => !part || !/^[a-zA-Z0-9_-]+$/.test(part) || Buffer.from(part, 'base64url').toString('base64url') !== part)) {
      throw this.invalidIdentity();
    }
    const header = this.jsonObject(parts[0]);
    const claims = this.jsonObject(parts[1]);
    // Apple OIDC discovery 当前仅公布 RS256。alg/kid 只用于挑选官方固定端点的签名公钥。
    if (header.alg !== 'RS256' || !this.identifier(header.kid, 128) || header.crit !== undefined || header.b64 !== undefined ||
        (header.typ !== undefined && header.typ !== 'JWT')) throw this.invalidIdentity();
    const publicKey = await this.applePublicKey(header.kid);
    try {
      if (!verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), publicKey, Buffer.from(parts[2], 'base64url'))) throw this.invalidIdentity();
    } catch {
      throw this.invalidIdentity();
    }
    return claims;
  }

  private async applePublicKey(kid: string): Promise<KeyObject> {
    const freshCache = this.appleKeysExpireAt > Date.now();
    if (!freshCache || !this.appleKeys.some((key) => key.kid === kid)) {
      if (freshCache && !this.appleKeysRequest && Date.now() < this.appleKeysNextRefreshAt) throw this.invalidIdentity();
      await this.refreshAppleKeys();
    }
    if (this.appleKeysExpireAt <= Date.now()) throw this.providerUnavailable();
    const matches = this.appleKeys.filter((key) => key.kid === kid && key.kty === 'RSA' && key.alg === 'RS256' && key.use === 'sig');
    if (matches.length !== 1) throw this.invalidIdentity();
    try {
      const key = createPublicKey({ key: matches[0], format: 'jwk' });
      const bits = key.asymmetricKeyDetails?.modulusLength || 0;
      if (key.asymmetricKeyType !== 'rsa' || bits < 2048 || bits > 8192) throw new Error('invalid key');
      return key;
    } catch {
      throw this.invalidIdentity();
    }
  }

  private async refreshAppleKeys(): Promise<void> {
    if (this.appleKeysRequest) return this.appleKeysRequest;
    if (Date.now() < this.appleKeysNextRefreshAt) throw this.providerUnavailable();
    this.appleKeysNextRefreshAt = Date.now() + 30000;
    const request = (async () => {
      try {
        const response = await axios.get(APPLE_KEYS_URL, HTTP_OPTIONS);
        const keys = response.data?.keys;
        if (!Array.isArray(keys) || keys.length === 0 || keys.length > 32 || keys.some((key) => !key || typeof key !== 'object' || Array.isArray(key))) {
          throw new Error('invalid key set');
        }
        this.appleKeys = keys;
        this.appleKeysExpireAt = Date.now() + 3600000;
      } catch {
        throw this.providerUnavailable();
      }
    })();
    this.appleKeysRequest = request;
    try { await request; } finally { this.appleKeysRequest = undefined; }
  }

  private oidcHash(value: string): string {
    return createHash('sha256').update(value, 'ascii').digest().subarray(0, 16).toString('base64url');
  }

  private constantEqual(actual: unknown, expected: string): boolean {
    if (typeof actual !== 'string') return false;
    const left = Buffer.from(actual);
    const right = Buffer.from(expected);
    return left.length === right.length && timingSafeEqual(left, right);
  }

  private jsonObject(segment: string): Record<string, any> {
    try {
      const result = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
      if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('invalid object');
      return result;
    } catch { throw this.invalidIdentity(); }
  }

  private identifier(value: unknown, maximum = 128): value is string {
    return typeof value === 'string' && value.length > 0 && value.length <= maximum && /^[\x21-\x7e]+$/.test(value);
  }

  private authorizationCode(value: unknown): string {
    if (!this.identifier(value, 4096)) throw new BadRequestException({ code: 'APP_OAUTH_CODE_REQUIRED', message: '请提交本次授权凭证' });
    return value;
  }

  private notConfigured() { return new ServiceUnavailableException({ code: 'APP_OAUTH_NOT_CONFIGURED', message: '此登录方式暂未配置，请使用其他方式登录' }); }
  private providerUnavailable() { return new ServiceUnavailableException({ code: 'APP_OAUTH_PROVIDER_UNAVAILABLE', message: '授权平台暂不可用，请稍后重新授权' }); }
  private invalidCode() { return new UnauthorizedException({ code: 'APP_OAUTH_CODE_INVALID', message: '授权凭证无效或已过期，请重新授权' }); }
  private invalidIdentity() { return new UnauthorizedException({ code: 'APP_OAUTH_IDENTITY_INVALID', message: '授权身份校验失败，请重新授权' }); }
  private invalidNotification() { return new UnauthorizedException({ code: 'APPLE_NOTIFICATION_INVALID', message: 'Apple 通知校验失败' }); }
}
