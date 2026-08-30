<template>
  <div class="page-shell">
    <GlassPageHeader title="代码包与主题" subtitle="直接修改小程序源码并打包下载，微信开发者工具上传后生效">
      <template #actions>
        <el-button :icon="Refresh" @click="loadAll">刷新</el-button>
        <el-button type="primary" :icon="Download" :loading="downloading" @click="downloadZip">下载代码包</el-button>
      </template>
    </GlassPageHeader>

    <el-alert type="warning" :closable="false" show-icon>
      <template #title>
        此页面的修改会直接写入本地小程序源码（自动保留 .bak 备份），<b>必须在微信开发者工具重新上传后才对线上生效</b>。
        远程装修（首页布局、TabBar 配置）不需要走这里。
      </template>
    </el-alert>

    <!-- API 域名 -->
    <div class="glass-card">
      <div class="card-header">
        <div class="card-title">API 域名（远程生效）</div>
        <el-button size="small" type="primary" :loading="savingApiUrl" @click="saveApiUrl">保存</el-button>
      </div>
      <div class="card-body">
        <el-input v-model="apiBaseUrl" placeholder="https://your-domain.com/api" style="max-width: 480px">
          <template #prepend>Base URL</template>
        </el-input>
        <p class="api-tip">
          小程序启动时自动拉取该域名（无需重新上传）。当前生效值：<code>{{ apiBaseUrlCurrent || '默认（https://yuntingzhe.cn/api）' }}</code>
        </p>
      </div>
    </div>

    <!-- 源码包信息 -->
    <div class="glass-card">
      <div class="card-header"><div class="card-title">源码包信息</div></div>
      <div class="card-body">
        <div v-if="info" class="info-grid">
          <div class="info-item"><span class="i-label">源码目录</span><code class="i-value">{{ info.sourceDir }}</code></div>
          <div class="info-item"><span class="i-label">文件数</span><b class="i-value">{{ info.fileCount }}</b></div>
          <div class="info-item"><span class="i-label">主包页面</span><b class="i-value">{{ info.pageCount }}</b></div>
          <div class="info-item"><span class="i-label">分包</span><b class="i-value">{{ info.subPackageCount }}</b></div>
          <div class="info-item"><span class="i-label">TabBar 项</span><b class="i-value">{{ info.tabBarCount }}</b></div>
          <div class="info-item"><span class="i-label">最近修改</span><span class="i-value">{{ formatTime(info.lastModified) }}</span></div>
        </div>
        <el-skeleton v-else :rows="2" animated />
      </div>
    </div>

    <!-- 素材库（写入代码包 static/editor，随 zip 打包） -->
    <div class="glass-card">
      <div class="card-header">
        <div class="card-title">素材库（代码包内图片）</div>
        <el-upload :auto-upload="false" :show-file-list="false" accept="image/*" :on-change="uploadAsset">
          <el-button size="small" type="primary" :loading="uploadingAsset">上传图片</el-button>
        </el-upload>
      </div>
      <div class="card-body">
        <el-alert type="info" :closable="false" show-icon style="margin-bottom: 12px">
          <template #title>
            上传的图片保存在小程序源码 <code>static/editor/</code> 里，随代码包一起打包。
            在小程序源码或页面配置中使用 <code>/static/editor/文件名.png</code>，即可随代码包离线显示。
          </template>
        </el-alert>
        <div v-if="assets.length" class="asset-grid">
          <div v-for="a in assets" :key="a.name" class="asset-item">
            <div class="asset-thumb"><img :src="a.previewUrl" :alt="a.name" loading="lazy" /></div>
            <div class="asset-name" :title="a.name">{{ a.name }}</div>
            <div class="asset-meta">{{ formatSize(a.size) }}</div>
            <div class="asset-ops">
              <el-button size="small" text @click="copyAssetPath(a.path)">复制路径</el-button>
              <el-button size="small" text type="danger" @click="removeAsset(a.name)">删除</el-button>
            </div>
          </div>
        </div>
        <el-empty v-else description="还没有素材，上传第一张图片吧" :image-size="80" />
      </div>
    </div>

    <!-- 主题变量 -->
    <div class="glass-card">
      <div class="card-header">
        <div class="card-title">全局主题（app.wxss）</div>
        <el-button size="small" type="primary" :disabled="!themeDirty.size" :loading="savingTheme" @click="saveTheme">
          保存主题{{ themeDirty.size ? `（${themeDirty.size} 项改动）` : '' }}
        </el-button>
      </div>
      <div class="card-body">
        <div class="theme-grid">
          <div v-for="v in themeVars" :key="v.name" class="theme-item">
            <div class="theme-name" :title="v.name">{{ v.name }}</div>
            <div class="theme-control">
              <template v-if="isColor(v.value)">
                <el-color-picker v-model="v.value" @change="markDirty(v.name)" />
                <el-input v-model="v.value" size="small" class="theme-input" @input="markDirty(v.name)" />
              </template>
              <el-input v-else v-model="v.value" size="small" class="theme-input" @input="markDirty(v.name)" />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 窗口与 TabBar -->
    <div class="glass-card">
      <div class="card-header">
        <div class="card-title">窗口与 TabBar（app.json）</div>
        <el-button size="small" type="primary" :loading="savingAppJson" @click="saveAppJson">保存</el-button>
      </div>
      <div class="card-body" v-if="appJson">
        <div class="section-label">窗口</div>
        <div class="form-grid three">
          <el-form-item label="导航栏标题">
            <el-input v-model="appJson.window.navigationBarTitleText" />
          </el-form-item>
          <el-form-item label="导航栏背景色">
            <el-color-picker v-model="appJson.window.navigationBarBackgroundColor" />
          </el-form-item>
          <el-form-item label="导航栏文字颜色">
            <el-select v-model="appJson.window.navigationBarTextStyle">
              <el-option label="黑色" value="black" />
              <el-option label="白色" value="white" />
            </el-select>
          </el-form-item>
          <el-form-item label="页面背景色">
            <el-color-picker v-model="appJson.window.backgroundColor" />
          </el-form-item>
        </div>

        <template v-if="appJson.tabBar">
          <div class="section-label">TabBar 样式</div>
          <div class="form-grid three">
            <el-form-item label="默认文字颜色">
              <el-color-picker v-model="appJson.tabBar.color" />
            </el-form-item>
            <el-form-item label="选中文字颜色">
              <el-color-picker v-model="appJson.tabBar.selectedColor" />
            </el-form-item>
            <el-form-item label="背景色">
              <el-color-picker v-model="appJson.tabBar.backgroundColor" />
            </el-form-item>
          </div>
          <div class="section-label">TabBar 项（仅可改名称，路径/图标需改代码）</div>
          <div class="tabbar-list">
            <div v-for="(tab, i) in appJson.tabBar.list" :key="i" class="tabbar-row">
              <span class="tabbar-path">{{ tab.pagePath }}</span>
              <el-input v-model="tab.text" size="small" placeholder="名称" style="width: 160px" />
            </div>
          </div>
        </template>
      </div>
      <el-skeleton v-else :rows="3" animated class="card-body" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Download, Refresh } from '@element-plus/icons-vue'
import { request } from '@/api/request'
import GlassPageHeader from '@/components/glass/GlassPageHeader.vue'

const info = ref<any>(null)
const themeVars = ref<Array<{ name: string; value: string }>>([])
const themeDirty = ref(new Set<string>())
const appJson = ref<any>(null)
const apiBaseUrl = ref('')
const apiBaseUrlCurrent = ref('')
const savingApiUrl = ref(false)
const downloading = ref(false)
const savingTheme = ref(false)
const savingAppJson = ref(false)
const assets = ref<Array<{ name: string; path: string; previewUrl: string; size: number }>>([])
const uploadingAsset = ref(false)

// ============ 素材库 ============
async function loadAssets() {
  try {
    const res: any = await request.get('/admin/miniapp/code/assets')
    assets.value = res.data?.list || []
  } catch { /* 素材库加载失败不阻塞页面 */ }
}

function uploadAsset(file: any) {
  const raw = file?.raw
  if (!raw) return
  if (raw.size > 5 * 1024 * 1024) {
    ElMessage.error('图片不能超过 5MB')
    return
  }
  const reader = new FileReader()
  reader.onload = async () => {
    uploadingAsset.value = true
    try {
      await request.post('/admin/miniapp/code/assets', { name: raw.name, base64: String(reader.result) })
      ElMessage.success('素材已写入代码包')
      await loadAssets()
    } catch (e: any) {
      ElMessage.error(e?.message || '上传失败')
    } finally {
      uploadingAsset.value = false
    }
  }
  reader.readAsDataURL(raw)
}

async function copyAssetPath(p: string) {
  try {
    await navigator.clipboard.writeText(p)
    ElMessage.success(`已复制：${p}`)
  } catch {
    ElMessage.info(p)
  }
}

async function removeAsset(name: string) {
  try {
    await ElMessageBox.confirm(`确定删除素材 ${name} 吗？已引用它的组件会显示空白。`, '删除素材', { type: 'warning' })
  } catch {
    return
  }
  try {
    await request.delete(`/admin/miniapp/code/assets/${encodeURIComponent(name)}`)
    ElMessage.success('已删除')
    await loadAssets()
  } catch (e: any) {
    ElMessage.error(e?.message || '删除失败')
  }
}

const formatSize = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`)

async function loadApiUrl() {
  try {
    const res: any = await request.get('/admin/configs/platform.api_base_url')
    const v = res.data?.value || res.value
    apiBaseUrlCurrent.value = v?.apiBaseUrl || ''
    apiBaseUrl.value = v?.apiBaseUrl || ''
  } catch { /* 未配置过则留空 */ }
}

async function saveApiUrl() {
  const url = apiBaseUrl.value.trim()
  if (url && !/^https?:\/\//.test(url)) {
    ElMessage.error('域名必须以 http:// 或 https:// 开头')
    return
  }
  savingApiUrl.value = true
  try {
    await request.put('/admin/configs', {
      configs: [{ key: 'platform.api_base_url', value: { apiBaseUrl: url }, group: 'platform', desc: '小程序 API 域名' }],
    })
    apiBaseUrlCurrent.value = url
    ElMessage.success('已保存，小程序下次启动生效')
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败')
  } finally {
    savingApiUrl.value = false
  }
}

const isColor = (v: string) => /^#([0-9a-fA-F]{3,8})$/.test(v.trim()) || /^rgba?\(/.test(v.trim())
const markDirty = (name: string) => themeDirty.value.add(name)
const formatTime = (t: string) => (t ? new Date(t).toLocaleString('zh-CN') : '-')

async function loadInfo() {
  const res: any = await request.get('/admin/miniapp/code/info')
  info.value = res.data || res
}

async function loadTheme() {
  const res: any = await request.get('/admin/miniapp/code/theme')
  themeVars.value = res.data?.vars || []
  themeDirty.value = new Set()
}

async function loadAppJson() {
  const res: any = await request.get('/admin/miniapp/code/app-json')
  appJson.value = res.data || res
}

function loadAll() {
  loadInfo().catch(() => ElMessage.error('加载源码信息失败'))
  loadTheme().catch(() => ElMessage.error('加载主题变量失败'))
  loadAppJson().catch(() => ElMessage.error('加载 app.json 失败'))
  loadApiUrl()
  loadAssets()
}

async function saveTheme() {
  savingTheme.value = true
  try {
    const vars = themeVars.value.filter((v) => themeDirty.value.has(v.name))
    await request.put('/admin/miniapp/code/theme', { vars })
    ElMessage.success('主题已写入源码（需开发者工具重新上传）')
    themeDirty.value = new Set()
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败')
  } finally {
    savingTheme.value = false
  }
}

async function saveAppJson() {
  savingAppJson.value = true
  try {
    await request.put('/admin/miniapp/code/app-json', {
      window: appJson.value.window,
      tabBar: appJson.value.tabBar,
    })
    ElMessage.success('app.json 已写入源码（需开发者工具重新上传）')
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败')
  } finally {
    savingAppJson.value = false
  }
}

async function downloadZip() {
  downloading.value = true
  try {
    const blob: any = await request.get('/admin/miniapp/code/export', { responseType: 'blob', timeout: 120000 } as any)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    a.href = url
    a.download = `miniapp-${stamp}.zip`
    a.click()
    URL.revokeObjectURL(url)
    ElMessage.success('代码包已开始下载')
  } catch (e: any) {
    ElMessage.error(e?.message || '下载失败')
  } finally {
    downloading.value = false
  }
}

onMounted(loadAll)
</script>

<style scoped lang="scss">
.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 14px;
}
.info-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.i-label {
  color: var(--mx-muted);
  font-size: 12px;
}
.i-value {
  font-size: 14px;
  color: var(--mx-text);
  word-break: break-all;
}

.theme-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 10px 20px;
}
.theme-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border: 1px solid var(--mx-border);
  border-radius: 10px;
  background: var(--mx-soft);
}
.theme-name {
  flex: 0 0 130px;
  font-family: var(--mx-font-mono);
  font-size: 12px;
  color: var(--mx-sub);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.theme-control {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}
.theme-input {
  flex: 1;
}

.section-label {
  font-size: 13px;
  font-weight: 700;
  color: var(--mx-sub);
  margin: 18px 0 10px;
}
.section-label:first-child {
  margin-top: 0;
}
.tabbar-list {
  display: grid;
  gap: 8px;
}
.tabbar-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 8px 12px;
  border: 1px solid var(--mx-border);
  border-radius: 10px;
  background: var(--mx-soft);
}
.tabbar-path {
  font-family: var(--mx-font-mono);
  font-size: 12px;
  color: var(--mx-muted);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.api-tip {
  margin-top: 10px;
  color: var(--mx-muted);
  font-size: 12.5px;
}
.api-tip code {
  color: var(--el-color-primary);
}

.asset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 14px;
}
.asset-item {
  border: 1px solid var(--mx-border);
  border-radius: 12px;
  overflow: hidden;
  background: var(--mx-soft);
}
.asset-thumb {
  height: 96px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fff;
}
.asset-thumb img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
.asset-name {
  padding: 8px 10px 0;
  font-size: 12px;
  color: var(--mx-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.asset-meta {
  padding: 2px 10px 4px;
  font-size: 11px;
  color: var(--mx-muted);
}
.asset-ops {
  display: flex;
  justify-content: space-between;
  padding: 0 6px 6px;
}
</style>
