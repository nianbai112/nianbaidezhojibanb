<template>
  <div class="page-container">
    <div class="page-title mb-4">笔记海报配置</div>

    <a-row :gutter="16">
      <a-col :span="14">
        <a-card title="海报样式设置">
          <a-spin :spinning="loading">
            <a-form :model="form" :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
              <a-form-item label="背景颜色">
                <a-input v-model:value="form.bgColor" type="color" style="width: 80px; height: 32px; padding: 2px;" />
                <span class="ml-2">{{ form.bgColor }}</span>
              </a-form-item>

              <a-form-item label="Logo URL">
                <a-input v-model:value="form.logoUrl" placeholder="海报顶部 Logo 图片链接" />
              </a-form-item>

              <a-form-item label="底部文案">
                <a-input v-model:value="form.footerText" placeholder="例如: 扫码查看更多精彩内容" />
              </a-form-item>

              <a-form-item label="二维码位置">
                <a-select v-model:value="form.qrcodePosition" style="width: 100%">
                  <a-select-option value="bottom-right">右下角</a-select-option>
                  <a-select-option value="bottom-left">左下角</a-select-option>
                  <a-select-option value="bottom-center">底部居中</a-select-option>
                </a-select>
              </a-form-item>

              <a-form-item label="展示用户头像">
                <a-switch v-model:checked="form.showAvatar" />
              </a-form-item>

              <a-form-item label="展示点赞数">
                <a-switch v-model:checked="form.showLikeCount" />
              </a-form-item>

              <a-form-item :wrapper-col="{ offset: 6 }">
                <a-button type="primary" :loading="saving" @click="handleSave">保存配置</a-button>
              </a-form-item>
            </a-form>
          </a-spin>
        </a-card>
      </a-col>

      <a-col :span="10">
        <a-card title="海报预览">
          <div :style="{ backgroundColor: form.bgColor, borderRadius: '8px', padding: '16px', minHeight: '200px', textAlign: 'center' }">
            <img v-if="form.logoUrl" :src="form.logoUrl" style="max-width: 80px; max-height: 40px;" />
            <div v-else style="height: 40px; background: #eee; border-radius: 4px; line-height: 40px; color: #999; font-size: 12px;">Logo 区域</div>
            <div style="margin-top: 12px; background: #f5f5f5; border-radius: 4px; padding: 8px; font-size: 12px; color: #666;">帖子内容区域</div>
            <div style="margin-top: 12px; font-size: 12px; color: #999;">{{ form.footerText }}</div>
          </div>
        </a-card>
      </a-col>
    </a-row>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { contentExtApi } from '@/api'

const loading = ref(false)
const saving = ref(false)

const form = reactive({
  bgColor: '#ffffff',
  logoUrl: '',
  footerText: '扫码查看更多',
  qrcodePosition: 'bottom-right',
  showAvatar: true,
  showLikeCount: true,
})

const fetchConfig = async () => {
  loading.value = true
  try {
    const res = await contentExtApi.getPosterConfig()
    if (res.data) Object.assign(form, res.data)
  } finally { loading.value = false }
}

const handleSave = async () => {
  saving.value = true
  try {
    await contentExtApi.updatePosterConfig(form)
    message.success('海报配置已保存')
  } finally { saving.value = false }
}

onMounted(() => fetchConfig())
</script>
