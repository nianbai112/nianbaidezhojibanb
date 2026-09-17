export const WECHAT_TEMPLATE_NAMES: Record<string, string> = {
  new_errand_order: '跑腿骑手新订单通知',
  errand_accepted: '跑腿订单接单通知', errand_picked: '跑腿订单取货通知',
  errand_delivered: '跑腿订单完成通知', errand_abnormal: '跑腿订单异常通知',
  takeaway_order_status: '外卖订单状态通知', takeaway_merchant_order: '商家新订单通知',
  takeaway_rider_order: '骑手新任务通知', post_audit_result: '帖子审核结果通知',
  post_comment: '帖子收到评论通知', comment_reply: '评论收到回复通知',
  community_at: '社区提及通知', community_reply: '社区回复通知', community_like: '社区点赞通知',
  community_circle_new: '圈子新内容通知', refund_status: '退款进度通知',
  audit_result: '审核结果通知', funds_status: '资金变动通知', activity_reminder: '活动提醒',
};

export function wechatFailure(code?: string | null, raw?: string | null) {
  const error = String(raw || '');
  const inferred = code || (/未授权|授权已使用/.test(error) ? 'consent_unavailable'
    : /模板未配置|模板.*停用/.test(error) ? 'template_missing'
    : /无 openid/.test(error) ? 'openid_missing' : /字段/.test(error) ? 'mapping_empty' : 'unknown');
  const map: Record<string, [string, string]> = {
    '40165': ['小程序跳转页面无效，微信拒绝发送', '核对小程序应用编号、公众号关联关系，以及该路径是否存在于已发布的正式版；修正后再重试。'],
    '41030': ['小程序页面路径不正确', '核对完整页面路径和参数，确认该页面已发布。'],
    '40013': ['微信应用编号无效', '核对当前渠道的应用编号，公众号和小程序编号不能混用。'],
    '40037': ['微信模板编号无效', '在对应公众号或小程序的微信后台核对模板编号及所属账号。'],
    '40003': ['接收用户的微信标识无效', '核对接收用户标识是否属于当前公众号或小程序。'],
    '43004': ['用户未关注公众号', '请用户关注并绑定公众号后再接收服务通知。'],
    '43101': ['用户未授权接收本次订阅消息', '请用户在小程序业务页面重新同意订阅。'],
    '47003': ['通知内容不符合微信模板字段规则', '检查必填内容、字段类型、字数和时间格式，修正后重新触发通知。'],
    '40001': ['微信访问凭证无效', '检查应用密钥和访问凭证缓存后重试。'],
    '40014': ['微信访问凭证无效', '检查应用配置并刷新访问凭证。'],
    '42001': ['微信访问凭证已过期', '刷新访问凭证后重试。'],
    '45009': ['微信接口调用次数已达上限', '等待调用额度恢复，检查是否重复触发消息。'],
    '45047': ['微信消息发送次数已达上限', '等待发送额度恢复后再试。'],
    '-1': ['微信服务暂时繁忙', '稍后再试。'],
    template_missing: ['当前通知模板未配置或已停用', '启用对应通知并配置有效模板，然后重新触发业务通知。'],
    consent_unavailable: ['用户没有当前通知的可用订阅授权', '用户未同意订阅、授权已用完或模板已更换；需要用户重新同意订阅。'],
    openid_missing: ['未记录用户的小程序微信标识', '用户需使用当前小程序完成微信登录。'],
    mapping_empty: ['通知字段配置不完整或缺少业务内容', '补齐模板字段对应关系和本次通知内容后重新触发。'],
    missing_msgid: ['微信未返回消息编号，无法确认送达', '核对接口响应和通知回执，确认后再处理，避免重复发送。'],
    exception: ['发送过程发生异常', '检查网络连接、微信配置与服务端错误记录。'],
    delivery_failed: ['微信回执显示消息未送达', '检查用户是否取消关注或拒收，以及公众号模板配置。'],
  };
  const entry = map[String(inferred)];
  return { errorCode: String(inferred), errorMessageZh: entry?.[0] || (/^[\u4e00-\u9fff]/.test(error) ? error : '微信未能完成发送'),
    errorAdvice: entry?.[1] || '请结合错误码和微信原始返回信息排查，处理原因后再重试。' };
}

export function describeWechatPage(page?: string | null) {
  if (!page) return '未设置跳转页面';
  if (/^https?:\/\//.test(page)) return '打开网页链接';
  const path = page.replace(/^\/+/, '').split('?')[0];
  const name = /errand-detail/.test(path) ? '跑腿订单详情' : /RunErr/.test(path) ? '骑手接单工作台'
    : /order.*detail/i.test(path) ? '订单详情' : /pagesB\/post\/post/.test(path) ? '帖子详情'
    : /message|notification/i.test(path) ? '消息中心' : '小程序业务页面';
  const query = page.includes('?') ? new URLSearchParams(page.slice(page.indexOf('?') + 1)) : null;
  const id = query?.get('id') || query?.get('orderId') || query?.get('postId');
  return `打开${name}${id ? `，查看编号：${id}` : ''}`;
}

export function hasWechatTemplatePayload(payload: any): boolean {
  return !!payload && typeof payload === 'object' && !Array.isArray(payload)
    && Object.keys(payload).length > 0
    && Object.values(payload).every((value: any) => value && typeof value === 'object' && typeof value.value === 'string');
}
