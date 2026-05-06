<template>
  <div class="login-page">
    <div class="login-wrapper">
      <!-- 左侧：品牌与动画角色 -->
      <div class="login-brand">
        <div class="brand-inner">
          <!-- Logo + 名称 -->
          <div class="brand-header">
            <div class="brand-logo">
              <svg v-if="!brand.logo" viewBox="0 0 40 40" class="logo-svg">
                <rect x="4" y="4" width="32" height="32" rx="8" fill="#3B82F6" />
                <path d="M12 20 L18 26 L28 14" stroke="white" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              <img v-else :src="brand.logo" alt="logo" />
            </div>
            <div class="brand-text">
              <h1 class="brand-title">{{ brand.adminName }}</h1>
              <p class="brand-slogan">{{ brand.slogan }}</p>
            </div>
          </div>

          <!-- 动画角色 -->
          <div class="mascot-area">
            <AnimatedLoginMascot :mood="mascotMood" />
          </div>

          <!-- 能力点 -->
          <div class="features">
            <div v-for="(f, i) in brand.features" :key="i" class="feature-item">
              <div class="feature-icon">
                <component :is="featureIconMap[f.icon]" />
              </div>
              <div class="feature-text">
                <div class="feature-title">{{ f.title }}</div>
                <div class="feature-desc">{{ f.desc }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 右侧：登录表单 -->
      <div class="login-form-area">
        <div class="login-card">
          <div class="form-header">
            <h2 class="form-title">{{ brand.loginTitle }}</h2>
            <p class="form-subtitle">{{ brand.loginSubtitle }}</p>
          </div>

          <a-form
            :model="form"
            :rules="rules"
            ref="formRef"
            @finish="onFinish"
            layout="vertical"
          >
            <a-form-item name="username" class="form-item-compact">
              <a-input
                v-model:value="form.username"
                placeholder="请输入管理员账号"
                autocomplete="username"
                :max-length="64"
                @focus="mascotMood = 'usernameFocus'"
                @blur="onInputBlur"
                @input="onUsernameInput"
              >
                <template #prefix><UserOutlined /></template>
              </a-input>
            </a-form-item>

            <a-form-item name="password" class="form-item-compact">
              <a-input-password
                v-model:value="form.password"
                placeholder="请输入密码"
                autocomplete="current-password"
                :max-length="64"
                @focus="mascotMood = 'passwordFocus'"
                @blur="onInputBlur"
                @input="onPasswordInput"
                @keyup.enter="formRef?.validate().then(onFinish).catch(() => {})"
              >
                <template #prefix><LockOutlined /></template>
              </a-input-password>
            </a-form-item>

            <div v-if="errorMsg" class="error-tip">
              <CloseCircleFilled />
              <span>{{ errorMsg }}</span>
            </div>

            <a-form-item class="form-item-compact">
              <a-button
                type="primary"
                html-type="submit"
                :loading="loading"
                block
                class="login-btn"
              >
                {{ loading ? '登录中…' : '登 录' }}
              </a-button>
            </a-form-item>
          </a-form>
        </div>

        <div class="login-footer">
          <span>{{ brand.appName }} · {{ brand.adminName }} v1.0</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { message, type FormInstance } from 'ant-design-vue'
import {
  UserOutlined,
  LockOutlined,
  FileTextOutlined,
  TeamOutlined,
  SafetyOutlined,
  CloseCircleFilled,
} from '@ant-design/icons-vue'
import { useUserStore } from '@/stores/user'
import { getBrandConfig } from '@/config/brand'
import AnimatedLoginMascot from './components/AnimatedLoginMascot.vue'
import type { LoginRequest } from '@/types/auth'
import type { MascotMood } from './components/AnimatedLoginMascot.vue'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()
const brand = getBrandConfig()

const formRef = ref<FormInstance>()
const loading = ref(false)
const errorMsg = ref('')
const mascotMood = ref<MascotMood>('idle')
let typingTimer: ReturnType<typeof setTimeout> | null = null

const form = reactive<LoginRequest & { remember: boolean }>({
  username: '',
  password: '',
  remember: true,
})

const rules: any = {
  username: [{ required: true, message: '请输入管理员账号', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
}

const featureIconMap: Record<string, any> = {
  FileTextOutlined,
  TeamOutlined,
  SafetyOutlined,
}

function onInputBlur() {
  // 延迟恢复 idle，避免焦点快速切换时的闪烁
  setTimeout(() => {
    if (document.activeElement?.tagName !== 'INPUT') {
      mascotMood.value = 'idle'
    }
  }, 150)
}

function onUsernameInput() {
  if (mascotMood.value !== 'usernameFocus') mascotMood.value = 'usernameFocus'
  triggerTyping()
}

function onPasswordInput() {
  if (mascotMood.value !== 'passwordFocus') mascotMood.value = 'passwordFocus'
  triggerTyping()
}

function triggerTyping() {
  if (typingTimer) clearTimeout(typingTimer)
  // 只有持续输入时才进入 typing 状态
  if (mascotMood.value !== 'typing') {
    mascotMood.value = 'typing'
  }
  typingTimer = setTimeout(() => {
    const active = document.activeElement as HTMLInputElement | null
    if (active?.name === 'username') mascotMood.value = 'usernameFocus'
    else if (active?.name === 'password') mascotMood.value = 'passwordFocus'
    else mascotMood.value = 'idle'
  }, 400)
}

async function onFinish() {
  errorMsg.value = ''
  loading.value = true
  try {
    await userStore.login({ username: form.username, password: form.password })
    mascotMood.value = 'success'
    message.success('登录成功')
    const redirect = (route.query.redirect as string) || '/dashboard'
    router.push(redirect)
  } catch (err: any) {
    mascotMood.value = 'error'
    const msg =
      err?.response?.data?.message ||
      err?.data?.message ||
      err?.message ||
      '登录失败'
    errorMsg.value = msg
  } finally {
    loading.value = false
  }
}
</script>

<style lang="less" scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f3f4f6;
  padding: 24px;
}

.login-wrapper {
  display: flex;
  width: 100%;
  max-width: 1080px;
  min-height: 640px;
  background: #ffffff;
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.04);
  overflow: hidden;
}

/* ───── 左侧品牌区 ───── */
.login-brand {
  width: 45%;
  background: #f8fafc;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 48px 40px;
  position: relative;

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse at 30% 20%, rgba(59, 130, 246, 0.04) 0%, transparent 60%),
                radial-gradient(ellipse at 70% 80%, rgba(16, 185, 129, 0.03) 0%, transparent 50%);
    pointer-events: none;
  }
}

.brand-inner {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 32px;
}

.brand-header {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  justify-content: center;
}

.brand-logo {
  width: 44px;
  height: 44px;
  flex-shrink: 0;

  .logo-svg {
    width: 100%;
    height: 100%;
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
}

.brand-text {
  text-align: left;
}

.brand-title {
  font-size: 18px;
  font-weight: 700;
  color: #111827;
  margin: 0;
  line-height: 1.3;
}

.brand-slogan {
  font-size: 13px;
  color: #6b7280;
  margin: 4px 0 0;
}

.mascot-area {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 220px;
}

.features {
  display: flex;
  flex-direction: column;
  gap: 14px;
  width: 100%;
  max-width: 280px;
}

.feature-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 14px;
  background: rgba(255, 255, 255, 0.7);
  border-radius: 10px;
  border: 1px solid rgba(229, 231, 235, 0.6);
  backdrop-filter: blur(4px);
}

.feature-icon {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #eff6ff;
  border-radius: 8px;
  color: #3b82f6;
  font-size: 16px;
  flex-shrink: 0;
}

.feature-text {
  flex: 1;
}

.feature-title {
  font-size: 13px;
  font-weight: 600;
  color: #1f2937;
  line-height: 1.4;
}

.feature-desc {
  font-size: 12px;
  color: #9ca3af;
  line-height: 1.4;
  margin-top: 2px;
}

/* ───── 右侧表单区 ───── */
.login-form-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 56px;
}

.login-card {
  width: 100%;
  max-width: 380px;
}

.form-header {
  margin-bottom: 32px;
}

.form-title {
  font-size: 22px;
  font-weight: 700;
  color: #111827;
  margin: 0 0 6px;
  line-height: 1.3;
}

.form-subtitle {
  font-size: 14px;
  color: #6b7280;
  margin: 0;
  line-height: 1.5;
}

.form-item-compact {
  margin-bottom: 20px;

  :deep(.ant-form-item-control-input) {
    min-height: auto;
  }

  :deep(.ant-input-affix-wrapper) {
    padding: 10px 14px;
    border-radius: 10px;
    border-color: #e5e7eb;
    transition: border-color 0.2s, box-shadow 0.2s;

    &:hover,
    &:focus,
    &-focused {
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.08);
    }
  }

  :deep(.ant-input) {
    font-size: 14px;
  }

  :deep(.ant-input-prefix) {
    color: #9ca3af;
    margin-right: 10px;
  }
}

.error-tip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 14px;
  margin-bottom: 20px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
  color: #dc2626;
  font-size: 13px;
  line-height: 1.4;
  animation: errorSlideIn 0.25s ease;
}

@keyframes errorSlideIn {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.login-btn {
  height: 46px;
  font-size: 15px;
  font-weight: 600;
  border-radius: 10px;
  background: #3b82f6;
  border-color: #3b82f6;
  transition: all 0.2s ease;

  &:hover {
    background: #2563eb;
    border-color: #2563eb;
  }

  &:active {
    background: #1d4ed8;
    border-color: #1d4ed8;
  }
}

.login-footer {
  margin-top: 40px;
  font-size: 12px;
  color: #d1d5db;
  text-align: center;
}

/* ───── 响应式：移动端 ───── */
@media (max-width: 768px) {
  .login-page {
    padding: 0;
    background: #ffffff;
  }

  .login-wrapper {
    max-width: 100%;
    min-height: 100vh;
    border-radius: 0;
    box-shadow: none;
    flex-direction: column;
  }

  .login-brand {
    display: none;
  }

  .login-form-area {
    padding: 40px 24px;
    justify-content: flex-start;
    padding-top: 80px;
  }

  .login-card {
    max-width: 100%;
  }

  .login-footer {
    margin-top: auto;
    padding-bottom: 24px;
  }
}

/* 小屏手机额外优化 */
@media (max-width: 400px) {
  .login-form-area {
    padding: 32px 20px;
    padding-top: 60px;
  }

  .form-title {
    font-size: 20px;
  }

  .form-subtitle {
    font-size: 13px;
  }
}
</style>
