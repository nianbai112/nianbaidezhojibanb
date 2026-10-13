<template>
  <div class="page-container">
    <PageHeader title="朋友圈同步" subtitle="审核通过的帖子自动生成海报，每半小时合成一条朋友圈（最多 9 张，纯图片）发到运营微信号">
      <template #actions>
        <el-button @click="refreshAll">刷新</el-button>
      </template>
    </PageHeader>

    <!-- 运行情况 -->
    <div class="glass-card section">
      <div class="stats-row">
        <div class="stat-item">
          <div class="stat-value"><el-tag :type="overview.enabled ? 'success' : 'info'" size="large">{{ overview.enabled ? '已开启' : '未开启' }}</el-tag></div>
          <div class="stat-label">自动同步</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">
            <el-tag :type="onlineTagType" size="large">{{ onlineText }}</el-tag>
          </div>
          <div class="stat-label">运营微信号</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">{{ overview.queue?.pending ?? '-' }}</div>
          <div class="stat-label">待发帖子</div>
        </div>
        <div class="stat-item">
          <div class="stat-value" :class="{ warn: overview.queue?.batchesNeedAttention }">{{ overview.queue?.batchesNeedAttention ?? '-' }}</div>
          <div class="stat-label">需要人工处理的批次</div>
        </div>
      </div>
      <el-alert v-if="overview.missingConfig?.length" type="warning" :closable="false" show-icon class="mt12"
        :title="`还缺少：${overview.missingConfig.join('、')}`" description="按下面 ①②③ 的顺序填写并登录后，再打开自动同步开关。" />
      <el-alert v-if="overview.state?.paused" type="error" :closable="false" show-icon class="mt12" :title="`已暂停：${overview.state?.pauseReason || ''}`">
        <template #default>
          <el-button size="small" type="danger" plain class="mt8" @click="resumeQueue">我已处理，解除暂停</el-button>
        </template>
      </el-alert>
      <div class="run-row">
        <span class="muted">{{ overview.schedule }}</span>
        <span v-if="overview.state?.lastRunAt" class="muted">上次执行：<TimeText :time="overview.state.lastRunAt" format="full" /> · {{ overview.state?.lastResult }}</span>
        <el-button type="primary" :loading="running" @click="runNow">立即执行一次</el-button>
      </div>
    </div>

    <!-- ① 接入配置 -->
    <div class="glass-card section">
      <h3>① 接入配置</h3>
      <p class="hint">在 wxbot 控制台复制 app_key、app_secret、webhook_secret 填到这里。密钥保存后只显示后四位，留空表示不修改。</p>
      <el-form :model="form" label-width="130px" class="config-form">
        <el-form-item label="自动同步">
          <el-switch v-model="form.enabled" active-text="开启" inactive-text="关闭" />
        </el-form-item>
        <el-form-item label="网关地址" required>
          <el-input v-model="form.baseUrl" placeholder="wxbot 控制台的域名，如 https://bot.lichaoshuai.cc" clearable />
        </el-form-item>
        <el-form-item label="app_key" required>
          <el-input v-model="form.appKey" placeholder="控制台里的 app_key" clearable />
        </el-form-item>
        <el-form-item label="app_secret" required>
          <el-input v-model="form.appSecret" type="password" show-password :placeholder="settings.hasAppSecret ? '已保存，留空不修改' : '控制台里的 app_secret'" />
        </el-form-item>
        <el-form-item label="device_id">
          <el-input v-model="form.deviceId" placeholder="在 wxbot 控制台「新建设备」后复制过来；也可以在下面 ② 里直接创建" clearable />
        </el-form-item>
        <el-form-item label="webhook_secret">
          <el-input v-model="form.webhookSecret" type="password" show-password :placeholder="settings.hasWebhookSecret ? '已保存，留空不修改' : '用于设备状态和聊天消息回调验签'" />
        </el-form-item>
        <el-form-item label="海报品牌名">
          <el-input v-model="form.brandName" placeholder="海报底部显示的名字，如 校小伴；留空用学校名" clearable />
        </el-form-item>
        <el-form-item label="图片服务地址">
          <el-input v-model="form.cdnBaseUrl" placeholder="留空 = 使用网关地址" clearable />
          <div class="field-hint">朋友圈图片要先传到微信的图片服务器（wxcdnd）。保存并扫码登录后点「测试图片上传」，能通过就不用管这一项；提示 404 再向 wxbot 要图片服务地址。</div>
          <el-button size="small" class="mt8" :disabled="!settings.deviceId" :loading="testingUpload" @click="testUpload">测试图片上传（不发朋友圈）</el-button>
        </el-form-item>
        <el-collapse class="advanced">
          <el-collapse-item title="高级设置（一般不用填）" name="adv">
            <el-form-item label="图片服务 Token">
              <el-input v-model="form.cdnToken" type="password" show-password placeholder="自建 wxcdnd 设置了 Token 时填写" />
            </el-form-item>
            <el-form-item label="小程序码归属用户ID">
              <el-input v-model="form.sharerUserId" placeholder="留空 = 记在帖子作者名下" clearable />
            </el-form-item>
          </el-collapse-item>
        </el-collapse>
        <el-form-item>
          <el-button type="primary" :loading="saving" @click="saveSettings">保存配置</el-button>
        </el-form-item>
      </el-form>
    </div>

    <!-- ② 微信号登录 -->
    <div class="glass-card section">
      <h3>② 运营微信号登录</h3>
      <p class="hint">先创建一台“设备”，再用运营微信号扫码登录。同一个微信号不要同时在别的 iPad / 电脑客户端登录，否则会互相挤下线。</p>
      <div class="device-row">
        <span>设备ID：</span>
        <el-tag v-if="settings.deviceId" type="success">{{ settings.deviceId }}</el-tag>
        <el-tag v-else type="info">未创建</el-tag>
      </div>
      <div class="btn-row">
        <el-button :loading="creatingDevice" @click="createDevice">{{ settings.deviceId ? '重新创建设备' : '创建设备' }}</el-button>
        <el-button type="primary" :disabled="!settings.deviceId" @click="openQr">扫码登录</el-button>
        <el-button :disabled="!settings.deviceId" :loading="pushing" @click="loginPush">推送到手机确认（免扫码）</el-button>
        <el-button :disabled="!settings.deviceId" :loading="checking" @click="checkStatus()">查询登录状态</el-button>
      </div>
      <div v-if="loginSnapshot" class="snapshot">
        <div class="snapshot-summary">{{ snapshotSummary }}</div>
        <el-collapse>
          <el-collapse-item title="协议返回的原始状态" name="raw"><pre>{{ prettySnapshot }}</pre></el-collapse-item>
        </el-collapse>
      </div>
      <el-collapse class="advanced">
        <el-collapse-item title="新设备登录要求滑块验证时" name="verify">
          <p class="hint">按协议提示完成滑块验证后，把得到的 ticket 粘贴到这里提交。</p>
          <div class="btn-row">
            <el-input v-model="ticket" placeholder="ticket" style="max-width: 420px" />
            <el-button :disabled="!ticket" @click="submitTicket">提交</el-button>
          </div>
        </el-collapse-item>
      </el-collapse>
    </div>

    <!-- ③ 掉线提醒 -->
    <div class="glass-card section">
      <h3>③ 设备状态与聊天消息回调</h3>
      <p class="hint">把下面的地址复制到 wxbot 控制台「设备」页的「全局回调地址」并保存，同时在 ① 里填好 webhook_secret。此回调同时接收设备状态和聊天消息。微信号掉线会自动暂停发布，重新登录上线后自动恢复；聊天回复需到「微信 AI 聊天」单独配置。</p>
      <div class="btn-row">
        <el-input v-model="callbackUrl" style="max-width: 520px" />
        <el-button type="primary" @click="copyCallbackUrl">复制地址</el-button>
        <el-button :disabled="!settings.deviceId" :loading="settingCallback" link @click="registerCallback">或：只给当前设备登记</el-button>
        <el-button :disabled="!settings.deviceId" link @click="resumeCallback">回调被协议暂停时点这里恢复</el-button>
      </div>
    </div>

    <!-- 批次记录 -->
    <div class="glass-card section" style="padding-bottom: 8px">
      <h3>发布记录</h3>
      <el-table :data="batches" v-loading="loadingBatches" row-key="id" border stripe>
        <el-table-column type="expand">
          <template #default="{ row }">
            <div class="poster-grid">
              <div v-for="item in row.items" :key="item.id" class="poster-cell">
                <el-image preview-teleported v-if="item.posterUrl" :src="item.posterUrl" :preview-src-list="row.items.filter((i: any) => i.posterUrl).map((i: any) => i.posterUrl)" fit="cover" class="poster-thumb" />
                <div v-else class="poster-thumb empty">无存档</div>
                <div class="poster-title">{{ postTitle(item.post) }}</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="时间" width="170">
          <template #default="{ row }"><TimeText :time="row.createdAt" format="full" /></template>
        </el-table-column>
        <el-table-column label="状态" width="120">
          <template #default="{ row }"><el-tag :type="statusMeta(row.status).type">{{ statusMeta(row.status).label }}</el-tag></template>
        </el-table-column>
        <el-table-column prop="imageCount" label="图片数" width="80" />
        <el-table-column label="来源" width="80">
          <template #default="{ row }">{{ row.source === 'manual' ? '手动' : '定时' }}</template>
        </el-table-column>
        <el-table-column prop="error" label="说明" min-width="260" show-overflow-tooltip />
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <template v-if="['unknown', 'partial'].includes(row.status)">
              <el-button size="small" link type="success" @click="confirmBatch(row)">确认已发出</el-button>
              <el-button size="small" link type="warning" @click="requeueBatch(row)">没发出，重新排队</el-button>
            </template>
          </template>
        </el-table-column>
      </el-table>
      <div class="table-footer">
        <el-pagination v-model:current-page="page" :page-size="pageSize" :total="total" layout="total, prev, pager, next" @current-change="loadBatches" />
      </div>
    </div>

    <!-- 海报预览 -->
    <div class="glass-card section">
      <h3>海报预览</h3>
      <p class="hint">输入帖子 ID 预览它的朋友圈海报（只生成，不发布）。</p>
      <div class="btn-row">
        <el-input v-model="previewPostId" placeholder="帖子 ID" style="max-width: 320px" clearable />
        <el-button :disabled="!previewPostId" :loading="previewing" @click="previewPoster">生成预览</el-button>
      </div>
      <el-image preview-teleported v-if="previewUrl" :src="previewUrl" :preview-src-list="[previewUrl]" class="preview-img" fit="contain" />
    </div>

    <el-dialog v-model="qrVisible" title="用运营微信号扫码登录" width="420px" @closed="stopPolling">
      <div class="qr-box" v-loading="qrLoading">
        <img v-if="qrSrc" :src="qrSrc" alt="登录二维码" />
        <p class="hint">{{ qrHint }}</p>
        <div v-if="loginSnapshot" class="snapshot-summary">{{ snapshotSummary }}</div>
      </div>
      <template #footer>
        <el-button @click="loadQr">刷新二维码</el-button>
        <el-button type="primary" @click="qrVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { request } from '@/api/request'
import PageHeader from '@/components/common/PageHeader.vue'
import TimeText from '@/components/common/TimeText.vue'

const BASE = '/admin/wechat-moments'

const overview = ref<any>({})
const settings = ref<any>({})
const form = reactive({
  enabled: false,
  baseUrl: '',
  appKey: '',
  appSecret: '',
  webhookSecret: '',
  cdnBaseUrl: '',
  cdnToken: '',
  sharerUserId: '',
  deviceId: '',
  brandName: '',
})
const saving = ref(false)
const running = ref(false)
const creatingDevice = ref(false)
const pushing = ref(false)
const checking = ref(false)
const settingCallback = ref(false)
const testingUpload = ref(false)
const ticket = ref('')
const loginSnapshot = ref<any>(null)

const batches = ref<any[]>([])
const loadingBatches = ref(false)
const page = ref(1)
const pageSize = 10
const total = ref(0)

const previewPostId = ref('')
const previewUrl = ref('')
const previewing = ref(false)

const qrVisible = ref(false)
const qrLoading = ref(false)
const qrSrc = ref('')
const qrHint = ref('')
let pollTimer: ReturnType<typeof setInterval> | null = null
let pollStartedAt = 0

function defaultCallbackUrl() {
  const base = String(import.meta.env.VITE_API_BASE_URL || '/api')
  let origin = window.location.origin
  try {
    if (/^https?:\/\//i.test(base)) origin = new URL(base).origin
  } catch {
    // keep window origin
  }
  return `${origin}/api/wechat-moments/webhook`
}
const callbackUrl = ref(defaultCallbackUrl())

const onlineText = computed(() => {
  if (!settings.value.deviceId) return '未登录'
  if (overview.value.online === true) return '在线'
  if (overview.value.online === false) return '已掉线'
  return '未知（可点“查询登录状态”）'
})
const onlineTagType = computed(() => (overview.value.online === true ? 'success' : overview.value.online === false ? 'danger' : 'info'))

const prettySnapshot = computed(() => JSON.stringify(loginSnapshot.value, null, 2))
/** 协议返回的登录状态字段名不固定，这里尽量挑出能看懂的几项 */
const snapshotSummary = computed(() => {
  const s = loginSnapshot.value
  if (!s || typeof s !== 'object') return ''
  const flat: Record<string, any> = {}
  const walk = (obj: any, depth = 0) => {
    if (!obj || typeof obj !== 'object' || depth > 2) return
    for (const [k, v] of Object.entries(obj)) {
      if (v && typeof v === 'object') walk(v, depth + 1)
      else if (!(k in flat)) flat[k] = v
    }
  }
  walk(s)
  const parts: string[] = []
  const pick = (keys: string[], label: string) => {
    const key = keys.find((k) => flat[k] !== undefined && flat[k] !== '')
    if (key) parts.push(`${label}：${flat[key]}`)
  }
  pick(['state', 'status', 'login_state', 'loginStatus', 'stage'], '状态')
  pick(['logged_in', 'online', 'is_login', 'isLogin'], '已登录')
  pick(['nickname', 'nick_name', 'nickName'], '昵称')
  pick(['wxid', 'username', 'user_name'], '微信ID')
  pick(['message', 'msg', 'errmsg', 'tip'], '提示')
  return parts.join('　') || '已获取状态，详见下方原始返回'
})

function statusMeta(status: string) {
  const map: Record<string, { label: string; type: any }> = {
    posted: { label: '已发出', type: 'success' },
    failed: { label: '失败（已退回队列）', type: 'danger' },
    unknown: { label: '结果未知', type: 'warning' },
    partial: { label: '只发出部分', type: 'warning' },
    uploading: { label: '上传中', type: 'info' },
    posting: { label: '发布中', type: 'info' },
  }
  return map[status] || { label: status, type: 'info' }
}

function postTitle(post: any) {
  const text = String(post?.title || post?.content || '').trim()
  return text.length > 18 ? `${text.slice(0, 18)}…` : text || '（无标题）'
}

async function loadOverview() {
  try {
    overview.value = (await request.get(`${BASE}/status`, { skipGetDeduplication: true })) || {}
  } catch {
    // 错误已提示
  }
}

async function loadSettings() {
  try {
    const res: any = await request.get(`${BASE}/settings`, { skipGetDeduplication: true })
    applySettings(res)
  } catch {
    // 没有系统配置权限时只看运行情况
  }
}

function applySettings(res: any) {
  settings.value = res || {}
  Object.assign(form, {
    enabled: !!res?.enabled,
    baseUrl: res?.baseUrl || '',
    appKey: res?.appKey || '',
    appSecret: '',
    webhookSecret: '',
    cdnBaseUrl: res?.cdnBaseUrl || '',
    cdnToken: '',
    sharerUserId: res?.sharerUserId || '',
    deviceId: res?.deviceId || '',
    brandName: res?.brandName || '',
  })
}

async function loadBatches() {
  loadingBatches.value = true
  try {
    const res: any = await request.get(`${BASE}/batches`, { params: { page: page.value, pageSize }, skipGetDeduplication: true })
    batches.value = res?.list || []
    total.value = res?.total || 0
  } catch {
    batches.value = []
  } finally {
    loadingBatches.value = false
  }
}

function refreshAll() {
  loadOverview()
  loadSettings()
  loadBatches()
}

async function saveSettings() {
  if (form.enabled && (!form.baseUrl || !form.appKey || (!form.appSecret && !settings.value.hasAppSecret))) {
    ElMessage.warning('开启前请先填写网关地址、app_key、app_secret')
    return
  }
  saving.value = true
  try {
    const res: any = await request.put(`${BASE}/settings`, { ...form })
    applySettings(res)
    ElMessage.success('已保存')
    loadOverview()
  } finally {
    saving.value = false
  }
}

async function createDevice() {
  if (settings.value.deviceId) {
    await ElMessageBox.confirm('重新创建后，需要用微信号重新扫码登录，旧设备不再使用。确定吗？', '重新创建设备', { type: 'warning' })
  }
  creatingDevice.value = true
  try {
    const res: any = await request.post(`${BASE}/device/init`, {})
    ElMessage.success(`设备已创建：${res?.deviceId || ''}`)
    await loadSettings()
    loadOverview()
  } finally {
    creatingDevice.value = false
  }
}

async function checkStatus(silent = false) {
  if (!silent) checking.value = true
  try {
    loginSnapshot.value = await request.get(`${BASE}/login/status`, { skipGetDeduplication: true })
    return loginSnapshot.value
  } catch {
    return null
  } finally {
    checking.value = false
  }
}

async function loadQr() {
  qrLoading.value = true
  qrHint.value = ''
  try {
    const blob: any = await request.get(`${BASE}/login/qr`, { responseType: 'blob', skipGetDeduplication: true, timeout: 30000 })
    if (qrSrc.value.startsWith('blob:')) URL.revokeObjectURL(qrSrc.value)
    if (blob?.type?.includes('json')) {
      const json = JSON.parse(await blob.text())
      const data = json?.data ?? json
      if (data?.imageUrl) qrSrc.value = data.imageUrl
      else throw new Error(json?.message || '没有拿到二维码')
    } else {
      qrSrc.value = URL.createObjectURL(blob)
    }
    qrHint.value = '请用运营微信号扫码，并在手机上确认登录'
    startPolling()
  } catch (e: any) {
    let message = e?.message || '获取二维码失败'
    const data = e?.response?.data
    if (data instanceof Blob) {
      try { message = JSON.parse(await data.text())?.message || message } catch { /* ignore */ }
    }
    qrHint.value = message
  } finally {
    qrLoading.value = false
  }
}

function openQr() {
  qrVisible.value = true
  qrSrc.value = ''
  loadQr()
}

function startPolling() {
  stopPolling()
  pollStartedAt = Date.now()
  pollTimer = setInterval(async () => {
    if (Date.now() - pollStartedAt > 5 * 60 * 1000) {
      stopPolling()
      qrHint.value = '二维码可能已过期，请点“刷新二维码”'
      return
    }
    await checkStatus(true)
  }, 3000)
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = null
  loadOverview()
}

async function loginPush() {
  pushing.value = true
  try {
    loginSnapshot.value = await request.post(`${BASE}/login/push`, {})
    ElMessage.success('已推送，请在手机微信上确认登录')
  } finally {
    pushing.value = false
  }
}

async function submitTicket() {
  loginSnapshot.value = await request.post(`${BASE}/login/verify`, { ticket: ticket.value })
  ElMessage.success('已提交')
}

async function registerCallback() {
  if (!settings.value.hasWebhookSecret) {
    ElMessage.warning('请先在 ① 里填写 webhook_secret 并保存')
    return
  }
  settingCallback.value = true
  try {
    await request.post(`${BASE}/callback`, { callbackUrl: callbackUrl.value })
    ElMessage.success('回调地址已登记')
  } finally {
    settingCallback.value = false
  }
}

async function testUpload() {
  testingUpload.value = true
  try {
    await request.post(`${BASE}/cdn/test`, {}, { timeout: 60000 })
    ElMessage.success('图片上传正常，可以发朋友圈了')
  } finally {
    testingUpload.value = false
  }
}

async function copyCallbackUrl() {
  try {
    await navigator.clipboard.writeText(callbackUrl.value)
    ElMessage.success('已复制，去 wxbot 控制台粘贴到「全局回调地址」并保存')
  } catch {
    ElMessage.warning('复制失败，请手动选中复制')
  }
}

async function resumeCallback() {
  await request.post(`${BASE}/callback/resume`, {})
  ElMessage.success('已恢复')
}

async function runNow() {
  running.value = true
  try {
    const res: any = await request.post(`${BASE}/run`, {})
    const labels: Record<string, string> = {
      disabled: '自动同步未开启',
      misconfigured: '配置不完整',
      paused: '已暂停',
      locked: '上一次任务还在执行',
      idle: '没有待发的帖子',
      no_ready_posts: '海报都没生成成功',
      posted: '已发出',
      partial: '只发出了一部分',
      failed: '发布失败',
      unknown: '结果未知，请到微信里核对',
    }
    const text = `${labels[res?.status] || res?.status}${res?.message ? `：${res.message}` : ''}`
    res?.status === 'posted' ? ElMessage.success(text) : ElMessage.warning(text)
    refreshAll()
  } finally {
    running.value = false
  }
}

async function resumeQueue() {
  await request.post(`${BASE}/resume`, {})
  ElMessage.success('已解除暂停')
  loadOverview()
}

async function confirmBatch(row: any) {
  await ElMessageBox.confirm('确认这条朋友圈已经在微信里发出了？这些帖子之后不会再发。', '确认已发出', { type: 'warning' })
  await request.post(`${BASE}/batches/${row.id}/confirm`, {})
  ElMessage.success('已确认')
  refreshAll()
}

async function requeueBatch(row: any) {
  await ElMessageBox.confirm('确认这条朋友圈没有发出？这些帖子会在下一个半点重新发布。', '重新排队', { type: 'warning' })
  await request.post(`${BASE}/batches/${row.id}/requeue`, {})
  ElMessage.success('已重新排队（记得解除暂停）')
  refreshAll()
}

async function previewPoster() {
  previewing.value = true
  try {
    const blob: any = await request.get(`${BASE}/preview/${encodeURIComponent(previewPostId.value.trim())}`, { responseType: 'blob', skipGetDeduplication: true, timeout: 60000 })
    if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = URL.createObjectURL(blob)
  } finally {
    previewing.value = false
  }
}

onMounted(refreshAll)
onBeforeUnmount(() => {
  if (pollTimer) clearInterval(pollTimer)
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  if (qrSrc.value.startsWith('blob:')) URL.revokeObjectURL(qrSrc.value)
})
</script>

<style scoped>
.page-container { padding: 24px; }
.glass-card { background: rgba(255,255,255,0.8); backdrop-filter: blur(10px); border-radius: 14px; border: 1px solid rgba(255,255,255,0.8); }
.section { padding: 20px 24px; margin-top: 16px; }
.section h3 { margin: 0 0 6px; font-size: 16px; color: #1e293b; }
.hint { margin: 0 0 14px; font-size: 13px; color: #64748b; line-height: 1.6; }
.muted { font-size: 13px; color: #64748b; }
.mt8 { margin-top: 8px; }
.mt12 { margin-top: 12px; }
.stats-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
.stat-item { text-align: center; }
.stat-value { font-size: 24px; font-weight: 700; color: #1e293b; min-height: 36px; display: flex; align-items: center; justify-content: center; }
.stat-value.warn { color: #d97706; }
.stat-label { font-size: 13px; color: #64748b; margin-top: 4px; }
.run-row { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; margin-top: 16px; }
.run-row .el-button { margin-left: auto; }
.config-form { max-width: 680px; }
.field-hint { font-size: 12px; color: #94a3b8; line-height: 1.5; margin-top: 4px; }
.advanced { margin: 4px 0 12px; border: none; }
.device-row { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; font-size: 14px; }
.btn-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.snapshot { margin-top: 14px; }
.snapshot-summary { font-size: 13px; color: #334155; background: #f1f5f9; border-radius: 8px; padding: 8px 12px; margin-bottom: 8px; }
.snapshot pre { max-height: 260px; overflow: auto; font-size: 12px; background: #0f172a; color: #e2e8f0; padding: 12px; border-radius: 8px; }
.poster-grid { display: flex; flex-wrap: wrap; gap: 12px; padding: 8px 16px; }
.poster-cell { width: 96px; }
.poster-thumb { width: 96px; height: 171px; border-radius: 8px; background: #f1f5f9; }
.poster-thumb.empty { display: flex; align-items: center; justify-content: center; font-size: 12px; color: #94a3b8; }
.poster-title { font-size: 12px; color: #475569; margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.table-footer { padding: 12px 0; display: flex; justify-content: flex-end; }
.preview-img { width: 260px; margin-top: 14px; border-radius: 10px; box-shadow: 0 4px 16px rgba(15, 23, 42, 0.12); }
.qr-box { text-align: center; min-height: 260px; }
.qr-box img { width: 260px; height: 260px; object-fit: contain; }
@media (max-width: 900px) { .stats-row { grid-template-columns: repeat(2, 1fr); } }
</style>
