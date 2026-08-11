<template>
  <div class="files-page">
    <PageHeader title="文件中心" subtitle="查看图片、视频、音频和附件，定位上传人、使用场景与存储占用" icon="FolderOpened">
      <template #actions>
        <el-button :icon="Refresh" :loading="loading" @click="refresh">刷新</el-button>
        <el-button type="primary" :icon="Upload" @click="uploadVisible = true">上传文件</el-button>
      </template>
    </PageHeader>

    <StatGrid :items="statItems" />

    <section class="filter-card">
      <el-input v-model="filters.keyword" clearable placeholder="搜索文件名或上传人" :prefix-icon="Search" @keyup.enter="loadFiles(1)" />
      <el-select v-model="filters.type" clearable placeholder="文件类型" @change="loadFiles(1)">
        <el-option label="图片" value="image" />
        <el-option label="视频" value="video" />
        <el-option label="音频" value="audio" />
        <el-option label="其他文件" value="file" />
      </el-select>
      <el-input v-model="filters.scene" clearable placeholder="使用场景，如 posts/messages" @keyup.enter="loadFiles(1)" />
      <el-date-picker v-model="filters.date" type="daterange" start-placeholder="开始日期" end-placeholder="结束日期" value-format="YYYY-MM-DD" @change="loadFiles(1)" />
      <el-button type="primary" @click="loadFiles(1)">查询</el-button>
      <el-button @click="resetFilters">重置</el-button>
    </section>

    <section class="toolbar-card">
      <div class="toolbar-left">
        <el-segmented v-model="activeType" :options="typeTabs" @change="onTypeTabChange" />
        <span class="muted">共 {{ total }} 个文件，已选 {{ selectedIds.length }} 个</span>
      </div>
      <div class="toolbar-actions">
        <el-button :disabled="!selectedIds.length" :icon="Delete" @click="batchDelete">批量删除</el-button>
        <el-button :icon="DocumentCopy" @click="copySelected">复制链接</el-button>
        <el-radio-group v-model="viewMode" size="small">
          <el-radio-button label="card">卡片</el-radio-button>
          <el-radio-button label="table">表格</el-radio-button>
        </el-radio-group>
      </div>
    </section>

    <section v-loading="loading" class="content-card">
      <EmptyState v-if="!files.length" description="暂无文件" />

      <div v-else-if="viewMode === 'card'" class="file-grid">
        <article v-for="file in files" :key="file.id" class="file-card" :class="{ selected: selectedIds.includes(file.id) }">
          <label class="select-box">
            <el-checkbox :model-value="selectedIds.includes(file.id)" @change="toggleSelect(file)" />
          </label>
          <div class="media-box" @click="openPreview(file)">
            <img v-if="file.mediaKind === 'image'" :src="mediaUrl(file.url)" alt="" />
            <video v-else-if="file.mediaKind === 'video'" :src="mediaUrl(file.url)" muted preload="metadata" />
            <div v-else class="file-icon">
              <el-icon><component :is="kindIcon(file.mediaKind)" /></el-icon>
              <span>{{ kindText(file.mediaKind) }}</span>
            </div>
            <div v-if="file.mediaKind === 'video'" class="play-badge">
              <el-icon><VideoPlay /></el-icon>
            </div>
          </div>
          <div class="file-body">
            <strong :title="file.originalName || file.fileName">{{ file.originalName || file.fileName }}</strong>
            <div class="meta-line">
              <el-tag size="small" effect="plain">{{ file.mimeType || file.fileType }}</el-tag>
              <span>{{ file.sizeText || formatSize(file.size || file.fileSize) }}</span>
            </div>
            <div class="scene-line">{{ file.sceneText || file.scene || '未标记' }}</div>
            <div class="uploader-line">
              <el-avatar :size="26" :src="file.uploader?.avatar || ''">{{ avatarText(uploaderDisplayName(file)) }}</el-avatar>
              <div>
                <span>{{ uploaderDisplayName(file) }}</span>
                <small>{{ uploaderSubtitle(file) }}</small>
              </div>
              <el-tag v-if="file.uploader?.roleLabel" size="small" effect="plain" class="uploader-role">{{ file.uploader.roleLabel }}</el-tag>
            </div>
          </div>
          <div class="file-actions">
            <el-button size="small" @click="openPreview(file)">预览</el-button>
            <el-button size="small" @click="copyUrl(file.url)">复制</el-button>
            <el-button size="small" type="danger" @click="deleteFile(file)">删除</el-button>
          </div>
        </article>
      </div>

      <el-table v-else :data="files" @selection-change="selectedIds = $event.map((item: any) => item.id)">
        <el-table-column type="selection" width="46" />
        <el-table-column label="文件" min-width="320">
          <template #default="{ row }">
            <div class="table-file">
              <div class="mini-preview" @click="openPreview(row)">
                <img v-if="row.mediaKind === 'image'" :src="mediaUrl(row.url)" alt="" />
                <el-icon v-else><component :is="kindIcon(row.mediaKind)" /></el-icon>
              </div>
              <div>
                <strong>{{ row.originalName || row.fileName }}</strong>
                <p>{{ row.url }}</p>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="上传人" min-width="170">
          <template #default="{ row }">
            <div class="table-uploader">
              <span>{{ uploaderDisplayName(row) }}</span>
              <small>{{ uploaderSubtitle(row) }}</small>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="类型" width="130">
          <template #default="{ row }"><el-tag size="small">{{ row.mimeType || row.fileType }}</el-tag></template>
        </el-table-column>
        <el-table-column label="大小" width="110">
          <template #default="{ row }">{{ row.sizeText || formatSize(row.fileSize) }}</template>
        </el-table-column>
        <el-table-column label="场景" width="130">
          <template #default="{ row }">{{ row.sceneText || row.scene || '-' }}</template>
        </el-table-column>
        <el-table-column label="上传时间" width="180">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="170" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openPreview(row)">预览</el-button>
            <el-button link @click="copyUrl(row.url)">复制</el-button>
            <el-button link type="danger" @click="deleteFile(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pager">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :total="total"
          :page-sizes="[20, 40, 80]"
          layout="total, sizes, prev, pager, next"
          @current-change="loadFiles"
          @size-change="loadFiles(1)"
        />
      </div>
    </section>

    <el-dialog v-model="previewVisible" :title="previewFile?.originalName || previewFile?.fileName || '文件预览'" width="760px">
      <div v-if="previewFile" class="preview-dialog">
        <img v-if="previewFile.mediaKind === 'image'" :src="mediaUrl(previewFile.url)" alt="" />
        <video v-else-if="previewFile.mediaKind === 'video'" :src="mediaUrl(previewFile.url)" controls />
        <audio v-else-if="previewFile.mediaKind === 'audio'" :src="mediaUrl(previewFile.url)" controls />
        <div v-else class="generic-preview">
          <el-icon><Document /></el-icon>
          <span>{{ previewFile.originalName || previewFile.fileName }}</span>
        </div>
        <div class="preview-meta">
          <span>上传人：{{ uploaderDisplayName(previewFile) }}</span>
          <span v-if="previewFile.uploader?.roleLabel">身份：{{ previewFile.uploader.roleLabel }}</span>
          <span>场景：{{ previewFile.sceneText || previewFile.scene || '-' }}</span>
          <span>大小：{{ previewFile.sizeText || formatSize(previewFile.fileSize) }}</span>
        </div>
      </div>
      <template #footer>
        <el-button @click="copyUrl(previewFile?.url)">复制链接</el-button>
        <el-button type="primary" @click="openUrl(previewFile?.url)">打开原文件</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="uploadVisible" title="上传文件" width="520px">
      <el-upload drag :http-request="uploadFile" :show-file-list="true" :limit="1">
        <el-icon class="el-icon--upload"><Upload /></el-icon>
        <div class="el-upload__text">拖拽文件到这里，或点击上传</div>
      </el-upload>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, Document, DocumentCopy, Headset, Picture, Refresh, Search, Upload, VideoCamera, VideoPlay } from '@element-plus/icons-vue'
import EmptyState from '@/components/common/EmptyState.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import StatGrid from '@/components/glass/StatGrid.vue'
import type { StatItem } from '@/types/admin'
import { request } from '@/api/request'
import { uploadAdminFile } from '@/api/admin'

const loading = ref(false)
const uploadVisible = ref(false)
const previewVisible = ref(false)
const viewMode = ref<'card' | 'table'>('card')
const activeType = ref('')
const files = ref<any[]>([])
const previewFile = ref<any>(null)
const selectedIds = ref<string[]>([])
const total = ref(0)
const stats = ref<any>({})
const pagination = reactive({ page: 1, pageSize: 20 })
const filters = reactive<any>({ keyword: '', type: '', scene: '', date: [] })

const typeTabs = [
  { label: '全部', value: '' },
  { label: '图片', value: 'image' },
  { label: '视频', value: 'video' },
  { label: '音频', value: 'audio' },
  { label: '其他', value: 'file' },
]

const statItems = computed<StatItem[]>(() => {
  const byType = stats.value?.byType || {}
  return [
    { label: '文件总数', value: Number(stats.value?.totalFiles || total.value || 0).toLocaleString(), sub: '全部上传记录', icon: 'Document', tone: 'blue' },
    { label: '存储占用', value: formatSize(stats.value?.totalSize || 0), sub: '已记录文件大小', icon: 'Coin', tone: 'cyan' },
    { label: '今日上传', value: Number(stats.value?.todayFiles || 0).toLocaleString(), sub: '今日新增文件', icon: 'Upload', tone: 'green' },
    { label: '图片 / 视频', value: `${byType.images || 0} / ${byType.videos || 0}`, sub: '媒体资源占比', icon: 'Picture', tone: 'orange' },
  ]
})

function mediaUrl(url: string) {
  const text = String(url || '').trim()
  if (!text) return ''
  if (/^https?:\/\//i.test(text) || text.startsWith('/')) return text
  return `/${text}`
}

function formatSize(value: any) {
  const size = Number(value || 0)
  if (size >= 1024 * 1024 * 1024) return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(2)} MB`
  if (size >= 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${size} B`
}

function formatTime(value: any) {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString()
}

function kindText(kind: string) {
  const map: Record<string, string> = { image: '图片', video: '视频', audio: '音频', file: '文件' }
  return map[kind] || '文件'
}

function kindIcon(kind: string) {
  if (kind === 'image') return Picture
  if (kind === 'video') return VideoCamera
  if (kind === 'audio') return Headset
  return Document
}

function avatarText(name?: string) {
  return String(name || '用').slice(0, 1)
}

function uploaderDisplayName(file: any) {
  return file?.uploader?.displayName || file?.uploader?.name || file?.userId || '未知上传人'
}

function uploaderSubtitle(file: any) {
  return file?.uploader?.subtitle || file?.uploader?.account || file?.uploader?.phone || file?.uploader?.id || '-'
}

async function loadStats() {
  stats.value = await request.get('/upload/files/stats').catch(() => ({}))
}

async function loadFiles(page = pagination.page) {
  loading.value = true
  pagination.page = Number(page || 1)
  try {
    const params = {
      page: pagination.page,
      pageSize: pagination.pageSize,
      keyword: filters.keyword || undefined,
      type: filters.type || undefined,
      scene: filters.scene || undefined,
      startDate: filters.date?.[0] || undefined,
      endDate: filters.date?.[1] || undefined,
    }
    const res: any = await request.get('/admin/upload-files', { params })
    files.value = res.list || res.data?.list || []
    total.value = Number(res.total || res.data?.total || 0)
    selectedIds.value = selectedIds.value.filter(id => files.value.some(item => item.id === id))
  } catch (e: any) {
    files.value = []
    total.value = 0
    ElMessage.error(e?.message || '加载文件失败')
  } finally {
    loading.value = false
  }
}

function refresh() {
  Promise.all([loadFiles(), loadStats()]).then(() => ElMessage.success('文件中心已刷新'))
}

function resetFilters() {
  Object.assign(filters, { keyword: '', type: '', scene: '', date: [] })
  activeType.value = ''
  loadFiles(1)
}

function onTypeTabChange(value: any) {
  filters.type = value || ''
  loadFiles(1)
}

function toggleSelect(file: any) {
  selectedIds.value = selectedIds.value.includes(file.id)
    ? selectedIds.value.filter(id => id !== file.id)
    : [...selectedIds.value, file.id]
}

function openPreview(file: any) {
  previewFile.value = file
  previewVisible.value = true
}

async function copyUrl(url?: string) {
  if (!url) return
  await navigator.clipboard.writeText(mediaUrl(url))
  ElMessage.success('链接已复制')
}

async function copySelected() {
  const list = files.value.filter(item => selectedIds.value.includes(item.id)).map(item => mediaUrl(item.url))
  if (!list.length) {
    ElMessage.warning('请先选择文件')
    return
  }
  await navigator.clipboard.writeText(list.join('\n'))
  ElMessage.success(`已复制 ${list.length} 个链接`)
}

function openUrl(url?: string) {
  if (url) window.open(mediaUrl(url), '_blank')
}

async function deleteFile(file: any) {
  await ElMessageBox.confirm(`确定删除「${file.originalName || file.fileName}」？`, '删除文件', { type: 'warning' })
  await request.delete(`/admin/upload-files/${file.id}`)
  ElMessage.success('已删除')
  await Promise.all([loadFiles(), loadStats()])
}

async function batchDelete() {
  if (!selectedIds.value.length) {
    ElMessage.warning('请先选择文件')
    return
  }
  await ElMessageBox.confirm(`确定删除选中的 ${selectedIds.value.length} 个文件？`, '批量删除', { type: 'warning' })
  await request.post('/admin/upload-files/batch-delete', { ids: selectedIds.value })
  selectedIds.value = []
  ElMessage.success('已批量删除')
  await Promise.all([loadFiles(), loadStats()])
}

async function uploadFile(option: any) {
  try {
    await uploadAdminFile(option.file, 'admin')
    option.onSuccess?.({})
    ElMessage.success('上传成功')
    uploadVisible.value = false
    await Promise.all([loadFiles(1), loadStats()])
  } catch (e) {
    option.onError?.(e)
    ElMessage.error('上传失败，请检查文件或存储配置')
  }
}

onMounted(() => {
  loadFiles()
  loadStats()
})
</script>

<style scoped>
.files-page { padding: 24px; }
.filter-card,
.toolbar-card,
.content-card {
  background: var(--mx-card);
  border: 1px solid var(--mx-border);
  border-radius: 6px;
  box-shadow: var(--mx-shadow);
}
.muted { color: var(--mx-sub); font-size: 13px; font-weight: 700; }
.filter-card { display: grid; grid-template-columns: minmax(220px, 1fr) 150px 190px 280px auto auto; gap: 12px; padding: 14px; margin-bottom: 16px; }
.toolbar-card { display: flex; justify-content: space-between; align-items: center; gap: 14px; padding: 14px; margin-bottom: 16px; }
.toolbar-left,
.toolbar-actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.content-card { padding: 16px; }
.file-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 14px; }
.file-card { position: relative; overflow: hidden; border: 1px solid var(--mx-border); border-radius: 6px; background: var(--mx-card); transition: border-color .2s, box-shadow .2s; }
.file-card:hover,
.file-card.selected { border-color: var(--el-color-primary); box-shadow: 0 12px 28px color-mix(in srgb, var(--el-color-primary) 12%, transparent); }
.select-box { position: absolute; z-index: 3; top: 8px; left: 8px; border-radius: 6px; background: var(--mx-card); padding: 2px 5px; }
.media-box { position: relative; height: 168px; background: var(--mx-soft); cursor: pointer; display: grid; place-items: center; overflow: hidden; }
.media-box img,
.media-box video { width: 100%; height: 100%; object-fit: cover; display: block; }
.file-icon { display: grid; place-items: center; gap: 8px; color: var(--mx-sub); }
.file-icon .el-icon { font-size: 40px; color: var(--el-color-primary); }
.play-badge { position: absolute; right: 10px; bottom: 10px; width: 34px; height: 34px; display: grid; place-items: center; border-radius: 50%; background: color-mix(in srgb, var(--mx-text) 72%, transparent); color: #fff; }
.file-body { padding: 12px; display: grid; gap: 8px; }
.file-body strong { color: var(--mx-text); font-size: 14px; line-height: 1.35; word-break: break-all; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.meta-line { display: flex; align-items: center; gap: 8px; color: var(--mx-sub); font-size: 12px; }
.scene-line { color: var(--mx-sub); font-size: 12px; }
.uploader-line { display: flex; align-items: center; gap: 8px; padding-top: 4px; border-top: 1px solid var(--mx-border); }
.uploader-line span { display: block; color: var(--mx-text); font-size: 13px; font-weight: 700; }
.uploader-line small { color: var(--mx-muted); font-size: 12px; }
.uploader-line > div { min-width: 0; flex: 1; }
.uploader-line small,
.table-uploader small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.uploader-role { flex: 0 0 auto; }
.file-actions { display: flex; gap: 8px; padding: 0 12px 12px; }
.table-file { display: flex; align-items: center; gap: 12px; }
.table-file strong { color: var(--mx-text); }
.table-file p { max-width: 420px; margin: 4px 0 0; color: var(--mx-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.table-uploader span { color: var(--mx-text); font-weight: 700; }
.table-uploader small { max-width: 210px; color: var(--mx-muted); font-size: 12px; }
.mini-preview { width: 52px; height: 52px; border-radius: 6px; background: var(--mx-soft); display: grid; place-items: center; overflow: hidden; cursor: pointer; }
.mini-preview img { width: 100%; height: 100%; object-fit: cover; }
.pager { display: flex; justify-content: flex-end; margin-top: 16px; }
.preview-dialog { display: grid; gap: 14px; }
.preview-dialog > img,
.preview-dialog > video { width: 100%; max-height: 520px; object-fit: contain; border-radius: 6px; background: var(--mx-text); }
.preview-dialog > audio { width: 100%; }
.generic-preview { min-height: 220px; display: grid; place-items: center; gap: 10px; border-radius: 6px; background: var(--mx-soft); color: var(--el-text-color-regular); }
.generic-preview .el-icon { font-size: 52px; color: var(--el-color-primary); }
.preview-meta { display: flex; flex-wrap: wrap; gap: 10px; color: var(--mx-sub); font-size: 13px; }

@media (max-width: 1100px) {
  .filter-card { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 720px) {
  .files-page { padding: 14px; }
  .filter-card { grid-template-columns: 1fr; }
  .toolbar-card { align-items: stretch; flex-direction: column; }
}
</style>
