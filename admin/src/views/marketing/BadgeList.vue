<template>
  <div class="page-container">
    <div class="page-header">
      <h2>徽章配置</h2>
      <el-button type="primary" @click="showCreateDialog = true">创建徽章</el-button>
    </div>

    <div class="glass-card">
      <el-table :data="badges" v-loading="loading">
        <el-table-column prop="icon" label="图标" width="80">
          <template #default="{ row }">
            <el-avatar :src="row.icon" :size="32" />
          </template>
        </el-table-column>
        <el-table-column prop="name" label="名称" />
        <el-table-column prop="description" label="描述" />
        <el-table-column prop="condition" label="获取条件" />
        <el-table-column prop="sortOrder" label="排序" width="80" />
        <el-table-column label="操作" width="100">
          <template #default="{ row }">
            <el-button size="small" @click="editBadge(row)">编辑</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="showCreateDialog" :title="editingBadge ? '编辑徽章' : '创建徽章'" width="500px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="名称" required>
          <el-input v-model="form.name" placeholder="徽章名称" />
        </el-form-item>
        <el-form-item label="图标">
          <el-input v-model="form.icon" placeholder="图标URL" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="获取条件">
          <el-input v-model="form.condition" placeholder="如：发布10篇帖子" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sortOrder" :min="0" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" @click="submitBadge" :loading="submitting">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { request } from '@/api/request'

const loading = ref(false)
const submitting = ref(false)
const showCreateDialog = ref(false)
const editingBadge = ref<any>(null)
const badges = ref<any[]>([])

const form = reactive({
  name: '',
  icon: '',
  description: '',
  condition: '',
  sortOrder: 0,
})

const loadBadges = async () => {
  loading.value = true
  try {
    const res = await request.get('/admin/marketing/badges')
    badges.value = res.data?.list || []
  } catch (error) {
    ElMessage.error('加载徽章失败')
  } finally {
    loading.value = false
  }
}

const editBadge = (badge: any) => {
  editingBadge.value = badge
  form.name = badge.name
  form.icon = badge.icon
  form.description = badge.description
  form.condition = badge.condition
  form.sortOrder = badge.sortOrder
  showCreateDialog.value = true
}

const submitBadge = async () => {
  submitting.value = true
  try {
    if (editingBadge.value) {
      await request.put(`/admin/marketing/badges/${editingBadge.value.id}`, form)
      ElMessage.success('徽章已更新')
    } else {
      await request.post('/admin/marketing/badges', form)
      ElMessage.success('徽章已创建')
    }
    showCreateDialog.value = false
    editingBadge.value = null
    loadBadges()
  } catch (error) {
    ElMessage.error('操作失败')
  } finally {
    submitting.value = false
  }
}

onMounted(() => { loadBadges() })
</script>

<style scoped>
.page-container { padding: 20px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
.glass-card { background: rgba(255,255,255,0.8); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.3); border-radius: 12px; padding: 20px; }
</style>
