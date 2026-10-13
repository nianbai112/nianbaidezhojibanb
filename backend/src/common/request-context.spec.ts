import express from 'express';
import request from 'supertest';
import { clientIp, currentRequestMetadata, redactAuditDetail, requestContext } from './request-context';

describe('audit request identity', () => {
  it('uses trusted Express proxy resolution and normalizes mapped IPv4', async () => {
    const app = express();
    app.set('trust proxy', 'loopback');
    app.get('/', (req, res) => res.json({ ip: clientIp(req) }));
    const response = await request(app).get('/').set('X-Forwarded-For', '198.51.100.10, 203.0.113.20');
    expect(response.body.ip).toBe('203.0.113.20');
    expect(clientIp({ ip: '::ffff:203.0.113.20' } as any)).toBe('203.0.113.20');
  });
  it('ignores forged forwarding headers when the peer is untrusted', () => {
    expect(clientIp({ ip: '203.0.113.21', headers: { 'x-forwarded-for': '1.2.3.4' } } as any)).toBe('203.0.113.21');
  });
  it('isolates simultaneous request metadata and marks background work explicitly', async () => {
    const results = await Promise.all(['203.0.113.1', '203.0.113.2'].map((ip) => requestContext.run({ request: { ip, headers: {} } as any }, async () => {
      await Promise.resolve(); return currentRequestMetadata();
    })));
    expect(results.map((item) => item.ip)).toEqual(['203.0.113.1', '203.0.113.2']);
    expect(currentRequestMetadata()).toMatchObject({ ip: undefined, ipSource: 'system' });
  });
  it('keeps business changes but hides credentials in nested before/after snapshots', () => {
    const result = redactAuditDetail({ before: { appSecret: 'old', enabled: false }, after: { appSecret: 'new', enabled: true } });
    expect(result.before.appSecret).toBe('已隐藏敏感信息');
    expect(result.after.enabled).toBe(true);
    expect(JSON.stringify(result)).not.toContain('old');
    expect(redactAuditDetail({ apiV3Key: 'pay-key', certPem: 'cert-body' })).toEqual({ apiV3Key: '已隐藏敏感信息', certPem: '已隐藏敏感信息' });
    expect(redactAuditDetail({ encodingAESKey: 'callback-key', callbackToken: 'callback-token' })).toEqual({ encodingAESKey: '已隐藏敏感信息', callbackToken: '已隐藏敏感信息' });
    expect(redactAuditDetail({ base64: 'binary-content' }).base64).toContain('文件内容不写入日志');
  });
});
