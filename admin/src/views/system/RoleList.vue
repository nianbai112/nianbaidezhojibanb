<template>
  <div class="page-container">
    <div class="page-card">
      <div class="page-header">
        <span class="page-title">角色管理</span>
        <a-button type="primary" @click="onCreate"><PlusOutlined /> 添加角色</a-button>
      </div>
      <a-table :columns="columns" :data-source="list" row-key="id" size="middle" :pagination="false">
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'isSystem'">
            <a-tag :color="record.isSystem ? 'blue' : 'default'">{{ record.isSystem ? '系统' : '自定义' }}</a-tag>
          </template>
          <template v-if="column.key === 'action'">
            <a-space>
              <a @click="onEdit(record)">编辑</a>
              <a @click="onPerm(record)">权限</a>
              <a-popconfirm title="确定删除?" @confirm="onDel(record.id)">
                <a style="color:#ef4444" :class="{ disabled: record.isSystem }">删除</a>
              </a-popconfirm>
            </a-space>
          </template>
        </template>
      </a-table>
    </div>

    <!-- 添加/编辑角色 -->
    <a-modal v-model:open="modalVisible" :title="modalTitle" @ok="onSubmit" :confirm-loading="submitting">
      <a-form :model="form" :label-col="{ span: 4 }" :wrapper-col="{ span: 18 }">
        <a-form-item label="角色名称" required>
          <a-input v-model:value="form.name" />
        </a-form-item>
        <a-form-item label="角色编码" required>
          <a-input v-model:value="form.code" :disabled="!!form.id" />
        </a-form-item>
        <a-form-item label="描述">
          <a-textarea v-model:value="form.description" :rows="3" />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 权限配置 -->
    <a-modal v-model:open="permVisible" title="权限配置" @ok="onSavePerm" :confirm-loading="permSaving" width="640px">
      <a-tree
        v-if="permTree.length"
        v-model:checkedKeys="checkedPerms"
        checkable
        :tree-data="permTree"
        :default-expand-all="true"
      />
      <a-empty v-else description="暂无权限数据" />
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { message } from 'ant-design-vue'
import { PlusOutlined } from '@ant-design/icons-vue'
import { systemApi } from '@/api/system'
import request from '@/utils/request'

const list = ref<any[]>([])
const loading = ref(false)
const modalVisible = ref(false)
const submitting = ref(false)
const permVisible = ref(false)
const permSaving = ref(false)
const form = ref<any>({ name: '', code: '', description: '' })
const allPermissions = ref<any[]>([])
const checkedPerms = ref<string[]>([])
const currentRoleId = ref('')

const modalTitle = computed(() => form.value.id ? '编辑角色' : '添加角色')

const columns = [
  { title: '角色名称', dataIndex: 'name', width: 150 },
  { title: '编码', dataIndex: 'code', width: 150 },
  { title: '描述', dataIndex: 'description' },
  { title: '类型', key: 'isSystem', width: 100 },
  { title: '创建时间', dataIndex: 'createdAt', width: 160 },
  { title: '操作', key: 'action', width: 160 },
]

const MODULE_LABEL_MAP: Record<string, string> = {
  user: '用户管理',
  content: '内容管理',
  circle: '圈子管理',
  merchant: '商家管理',
  product: '商品管理',
  order: '订单管理',
  finance: '财务管理',
  config: '系统配置',
  admin: '管理员管理',
  secondhand: '二手交易',
  'drift-bottle': '漂流瓶',
  'punch-in': '打卡评分',
  netdisk: '网盘',
  dating: '交友',
  topup: '充值',
  club: '社团',
  lottery: '抽奖',
  ranking: '排行榜',
  review: '点评',
  'user-guidance': '用户引导',
  contacts: '通讯录',
  'wechat-article': '微信文章',
  printer: '打印机',
  'user-title': '头衔',
  sticker: '贴纸',
}

const permTree = computed(() => {
  const grouped = new Map<string, any[]>()
  for (const p of allPermissions.value) {
    const mod = p.module || 'other'
    if (!grouped.has(mod)) grouped.set(mod, [])
    grouped.get(mod)!.push({ title: p.name, key: p.id, value: p.id })
  }
  return Array.from(grouped.entries()).map(([module, children]) => ({
    title: MODULE_LABEL_MAP[module] || module,
    key: module,
    children,
  }))
})

onMounted(() => {
  fetchRoles()
  fetchPermissions()
})

async function fetchRoles() {
  loading.value = true
  try {
    const res = await systemApi.getRoleList()
    const data = (res.data as any)?.data || res.data || []
    list.value = Array.isArray(data) ? data : []
  } catch (err: any) {
    message.error(err?.message || '获取角色列表失败')
  } finally {
    loading.value = false
  }
}

async function fetchPermissions() {
  try {
    const res = await request.get('/admin/permissions')
    const data = (res.data as any)?.data || res.data || []
    allPermissions.value = Array.isArray(data) ? data : []
  } catch {
    // 忽略权限加载失败
  }
}

function onCreate() {
  form.value = { name: '', code: '', description: '' }
  modalVisible.value = true
}

function onEdit(record: any) {
  form.value = { ...record }
  modalVisible.value = true
}

async function onSubmit() {
  if (!form.value.name.trim() || !form.value.code.trim()) {
    message.warning('请填写角色名称和编码')
    return
  }
  submitting.value = true
  try {
    if (form.value.id) {
      await systemApi.updateRole(form.value.id, {
        name: form.value.name,
        description: form.value.description,
      })
    } else {
      await systemApi.saveRole({
        name: form.value.name,
        code: form.value.code,
        description: form.value.description,
      })
    }
    message.success('保存成功')
    modalVisible.value = false
    await fetchRoles()
  } catch (err: any) {
    message.error(err?.message || '保存失败')
  } finally {
    submitting.value = false
  }
}

async function onDel(id: number | string) {
  try {
    await systemApi.deleteRole(id as number)
    message.success('删除成功')
    await fetchRoles()
  } catch (err: any) {
    message.error(err?.message || '删除失败')
  }
}

async function onPerm(record: any) {
  currentRoleId.value = record.id
  checkedPerms.value = []
  try {
    const res = await request.get(`/admin/roles/${record.id}`)
    const role = (res.data as any)?.data || res.data || {}
    checkedPerms.value = (role.permissions || []).map((p: any) => p.permission?.id || p.id).filter(Boolean)
  } catch {
    // ignore
  }
  permVisible.value = true
}

async function onSavePerm() {
  if (!currentRoleId.value) return
  permSaving.value = true
  try {
    await systemApi.updateRole(currentRoleId.value as any, {
      permissions: checkedPerms.value,
    })
    message.success('权限配置已保存')
    permVisible.value = false
  } catch (err: any) {
    message.error(err?.message || '保存失败')
  } finally {
    permSaving.value = false
  }
}
</script>

<style scoped>
.disabled {
  pointer-events: none;
  opacity: 0.5;
}
</style>
