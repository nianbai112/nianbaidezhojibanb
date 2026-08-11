export interface AdminChatMessageView {
  renderType: 'text' | 'image' | 'video' | 'audio' | 'location' | 'file' | 'note' | 'order'
  typeLabel: string
  previewText: string
  displayContent: string
  rawContent: string
  mediaUrl?: string
  posterUrl?: string
  duration?: number
  location?: {
    name?: string
    address?: string
    latitude?: number | string
    longitude?: number | string
  } | null
  file?: {
    name?: string
    url?: string
    size?: number | string
  } | null
  order?: {
    orderId?: string
    orderNo?: string
    orderType?: string
    title?: string
    amount?: number | string
    status?: string
    statusText?: string
    createdAt?: string
    path?: string
    summary?: string
  } | null
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function readJson<T = any>(value: string): T | null {
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

function readDuration(value: string) {
  const matched = value.match(/(?:[?&]duration=|\|duration:)(\d+)/)
  return matched ? Number(matched[1]) : undefined
}

function stripDurationFromMediaUrl(value: string) {
  const duration = readDuration(value)
  let mediaUrl = value.replace(/\|duration:\d+$/, '')
  mediaUrl = mediaUrl.replace(/([?&])duration=\d+(&?)/, (_match, prefix, suffix) => (suffix ? prefix : ''))
  mediaUrl = mediaUrl.replace(/[?&]$/, '')
  return { mediaUrl, duration }
}

function byDeclaredType(content: string, type?: string): AdminChatMessageView {
  const upper = String(type || '').toUpperCase()
  if (upper === 'IMAGE') return { renderType: 'image', typeLabel: '图片消息', previewText: '[图片]', displayContent: '[图片]', rawContent: content, mediaUrl: content }
  if (upper === 'VIDEO') return { renderType: 'video', typeLabel: '视频消息', previewText: '[视频]', displayContent: '[视频]', rawContent: content, mediaUrl: content }
  if (upper === 'AUDIO') {
    const audio = stripDurationFromMediaUrl(content)
    return { renderType: 'audio', typeLabel: '语音消息', previewText: '[语音]', displayContent: '[语音]', rawContent: content, mediaUrl: audio.mediaUrl, duration: audio.duration }
  }
  if (upper === 'LOCATION') return { renderType: 'location', typeLabel: '位置消息', previewText: '[位置]', displayContent: '[位置]', rawContent: content }
  if (upper === 'FILE') return { renderType: 'file', typeLabel: '文件消息', previewText: '[文件]', displayContent: '[文件]', rawContent: content, mediaUrl: content }
  return { renderType: 'text', typeLabel: '文字消息', previewText: content, displayContent: content, rawContent: content }
}

export function parseChatContent(rawValue: any, declaredType?: string): AdminChatMessageView {
  const rawContent = String(rawValue || '').trim()
  if (!rawContent) return byDeclaredType('', declaredType)

  if (rawContent.startsWith('img:')) {
    const mediaUrl = rawContent.slice(4).trim()
    return { renderType: 'image', typeLabel: '图片消息', previewText: '[图片]', displayContent: '[图片]', rawContent, mediaUrl }
  }

  if (rawContent.startsWith('video:')) {
    const body = rawContent.slice(6).trim()
    const [rawUrl, rawThumb] = body.split('|thumb:')
    const mediaUrl = safeDecode(rawUrl || '').trim()
    const posterUrl = rawThumb ? safeDecode(rawThumb).trim() : ''
    return { renderType: 'video', typeLabel: '视频消息', previewText: '[视频]', displayContent: '[视频]', rawContent, mediaUrl, posterUrl }
  }

  if (rawContent.startsWith('recording:') || rawContent.startsWith('audio:')) {
    const rawMediaUrl = rawContent.startsWith('recording:') ? rawContent.slice(10).trim() : rawContent.slice(6).trim()
    const audio = stripDurationFromMediaUrl(rawMediaUrl)
    return { renderType: 'audio', typeLabel: '语音消息', previewText: '[语音]', displayContent: '[语音]', rawContent, mediaUrl: audio.mediaUrl, duration: audio.duration }
  }

  if (rawContent.startsWith('location:')) {
    const location = readJson<AdminChatMessageView['location']>(rawContent.slice(9).trim()) || null
    const previewText = location?.name || location?.address ? `[位置] ${location.name || location.address}` : '[位置]'
    return { renderType: 'location', typeLabel: '位置消息', previewText, displayContent: previewText, rawContent, location }
  }

  if (rawContent.startsWith('file:')) {
    const file = readJson<AdminChatMessageView['file']>(rawContent.slice(5).trim()) || null
    const mediaUrl = file?.url || ''
    const previewText = file?.name ? `[文件] ${file.name}` : '[文件]'
    return { renderType: 'file', typeLabel: '文件消息', previewText, displayContent: previewText, rawContent, mediaUrl, file }
  }

  if (rawContent.startsWith('notes:')) {
    return { renderType: 'note', typeLabel: '笔记消息', previewText: '[笔记]', displayContent: '[笔记]', rawContent }
  }

  if (rawContent.startsWith('order:')) {
    const order = readJson<AdminChatMessageView['order']>(rawContent.slice(6).trim()) || null
    const title = order?.title || '订单问题'
    const orderNo = order?.orderNo || order?.orderId || ''
    const previewText = orderNo ? `[订单] ${title} ${orderNo}` : `[订单] ${title}`
    return { renderType: 'order', typeLabel: '订单消息', previewText, displayContent: previewText, rawContent, order }
  }

  return byDeclaredType(rawContent, declaredType)
}

export function normalizeChatMessage<T extends Record<string, any>>(message: T): T & AdminChatMessageView {
  const parsed = parseChatContent(message.rawContent ?? message.originalContent ?? message.raw_message ?? message.content, message.type)
  const media = parsed.renderType === 'audio'
    ? stripDurationFromMediaUrl(String(message.mediaUrl || parsed.mediaUrl || ''))
    : { mediaUrl: message.mediaUrl || parsed.mediaUrl || '', duration: parsed.duration }
  return {
    ...message,
    ...parsed,
    displayContent: message.isRecalled ? '这条消息已撤回' : parsed.displayContent,
    previewText: message.isRecalled ? '这条消息已撤回' : (message.previewText || parsed.previewText),
    typeLabel: message.typeLabel || parsed.typeLabel,
    mediaUrl: media.mediaUrl,
    posterUrl: message.posterUrl || parsed.posterUrl || '',
    duration: message.duration || media.duration,
    location: message.location || parsed.location || null,
    file: message.file || parsed.file || null,
    order: message.order || parsed.order || null,
  }
}

export function formatChatMessagePreview(content: any, type?: string) {
  return parseChatContent(content, type).previewText
}
