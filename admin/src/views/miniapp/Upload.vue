<template>
  <div class="page-container">
    <div class="page-title mb-4">小程序上传记录</div>

    <a-row :gutter="16">
      <a-col :span="12">
        <a-card title="当前版本信息" :loading="loading">
          <a-descriptions :column="1" bordered>
            <a-descriptions-item label="版本号">{{ versionInfo.version || 'N/A' }}</a-descriptions-item>
            <a-descriptions-item label="描述">{{ versionInfo.desc || '-' }}</a-descriptions-item>
            <a-descriptions-item label="上传时间">{{ versionInfo.uploadedAt ? new Date(versionInfo.uploadedAt).toLocaleString() : '-' }}</a-descriptions-item>
          </a-descriptions>
        </a-card>
      </a-col>

      <a-col :span="12">
        <a-card title="记录新版本上传">
          <a-form :model="form" layout="vertical">
            <a-form-item label="版本号" required>
              <a-input v-model:value="form.version" placeholder="例如: 1.2.3" />
            </a-form-item>
            <a-form-item label="版本描述">
              <a-textarea v-model:value="form.desc" :rows="3" placeholder="本次更新内容描述..." />
            </a-form-item>
            <a-form-item>
              <a-button type="primary" :loading="saving" @click="handleRecord" block>
                记录此次上传
              </a-button>
            </a-form-item>
          </a-form>
        </a-card>
      </a-col>
    </a-row>

    <a-card class="mt-4" title="微信开发者工具上传说明">
      <a-alert
        type="info"
        show-icon
        message="小程序代码上传流程"
        description="1. 在本地修改完小程序代码后，打开「微信开发者工具」。 2. 点击顶部「上传」按钮，填写版本号和描述。 3. 上传成功后，登录微信公众平台 → 版本管理，提交审核。 4. 审核通过后在此系统中记录版本信息，方便后续追踪。"
      />
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { miniappApi } from '@/api'

const loading = ref(false)
const saving = ref(false)
const versionInfo = ref<any>({ version: '', desc: '', uploadedAt: null })
const form = reactive({ version: '', desc: '' })

const fetchVersion = async () => {
  loading.value = true
  try {
    const res = await miniappApi.getVersionInfo()
    versionInfo.value = res.data || {}
  } finally {
    loading.value = false
  }
}

const handleRecord = async () => {
  if (!form.version) return message.warning('请填写版本号')
  saving.value = true
  try {
    const res = await miniappApi.recordUpload(form)
    versionInfo.value = res.data
    message.success('版本信息已记录')
    form.version = ''
    form.desc = ''
  } finally {
    saving.value = false
  }
}

onMounted(() => fetchVersion())
</script>
