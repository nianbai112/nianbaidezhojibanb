import { BadRequestException, Injectable } from '@nestjs/common';
import axios from 'axios';
import { createDecipheriv, createSign, createVerify, randomBytes, X509Certificate } from 'crypto';
import { PaymentService, WxPayRuntimeConfig } from '../payment/payment.service';

export class WechatTransferError extends Error {
  constructor(public readonly code: string, public readonly httpStatus: number) {
    super(`微信转账接口返回 ${code}`);
  }
}

@Injectable()
export class WechatTransferGateway {
  constructor(private readonly payment: PaymentService) {}

  async runtime() {
    const cfg = await this.payment.getWechatTransferRuntime();
    if (!cfg.appid || !cfg.mchid || !cfg.certSerialNo || !cfg.merchantPrivateKey ||
      Buffer.byteLength(cfg.apiV3Key) !== 32) throw new BadRequestException('微信支付商户参数尚未配置完整');
    if (!(cfg.platformPublicKey && cfg.platformPublicKeyId) && !cfg.platformCert &&
      !Object.keys(cfg.platformCertificates).length) throw new BadRequestException('微信支付验签材料尚未就绪');
    return cfg;
  }

  verify(raw: string, headers: any, cfg: WxPayRuntimeConfig) {
    const serial = String(headers['wechatpay-serial'] || '');
    const timestamp = String(headers['wechatpay-timestamp'] || '');
    const nonce = String(headers['wechatpay-nonce'] || '');
    const signature = String(headers['wechatpay-signature'] || '');
    if (!/^\d+$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300 ||
      !nonce || !serial || !signature) throw new BadRequestException('微信转账响应签名信息无效');
    let key = serial === cfg.platformPublicKeyId ? cfg.platformPublicKey : cfg.platformCertificates[serial];
    if (!key && cfg.platformCert) {
      const cert = new X509Certificate(cfg.platformCert);
      if (cert.serialNumber.toUpperCase() === serial.toUpperCase()) key = cfg.platformCert;
    }
    if (!key) throw new BadRequestException('微信转账响应验签材料不匹配');
    const verifier = createVerify('RSA-SHA256');
    verifier.update(`${timestamp}\n${nonce}\n${raw}\n`);
    if (!verifier.verify(key, signature, 'base64')) throw new BadRequestException('微信转账响应验签失败');
  }

  async request(method: 'GET' | 'POST', path: string, body: any, cfg: WxPayRuntimeConfig) {
    if (!path.startsWith('/v3/fund-app/mch-transfer/')) throw new Error('不支持的转账接口');
    // The authorization-transfer API requires the platform key identifier,
    // separately from the merchant certificate serial in Authorization.
    const platformSerial = cfg.platformPublicKey && cfg.platformPublicKeyId
      ? cfg.platformPublicKeyId
      : cfg.platformCert ? new X509Certificate(cfg.platformCert).serialNumber
      : Object.keys(cfg.platformCertificates || {})[0];
    if (!platformSerial) throw new BadRequestException('微信支付公钥标识或平台证书序列号未配置');
    const raw = body === undefined ? '' : JSON.stringify(body);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonce = randomBytes(16).toString('hex');
    const signer = createSign('RSA-SHA256');
    signer.update(`${method}\n${path}\n${timestamp}\n${nonce}\n${raw}\n`);
    const signature = signer.sign(cfg.merchantPrivateKey, 'base64');
    const response = await axios({
      method, url: `https://api.mch.weixin.qq.com${path}`, data: raw || undefined,
      timeout: 15000, maxRedirects: 0, responseType: 'text', transformResponse: [(data) => data],
      validateStatus: () => true,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'Wechatpay-Serial': platformSerial,
        Authorization: `WECHATPAY2-SHA256-RSA2048 mchid="${cfg.mchid}",nonce_str="${nonce}",signature="${signature}",timestamp="${timestamp}",serial_no="${cfg.certSerialNo}"` },
    });
    // Verify raw bytes before trusting successes OR errors such as NOT_FOUND.
    this.verify(String(response.data || ''), response.headers, cfg);
    const result = response.data ? JSON.parse(response.data) : {};
    if (response.status < 200 || response.status >= 300) {
      throw new WechatTransferError(String(result.code || 'UNKNOWN'), response.status);
    }
    return result;
  }

  async decodeNotification(raw: Buffer, headers: any) {
    const cfg = await this.runtime();
    this.verify(raw.toString('utf8'), headers, cfg);
    const body = JSON.parse(raw.toString('utf8'));
    const r = body.resource;
    if (r?.algorithm !== 'AEAD_AES_256_GCM' || !r.ciphertext || !r.nonce) {
      throw new BadRequestException('微信授权通知数据无效');
    }
    const cipher = Buffer.from(r.ciphertext, 'base64');
    if (cipher.length <= 16) throw new BadRequestException('微信授权通知密文无效');
    const decipher = createDecipheriv('aes-256-gcm', Buffer.from(cfg.apiV3Key), Buffer.from(r.nonce));
    decipher.setAuthTag(cipher.subarray(-16));
    decipher.setAAD(Buffer.from(r.associated_data || ''));
    const plain = Buffer.concat([decipher.update(cipher.subarray(0, -16)), decipher.final()]);
    return { cfg, data: JSON.parse(plain.toString('utf8')) };
  }
}
