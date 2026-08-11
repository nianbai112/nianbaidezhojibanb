const safeRider = (value) => value && typeof value === 'object' ? {
  userId: String(value.userId || ''),
  nickname: String(value.nickname || ''),
  realName: String(value.realName || ''),
  phone: String(value.phone || ''),
} : null

const safeRegion = (value) => value && typeof value === 'object' ? {
  id: String(value.id || ''),
  name: String(value.name || ''),
} : null

const safeDevice = (value) => value && typeof value === 'object' ? Object.fromEntries(
  ['model', 'os', 'system', 'platform', 'appVersion', 'userAgent']
    .filter((key) => value[key])
    .map((key) => [key, String(value[key])]),
) : null

export function mapRiderPasswordCredential(value) {
  const source = value && typeof value === 'object' ? value : {}
  return {
    configured: source.configured === true,
    username: String(source.username || ''),
    userId: String(source.userId || ''),
    enabled: source.enabled !== false,
    expiresAt: source.expiresAt || '',
    failedAttempts: Number(source.failedAttempts || 0),
    lockedUntil: source.lockedUntil || '',
    lastLoginAt: source.lastLoginAt || '',
    lastLoginIp: String(source.lastLoginIp || ''),
    lastLoginDevice: safeDevice(source.lastLoginDevice),
    passwordChangedAt: source.passwordChangedAt || '',
    rider: safeRider(source.rider),
    region: safeRegion(source.region),
  }
}

export function buildRiderPasswordCredentialPayload(form) {
  const password = String(form?.password || '')
  return {
    username: String(form?.username || '').trim(),
    userId: String(form?.userId || '').trim(),
    enabled: form?.enabled !== false,
    expiresAt: form?.expiresAt || null,
    ...(password.trim() ? { password } : {}),
  }
}

export function createLatestRequestController() {
  let latestRequest = 0
  return {
    begin: () => ++latestRequest,
    commit: (request, callback) => {
      if (request !== latestRequest) return false
      callback()
      return true
    },
  }
}

export function showUnsurfacedRequestError(error, fallback, show) {
  if (error?.userMessage || error?.__silent || error?.code === 'ERR_CANCELED' || error === 'cancel' || error?.message === 'cancel') {
    return false
  }
  show(String(error?.message || fallback))
  return true
}
