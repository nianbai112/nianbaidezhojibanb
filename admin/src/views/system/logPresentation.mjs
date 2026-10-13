export const moduleNames = {
  config: '系统配置', app_review_mode: '小程序功能开关', app_capability: '小程序功能开关',
  region_tabbar: '底部导航', region: '区域', circle: '圈子', user: '用户', merchant: '商家',
  order: '订单', errand_order: '跑腿订单', content: '内容', finance: '财务', system: '系统',
  admin: '管理员', admin_account: '管理员账号', role: '角色权限', permission: '权限',
  ops_alert: '运维告警', ops: '服务监控', marketing: '营销', notification: '通知',
  wechat_template: '微信消息模板', wechat: '微信配置', miniapp: '微信小程序配置',
  storage: '文件存储配置', ai: '智能服务配置', region_content: '区域内容',
  region_banner: '区域轮播', region_notice: '区域公告', region_popup: '首页权益卡片',
  rider: '骑手', delivery: '配送', activity: '活动', popup: '首页权益卡片',
  payment: '支付', refund: '退款', withdraw: '提现', sku: '商品规格', product: '商品',
  post: '帖子', comment: '评论', banner: '轮播图', notice: '公告', coupon: '优惠券',
  campus_map: '校园地图', region_decor: '页面装修', security: '安全设置',
};
export const actionNames = {
  revoke_rider: '撤销骑手认证',
  update_app_capabilities: '修改小程序功能开关', update_app_review_mode: '修改小程序审核配置',
  update_config: '修改配置', create: '新增', update: '修改', delete: '删除', audit: '审核',
  login: '登录', logout: '退出登录', ban: '封禁', unban: '解封', dissolve: '解散',
  remove_member: '移除成员', batch: '批量操作', force_password_reset: '强制重置密码',
  soft_delete: '移入回收站', grant_membership: '发放会员', grant_member: '发放会员',
  grant_coupon: '发放优惠券', grant_m: '发放权益', enable: '启用', disable: '停用',
  save: '保存', publish: '发布', submit: '提交操作', retry: '重新发送', resolve: '处理', ignore: '忽略',
};
const fieldNames = {
  enabled: '启用状态', hideDelivery: '隐藏外卖', hideMall: '隐藏商城', hideErrand: '隐藏跑腿',
  hideWallet: '隐藏钱包', hideTopup: '隐藏充值', hideVirtualGoods: '隐藏虚拟商品',
  hideShareInvite: '隐藏分享邀请', hideDating: '隐藏交友', placeholderText: '暂未开放提示',
  list: '导航项', name: '名称', title: '标题', text: '文字', label: '名称', path: '页面路径',
  page: '跳转页面', pagePath: '页面路径', iconPath: '普通图标', selectedIconPath: '选中图标',
  icon: '图标', selectedIcon: '选中图标', color: '文字颜色', selectedColor: '选中文字颜色',
  backgroundColor: '背景颜色', borderStyle: '边框样式', messageBadgeStyle: '消息角标样式',
  status: '状态', reason: '原因', remark: '备注', description: '说明', amount: '金额',
  verifyStatus: '认证状态', riderType: '接单身份',
  quantity: '数量', regionId: '区域编号', userId: '用户编号', id: '编号', key: '配置项',
  regionName: '区域名称', nickname: '用户昵称', realName: '姓名', username: '账号',
  phone: '手机号', email: '邮箱', url: '链接', linkType: '跳转类型', linkValue: '跳转目标',
  sort: '排序', sortOrder: '排序', order: '顺序', index: '位置', visible: '是否显示',
  show: '是否显示', hidden: '是否隐藏', showText: '显示文字', config: '配置', value: '配置值',
  type: '类型', size: '尺寸', width: '宽度', height: '高度', image: '图片', imageUrl: '图片地址',
  appId: '应用编号', appSecret: '应用密钥', secret: '密钥', token: '验证令牌', apiKey: '接口密钥',
  password: '密码', passwordHash: '密码校验值', before: '修改前', after: '修改后',
  templateType: '通知类型', templateId: '微信模板编号', defaultPage: '默认跳转页面',
  pageTemplate: '跳转页面规则', fieldMapping: '通知字段对应关系', platformType: '微信渠道',
  rate: '费率', fixedFee: '固定费用', commissionRate: '抽成比例', durationDays: '有效天数',
  benefitKey: '权益类型', benefitName: '权益名称', startTime: '开始时间', endTime: '结束时间',
  priority: '优先级', position: '展示位置', updatedAt: '更新时间', createdAt: '创建时间',
  method: '请求方式', requestPath: '操作入口', submitted: '提交内容', outcome: '执行结果',
};
export const normalizeLogKey = (value) => String(value || '').replace(/([a-z])([A-Z])/g, '$1_$2').replace(/[^a-zA-Z0-9]+/g, '_').toLowerCase();
export function moduleName(value) { return moduleNames[normalizeLogKey(value)] || (/[^\x00-\x7f]/.test(value || '') ? value : '后台业务'); }
export function actionName(value) {
  const key = normalizeLogKey(value);
  return actionNames[key] || actionNames[key.split('_')[0]] || (/[^\x00-\x7f]/.test(value || '') ? value : '执行操作');
}
function flatten(value, prefix = '', result = {}) {
  if (!prefix && value && typeof value === 'object' && !Object.keys(value).length) return result;
  if (value && typeof value === 'object' && Object.keys(value).length) {
    for (const [key, item] of Object.entries(value)) flatten(item, prefix ? `${prefix}.${key}` : key, result);
  } else result[prefix || 'value'] = value;
  return result;
}
function fieldName(path) {
  return path.split('.').map((part) => /^\d+$/.test(part) ? `第${Number(part) + 1}项` : fieldNames[part] || moduleNames[part] || (/[^\x00-\x7f]/.test(part) ? part : '其他设置')).join(' · ');
}
function displayValue(value) {
  if (value === undefined || value === null || value === '') return '未设置';
  if (value === true) return '是';
  if (value === false) return '否';
  if (typeof value === 'object') return Array.isArray(value) ? '空列表' : '空配置';
  const names = { active: '启用', disabled: '停用', pending: '待处理', approved: '已通过', rejected: '已拒绝', success: '成功', failed: '失败', dot: '圆点', number: '数字', none: '不显示', page: '小程序页面', link: '网页链接', official: '公众号', miniprogram: '小程序', miniapp: '小程序' };
  return names[value] || moduleNames[value] || String(value);
}
export function operationChanges(detail) {
  if (!detail) return [];
  if (typeof detail === 'string') { try { return operationChanges(JSON.parse(detail)); } catch { return [{ label: '操作说明', after: detail }]; } }
  const hasBefore = Object.hasOwn(detail, 'before');
  if (hasBefore || Object.hasOwn(detail, 'after')) {
    const before = flatten(detail.before ?? {}), after = flatten(detail.after ?? {});
    return [...new Set([...Object.keys(before), ...Object.keys(after)])]
      .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
      .map((key) => ({ label: fieldName(key), before: hasBefore ? displayValue(before[key]) : '历史未记录', after: displayValue(after[key]) }));
  }
  return Object.entries(flatten(detail)).filter(([key]) => !['riskLevel', 'riskReason'].includes(key))
    .map(([key, value]) => ({ label: fieldName(key), after: displayValue(value) }));
}
export function ipText(value) {
  if (!value) return '未记录';
  const ip = String(value).replace(/^::ffff:/, '');
  return ['127.0.0.1', '::1'].includes(ip) ? `${ip}（本机或代理地址）` : ip;
}
export function fullTime(value) {
  const date = new Date(value);
  return value && Number.isFinite(date.getTime()) ? date.toLocaleString('zh-CN', { hour12: false }) : '未记录';
}
export function deviceInfo(ua) {
  if (!ua) return '未记录设备信息';
  const system = /iPhone|iPad|iPod/.test(ua) ? `苹果移动系统 ${(ua.match(/OS ([\d_]+)/) || [])[1]?.replaceAll('_', '.') || ''}`
    : /Android/.test(ua) ? `安卓 ${(ua.match(/Android ([\d.]+)/) || [])[1] || ''}`
    : /Mac OS X/.test(ua) ? `苹果电脑系统 ${(ua.match(/Mac OS X ([\d_]+)/) || [])[1]?.replaceAll('_', '.') || ''}`
    : /Windows NT/.test(ua) ? '微软桌面系统' : /Linux/.test(ua) ? 'Linux 系统' : '系统未识别';
  const browsers = [['MicroMessenger', '微信内置浏览器'], ['Edg', '微软浏览器'], ['OPR', '欧朋浏览器'], ['Chrome', '谷歌浏览器'], ['Firefox', '火狐浏览器'], ['Version', '苹果浏览器']];
  const found = browsers.map(([key, label]) => { const match = ua.match(new RegExp(`${key}/([\\d.]+)`)); return match ? `${label} ${match[1]}` : ''; }).find(Boolean) || '浏览器未识别';
  const device = /iPad|Tablet/.test(ua) ? '平板' : /Mobile|iPhone|Android/.test(ua) ? '手机' : '电脑';
  return `${device} · ${system.trim()} · ${found}`;
}
