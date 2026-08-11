<template>
  <div class="panel-container">
    <div class="glass-card">
      <div class="card-header"><div class="card-title">密码策略</div></div>
      <div class="card-body">
        <el-form label-position="top">
          <div class="form-grid two">
            <el-form-item label="管理员密码强度">
              <el-select v-model="form.passwordStrength" style="width: 100%">
                <el-option label="低（仅长度限制）" value="low" />
                <el-option label="中（包含字母和数字）" value="medium" />
                <el-option label="高（包含大小写字母、数字和特殊字符）" value="high" />
              </el-select>
            </el-form-item>
            <el-form-item label="密码最短长度">
              <el-input-number v-model="form.passwordMinLength" :min="6" :max="32" style="width: 100%" />
            </el-form-item>
            <el-form-item label="密码过期天数">
              <el-input-number v-model="form.passwordExpireDays" :min="0" :max="365" style="width: 100%" />
              <div class="form-tip">0 表示永不过期</div>
            </el-form-item>
          </div>
        </el-form>
      </div>
    </div>

    <div class="glass-card">
      <div class="card-header"><div class="card-title">登录安全</div></div>
      <div class="card-body">
        <el-form label-position="top">
          <div class="form-grid two">
            <el-form-item label="登录失败锁定次数">
              <el-input-number v-model="form.loginFailLockCount" :min="3" :max="20" style="width: 100%" />
            </el-form-item>
            <el-form-item label="IP 白名单">
              <el-input v-model="form.ipWhitelist" type="textarea" :rows="3" placeholder="每行一个IP地址，留空表示不限制" />
              <div class="form-tip">只有白名单中的IP才能访问后台</div>
            </el-form-item>
            <el-form-item label="IP 黑名单">
              <el-input v-model="form.ipBlacklist" type="textarea" :rows="3" placeholder="每行一个IP地址" />
              <div class="form-tip">黑名单中的IP将被拒绝访问</div>
            </el-form-item>
          </div>
        </el-form>
      </div>
    </div>

    <div class="glass-card">
      <div class="card-header"><div class="card-title">安全开关</div></div>
      <div class="card-body">
        <div class="switch-grid">
          <div class="switch-item">
            <div>
              <div class="switch-label">异地登录提醒</div>
              <div class="switch-desc">检测到异地登录时发送告警通知</div>
            </div>
            <el-switch v-model="form.remoteLoginAlert" />
          </div>
          <div class="switch-item">
            <div>
              <div class="switch-label">敏感操作日志</div>
              <div class="switch-desc">记录所有敏感操作（删除、修改等）</div>
            </div>
            <el-switch v-model="form.sensitiveOperationLog" />
          </div>
          <div class="switch-item">
            <div>
              <div class="switch-label">接口限流</div>
              <div class="switch-desc">限制单个IP的请求频率，防止恶意攻击</div>
            </div>
            <el-switch v-model="form.apiRateLimit" />
          </div>
        </div>
      </div>
    </div>

    <div class="glass-card" v-if="form.apiRateLimit">
      <div class="card-header"><div class="card-title">限流配置</div></div>
      <div class="card-body">
        <el-form label-position="top">
          <div class="form-grid two">
            <el-form-item label="单 IP 每分钟请求上限">
              <el-input-number v-model="form.rateLimitPerMinute" :min="10" :max="10000" style="width: 100%" />
            </el-form-item>
          </div>
        </el-form>
      </div>
    </div>

    <div class="panel-actions">
      <el-button @click="load" :loading="loading">刷新</el-button>
      <el-button type="primary" :loading="saving" @click="save">保存配置</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { fetchConfigGroup, saveConfigGroup } from '@/api/admin'

const loading = ref(false)
const saving = ref(false)

const form = reactive<Record<string, any>>({
  passwordStrength: 'medium',
  passwordMinLength: 8,
  passwordExpireDays: 90,
  loginFailLockCount: 5,
  ipWhitelist: '',
  ipBlacklist: '',
  remoteLoginAlert: true,
  sensitiveOperationLog: true,
  apiRateLimit: true,
  rateLimitPerMinute: 100
})

async function load() {
  loading.value = true
  try {
    const data = await fetchConfigGroup('security')
    if (data && typeof data === 'object') {
      for (const [key, value] of Object.entries(data)) {
        if (key in form) {
          form[key] = value
        }
      }
    }
  } catch {
    // ignore
  } finally {
    loading.value = false
  }
}

async function save() {
  saving.value = true
  try {
    await saveConfigGroup('security', { ...form })
    ElMessage.success('安全策略配置已保存')
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  load()
})
</script>

<style scoped>
.panel-container {
  display: grid;
  gap: 24px;
}
.switch-grid {
  display: grid;
  gap: 16px;
}
.switch-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-radius: 14px;
  background: rgba(248, 250, 252, 0.8);
  border: 1px solid rgba(226, 232, 240, 0.6);
}
.switch-label {
  font-weight: 700;
  font-size: 14px;
  margin-bottom: 4px;
}
.switch-desc {
  color: #94a3b8;
  font-size: 12px;
}
.form-tip {
  color: #94a3b8;
  font-size: 12px;
  margin-top: 4px;
}
.panel-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding-top: 16px;
}
</style>
