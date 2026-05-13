<template>
  <div class="page-shell">
    <PageHeader title="客服管理" subtitle="管理商城客服人员" icon="Service" />
    <div class="filter-bar">
      <el-input v-model="filters.keyword" placeholder="搜索昵称/手机号/微信号" clearable style="width: 220px" @clear="loadData" @keyup.enter="loadData" />
      <el-select v-model="filters.status" placeholder="状态" clearable style="width: 120px" @change="loadData">
        <el-option label="启用" value="active" />
        <el-option label="禁用" value="disabled" />
      </el-select>
      <el-button type="primary" @click="loadData">查询</el-button>
      <el-button @click="resetFilters">重置</el-button>
      <el-button type="success" @click="openEdit()">新增客服</el-button>
    </div>
    <el-table :data="list" v-loading="loading" border stripe>
      <el-table-column prop="avatar" label="头像" width="70">
        <template #default="{ row }">
          <el-avatar v-if="row.avatar" :src="row.avatar" :size="36" />
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column prop="nickname" label="昵称" min-width="120" show-overflow-tooltip />
      <el-table-column prop="phone" label="手机号" width="120" />
      <el-table-column prop="wechat" label="微信号" width="120" />
      <el-table-column prop="onlineStatus" label="在线状态" width="90">
        <template #default="{ row }">
          <el-tag :type="row.onlineStatus === 'online' ? 'success' : 'info'" size="small">
            {{ row.onlineStatus === 'online' ? '在线' : '离线' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="workTime" label="工作时间" min-width="140" show-overflow-tooltip />
      <el-table-column prop="status" label="状态" width="80">
        <template #default="{ row }">
          <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small">
            {{ row.status === 'active' ? '启用' : '禁用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" label="创建时间" width="170">
        <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="220" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openEdit(row)">编辑</el-button>
          <el-button size="small" :type="row.status === 'active' ? 'warning' : 'success'" @click="toggleStatus(row)">
            {{ row.status === 'active' ? '禁用' : '启用' }}
          </el-button>
          <el-button size="small" type="danger" @click="delRow(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <div class="pagination-bar">
      <el-pagination v-model:current-page="page" v-model:page-size="pageSize" :total="total" :page-sizes="[10,20,50]" layout="total, sizes, prev, pager, next" @size-change="loadData" @current-change="loadData" />
    </div>

    <el-dialog v-model="editVisible" :title="editingId ? '编辑客服' : '新增客服'" width="560px" :close-on-click-modal="false">
      <el-form :model="form" label-width="100px" :rules="rules" ref="formRef">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="昵称" prop="nickname"><el-input v-model="form.nickname" placeholder="请输入昵称" /></el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="头像URL"><el-input v-model="form.avatar" placeholder="头像图片URL" /></el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="手机号"><el-input v-model="form.phone" placeholder="手机号" /></el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="微信号"><el-input v-model="form.wechat" placeholder="微信号" /></el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="在线状态">
              <el-select v-model="form.onlineStatus" style="width: 100%">
                <el-option label="在线" value="online" />
                <el-option label="离线" value="offline" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="状态">
              <el-select v-model="form.status" style="width: 100%">
                <el-option label="启用" value="active" />
                <el-option label="禁用" value="disabled" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="工作时间"><el-input v-model="form.workTime" placeholder="如：9:00-18:00" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" @click="submitEdit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import PageHeader from '@/components/common/PageHeader.vue'
import { request } from '@/api/request'
import { ElMessage, ElMessageBox } from 'element-plus'

const loading = ref(false)
const list = ref<any[]>([])
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const filters = reactive({ keyword: '', status: '' })

const editVisible = ref(false)
const editingId = ref('')
const form = reactive<any>({ nickname: '', avatar: '', phone: '', wechat: '', onlineStatus: 'offline', workTime: '', status: 'active' })
const formRef = ref<any>(null)
const rules = {
  nickname: [{ required: true, message: '请输入昵称', trigger: 'blur' }],
}

const formatDate = (d: any) => d ? new Date(d).toLocaleString('zh-CN') : '-'

const loadData = async () => {
  loading.value = true
  try {
    const res: any = await request.get('/mall/admin/service-staff', { params: { page: page.value, pageSize: pageSize.value, ...filters } })
    list.value = res?.list || res?.data?.list || []
    total.value = res?.total ?? res?.data?.total ?? 0
  } catch (e: any) {
    ElMessage.error(e?.message || '加载客服列表失败')
  } finally {
    loading.value = false
  }
}

const resetFilters = () => {
  Object.assign(filters, { keyword: '', status: '' })
  page.value = 1
  loadData()
}

const openEdit = (row?: any) => {
  editingId.value = row?.id || ''
  if (row) {
    Object.assign(form, { nickname: row.nickname || '', avatar: row.avatar || '', phone: row.phone || '', wechat: row.wechat || '', onlineStatus: row.onlineStatus || 'offline', workTime: row.workTime || '', status: row.status || 'active' })
  } else {
    Object.assign(form, { nickname: '', avatar: '', phone: '', wechat: '', onlineStatus: 'offline', workTime: '', status: 'active' })
  }
  editVisible.value = true
}

const submitEdit = async () => {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  try {
    if (editingId.value) {
      await request.put(`/mall/admin/service-staff/${editingId.value}`, form)
      ElMessage.success('更新成功')
    } else {
      await request.post('/mall/admin/service-staff', form)
      ElMessage.success('创建成功')
    }
    editVisible.value = false
    loadData()
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败')
  }
}

const toggleStatus = async (row: any) => {
  try {
    const target = row.status === 'active' ? 'disabled' : 'active'
    await ElMessageBox.confirm(`确定${target === 'active' ? '启用' : '禁用'}该客服？`, '确认', { type: 'warning' })
    await request.put(`/mall/admin/service-staff/${row.id}/status`, { status: target })
    ElMessage.success('操作成功')
    loadData()
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(e?.message || '操作失败')
  }
}

const delRow = async (row: any) => {
  try {
    await ElMessageBox.confirm('确定删除该客服？', '确认', { type: 'warning' })
    await request.delete(`/mall/admin/service-staff/${row.id}`)
    ElMessage.success('删除成功')
    loadData()
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(e?.message || '删除失败')
  }
}

onMounted(() => loadData())
</script>

<style scoped>
.page-shell { padding: 24px; }
.filter-bar { display: flex; gap: 12px; margin: 16px 0; flex-wrap: wrap; align-items: center; }
.pagination-bar { display: flex; justify-content: flex-end; margin-top: 16px; }
</style>
