<template>
  <a-card title="小程序基础配置" :bordered="false">
    <a-form :label-col="{ span: 4 }" :wrapper-col="{ span: 14 }">
      <a-form-item label="应用名称">
        <a-input v-model:value="form.appName" placeholder="请输入小程序名称" />
      </a-form-item>
      <a-form-item label="应用描述">
        <a-textarea v-model:value="form.appDescription" placeholder="请输入应用描述" :rows="3" />
      </a-form-item>
      <a-form-item label="应用Logo">
        <UploadImage v-model="form.appLogo" :max-count="1" scene="config" />
      </a-form-item>
      <a-form-item label="客服电话">
        <a-input v-model:value="form.customerPhone" placeholder="400-xxx-xxxx" />
      </a-form-item>
      <a-form-item label="客服微信">
        <a-input v-model:value="form.customerWechat" placeholder="微信号" />
      </a-form-item>
      <a-form-item label="关于我们">
        <RichEditor v-model="form.aboutUs" placeholder="请输入关于我们内容" />
      </a-form-item>
      <a-form-item label="隐私政策">
        <RichEditor v-model="form.privacyPolicy" placeholder="请输入隐私政策内容" />
      </a-form-item>
      <a-form-item label="用户协议">
        <RichEditor v-model="form.userAgreement" placeholder="请输入用户协议内容" />
      </a-form-item>
      <a-form-item label="技术支持">
        <a-input v-model:value="form.techSupport" placeholder="技术支持信息" />
      </a-form-item>
      <a-form-item :wrapper-col="{ offset: 4, span: 14 }">
        <a-space>
          <a-button type="primary" :loading="saving" @click="onSave">保存配置</a-button>
          <a-popconfirm title="确定重置为默认值？" ok-text="确定" cancel-text="取消" @confirm="onReset">
            <a-button :loading="resetting">恢复默认</a-button>
          </a-popconfirm>
        </a-space>
      </a-form-item>
    </a-form>
  </a-card>
</template>

<script setup lang="ts">
import { reactive, ref, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { configApi } from '@/api/config'
import UploadImage from '@/components/common/UploadImage.vue'
import RichEditor from '@/components/common/RichEditor.vue'

const form = reactive({
  appName: '',
  appDescription: '',
  appLogo: '',
  customerPhone: '',
  customerWechat: '',
  aboutUs: '',
  privacyPolicy: '',
  userAgreement: '',
  techSupport: '',
})

const saving = ref(false)
const resetting = ref(false)

onMounted(async () => {
  try {
    const res = await configApi.getByGroup('basic')
    const items = (res.data?.data || res.data || []) as { key: string; value: string }[]
    items.forEach((item) => {
      if (item.key in form) {
        (form as Record<string, string>)[item.key] = item.value
      }
    })
  } catch {
    /* loaded defaults */
  }
})

async function onSave() {
  saving.value = true
  try {
    const configs = Object.entries(form).map(([key, value]) => ({ key, value: String(value) }))
    await configApi.save(configs)
    message.success('保存成功')
  } catch {
    message.error('保存失败')
  } finally {
    saving.value = false
  }
}

async function onReset() {
  resetting.value = true
  try {
    await configApi.reset('basic')
    const res = await configApi.getByGroup('basic')
    const items = (res.data?.data || res.data || []) as { key: string; value: string }[]
    items.forEach((item) => {
      if (item.key in form) {
        (form as Record<string, string>)[item.key] = item.value
      }
    })
    message.success('已重置为默认值')
  } catch {
    message.error('重置失败')
  } finally {
    resetting.value = false
  }
}
</script>
