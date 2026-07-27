<template>
  <div class="page-shell roles-page">
    <GlassPageHeader title="角色权限" subtitle="管理后台角色、权限点和运营账号可操作范围">
      <template #actions>
        <el-button :icon="RefreshRight" :loading="loading" @click="loadData(true)">刷新</el-button>
        <!-- AUD-P1-159: 新增角色按钮按 admin:edit 权限显隐 -->
        <el-button v-if="hasEditPermission" type="primary" :icon="Plus" @click="openDialog()">新增角色</el-button>
      </template>
    </GlassPageHeader>

    <div class="role-overview">
      <div class="overview-card glass-card">
        <span>角色总数</span>
        <strong>{{ roles.length }}</strong>
      </div>
      <div class="overview-card glass-card">
        <span>权限点</span>
        <strong>{{ permissions.length }}</strong>
      </div>
      <div class="overview-card glass-card">
        <span>系统角色</span>
        <strong>{{ systemRoleCount }}</strong>
      </div>
    </div>

    <div class="glass-card table-card">
      <el-table :data="roles" v-loading="loading" stripe>
        <el-table-column prop="name" label="角色名称" min-width="150" />
        <el-table-column prop="code" label="角色编码" min-width="150" show-overflow-tooltip />
        <el-table-column label="权限数量" width="120">
          <template #default="{ row }">{{ row.permissions?.length || 0 }}</template>
        </el-table-column>
        <el-table-column prop="description" label="描述" min-width="220" show-overflow-tooltip />
        <el-table-column label="类型" width="110">
          <template #default="{ row }">
            <el-tag :type="row.isSystem ? 'warning' : 'success'" effect="plain">
              {{ row.isSystem ? '系统内置' : '自定义' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="已授权权限" min-width="260">
          <template #default="{ row }">
            <div class="permission-chips">
              <el-tag
                v-for="item in permissionPreview(row)"
                :key="item.code"
                size="small"
                effect="plain"
              >
                {{ item.name || item.code }}
              </el-tag>
              <span v-if="(row.permissions?.length || 0) > 4" class="more-text">
                +{{ row.permissions.length - 4 }}
              </span>
              <span v-if="!row.permissions?.length" class="empty-text">未配置</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="170" fixed="right">
          <template #default="{ row }">
            <!-- AUD-P1-159: 编辑按钮按 admin:edit 权限显隐 -->
            <el-button v-if="hasEditPermission" link type="primary" @click="openDialog(row)">编辑权限</el-button>
            <!-- AUD-P1-159: 删除按钮按 admin:delete 权限显隐 -->
            <el-button v-if="hasDeletePermission" link type="danger" :disabled="row.isSystem" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog
      v-model="dialogVisible"
      :title="editingRole?.id ? '编辑角色权限' : '新增角色'"
      width="760px"
      class="role-dialog"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
        <div class="form-grid">
          <el-form-item label="角色名称" prop="name">
            <el-input v-model="form.name" placeholder="如：区域运营" />
          </el-form-item>
          <el-form-item label="角色编码" prop="code">
            <el-input v-model="form.code" placeholder="如：region_operator" :disabled="editingRole?.isSystem" />
          </el-form-item>
        </div>
        <el-form-item label="角色说明">
          <el-input v-model="form.description" type="textarea" :rows="3" placeholder="说明这个角色能做什么" />
        </el-form-item>
        <el-form-item label="权限配置">
          <div class="permission-panel">
            <div class="permission-tools">
              <span>已选择 {{ checkedPermissionIds.length }} 个权限点</span>
              <div>
                <el-button size="small" @click="checkAll">全选</el-button>
                <el-button size="small" @click="clearChecked">清空</el-button>
              </div>
            </div>
            <el-tree
              ref="permissionTreeRef"
              :data="permissionTree"
              show-checkbox
              node-key="id"
              default-expand-all
              :props="{ label: 'label', children: 'children', disabled: 'disabled' }"
              @check="syncChecked"
            />
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveRole">保存角色</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { Plus, RefreshRight } from '@element-plus/icons-vue'
import GlassPageHeader from '@/components/glass/GlassPageHeader.vue'
import { createRole, deleteRole, fetchPermissions, fetchRoleList, updateRole } from '@/api/admin'
import { useAuthStore } from '@/stores/auth'

// AUD-P1-159: 权限检查
const auth = useAuthStore()
const hasEditPermission = computed(() => auth.permissions.includes('admin:edit'))
const hasDeletePermission = computed(() => auth.permissions.includes('admin:delete'))

interface PermissionItem {
  id: string
  code: string
  name: string
  module?: string
  action?: string
}

const loading = ref(false)
const saving = ref(false)
const roles = ref<any[]>([])
const permissions = ref<PermissionItem[]>([])
const dialogVisible = ref(false)
const editingRole = ref<any | null>(null)
const formRef = ref<FormInstance>()
const permissionTreeRef = ref<any>()
const checkedPermissionIds = ref<string[]>([])

const form = reactive({
  name: '',
  code: '',
  description: '',
})

const rules: FormRules = {
  name: [{ required: true, message: '请输入角色名称', trigger: 'blur' }],
  code: [{ required: true, message: '请输入角色编码', trigger: 'blur' }],
}

const systemRoleCount = computed(() => roles.value.filter((item) => item.isSystem).length)
const permissionTree = computed(() => {
  const modules = new Map<string, PermissionItem[]>()
  permissions.value.forEach((item) => {
    const moduleName = item.module || 'other'
    if (!modules.has(moduleName)) modules.set(moduleName, [])
    modules.get(moduleName)!.push(item)
  })
  return Array.from(modules.entries()).map(([moduleName, items]) => ({
    id: `module:${moduleName}`,
    label: moduleNameLabel(moduleName),
    disabled: true,
    children: items.map((item) => ({
      id: item.id,
      label: `${item.name || item.code}（${item.code}）`,
    })),
  }))
})

function moduleNameLabel(moduleName: string) {
  const map: Record<string, string> = {
    admin: '管理员',
    system: '系统运维',
    region: '区域中心',
    user: '用户中心',
    content: '内容中心',
    merchant: '商家中心',
    mall: '商城中心',
    order: '订单中心',
    finance: '财务中心',
    marketing: '营销增长',
    notification: '通知中心',
  }
  return map[moduleName] || moduleName
}

function permissionPreview(row: any) {
  return (row.permissions || []).slice(0, 4)
}

async function loadData(showSuccess = false) {
  loading.value = true
  try {
    const [roleRes, permissionRes]: any[] = await Promise.all([
      fetchRoleList(),
      fetchPermissions(),
    ])
    roles.value = roleRes?.list || roleRes?.data?.list || []
    permissions.value = permissionRes?.list || permissionRes?.data?.list || []
    if (showSuccess) ElMessage.success('角色权限已刷新')
  } catch (e: any) {
    ElMessage.error(e?.message || '加载角色权限失败')
  } finally {
    loading.value = false
  }
}

function resetForm() {
  form.name = ''
  form.code = ''
  form.description = ''
  checkedPermissionIds.value = []
  nextTick(() => permissionTreeRef.value?.setCheckedKeys([]))
}

async function openDialog(row?: any) {
  editingRole.value = row || null
  if (!permissions.value.length) await loadData()
  if (row) {
    form.name = row.name || ''
    form.code = row.code || ''
    form.description = row.description || ''
    checkedPermissionIds.value = (row.permissions || []).map((item: any) => item.id)
  } else {
    resetForm()
  }
  dialogVisible.value = true
  nextTick(() => permissionTreeRef.value?.setCheckedKeys(checkedPermissionIds.value))
}

function syncChecked(_: any, state: any) {
  checkedPermissionIds.value = (state.checkedKeys || []).filter((id: string) => !id.startsWith('module:'))
}

function checkAll() {
  checkedPermissionIds.value = permissions.value.map((item) => item.id)
  permissionTreeRef.value?.setCheckedKeys(checkedPermissionIds.value)
}

function clearChecked() {
  checkedPermissionIds.value = []
  permissionTreeRef.value?.setCheckedKeys([])
}

async function saveRole() {
  await formRef.value?.validate()
  saving.value = true
  try {
    const payload = {
      name: form.name,
      code: form.code,
      description: form.description,
      permissions: checkedPermissionIds.value,
    }
    if (editingRole.value?.id) {
      await updateRole(editingRole.value.id, payload)
      ElMessage.success('角色已更新')
    } else {
      await createRole(payload)
      ElMessage.success('角色已创建')
    }
    dialogVisible.value = false
    await loadData()
  } catch (e: any) {
    ElMessage.error(e?.message || '保存角色失败')
  } finally {
    saving.value = false
  }
}

async function handleDelete(row: any) {
  if (row.isSystem) return
  await ElMessageBox.confirm(`确定删除角色「${row.name}」？`, '删除角色', { type: 'warning' })
  try {
    await deleteRole(row.id)
    ElMessage.success('角色已删除')
    await loadData()
  } catch (e: any) {
    ElMessage.error(e?.message || '删除角色失败')
  }
}

loadData()
</script>

<style scoped lang="scss">
.roles-page {
  display: grid;
  gap: 18px;
}
.role-overview {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}
.overview-card {
  padding: 18px 20px;
  display: grid;
  gap: 8px;
}
.overview-card span {
  color: #64748b;
  font-size: 13px;
  font-weight: 800;
}
.overview-card strong {
  color: #0f172a;
  font-size: 30px;
  font-weight: 950;
}
.table-card {
  padding: 14px;
}
.permission-chips {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.more-text,
.empty-text {
  color: #94a3b8;
  font-size: 12px;
  font-weight: 700;
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.permission-panel {
  width: 100%;
  border: 1px solid rgba(226, 232, 240, .9);
  border-radius: 14px;
  padding: 12px;
  background: rgba(248, 250, 252, .72);
  max-height: 420px;
  overflow: auto;
}
.permission-tools {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  color: #64748b;
  font-size: 13px;
  font-weight: 800;
}
@media (max-width: 860px) {
  .role-overview,
  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
