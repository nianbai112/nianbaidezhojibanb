<template>
  <div class="panel-container">
    <!-- 存储配置 -->
    <div class="glass-card">
      <div class="card-header"><div class="card-title">存储配置</div></div>
      <div class="card-body">
        <el-form label-position="top">
          <div class="form-grid two">
            <el-form-item label="上传方式">
              <el-select v-model="form.provider" style="width: 100%" @change="onProviderChange">
                <el-option label="本地存储" value="local" />
                <el-option label="腾讯云 COS" value="cos" />
                <el-option label="阿里云 OSS" value="oss" />
                <el-option label="AWS S3" value="s3" />
                <el-option label="MinIO" value="minio" />
              </el-select>
            </el-form-item>
            <el-form-item label="CDN 域名（可选）">
              <el-input v-model="form.domain" placeholder="不填则自动使用 COS 默认访问域名" />
            </el-form-item>
            <el-form-item label="上传路径前缀（可选）">
              <el-input v-model="form.uploadPrefix" placeholder="如：uploads/；不填则使用业务默认目录" />
            </el-form-item>
          </div>
        </el-form>
      </div>
    </div>

    <!-- 腾讯云 COS 配置 -->
    <div v-if="form.provider === 'cos'" class="glass-card">
      <div class="card-header">
        <div class="card-title">腾讯云 COS 配置</div>
        <el-button size="small" type="primary" @click="testConnection('cos')" :loading="testing">测试连接</el-button>
      </div>
      <div class="card-body">
        <el-form label-position="top">
          <div class="form-grid two">
            <el-form-item label="SecretId">
              <el-input v-model="form.cos.secretId" placeholder="请输入 SecretId" show-password />
            </el-form-item>
            <el-form-item label="SecretKey">
              <el-input v-model="form.cos.secretKey" placeholder="请输入 SecretKey" show-password />
            </el-form-item>
            <el-form-item label="存储桶名称">
              <el-input v-model="form.cos.bucket" placeholder="如：nianbai-1340278115" />
            </el-form-item>
            <el-form-item label="城市选择">
              <el-select v-model="form.cos.region" placeholder="请选择存储桶所在城市" filterable style="width: 100%">
                <el-option-group
                  v-for="group in cosRegionGroups"
                  :key="group.label"
                  :label="group.label"
                >
                  <el-option
                    v-for="item in group.options"
                    :key="item.value"
                    :label="item.label"
                    :value="item.value"
                  />
                </el-option-group>
              </el-select>
              <div class="form-tip">请选择腾讯云 COS 存储桶创建时的城市，不要填写完整网址。</div>
            </el-form-item>
          </div>
        </el-form>
      </div>
    </div>

    <!-- 阿里云 OSS 配置 -->
    <div v-if="form.provider === 'oss'" class="glass-card">
      <div class="card-header">
        <div class="card-title">阿里云 OSS 配置</div>
        <el-tag type="warning" size="small">待配置</el-tag>
      </div>
      <div class="card-body">
        <el-alert title="阿里云 OSS 支持正在开发中，敬请期待" type="info" show-icon :closable="false" />
        <el-form label-position="top" style="margin-top: 16px; opacity: 0.6">
          <div class="form-grid two">
            <el-form-item label="AccessKeyId">
              <el-input v-model="form.oss.accessKeyId" placeholder="请输入 AccessKeyId" show-password disabled />
            </el-form-item>
            <el-form-item label="AccessKeySecret">
              <el-input v-model="form.oss.accessKeySecret" placeholder="请输入 AccessKeySecret" show-password disabled />
            </el-form-item>
            <el-form-item label="Bucket">
              <el-input v-model="form.oss.bucket" placeholder="如：my-bucket" disabled />
            </el-form-item>
            <el-form-item label="Endpoint">
              <el-input v-model="form.oss.endpoint" placeholder="如：oss-cn-hangzhou.aliyuncs.com" disabled />
            </el-form-item>
            <el-form-item label="Region">
              <el-input v-model="form.oss.region" placeholder="如：cn-hangzhou" disabled />
            </el-form-item>
          </div>
        </el-form>
      </div>
    </div>

    <!-- AWS S3 配置 -->
    <div v-if="form.provider === 's3'" class="glass-card">
      <div class="card-header">
        <div class="card-title">AWS S3 配置</div>
        <el-tag type="warning" size="small">待配置</el-tag>
      </div>
      <div class="card-body">
        <el-alert title="AWS S3 支持正在开发中，敬请期待" type="info" show-icon :closable="false" />
        <el-form label-position="top" style="margin-top: 16px; opacity: 0.6">
          <div class="form-grid two">
            <el-form-item label="AccessKey">
              <el-input v-model="form.s3.accessKey" placeholder="请输入 AccessKey" show-password disabled />
            </el-form-item>
            <el-form-item label="SecretKey">
              <el-input v-model="form.s3.secretKey" placeholder="请输入 SecretKey" show-password disabled />
            </el-form-item>
            <el-form-item label="Bucket">
              <el-input v-model="form.s3.bucket" placeholder="如：my-bucket" disabled />
            </el-form-item>
            <el-form-item label="Region">
              <el-input v-model="form.s3.region" placeholder="如：us-east-1" disabled />
            </el-form-item>
            <el-form-item label="Endpoint">
              <el-input v-model="form.s3.endpoint" placeholder="可选，用于自定义端点" disabled />
            </el-form-item>
            <el-form-item label="Path Style">
              <el-switch v-model="form.s3.pathStyle" disabled />
              <span class="form-tip">MinIO 等兼容 S3 的存储需要开启</span>
            </el-form-item>
          </div>
        </el-form>
      </div>
    </div>

    <!-- MinIO 配置 -->
    <div v-if="form.provider === 'minio'" class="glass-card">
      <div class="card-header">
        <div class="card-title">MinIO 配置</div>
        <el-tag type="warning" size="small">待配置</el-tag>
      </div>
      <div class="card-body">
        <el-alert title="MinIO 支持正在开发中，敬请期待" type="info" show-icon :closable="false" />
        <el-form label-position="top" style="margin-top: 16px; opacity: 0.6">
          <div class="form-grid two">
            <el-form-item label="AccessKey">
              <el-input v-model="form.minio.accessKey" placeholder="请输入 AccessKey" show-password disabled />
            </el-form-item>
            <el-form-item label="SecretKey">
              <el-input v-model="form.minio.secretKey" placeholder="请输入 SecretKey" show-password disabled />
            </el-form-item>
            <el-form-item label="Bucket">
              <el-input v-model="form.minio.bucket" placeholder="如：my-bucket" disabled />
            </el-form-item>
            <el-form-item label="Endpoint">
              <el-input v-model="form.minio.endpoint" placeholder="如：http://localhost:9000" disabled />
            </el-form-item>
            <el-form-item label="Region">
              <el-input v-model="form.minio.region" placeholder="可选" disabled />
            </el-form-item>
            <el-form-item label="Path Style">
              <el-switch v-model="form.minio.pathStyle" disabled />
              <span class="form-tip">MinIO 默认使用 Path Style</span>
            </el-form-item>
          </div>
        </el-form>
      </div>
    </div>

    <!-- 本地存储配置 -->
    <div v-if="form.provider === 'local'" class="glass-card">
      <div class="card-header">
        <div class="card-title">本地存储配置</div>
        <el-button size="small" type="primary" @click="testConnection('local')" :loading="testing">测试目录</el-button>
      </div>
      <div class="card-body">
        <el-form label-position="top">
          <div class="form-grid two">
            <el-form-item label="本地上传目录">
              <el-input v-model="form.local.uploadDir" placeholder="如：uploads" />
            </el-form-item>
            <el-form-item label="访问域名">
              <el-input v-model="form.local.accessUrl" placeholder="如：http://localhost:3000/uploads" />
            </el-form-item>
          </div>
        </el-form>
      </div>
    </div>

    <!-- 文件限制 -->
    <div class="glass-card">
      <div class="card-header"><div class="card-title">文件限制</div></div>
      <div class="card-body">
        <el-form label-position="top">
          <div class="form-grid three">
            <el-form-item label="最大图片大小 (MB)">
              <el-input-number v-model="form.limits.maxImageSize" :min="1" :max="50" style="width: 100%" />
            </el-form-item>
            <el-form-item label="最大视频大小 (MB)">
              <el-input-number v-model="form.limits.maxVideoSize" :min="1" :max="500" style="width: 100%" />
            </el-form-item>
            <el-form-item label="最大文件大小 (MB)">
              <el-input-number v-model="form.limits.maxFileSize" :min="1" :max="100" style="width: 100%" />
            </el-form-item>
          </div>
          <div class="form-grid three" style="margin-top: 16px">
            <el-form-item label="允许的图片格式">
              <el-input v-model="form.limits.allowedImageFormats" placeholder="如：jpg,png,gif,webp" />
            </el-form-item>
            <el-form-item label="允许的视频格式">
              <el-input v-model="form.limits.allowedVideoFormats" placeholder="如：mp4,mov,avi" />
            </el-form-item>
            <el-form-item label="允许的文件格式">
              <el-input v-model="form.limits.allowedFileFormats" placeholder="如：pdf,doc,docx,xls,xlsx" />
            </el-form-item>
          </div>
        </el-form>
      </div>
    </div>

    <!-- 图片处理 -->
    <div class="glass-card">
      <div class="card-header"><div class="card-title">图片处理</div></div>
      <div class="card-body">
        <div class="switch-grid">
          <div class="switch-item">
            <div>
              <div class="switch-label">图片压缩</div>
              <div class="switch-desc">上传时自动压缩图片，减少存储空间</div>
            </div>
            <el-switch v-model="form.imageCompression" />
          </div>
          <div class="switch-item">
            <div>
              <div class="switch-label">图片水印</div>
              <div class="switch-desc">上传时自动添加平台水印</div>
            </div>
            <el-switch v-model="form.imageWatermark" />
          </div>
        </div>
      </div>
    </div>

    <!-- 最近上传文件 -->
    <div class="glass-card">
      <div class="card-header">
        <div class="card-title">最近上传文件</div>
        <el-button size="small" @click="loadFiles" :loading="loadingFiles">刷新</el-button>
      </div>
      <div class="card-body">
        <el-table :data="files" v-loading="loadingFiles" style="width: 100%">
          <el-table-column prop="originalName" label="文件名" show-overflow-tooltip />
          <el-table-column prop="fileType" label="类型" width="100" />
          <el-table-column label="大小" width="100">
            <template #default="{ row }">{{ formatSize(row.size) }}</template>
          </el-table-column>
          <el-table-column prop="scene" label="用途" width="100" />
          <el-table-column label="上传时间" width="180">
            <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
          </el-table-column>
        </el-table>
      </div>
    </div>

    <!-- 操作按钮 -->
    <div class="panel-actions">
      <el-button @click="load" :loading="loading">刷新</el-button>
      <el-button type="primary" :loading="saving" @click="save">保存配置</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { fetchStorageConfig, saveStorageConfig, testStorageConfig, fetchUploadFiles } from '@/api/admin'

const loading = ref(false)
const saving = ref(false)
const testing = ref(false)
const loadingFiles = ref(false)
const files = ref<any[]>([])

const MASK = '******'

const defaultCos = { secretId: '', secretKey: '', bucket: '', region: '' }
const defaultOss = { accessKeyId: '', accessKeySecret: '', bucket: '', endpoint: '', region: '' }
const defaultS3 = { accessKey: '', secretKey: '', bucket: '', region: '', endpoint: '', pathStyle: false }
const defaultMinio = { accessKey: '', secretKey: '', bucket: '', endpoint: '', region: '', pathStyle: true }
const defaultLocal = { uploadDir: 'uploads', accessUrl: '' }
const cosRegionGroups = [
  {
    label: '中国大陆',
    options: [
      { label: '北京 ap-beijing', value: 'ap-beijing' },
      { label: '南京 ap-nanjing', value: 'ap-nanjing' },
      { label: '上海 ap-shanghai', value: 'ap-shanghai' },
      { label: '广州 ap-guangzhou', value: 'ap-guangzhou' },
      { label: '成都 ap-chengdu', value: 'ap-chengdu' },
      { label: '重庆 ap-chongqing', value: 'ap-chongqing' }
    ]
  },
  {
    label: '中国港澳台与海外',
    options: [
      { label: '中国香港 ap-hongkong', value: 'ap-hongkong' },
      { label: '新加坡 ap-singapore', value: 'ap-singapore' },
      { label: '东京 ap-tokyo', value: 'ap-tokyo' },
      { label: '首尔 ap-seoul', value: 'ap-seoul' },
      { label: '曼谷 ap-bangkok', value: 'ap-bangkok' },
      { label: '硅谷 na-siliconvalley', value: 'na-siliconvalley' },
      { label: '弗吉尼亚 na-ashburn', value: 'na-ashburn' },
      { label: '法兰克福 eu-frankfurt', value: 'eu-frankfurt' }
    ]
  }
]
const defaultLimits = {
  maxImageSize: 10,
  maxVideoSize: 100,
  maxFileSize: 20,
  allowedImageFormats: 'jpg,png,gif,webp',
  allowedVideoFormats: 'mp4,mov,avi',
  allowedFileFormats: 'pdf,doc,docx,xls,xlsx'
}

const form = reactive<Record<string, any>>({
  provider: 'local',
  domain: '',
  uploadPrefix: '',
  cos: { ...defaultCos },
  oss: { ...defaultOss },
  s3: { ...defaultS3 },
  minio: { ...defaultMinio },
  local: { ...defaultLocal },
  limits: { ...defaultLimits },
  imageCompression: true,
  imageWatermark: false
})

function formatSize(size: number) {
  if (!size) return '-'
  if (size < 1024) return size + ' B'
  if (size < 1024 * 1024) return (size / 1024).toFixed(1) + ' KB'
  return (size / (1024 * 1024)).toFixed(1) + ' MB'
}

function formatDate(date: string) {
  if (!date) return '-'
  return new Date(date).toLocaleString('zh-CN')
}

function onProviderChange() {
  // 切换 provider 时无需额外操作
}

function normalizeCosRegion(value: any): string {
  const text = String(value || '').trim()
  if (!text) return ''
  const matched = text.match(/cos\.([a-z0-9-]+)\.myqcloud\.com/i)
  return matched?.[1] || text
}

// 标记哪些字段是敏感的（需要脱敏）
const SECRET_FIELDS = ['secretId', 'secretKey', 'accessKeyId', 'accessKeySecret', 'accessKey', 'apiKey']

function maskValue(val: any): string {
  if (!val || val === MASK) return MASK
  return MASK
}

function applyMask(data: Record<string, any>) {
  if (!data || typeof data !== 'object') return
  for (const key of Object.keys(data)) {
    if (SECRET_FIELDS.includes(key) && data[key]) {
      data[key] = MASK
    }
  }
}

// 处理响应数据，对敏感字段脱敏
function processResponse(data: any) {
  if (!data || typeof data !== 'object') return data
  const result = { ...data }

  // 对 provider 配置进行脱敏
  if (result.cos) applyMask(result.cos)
  if (result.oss) applyMask(result.oss)
  if (result.s3) applyMask(result.s3)
  if (result.minio) applyMask(result.minio)

  return result
}

// 保存时处理：如果值是 ******，则不发送（保留旧值）
function prepareForSave(data: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {}

  for (const [key, value] of Object.entries(data)) {
    if (key === 'cos' || key === 'oss' || key === 's3' || key === 'minio') {
      result[key] = {}
      if (value && typeof value === 'object') {
        for (const [k, v] of Object.entries(value as Record<string, any>)) {
          // 如果是敏感字段且值是 ******，不发送（保留旧值）
          if (SECRET_FIELDS.includes(k) && v === MASK) {
            continue
          }
          result[key][k] = key === 'cos' && k === 'region' ? normalizeCosRegion(v) : v
        }
      }
    } else {
      result[key] = value
    }
  }

  return result
}

async function load() {
  loading.value = true
  try {
    const data = await fetchStorageConfig()
    if (data && typeof data === 'object') {
      const processed = processResponse(data)
      // 合并数据
      for (const [key, value] of Object.entries(processed)) {
        if (key in form) {
          if (key === 'cos' || key === 'oss' || key === 's3' || key === 'minio' || key === 'local' || key === 'limits') {
            if (value && typeof value === 'object') {
              form[key] = { ...form[key], ...value }
              if (key === 'cos') form.cos.region = normalizeCosRegion(form.cos.region)
            }
          } else {
            form[key] = value
          }
        }
      }
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '加载存储配置失败')
  } finally {
    loading.value = false
  }
}

async function loadFiles() {
  loadingFiles.value = true
  try {
    const res: any = await fetchUploadFiles({ pageSize: 10 })
    files.value = res?.list || res?.data?.list || res?.data || []
  } catch (e: any) {
    ElMessage.error(e?.message || '加载上传文件失败')
  } finally {
    loadingFiles.value = false
  }
}

async function save() {
  saving.value = true
  try {
    const data = prepareForSave({ ...form })
    await saveStorageConfig(data)
    ElMessage.success('存储上传配置已保存')
    // 重新加载以获取最新的脱敏数据
    await load()
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

async function testConnection(provider: string) {
  testing.value = true
  try {
    const data = prepareForSave({ ...form })
    const res: any = await testStorageConfig({ provider, ...data[provider] })
    if (res?.success) {
      ElMessage.success(res?.message || '连接测试成功')
    } else {
      ElMessage.error(res?.message || '连接测试失败')
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '连接测试失败')
  } finally {
    testing.value = false
  }
}

onMounted(() => {
  load()
  loadFiles()
})
</script>

<style scoped>
.panel-container {
  display: grid;
  gap: 24px;
}
.switch-grid {
  display: grid;
  gap: 16px;
}
.switch-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-radius: 14px;
  background: rgba(248, 250, 252, 0.8);
  border: 1px solid rgba(226, 232, 240, 0.6);
}
.switch-label {
  font-weight: 700;
  font-size: 14px;
  margin-bottom: 4px;
}
.switch-desc {
  color: #94a3b8;
  font-size: 12px;
}
.panel-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding-top: 16px;
}
.form-tip {
  color: #94a3b8;
  font-size: 12px;
  margin-left: 8px;
}
</style>
