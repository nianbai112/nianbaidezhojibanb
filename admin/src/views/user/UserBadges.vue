<template>
  <div class="page-shell">
    <PageHeader title="徽章称号" subtitle="管理用户徽章和称号" icon="Medal" />
    <div class="filter-bar">
      <el-button type="primary" @click="showBadgeDialog = true; resetBadgeForm()">新增徽章</el-button>
    </div>
    <el-table :data="badges" v-loading="loading" border stripe>
      <el-table-column prop="name" label="徽章名称" min-width="150" />
      <el-table-column prop="icon" label="图标" width="80">
        <template #default="{ row }">
          <el-image v-if="row.icon" :src="row.icon" style="width: 30px; height: 30px" />
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column prop="description" label="描述" min-width="200" show-overflow-tooltip />
      <el-table-column prop="condition" label="获取条件" width="150" show-overflow-tooltip />
      <el-table-column label="操作" width="150" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="editBadge(row)">编辑</el-button>
          <el-button size="small" type="danger" @click="delBadge(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-dialog v-model="showBadgeDialog" :title="editingBadge ? '编辑徽章' : '新增徽章'" width="500px">
      <el-form :model="badgeForm" label-width="100px">
        <el-form-item label="徽章名称" required><el-input v-model="badgeForm.name" placeholder="请输入徽章名称" /></el-form-item>
        <el-form-item label="图标URL"><el-input v-model="badgeForm.icon" placeholder="图标URL" /></el-form-item>
        <el-form-item label="描述"><el-input v-model="badgeForm.description" type="textarea" :rows="2" placeholder="徽章描述" /></el-form-item>
        <el-form-item label="获取条件"><el-input v-model="badgeForm.condition" placeholder="获取条件描述" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showBadgeDialog = false">取消</el-button>
        <el-button type="primary" @click="submitBadge">确定</el-button>
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
const badges = ref<any[]>([])
const showBadgeDialog = ref(false)
const editingBadge = ref<any>(null)
const badgeForm = reactive({ name: '', icon: '', description: '', condition: '' })

const resetBadgeForm = () => { badgeForm.name = ''; badgeForm.icon = ''; badgeForm.description = ''; badgeForm.condition = ''; editingBadge.value = null }
const editBadge = (row: any) => { editingBadge.value = row; badgeForm.name = row.name; badgeForm.icon = row.icon || ''; badgeForm.description = row.description || ''; badgeForm.condition = row.condition || ''; showBadgeDialog.value = true }

const loadData = async () => {
  loading.value = true
  try {
    const res: any = await request.get('/admin/marketing/badges')
    badges.value = res?.list || res?.data?.list || res || []
  } catch (e: any) { ElMessage.error(e?.message || '加载失败') } finally { loading.value = false }
}

const submitBadge = async () => {
  if (!badgeForm.name.trim()) { ElMessage.warning('请输入徽章名称'); return }
  try {
    if (editingBadge.value) {
      await request.put(`/admin/marketing/badges/${editingBadge.value.id}`, badgeForm)
      ElMessage.success('更新成功')
    } else {
      await request.post('/admin/marketing/badges', badgeForm)
      ElMessage.success('创建成功')
    }
    showBadgeDialog.value = false; resetBadgeForm(); loadData()
  } catch (e) { ElMessage.error('操作失败') }
}

const delBadge = async (row: any) => {
  try {
    await ElMessageBox.confirm('确定删除该徽章？', '确认', { type: 'warning' })
    await request.delete(`/admin/marketing/badges/${row.id}`)
    ElMessage.success('删除成功'); loadData()
  } catch (e: any) { if (e !== 'cancel') ElMessage.error('删除失败') }
}

onMounted(() => loadData())
</script>

<style scoped>
.page-shell { padding: 24px; }
.filter-bar { display: flex; gap: 12px; margin: 16px 0; }
</style>
