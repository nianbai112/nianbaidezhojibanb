const SIGNAL_LABELS: Record<string, string> = {
  same_payout_account: '发布人与接单人使用相同收款账号',
  same_user_id: '发布人与接单人为同一用户',
  same_phone: '发布人与接单人绑定相同手机号',
  same_id_card: '发布人与接单人关联相同身份证',
  same_student_identity: '发布人与接单人关联相同学籍',
  same_unionid: '发布人与接单人关联同一微信身份',
  same_recent_device: '近期使用相同设备信息',
  same_recent_ip: '近期使用相同网络地址',
  risk_check_unavailable: '风控资料暂时无法核查',
};

/** Translate existing stored records for operators without rewriting audit history. */
export function errandRiskDescription(description?: string | null) {
  return String(description || '').replace(/\b[a-z]+(?:_[a-z]+)+\b/g, code => SIGNAL_LABELS[code] || code);
}
