<template>
  <div class="login-page">
    <section class="login-visual">
      <div class="visual-brand">
        <div class="brand-mark">校</div>
        <div>
          <h1>校园本地生活</h1>
          <p>Lingmeng Admin Console</p>
        </div>
      </div>
      <div class="visual-copy">
        <span>Operator Workspace</span>
        <strong>面向校园本地生活的真实运营后台</strong>
        <p>区域、内容、商家、商城、财务、通知与系统运维统一管理。</p>
      </div>
      <div class="visual-grid">
        <div><b>14</b><span>业务中心</span></div>
        <div><b>Real</b><span>真实数据</span></div>
        <div><b>24h</b><span>运营响应</span></div>
      </div>
    </section>

    <section class="login-panel">
      <div class="login-card">
        <div class="login-title">
          <span>Welcome back</span>
          <h2>登录运营后台</h2>
          <p>请输入管理员账号继续处理平台业务。</p>
        </div>
        <el-form label-position="top" @submit.prevent>
          <el-form-item label="账号">
            <el-input v-model="form.username" placeholder="admin" size="large" />
          </el-form-item>
          <el-form-item label="密码">
            <el-input v-model="form.password" type="password" placeholder="请输入密码" show-password size="large" @keyup.enter="login" />
          </el-form-item>
          <el-button type="primary" size="large" class="login-submit" :loading="loading" @click="login">登录后台</el-button>
      </el-form>
      </div>
    </section>
  </div>
</template>
<script setup lang="ts">
import { reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()
const loading = ref(false)
const form = reactive({ username:'admin', password:'' })

async function login(){
  if (!form.username || !form.password) {
    ElMessage.warning('请输入账号和密码')
    return
  }
  loading.value = true
  try {
    await auth.login(form.username, form.password)
    ElMessage.success('登录成功')
    router.push('/dashboard')
  } finally {
    loading.value = false
  }
}
</script>
<style scoped>
.login-page {
  min-height: 100vh;
  display: grid;
  grid-template-columns: minmax(420px, 1.1fr) minmax(420px, .9fr);
  background:
    radial-gradient(circle at 16% 20%, rgba(37, 99, 235, .13), transparent 34%),
    radial-gradient(circle at 78% 18%, rgba(14, 165, 233, .12), transparent 28%),
    #f5f7fb;
}

.login-visual {
  position: relative;
  min-height: 100vh;
  padding: 56px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  overflow: hidden;
}

.login-visual::before {
  content: "";
  position: absolute;
  inset: 28px;
  border: 1px solid rgba(37, 99, 235, .12);
  border-radius: 28px;
  pointer-events: none;
}

.visual-brand {
  display: flex;
  gap: 16px;
  align-items: center;
  position: relative;
  z-index: 1;
}

.brand-mark {
  width: 56px;
  height: 56px;
  border-radius: 16px;
  background: linear-gradient(135deg, #2563eb, #0ea5e9);
  display: grid;
  place-items: center;
  color: #fff;
  font-weight: 950;
  font-size: 24px;
  flex-shrink: 0;
  box-shadow: 0 16px 34px rgba(37, 99, 235, .18);
}

.visual-brand h1 {
  margin: 0;
  font-size: 24px;
  color: #172033;
  line-height: 1.15;
  font-weight: 950;
}

.visual-brand p {
  margin: 6px 0 0;
  color: #64748b;
  font-weight: 800;
  font-size: 13px;
}

.visual-copy {
  position: relative;
  z-index: 1;
  max-width: 620px;
}

.visual-copy span {
  display: inline-flex;
  padding: 7px 12px;
  border-radius: 999px;
  background: #fff;
  border: 1px solid #dce6f3;
  color: #2563eb;
  font-weight: 850;
  font-size: 13px;
  margin-bottom: 18px;
}

.visual-copy strong {
  display: block;
  font-size: clamp(36px, 5vw, 64px);
  line-height: 1.08;
  letter-spacing: 0;
  color: #111827;
  max-width: 720px;
}

.visual-copy p {
  margin: 18px 0 0;
  color: #64748b;
  font-size: 16px;
  line-height: 1.8;
  font-weight: 650;
}

.visual-grid {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  max-width: 620px;
}

.visual-grid div {
  padding: 18px;
  border-radius: 18px;
  background: rgba(255, 255, 255, .82);
  border: 1px solid #dce6f3;
  box-shadow: 0 12px 30px rgba(15, 23, 42, .055);
}

.visual-grid b {
  display: block;
  font-size: 24px;
  line-height: 1;
  color: #172033;
}

.visual-grid span {
  display: block;
  margin-top: 8px;
  color: #64748b;
  font-size: 13px;
  font-weight: 750;
}

.login-panel {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 42px;
}

.login-card {
  width: min(440px, 100%);
  padding: 34px;
  border-radius: 22px;
  background: #fff;
  border: 1px solid #e3e9f2;
  box-shadow: 0 18px 48px rgba(15, 23, 42, .09);
}

.login-title span {
  color: #2563eb;
  font-size: 13px;
  font-weight: 850;
}

.login-title h2 {
  margin: 8px 0 0;
  font-size: 28px;
  line-height: 1.2;
  color: #172033;
}

.login-title p {
  margin: 8px 0 26px;
  color: #64748b;
  font-weight: 650;
}

.login-submit {
  width: 100%;
  margin-top: 10px;
}

@media (max-width: 960px) {
  .login-page {
    grid-template-columns: 1fr;
  }

  .login-visual {
    display: none;
  }
}
</style>
