import { createSign, createVerify, generateKeyPairSync } from 'crypto';
import axios from 'axios';
import { PaymentService } from './payment.service';

jest.mock('axios');
const http = axios as jest.MockedFunction<typeof axios>;
const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const privateKey = keys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString();
const runtime = {
  mchid: 'merchant', certSerialNo: 'merchant-cert', merchantPrivateKey: privateKey,
  platformPublicKeyId: 'PUB_KEY_ID_TEST', platformPublicKey: publicKey,
  platformCertificates: {}, platformCert: '',
};
const provider = (overrides = {}) => ({
  out_refund_no: 'REF-1', refund_id: 'WX-REF-1', out_trade_no: 'PAY-1', transaction_id: 'WX-PAY-1',
  status: 'SUCCESS', success_time: '2026-10-10T12:28:02+08:00',
  amount: { refund: 200, total: 2690, currency: 'CNY' }, ...overrides,
});
const signed = (data: any, serial = runtime.platformPublicKeyId, timestamp = String(Math.floor(Date.now() / 1000))) => {
  const raw = JSON.stringify(data);
  const signer = createSign('RSA-SHA256'); signer.update(`${timestamp}\nnonce\n${raw}\n`);
  return { status: 200, data: raw, headers: { 'wechatpay-serial': serial, 'wechatpay-timestamp': timestamp,
    'wechatpay-nonce': 'nonce', 'wechatpay-signature': signer.sign(privateKey, 'base64') } } as any;
};
const fixture = () => {
  const payment: any = { id: 'payment-1', paymentNo: 'PAY-1', wxTransId: 'WX-PAY-1',
    bizType: 'errand_purchase', bizId: 'purchase-1', channel: 'wx_pay', amount: 26.9, refundedAmount: 0 };
  const refund: any = { id: 'refund-1', refundNo: 'REF-1', paymentId: payment.id, payment,
    status: 'processing', amount: 2, wxRefundId: 'WX-REF-1' };
  const refundUpdate = jest.fn(async ({ where, data }) => {
    const expected = where.status;
    if (typeof expected === 'string' ? refund.status !== expected : !expected.in.includes(refund.status)) return { count: 0 };
    Object.assign(refund, data); return { count: 1 };
  });
  const tx = {
    paymentRefund: { updateMany: refundUpdate, findUnique: jest.fn(async () => refund) },
    paymentOrder: { findUnique: jest.fn(async () => payment),
      update: jest.fn(async ({ data }) => Object.assign(payment, data)) },
    platformLedger: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    paymentRefund: { findUnique: jest.fn(async () => refund), findFirst: jest.fn(async () => refund),
      findMany: jest.fn().mockResolvedValue([{ id: refund.id, refundNo: refund.refundNo }]), updateMany: refundUpdate },
    $transaction: jest.fn(async (task: any) => task(tx)),
  };
  const redis = { withRenewingLock: jest.fn(async (_key: string, _ttl: number, task: () => Promise<any>) => task()) };
  const service = new PaymentService({} as any, prisma as any, redis as any, {} as any, {} as any);
  jest.spyOn(service as any, 'getWxPayConfig').mockResolvedValue(runtime);
  return { service, prisma, tx, redis, refund, payment };
};

describe('refund reconciliation', () => {
  beforeEach(() => jest.clearAllMocks());

  it('verifies the exact signed GET response and settles once using the provider success time', async () => {
    const { service, tx, refund, payment, redis } = fixture();
    http.mockImplementation(async (request: any) => {
      expect(request.method).toBe('GET');
      expect(request.url).toBe('https://api.mch.weixin.qq.com/v3/refund/domestic/refunds/REF-1');
      expect(request.data).toBeUndefined();
      expect(request.maxRedirects).toBe(0);
      expect(request.headers['Wechatpay-Serial']).toBe(runtime.platformPublicKeyId);
      const read = (key: string) => new RegExp(`${key}="([^"]+)"`).exec(request.headers.Authorization)![1];
      const verifier = createVerify('RSA-SHA256');
      verifier.update(`GET\n/v3/refund/domestic/refunds/REF-1\n${read('timestamp')}\n${read('nonce_str')}\n\n`);
      expect(verifier.verify(publicKey, read('signature'), 'base64')).toBe(true);
      return signed(provider());
    });
    expect(await service.reconcileProcessingRefund('REF-1')).toBe('success');
    expect(await service.reconcileProcessingRefund('REF-1')).toBe('skipped');
    expect(payment.refundedAmount).toBe(2);
    expect(refund.refundedAt).toEqual(new Date('2026-10-10T12:28:02+08:00'));
    expect(tx.platformLedger.create).toHaveBeenCalledTimes(1);
    expect(http).toHaveBeenCalledTimes(1);
    expect(redis.withRenewingLock).toHaveBeenCalledWith('wxpay_refund_notify_lock:REF-1', 60, expect.any(Function));
  });

  it('uses an existing trusted certificate when the configured public-key ID has no key', async () => {
    const { service } = fixture();
    (service as any).getWxPayConfig.mockResolvedValue({ ...runtime, platformPublicKey: '', platformCertificates: { CERT_1: publicKey } });
    http.mockResolvedValue(signed(provider(), 'CERT_1'));
    expect(await service.reconcileProcessingRefund('REF-1')).toBe('success');
    expect((http.mock.calls[0][0] as any).headers['Wechatpay-Serial']).toBe('CERT_1');
  });

  it('leaves a provider PROCESSING result unresolved without changing financial records', async () => {
    const { service, tx, refund } = fixture();
    http.mockResolvedValue(signed(provider({ status: 'PROCESSING', success_time: undefined })));
    expect(await service.reconcileProcessingRefund('REF-1')).toBe('processing');
    expect(refund.status).toBe('processing');
    expect(tx.platformLedger.create).not.toHaveBeenCalled();
  });

  it.each([
    ['refund number', { out_refund_no: 'another-refund' }],
    ['payment number', { out_trade_no: 'another-payment' }],
    ['transaction ID', { transaction_id: 'another-transaction' }],
    ['provider refund ID', { refund_id: 'another-provider-refund' }],
    ['refund amount', { amount: { refund: 201, total: 2690, currency: 'CNY' } }],
    ['payment amount', { amount: { refund: 200, total: 2691, currency: 'CNY' } }],
    ['currency', { amount: { refund: 200, total: 2690, currency: 'USD' } }],
    ['success time', { success_time: undefined }],
    ['unknown state', { status: 'UNKNOWN' }],
  ])('rejects mismatched %s even when WeChat signed it', async (_name, overrides) => {
    const { service, tx, refund } = fixture();
    http.mockResolvedValue(signed(provider(overrides)));
    await expect(service.reconcileProcessingRefund('REF-1')).rejects.toThrow();
    expect(refund.status).toBe('processing');
    expect(tx.paymentOrder.update).not.toHaveBeenCalled();
    expect(tx.platformLedger.create).not.toHaveBeenCalled();
  });

  it.each(['unsigned', 'tampered', 'unknown-key', 'invalid-time', 'stale-time'])('does not trust %s responses', async (mode) => {
    const { service, tx, refund } = fixture();
    const response = signed(provider(), mode === 'unknown-key' ? 'UNKNOWN' : runtime.platformPublicKeyId,
      mode === 'invalid-time' ? 'NaN' : mode === 'stale-time' ? '1' : undefined);
    if (mode === 'unsigned') response.headers = {};
    if (mode === 'tampered') response.data += ' ';
    http.mockResolvedValue(response);
    await expect(service.reconcileProcessingRefund('REF-1')).rejects.toThrow();
    expect(refund.status).toBe('processing');
    expect(tx.platformLedger.create).not.toHaveBeenCalled();
  });

  it.each(['timeout', 'not-found'])('keeps uncertain %s results processing for later queries', async mode => {
    const { service, tx, refund } = fixture();
    if (mode === 'timeout') http.mockRejectedValue(new Error('private signed request must not be logged'));
    else http.mockResolvedValue({ ...signed({ code: 'RESOURCE_NOT_EXISTS' }), status: 404 });
    const result = await service.reconcileProcessingRefunds();
    expect(result).toEqual({ checked: 1, success: 0, failed: 0, errors: 1 });
    expect(refund.status).toBe('processing');
    expect(tx.platformLedger.create).not.toHaveBeenCalled();
  });

  it.each(['ABNORMAL', 'CLOSED'])('records verified %s using the existing failure path', async status => {
    const { service, tx, refund } = fixture();
    http.mockResolvedValue(signed(provider({ status })));
    expect(await service.reconcileProcessingRefund('REF-1')).toBe('failed');
    expect(refund.status).toBe('failed');
    expect(refund.failReason).toBe(`微信退款${status}`);
    expect(tx.platformLedger.create).not.toHaveBeenCalled();
  });

  it.each(['pending', 'success', 'failed'])('never submits a new refund or queries a %s record', async status => {
    const { service, refund } = fixture(); refund.status = status;
    expect(await service.reconcileProcessingRefund('REF-1')).toBe('skipped');
    expect(http).not.toHaveBeenCalled();
  });

  it('does not compete with an in-flight callback', async () => {
    const { service, redis } = fixture(); redis.withRenewingLock.mockResolvedValue(undefined);
    expect(await service.reconcileProcessingRefund('REF-1')).toBe('locked');
    expect(http).not.toHaveBeenCalled();
  });

  it('continues later refunds after one error and rotates attempted rows', async () => {
    const { service, prisma } = fixture();
    prisma.paymentRefund.findMany.mockResolvedValue([{ id: 'r1', refundNo: 'REF-1' }, { id: 'r2', refundNo: 'REF-2' }]);
    jest.spyOn(service, 'reconcileProcessingRefund').mockRejectedValueOnce(new Error('retry')).mockResolvedValueOnce('success');
    expect(await service.reconcileProcessingRefunds()).toEqual({ checked: 2, success: 1, failed: 0, errors: 1 });
    expect(prisma.paymentRefund.updateMany).toHaveBeenCalledTimes(2);
    expect(prisma.paymentRefund.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: 'processing', payment: { channel: 'wx_pay' }, updatedAt: { lte: expect.any(Date) } },
      orderBy: { updatedAt: 'asc' }, take: 20,
    }));
  });
});
