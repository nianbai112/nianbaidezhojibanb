<template>
  <div class="setup-page">
    <section class="setup-shell">
      <div class="setup-head">
        <div>
          <h1>灵萌安装向导</h1>
          <p>首次部署时完成环境检查、基础配置和超级管理员初始化。</p>
        </div>
        <a-tag :color="initialized ? 'green' : 'blue'">
          {{ initialized ? '已初始化' : '待初始化' }}
        </a-tag>
      </div>

      <a-alert
        v-if="initialized"
        type="success"
        show-icon
        message="系统已经初始化完成，安装向导入口会被后端拒绝重复执行。"
      />

      <a-form layout="vertical" class="setup-form">
        <a-row :gutter="16">
          <a-col :xs="24" :md="12">
            <a-form-item label="SETUP_TOKEN">
              <a-input-password v-model:value="token" placeholder="服务器 .env 中的 SETUP_TOKEN" />
            </a-form-item>
          </a-col>
          <a-col :xs="24" :md="12">
            <a-form-item label="站点名称">
              <a-input v-model:value="form.siteName" placeholder="灵萌生活" />
            </a-form-item>
          </a-col>
        </a-row>

        <a-divider>管理员</a-divider>
        <a-row :gutter="16">
          <a-col :xs="24" :md="8">
            <a-form-item label="管理员账号" required>
              <a-input v-model:value="form.adminUsername" />
            </a-form-item>
          </a-col>
          <a-col :xs="24" :md="8">
            <a-form-item label="管理员密码" required>
              <a-input-password v-model:value="form.adminPassword" />
            </a-form-item>
          </a-col>
          <a-col :xs="24" :md="8">
            <a-form-item label="手机号">
              <a-input v-model:value="form.adminPhone" />
            </a-form-item>
          </a-col>
        </a-row>

        <a-divider>基础连接</a-divider>
        <a-form-item label="数据库连接">
          <a-input v-model:value="form.databaseUrl" placeholder="postgresql://user:password@host:5432/db" />
        </a-form-item>
        <a-row :gutter="16">
          <a-col :xs="24" :md="8">
            <a-form-item label="Redis Host">
              <a-input v-model:value="form.redisHost" />
            </a-form-item>
          </a-col>
          <a-col :xs="24" :md="8">
            <a-form-item label="Redis Port">
              <a-input-number v-model:value="form.redisPort" :min="1" :max="65535" class="full" />
            </a-form-item>
          </a-col>
          <a-col :xs="24" :md="8">
            <a-form-item label="Redis 密码">
              <a-input-password v-model:value="form.redisPassword" />
            </a-form-item>
          </a-col>
        </a-row>

        <a-divider>小程序与存储</a-divider>
        <a-row :gutter="16">
          <a-col :xs="24" :md="12">
            <a-form-item label="微信小程序 AppID">
              <a-input v-model:value="form.wxMiniAppid" />
            </a-form-item>
          </a-col>
          <a-col :xs="24" :md="12">
            <a-form-item label="微信小程序 Secret">
              <a-input-password v-model:value="form.wxMiniSecret" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :xs="24" :md="12">
            <a-form-item label="COS SecretId">
              <a-input v-model:value="form.cosSecretId" />
            </a-form-item>
          </a-col>
          <a-col :xs="24" :md="12">
            <a-form-item label="COS SecretKey">
              <a-input-password v-model:value="form.cosSecretKey" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :xs="24" :md="8">
            <a-form-item label="COS Bucket">
              <a-input v-model:value="form.cosBucket" />
            </a-form-item>
          </a-col>
          <a-col :xs="24" :md="8">
            <a-form-item label="COS Region">
              <a-input v-model:value="form.cosRegion" />
            </a-form-item>
          </a-col>
          <a-col :xs="24" :md="8">
            <a-form-item label="COS 域名">
              <a-input v-model:value="form.cosDomain" />
            </a-form-item>
          </a-col>
        </a-row>

        <a-space class="actions">
          <a-button :loading="checking" @click="checkEnvironment">检查环境</a-button>
          <a-button type="primary" :loading="initializing" @click="initSystem">执行初始化</a-button>
          <a-button @click="$router.push('/login')">去登录</a-button>
        </a-space>
      </a-form>

      <a-list v-if="checks.length" class="check-list" bordered :data-source="checks">
        <template #renderItem="{ item }">
          <a-list-item>
            <a-list-item-meta :title="item.name" :description="item.message || item.detail" />
            <a-tag :color="item.status === 'passed' ? 'green' : item.status === 'warning' ? 'orange' : 'red'">
              {{ item.status }}
            </a-tag>
          </a-list-item>
        </template>
      </a-list>
    </section>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { message } from 'ant-design-vue'
import { setupApi } from '@/api/setup'

const token = ref('')
const initialized = ref(false)
const checking = ref(false)
const initializing = ref(false)
const checks = ref<any[]>([])

const form = reactive({
  siteName: '灵萌生活',
  adminUsername: 'admin',
  adminPassword: '',
  adminPhone: '',
  databaseUrl: '',
  redisHost: '127.0.0.1',
  redisPort: 6379,
  redisPassword: '',
  jwtSecret: '',
  corsOrigin: window.location.origin,
  wxMiniAppid: '',
  wxMiniSecret: '',
  cosSecretId: '',
  cosSecretKey: '',
  cosBucket: '',
  cosRegion: '',
  cosDomain: '',
})

onMounted(async () => {
  try {
    const res = await setupApi.status()
    const data = (res.data?.data || res.data || {}) as any
    initialized.value = Boolean(data.initialized)
  } catch {
    message.warning('读取安装状态失败')
  }
})

async function checkEnvironment() {
  checking.value = true
  try {
    const res = await setupApi.check(token.value)
    const data = (res.data?.data || res.data || {}) as any
    checks.value = data.checks || data.items || []
    message.success('环境检查完成')
  } catch (err: any) {
    message.error(err?.response?.data?.message || err?.message || '环境检查失败')
  } finally {
    checking.value = false
  }
}

async function initSystem() {
  if (!form.adminUsername || !form.adminPassword) {
    message.warning('请填写管理员账号和密码')
    return
  }
  initializing.value = true
  try {
    await setupApi.init(form, token.value)
    initialized.value = true
    message.success('初始化完成')
  } catch (err: any) {
    message.error(err?.response?.data?.message || err?.message || '初始化失败')
  } finally {
    initializing.value = false
  }
}
</script>

<style scoped lang="less">
.setup-page {
  min-height: 100vh;
  padding: 32px 16px;
  background: #f3f6fb;
}

.setup-shell {
  max-width: 1040px;
  margin: 0 auto;
  padding: 28px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}

.setup-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;

  h1 {
    margin: 0;
    color: #111827;
    font-size: 24px;
    font-weight: 700;
  }

  p {
    margin: 8px 0 0;
    color: #6b7280;
  }
}

.setup-form {
  margin-top: 20px;
}

.full {
  width: 100%;
}

.actions {
  margin-top: 8px;
}

.check-list {
  margin-top: 20px;
}
</style>
