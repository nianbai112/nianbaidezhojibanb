<template>
  <div class="panel-container">
    <div class="glass-card">
      <div class="card-header"><div class="card-title">权限策略</div></div>
      <div class="card-body">
        <el-form label-position="top">
          <div class="form-grid two">
            <el-form-item label="默认新管理员角色">
              <el-select v-model="form.defaultRole" placeholder="请选择默认角色" style="width: 100%">
                <el-option v-for="r in roles" :key="r.id" :label="r.name" :value="r.id" />
              </el-select>
            </el-form-item>
            <el-form-item label="数据权限默认范围">
              <el-select v-model="form.dataScope" placeholder="请选择数据范围" style="width: 100%">
                <el-option label="全部数据" value="all" />
                <el-option label="本区域数据" value="region" />
                <el-option label="仅本人数据" value="self" />
              </el-select>
            </el-form-item>
          </div>
        </el-form>
      </div>
    </div>

    <div class="glass-card">
      <div class="card-header"><div class="card-title">安全设置</div></div>
      <div class="card-body">
        <div class="switch-grid">
          <div class="switch-item">
            <div>
              <div class="switch-label">开启操作日志</div>
              <div class="switch-desc">记录管理员的所有操作行为</div>
            </div>
            <el-switch v-model="form.enableOperationLog" />
          </div>
          <div class="switch-item">
            <div>
              <div class="switch-label">敏感操作二次确认</div>
              <div class="switch-desc">删除、修改等敏感操作需要二次确认</div>
            </div>
            <el-switch v-model="form.sensitiveOperationConfirm" />
          </div>
        </div>
      </div>
    </div>

    <div class="glass-card">
      <div class="card-header"><div class="card-title">登录策略</div></div>
      <div class="card-body">
        <el-form label-position="top">
          <div class="form-grid two">
            <el-form-item label="登录失败锁定次数">
              <el-input-number v-model="form.loginFailLockCount" :min="3" :max="20" style="width: 100%" />
              <div class="form-tip">连续失败达到此次数后账号将被锁定</div>
            </el-form-item>
            <el-form-item label="锁定时长（分钟）">
              <el-input-number v-model="form.lockDuration" :min="5" :max="1440" style="width: 100%" />
              <div class="form-tip">账号被锁定后的解锁等待时间</div>
            </el-form-item>
            <el-form-item label="会话有效期（小时）">
              <el-input-number v-model="form.sessionExpireHours" :min="1" :max="720" style="width: 100%" />
              <div class="form-tip">管理员登录后的会话有效时长</div>
            </el-form-item>
          </div>
        </el-form>
      </div>
    </div>

    <div class="glass-card">
      <div class="card-header">
        <div class="card-title">快捷操作</div>
      </div>
      <div class="card-body">
        <div class="quick-links">
          <el-button type="primary" plain @click="$router.push('/system/admins')">
            <el-icon><User /></el-icon>
            管理员权限管理
          </el-button>
          <el-button type="primary" plain @click="$router.push('/system/files')">
            <el-icon><FolderOpened /></el-icon>
            文件中心
          </el-button>
        </div>
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
import { User, FolderOpened } from '@element-plus/icons-vue'
import { fetchConfigGroup, saveConfigGroup, fetchRoles } from '@/api/admin'

const loading = ref(false)
const saving = ref(false)
const roles = ref<any[]>([])

const form = reactive<Record<string, any>>({
  defaultRole: '',
  dataScope: 'all',
  enableOperationLog: true,
  sensitiveOperationConfirm: true,
  loginFailLockCount: 5,
  lockDuration: 30,
  sessionExpireHours: 24
})

async function load() {
  loading.value = true
  try {
    const [data, roleList] = await Promise.all([
      fetchConfigGroup('permission'),
      fetchRoles().catch(() => [])
    ])
    if (data && typeof data === 'object') {
      for (const [key, value] of Object.entries(data)) {
        if (key in form) {
          form[key] = value
        }
      }
    }
    roles.value = roleList || []
  } catch {
    // ignore
  } finally {
    loading.value = false
  }
}

async function save() {
  saving.value = true
  try {
    await saveConfigGroup('permission', { ...form })
    ElMessage.success('权限策略配置已保存')
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
.quick-links {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}
.panel-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding-top: 16px;
}
</style>
