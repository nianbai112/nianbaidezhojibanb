<template>
  <div class="page-shell">
    <PageHeader title="用户标签" subtitle="管理用户标签分组" icon="PriceTag" />
    <div class="filter-bar">
      <el-button type="primary" @click="showDialog = true; resetForm()">新增标签</el-button>
    </div>
    <el-table :data="list" v-loading="loading" border stripe>
      <el-table-column prop="name" label="标签名称" min-width="200" />
      <el-table-column prop="description" label="描述" min-width="200" show-overflow-tooltip />
      <el-table-column prop="createdAt" label="创建时间" width="170">
        <template #default="{ row }">{{ new Date(row.createdAt).toLocaleString('zh-CN') }}</template>
      </el-table-column>
      <el-table-column label="操作" width="150" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="edit(row)">编辑</el-button>
          <el-button size="small" type="danger" @click="del(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-dialog v-model="showDialog" :title="editing ? '编辑标签' : '新增标签'" width="500px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="标签名称" required><el-input v-model="form.name" placeholder="请输入标签名称" /></el-form-item>
        <el-form-item label="描述"><el-input v-model="form.description" type="textarea" :rows="3" placeholder="标签描述" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showDialog = false">取消</el-button>
        <el-button type="primary" @click="submit">确定</el-button>
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
const showDialog = ref(false)
const editing = ref<any>(null)
const form = reactive({ name: '', description: '' })

const resetForm = () => { form.name = ''; form.description = ''; editing.value = null }
const edit = (row: any) => { editing.value = row; form.name = row.name; form.description = row.description || ''; showDialog.value = true }

const loadData = async () => {
  loading.value = true
  try {
    const res: any = await request.get('/admin/user-tag-defs')
    list.value = res?.list || res?.data?.list || res || []
  } catch (e: any) { ElMessage.error(e?.message || '加载失败') } finally { loading.value = false }
}

const submit = async () => {
  if (!form.name.trim()) { ElMessage.warning('请输入标签名称'); return }
  try {
    if (editing.value) {
      await request.put(`/admin/user-tag-defs/${editing.value.id}`, form)
      ElMessage.success('更新成功')
    } else {
      await request.post('/admin/user-tag-defs', form)
      ElMessage.success('创建成功')
    }
    showDialog.value = false; resetForm(); loadData()
  } catch (e) { ElMessage.error('操作失败') }
}

const del = async (row: any) => {
  try {
    await ElMessageBox.confirm('确定删除该标签？', '确认', { type: 'warning' })
    await request.delete(`/admin/user-tag-defs/${row.id}`)
    ElMessage.success('删除成功'); loadData()
  } catch (e: any) { if (e !== 'cancel') ElMessage.error('删除失败') }
}

onMounted(() => loadData())
</script>

<style scoped>
.page-shell { padding: 24px; }
.filter-bar { display: flex; gap: 12px; margin: 16px 0; }
</style>
