<template>
  <div class="page-container">
    <FilterBar @search="onSearch" @reset="onReset">
      <a-input v-model:value="filter.keyword" placeholder="账号/姓名" allow-clear style="width:180px" />
      <a-select v-model:value="filter.roleId" placeholder="角色" allow-clear style="width:140px">
        <a-select-option v-for="r in roleOptions" :key="r.id" :value="r.id">{{r.name}}</a-select-option>
      </a-select>
      <a-select v-model:value="filter.status" placeholder="状态" allow-clear style="width:100px">
        <a-select-option :value="1">启用</a-select-option>
        <a-select-option :value="0">禁用</a-select-option>
      </a-select>
    </FilterBar>
    <div class="page-card">
      <div class="page-header">
        <span class="page-title">管理员列表</span>
        <a-button type="primary" @click="onCreate"><plus-outlined /> 添加管理员</a-button>
      </div>
      <DataTable :columns="columns" :data-source="list" :loading="loading" :total="total" v-model:page="page" v-model:page-size="pageSize">
        <template #roles="{record}">
          <a-space wrap>
            <a-tag v-for="r in record.roles" :key="r.id" :color="r.code==='super_admin'?'red':'blue'">{{r.name}}</a-tag>
          </a-space>
        </template>
        <template #status="{record}">
          <a-badge :status="record.status===1?'processing':'default'" :text="record.status===1?'启用':'禁用'" />
        </template>
        <template #action="{record}">
          <a-space>
            <a @click="onEdit(record)">编辑</a>
            <a @click="onResetPwd(record)">重置密码</a>
            <a-popconfirm title="确定?" @confirm="onToggleStatus(record)">
              <a :style="{color:record.status===1?'#ef4444':'#10b981'}">{{record.status===1?'禁用':'启用'}}</a>
            </a-popconfirm>
          </a-space>
        </template>
      </DataTable>
    </div>

    <!-- 添加/编辑管理员 -->
    <a-modal v-model:open="modalVisible" :title="editingId?'编辑管理员':'添加管理员'" @ok="onSubmit" :confirm-loading="submitting">
      <a-form :model="form" layout="vertical" :rules="formRules" ref="formRef">
        <a-form-item label="账号" name="username" required>
          <a-input v-model:value="form.username" :disabled="!!editingId" placeholder="登录账号" />
        </a-form-item>
        <a-form-item v-if="!editingId" label="密码" name="password" required>
          <a-input-password v-model:value="form.password" placeholder="初始密码" />
        </a-form-item>
        <a-form-item label="姓名" name="realName">
          <a-input v-model:value="form.realName" placeholder="真实姓名" />
        </a-form-item>
        <a-form-item label="手机" name="phone">
          <a-input v-model:value="form.phone" placeholder="手机号" />
        </a-form-item>
        <a-form-item label="邮箱" name="email">
          <a-input v-model:value="form.email" placeholder="邮箱地址" />
        </a-form-item>
        <a-form-item label="角色" name="roleIds" required>
          <a-select v-model:value="form.roleIds" mode="multiple" placeholder="选择角色">
            <a-select-option v-for="r in roleOptions" :key="r.id" :value="r.id">{{r.name}}</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item v-if="editingId" label="状态" name="status">
          <a-radio-group v-model:value="form.status">
            <a-radio :value="1">启用</a-radio>
            <a-radio :value="0">禁用</a-radio>
          </a-radio-group>
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 重置密码 -->
    <a-modal v-model:open="pwdModalVisible" title="重置密码" @ok="onSubmitPwd" :confirm-loading="pwdSubmitting">
      <a-form :model="pwdForm" layout="vertical" ref="pwdFormRef">
        <a-form-item label="新密码" name="password" :rules="[{required:true,message:'请输入新密码'}]">
          <a-input-password v-model:value="pwdForm.password" placeholder="新密码" />
        </a-form-item>
        <a-form-item label="确认密码" name="confirmPassword" :rules="[{required:true,validator:validateConfirmPwd}]">
          <a-input-password v-model:value="pwdForm.confirmPassword" placeholder="确认密码" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { PlusOutlined } from '@ant-design/icons-vue'
import { systemApi } from '@/api/system'
import FilterBar from '@/components/common/FilterBar.vue'
import DataTable from '@/components/common/DataTable.vue'

const loading = ref(false), list = ref<any[]>([]), total = ref(0), page = ref(1), pageSize = ref(20)
const filter = reactive({ keyword: '', roleId: undefined as number | undefined, status: undefined as number | undefined })
const roleOptions = ref<any[]>([])

const columns = [
  { title: '账号', dataIndex: 'username', width: 120 },
  { title: '姓名', dataIndex: 'realName', width: 100 },
  { title: '角色', dataIndex: 'roles', width: 200, slot: 'roles' },
  { title: '手机', dataIndex: 'phone', width: 130 },
  { title: '邮箱', dataIndex: 'email', width: 180 },
  { title: '状态', dataIndex: 'status', width: 80, slot: 'status' },
  { title: '最近登录', dataIndex: 'lastLoginAt', width: 160 },
  { title: '创建时间', dataIndex: 'createdAt', width: 160 },
  { title: '操作', dataIndex: 'action', width: 220, slot: 'action' },
]

async function fetchList() {
  loading.value = true
  try {
    const res = await systemApi.getAdminList({ page: page.value, pageSize: pageSize.value, ...filter })
    list.value = res.data.data?.list || res.data?.list || []
    total.value = res.data.data?.total || res.data?.total || 0
  } catch (err: any) {
    message.error(err?.message || '获取列表失败')
  } finally {
    loading.value = false
  }
}

async function fetchRoles() {
  try {
    const res = await systemApi.getRoleList()
    const data = (res.data as any)?.data || res.data || []
    roleOptions.value = Array.isArray(data) ? data : []
  } catch {}
}

function onSearch() { page.value = 1; fetchList() }
function onReset() { filter.keyword = ''; filter.roleId = undefined; filter.status = undefined; onSearch() }

// 表单
const modalVisible = ref(false), submitting = ref(false), editingId = ref('')
const formRef = ref<any>(null)
const form = reactive({ username: '', password: '', realName: '', phone: '', email: '', roleIds: [] as string[], status: 1 })
const formRules = {
  username: [{ required: true, message: '请输入账号' }],
  password: [{ required: true, message: '请输入密码' }],
  roleIds: [{ required: true, message: '请选择角色', type: 'array' as const }],
}

function onCreate() {
  editingId.value = ''
  form.username = ''; form.password = ''; form.realName = ''; form.phone = ''; form.email = ''; form.roleIds = []; form.status = 1
  modalVisible.value = true
}

function onEdit(record: any) {
  editingId.value = record.id
  form.username = record.username
  form.realName = record.realName || ''
  form.phone = record.phone || ''
  form.email = record.email || ''
  form.roleIds = (record.roles || []).map((r: any) => r.id)
  form.status = record.status
  modalVisible.value = true
}

async function onSubmit() {
  try { await formRef.value?.validate() } catch { return }
  submitting.value = true
  try {
    if (editingId.value) {
      await systemApi.updateAdmin(editingId.value as any, {
        realName: form.realName,
        phone: form.phone,
        email: form.email,
        status: form.status,
        roleIds: form.roleIds,
      })
    } else {
      await systemApi.saveAdmin({
        username: form.username,
        password: form.password,
        realName: form.realName,
        phone: form.phone,
        email: form.email,
        roleIds: form.roleIds,
      })
    }
    message.success('保存成功')
    modalVisible.value = false
    await fetchList()
  } catch (err: any) {
    message.error(err?.message || '保存失败')
  } finally {
    submitting.value = false
  }
}

// 重置密码
const pwdModalVisible = ref(false), pwdSubmitting = ref(false), pwdAdminId = ref('')
const pwdFormRef = ref<any>(null)
const pwdForm = reactive({ password: '', confirmPassword: '' })

function validateConfirmPwd(_rule: any, value: string) {
  if (!value) return Promise.reject('请确认密码')
  if (value !== pwdForm.password) return Promise.reject('两次密码不一致')
  return Promise.resolve()
}

function onResetPwd(record: any) {
  pwdAdminId.value = record.id
  pwdForm.password = ''; pwdForm.confirmPassword = ''
  pwdModalVisible.value = true
}

async function onSubmitPwd() {
  try { await pwdFormRef.value?.validate() } catch { return }
  pwdSubmitting.value = true
  try {
    await systemApi.resetPassword(pwdAdminId.value as any, pwdForm.password)
    message.success('密码重置成功')
    pwdModalVisible.value = false
  } catch (err: any) {
    message.error(err?.message || '重置失败')
  } finally {
    pwdSubmitting.value = false
  }
}

async function onToggleStatus(record: any) {
  try {
    await systemApi.toggleAdminStatus(record.id, record.status === 1 ? 0 : 1)
    message.success('已更新')
    await fetchList()
  } catch (err: any) {
    message.error(err?.message || '操作失败')
  }
}

onMounted(() => { fetchList(); fetchRoles() })
</script>
