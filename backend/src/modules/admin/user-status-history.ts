export function userStatusValue(status: string): string {
  return ({ ACTIVE: 'active', INACTIVE: 'disabled', BANNED: 'banned', DELETED: 'deleted' } as Record<string, string>)[status] || 'unknown';
}

// 历史日志只有 BAN/UNBAN 或 detail.status；不把普通资料修改当成状态变更。
export function buildUserStatusHistory(user: any, audits: any[], operations: any[]) {
  const history = audits.filter((log) => log.module === 'user').flatMap((log) => {
    const detail = log.detail || {};
    const after = detail.afterStatus || detail.status || ({ BAN: 'BANNED', UNBAN: 'ACTIVE', DELETE: 'DELETED' } as Record<string, string>)[log.action];
    if (userStatusValue(after) === 'unknown') return [];
    const source = detail.source || (detail.operatorId ? 'admin' : 'unknown');
    const operation = operations.find((item) => item.accountId === detail.operatorId);
    return [{
      id: log.id, createdAt: log.createdAt,
      beforeStatus: userStatusValue(detail.beforeStatus), afterStatus: userStatusValue(after),
      source, sourceLabel: source === 'user_self_cancel' ? '用户自助注销' : source === 'admin' ? '管理员操作' : '历史来源未记录',
      operator: source === 'user_self_cancel' ? '用户本人'
        : operation?.account?.realName || operation?.account?.username || detail.operatorId || '未记录',
      reason: detail.reason || (source === 'user_self_cancel' ? '用户未提供注销理由' : '未记录'),
      ip: log.ip || null, ua: log.ua || null,
    }];
  });
  if (user.status === 'DELETED' && !history.some((item) => item.afterStatus === 'deleted')) {
    history.push({
      id: `legacy-deleted-${user.id}`, createdAt: user.deletedAt || null,
      beforeStatus: 'unknown', afterStatus: 'deleted', source: 'unknown',
      sourceLabel: '历史来源未记录', operator: '未记录',
      reason: '历史未记录注销来源及原因', ip: null, ua: null,
    });
  }
  return history.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
}
