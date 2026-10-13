import { createCipheriv, createSign, createVerify, generateKeyPairSync } from 'crypto';
import axios from 'axios';
import { WechatTransferError, WechatTransferGateway } from './wechat-transfer.gateway';

jest.mock('axios');
const http = axios as jest.MockedFunction<typeof axios>;
const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const privateKey = keys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString();
const cfg: any = { appid: 'wx-app', mchid: 'merchant', certSerialNo: 'merchant-cert', merchantPrivateKey: privateKey,
  apiV3Key: '12345678901234567890123456789012', platformPublicKeyId: 'PUB_KEY_ID_TEST',
  platformPublicKey: publicKey, platformCertificates: {}, platformCert: '' };
const headers = (body: string, timestamp = String(Math.floor(Date.now() / 1000))) => {
  const signer = createSign('RSA-SHA256'); signer.update(`${timestamp}\nnonce\n${body}\n`);
  return { 'wechatpay-serial': cfg.platformPublicKeyId, 'wechatpay-timestamp': timestamp,
    'wechatpay-nonce': 'nonce', 'wechatpay-signature': signer.sign(privateKey, 'base64') };
};
const gateway = () => new WechatTransferGateway({ getWechatTransferRuntime: async () => cfg } as any);

describe('merchant transfer signature boundary', () => {
  beforeEach(() => jest.clearAllMocks());
  it('signs the exact outgoing body and verifies the unmodified response bytes', async () => {
    const raw = '{ "state": "SUCCESS" }';
    http.mockImplementation(async (request: any) => {
      const header = request.headers.Authorization;
      const read = (key: string) => new RegExp(`${key}="([^"]+)"`).exec(header)![1];
      const verifier = createVerify('RSA-SHA256');
      verifier.update(`POST\n/v3/fund-app/mch-transfer/transfer-bills/transfer\n${read('timestamp')}\n${read('nonce_str')}\n${request.data}\n`);
      expect(verifier.verify(publicKey, read('signature'), 'base64')).toBe(true);
      expect(request.maxRedirects).toBe(0);
      expect(request.headers['Wechatpay-Serial']).toBe(cfg.platformPublicKeyId);
      return { status: 200, data: raw, headers: headers(raw) } as any;
    });
    expect(await gateway().request('POST', '/v3/fund-app/mch-transfer/transfer-bills/transfer', { transfer_amount: 800 }, cfg)).toEqual({ state: 'SUCCESS' });
  });
  it('uses the configured platform certificate identifier when public-key mode is absent', async () => {
    const raw = '{}';
    http.mockResolvedValue({ status: 200, data: raw, headers: headers(raw) } as any);
    await gateway().request('GET', '/v3/fund-app/mch-transfer/test', undefined,
      { ...cfg, platformPublicKey: '', platformPublicKeyId: '', platformCertificates: { [cfg.platformPublicKeyId]: publicKey } });
    expect((http.mock.calls[0][0] as any).headers?.['Wechatpay-Serial']).toBe(cfg.platformPublicKeyId);
  });
  it('fails before contacting WeChat when no platform key identifier is configured', async () => {
    await expect(gateway().request('POST', '/v3/fund-app/mch-transfer/test', {},
      { ...cfg, platformPublicKeyId: '' })).rejects.toThrow('公钥标识');
    expect(http).not.toHaveBeenCalled();
  });
  it('does not trust an unsigned success or NOT_FOUND', async () => {
    http.mockResolvedValue({ status: 200, data: '{"state":"SUCCESS"}', headers: {} } as any);
    await expect(gateway().request('GET', '/v3/fund-app/mch-transfer/test', undefined, cfg)).rejects.toThrow('签名');
    http.mockResolvedValue({ status: 404, data: '{"code":"NOT_FOUND"}', headers: {} } as any);
    await expect(gateway().request('GET', '/v3/fund-app/mch-transfer/test', undefined, cfg)).rejects.not.toBeInstanceOf(WechatTransferError);
  });
  it('exposes only a verified WeChat error code for retry decisions', async () => {
    const raw = '{"code":"NOT_FOUND"}'; http.mockResolvedValue({ status: 404, data: raw, headers: headers(raw) } as any);
    await expect(gateway().request('GET', '/v3/fund-app/mch-transfer/test', undefined, cfg)).rejects.toMatchObject({ code: 'NOT_FOUND', httpStatus: 404 });
  });
  it.each(['NaN', '0'])('rejects an invalid or stale timestamp %s', timestamp => {
    expect(() => gateway().verify('{}', headers('{}', timestamp), cfg)).toThrow('签名信息');
  });
  it('rejects changed response bytes and unknown verification keys', () => {
    expect(() => gateway().verify('{"state":"SUCCESS"}', headers('{}'), cfg)).toThrow('验签失败');
    expect(() => gateway().verify('{}', { ...headers('{}'), 'wechatpay-serial': 'wrong-key' }, cfg)).toThrow('不匹配');
  });
  it('verifies and decrypts authorization callbacks before exposing their content', async () => {
    const cipher = createCipheriv('aes-256-gcm', Buffer.from(cfg.apiV3Key), Buffer.from('123456789012'));
    cipher.setAAD(Buffer.from('auth'));
    const encrypted = Buffer.concat([cipher.update('{"out_authorization_no":"RWA-test"}'), cipher.final(), cipher.getAuthTag()]);
    const raw = JSON.stringify({ resource: { algorithm: 'AEAD_AES_256_GCM', nonce: '123456789012', associated_data: 'auth', ciphertext: encrypted.toString('base64') } });
    expect((await gateway().decodeNotification(Buffer.from(raw), headers(raw))).data).toEqual({ out_authorization_no: 'RWA-test' });
    await expect(gateway().decodeNotification(Buffer.from(raw), headers('{}'))).rejects.toThrow('验签失败');
  });
});
