import { UserService } from './user.service';
import { requestContext } from '../../common/request-context';

describe('account deletion audit', () => {
  let service: UserService;
  let prisma: any;
  let tx: any;
  let revoke: jest.Mock;
  beforeEach(() => {
    tx = {
      user: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      userProfile: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'u1', status: 'ACTIVE', deletedAt: null }) },
      wallet: { findUnique: jest.fn().mockResolvedValue({ balance: 0 }) },
      $transaction: jest.fn((task) => task(tx)),
    };
    for (const name of ['order', 'mallOrder', 'errandOrder', 'secondHandOrder', 'withdraw']) {
      prisma[name] = { findFirst: jest.fn().mockResolvedValue(null) };
    }
    revoke = jest.fn();
    service = Object.assign(Object.create(UserService.prototype), { prisma, userSessionRevocation: { revoke } });
  });

  it('saves the actor, trusted request metadata and deletion time in the same transaction', async () => {
    const result = await requestContext.run({ request: {
      ip: '::ffff:192.0.2.8', headers: { 'user-agent': 'test-client', 'x-forwarded-for': 'forged' },
    } as any }, () => service.cancelAccount('u1'));
    expect(tx.auditLog.create).toHaveBeenCalledWith({ data: {
      userId: 'u1', targetId: 'u1', action: 'DELETE', module: 'user',
      detail: { source: 'user_self_cancel', beforeStatus: 'ACTIVE', afterStatus: 'DELETED' },
      ip: '192.0.2.8', ua: 'test-client', createdAt: new Date(result.deletedAt),
    } });
    expect(tx.user.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'u1', status: 'ACTIVE', deletedAt: null },
    }));
    expect(revoke).toHaveBeenCalledWith('u1');
  });

  it('propagates an audit failure to roll back the transaction, without reporting success', async () => {
    tx.auditLog.create.mockRejectedValue(new Error('audit unavailable'));
    await expect(service.cancelAccount('u1')).rejects.toThrow('audit unavailable');
    expect(revoke).not.toHaveBeenCalled();
  });

  it('does not duplicate an audit when a concurrent request already changed the account', async () => {
    tx.user.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.cancelAccount('u1')).rejects.toThrow('账号状态已变化');
    expect(tx.auditLog.create).not.toHaveBeenCalled();
    expect(tx.userProfile.updateMany).not.toHaveBeenCalled();
  });

  it('keeps existing wallet blockers and rejects already deleted accounts', async () => {
    prisma.wallet.findUnique.mockResolvedValue({ balance: 10 });
    await expect(service.cancelAccount('u1')).rejects.toThrow('存在未完成的业务');
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', status: 'DELETED' });
    await expect(service.cancelAccount('u1')).rejects.toThrow('账号已注销');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
