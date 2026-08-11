<template>
  <div class="page-shell">
    <PageHeader title="小程序下载" subtitle="下载服务商发布的小程序代码包，用微信开发者工具上传审核" icon="DocumentCopy">
      <template #actions>
        <el-button @click="loadStatus" :loading="loading">刷新</el-button>
        <el-button type="primary" @click="getLatestMiniapp" :loading="checking">获取最新版本</el-button>
      </template>
    </PageHeader>

    <el-row :gutter="16">
      <el-col :span="16">
        <el-card shadow="never">
          <template #header>
            <div class="card-header">
              <span>最新小程序包</span>
              <el-tag v-if="latest?.update" type="success" size="small">可下载</el-tag>
              <el-tag v-else type="info" size="small">服务商未发布</el-tag>
            </div>
          </template>

          <EmptyState v-if="!latest" description="点击“获取最新版本”后查看下载信息" />
          <div v-else class="package-detail">
            <el-alert :title="miniappMessage" :type="latest.update ? 'success' : 'warning'" :closable="false" />
            <el-descriptions v-if="latest.update" :column="1" border size="small">
              <el-descriptions-item label="版本">{{ latest.update.version }}</el-descriptions-item>
              <el-descriptions-item label="标题">{{ latest.update.title }}</el-descriptions-item>
              <el-descriptions-item label="说明">{{ latest.update.changelog }}</el-descriptions-item>
              <el-descriptions-item label="SHA256">{{ latest.update.packageSha256 }}</el-descriptions-item>
              <el-descriptions-item label="发布时间">{{ formatTime(latest.update.publishedAt) }}</el-descriptions-item>
            </el-descriptions>
            <div class="action-row">
              <el-button type="primary" :disabled="!canDownloadMiniapp" @click="downloadMiniapp" :loading="downloading">
                下载小程序包
              </el-button>
              <el-button :disabled="!download?.filePath" @click="openDownloadedFile">重新下载已校验文件</el-button>
            </div>
          </div>
        </el-card>
      </el-col>

      <el-col :span="8">
        <el-card shadow="never">
          <template #header><span>操作说明</span></template>
          <div class="tips">
            <p>1. 先获取最新版本。</p>
            <p>2. 点击下载，小程序包会先在服务器校验签名和 SHA256。</p>
            <p>3. 下载到本机后，用微信开发者工具打开并上传审核。</p>
            <p>4. 小程序发布不自动替换服务器文件，避免误发未审核版本。</p>
          </div>
        </el-card>

        <el-card v-if="download" shadow="never" class="download-card">
          <template #header><span>最近下载</span></template>
          <p>文件：{{ download.fileName }}</p>
          <p>版本：{{ download.update?.version || '-' }}</p>
          <p>时间：{{ formatTime(download.downloadedAt) }}</p>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import PageHeader from '@/components/common/PageHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { request } from '@/api/request'

const loading = ref(false)
const checking = ref(false)
const downloading = ref(false)
const latest = ref<any>(null)
const download = ref<any>(null)
const canDownloadMiniapp = computed(() => Boolean(latest.value?.update?.packageUrl && latest.value?.update?.packageSha256))
const miniappMessage = computed(() => {
  if (!latest.value) return '点击“获取最新版本”后查看下载信息'
  if (latest.value?.update) return latest.value.message || '已获取服务商发布的小程序包'
  return latest.value?.message && latest.value.message !== '当前已是最新版本'
    ? latest.value.message
    : '服务商还没有发布小程序包，暂时不能下载。请先在授权中心发布“小程序”版本。'
})

async function loadStatus() {
  loading.value = true
  try {
    const res: any = await request.get('/admin/license-runtime/status')
    latest.value = res.miniappUpdate || latest.value
    download.value = res.miniappDownload || download.value
  } finally {
    loading.value = false
  }
}

async function getLatestMiniapp() {
  checking.value = true
  try {
    latest.value = await request.post('/admin/license-runtime/miniapp/latest', undefined, { timeout: 30000 })
    if (latest.value?.update) {
      ElMessage.success('已获取最新小程序包')
    } else {
      ElMessage.warning('服务商还没有发布小程序包')
    }
  } finally {
    checking.value = false
  }
}

async function downloadMiniapp() {
  if (!canDownloadMiniapp.value) {
    ElMessage.warning('服务商还没有发布可下载的小程序包')
    return
  }
  downloading.value = true
  try {
    download.value = await request.post('/admin/license-runtime/miniapp/download', { update: latest.value.update }, { timeout: 180000 })
    ElMessage.success('小程序包已校验完成，开始下载')
    await openDownloadedFile()
  } finally {
    downloading.value = false
  }
}

async function openDownloadedFile() {
  try {
    if (!download.value?.browserDownloadUrl) {
      await loadStatus()
    }
    const downloadUrl = normalizeDownloadUrl(download.value?.browserDownloadUrl)
    if (!downloadUrl) {
      ElMessage.warning('请先下载并校验小程序包')
      return
    }
    const response = await fetch(downloadUrl, { credentials: 'same-origin' })
    if (!response.ok) {
      const message = await readDownloadError(response)
      throw new Error(message)
    }
    const blob = await response.blob()
    const fileName = download.value?.fileName || latest.value?.update?.fileName || `lingmeng-miniapp-${Date.now()}.zip`
    saveBlobFile(blob, fileName)
  } catch (error: any) {
    ElMessage.error(error?.message || '小程序包下载失败，请重新获取最新版本后再试')
  }
}

function normalizeDownloadUrl(value?: string) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  let url = new URL(raw, window.location.origin)
  if (url.pathname.startsWith('/admin/')) {
    const base = String(request.defaults.baseURL || '/api').replace(/\/$/, '')
    if (/^https?:\/\//i.test(base)) {
      const apiUrl = new URL(base)
      apiUrl.pathname = `${apiUrl.pathname.replace(/\/$/, '')}${url.pathname}`
      apiUrl.search = url.search
      url = apiUrl
    } else {
      url.pathname = `${base}${url.pathname}`
    }
  }
  url.searchParams.set('t', String(Date.now()))
  return url.toString()
}

async function readDownloadError(response: Response) {
  try {
    const json = await response.json()
    return json?.message || '小程序包下载失败'
  } catch {
    return `小程序包下载失败：HTTP ${response.status}`
  }
}

function saveBlobFile(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function formatTime(value?: string | null) {
  if (!value) return '-'
  return new Date(value).toLocaleString('zh-CN')
}

onMounted(loadStatus)
</script>

<style scoped>
.page-shell { padding: 24px; display: flex; flex-direction: column; gap: 16px; }
.card-header { display: flex; align-items: center; justify-content: space-between; }
.package-detail { display: flex; flex-direction: column; gap: 14px; }
.action-row { display: flex; align-items: center; gap: 10px; }
.tips { color: var(--mx-sub); font-size: 14px; line-height: 1.9; }
.tips p { margin: 0; }
.download-card { margin-top: 16px; }
.download-card p { margin: 8px 0 0; color: var(--mx-sub); word-break: break-all; }
</style>
