export interface ParsedChatMessageContent {
  renderType: 'text' | 'image' | 'video' | 'audio' | 'location' | 'file' | 'note' | 'order';
  messageType: 'TEXT' | 'IMAGE' | 'VIDEO' | 'AUDIO' | 'FILE' | 'LOCATION' | 'SYSTEM';
  typeLabel: string;
  previewText: string;
  mediaUrl?: string;
  posterUrl?: string;
  duration?: number;
  location?: {
    name?: string;
    address?: string;
    latitude?: number | string;
    longitude?: number | string;
  };
  file?: {
    name?: string;
    url?: string;
    size?: number | string;
  };
  note?: {
    title?: string;
    content?: string;
    noteId?: string;
    authorName?: string;
    authorAvatar?: string;
    coverImage?: string;
    type?: number;
  };
  order?: {
    orderId?: string;
    orderNo?: string;
    orderType?: string;
    title?: string;
    amount?: number | string;
    status?: string;
    statusText?: string;
    createdAt?: string;
    path?: string;
    summary?: string;
  };
}

const TYPE_LABELS: Record<string, string> = {
  TEXT: '文字消息',
  IMAGE: '图片消息',
  VIDEO: '视频消息',
  AUDIO: '语音消息',
  FILE: '文件消息',
  LOCATION: '位置消息',
  SYSTEM: '系统消息',
};

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function readJsonPayload<T = any>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function readDuration(value: string) {
  const matched = value.match(/(?:[?&]duration=|\|duration:)(\d+)/);
  return matched ? Number(matched[1]) : undefined;
}

function stripDurationFromMediaUrl(value: string) {
  const duration = readDuration(value);
  let mediaUrl = value.replace(/\|duration:\d+$/, '');
  mediaUrl = mediaUrl.replace(/([?&])duration=\d+(&?)/, (_match, prefix, suffix) => (suffix ? prefix : ''));
  mediaUrl = mediaUrl.replace(/[?&]$/, '');
  return { mediaUrl, duration };
}

function fallbackByType(content: string, declaredType?: any): ParsedChatMessageContent {
  const type = String(declaredType || 'TEXT').toUpperCase();
  if (type === 'IMAGE') {
    return { renderType: 'image', messageType: 'IMAGE', typeLabel: TYPE_LABELS.IMAGE, previewText: '[图片]', mediaUrl: content };
  }
  if (type === 'VIDEO') {
    return { renderType: 'video', messageType: 'VIDEO', typeLabel: TYPE_LABELS.VIDEO, previewText: '[视频]', mediaUrl: content };
  }
  if (type === 'AUDIO') {
    const audio = stripDurationFromMediaUrl(content);
    return {
      renderType: 'audio',
      messageType: 'AUDIO',
      typeLabel: TYPE_LABELS.AUDIO,
      previewText: '[语音]',
      mediaUrl: audio.mediaUrl,
      duration: audio.duration,
    };
  }
  if (type === 'LOCATION') {
    return { renderType: 'location', messageType: 'LOCATION', typeLabel: TYPE_LABELS.LOCATION, previewText: '[位置]' };
  }
  if (type === 'FILE') {
    return { renderType: 'file', messageType: 'FILE', typeLabel: TYPE_LABELS.FILE, previewText: '[文件]', mediaUrl: content };
  }
  if (type === 'SYSTEM') {
    return { renderType: 'text', messageType: 'SYSTEM', typeLabel: TYPE_LABELS.SYSTEM, previewText: content || '[系统消息]' };
  }
  return { renderType: 'text', messageType: 'TEXT', typeLabel: TYPE_LABELS.TEXT, previewText: content };
}

export function parseChatMessageContent(contentValue: any, declaredType?: any): ParsedChatMessageContent {
  const content = String(contentValue || '').trim();
  if (!content) return fallbackByType('', declaredType);

  if (content.startsWith('img:')) {
    const mediaUrl = content.slice(4).trim();
    return { renderType: 'image', messageType: 'IMAGE', typeLabel: TYPE_LABELS.IMAGE, previewText: '[图片]', mediaUrl };
  }

  if (content.startsWith('video:')) {
    const body = content.slice(6).trim();
    const [rawUrl, rawThumb] = body.split('|thumb:');
    const mediaUrl = safeDecode(rawUrl || '').trim();
    const posterUrl = rawThumb ? safeDecode(rawThumb).trim() : '';
    return { renderType: 'video', messageType: 'VIDEO', typeLabel: TYPE_LABELS.VIDEO, previewText: '[视频]', mediaUrl, posterUrl };
  }

  if (content.startsWith('recording:') || content.startsWith('audio:')) {
    const rawMediaUrl = content.startsWith('recording:') ? content.slice(10).trim() : content.slice(6).trim();
    const audio = stripDurationFromMediaUrl(rawMediaUrl);
    return {
      renderType: 'audio',
      messageType: 'AUDIO',
      typeLabel: TYPE_LABELS.AUDIO,
      previewText: '[语音]',
      mediaUrl: audio.mediaUrl,
      duration: audio.duration,
    };
  }

  if (content.startsWith('location:')) {
    const location = readJsonPayload<ParsedChatMessageContent['location']>(content.slice(9).trim()) || {};
    const previewText = location.name || location.address ? `[位置] ${location.name || location.address}` : '[位置]';
    return { renderType: 'location', messageType: 'LOCATION', typeLabel: TYPE_LABELS.LOCATION, previewText, location };
  }

  if (content.startsWith('file:')) {
    const file = readJsonPayload<ParsedChatMessageContent['file']>(content.slice(5).trim()) || {};
    const mediaUrl = file.url || '';
    const previewText = file.name ? `[文件] ${file.name}` : '[文件]';
    return { renderType: 'file', messageType: 'FILE', typeLabel: TYPE_LABELS.FILE, previewText, mediaUrl, file };
  }

  if (content.startsWith('notes:')) {
    const parts = content.slice(6).split('|');
    const noteBody = parts[1] || '';
    const note = {
      title: parts[0] || noteBody.split(/\r?\n/)[0].slice(0, 60) || '无标题',
      content: noteBody,
      noteId: parts[2] || '',
      authorName: parts[3] || '未知用户',
      authorAvatar: parts[4] || '',
      coverImage: parts[5] || '',
      type: Number(parts[6]) || 1,
    };
    return {
      renderType: 'note',
      messageType: 'TEXT',
      typeLabel: '笔记消息',
      previewText: `[笔记] ${note.title}`,
      note,
    };
  }

  if (content.startsWith('order:')) {
    const order = readJsonPayload<ParsedChatMessageContent['order']>(content.slice(6).trim()) || {};
    const orderNo = order.orderNo || order.orderId || '';
    const title = order.title || '订单问题';
    const previewText = orderNo ? `[订单] ${title} ${orderNo}` : `[订单] ${title}`;
    return { renderType: 'order', messageType: 'TEXT', typeLabel: '订单消息', previewText, order };
  }

  return fallbackByType(content, declaredType);
}

export function inferChatMessageType(content: any, declaredType?: any) {
  const type = String(declaredType || '').toLowerCase();
  if (type && !['message', 'private_message'].includes(type)) {
    const directMap: Record<string, string> = {
      text: 'TEXT',
      image: 'IMAGE',
      img: 'IMAGE',
      video: 'VIDEO',
      audio: 'AUDIO',
      recording: 'AUDIO',
      file: 'FILE',
      location: 'LOCATION',
      system: 'SYSTEM',
    };
    if (directMap[type]) return directMap[type];
  }
  return parseChatMessageContent(content, declaredType).messageType;
}
