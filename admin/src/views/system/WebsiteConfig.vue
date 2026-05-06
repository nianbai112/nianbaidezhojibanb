<template>
  <div class="detail-page">
    <div class="detail-header">
      <div><span class="page-title">网站信息配置</span>
        <p class="page-desc">用于设置小程序/网站的全局展示信息</p>
      </div>
      <a-button type="primary" :loading="saving" @click="handleSave">保存配置</a-button>
    </div>

    <div class="detail-section">
      <a-form :label-col="{ flex: '140px' }" :wrapper-col="{ flex: '520px' }" :model="form" layout="horizontal">
        <a-form-item label="网站名称">
          <a-input v-model:value="form.siteName" placeholder="例如：灵萌校园" allow-clear />
        </a-form-item>

        <a-form-item label="网站简称">
          <a-input v-model:value="form.siteShortName" placeholder="例如：灵萌" allow-clear />
        </a-form-item>

        <a-form-item label="网站 Logo">
          <a-input v-model:value="form.siteLogo" placeholder="Logo 图片链接地址" allow-clear />
          <template v-if="form.siteLogo">
            <img :src="form.siteLogo" class="logo-preview" />
          </template>
        </a-form-item>

        <a-divider />

        <a-form-item label="ICP 备案号">
          <a-input v-model:value="form.icpNumber" placeholder="例如：京ICP备2024000000号" allow-clear />
        </a-form-item>

        <a-form-item label="公安备案号">
          <a-input v-model:value="form.policeNumber" placeholder="例如：京公网安备 11010802000000号" allow-clear />
        </a-form-item>

        <a-form-item label="公安备案链接">
          <a-input v-model:value="form.policeLink" placeholder="公安备案查询链接" allow-clear />
        </a-form-item>

        <a-divider />

        <a-form-item label="版权信息">
          <a-textarea v-model:value="form.copyright" placeholder="例如：© 2024 灵萌科技 All Rights Reserved" :rows="3" />
        </a-form-item>
      </a-form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { systemApi } from '@/api/system'

const saving = ref(false)

const form = reactive({
  siteName: '',
  siteShortName: '',
  siteLogo: '',
  icpNumber: '',
  policeNumber: '',
  policeLink: '',
  copyright: '',
})

onMounted(loadConfig)

async function loadConfig() {
  try {
    const res = await systemApi.getWebsiteInfo()
    const data = (res.data?.data || res.data || {}) as Record<string, any>
    Object.assign(form, {
      siteName: data.siteName || '',
      siteShortName: data.siteShortName || '',
      siteLogo: data.siteLogo || '',
      icpNumber: data.icpNumber || '',
      policeNumber: data.policeNumber || '',
      policeLink: data.policeLink || '',
      copyright: data.copyright || '',
    })
  } catch {
    // use defaults
  }
}

async function handleSave() {
  saving.value = true
  try {
    await systemApi.saveWebsiteInfo({ ...form })
    message.success('网站信息已保存')
  } catch (err: any) {
    message.error(err?.response?.data?.message || '保存失败')
  } finally {
    saving.value = false
  }
}
</script>

<style scoped lang="less">
.detail-page {
  padding: 24px;
}
.detail-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 20px;
}
.page-title {
  font-size: 18px;
  font-weight: 600;
  color: #111827;
}
.page-desc {
  margin: 4px 0 0;
  color: #6b7280;
  font-size: 13px;
}
.detail-section {
  background: #fff;
  border-radius: 8px;
  padding: 24px;
}
.logo-preview {
  margin-top: 8px;
  max-width: 160px;
  max-height: 80px;
  border-radius: 4px;
}
</style>
