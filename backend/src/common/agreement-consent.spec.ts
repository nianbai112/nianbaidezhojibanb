import { HttpException } from '@nestjs/common';
import { Prisma, PrismaClient, RichTextContent } from '@prisma/client';
import {
  agreementContentHash,
  AgreementProof,
  findPublishedAgreement,
  recordAgreementConsents,
  validateAgreementProof,
} from './agreement-consent';

function document(overrides: Partial<RichTextContent> = {}): RichTextContent {
  return {
    id: 'terms-campus', type: 'TERMS_OF_SERVICE', regionId: 'campus-a', title: '用户协议',
    version: '2.1.0', content: '<p>已发布的协议正文</p>', cover: null, scene: 'login', isRequired: true,
    isShow: true, publishedAt: new Date('2026-01-01'), sortOrder: 0, viewCount: 0,
    createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'), ...overrides,
  };
}

function proof(doc: RichTextContent): AgreementProof {
  return { type: doc.type, document_id: doc.id, version: doc.version, content_hash: agreementContentHash(doc) };
}

function database() {
  const findFirst = jest.fn();
  const upsert = jest.fn().mockImplementation(async (args: any) => ({ id: 'consent-1', ...args.create }));
  const tx = { richTextContent: { findFirst }, userAgreementConsent: { upsert } };
  const transaction = jest.fn().mockImplementation(async (callback: (client: any) => Promise<unknown>) => callback(tx));
  return { findFirst, upsert, tx, transaction, prisma: { ...tx, $transaction: transaction } as unknown as PrismaClient };
}

async function expectError(pending: Promise<unknown>, status: number, code: string) {
  try {
    await pending;
    throw new Error('Expected agreement rejection');
  } catch (error) {
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(status);
    expect((error as HttpException).getResponse()).toMatchObject({ code });
  }
}

describe('agreement selection and explicit proof', () => {
  it('chooses the campus first without relying on PostgreSQL NULL ordering', async () => {
    const db = database();
    const regional = document();
    db.findFirst.mockResolvedValue(regional);
    const now = new Date('2026-02-01');
    expect(await findPublishedAgreement(db.prisma, 'service', 'campus-a', now)).toBe(regional);
    expect(db.findFirst).toHaveBeenCalledTimes(1);
    expect(db.findFirst).toHaveBeenCalledWith({
      where: { type: 'TERMS_OF_SERVICE', regionId: 'campus-a', isShow: true, OR: [{ publishedAt: null }, { publishedAt: { lte: now } }] },
      orderBy: [{ publishedAt: { sort: 'desc', nulls: 'last' } }, { updatedAt: 'desc' }, { id: 'asc' }],
    });
  });

  it('falls back to the global document only after the campus has no effective publication', async () => {
    const db = database();
    const global = document({ id: 'terms-global', regionId: null, publishedAt: null });
    db.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(global);
    expect(await findPublishedAgreement(db.prisma, 'TERMS_OF_SERVICE', 'campus-a')).toBe(global);
    expect(db.findFirst.mock.calls.map(([query]) => query.where.regionId)).toEqual(['campus-a', null]);
  });

  it.each(['', 'global', '__global__', null])('only reads the global scope for %s', async region => {
    const db = database();
    db.findFirst.mockResolvedValue(null);
    expect(await findPublishedAgreement(db.prisma, 'privacy', region)).toBeNull();
    expect(db.findFirst).toHaveBeenCalledTimes(1);
    expect(db.findFirst.mock.calls[0][0].where).toMatchObject({ type: 'PRIVACY_POLICY', regionId: null });
  });

  it.each([
    { type: 'TERMS_OF_SERVICE' },
    { type: 'TERMS_OF_SERVICE', document_id: 'terms-campus' },
    { type: 'TERMS_OF_SERVICE', version: '2.1.0' },
    { type: 'TERMS_OF_SERVICE', document_id: 'terms-campus', version: '   ' },
  ])('rejects an old incomplete proof without guessing a version: %j', async incomplete => {
    const db = database();
    await expectError(recordAgreementConsents(db.prisma, 'user-1', [incomplete]), 400, 'AGREEMENT_PROOF_REQUIRED');
    expect(db.transaction).not.toHaveBeenCalled();
    expect(db.upsert).not.toHaveBeenCalled();
  });

  it.each([
    { document_id: 'someone-elses-document' },
    { version: '1.0.0' },
    { content_hash: '0'.repeat(64) },
  ])('rejects a forged or stale proof before recording: %j', async changes => {
    const db = database();
    const current = document();
    db.findFirst.mockResolvedValue(current);
    await expectError(recordAgreementConsents(db.prisma, 'user-1', [{ ...proof(current), ...changes }], { regionId: 'campus-a' }), 409, 'AGREEMENT_UPDATED');
    expect(db.upsert).not.toHaveBeenCalled();
  });

  it('rejects the global document when a campus document overrides it', async () => {
    const db = database();
    db.findFirst.mockResolvedValue(document());
    await expectError(recordAgreementConsents(db.prisma, 'user-1', [proof(document({ id: 'terms-global', regionId: null }))], { regionId: 'campus-a' }), 409, 'AGREEMENT_UPDATED');
    expect(db.upsert).not.toHaveBeenCalled();
  });

  it('rejects a proof for a different request scope before starting the transaction', async () => {
    const db = database();
    await expectError(recordAgreementConsents(db.prisma, 'user-1', [{ ...proof(document()), region_id: 'campus-b' }], { regionId: 'campus-a' }), 400, 'AGREEMENT_SCOPE_MISMATCH');
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it.each([null, document({ content: ' <p>&nbsp;</p> ' }), document({ content: '<script>alert(1)</script>' })])(
    'rejects missing publications and documents without readable body', async current => {
      const db = database();
      db.findFirst.mockResolvedValue(current);
      await expectError(recordAgreementConsents(db.prisma, 'user-1', [proof(document())], { regionId: 'campus-a' }), 409, 'AGREEMENT_UNAVAILABLE');
      expect(db.upsert).not.toHaveBeenCalled();
    },
  );

  it('requires a hash for the login contract but accepts an old complete ID/version proof when explicitly allowed', async () => {
    const db = database();
    const current = document();
    db.findFirst.mockResolvedValue(current);
    const oldProof = { code: 'service', documentId: current.id, version: current.version };
    await expectError(recordAgreementConsents(db.prisma, 'user-1', [oldProof], { regionId: 'campus-a', requireContentHash: true }), 400, 'AGREEMENT_PROOF_REQUIRED');
    expect(db.transaction).not.toHaveBeenCalled();
    await recordAgreementConsents(db.prisma, 'user-1', [oldProof], { regionId: 'campus-a' });
    expect(db.upsert).toHaveBeenCalledTimes(1);
  });

  it('detects body and title changes even if an operator forgot to increment the version', async () => {
    const db = database();
    const original = document();
    db.findFirst.mockResolvedValue(document({ content: '<p>后来修改的正文</p>' }));
    await expectError(validateAgreementProof(db.prisma, proof(original), 'campus-a'), 409, 'AGREEMENT_UPDATED');
    db.findFirst.mockResolvedValue(document({ title: '后来修改的标题' }));
    await expectError(validateAgreementProof(db.prisma, proof(original), 'campus-a'), 409, 'AGREEMENT_UPDATED');
  });

  it('validates both login documents before making any consent write', async () => {
    const db = database();
    const terms = document();
    const privacy = document({ id: 'privacy-campus', type: 'PRIVACY_POLICY' });
    db.findFirst.mockResolvedValueOnce(terms).mockResolvedValueOnce({ ...privacy, version: '3.0.0' });
    await expectError(recordAgreementConsents(db.prisma, 'user-1', [proof(terms), proof(privacy)], { regionId: 'campus-a', requireContentHash: true }), 409, 'AGREEMENT_UPDATED');
    expect(db.upsert).not.toHaveBeenCalled();
  });

  it('records the selected campus even when its current document is a global fallback', async () => {
    const db = database();
    const global = document({ id: 'terms-global', regionId: null });
    db.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(global);
    const results = await recordAgreementConsents(db.prisma, 'user-1', [proof(global)], { regionId: 'campus-a', source: 'uniappx', scene: 'login' });
    expect(results[0]).toMatchObject({ userId: 'user-1', documentId: global.id, code: global.type, version: global.version, regionId: 'campus-a', source: 'uniappx', scene: 'login' });
    expect(db.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 10000 });
    expect(db.upsert.mock.calls[0][0].where.userId_code_version_regionId).toEqual({ userId: 'user-1', code: global.type, version: global.version, regionId: 'campus-a' });
  });

  it('rejects duplicate types including aliases', async () => {
    const db = database();
    const p = proof(document());
    await expectError(recordAgreementConsents(db.prisma, 'user-1', [p, { ...p, type: 'service' }]), 400, 'AGREEMENT_PROOF_DUPLICATE');
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('revalidates the current version after a serializable write conflict', async () => {
    const db = database();
    const original = document();
    db.findFirst.mockResolvedValueOnce(original).mockResolvedValueOnce(document({ version: '3.0.0' }));
    db.upsert.mockRejectedValueOnce({ code: 'P2034' });
    await expectError(recordAgreementConsents(db.prisma, 'user-1', [proof(original)], { regionId: 'campus-a' }), 409, 'AGREEMENT_UPDATED');
    expect(db.transaction).toHaveBeenCalledTimes(2);
    expect(db.findFirst).toHaveBeenCalledTimes(2);
    expect(db.upsert).toHaveBeenCalledTimes(1);
  });

  it('succeeds when a retried transaction validates the same document', async () => {
    const db = database();
    const current = document();
    db.findFirst.mockResolvedValue(current);
    db.upsert.mockRejectedValueOnce({ code: 'P2034' });
    expect(await recordAgreementConsents(db.prisma, 'user-1', [proof(current)], { regionId: 'campus-a' })).toHaveLength(1);
    expect(db.transaction).toHaveBeenCalledTimes(2);
    expect(db.findFirst).toHaveBeenCalledTimes(2);
  });

  it('bounds retries and exposes a reloadable conflict after three attempts', async () => {
    const db = database();
    db.findFirst.mockResolvedValue(document());
    db.upsert.mockRejectedValue({ code: 'P2034' });
    await expectError(recordAgreementConsents(db.prisma, 'user-1', [proof(document())], { regionId: 'campus-a' }), 409, 'AGREEMENT_CONCURRENT_UPDATE');
    expect(db.transaction).toHaveBeenCalledTimes(3);
  });

  it('does not retry unrelated database errors or acknowledge them as success', async () => {
    const db = database();
    const error = { code: 'P2003', message: 'foreign key failed' };
    db.findFirst.mockResolvedValue(document());
    db.upsert.mockRejectedValue(error);
    await expect(recordAgreementConsents(db.prisma, 'user-1', [proof(document())], { regionId: 'campus-a' })).rejects.toBe(error);
    expect(db.transaction).toHaveBeenCalledTimes(1);
  });
});
