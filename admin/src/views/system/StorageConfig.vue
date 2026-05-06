<template>
  <div class="storage-page">
    <div class="page-head">
      <div>
        <h2>文件存储配置</h2>
        <p>用于小程序图片、视频、帖子素材、二维码等文件上传。</p>
      </div>
      <a-space>
        <a-button :loading="loading" @click="loadConfig">刷新</a-button>
        <a-button :loading="testing" @click="testConfig">测试连接</a-button>
        <a-button type="primary" :loading="saving" @click="saveConfig">保存配置</a-button>
      </a-space>
    </div>

    <a-alert
      class="notice"
      type="info"
      show-icon
      message="腾讯云 COS 信息在腾讯云控制台获取：对象存储 COS -> 存储桶列表 -> 存储桶详情；SecretId / SecretKey 在访问管理 CAM -> API 密钥管理。"
    />

    <a-form
      class="config-form"
      layout="horizontal"
      :label-col="{ flex: '132px' }"
      :wrapper-col="{ flex: '640px' }"
    >
      <a-tabs v-model:active-key="activeTab">
        <a-tab-pane key="mini" tab="小程序配置" />
        <a-tab-pane key="official" tab="公众号配置" />
        <a-tab-pane key="storage" tab="存储配置" />
        <a-tab-pane key="pay" tab="支付配置" />
        <a-tab-pane key="sms" tab="短信配置" />
        <a-tab-pane key="ai" tab="AI 配置" />
        <a-tab-pane key="other" tab="其他配置" />
      </a-tabs>

      <template v-if="activeTab === 'storage'">
        <a-form-item label="存储模式" required>
          <a-select v-model:value="form.type" placeholder="请选择存储模式">
            <a-select-option value="tencent_cos">腾讯云 COS</a-select-option>
            <a-select-option value="local">本地存储</a-select-option>
            <a-select-option value="aliyun_oss">阿里云 OSS</a-select-option>
            <a-select-option value="qiniu">七牛云</a-select-option>
          </a-select>
        </a-form-item>

        <template v-if="form.type === 'tencent_cos'">
          <a-form-item label="SecretId" required>
            <a-input v-model:value="form.secretId" placeholder="如 AKIDxxxxxxxxxxxxxxxx" allow-clear />
            <div class="hint">腾讯云 CAM 的 API 密钥 SecretId，不是小程序 AppID。</div>
          </a-form-item>

          <a-form-item label="SecretKey" required>
            <a-input-password v-model:value="form.secretKey" placeholder="请输入腾讯云 SecretKey" />
            <div class="hint">敏感信息保存后不会在页面明文展示给普通人员。</div>
          </a-form-item>

          <a-form-item label="存储桶" required>
            <a-input v-model:value="form.bucket" placeholder="如 nianbai-1340278115" allow-clear />
            <div class="hint">填写 Bucket 名称，不要填写完整域名。</div>
          </a-form-item>

          <a-form-item label="所属地域" required>
            <a-select v-model:value="form.region" show-search placeholder="请选择存储桶地域">
              <a-select-option v-for="region in cosRegions" :key="region.value" :value="region.value">
                {{ region.label }}
              </a-select-option>
            </a-select>
          </a-form-item>

          <a-form-item label="访问域名" required>
            <a-input v-model:value="form.domain" placeholder="如 https://xxx.cos.ap-chongqing.myqcloud.com" allow-clear />
            <div class="hint">可填写 COS 默认访问域名，也可以填写已绑定 CDN 的域名。</div>
          </a-form-item>
        </template>

        <a-form-item label="删除 URL">
          <a-input v-model:value="form.deleteUrl" placeholder="可选：图片删除接口地址，不填则使用系统默认逻辑" allow-clear />
        </a-form-item>

        <a-form-item label="禁止上传文件">
          <a-select
            v-model:value="form.blockedExts"
            mode="tags"
            placeholder="如 exe、bat、sh、php，输入后回车"
            :token-separators="[',', '，', ' ']"
          />
          <div class="hint">只填后缀名，不需要点号。例如 jpg、png、mp4 是允许文件，exe、php 是禁止文件。</div>
        </a-form-item>

        <a-form-item label="大小限制">
          <a-input-number v-model:value="form.maxSize" :min="1" :max="500" addon-after="MB" />
          <div class="hint">单个文件最大上传大小。建议图片 10MB，视频按业务需要提高。</div>
        </a-form-item>

        <a-form-item :wrapper-col="{ offset: 0 }">
          <a-space>
            <a-button type="primary" :loading="saving" @click="saveConfig">保存配置</a-button>
            <a-button :loading="testing" @click="testConfig">测试连接</a-button>
            <a-button @click="fillCosDomain">自动生成访问域名</a-button>
          </a-space>
        </a-form-item>
      </template>

      <a-empty v-else description="该配置页后续可继续合并到这里管理" />
    </a-form>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { message } from 'ant-design-vue'
import { systemApi } from '@/api/system'

const activeTab = ref('storage')
const loading = ref(false)
const saving = ref(false)
const testing = ref(false)

const form = reactive({
  type: 'tencent_cos',
  secretId: '',
  secretKey: '',
  bucket: '',
  region: 'ap-chongqing',
  domain: '',
  deleteUrl: '',
  blockedExts: ['exe', 'bat', 'sh', 'php', 'jsp'],
  maxSize: 30,
})

const cosRegions = [
  { label: '北京 ap-beijing', value: 'ap-beijing' },
  { label: '上海 ap-shanghai', value: 'ap-shanghai' },
  { label: '广州 ap-guangzhou', value: 'ap-guangzhou' },
  { label: '重庆 ap-chongqing', value: 'ap-chongqing' },
  { label: '成都 ap-chengdu', value: 'ap-chengdu' },
  { label: '南京 ap-nanjing', value: 'ap-nanjing' },
  { label: '香港 ap-hongkong', value: 'ap-hongkong' },
  { label: '新加坡 ap-singapore', value: 'ap-singapore' },
]

onMounted(loadConfig)

async function loadConfig() {
  loading.value = true
  try {
    const res = await systemApi.getStorageConfig()
    const data = (res.data?.data || res.data || {}) as Record<string, any>

    form.type = data.type || data.storageMode || 'tencent_cos'
    form.secretId = data.secretId || data.accessKey || data.COS_SECRET_ID || ''
    form.secretKey = data.secretKey || data.COS_SECRET_KEY || ''
    form.bucket = data.bucket || data.COS_BUCKET || ''
    form.region = data.region || data.endpoint || data.COS_REGION || 'ap-chongqing'
    form.domain = data.domain || data.cdnDomain || data.COS_DOMAIN || ''
    form.deleteUrl = data.deleteUrl || ''
    form.maxSize = Number(data.maxSize || data.maxUploadMb || 30)
    form.blockedExts = Array.isArray(data.blockedExts)
      ? data.blockedExts
      : String(data.blockedExts || 'exe,bat,sh,php,jsp').split(',').map((item) => item.trim()).filter(Boolean)
  } catch {
    message.warning('读取配置失败，已使用默认值')
  } finally {
    loading.value = false
  }
}

function fillCosDomain() {
  if (!form.bucket || !form.region) {
    message.warning('请先填写存储桶和所属地域')
    return
  }
  form.domain = `https://${form.bucket}.cos.${form.region}.myqcloud.com`
}

function buildStoragePayload() {
  return {
    type: form.type,
    secretId: form.secretId,
    secretKey: form.secretKey,
    bucket: form.bucket,
    region: form.region,
    domain: form.domain,
    deleteUrl: form.deleteUrl,
    blockedExts: form.blockedExts,
    maxSize: form.maxSize,

    // 兼容旧字段，避免后端仍按旧命名读取时丢配置。
    accessKey: form.secretId,
    endpoint: form.region,
    cdnDomain: form.domain,
  }
}

async function testConfig() {
  if (form.type !== 'tencent_cos') {
    message.warning('当前只支持测试腾讯云 COS')
    return
  }

  testing.value = true
  try {
    const res = await systemApi.testStorageConfig(buildStoragePayload())
    const data = (res.data?.data || res.data || {}) as any
    const msg = data?.message || '连接成功，存储桶可访问'
    message.success(msg)
  } catch (err: any) {
    const msg = err?.response?.data?.message || err?.message || 'COS 测试失败'
    message.error(msg)
  } finally {
    testing.value = false
  }
}

async function saveConfig() {
  if (form.type === 'tencent_cos') {
    if (!form.secretId || !form.secretKey || !form.bucket || !form.region || !form.domain) {
      message.warning('请完整填写腾讯云 COS 配置')
      return
    }
  }

  saving.value = true
  try {
    await systemApi.saveStorageConfig(buildStoragePayload())
    message.success('文件存储配置已保存')
  } catch {
    message.error('保存失败')
  } finally {
    saving.value = false
  }
}
</script>

<style scoped lang="less">
.storage-page {
  padding: 24px;
}

.page-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;

  h2 {
    margin: 0;
    color: #111827;
    font-size: 20px;
    font-weight: 600;
  }

  p {
    margin: 6px 0 0;
    color: #6b7280;
  }
}

.notice {
  margin-bottom: 16px;
}

.config-form {
  padding: 20px 24px 28px;
  background: #fff;
  border-radius: 8px;
}

.hint {
  margin-top: 6px;
  color: #8c8c8c;
  font-size: 12px;
  line-height: 1.5;
}

:deep(.ant-tabs-nav) {
  margin-bottom: 24px;
}

:deep(.ant-input-number) {
  width: 220px;
}
</style>
