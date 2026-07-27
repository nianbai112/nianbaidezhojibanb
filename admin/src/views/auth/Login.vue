<template>
  <div class="login-page">
    <aside class="brand-panel">
      <div class="brand-top">
        <div class="brand-logo">
          <img v-if="brand.logo" :src="brand.logo" alt="" />
          <span v-else>{{ brand.title.slice(0, 1) || '校' }}</span>
        </div>
        <span class="brand-name">{{ brand.title }}</span>
      </div>

      <div class="brand-slogan">
        <h1>{{ brand.loginSlogan }}</h1>
        <p>区域、内容、商家、商城、财务、通知与系统运维统一管理。</p>
      </div>

      <div class="brand-bottom">
        <ul class="brand-points">
          <li v-for="point in capabilityPoints" :key="point"><i />{{ point }}</li>
        </ul>
        <p class="brand-copy">© {{ year }} {{ brand.title }}</p>
      </div>
    </aside>

    <header class="mobile-brand">
      <div class="brand-logo sm">
        <img v-if="brand.logo" :src="brand.logo" alt="" />
        <span v-else>{{ brand.title.slice(0, 1) || '校' }}</span>
      </div>
      <span class="mobile-brand-name">{{ brand.title }}</span>
    </header>

    <main class="form-panel">
      <div class="login-form">
        <div class="login-title">
          <h2>欢迎回来</h2>
          <p>登录以继续运营管理</p>
        </div>

        <div class="login-switch" role="tablist" aria-label="登录方式">
          <button :class="{ active: mode === 'password' }" type="button" @click="switchMode('password')">账号密码</button>
          <button :class="{ active: mode === 'qr' }" type="button" @click="switchMode('qr')">小程序扫码</button>
        </div>

        <el-form v-if="mode === 'password'" label-position="top" @submit.prevent>
          <el-form-item label="账号">
            <el-input v-model="form.username" placeholder="admin" size="large" />
          </el-form-item>
          <el-form-item label="密码">
            <el-input
              v-model="form.password"
              type="password"
              placeholder="请输入密码"
              show-password
              size="large"
              @keyup.enter="login"
            />
          </el-form-item>
          <el-form-item label="验证码">
            <div class="captcha-row">
              <el-input
                v-model="form.captcha"
                placeholder="请输入验证码"
                size="large"
                maxlength="6"
                @keyup.enter="login"
              />
              <button class="captcha-image" type="button" :disabled="captchaLoading" @click="loadCaptcha">
                <img v-if="captchaImage" :src="captchaImage" alt="登录验证码" />
                <span v-else>{{ captchaLoading ? '加载中' : '刷新' }}</span>
              </button>
            </div>
          </el-form-item>
          <el-button type="primary" size="large" class="login-submit" :loading="loading" @click="login">登录后台</el-button>
        </el-form>

        <div v-else class="qr-login">
          <div class="qr-box">
            <canvas ref="qrCanvas" width="220" height="220" />
            <div v-if="qrLoading" class="qr-mask">生成中</div>
            <div v-if="qrStatus === 'SCANNED'" class="qr-mask success">已扫码</div>
            <div v-if="qrStatus === 'EXPIRED' || qrStatus === 'CANCELED'" class="qr-mask danger">已失效</div>
          </div>

          <div class="qr-status">
            <strong>{{ qrStatusText }}</strong>
            <span>{{ qrHintText }}</span>
          </div>

          <div v-if="qrUserName" class="qr-user">
            <el-avatar :src="qrAvatar" :size="34">{{ qrUserName.slice(0, 1) }}</el-avatar>
            <div>
              <b>{{ qrUserName }}</b>
              <p>请在小程序确认是否登录后台</p>
            </div>
          </div>

          <div class="qr-actions">
            <el-button @click="startQrLogin">刷新二维码</el-button>
            <el-button @click="copyTicket">复制 Ticket</el-button>
          </div>

          <p class="qr-note">
            首次扫码会在小程序内要求输入管理员账号密码完成绑定；以后同一微信可直接确认登录。
          </p>
        </div>

        <div class="login-foot">
          <span class="login-foot-note">{{ brand.subtitle }}</span>
          <router-link class="setup-entry" to="/setup">首次部署？进入安装向导</router-link>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import QRCode from 'qrcode'
import { cancelAdminQrLogin, createAdminQrLogin, fetchAdminCaptcha, fetchWebsiteInfo, getAdminQrLoginStatus, type WebsiteInfo } from '@/api/admin'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()

const loading = ref(false)
const mode = ref<'password' | 'qr'>('password')
const form = reactive({ username: 'admin', password: '', captchaId: '', captcha: '' })
const captchaImage = ref('')
const captchaLoading = ref(false)
const brand = reactive({
  title: '校园本地生活',
  subtitle: 'Lingmeng Admin Console',
  logo: '',
  favicon: '',
  browserTitle: '校园本地生活',
  loginSlogan: '面向校园本地生活的真实运营后台'
})

const year = new Date().getFullYear()
const capabilityPoints = ['内容 / 用户 / 商家一体化运营', '实时数据与异常告警', '区域化精细运营']

const qrCanvas = ref<HTMLCanvasElement | null>(null)
const qrLoading = ref(false)
const qrTicket = ref('')
const qrStatus = ref<'PENDING' | 'SCANNED' | 'CONFIRMED' | 'EXPIRED' | 'CANCELED' | ''>('')
const qrMessage = ref('')
const qrUserName = ref('')
const qrAvatar = ref('')
let pollTimer: number | null = null

const qrStatusText = computed(() => {
  const map: Record<string, string> = {
    PENDING: '等待小程序扫码',
    SCANNED: '已扫码，请在手机确认',
    CONFIRMED: '已确认，正在进入后台',
    EXPIRED: '二维码已过期',
    CANCELED: '本次扫码已取消'
  }
  return map[qrStatus.value] || '正在准备二维码'
})

const qrHintText = computed(() => {
  if (qrMessage.value) return qrMessage.value
  if (qrStatus.value === 'SCANNED') return '手机上确认后，电脑端会自动进入后台'
  if (qrStatus.value === 'EXPIRED') return '请刷新二维码后重新扫码'
  return '打开小程序或微信扫一扫，扫描二维码完成登录'
})

async function login() {
  if (!form.username || !form.password || !form.captcha) {
    ElMessage.warning('请输入账号、密码和验证码')
    return
  }
  loading.value = true
  try {
    await auth.login(form.username, form.password, { captchaId: form.captchaId, captcha: form.captcha })
    ElMessage.success('登录成功')
    router.push('/dashboard')
  } catch {
    form.captcha = ''
    await loadCaptcha()
  } finally {
    loading.value = false
  }
}

async function loadCaptcha() {
  captchaLoading.value = true
  try {
    const data = await fetchAdminCaptcha()
    form.captchaId = data.captchaId
    captchaImage.value = data.image
  } catch {
    captchaImage.value = ''
    form.captchaId = ''
    ElMessage.error('验证码加载失败，请检查后端服务')
  } finally {
    captchaLoading.value = false
  }
}

async function switchMode(nextMode: 'password' | 'qr') {
  mode.value = nextMode
  if (nextMode === 'qr') {
    await startQrLogin()
  } else {
    stopPolling(true)
    if (!captchaImage.value) await loadCaptcha()
  }
}

async function startQrLogin() {
  stopPolling(true)
  qrLoading.value = true
  qrStatus.value = ''
  qrMessage.value = ''
  qrUserName.value = ''
  qrAvatar.value = ''
  try {
    const data: any = await createAdminQrLogin()
    qrTicket.value = data.ticket
    qrStatus.value = data.status || 'PENDING'
    qrMessage.value = data.message || ''
    await nextTick()
    if (qrCanvas.value) {
      await QRCode.toCanvas(qrCanvas.value, data.qrcodeText || data.scanUrl || data.scanPath || data.ticket, {
        width: 220,
        margin: 1,
        color: {
          dark: '#101827',
          light: '#ffffff'
        }
      })
    }
    pollTimer = window.setInterval(pollQrStatus, 1800)
    await pollQrStatus()
  } finally {
    qrLoading.value = false
  }
}

async function pollQrStatus() {
  if (!qrTicket.value) return
  const data: any = await getAdminQrLoginStatus(qrTicket.value)
  qrStatus.value = data.status || qrStatus.value
  qrMessage.value = data.message || ''
  qrUserName.value = data.nickname || qrUserName.value
  qrAvatar.value = data.avatar || qrAvatar.value

  if (data.status === 'CONFIRMED') {
    stopPolling(false)
    auth.applyLoginPayload(data.login || data)
    ElMessage.success('扫码登录成功')
    router.push('/dashboard')
  }
  if (data.status === 'EXPIRED' || data.status === 'CANCELED') {
    stopPolling(false)
  }
}

function stopPolling(cancelTicket = false) {
  if (pollTimer) {
    window.clearInterval(pollTimer)
    pollTimer = null
  }
  if (cancelTicket && qrTicket.value && qrStatus.value && !['CONFIRMED', 'EXPIRED', 'CANCELED'].includes(qrStatus.value)) {
    cancelAdminQrLogin(qrTicket.value).catch(() => undefined)
  }
}

function applyWebsiteInfo(data: WebsiteInfo = {}) {
  const title = data.adminTitle || data.siteName || '校园本地生活'
  brand.title = title
  brand.subtitle = data.adminSubtitle || data.siteShortName || 'Lingmeng Admin Console'
  brand.logo = data.siteLogo || data.logo || ''
  brand.favicon = data.favicon || ''
  brand.browserTitle = data.browserTitle || title
  brand.loginSlogan = data.loginSlogan || '面向校园本地生活的真实运营后台'
  document.title = brand.browserTitle
  updateFavicon(brand.favicon)
}

function updateFavicon(url?: string) {
  const href = String(url || '').trim()
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (!link) {
    link = document.createElement('link')
    link.rel = 'icon'
    document.head.appendChild(link)
  }
  link.href = href || 'data:,'
}

async function loadWebsiteInfo() {
  try {
    applyWebsiteInfo(await fetchWebsiteInfo())
  } catch {
    applyWebsiteInfo({})
  }
}

async function copyTicket() {
  if (!qrTicket.value) {
    ElMessage.warning('请先生成二维码')
    return
  }
  await navigator.clipboard.writeText(qrTicket.value)
  ElMessage.success('Ticket 已复制，可用于开发工具手动测试')
}

onBeforeUnmount(() => stopPolling(true))
onMounted(() => {
  loadWebsiteInfo()
  loadCaptcha()
})
</script>

<style scoped>
.login-page {
  height: 100vh;
  display: flex;
  overflow: hidden;
  background: #fff;
}

/* ---- 左侧品牌面板 ---- */
.brand-panel {
  flex: 0 0 45%;
  min-width: 420px;
  display: flex;
  flex-direction: column;
  padding: 48px;
  background-color: var(--mx-ink);
  background-image:
    repeating-linear-gradient(0deg, rgba(255, 255, 255, .035) 0 1px, transparent 1px 64px),
    repeating-linear-gradient(90deg, rgba(255, 255, 255, .035) 0 1px, transparent 1px 64px);
}

.brand-top {
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand-logo {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--mx-primary);
  display: grid;
  place-items: center;
  color: #fff;
  font-weight: 700;
  font-size: 16px;
  flex-shrink: 0;
  overflow: hidden;
}

.brand-logo img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

.brand-logo.sm {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  font-size: 13px;
}

.brand-name {
  font-size: 16px;
  font-weight: 600;
  color: #fff;
}

.brand-slogan {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 0;
}

.brand-slogan h1 {
  margin: 0;
  font-size: 28px;
  font-weight: 600;
  line-height: 1.4;
  color: #fff;
  max-width: 420px;
}

.brand-slogan p {
  margin: 14px 0 0;
  font-size: 14px;
  line-height: 1.7;
  color: var(--mx-ink-text);
  max-width: 420px;
}

.brand-points {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.brand-points li {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: var(--mx-ink-text-strong);
}

.brand-points i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--mx-primary);
  flex-shrink: 0;
}

.brand-copy {
  margin: 24px 0 0;
  font-size: 11.5px;
  color: var(--mx-ink-text);
}

/* ---- 移动端品牌横条（<900px） ---- */
.mobile-brand {
  display: none;
}

/* ---- 右侧表单面板 ---- */
.form-panel {
  flex: 1;
  min-width: 0;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  overflow-y: auto;
}

.login-form {
  width: 360px;
  max-width: 100%;
}

.login-title h2 {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
  line-height: 1.3;
  color: var(--mx-text);
}

.login-title p {
  margin: 6px 0 24px;
  font-size: 14px;
  color: var(--mx-muted);
}

.login-switch {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 4px;
  padding: 4px;
  border: 1px solid var(--mx-border);
  border-radius: 10px;
  background: var(--mx-soft);
  margin-bottom: 22px;
}

.login-switch button {
  height: 34px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--mx-muted);
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
  transition: color .15s ease, background-color .15s ease;
}

.login-switch button.active {
  background: #fff;
  color: var(--mx-primary);
  box-shadow: var(--mx-shadow-soft);
}

:deep(.el-form-item__label) {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--mx-sub);
  line-height: 1.4;
  padding-bottom: 6px;
}

:deep(.el-input__wrapper) {
  border-radius: 10px;
}

.captcha-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 126px;
  gap: 10px;
  align-items: center;
  width: 100%;
}

.captcha-image {
  height: 40px;
  border: 1px solid var(--mx-border-strong);
  border-radius: 10px;
  background: var(--mx-soft);
  color: var(--mx-muted);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  overflow: hidden;
}

.captcha-image:disabled {
  cursor: wait;
  opacity: .72;
}

.captcha-image img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

.login-submit {
  width: 100%;
  height: 40px;
  margin-top: 4px;
  font-size: 14px;
  font-weight: 600;
  border-radius: 10px;
}

.login-submit:hover,
.login-submit:focus {
  background-color: var(--el-color-primary-dark-2);
  border-color: var(--el-color-primary-dark-2);
}

/* ---- 扫码登录 ---- */
.qr-login {
  text-align: center;
}

.qr-box {
  position: relative;
  width: 236px;
  height: 236px;
  margin: 0 auto;
  display: grid;
  place-items: center;
  border-radius: var(--mx-radius);
  border: 1px solid var(--mx-border);
  background: #fff;
  box-shadow: inset 0 0 0 8px var(--mx-soft);
}

.qr-box canvas {
  width: 220px;
  height: 220px;
}

.qr-mask {
  position: absolute;
  inset: 8px;
  display: grid;
  place-items: center;
  border-radius: 6px;
  background: rgba(255, 255, 255, .9);
  color: var(--mx-primary);
  font-weight: 600;
}

.qr-mask.success {
  color: var(--mx-green);
}

.qr-mask.danger {
  color: var(--mx-red);
}

.qr-status {
  margin: 16px 0 0;
}

.qr-status strong,
.qr-status span {
  display: block;
}

.qr-status strong {
  color: var(--mx-text);
  font-size: 15px;
  font-weight: 600;
}

.qr-status span {
  margin-top: 6px;
  color: var(--mx-muted);
  font-size: 13.5px;
  line-height: 1.55;
}

.qr-user {
  margin: 16px 0 0;
  padding: 12px;
  display: flex;
  align-items: center;
  gap: 12px;
  text-align: left;
  border-radius: var(--mx-radius);
  background: var(--mx-soft);
  border: 1px solid var(--mx-border);
}

.qr-user b {
  display: block;
  color: var(--mx-text);
  font-size: 14px;
}

.qr-user p {
  margin: 3px 0 0;
  color: var(--mx-muted);
  font-size: 12.5px;
}

.qr-actions {
  display: flex;
  justify-content: center;
  gap: 10px;
  margin-top: 18px;
}

.qr-note {
  margin: 14px 0 0;
  color: var(--mx-muted);
  line-height: 1.65;
  font-size: 12.5px;
}

/* ---- 底部说明 ---- */
.login-foot {
  margin-top: 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.login-foot-note {
  font-size: 12px;
  color: var(--mx-muted);
}

.setup-entry {
  font-size: 12px;
  color: var(--mx-muted);
  text-decoration: none;
  transition: color .15s ease;
}

.setup-entry:hover {
  color: var(--mx-primary);
}

/* ---- 响应式：<900px ---- */
@media (max-width: 899px) {
  .login-page {
    height: auto;
    min-height: 100vh;
    overflow: visible;
    flex-direction: column;
  }

  .brand-panel {
    display: none;
  }

  .mobile-brand {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 56px;
    padding: 0 16px;
    background: #fff;
    border-bottom: 1px solid var(--mx-border);
    flex-shrink: 0;
  }

  .mobile-brand-name {
    font-size: 14px;
    font-weight: 600;
    color: var(--mx-text);
  }

  .form-panel {
    flex: 1;
    align-items: flex-start;
    padding: 40px 20px;
  }
}
</style>
