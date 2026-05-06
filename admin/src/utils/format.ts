import dayjs from 'dayjs'

/** 格式化金额（分 → 元） */
export function formatMoney(fen: number, decimals = 2): string {
  return (fen / 100).toFixed(decimals)
}

/** 格式化数字 */
export function formatNumber(num: number): string {
  if (num >= 10000) {
    return (num / 10000).toFixed(1) + 'w'
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'k'
  }
  return num.toString()
}

/** 格式化时间 */
export function formatTime(time: string | number, pattern = 'YYYY-MM-DD HH:mm:ss'): string {
  return dayjs(time).format(pattern)
}

/** 格式化日期 */
export function formatDate(time: string | number): string {
  return dayjs(time).format('YYYY-MM-DD')
}

/** 相对时间 */
export function fromNow(time: string | number): string {
  const diff = dayjs().diff(dayjs(time), 'second')
  if (diff < 60) return '刚刚'
  if (diff < 3600) return Math.floor(diff / 60) + '分钟前'
  if (diff < 86400) return Math.floor(diff / 3600) + '小时前'
  if (diff < 2592000) return Math.floor(diff / 86400) + '天前'
  return formatDate(time)
}

/** 文件大小格式化 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + 'B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + 'KB'
  return (bytes / 1048576).toFixed(1) + 'MB'
}

/** 脱敏手机号 */
export function maskPhone(phone: string): string {
  if (!phone || phone.length < 11) return phone
  return phone.slice(0, 3) + '****' + phone.slice(7)
}
