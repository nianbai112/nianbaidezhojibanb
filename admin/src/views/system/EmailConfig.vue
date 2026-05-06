<template>
  <div class="detail-page">
    <div class="detail-header">
      <div><span class="page-title">邮箱配置</span>
        <p class="page-desc">配置 SMTP 邮件服务，用于系统通知、验证码等邮件发送</p>
      </div>
      <a-space>
        <a-button :loading="testing" @click="showTestModal = true">测试发送</a-button>
        <a-button type="primary" :loading="saving" @click="handleSave">保存配置</a-button>
      </a-space>
    </div>

    <div class="detail-section">
      <a-form :label-col="{ flex: '140px' }" :wrapper-col="{ flex: '520px' }" :model="form" layout="horizontal">
        <a-form-item label="SMTP 服务器" required>
          <a-input v-model:value="form.host" placeholder="例如：smtp.qq.com" allow-clear />
        </a-form-item>

        <a-form-item label="端口" required>
          <a-input-number v-model:value="form.port" :min="1" :max="65535" style="width:180px" />
          <span class="hint-inline">常用端口：465(SSL) / 587(TLS) / 25</span>
        </a-form-item>

        <a-form-item label="使用 SSL">
          <a-switch v-model:checked="form.secure" />
          <span class="hint-inline">端口 465 通常开启 SSL，587 关闭</span>
        </a-form-item>

        <a-form-item label="发件邮箱" required>
          <a-input v-model:value="form.user" placeholder="例如：admin@example.com" allow-clear />
        </a-form-item>

        <a-form-item label="邮箱密码/授权码" required>
          <a-input-password v-model:value="form.pass" placeholder="QQ邮箱需使用授权码而非密码" />
          <div class="hint">敏感信息，保存后以 *** 显示。不修改留空即可保留原密码。</div>
        </a-form-item>

        <a-divider />

        <a-form-item label="发件人邮箱">
          <a-input v-model:value="form.fromEmail" placeholder="不填则使用发件邮箱" allow-clear />
        </a-form-item>

        <a-form-item label="发件人名称">
          <a-input v-model:value="form.fromName" placeholder="例如：灵萌校园" allow-clear />
        </a-form-item>

        <a-form-item label="邮件主题前缀">
          <a-input v-model:value="form.subjectPrefix" placeholder="例如：【灵萌校园】" allow-clear />
        </a-form-item>

        <a-form-item label="邮件签名">
          <a-textarea v-model:value="form.emailSignature" placeholder="邮件底部签名 HTML" :rows="3" />
        </a-form-item>

        <a-form-item label="超时时间(ms)">
          <a-input-number v-model:value="form.timeout" :min="1000" :max="60000" :step="1000" style="width:180px" />
          <span class="hint-inline">默认 10000ms</span>
        </a-form-item>
      </a-form>
    </div>

    <!-- 测试发送弹窗 -->
    <a-modal v-model:open="showTestModal" title="测试发送邮件" @ok="handleTest" :confirmLoading="testing">
      <a-form :model="testForm" layout="vertical">
        <a-form-item label="接收邮箱" required>
          <a-input v-model:value="testForm.toEmail" placeholder="例如：test@example.com" />
        </a-form-item>
        <a-form-item label="邮件主题">
          <a-input v-model:value="testForm.subject" placeholder="测试邮件" />
        </a-form-item>
        <a-form-item label="邮件内容">
          <a-textarea v-model:value="testForm.content" placeholder="可选自定义 HTML 内容" :rows="4" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { systemApi } from '@/api/system'

const saving = ref(false)
const testing = ref(false)
const showTestModal = ref(false)

const form = reactive({
  host: 'smtp.qq.com',
  port: 465,
  secure: true,
  user: '',
  pass: '',
  fromEmail: '',
  fromName: '',
  subjectPrefix: '',
  emailSignature: '',
  timeout: 10000,
})

const testForm = reactive({
  toEmail: '',
  subject: '',
  content: '',
})

onMounted(loadConfig)

async function loadConfig() {
  try {
    const res = await systemApi.getEmailConfig()
    const data = (res.data?.data || res.data || {}) as Record<string, any>
    form.host = data.host || 'smtp.qq.com'
    form.port = data.port || 465
    form.secure = data.secure !== false
    form.user = data.user || ''
    form.pass = data.pass || ''
    form.fromEmail = data.fromEmail || ''
    form.fromName = data.fromName || ''
    form.subjectPrefix = data.subjectPrefix || ''
    form.emailSignature = data.emailSignature || ''
    form.timeout = data.timeout || 10000
  } catch {
    // use defaults
  }
}

async function handleSave() {
  if (!form.host || !form.user) {
    return message.warning('请填写 SMTP 服务器和发件邮箱')
  }
  saving.value = true
  try {
    await systemApi.saveEmailConfig({ ...form })
    message.success('邮箱配置已保存')
  } catch (err: any) {
    message.error(err?.response?.data?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

async function handleTest() {
  if (!testForm.toEmail) return message.warning('请填写接收邮箱')
  testing.value = true
  try {
    const res = await systemApi.testEmail({ ...testForm })
    const data = (res.data?.data || res.data || {}) as any
    message.success(data?.message || '发送成功，请查看收件箱')
    showTestModal.value = false
  } catch (err: any) {
    message.error(err?.response?.data?.message || '发送失败')
  } finally {
    testing.value = false
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
.hint {
  margin-top: 6px;
  color: #8c8c8c;
  font-size: 12px;
}
.hint-inline {
  margin-left: 10px;
  color: #8c8c8c;
  font-size: 12px;
}
</style>
