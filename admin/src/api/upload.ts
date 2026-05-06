import request from '@/utils/request'

function uploadUrl(path = '') {
  const base = import.meta.env.VITE_UPLOAD_URL || '/upload'
  const normalizedBase = base.replace(/\/$/, '')
  const normalizedPath = path ? `/${path.replace(/^\//, '')}` : ''
  if (/^https?:\/\//i.test(normalizedBase)) return `${normalizedBase}${normalizedPath}`
  return `${window.location.origin}${normalizedBase}${normalizedPath}`
}

/** 标准化上传响应，兼容后端 raw / wrapped / success 等多种格式 */
export function normalizeUploadResult(response: any): { url: string; key?: string; size?: number; mimeType?: string; type?: string; raw: any } {
  const raw = response

  // 先提取可能的数据体
  let data: any = raw
  if (raw && typeof raw === 'object') {
    if ('data' in raw && raw.data !== undefined) {
      data = raw.data
    }
    if ('success' in raw && raw.success === true && 'data' in raw && raw.data !== undefined) {
      data = raw.data
    }
  }

  // 提取 url
  let url = ''
  if (data && typeof data === 'object') {
    url = data.url || data.imageUrl || data.fileUrl || data.path || ''
  }

  if (!url || typeof url !== 'string') {
    throw new Error('上传成功但响应中缺少 url')
  }

  return {
    url,
    key: data?.key,
    size: data?.size,
    mimeType: data?.mimeType || data?.mimetype,
    type: data?.type,
    raw,
  }
}

/** 标准化批量上传响应 */
export function normalizeBatchUploadResult(response: any): { urls: string[]; files?: any[]; raw: any } {
  const raw = response
  let data: any = raw
  if (raw && typeof raw === 'object') {
    if ('data' in raw && raw.data !== undefined) {
      data = raw.data
    }
    if ('success' in raw && raw.success === true && 'data' in raw && raw.data !== undefined) {
      data = raw.data
    }
  }

  let urls: string[] = []
  if (data && typeof data === 'object') {
    if (Array.isArray(data.urls)) {
      urls = data.urls
    } else if (Array.isArray(data)) {
      urls = data.map((item: any) => item?.url || item).filter(Boolean)
    }
  }

  return {
    urls,
    files: data?.files,
    raw,
  }
}

export interface UploadOptions {
  /** 业务场景：avatar / post / admin / region / config / ad */
  scene?: string
  /** 上传进度回调 */
  onProgress?: (percent: number) => void
}

export const uploadApi = {
  /** 上传单个文件 → 后端 /upload */
  async upload(file: File, options?: UploadOptions) {
    const formData = new FormData()
    formData.append('file', file)
    if (options?.scene) {
      formData.append('scene', options.scene)
    }

    const res = await request.post(uploadUrl(), formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e: any) => {
        if (e.total && options?.onProgress) {
          options.onProgress(Math.round((e.loaded / e.total) * 100))
        }
      },
    })

    return normalizeUploadResult(res.data)
  },

  /** 批量上传 → 后端 /upload/batch */
  async batchUpload(files: File[], options?: UploadOptions) {
    const formData = new FormData()
    files.forEach((f) => formData.append('files', f))
    if (options?.scene) {
      formData.append('scene', options.scene)
    }

    const res = await request.post(uploadUrl('batch'), formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e: any) => {
        if (e.total && options?.onProgress) {
          options.onProgress(Math.round((e.loaded / e.total) * 100))
        }
      },
    })

    return normalizeBatchUploadResult(res.data)
  },
}
