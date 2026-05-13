<template>
  <div class="page-container">
    <div class="page-header">
      <h2>AI任务</h2>
      <el-button type="primary" @click="showCreateDialog = true">创建任务</el-button>
    </div>

    <div class="glass-card">
      <el-table :data="tasks" v-loading="loading">
        <el-table-column prop="name" label="任务名称" />
        <el-table-column prop="type" label="类型" width="120">
          <template #default="{ row }">
            <el-tag size="small">{{ getTypeLabel(row.type) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)" size="small">{{ getStatusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="180" />
        <el-table-column label="操作" width="150">
          <template #default="{ row }">
            <el-button size="small" @click="editTask(row)">编辑</el-button>
            <el-button size="small" :type="row.status === 'pending' ? 'success' : 'warning'" @click="toggleStatus(row)">
              {{ row.status === 'pending' ? '启动' : '暂停' }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="showCreateDialog" :title="editingTask ? '编辑任务' : '创建任务'" width="600px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="任务名称">
          <el-input v-model="form.name" placeholder="任务名称" />
        </el-form-item>
        <el-form-item label="任务类型" required>
          <el-select v-model="form.type" style="width: 100%">
            <el-option label="自动发帖" value="post" />
            <el-option label="自动评论" value="comment" />
            <el-option label="内容冷启动" value="cold_start" />
            <el-option label="自动互动" value="interaction" />
          </el-select>
        </el-form-item>
        <el-form-item label="区域">
          <el-select v-model="form.regionId" style="width: 100%" clearable>
            <el-option v-for="region in regions" :key="region.id" :label="region.name" :value="region.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="3" placeholder="任务描述" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" @click="submitTask" :loading="submitting">确定</el-button>
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
const editingTask = ref<any>(null)
const tasks = ref<any[]>([])
const regions = ref<any[]>([])

const form = reactive({
  name: '',
  type: 'post',
  regionId: '',
  description: '',
})

const getTypeLabel = (type: string) => {
  const map: Record<string, string> = { post: '自动发帖', comment: '自动评论', cold_start: '内容冷启动', interaction: '自动互动' }
  return map[type] || type
}

const getStatusType = (status: string) => {
  const map: Record<string, string> = { pending: 'info', running: 'success', paused: 'warning', completed: '', failed: 'danger' }
  return map[status] || ''
}

const getStatusLabel = (status: string) => {
  const map: Record<string, string> = { pending: '待执行', running: '运行中', paused: '已暂停', completed: '已完成', failed: '失败' }
  return map[status] || status
}

const loadTasks = async () => {
  loading.value = true
  try {
    const res = await request.get('/admin/ai/tasks')
    tasks.value = res.data?.list || []
  } catch (error) {
    ElMessage.error('加载任务失败')
  } finally {
    loading.value = false
  }
}

const loadRegions = async () => {
  try {
    const res = await request.get('/admin/regions')
    regions.value = res.data?.list || []
  } catch (error) {
    console.error('加载区域失败', error)
    ElMessage.warning('加载区域列表失败')
  }
}

const editTask = (task: any) => {
  editingTask.value = task
  form.name = task.name
  form.type = task.type
  form.regionId = task.regionId
  form.description = task.description
  showCreateDialog.value = true
}

const submitTask = async () => {
  submitting.value = true
  try {
    if (editingTask.value) {
      await request.put(`/admin/ai/tasks/${editingTask.value.id}`, form)
      ElMessage.success('任务已更新')
    } else {
      await request.post('/admin/ai/tasks', form)
      ElMessage.success('任务已创建')
    }
    showCreateDialog.value = false
    editingTask.value = null
    loadTasks()
  } catch (error) {
    ElMessage.error('操作失败')
  } finally {
    submitting.value = false
  }
}

const toggleStatus = async (task: any) => {
  try {
    await request.put(`/admin/ai/tasks/${task.id}/status`, {
      status: task.status === 'pending' ? 'running' : 'paused',
    })
    ElMessage.success('状态已更新')
    loadTasks()
  } catch (error) {
    ElMessage.error('操作失败')
  }
}

onMounted(() => {
  loadTasks()
  loadRegions()
})
</script>

<style scoped>
.page-container { padding: 20px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
.glass-card { background: rgba(255,255,255,0.8); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.3); border-radius: 12px; padding: 20px; }
</style>
