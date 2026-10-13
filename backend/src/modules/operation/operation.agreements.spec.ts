import { agreementContentHash } from '../../common/agreement-consent';
import { OperationService } from './operation.service';

describe('operation agreement document and consent contract', () => {
  const current = {
    id: 'privacy-campus', type: 'PRIVACY_POLICY', regionId: 'campus-a', version: '2.0.0',
    title: '隐私政策', content: '<p>测试隐私正文</p>', scene: 'login', isRequired: true, isShow: true,
    publishedAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'),
  };
  let findFirst: jest.Mock;
  let upsert: jest.Mock;
  let transaction: jest.Mock;
  let service: OperationService;

  beforeEach(() => {
    findFirst = jest.fn().mockResolvedValue(current);
    upsert = jest.fn().mockImplementation(async (args: any) => ({ id: 'consent-1', ...args.create }));
    const tx = { richTextContent: { findFirst }, userAgreementConsent: { upsert } };
    transaction = jest.fn().mockImplementation(async (callback: (client: any) => Promise<unknown>) => callback(tx));
    service = new OperationService({ ...tx, $transaction: transaction } as any, {} as any, {} as any, {} as any, {} as any, {} as any);
  });

  it('retains response aliases and gives the client the exact published content hash', async () => {
    const response = await service.getAgreementDocument('privacy', { region_id: 'campus-a' });
    expect(response.code).toBe(200);
    expect(response.data).toEqual({ ...current, content_hash: agreementContentHash(current) });
    expect(response.agreement).toBe(response.data);
    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(findFirst.mock.calls[0][0].where.regionId).toBe('campus-a');
  });

  it('returns an unavailable placeholder without a fabricated version when nothing is published', async () => {
    findFirst.mockResolvedValue(null);
    const response = await service.getAgreementDocument('privacy', { regionId: 'campus-a' });
    expect(response.data).toMatchObject({ id: '', version: '', content_hash: '', isShow: false });
    await expect(service.acceptAgreement('user-1', { type: 'privacy', region_id: 'campus-a' })).rejects.toMatchObject({ status: 400 });
    expect(upsert).not.toHaveBeenCalled();
  });

  it('accepts the proof returned by GET and preserves the established response shape', async () => {
    const response = await service.getAgreementDocument('privacy', { region_id: 'campus-a' });
    const result = await service.acceptAgreement('user-1', {
      code: 'privacy', documentId: response.data.id, version: response.data.version,
      content_hash: response.data.content_hash, regionId: 'campus-a', source: 'uniappx',
    });
    expect(result).toMatchObject({ code: 200, success: true, data: { documentId: current.id, code: current.type, version: current.version, regionId: 'campus-a', source: 'uniappx' } });
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('rejects an old displayed document after a new publication is selected', async () => {
    const response = await service.getAgreementDocument('privacy', { region_id: 'campus-a' });
    findFirst.mockResolvedValue({ ...current, version: '3.0.0' });
    await expect(service.acceptAgreement('user-1', {
      type: 'privacy', document_id: response.data.id, version: response.data.version,
      content_hash: response.data.content_hash, region_id: 'campus-a',
    })).rejects.toMatchObject({ status: 409 });
    expect(upsert).not.toHaveBeenCalled();
  });
});
