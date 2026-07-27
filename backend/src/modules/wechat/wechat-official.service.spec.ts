import * as crypto from 'crypto';
import { WechatOfficialService } from './wechat-official.service';

const createService = (token = 'official-token') => {
  const prisma = {
    config: { findUnique: jest.fn().mockResolvedValue({ value: { token } }) },
  };
  return new WechatOfficialService(
    prisma as any,
    {} as any,
    { get: jest.fn() } as any,
    {} as any,
  );
};

const signedQuery = (token = 'official-token') => {
  const timestamp = '1710000000';
  const nonce = 'nonce-1';
  const signature = crypto.createHash('sha1').update([token, timestamp, nonce].sort().join('')).digest('hex');
  return { timestamp, nonce, signature };
};

describe('WechatOfficialService callback signature', () => {
  it('rejects callbacks missing signature fields before handling the challenge or event', async () => {
    const service = createService();

    await expect(service.handleCallback('', { echostr: 'challenge' })).resolves.toBe('error');
    await expect(service.handleCallback('<xml><Event>subscribe</Event></xml>', {})).resolves.toBe('error');
  });

  it('rejects callbacks with an invalid signature', async () => {
    const service = createService();

    await expect(service.handleCallback('', { ...signedQuery(), signature: 'invalid' })).resolves.toBe('error');
  });

  it('rejects callbacks when the server has no configured token', async () => {
    const service = createService('');

    await expect(service.handleCallback('', { ...signedQuery(), echostr: 'challenge' })).resolves.toBe('error');
  });

  it('returns the WeChat challenge only after a valid signature', async () => {
    const service = createService();

    await expect(service.handleCallback('', { ...signedQuery(), echostr: 'challenge' })).resolves.toBe('challenge');
  });
});
