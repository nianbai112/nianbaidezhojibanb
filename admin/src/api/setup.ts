import axios from 'axios'

const setupRequest = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 180000
})

export interface SetupStatus {
  initialized: boolean
  setupTokenRequired?: boolean
  setupWizardMode?: boolean
}

export interface SetupCheckItem {
  name: string
  status: 'passed' | 'warning' | 'failed'
  message: string
  detail?: Record<string, unknown>
}

export interface SetupCheckResult {
  overall: 'passed' | 'warning' | 'failed'
  checks: SetupCheckItem[]
}

export interface SetupInitPayload {
  siteName?: string
  siteLogo?: string
  adminUsername: string
  adminPassword: string
  adminPhone?: string
  databaseProvider?: string
  databaseUrl?: string
  redisHost?: string
  redisPort?: number
  redisPassword?: string
  jwtSecret?: string
  corsOrigin?: string
  wxMiniAppid?: string
  wxMiniSecret?: string
  wxPayMchid?: string
  wxPayApiv3Key?: string
  wxPayCertSerialNo?: string
  wxPayPrivateKeyPath?: string
  wxPayPlatformCertPath?: string
  wxPayNotifyUrl?: string
  wxPayRefundNotifyUrl?: string
  cosSecretId?: string
  cosSecretKey?: string
  cosBucket?: string
  cosRegion?: string
  cosDomain?: string
}

function setupHeaders(setupToken?: string) {
  const token = String(setupToken || '').trim()
  return token ? { 'x-setup-token': token } : undefined
}

export async function getSetupStatus() {
  const res = await setupRequest.get<SetupStatus>('/setup/status')
  return res.data
}

export async function checkSetupEnvironment(setupToken = '', payload: Partial<SetupInitPayload> = {}) {
  const res = await setupRequest.post<SetupCheckResult>('/setup/check', payload, { headers: setupHeaders(setupToken) })
  return res.data
}

export async function initSetup(payload: SetupInitPayload, setupToken = '') {
  const res = await setupRequest.post('/setup/init', payload, { headers: setupHeaders(setupToken) })
  return res.data
}
