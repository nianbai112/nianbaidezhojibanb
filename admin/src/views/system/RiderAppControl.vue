<template>
  <div class="page-shell" v-loading="loading">
    <PageHeader title="骑手 App 控制中心" subtitle="控制骑手端运行状态、版本发布、功能入口和骑手在线情况">
      <template #actions>
        <el-button @click="loadConfig">刷新</el-button>
        <el-button type="primary" :loading="saving" @click="saveConfig">保存配置</el-button>
      </template>
    </PageHeader>

    <el-alert
      title="这里控制 App 运行能力；骑手审核、订单调度和结算继续在原业务菜单处理。"
      type="info"
      :closable="false"
      show-icon
    />

    <div class="config-grid">
      <el-card shadow="never">
        <template #header><span class="card-title">运行状态</span></template>
        <el-form label-position="top">
          <el-form-item label="App 总开关">
            <el-switch v-model="form.enabled" active-text="允许使用" inactive-text="停止服务" />
          </el-form-item>
          <el-form-item label="维护模式">
            <el-switch v-model="form.maintenance.enabled" active-text="维护中" inactive-text="正常运行" />
          </el-form-item>
          <el-form-item label="维护标题">
            <el-input v-model="form.maintenance.title" maxlength="40" show-word-limit />
          </el-form-item>
          <el-form-item label="维护说明">
            <el-input v-model="form.maintenance.message" type="textarea" :rows="3" maxlength="200" show-word-limit />
          </el-form-item>
        </el-form>
      </el-card>

      <el-card shadow="never">
        <template #header><span class="card-title">版本发布</span></template>
        <el-form label-position="top">
          <div class="two-cols">
            <el-form-item label="最新版本">
              <el-input v-model="form.version.latest" placeholder="1.0.0" />
            </el-form-item>
            <el-form-item label="最低可用版本">
              <el-input v-model="form.version.minimum" placeholder="1.0.0" />
            </el-form-item>
          </div>
          <el-form-item label="强制更新">
            <el-switch v-model="form.version.forceUpdate" active-text="强制" inactive-text="可跳过" />
          </el-form-item>
          <el-form-item label="更新说明">
            <el-input v-model="form.version.releaseNotes" type="textarea" :rows="3" maxlength="500" show-word-limit />
          </el-form-item>
          <el-form-item label="iOS 下载地址">
            <el-input v-model="form.version.iosDownloadUrl" placeholder="https://..." />
          </el-form-item>
          <el-form-item label="Android 下载地址">
            <el-input v-model="form.version.androidDownloadUrl" placeholder="https://..." />
          </el-form-item>
        </el-form>
      </el-card>

      <el-card shadow="never">
        <template #header><span class="card-title">功能开关与公告</span></template>
        <div class="switch-list">
          <div v-for="item in featureItems" :key="item.key" class="switch-row">
            <div>
              <div class="switch-title">{{ item.title }}</div>
              <div class="switch-desc">{{ item.desc }}</div>
            </div>
            <el-switch v-model="form.features[item.key]" />
          </div>
        </div>
        <el-divider />
        <el-form label-position="top">
          <el-form-item label="App 公告">
            <el-switch v-model="form.notice.enabled" active-text="显示" inactive-text="隐藏" />
          </el-form-item>
          <el-form-item label="公告标题">
            <el-input v-model="form.notice.title" maxlength="40" show-word-limit />
          </el-form-item>
          <el-form-item label="公告内容">
            <el-input v-model="form.notice.content" type="textarea" :rows="3" maxlength="300" show-word-limit />
          </el-form-item>
        </el-form>
      </el-card>

      <el-card shadow="never" class="rider-session-card">
        <template #header>
          <div class="session-header">
            <div>
              <span class="card-title">骑手 App 登录状态</span>
              <span class="session-summary">在线 {{ riderOnlineCount }} 人 · 已记录 {{ riderSessions.length }} 人</span>
            </div>
            <el-button :loading="riderSessionLoading" @click="loadRiderSessions(true)">刷新</el-button>
          </div>
        </template>
        <el-alert
          title="只统计审核通过的官方骑手 App 连接；90 秒无心跳自动判定离线。"
          type="info"
          :closable="false"
          show-icon
          class="session-alert"
        />
        <el-table :data="riderSessions" v-loading="riderSessionLoading" stripe empty-text="暂时没有骑手 App 登录记录">
          <el-table-column label="骑手" min-width="180">
            <template #default="{ row }">
              <div class="rider-cell">
                <el-avatar :size="34" :src="row.actor?.avatar">{{ (row.actor?.name || '?').slice(0, 1) }}</el-avatar>
                <div>
                  <div class="rider-name">{{ row.actor?.name || '未命名骑手' }}</div>
                  <div class="rider-subtitle">{{ row.actor?.subtitle || '-' }}</div>
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="App 状态" width="95">
            <template #default="{ row }">
              <el-tag :type="row.appOnline ? 'success' : 'info'" effect="plain">
                {{ row.appOnline ? '在线' : '离线' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="接单状态" width="100">
            <template #default="{ row }">{{ riderBusinessStatus(row.rider?.status) }}</template>
          </el-table-column>
          <el-table-column label="所属区域" min-width="130">
            <template #default="{ row }">{{ row.rider?.regionName || '-' }}</template>
          </el-table-column>
          <el-table-column label="最后活跃" width="175">
            <template #default="{ row }">{{ formatTime(row.lastSeenAt) }}</template>
          </el-table-column>
          <el-table-column label="最近登录" width="175">
            <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
          </el-table-column>
          <el-table-column prop="ip" label="IP" width="140" show-overflow-tooltip />
          <el-table-column prop="userAgent" label="设备" min-width="220" show-overflow-tooltip />
        </el-table>
      </el-card>

      <el-card shadow="never" class="credential-card" v-loading="credentialLoading">
        <template #header>
          <div class="session-header">
            <div>
              <span class="card-title">隐藏测试登录</span>
              <span class="session-summary">仅限官方骑手 App 的测试入口</span>
            </div>
            <el-button :loading="credentialLoading" @click="loadCredential">刷新</el-button>
          </div>
        </template>
        <el-alert
          title="此账号拥有完整官方骑手 App 权限；请只用于受控测试，妥善保管并在测试结束后停用。"
          type="warning"
          :closable="false"
          show-icon
          class="session-alert"
        />
        <el-form label-position="top">
          <div class="two-cols">
            <el-form-item label="启用测试登录">
              <el-switch v-model="credentialForm.enabled" active-text="允许登录" inactive-text="停用" />
            </el-form-item>
            <el-form-item label="失效时间（可选）">
              <el-date-picker
                v-model="credentialForm.expiresAt"
                type="datetime"
                value-format="YYYY-MM-DDTHH:mm:ss.SSSZ"
                placeholder="不设置则长期有效"
                clearable
                style="width: 100%"
              />
            </el-form-item>
          </div>
          <el-form-item label="绑定官方骑手">
            <el-select
              v-model="credentialForm.userId"
              filterable
              remote
              reserve-keyword
              :remote-method="searchCredentialRiders"
              :loading="credentialRiderLoading"
              placeholder="搜索姓名、昵称或手机号"
              style="width: 100%"
            >
              <el-option v-for="item in credentialRiderOptions" :key="item.userId" :value="item.userId" :label="credentialRiderLabel(item)">
                <span>{{ item.nickname || item.realName || '未命名骑手' }}</span>
                <small class="option-meta">{{ item.phone || '未留手机号' }} · {{ item.regionName || '未分配区域' }}</small>
              </el-option>
            </el-select>
          </el-form-item>
          <div class="two-cols">
            <el-form-item label="登录账号">
              <el-input v-model="credentialForm.username" autocomplete="off" maxlength="40" placeholder="4-40 位字母、数字或 ._-" />
            </el-form-item>
            <el-form-item :label="credential.configured ? '登录密码（留空表示不修改）' : '登录密码'">
              <el-input v-model="credentialForm.password" type="password" show-password autocomplete="new-password" placeholder="10-64 位，需同时包含字母和数字" />
            </el-form-item>
          </div>
        </el-form>
        <el-descriptions :column="2" border class="credential-status">
          <el-descriptions-item label="绑定骑手">{{ credentialRiderSummary }}</el-descriptions-item>
          <el-descriptions-item label="所属区域">{{ credential.region?.name || '-' }}</el-descriptions-item>
          <el-descriptions-item label="最近登录">{{ formatTime(credential.lastLoginAt) }}</el-descriptions-item>
          <el-descriptions-item label="失败次数">{{ credential.failedAttempts || 0 }}</el-descriptions-item>
          <el-descriptions-item label="锁定至">{{ formatTime(credential.lockedUntil) }}</el-descriptions-item>
          <el-descriptions-item label="登录 IP">{{ credential.lastLoginIp || '-' }}</el-descriptions-item>
        </el-descriptions>
        <div class="credential-actions">
          <el-button type="primary" :loading="credentialSaving" @click="saveCredential">保存测试账号</el-button>
          <el-button :disabled="!credential.configured" :loading="credentialSaving" @click="resetCredentialLock">解除锁定</el-button>
        </div>
      </el-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageHeader from '@/components/common/PageHeader.vue'
import { request } from '@/api/request'
import { buildRiderPasswordCredentialPayload, mapRiderPasswordCredential } from './riderPasswordCredentialModel.mjs'

type FeatureKey = 'orderPool' | 'chat' | 'income' | 'incentives'
type CredentialRiderOption = {
  userId: string
  nickname: string
  realName: string
  phone: string
  regionId: string
  regionName: string
}

const defaults = () => ({
  enabled: true,
  maintenance: { enabled: false, title: '系统维护中', message: '骑手 App 正在维护，请稍后再试。' },
  version: {
    latest: '1.0.0', minimum: '1.0.0', forceUpdate: false, releaseNotes: '',
    iosDownloadUrl: '', androidDownloadUrl: ''
  },
  notice: { enabled: false, title: '', content: '' },
  runtime: {
    wsPath: '/api/ws-native', locationIntervalSeconds: 30, backgroundLocationEnabled: true,
    locationQueueMaxPoints: 300, locationBatchSize: 50, locationMaxAgeHours: 24
  },
  features: { orderPool: true, chat: true, income: true, incentives: true } as Record<FeatureKey, boolean>
})

const form = reactive(defaults())
const saved = ref(defaults())
const loading = ref(false)
const saving = ref(false)
const riderSessionLoading = ref(false)
const riderSessions = ref<any[]>([])
const riderOnlineCount = ref(0)
const credentialLoading = ref(false)
const credentialSaving = ref(false)
const credentialRiderLoading = ref(false)
const credentialRiderOptions = ref<CredentialRiderOption[]>([])
const credential = reactive(mapRiderPasswordCredential())
const credentialForm = reactive({ username: '', password: '', userId: '', enabled: true, expiresAt: '' })
let riderSessionTimer: number | undefined
const featureItems: Array<{ key: FeatureKey; title: string; desc: string }> = [
  { key: 'orderPool', title: '订单大厅', desc: '控制订单池展示与接单入口' },
  { key: 'chat', title: '骑手聊天', desc: '控制消息列表和聊天入口' },
  { key: 'income', title: '收入信息', desc: '控制余额与收入卡片' },
  { key: 'incentives', title: '奖励活动', desc: '控制奖励记录入口' }
]

function assignConfig(value: any) {
  const next = defaults()
  Object.assign(next, value || {})
  Object.assign(next.maintenance, value?.maintenance || {})
  Object.assign(next.version, value?.version || {})
  Object.assign(next.notice, value?.notice || {})
  Object.assign(next.runtime, value?.runtime || {})
  Object.assign(next.features, value?.features || {})
  Object.assign(form, next)
  saved.value = JSON.parse(JSON.stringify(next))
}

async function loadConfig() {
  loading.value = true
  try {
    const response: any = await request.get('/admin/rider-app/config')
    assignConfig(response?.data || response)
  } finally {
    loading.value = false
  }
}

function validate() {
  const versionPattern = /^\d+\.\d+\.\d+$/
  if (!versionPattern.test(form.version.latest) || !versionPattern.test(form.version.minimum)) {
    throw new Error('版本号必须使用 x.y.z 格式')
  }
  for (const [label, url] of [['iOS', form.version.iosDownloadUrl], ['Android', form.version.androidDownloadUrl]]) {
    if (url && !/^https:\/\//i.test(url)) throw new Error(`${label} 下载地址必须使用 HTTPS`)
  }
  if (!form.runtime.wsPath.startsWith('/') || form.runtime.wsPath.startsWith('//') || form.runtime.wsPath.includes('://')) {
    throw new Error('WebSocket 必须填写站内相对路径')
  }
  if (form.runtime.locationQueueMaxPoints < 50 || form.runtime.locationQueueMaxPoints > 1000) {
    throw new Error('本地轨迹队列上限必须为 50 至 1000 点')
  }
  if (form.runtime.locationBatchSize < 1 || form.runtime.locationBatchSize > 50) {
    throw new Error('单次补传数量必须为 1 至 50 点')
  }
  if (form.runtime.locationMaxAgeHours < 1 || form.runtime.locationMaxAgeHours > 72) {
    throw new Error('最长补传时效必须为 1 至 72 小时')
  }
}

async function confirmDangerousChanges() {
  const changes: string[] = []
  if (saved.value.enabled && !form.enabled) changes.push('停止整个骑手 App 服务')
  if (!saved.value.maintenance.enabled && form.maintenance.enabled) changes.push('开启维护模式')
  if (!saved.value.version.forceUpdate && form.version.forceUpdate) changes.push('开启强制更新')
  if (!changes.length) return
  await ElMessageBox.confirm(`本次将${changes.join('、')}，确认继续？`, '高影响配置确认', { type: 'warning' })
}

async function saveConfig() {
  try {
    validate()
    await confirmDangerousChanges()
    saving.value = true
    const response: any = await request.put('/admin/rider-app/config', JSON.parse(JSON.stringify(form)))
    assignConfig(response?.data || response)
    ElMessage.success('骑手 App 配置已保存')
  } catch (error: any) {
    if (error !== 'cancel' && error?.message !== 'cancel') ElMessage.error(error?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

function formatTime(value?: string) {
  return value ? new Date(value).toLocaleString('zh-CN') : '-'
}

function credentialRiderLabel(item: CredentialRiderOption) {
  return `${item.nickname || item.realName || '未命名骑手'} · ${item.regionName || '未分配区域'}`
}

function credentialRiderOption(value: any): CredentialRiderOption | null {
  const userId = String(value?.userId || '').trim()
  if (!userId) return null
  return {
    userId,
    nickname: String(value?.nickname || ''),
    realName: String(value?.realName || ''),
    phone: String(value?.phone || ''),
    regionId: String(value?.regionId || ''),
    regionName: String(value?.regionName || ''),
  }
}

function assignCredential(value: any) {
  const next = mapRiderPasswordCredential(value)
  Object.assign(credential, next)
  Object.assign(credentialForm, {
    username: next.username,
    password: '',
    userId: next.userId,
    enabled: next.enabled,
    expiresAt: next.expiresAt,
  })
  const selected = credentialRiderOption({ ...next.rider, regionId: next.region?.id, regionName: next.region?.name })
  if (selected) {
    credentialRiderOptions.value = [selected, ...credentialRiderOptions.value.filter((item) => item.userId !== selected.userId)]
  }
}

const credentialRiderSummary = computed(() => {
  const rider = credential.rider
  return rider ? `${rider.nickname || rider.realName || '未命名骑手'}${rider.phone ? `（${rider.phone}）` : ''}` : '-'
})

async function loadCredential() {
  credentialLoading.value = true
  try {
    const response: any = await request.get('/admin/rider-app/password-login')
    assignCredential(response?.data || response)
  } catch (error: any) {
    ElMessage.error(error?.message || '加载测试账号失败')
  } finally {
    credentialLoading.value = false
  }
}

async function searchCredentialRiders(keyword: string) {
  credentialRiderLoading.value = true
  try {
    const response: any = await request.get('/admin/rider-app/password-login/rider-options', { params: { keyword } })
    const rows = Array.isArray(response?.data || response) ? (response?.data || response) : []
    const next = rows.map(credentialRiderOption).filter(Boolean) as CredentialRiderOption[]
    const selected = credentialRiderOptions.value.filter((item) => item.userId === credentialForm.userId)
    credentialRiderOptions.value = [...new Map([...selected, ...next].map((item) => [item.userId, item])).values()]
  } catch (error: any) {
    ElMessage.error(error?.message || '搜索官方骑手失败')
  } finally {
    credentialRiderLoading.value = false
  }
}

async function saveCredential() {
  try {
    const payload = buildRiderPasswordCredentialPayload(credentialForm)
    if (!payload.username) throw new Error('请输入登录账号')
    if (!payload.userId) throw new Error('请选择绑定的官方骑手')
    if (!credential.configured && !payload.password) throw new Error('请设置登录密码')
    credentialSaving.value = true
    const response: any = await request.put('/admin/rider-app/password-login', payload)
    assignCredential(response?.data || response)
    ElMessage.success('测试账号已保存')
  } catch (error: any) {
    ElMessage.error(error?.message || '保存测试账号失败')
  } finally {
    credentialSaving.value = false
  }
}

async function resetCredentialLock() {
  try {
    await ElMessageBox.confirm('解除锁定会立即恢复该测试账号的密码登录尝试次数，确认继续？', '解除测试账号锁定', { type: 'warning' })
    credentialSaving.value = true
    const response: any = await request.post('/admin/rider-app/password-login/reset-lock')
    assignCredential(response?.data || response)
    ElMessage.success('测试账号锁定已解除')
  } catch (error: any) {
    if (error !== 'cancel' && error?.message !== 'cancel') ElMessage.error(error?.message || '解除锁定失败')
  } finally {
    credentialSaving.value = false
  }
}

function riderBusinessStatus(value?: string) {
  return ({ online: '可接单', busy: '配送中', offline: '未上线' } as Record<string, string>)[String(value || '')] || '-'
}

function mergeRiderSessions(rows: any[]) {
  const riders = new Map<string, any>()
  for (const row of rows) {
    const key = String(row.userId || row.id || '')
    if (!key) continue
    const online = Boolean(row.online && row.socketLive)
    const saved = riders.get(key)
    if (!saved) {
      riders.set(key, { ...row, appOnline: online })
    } else if (online) {
      saved.appOnline = true
    }
  }
  return Array.from(riders.values()).sort((a, b) => Number(b.appOnline) - Number(a.appOnline))
}

async function loadRiderSessions(showSuccess = false) {
  riderSessionLoading.value = true
  try {
    const response: any = await request.get('/admin/realtime/sessions', {
      params: { platform: 'rider_app', page: 1, pageSize: 200 }
    })
    const body = response?.data || response || {}
    riderSessions.value = mergeRiderSessions(Array.isArray(body.list) ? body.list : [])
    riderOnlineCount.value = riderSessions.value.filter((row) => row.appOnline).length
    if (showSuccess) ElMessage.success('骑手 App 状态已刷新')
  } catch (error: any) {
    ElMessage.error(error?.message || '加载骑手 App 状态失败')
  } finally {
    riderSessionLoading.value = false
  }
}

onMounted(() => {
  loadConfig()
  loadRiderSessions()
  loadCredential()
  riderSessionTimer = window.setInterval(() => loadRiderSessions(), 30000)
})

onBeforeUnmount(() => {
  if (riderSessionTimer) window.clearInterval(riderSessionTimer)
})
</script>

<style scoped>
.page-shell { display: flex; flex-direction: column; gap: 16px; }
.config-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.card-title, .switch-title { font-weight: 700; color: var(--mx-text); }
.two-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.switch-list { display: flex; flex-direction: column; gap: 16px; }
.switch-row { display: flex; align-items: center; justify-content: space-between; gap: 20px; }
.switch-desc, .form-tip { margin-top: 4px; color: var(--mx-muted); font-size: 12px; }
.unit { margin-left: 8px; color: var(--mx-muted); }
.rider-session-card { grid-column: 1 / -1; }
.credential-card { grid-column: 1 / -1; }
.session-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.session-summary { margin-left: 12px; color: var(--mx-muted); font-size: 13px; font-weight: 400; }
.session-alert { margin-bottom: 14px; }
.rider-cell { display: flex; align-items: center; gap: 10px; }
.rider-name { font-weight: 600; color: var(--mx-text); }
.rider-subtitle { margin-top: 2px; color: var(--mx-muted); font-size: 12px; }
.option-meta { display: block; margin-top: 2px; color: var(--mx-muted); font-size: 12px; }
.credential-status { margin-top: 16px; }
.credential-actions { display: flex; justify-content: flex-end; gap: 12px; margin-top: 16px; }
@media (max-width: 900px) {
  .config-grid, .two-cols { grid-template-columns: 1fr; }
}
</style>
