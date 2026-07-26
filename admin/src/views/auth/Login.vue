<template>
  <div class="login-page">
    <section class="login-visual">
      <div class="visual-brand">
        <div class="brand-mark">校</div>
        <div>
          <h1>校园本地生活</h1>
          <p>Lingmeng Admin Console</p>
        </div>
      </div>

      <div class="visual-copy">
        <span>Operator Workspace</span>
        <strong>面向校园本地生活的真实运营后台</strong>
        <p>区域、内容、商家、商城、财务、通知与系统运维统一管理。</p>
      </div>

      <div class="visual-grid">
        <div><b>14</b><span>业务中心</span></div>
        <div><b>Real</b><span>真实数据</span></div>
        <div><b>24h</b><span>运营响应</span></div>
      </div>
    </section>

    <section class="login-panel">
      <div class="login-card">
        <div class="login-title">
          <span>Welcome back</span>
          <h2>登录运营后台</h2>
          <p>{{ mode === 'password' ? '请输入管理员账号继续处理平台业务。' : '使用已绑定管理员的小程序微信确认登录。' }}</p>
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

        <router-link class="setup-entry" to="/setup">首次部署？进入安装向导</router-link>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import QRCode from 'qrcode'
import { cancelAdminQrLogin, createAdminQrLogin, getAdminQrLoginStatus } from '@/api/admin'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()

const loading = ref(false)
const mode = ref<'password' | 'qr'>('password')
const form = reactive({ username: 'admin', password: '' })

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
  if (!form.username || !form.password) {
    ElMessage.warning('请输入账号和密码')
    return
  }
  loading.value = true
  try {
    await auth.login(form.username, form.password)
    ElMessage.success('登录成功')
    router.push('/dashboard')
  } finally {
    loading.value = false
  }
}

async function switchMode(nextMode: 'password' | 'qr') {
  mode.value = nextMode
  if (nextMode === 'qr') {
    await startQrLogin()
  } else {
    stopPolling(true)
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

async function copyTicket() {
  if (!qrTicket.value) {
    ElMessage.warning('请先生成二维码')
    return
  }
  await navigator.clipboard.writeText(qrTicket.value)
  ElMessage.success('Ticket 已复制，可用于开发工具手动测试')
}

onBeforeUnmount(() => stopPolling(true))
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: grid;
  grid-template-columns: minmax(420px, 1.1fr) minmax(420px, .9fr);
  background:
    radial-gradient(circle at 16% 20%, rgba(37, 99, 235, .13), transparent 34%),
    radial-gradient(circle at 78% 18%, rgba(14, 165, 233, .12), transparent 28%),
    #f5f7fb;
}

.login-visual {
  position: relative;
  min-height: 100vh;
  padding: 56px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  overflow: hidden;
}

.login-visual::before {
  content: "";
  position: absolute;
  inset: 28px;
  border: 1px solid rgba(37, 99, 235, .12);
  border-radius: 28px;
  pointer-events: none;
}

.visual-brand {
  display: flex;
  gap: 16px;
  align-items: center;
  position: relative;
  z-index: 1;
}

.brand-mark {
  width: 56px;
  height: 56px;
  border-radius: 16px;
  background: linear-gradient(135deg, #2563eb, #0ea5e9);
  display: grid;
  place-items: center;
  color: #fff;
  font-weight: 950;
  font-size: 24px;
  flex-shrink: 0;
  box-shadow: 0 16px 34px rgba(37, 99, 235, .18);
}

.visual-brand h1 {
  margin: 0;
  font-size: 24px;
  color: #172033;
  line-height: 1.15;
  font-weight: 950;
}

.visual-brand p {
  margin: 6px 0 0;
  color: #64748b;
  font-weight: 800;
  font-size: 13px;
}

.visual-copy {
  position: relative;
  z-index: 1;
  max-width: 620px;
}

.visual-copy span {
  display: inline-flex;
  padding: 7px 12px;
  border-radius: 999px;
  background: #fff;
  border: 1px solid #dce6f3;
  color: #2563eb;
  font-weight: 850;
  font-size: 13px;
  margin-bottom: 18px;
}

.visual-copy strong {
  display: block;
  font-size: clamp(36px, 5vw, 64px);
  line-height: 1.08;
  letter-spacing: 0;
  color: #111827;
  max-width: 720px;
}

.visual-copy p {
  margin: 18px 0 0;
  color: #64748b;
  font-size: 16px;
  line-height: 1.8;
  font-weight: 650;
}

.visual-grid {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  max-width: 620px;
}

.visual-grid div {
  padding: 18px;
  border-radius: 18px;
  background: rgba(255, 255, 255, .82);
  border: 1px solid #dce6f3;
  box-shadow: 0 12px 30px rgba(15, 23, 42, .055);
}

.visual-grid b {
  display: block;
  font-size: 24px;
  line-height: 1;
  color: #172033;
}

.visual-grid span {
  display: block;
  margin-top: 8px;
  color: #64748b;
  font-size: 13px;
  font-weight: 750;
}

.login-panel {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 42px;
}

.login-card {
  width: min(460px, 100%);
  padding: 34px;
  border-radius: 22px;
  background: #fff;
  border: 1px solid #e3e9f2;
  box-shadow: 0 18px 48px rgba(15, 23, 42, .09);
}

.login-title span {
  color: #2563eb;
  font-size: 13px;
  font-weight: 850;
}

.login-title h2 {
  margin: 8px 0 0;
  font-size: 28px;
  line-height: 1.2;
  color: #172033;
}

.login-title p {
  margin: 8px 0 22px;
  color: #64748b;
  font-weight: 650;
}

.login-switch {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  padding: 6px;
  border: 1px solid #e3e9f2;
  border-radius: 14px;
  background: #f7faff;
  margin-bottom: 22px;
}

.login-switch button {
  height: 38px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: #64748b;
  font-weight: 850;
  cursor: pointer;
}

.login-switch button.active {
  background: #fff;
  color: #2563eb;
  box-shadow: 0 8px 22px rgba(15, 23, 42, .08);
}

.login-submit {
  width: 100%;
  margin-top: 10px;
}

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
  border-radius: 20px;
  border: 1px solid #e3e9f2;
  background: #fff;
  box-shadow: inset 0 0 0 8px #f6f9ff;
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
  border-radius: 16px;
  background: rgba(255, 255, 255, .88);
  color: #2563eb;
  font-weight: 950;
}

.qr-mask.success {
  color: #059669;
}

.qr-mask.danger {
  color: #dc2626;
}

.qr-status {
  margin: 16px 0 0;
}

.qr-status strong,
.qr-status span {
  display: block;
}

.qr-status strong {
  color: #172033;
  font-size: 17px;
}

.qr-status span {
  margin-top: 6px;
  color: #64748b;
  font-size: 13px;
  line-height: 1.55;
}

.qr-user {
  margin: 16px 0 0;
  padding: 12px;
  display: flex;
  align-items: center;
  gap: 12px;
  text-align: left;
  border-radius: 16px;
  background: #f7faff;
  border: 1px solid #e3e9f2;
}

.qr-user b {
  display: block;
  color: #172033;
  font-size: 14px;
}

.qr-user p {
  margin: 3px 0 0;
  color: #64748b;
  font-size: 12px;
}

.qr-actions {
  display: flex;
  justify-content: center;
  gap: 10px;
  margin-top: 18px;
}

.qr-note {
  margin: 14px 0 0;
  color: #8794aa;
  line-height: 1.65;
  font-size: 12px;
}

.setup-entry {
  display: block;
  margin-top: 18px;
  text-align: center;
  color: #64748b;
  font-size: 13px;
  font-weight: 800;
  text-decoration: none;
}

.setup-entry:hover {
  color: #2563eb;
}

@media (max-width: 960px) {
  .login-page {
    grid-template-columns: 1fr;
  }

  .login-visual {
    display: none;
  }
}
</style>
