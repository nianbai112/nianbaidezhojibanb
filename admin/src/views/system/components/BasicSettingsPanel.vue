<template>
  <div class="panel-container">
    <div class="glass-card">
      <div class="card-header"><div class="card-title">基础设置</div></div>
      <div class="card-body">
        <el-form label-position="top">
          <div class="form-grid two">
            <el-form-item label="平台名称">
              <el-input v-model="form.platformName" placeholder="请输入平台名称" />
            </el-form-item>
            <el-form-item label="平台副标题">
              <el-input v-model="form.platformSubtitle" placeholder="请输入平台副标题" />
            </el-form-item>
            <el-form-item label="客服电话">
              <el-input v-model="form.servicePhone" placeholder="请输入客服电话" />
            </el-form-item>
            <el-form-item label="客服微信">
              <el-input v-model="form.serviceWechat" placeholder="请输入客服微信号" />
            </el-form-item>
            <el-form-item label="默认区域">
              <el-select v-model="form.defaultRegion" placeholder="请选择默认区域" style="width: 100%">
                <el-option v-for="r in regions" :key="r.id" :label="r.name" :value="r.id" />
              </el-select>
            </el-form-item>
            <el-form-item label="默认抽成比例">
              <el-input v-model="form.defaultCommission" placeholder="请输入抽成比例">
                <template #append>%</template>
              </el-input>
            </el-form-item>
          </div>
        </el-form>
      </div>
    </div>

    <div class="glass-card">
      <div class="card-header"><div class="card-title">功能开关</div></div>
      <div class="card-body">
        <div class="switch-grid">
          <div class="switch-item">
            <div>
              <div class="switch-label">注册审核</div>
              <div class="switch-desc">新用户注册后需要管理员审核才能使用</div>
            </div>
            <el-switch v-model="form.registerAudit" />
          </div>
          <div class="switch-item">
            <div>
              <div class="switch-label">登录验证码</div>
              <div class="switch-desc">登录时需要输入验证码</div>
            </div>
            <el-switch v-model="form.loginCaptcha" />
          </div>
          <div class="switch-item">
            <div>
              <div class="switch-label">平台维护模式</div>
              <div class="switch-desc">开启后小程序将显示维护公告</div>
            </div>
            <el-switch v-model="form.maintenanceMode" />
          </div>
        </div>
      </div>
    </div>

    <div class="glass-card" v-if="form.maintenanceMode">
      <div class="card-header"><div class="card-title">维护公告</div></div>
      <div class="card-body">
        <el-input v-model="form.maintenanceNotice" type="textarea" :rows="4" placeholder="请输入维护公告内容" />
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
import { fetchConfigGroup, fetchRegions, saveConfigGroup } from '@/api/admin'

const loading = ref(false)
const saving = ref(false)
const regions = ref<any[]>([])

const form = reactive<Record<string, any>>({
  platformName: '',
  platformSubtitle: '',
  servicePhone: '',
  serviceWechat: '',
  defaultRegion: '',
  defaultCommission: 8,
  registerAudit: false,
  loginCaptcha: true,
  maintenanceMode: false,
  maintenanceNotice: ''
})

async function load() {
  loading.value = true
  try {
    const [data, regionList] = await Promise.all([
      fetchConfigGroup('basic'),
      fetchRegions().catch(() => [])
    ])
    if (data && typeof data === 'object') {
      for (const [key, value] of Object.entries(data)) {
        if (key in form) {
          form[key] = value
        }
      }
    }
    regions.value = regionList || []
  } catch {
    // ignore
  } finally {
    loading.value = false
  }
}

async function save() {
  saving.value = true
  try {
    await saveConfigGroup('basic', { ...form })
    ElMessage.success('基础设置已保存')
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
.panel-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding-top: 16px;
}
</style>
