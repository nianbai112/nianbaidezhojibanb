export const businessFields = [
  ['orderNo', '订单编号'], ['orderAmount', '订单金额'], ['serviceName', '服务名称'],
  ['orderTime', '下单时间'], ['serviceAddress', '服务地址（校区）'],
  ['riderName', '骑手名称'], ['riderPhone', '骑手电话'], ['pickupAddress', '取件地址'],
  ['deliveryAddress', '配送地址'], ['estimatedTime', '预计送达时间'], ['pickedAt', '取件时间'],
  ['finishedAt', '完成时间'], ['content', '通知内容'], ['title', '通知标题'], ['remark', '备注'],
  ['abnormalReason', '异常原因'], ['suggestion', '处理建议'], ['fromNickname', '发起人昵称'],
  ['contentSummary', '内容摘要'], ['postTitle', '帖子标题'], ['likeCount', '点赞数量'],
  ['timePeriod', '发生时间'], ['actionLabel', '通知类型'], ['merchantName', '商家名称'],
].map(([value, label]) => ({ value, label }))
export const newOrderFields = ['orderNo', 'orderAmount', 'serviceName', 'orderTime', 'serviceAddress']
const aliases = {
  '订单编号': 'orderNo', '订单号': 'orderNo', '订单金额': 'orderAmount', '服务名称': 'serviceName',
  '下单时间': 'orderTime', '服务地址': 'serviceAddress', '骑手名称': 'riderName', '骑手姓名': 'riderName',
  '骑手电话': 'riderPhone', '取件地址': 'pickupAddress', '配送地址': 'deliveryAddress', '服务地点': 'deliveryAddress',
  '预计送达时间': 'estimatedTime', '取件时间': 'pickedAt', '完成时间': 'finishedAt',
}
export function normalizeVariable(value) {
  return String(value || '').trim().replace(/^\{\{\s*/, '').replace(/\s*\}\}$/, '').replace(/\.DATA$/i, '').trim()
}
export function parseWechatTemplate(content) {
  return String(content || '').replace(/\\n/g, '\n').split(/\r?\n/).flatMap(line => {
    const match = line.match(/\{\{\s*([a-z][a-z_]*\d+|first|remark|content)\.DATA\s*\}\}/i)
    if (!match) return []
    const label = line.slice(0, match.index).replace(/[\s:：]+$/g, '').trim()
    return [{ variable: match[1], business: aliases[label] || '', label }]
  })
}
export function editFields(mapping = {}, scene = '') {
  const entries = Object.entries(mapping || {}).map(([variable, business]) => ({ variable, business }))
  return entries.length ? entries : scene === 'new_errand_order'
    ? newOrderFields.map(business => ({ variable: '', business })) : [{ variable: '', business: '' }]
}
export function buildTemplatePayload(form, scene, platform) {
  const templateId = String(form.templateId || '').trim()
  if (!/^[A-Za-z0-9_-]{20,128}$/.test(templateId)) throw new Error('请填写微信添加后生成的完整模板 ID，不能填写模板库编号 42995')
  const entries = form.fields.map(item => [normalizeVariable(item.variable), String(item.business || '').trim()])
  if (!entries.length || entries.some(([key, value]) => !/^(?:[a-z][a-z_]*\d+|first|remark|content)$/.test(key) || !/^[a-zA-Z][a-zA-Z0-9_]{0,79}$/.test(value))) {
    throw new Error('请为每一行填写微信字段编号，并选择对应内容')
  }
  if (new Set(entries.map(([key]) => key)).size !== entries.length) throw new Error('微信字段编号不能重复')
  if (platform === 'official' && scene === 'new_errand_order'
    && (entries.length !== 5 || newOrderFields.some(value => entries.filter(([, field]) => field === value).length !== 1))) {
    throw new Error('骑手新单须分别对应订单编号、订单金额、服务名称、下单时间和服务地址（校区）')
  }
  return { templateId, fieldMapping: Object.fromEntries(entries), enabled: form.enabled === true }
}
