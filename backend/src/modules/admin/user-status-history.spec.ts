import { buildUserStatusHistory, userStatusValue } from './user-status-history';

describe('user status history', () => {
  const user = { id: 'u1', status: 'DELETED', deletedAt: new Date('2026-09-09T01:50:05.785Z') };
  it('distinguishes deletion from disabling and preserves the real legacy deletion time', () => {
    expect(userStatusValue('DELETED')).toBe('deleted');
    expect(userStatusValue('INACTIVE')).toBe('disabled');
    expect(buildUserStatusHistory(user, [], [])).toEqual([expect.objectContaining({
      createdAt: user.deletedAt, afterStatus: 'deleted', source: 'unknown',
      reason: '历史未记录注销来源及原因', operator: '未记录', ip: null,
    })]);
  });
  it('shows explicit self deletion without inventing a personal reason or a duplicate legacy entry', () => {
    const result = buildUserStatusHistory(user, [{ id: 'audit1', module: 'user', action: 'DELETE',
      createdAt: user.deletedAt, ip: '192.0.2.8', ua: 'test-client',
      detail: { source: 'user_self_cancel', beforeStatus: 'ACTIVE', afterStatus: 'DELETED' },
    }], []);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ sourceLabel: '用户自助注销', operator: '用户本人', reason: '用户未提供注销理由' });
  });
  it('supports old ban reasons and ignores unrelated profile updates', () => {
    const result = buildUserStatusHistory({ status: 'BANNED' }, [
      { id: 'a', module: 'user', action: 'BAN', detail: { reason: '违规内容', operatorId: 'admin1' } },
      { id: 'b', module: 'user', action: 'UPDATE', detail: { nickname: 'name' } },
    ], [{ accountId: 'admin1', account: { username: '管理员甲' } }]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ afterStatus: 'banned', source: 'admin', reason: '违规内容', operator: '管理员甲' });
  });
});
