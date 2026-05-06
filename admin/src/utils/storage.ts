/** localStorage 封装，支持过期时间 */

const PREFIX = 'lm_admin_'

interface StorageItem<T> {
  value: T
  expire?: number // 过期时间戳
}

export const storage = {
  set<T>(key: string, value: T, expire?: number): void {
    const item: StorageItem<T> = { value }
    if (expire) {
      item.expire = Date.now() + expire * 1000
    }
    localStorage.setItem(PREFIX + key, JSON.stringify(item))
  },

  get<T>(key: string): T | null {
    const raw = localStorage.getItem(PREFIX + key)
    if (!raw) return null

    try {
      const item: StorageItem<T> = JSON.parse(raw)
      if (item.expire && Date.now() > item.expire) {
        localStorage.removeItem(PREFIX + key)
        return null
      }
      return item.value
    } catch {
      return null
    }
  },

  remove(key: string): void {
    localStorage.removeItem(PREFIX + key)
  },

  clear(): void {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith(PREFIX))
    keys.forEach((k) => localStorage.removeItem(k))
  },
}
