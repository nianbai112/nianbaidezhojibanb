const LINK_TYPE_ALIASES = {
  web: 'webview',
  miniProgram: 'miniapp',
  miniProgramHalf: 'miniapp_half',
}

function normalizeLinkType(value) {
  const type = String(value || 'internal').trim()
  return LINK_TYPE_ALIASES[type] || type
}

export function normalizeKingkongCollection(value) {
  if (Array.isArray(value)) return value
  if (!value || typeof value !== 'object') return []
  if (Array.isArray(value.items)) return value.items
  return Object.keys(value)
    .filter((key) => /^\d+$/.test(key))
    .sort((a, b) => Number(a) - Number(b))
    .map((key) => value[key])
    .filter((item) => item && typeof item === 'object')
}

export function normalizeHomeNavDisplayConfig(value, fallback = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const fallbackTitle = fallback.title && typeof fallback.title === 'object' ? fallback.title : {}
  const title = source.title && typeof source.title === 'object' ? source.title : {}
  return {
    title: {
      show: title.show ?? fallbackTitle.show ?? true,
      text: String(title.text ?? fallbackTitle.text ?? '灵萌圈友'),
      color: String(title.color ?? fallbackTitle.color ?? '#222222'),
      fontSize: Number(title.fontSize ?? fallbackTitle.fontSize ?? 15),
      fontWeight: String(title.fontWeight ?? fallbackTitle.fontWeight ?? '600'),
    },
    showLayoutSwitch: source.showLayoutSwitch ?? fallback.showLayoutSwitch ?? true,
  }
}

export function normalizeKingkongEntry(item = {}) {
  const linkType = normalizeLinkType(item.linkType || item.jumpType)
  let path = String(item.path || item.page || '').trim()
  if (linkType === 'webview') path = path.replace(/^https?:\/\//i, (scheme) => scheme.toLowerCase())
  if (linkType === 'tel') path = path.replace(/[\s-]+/g, '')
  const querySupported = linkType === 'internal' || linkType === 'miniapp' || linkType === 'miniapp_half'
  return {
    id: item.id,
    name: String(item.name || ''),
    subtitle: String(item.subtitle || ''),
    icon: String(item.icon || item.image || ''),
    linkType,
    appId: String(item.appId || item.appid || '').trim(),
    path,
    query: querySupported ? String(item.query || '').trim().replace(/^\?+/, '') : '',
    enabled: item.enabled !== false,
    sortOrder: item.sortOrder ?? 0,
  }
}

export function buildKingkongPayload(items = []) {
  return items.map((item, index) => {
    const normalized = normalizeKingkongEntry(item)
    return {
      id: normalized.id || `nav_${index}`,
      name: normalized.name,
      subtitle: normalized.subtitle,
      icon: normalized.icon,
      linkType: normalized.linkType,
      path: normalized.path,
      page: normalized.path,
      appId: normalized.appId,
      query: normalized.query,
      enabled: normalized.enabled,
      sortOrder: index,
      type: 'page',
    }
  })
}

export function validateKingkongEntries(items = []) {
  for (let index = 0; index < items.length; index += 1) {
    const item = normalizeKingkongEntry(items[index])
    if (!item.enabled) continue
    const label = item.name.trim() || `入口 ${index + 1}`
    if (!item.name.trim()) return `第 ${index + 1} 个入口请填写名称`
    if (item.linkType === 'none') continue
    if ((item.linkType === 'miniapp' || item.linkType === 'miniapp_half') && !item.appId) {
      return `「${label}」请填写小程序 AppID`
    }
    if ((item.linkType === 'miniapp' || item.linkType === 'miniapp_half') && !/^wx[a-zA-Z0-9]{16}$/.test(item.appId)) {
      return `「${label}」小程序 AppID 格式不正确`
    }
    if (!item.path) return `「${label}」请填写跳转内容`
    if (item.linkType === 'webview' && !/^https?:\/\//i.test(item.path)) {
      return `「${label}」请填写以 http:// 或 https:// 开头的网页链接`
    }
    if (item.linkType === 'tel' && !/^\+?\d{6,20}$/.test(item.path)) {
      return `「${label}」请填写正确的电话号码`
    }
  }
  return ''
}
