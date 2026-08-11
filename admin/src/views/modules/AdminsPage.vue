<template>
  <div class="page-shell">
    <GlassPageHeader title="管理员权限" subtitle="管理后台账号、角色权限、数据范围、操作日志和安全策略。">
      <template #actions>
        <el-button :icon="RefreshRight" :loading="loading" @click="loadData(true)">刷新</el-button>
      </template>
    </GlassPageHeader>

    <StatGrid :items="stats" />

    <div class="page-main-col">
      <SearchPanel :fields="searchFields" @search="onSearch" />
      <div class="module-toolbar glass-card">
        <div class="btn-row">
          <!-- AUD-P1-160: 按钮按权限显隐 -->
          <el-button v-if="hasCreatePermission" type="primary" :icon="Plus" @click="openCreateDialog">新增管理员</el-button>
          <el-button v-if="hasEditPermission" @click="openRoleDialog">创建角色</el-button>
          <el-button v-if="hasEditPermission" type="warning" @click="handleBatchDisable">批量禁用</el-button>
          <el-button @click="handleExport">导出日志</el-button>
        </div>
      </div>

      <el-table :data="admins" v-loading="loading" stripe @selection-change="onSelectionChange">
        <el-table-column type="selection" width="55" />
        <el-table-column prop="nickname" label="管理员" min-width="180">
          <template #default="{ row }">
            <div class="admin-cell">
              <el-avatar :size="32" :src="row.avatar">{{ (row.nickname || row.username || '?')[0] }}</el-avatar>
              <span>{{ row.nickname || row.username }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="username" label="账号" min-width="130" />
        <el-table-column label="角色" min-width="120">
          <template #default="{ row }">
            <el-tag v-for="r in row.roles" :key="r.role?.id" size="small" class="role-tag">
              {{ r.role?.name || '未知' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="最近登录" min-width="160">
          <template #default="{ row }">
            {{ row.lastLoginAt ? new Date(row.lastLoginAt).toLocaleString('zh-CN') : '从未登录' }}
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'active' ? 'success' : row.status === 'disabled' ? 'danger' : 'warning'" effect="plain">
              {{ row.status === 'active' ? '正常' : row.status === 'disabled' ? '禁用' : '锁定' }}
            </el-tag>
          </template>
        </el-table-column>
        <!-- AUD-P1-160: 操作列按权限显隐 -->
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button v-if="hasEditPermission" link type="primary" @click="openEditDialog(row)">编辑</el-button>
            <el-button v-if="hasEditPermission" link @click="handleToggleStatus(row)">
              {{ row.status === 'active' ? '禁用' : '启用' }}
            </el-button>
            <el-button v-if="hasEditPermission" link @click="handleResetPassword(row)">重置密码</el-button>
            <el-button v-if="hasDeletePermission" link type="danger" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 新增/编辑管理员对话框 -->
    <el-dialog v-model="dialogVisible" :title="editingAdmin ? '编辑管理员' : '新增管理员'" width="600px">
      <el-form :model="formData" label-width="100px">
        <el-form-item label="用户名" required>
          <el-input v-model="formData.username" :disabled="!!editingAdmin" />
        </el-form-item>
        <el-form-item label="昵称">
          <el-input v-model="formData.nickname" />
        </el-form-item>
        <el-form-item v-if="!editingAdmin" label="密码" required>
          <el-input v-model="formData.password" type="password" show-password />
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="formData.roleIds" multiple placeholder="选择角色">
            <el-option v-for="role in allRoles" :key="role.id" :label="role.name" :value="role.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="formData.status">
            <el-option label="正常" value="active" />
            <el-option label="禁用" value="disabled" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSubmit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, RefreshRight } from '@element-plus/icons-vue'
import GlassPageHeader from '@/components/glass/GlassPageHeader.vue'
import StatGrid from '@/components/glass/StatGrid.vue'
import SearchPanel from '@/components/glass/SearchPanel.vue'
import { useAuthStore } from '@/stores/auth'
import type { SearchField, StatItem } from '@/types/admin'

// AUD-P1-160: 权限检查
const auth = useAuthStore()
const hasCreatePermission = computed(() => auth.permissions.includes('admin:create'))
const hasEditPermission = computed(() => auth.permissions.includes('admin:edit'))
const hasDeletePermission = computed(() => auth.permissions.includes('admin:delete'))

const loading = ref(false)
const saving = ref(false)
const admins = ref<any[]>([])
const allRoles = ref<any[]>([])
const selectedRows = ref<any[]>([])
const dialogVisible = ref(false)
const editingAdmin = ref<any>(null)

const stats = ref<StatItem[]>([
  { label: '管理员', value: 0, delta: '-', tone: 'blue', icon: 'User', key: 'admins' },
  { label: '角色', value: 0, delta: '-', tone: 'purple', icon: 'Lock', key: 'roles' },
  { label: '今日登录', value: 0, delta: '-', tone: 'green', icon: 'Key', key: 'todayLogins' },
  { label: '风险操作', value: 0, delta: '-', tone: 'red', icon: 'Warning', key: 'risks' },
])

const searchFields: SearchField[] = [
  { key: 'keyword', label: '姓名/账号', type: 'input' },
  { key: 'role', label: '角色', type: 'input' },
  { key: 'status', label: '状态', type: 'select', options: [
    { label: '正常', value: 'active' },
    { label: '禁用', value: 'disabled' },
  ]},
]

const formData = reactive({
  username: '',
  nickname: '',
  password: '',
  roleIds: [] as string[],
  status: 'active',
})

async function loadData(showSuccess = false) {
  loading.value = true
  try {
    const token = localStorage.getItem('LM_ADMIN_TOKEN') || ''
    const [adminRes, roleRes] = await Promise.all([
      fetch('/api/admin/admins', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
      fetch('/api/admin/roles', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
    ])
    admins.value = adminRes?.list || adminRes?.data?.list || []
    allRoles.value = roleRes?.list || roleRes?.data?.list || []
    stats.value[0].value = admins.value.length
    stats.value[1].value = allRoles.value.length
    if (showSuccess) ElMessage.success('数据已刷新')
  } catch (e: any) {
    ElMessage.error(e?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

function onSearch(params: any) {
  loadData()
}

function onSelectionChange(rows: any[]) {
  selectedRows.value = rows
}

function openCreateDialog() {
  editingAdmin.value = null
  formData.username = ''
  formData.nickname = ''
  formData.password = ''
  formData.roleIds = []
  formData.status = 'active'
  dialogVisible.value = true
}

function openEditDialog(admin: any) {
  editingAdmin.value = admin
  formData.username = admin.username
  formData.nickname = admin.nickname || ''
  formData.password = ''
  formData.roleIds = (admin.roles || []).map((r: any) => r.role?.id).filter(Boolean)
  formData.status = admin.status || 'active'
  dialogVisible.value = true
}

function openRoleDialog() {
  window.location.hash = '#/system/roles'
}

async function handleSubmit() {
  if (!formData.username) {
    ElMessage.warning('请输入用户名')
    return
  }
  if (!editingAdmin.value && !formData.password) {
    ElMessage.warning('请输入密码')
    return
  }

  saving.value = true
  try {
    const token = localStorage.getItem('LM_ADMIN_TOKEN') || ''
    const url = editingAdmin.value
      ? `/api/admin/admins/${editingAdmin.value.id}`
      : '/api/admin/admins'
    const method = editingAdmin.value ? 'PUT' : 'POST'

    const body: any = {
      nickname: formData.nickname,
      roleIds: formData.roleIds,
      status: formData.status,
    }
    if (!editingAdmin.value) {
      body.username = formData.username
      body.password = formData.password
    }

    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    })

    if (res.ok) {
      ElMessage.success(editingAdmin.value ? '管理员已更新' : '管理员已创建')
      dialogVisible.value = false
      await loadData()
    } else {
      const data = await res.json()
      ElMessage.error(data.message || '操作失败')
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '操作失败')
  } finally {
    saving.value = false
  }
}

async function handleToggleStatus(admin: any) {
  const newStatus = admin.status === 'active' ? 'disabled' : 'active'
  const action = newStatus === 'disabled' ? '禁用' : '启用'

  try {
    await ElMessageBox.confirm(`确定${action}管理员「${admin.nickname || admin.username}」？`, '确认操作', { type: 'warning' })
    const token = localStorage.getItem('LM_ADMIN_TOKEN') || ''
    await fetch(`/api/admin/admins/${admin.id}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ status: newStatus }),
    })
    ElMessage.success(`管理员已${action}`)
    await loadData()
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(e?.message || '操作失败')
  }
}

async function handleResetPassword(admin: any) {
  try {
    const { value: password } = await ElMessageBox.prompt(
      `请输入管理员「${admin.nickname || admin.username}」的新临时密码，保存后该账号下次登录必须改密。`,
      '重置管理员密码',
      { inputType: 'password', inputPlaceholder: '至少8位，包含三类字符', inputValidator: value => value ? true : '请输入新临时密码' },
    )
    const token = localStorage.getItem('LM_ADMIN_TOKEN') || ''
    const response = await fetch(`/api/admin/admins/${admin.id}/reset-password`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ password }),
    })
    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      throw new Error(body?.message || `密码重置失败（${response.status}）`)
    }
    ElMessage.success('临时密码已设置，旧会话已失效')
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(e?.message || '操作失败')
  }
}

async function handleDelete(admin: any) {
  try {
    await ElMessageBox.confirm(`确定删除管理员「${admin.nickname || admin.username}」？此操作不可恢复！`, '确认删除', { type: 'error' })
    const token = localStorage.getItem('LM_ADMIN_TOKEN') || ''
    await fetch(`/api/admin/admins/${admin.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    ElMessage.success('管理员已删除')
    await loadData()
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(e?.message || '操作失败')
  }
}

async function handleBatchDisable() {
  if (!selectedRows.value.length) {
    ElMessage.warning('请先选择要禁用的管理员')
    return
  }
  ElMessage.info('批量禁用功能开发中')
}

function handleExport() {
  ElMessage.info('导出日志功能开发中')
}

onMounted(() => loadData())
</script>

<style scoped>
.page-main-col {
  display: grid;
  gap: 18px;
}
.module-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
}
.btn-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.admin-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}
.role-tag {
  margin-right: 4px;
}
</style>
