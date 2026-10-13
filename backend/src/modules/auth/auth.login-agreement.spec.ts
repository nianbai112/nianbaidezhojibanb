import { BadRequestException, ConflictException } from '@nestjs/common';
import axios from 'axios';
import { agreementContentHash } from '../../common/agreement-consent';
import { AuthService } from './auth.service';

jest.mock('axios', () => ({ __esModule: true, default: { get: jest.fn() } }));

// Keep the agreement helper real: mocks isolate login providers, token signing and
// persistence only, so these tests cover proof verification at all three entrypoints.
describe('AuthService login agreement proof boundary', () => {
  const documents = () => [
    { id: 'terms-current', type: 'TERMS_OF_SERVICE', regionId: 'region-a', title: '用户协议', version: '2.1', content: '<p>本版本用户协议正文</p>', isShow: true, publishedAt: new Date('2026-01-01'), scene: 'login' },
    { id: 'privacy-current', type: 'PRIVACY_POLICY', regionId: 'region-a', title: '隐私政策', version: '3.0', content: '<p>本版本隐私政策正文</p>', isShow: true, publishedAt: new Date('2026-01-01'), scene: 'login' },
  ];
  const makeProofs = () => documents().map((document) => ({
    type: document.type, document_id: document.id, version: document.version,
    content_hash: agreementContentHash(document as any), region_id: 'region-a',
  }));
  const fixture = () => {
    const currentDocuments = documents();
    const trace: string[] = [];
    const user = { id: 'user-a', uid: 1, publicUid: 10000001, openid: 'wx-account-a', phone: '13800138000', status: 'ACTIVE', nickname: '测试用户' };
    const richTextContent = {
      findFirst: jest.fn(async ({ where }: any) => currentDocuments.find((document) => document.type === where.type && document.regionId === where.regionId) || null),
    };
    const userAgreementConsent = {
      upsert: jest.fn(async ({ create }: any) => { trace.push(`consent:${create.code}`); return { id: `consent-${create.code}`, ...create }; }),
    };
    const tx = { richTextContent, userAgreementConsent };
    const prisma = {
      ...tx,
      $transaction: jest.fn(async (work: (connection: any) => Promise<any>) => work(tx)),
      user: {
        findUnique: jest.fn().mockResolvedValue(user),
        update: jest.fn().mockResolvedValue(user),
        create: jest.fn().mockResolvedValue(user),
      },
      studentVerify: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const redis = { set: jest.fn().mockResolvedValue('OK') };
    const service = new AuthService(prisma as any, {} as any, { get: jest.fn() } as any, redis as any, {} as any);
    jest.spyOn(service as any, 'getMiniappCredentials').mockResolvedValue({ appid: 'test-app', secret: 'test-secret' });
    jest.spyOn(service as any, 'buildLoginMeta').mockResolvedValue({});
    jest.spyOn(service as any, 'createUserProfileDefaults').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'ensurePublicUid').mockResolvedValue(user);
    jest.spyOn(service as any, 'bindInitialRegion').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'clearUserProfileCache').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'resolveWxPhoneNumber').mockResolvedValue(user.phone);
    jest.spyOn(service as any, 'assertPhoneBindingAvailable').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'verifyPhoneLoginCode').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'findPhoneLoginUser').mockResolvedValue(user);
    const generateTokens = jest.spyOn(service as any, 'generateTokens').mockImplementation(async () => {
      trace.push('tokens');
      return { accessToken: 'test-access-token', refreshToken: 'test-refresh-token', expiresIn: 7200 };
    });
    (axios.get as jest.Mock).mockResolvedValue({ data: { openid: user.openid, session_key: 'test-session-key' } });
    return { service, prisma, currentDocuments, generateTokens, trace };
  };
  const entries = [
    { method: 'wxMiniLogin', source: 'miniapp-login', dto: { code: 'wx-code', region_id: 'region-a' } },
    { method: 'phoneOneTapLogin', source: 'phone-one-tap-login', dto: { loginCode: 'wx-code', phoneCode: 'phone-code', region_id: 'region-a' } },
    { method: 'phoneLogin', source: 'phone-login', dto: { phone: '13800138000', code: '123456', region_id: 'region-a' } },
  ] as const;
  const login = (service: AuthService, entry: typeof entries[number], proofs: unknown = undefined) =>
    (service[entry.method] as any).call(service, { ...entry.dto, ...(proofs === undefined ? {} : { agreement_consents: proofs }) });

  describe.each(entries)('$method', (entry) => {
    it('does not invent a consent for legacy or silent login with undefined proofs', async () => {
      const f = fixture();
      await expect(login(f.service, entry)).resolves.toMatchObject({ token: 'test-access-token' });
      expect(f.prisma.$transaction).not.toHaveBeenCalled();
      expect(f.prisma.richTextContent.findFirst).not.toHaveBeenCalled();
      expect(f.prisma.userAgreementConsent.upsert).not.toHaveBeenCalled();
      expect(f.generateTokens).toHaveBeenCalledTimes(1);
    });

    it.each([
      { label: 'explicit null', proofs: () => null },
      { label: 'empty array', proofs: () => [] },
      { label: 'non-array', proofs: () => ({ accepted: true }) },
      { label: 'one missing type', proofs: () => [makeProofs()[0]] },
      { label: 'duplicate types', proofs: () => [makeProofs()[0], makeProofs()[0]] },
      { label: 'wrong agreement type', proofs: () => [makeProofs()[0], { ...makeProofs()[1], type: 'CONTENT_RULES' }] },
      { label: 'missing document ID', proofs: () => [{ ...makeProofs()[0], document_id: '' }, makeProofs()[1]] },
      { label: 'missing version', proofs: () => [makeProofs()[0], { ...makeProofs()[1], version: '' }] },
      { label: 'missing body hash', proofs: () => [{ ...makeProofs()[0], content_hash: undefined }, makeProofs()[1]] },
      { label: 'invalid body hash', proofs: () => [{ ...makeProofs()[0], content_hash: 'client-says-yes' }, makeProofs()[1]] },
    ])('rejects $label before signing any token', async ({ proofs }) => {
      const f = fixture();
      await expect(login(f.service, entry, proofs())).rejects.toBeInstanceOf(BadRequestException);
      expect(f.generateTokens).not.toHaveBeenCalled();
      expect(f.prisma.userAgreementConsent.upsert).not.toHaveBeenCalled();
    });

    it('uses the real helper to persist both exact documents before issuing tokens', async () => {
      const f = fixture();
      await expect(login(f.service, entry, makeProofs())).resolves.toMatchObject({ token: 'test-access-token' });
      expect(f.trace).toEqual(['consent:TERMS_OF_SERVICE', 'consent:PRIVACY_POLICY', 'tokens']);
      expect(f.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ isolationLevel: 'Serializable' }));
      for (const document of documents()) {
        expect(f.prisma.userAgreementConsent.upsert).toHaveBeenCalledWith(expect.objectContaining({
          where: { userId_code_version_regionId: { userId: 'user-a', code: document.type, version: document.version, regionId: 'region-a' } },
          create: expect.objectContaining({ documentId: document.id, scene: 'login', source: entry.source, acceptedAt: expect.any(Date) }),
        }));
      }
    });

    it('rejects a stale second document before writing either consent and before signing', async () => {
      const f = fixture();
      const proofs = makeProofs();
      proofs[1].version = 'obsolete-version';
      await expect(login(f.service, entry, proofs)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'AGREEMENT_UPDATED' }),
      });
      expect(f.prisma.userAgreementConsent.upsert).not.toHaveBeenCalled();
      expect(f.generateTokens).not.toHaveBeenCalled();
    });

    it('detects edited text under the same document ID and version using the hash', async () => {
      const f = fixture();
      const proofs = makeProofs();
      f.currentDocuments[1].content = '<p>发布后被修改的隐私正文</p>';
      await expect(login(f.service, entry, proofs)).rejects.toBeInstanceOf(ConflictException);
      expect(f.prisma.userAgreementConsent.upsert).not.toHaveBeenCalled();
      expect(f.generateTokens).not.toHaveBeenCalled();
    });

    it('does not swallow agreement storage read errors and never issues a token', async () => {
      const f = fixture();
      const storageError = new Error('agreement read unavailable');
      f.prisma.richTextContent.findFirst.mockRejectedValueOnce(storageError);
      await expect(login(f.service, entry, makeProofs())).rejects.toBe(storageError);
      expect(f.generateTokens).not.toHaveBeenCalled();
      expect(f.prisma.userAgreementConsent.upsert).not.toHaveBeenCalled();
    });

    it('does not swallow consent transaction write errors and never issues a token', async () => {
      const f = fixture();
      const storageError = new Error('consent write unavailable');
      f.prisma.userAgreementConsent.upsert.mockRejectedValueOnce(storageError);
      await expect(login(f.service, entry, makeProofs())).rejects.toBe(storageError);
      expect(f.generateTokens).not.toHaveBeenCalled();
    });
  });
});
