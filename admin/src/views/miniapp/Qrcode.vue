<template>
  <div class="page-container">
    <div class="page-title mb-4">小程序码管理</div>

    <a-row :gutter="16">
      <a-col :span="10">
        <a-card title="生成小程序码">
          <a-form :model="form" layout="vertical">
            <a-form-item label="页面路径" required>
              <a-input v-model:value="form.path" placeholder="例如: pages/index/index" />
            </a-form-item>
            <a-form-item label="版本环境">
              <a-select v-model:value="form.envVersion" style="width: 100%">
                <a-select-option value="release">正式版</a-select-option>
                <a-select-option value="trial">体验版</a-select-option>
                <a-select-option value="develop">开发版</a-select-option>
              </a-select>
            </a-form-item>
            <a-form-item label="图片宽度(px)">
              <a-input-number v-model:value="form.width" :min="280" :max="1280" style="width: 100%" />
            </a-form-item>
            <a-form-item>
              <a-button type="primary" :loading="generating" @click="handleGenerate" block>生成小程序码</a-button>
            </a-form-item>
          </a-form>
        </a-card>
      </a-col>

      <a-col :span="14">
        <a-card title="预览与下载">
          <div v-if="qrcode" class="text-center">
            <img :src="qrcode" style="max-width: 300px; border-radius: 8px;" />
            <div class="mt-3">
              <a-button @click="handleDownload">下载小程序码</a-button>
            </div>
            <div class="mt-2 text-secondary" style="font-size: 12px;">页面路径: {{ currentPath }}</div>
          </div>
          <a-empty v-else description="请在左侧填写信息后生成小程序码" />
        </a-card>
      </a-col>
    </a-row>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { message } from 'ant-design-vue'
import { miniappApi } from '@/api'

const generating = ref(false)
const qrcode = ref('')
const currentPath = ref('')

const form = reactive({
  path: 'pages/index/index',
  envVersion: 'release',
  width: 430
})

const handleGenerate = async () => {
  if (!form.path) return message.warning('请填写页面路径')
  generating.value = true
  try {
    const res = await miniappApi.generateQrcode(form)
    qrcode.value = res.data.qrcode
    currentPath.value = res.data.path
    message.success('小程序码已生成')
  } catch (err: any) {
    message.error(err?.response?.data?.message || '生成失败，请检查微信配置')
  } finally {
    generating.value = false
  }
}

const handleDownload = () => {
  if (!qrcode.value) return
  const link = document.createElement('a')
  link.href = qrcode.value
  link.download = `miniapp_qrcode_${Date.now()}.png`
  link.click()
}
</script>
