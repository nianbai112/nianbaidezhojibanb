import { ConflictException } from '@nestjs/common';
import axios from 'axios';
import { bindOfficialSubscriber } from './wechat-official-identity';
import { loginIdentityKey } from '../auth/app-identity';
import { WechatOfficialService } from './wechat-official.service';
jest.mock('axios');
const input = { officialOpenid: 'official-openid', eventKey: '', unionScope: 'shared-platform', unionId: 'union-A' };
const fixture = () => {
  const user = { id: 'user-1', status: 'ACTIVE', deletedAt: null, unionid: 'union-A' };
  const tx: any = {
    user: { findUnique: jest.fn().mockResolvedValue(user), findMany: jest.fn().mockResolvedValue([user]), create: jest.fn() },
    userAuthIdentity: { findUnique: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue({}) },
    wechatOfficialBinding: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn().mockResolvedValue({}) },
  };
  const db = { $transaction: jest.fn(async fn => fn(tx)) };
  const configValues: Record<string, string> = { WX_OPEN_PLATFORM_ACCOUNT_ID: 'shared-platform', WX_OFFICIAL_OPEN_PLATFORM_ACCOUNT_ID: 'shared-platform' };
  const tokens = { getOfficialAccessToken: jest.fn().mockResolvedValue('mock-opaque-token') };
  const service = new WechatOfficialService(db as any, { get: jest.fn().mockResolvedValue('user-1') } as any, { get: jest.fn((k: string) => configValues[k]) } as any, tokens as any);
  return { db, tx, user, configValues, tokens, service };
};
describe('official-account unique union ownership', () => {
  beforeEach(() => jest.clearAllMocks());
  it('reserves the same scoped union owner and binds the exact unique legacy account', async () => {
    const f = fixture(); await expect(bindOfficialSubscriber(f.db, input)).resolves.toBe(true);
    expect(f.tx.userAuthIdentity.create).toHaveBeenCalledWith({ data: expect.objectContaining({ identityKey: loginIdentityKey('wechat-union', 'shared-platform', 'union-A'), userId: 'user-1' }) });
    expect(f.db.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
    expect(f.tx.wechatOfficialBinding.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'user-1' } }));
    expect(f.tx.user.create).not.toHaveBeenCalled();
  });
  it('can resolve an App-only scoped identity without creating an account', async () => {
    const f = fixture(); f.tx.user.findMany.mockResolvedValue([]);
    f.tx.userAuthIdentity.findUnique.mockResolvedValue({ provider: 'wechat-union', appId: input.unionScope, subject: input.unionId, user: f.user });
    await expect(bindOfficialSubscriber(f.db, input)).resolves.toBe(true);
    expect(f.tx.userAuthIdentity.create).not.toHaveBeenCalled();
  });
  it.each(['duplicates', 'case-mismatch', 'identity-owner-conflict', 'cross-scope-owner', 'openid-owner-conflict'])('rejects %s without binding', async kind => {
    const f = fixture();
    if (kind === 'duplicates') f.tx.user.findMany.mockResolvedValue([f.user, { ...f.user, id: 'user-2' }]);
    if (kind === 'case-mismatch') f.tx.user.findMany.mockResolvedValue([{ ...f.user, unionid: 'union-a' }]);
    if (kind === 'identity-owner-conflict') f.tx.userAuthIdentity.findUnique.mockResolvedValue({ provider: 'wechat-union', appId: input.unionScope, subject: input.unionId, user: { ...f.user, id: 'user-2' } });
    if (kind === 'cross-scope-owner') f.tx.userAuthIdentity.findMany.mockResolvedValue([{ identityKey: 'other-scope' }]);
    if (kind === 'openid-owner-conflict') f.tx.wechatOfficialBinding.findUnique.mockResolvedValue({ userId: 'user-2' });
    await expect(bindOfficialSubscriber(f.db, input)).rejects.toBeInstanceOf(ConflictException);
    expect(f.tx.wechatOfficialBinding.upsert).not.toHaveBeenCalled();
  });
  it.each(['BANNED', 'INACTIVE', 'DELETED'])('refuses a %s scene target and automatic account', async status => {
    const f = fixture(); f.user.status = status;
    await expect(bindOfficialSubscriber(f.db, input)).resolves.toBe(false);
    await expect(bindOfficialSubscriber(f.db, { ...input, userId: 'user-1' })).resolves.toBe(false);
    expect(f.tx.wechatOfficialBinding.upsert).not.toHaveBeenCalled();
    expect(f.tx.userAuthIdentity.create).not.toHaveBeenCalled();
  });
  it('does not create an account for an unmatched official union', async () => {
    const f = fixture(); f.tx.user.findMany.mockResolvedValue([]);
    await expect(bindOfficialSubscriber(f.db, input)).resolves.toBe(false);
    expect(f.tx.user.create).not.toHaveBeenCalled();
    expect(f.tx.wechatOfficialBinding.upsert).not.toHaveBeenCalled();
  });
  it('re-evaluates ownership after a serialization conflict', async () => {
    const f = fixture(); f.db.$transaction.mockRejectedValueOnce({ code: 'P2034' });
    await expect(bindOfficialSubscriber(f.db, input)).resolves.toBe(true);
    expect(f.db.$transaction).toHaveBeenCalledTimes(2);
  });
  it.each([undefined, '', 'different-scope'])('skips automatic union lookup without matching explicitly configured official scope %#', async scope => {
    const f = fixture(); f.configValues.WX_OFFICIAL_OPEN_PLATFORM_ACCOUNT_ID = scope as any;
    await (f.service as any).handleSubscribe('official-openid', '');
    expect(f.tokens.getOfficialAccessToken).not.toHaveBeenCalled();
    expect(f.db.$transaction).not.toHaveBeenCalled();
  });
  it.each([{ openid: 'other-openid', subscribe: 1, unionid: 'union-A' }, { openid: 'official-openid', subscribe: 0, unionid: 'union-A' }, { errcode: 40001 }, { openid: 'official-openid', subscribe: 1, unionid: '' }])('does not bind an invalid provider result %#', async data => {
    const f = fixture(); (axios.get as jest.Mock).mockResolvedValue({ data });
    await (f.service as any).handleSubscribe('official-openid', '');
    expect(f.tx.wechatOfficialBinding.upsert).not.toHaveBeenCalled();
  });
  it('accepts only server-fetched union evidence in the configured official scope', async () => {
    const f = fixture(); (axios.get as jest.Mock).mockResolvedValue({ data: { openid: 'official-openid', subscribe: 1, unionid: 'union-A' } });
    await (f.service as any).handleSubscribe('official-openid', '');
    expect(f.tx.wechatOfficialBinding.upsert).toHaveBeenCalled();
  });
  it('continues explicit QR binding without enabling cross-channel automatic matching', async () => {
    const f = fixture(); f.configValues.WX_OFFICIAL_OPEN_PLATFORM_ACCOUNT_ID = '';
    await (f.service as any).handleScan('official-openid', 'bind_user-1_1');
    expect(f.tx.wechatOfficialBinding.upsert).toHaveBeenCalled();
    expect(f.tokens.getOfficialAccessToken).not.toHaveBeenCalled();
  });
});
