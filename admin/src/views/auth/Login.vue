<template>
  <div class="login-page">
    <div class="login-card glass-card">
      <div class="login-brand"><div class="brand-mark">校</div><div><h1>校园本地生活</h1><p>运营中台 V3 Glass</p></div></div>
      <el-form label-position="top" style="margin-top:26px" @submit.prevent>
        <el-form-item label="账号"><el-input v-model="form.username" placeholder="admin" /></el-form-item>
        <el-form-item label="密码"><el-input v-model="form.password" type="password" placeholder="请输入密码" show-password @keyup.enter="login" /></el-form-item>
        <el-button type="primary" size="large" style="width:100%" :loading="loading" @click="login">登录后台</el-button>
      </el-form>
    </div>
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
<style scoped>.login-page{min-height:100vh;display:grid;place-items:center;padding:20px}.login-card{width:420px;max-width:100%;padding:32px}.login-brand{display:flex;gap:14px;align-items:center}.brand-mark{width:58px;height:58px;border-radius:20px;background:linear-gradient(135deg,#1f6fff,#22d3ee);display:grid;place-items:center;color:white;font-weight:950;font-size:24px}.login-brand h1{margin:0}.login-brand p{margin:5px 0 0;color:#64748b;font-weight:800}</style>
