<template>
  <div class="page-shell">
    <PageHeader title="授权与更新" subtitle="输入授权码后，系统会自动和授权平台核对域名、服务器 IP 和版本更新" icon="Key">
      <template #actions>
        <el-button @click="loadStatus" :loading="loading">刷新</el-button>
        <el-button type="primary" @click="checkLicense" :loading="checking">立即校验</el-button>
      </template>
    </PageHeader>

    <div class="status-grid">
      <el-card shadow="never" class="status-card">
        <span>授权状态</span>
        <strong :class="statusClass">{{ statusText }}</strong>
        <small>{{ status.message || '暂无授权状态' }}</small>
      </el-card>
      <el-card shadow="never" class="status-card">
        <span>客户</span>
        <strong>{{ status.customerName || '-' }}</strong>
        <small>到期：{{ formatTime(status.expireAt) }}</small>
      </el-card>
      <el-card shadow="never" class="status-card">
        <span>写入能力</span>
        <strong :class="status.writable ? 'ok' : 'bad'">{{ status.writable ? '正常可用' : '已限制写入' }}</strong>
        <small>异常时只限制新增、修改、下单等操作</small>
      </el-card>
      <el-card shadow="never" class="status-card">
        <span>开通模块</span>
        <strong>{{ enabledModuleText }}</strong>
        <small>所有业务接口都会按授权模块校验</small>
      </el-card>
      <el-card shadow="never" class="status-card">
        <span>离线宽限</span>
        <strong>{{ formatTime(status.offlineUntil) }}</strong>
        <small>授权中心短暂不可用时使用</small>
      </el-card>
    </div>

    <el-row :gutter="16">
      <el-col :span="12">
        <el-card shadow="never">
          <template #header>
            <div class="card-header">
              <span>客户授权码</span>
              <el-tag :type="serviceReady ? 'success' : 'danger'" size="small">
                {{ serviceReady ? '服务已预置' : '服务未预置' }}
              </el-tag>
            </div>
          </template>

          <el-alert
            :title="serviceMessage"
            :type="serviceReady ? 'success' : 'error'"
            :closable="false"
            show-icon
          />

          <el-form label-position="top" class="config-form">
            <el-form-item label="授权码">
              <el-input
                v-model="form.licenseKey"
                placeholder="请输入服务商提供的授权码"
                show-password
                clearable
              />
            </el-form-item>
            <el-button type="primary" @click="saveConfig" :loading="saving">
              保存授权码
            </el-button>
          </el-form>

          <div class="auto-box">
            <div>
              <span>域名识别</span>
              <strong>{{ detectedDomain || '打开后台后自动识别' }}</strong>
            </div>
            <div>
              <span>服务器 IP</span>
              <strong>{{ detectedIp || '由授权平台按请求 IP 识别' }}</strong>
            </div>
          </div>
          <p class="muted">客户不用填写域名和 IP；系统会自动上报给授权平台，由授权平台和已绑定信息比对。</p>
        </el-card>
      </el-col>

      <el-col :span="12">
        <el-card shadow="never" class="update-card">
          <template #header>
            <div class="card-header">
              <span>版本更新</span>
              <el-tag v-if="update?.hasUpdate" type="danger" size="small">发现新版本</el-tag>
              <el-tag v-else type="info" size="small">暂无待更新</el-tag>
            </div>
          </template>

          <div class="update-actions">
            <el-select v-model="updateComponent" style="width: 150px">
              <el-option label="整套系统" value="full" />
              <el-option label="后端" value="backend" />
              <el-option label="后台" value="admin" />
              <el-option label="数据库迁移" value="database" />
            </el-select>
            <el-button type="primary" @click="checkUpdate" :loading="checkingUpdate">检查更新</el-button>
            <el-button :disabled="!update?.update" @click="downloadUpdate" :loading="downloading || download?.status === 'downloading'">下载并校验</el-button>
            <el-button type="success" :disabled="!download?.filePath" @click="applyUpdate" :loading="applying">一键更新</el-button>
          </div>

          <EmptyState v-if="!update" description="还没有检查更新" />
          <div v-else class="update-detail">
            <el-alert :title="update.message || '-'" :type="update.hasUpdate ? 'warning' : 'success'" :closable="false" />
            <el-descriptions v-if="update.update" :column="1" border size="small">
              <el-descriptions-item label="版本">{{ update.update.version }}</el-descriptions-item>
              <el-descriptions-item label="标题">{{ update.update.title }}</el-descriptions-item>
              <el-descriptions-item label="类型">{{ updateTypeText(update.update.updateType) }}</el-descriptions-item>
              <el-descriptions-item label="说明">{{ update.update.changelog }}</el-descriptions-item>
              <el-descriptions-item label="SHA256">{{ update.update.packageSha256 }}</el-descriptions-item>
            </el-descriptions>
          </div>

          <div v-if="download" class="download-box" :class="download.status">
            <div class="download-title">{{ download.message || '更新包下载状态' }}</div>
            <p v-if="download.fileName">文件：{{ download.fileName }}</p>
            <p v-if="download.filePath">路径：{{ download.filePath }}</p>
            <p v-if="download.status === 'downloading'">下载在服务器后台执行，关闭或刷新页面不会中断。</p>
          </div>

          <div v-if="applyStatus" class="apply-box" :class="applyStatus.status">
            <div class="download-title">一键更新状态：{{ applyStatusText }}</div>
            <p>{{ applyStatus.message || '-' }}</p>
            <p v-if="applyStatus.targetVersion">目标版本：{{ applyStatus.targetVersion }}</p>
            <p v-if="applyStatus.updatedAt">更新时间：{{ formatTime(applyStatus.updatedAt) }}</p>
            <el-button
              v-if="['success', 'failed', 'rolled_back'].includes(String(applyStatus.status))"
              size="small"
              :loading="clearingApplyStatus"
              @click="clearApplyStatus"
            >清除状态记录</el-button>
          </div>
        </el-card>

        <el-card shadow="never">
          <template #header><span>授权控制说明</span></template>
          <div class="tips">
            <p v-for="tip in tips" :key="tip">{{ tip }}</p>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-card shadow="never" class="diagnostic-card">
      <template #header>
        <div class="card-header">
          <div>
            <span>本机检测中心</span>
            <p class="card-subtitle">统一检查运行版本、数据库迁移账本和完整结构</p>
          </div>
          <div class="diagnostic-actions">
            <el-button @click="loadDiagnostics" :loading="diagnosing">重新检测</el-button>
            <el-button type="warning" :disabled="!diagnostics?.repairAvailable" @click="repairDiagnostics" :loading="repairing">继续未完成迁移</el-button>
          </div>
        </div>
      </template>

      <el-alert
        v-if="diagnostics"
        :title="diagnosticsSummary"
        :type="diagnosticsAlertType"
        :closable="false"
        show-icon
      />
      <EmptyState v-else description="点击“重新检测”检查本机环境" />

      <el-table v-if="diagnostics?.checks?.length" :data="diagnostics.checks" class="diagnostic-table" size="small">
        <el-table-column prop="label" label="检测项" min-width="220" />
        <el-table-column label="结果" width="120">
          <template #default="{ row }">
            <el-tag :type="diagnosticTagType(row.status)" size="small">{{ diagnosticStatusText(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="detail" label="说明" min-width="360" />
      </el-table>
      <p v-if="diagnostics?.checkedAt" class="muted diagnostic-time">最近检测：{{ formatTime(diagnostics.checkedAt) }} · 数据库：{{ diagnostics.provider }}</p>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import PageHeader from '@/components/common/PageHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { request } from '@/api/request'

const loading = ref(false)
const saving = ref(false)
const checking = ref(false)
const checkingUpdate = ref(false)
const downloading = ref(false)
const applying = ref(false)
const diagnosing = ref(false)
const repairing = ref(false)
const clearingApplyStatus = ref(false)
const status = ref<any>({})
const update = ref<any>(null)
const download = ref<any>(null)
const applyStatus = ref<any>(null)
const tips = ref<string[]>([])
const updateComponent = ref('full')
const serviceReady = ref(false)
const serviceMessage = ref('')
const detectedDomain = ref('')
const detectedIp = ref('')
const diagnostics = ref<any>(null)
const form = reactive({ licenseKey: '' })

const statusTextMap: Record<string, string> = {
  DISABLED: '未启用',
  UNCONFIGURED: '未配置',
  OK: '授权正常',
  GRACE: '离线宽限',
  EXPIRED: '已过期',
  PAUSED: '已暂停',
  REVOKED: '已注销',
  BINDING_MISMATCH: '绑定不一致',
  INVALID_KEY: '授权码无效',
  SIGNATURE_INVALID: '验签失败',
  NETWORK_ERROR: '连接失败',
}

const statusText = computed(() => statusTextMap[status.value.code] || status.value.code || '-')
const statusClass = computed(() => status.value.writable ? 'ok' : status.value.code === 'GRACE' ? 'warn' : 'bad')
const enabledModuleText = computed(() => {
  const modules = Array.isArray(status.value.modules) ? status.value.modules : []
  return modules.length >= 16 ? '全部模块' : `${modules.length} 个模块`
})
const applyStatusText = computed(() => {
  const map: Record<string, string> = {
    running: '正在更新',
    success: '更新完成',
    failed: '更新失败',
    rolled_back: '已自动回滚',
  }
  return map[applyStatus.value?.status] || applyStatus.value?.status || '-'
})
const diagnosticsSummary = computed(() => {
  const state = diagnostics.value?.status
  if (state === 'PASS') return '本机版本、迁移账本和数据库结构已通过统一检测'
  if (state === 'MISSING') return '发现当前版本未完成的正式迁移，可安全继续执行'
  if (state === 'WARNING') return '本机检测发现需要关注的更新记录，请查看明细'
  return '本机检测暂时无法完成，请查看明细后检查数据库连接'
})
const diagnosticsAlertType = computed(() => ({ PASS: 'success', MISSING: 'warning', WARNING: 'warning', UNAVAILABLE: 'error' } as any)[diagnostics.value?.status] || 'info')

let applyTimer: number | undefined
let downloadTimer: number | undefined

function fillConfig(config: any = {}) {
  form.licenseKey = config.licenseKey || ''
  serviceReady.value = Boolean(config.serviceReady)
  serviceMessage.value = config.serviceMessage || ''
  detectedDomain.value = config.detectedDomain || status.value.observed?.domain || ''
  detectedIp.value = config.detectedIp || status.value.observed?.serverIp || ''
}

async function loadStatus() {
  loading.value = true
  try {
    const res: any = await request.get('/admin/license-runtime/status')
    status.value = res.status || {}
    update.value = res.update || null
    download.value = res.download || null
    applyStatus.value = res.applyStatus || null
    tips.value = res.tips || []
    fillConfig(res.config || {})
    void loadDiagnostics()
  } finally {
    loading.value = false
  }
}

async function loadDiagnostics() {
  diagnosing.value = true
  try {
    diagnostics.value = await request.get('/admin/license-runtime/diagnostics', { timeout: 30000 })
  } finally {
    diagnosing.value = false
  }
}

async function repairDiagnostics() {
  if (!diagnostics.value?.repairAvailable) return
  if (!confirm('只会继续当前版本待执行或失败的正式迁移，确认继续吗？')) return
  repairing.value = true
  try {
    const result: any = await request.post('/admin/license-runtime/diagnostics/repair', undefined, { timeout: 5 * 60 * 1000 })
    diagnostics.value = result.diagnostics || diagnostics.value
    ElMessage.success(result.message || '版本迁移已完成')
  } finally {
    repairing.value = false
  }
}

async function saveConfig() {
  saving.value = true
  try {
    const res: any = await request.post('/admin/license-runtime/config', { licenseKey: form.licenseKey })
    status.value = res.status || status.value
    fillConfig(res.config || {})
    if (res?.config?.serviceReady === false) {
      ElMessage.warning('授权码已保存，但服务商预置配置缺失，请联系服务商处理')
    } else {
      ElMessage.success('授权码已保存')
    }
  } finally {
    saving.value = false
  }
}

async function checkLicense() {
  checking.value = true
  try {
    status.value = await request.post('/admin/license-runtime/check', undefined, { timeout: 30000 })
    detectedDomain.value = status.value.observed?.domain || detectedDomain.value
    detectedIp.value = status.value.observed?.serverIp || detectedIp.value
    ElMessage.success(status.value.writable ? '授权校验通过' : '授权校验完成，请查看状态')
  } finally {
    checking.value = false
  }
}

async function checkUpdate() {
  checkingUpdate.value = true
  try {
    update.value = await request.post('/admin/license-runtime/updates/check', { component: updateComponent.value }, { timeout: 30000 })
    syncPendingUpdateState()
    ElMessage.success(update.value.hasUpdate ? '发现新版本' : '当前已是最新版本')
  } finally {
    checkingUpdate.value = false
  }
}

async function downloadUpdate() {
  downloading.value = true
  try {
    download.value = await request.post('/admin/license-runtime/updates/download', { update: update.value?.update }, { timeout: 30000 })
    applyStatus.value = null
    ElMessage.success('更新包已转入服务器后台下载')
    startDownloadPolling()
  } finally {
    downloading.value = false
  }
}

async function loadDownloadStatus() {
  download.value = await request.get('/admin/license-runtime/updates/download-status')
  if (download.value?.status === 'success') {
    stopDownloadPolling()
    ElMessage.success('更新包已下载并通过校验')
  } else if (download.value?.status === 'failed') {
    stopDownloadPolling()
    ElMessage.error(download.value?.message || '更新包下载失败')
  }
}

function startDownloadPolling() {
  stopDownloadPolling()
  downloadTimer = window.setInterval(() => loadDownloadStatus().catch(() => undefined), 3000)
}

function stopDownloadPolling() {
  if (downloadTimer) window.clearInterval(downloadTimer)
  downloadTimer = undefined
}

async function applyUpdate() {
  if (!download.value?.filePath) {
    ElMessage.warning('请先下载并校验更新包')
    return
  }
  if (!confirm('确定现在一键更新吗？系统会先备份，再替换文件、执行迁移并重启服务。')) return
  applying.value = true
  try {
    applyStatus.value = await request.post('/admin/license-runtime/updates/apply')
    ElMessage.success('一键更新已启动')
    startApplyPolling()
  } finally {
    applying.value = false
  }
}

async function loadApplyStatus() {
  applyStatus.value = await request.get('/admin/license-runtime/updates/apply-status')
  if (['success', 'failed', 'rolled_back'].includes(String(applyStatus.value?.status))) {
    stopApplyPolling()
  }
}

async function clearApplyStatus() {
  clearingApplyStatus.value = true
  try {
    const result: any = await request.post('/admin/license-runtime/updates/apply-status/clear')
    applyStatus.value = null
    stopApplyPolling()
    ElMessage.success(result.message || '更新状态记录已清除')
  } finally {
    clearingApplyStatus.value = false
  }
}

function startApplyPolling() {
  stopApplyPolling()
  applyTimer = window.setInterval(() => {
    loadApplyStatus().catch(() => undefined)
  }, 3000)
}

function stopApplyPolling() {
  if (applyTimer) {
    window.clearInterval(applyTimer)
    applyTimer = undefined
  }
}

function formatTime(value?: string | null) {
  if (!value) return '-'
  return new Date(value).toLocaleString('zh-CN')
}

function updateTypeText(type: string) {
  return ({ NORMAL: '普通更新', IMPORTANT: '重要更新', FORCE: '强制更新' } as any)[type] || type || '-'
}

function diagnosticStatusText(value: string) {
  return ({ PASS: '通过', MISSING: '缺失', WARNING: '关注', UNAVAILABLE: '不可用' } as any)[value] || value || '-'
}

function diagnosticTagType(value: string) {
  return ({ PASS: 'success', MISSING: 'danger', WARNING: 'warning', UNAVAILABLE: 'danger' } as any)[value] || 'info'
}

function syncPendingUpdateState() {
  if (!update.value?.hasUpdate || !update.value?.update) {
    download.value = null
    applyStatus.value = null
    return
  }
  if (download.value?.update && !isSameUpdateRelease(update.value.update, download.value.update)) {
    download.value = null
    applyStatus.value = null
    return
  }
  if (applyStatus.value && !isApplyStatusForCurrentUpdate(applyStatus.value)) {
    applyStatus.value = null
  }
}

function isApplyStatusForCurrentUpdate(status: any) {
  if (String(status?.status || '') === 'running') return true
  return isSameUpdateRelease(update.value?.update, {
    id: status?.releaseId,
    version: status?.targetVersion,
    component: status?.component || download.value?.update?.component,
  })
}

function isSameUpdateRelease(left: any, right: any) {
  if (!left || !right) return false
  if (left.id && right.id) return String(left.id) === String(right.id)
  if (!left.version || !right.version || String(left.version) !== String(right.version)) return false
  if (left.component && right.component && String(left.component) !== String(right.component)) return false
  if (left.packageSha256 && right.packageSha256 && String(left.packageSha256) !== String(right.packageSha256)) return false
  return true
}

onMounted(async () => {
  await loadStatus()
  if (download.value?.status === 'downloading') startDownloadPolling()
  if (applyStatus.value?.status === 'running') startApplyPolling()
})

onBeforeUnmount(() => {
  stopDownloadPolling()
  stopApplyPolling()
})
</script>

<style scoped>
.page-shell { padding: 24px; display: flex; flex-direction: column; gap: 16px; }
.status-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 16px; }
.status-card { min-height: 116px; }
.status-card :deep(.el-card__body) { display: flex; flex-direction: column; gap: 8px; }
.status-card span { color: var(--mx-sub); font-size: 13px; }
.status-card strong { color: var(--mx-text); font-size: 24px; line-height: 1.2; }
.status-card small { color: var(--mx-muted); line-height: 1.5; }
.ok { color: var(--el-color-success) !important; }
.warn { color: var(--el-color-warning) !important; }
.bad { color: var(--el-color-danger) !important; }
.card-header { display: flex; align-items: center; justify-content: space-between; }
.card-subtitle { margin: 4px 0 0; color: var(--mx-sub); font-size: 13px; font-weight: 400; }
.config-form { margin-top: 18px; }
.auto-box { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-top: 18px; }
.auto-box div { padding: 14px; border: 1px solid var(--el-color-primary-light-8); border-radius: 6px; background: var(--mx-hover); display: flex; flex-direction: column; gap: 6px; }
.auto-box span { color: var(--mx-sub); font-size: 13px; }
.auto-box strong { color: var(--mx-text); font-size: 15px; word-break: break-all; }
.muted { margin: 12px 0 0; color: var(--mx-sub); line-height: 1.7; }
.update-card { margin-bottom: 16px; }
.update-actions { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
.update-detail { display: flex; flex-direction: column; gap: 14px; }
.download-box { margin-top: 16px; padding: 14px; border-radius: 6px; background: var(--el-color-success-light-9); border: 1px solid var(--el-color-success-light-7); color: var(--el-color-success-dark-2); }
.download-box p { margin: 6px 0 0; word-break: break-all; }
.download-box.downloading { background: var(--el-color-primary-light-9); border-color: var(--el-color-primary-light-7); color: var(--el-color-primary-dark-2); }
.download-box.failed { background: var(--el-color-danger-light-9); border-color: var(--el-color-danger-light-7); color: var(--el-color-danger-dark-2); }
.download-title { font-weight: 700; }
.apply-box { margin-top: 12px; padding: 14px; border-radius: 6px; background: var(--el-color-primary-light-9); border: 1px solid var(--el-color-primary-light-7); color: var(--el-color-primary-dark-2); }
.apply-box p { margin: 6px 0 0; word-break: break-all; }
.apply-box.success { background: var(--el-color-success-light-9); border-color: var(--el-color-success-light-7); color: var(--el-color-success-dark-2); }
.apply-box.failed { background: var(--el-color-danger-light-9); border-color: var(--el-color-danger-light-7); color: var(--el-color-danger-dark-2); }
.apply-box.rolled_back { background: var(--el-color-warning-light-9); border-color: var(--el-color-warning-light-7); color: var(--el-color-warning-dark-2); }
.tips { color: var(--mx-sub); font-size: 14px; line-height: 1.8; }
.tips p { margin: 0; }
.diagnostic-card { margin-top: 16px; }
.diagnostic-actions { display: flex; gap: 10px; }
.diagnostic-table { margin-top: 16px; width: 100%; }
.diagnostic-time { margin-bottom: 0; }
@media (max-width: 1200px) {
  .status-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .auto-box { grid-template-columns: 1fr; }
  .diagnostic-actions { flex-wrap: wrap; justify-content: flex-end; }
}
</style>
