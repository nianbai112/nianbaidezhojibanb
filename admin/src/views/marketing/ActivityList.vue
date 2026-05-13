<template>
  <div class="page-container">
    <div class="page-header">
      <h2>活动管理</h2>
      <el-button type="primary" @click="showCreateDialog = true">创建活动</el-button>
    </div>

    <div class="glass-card">
      <el-table :data="activities" v-loading="loading">
        <el-table-column prop="title" label="活动名称" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)" size="small">{{ getStatusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="startAt" label="开始时间" width="180" />
        <el-table-column prop="endAt" label="结束时间" width="180" />
        <el-table-column prop="joinCount" label="参与人数" width="100" />
        <el-table-column label="操作" width="150">
          <template #default="{ row }">
            <el-button size="small" @click="editActivity(row)">编辑</el-button>
            <el-button size="small" @click="$router.push(`/marketing/activities/${row.id}/orders`)">订单</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="showCreateDialog" :title="editingActivity ? '编辑活动' : '创建活动'" width="600px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="活动名称" required>
          <el-input v-model="form.title" placeholder="活动名称" />
        </el-form-item>
        <el-form-item label="活动描述">
          <el-input v-model="form.description" type="textarea" :rows="3" />
        </el-form-item>
        <el-form-item label="封面图">
          <el-input v-model="form.cover" placeholder="封面图URL" />
        </el-form-item>
        <el-form-item label="活动时间">
          <el-date-picker v-model="form.dateRange" type="datetimerange" range-separator="至" start-placeholder="开始" end-placeholder="结束" style="width: 100%" />
        </el-form-item>
        <el-form-item label="最大人数">
          <el-input-number v-model="form.maxPeople" :min="0" />
        </el-form-item>
        <el-form-item label="费用">
          <el-input-number v-model="form.fee" :min="0" :precision="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" @click="submitActivity" :loading="submitting">确定</el-button>
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
const editingActivity = ref<any>(null)
const activities = ref<any[]>([])

const form = reactive({
  title: '',
  description: '',
  cover: '',
  dateRange: null as any,
  maxPeople: 0,
  fee: 0,
})

const getStatusType = (status: string) => {
  const map: Record<string, string> = { upcoming: 'info', signup: 'warning', ongoing: 'success', ended: '', cancelled: 'danger' }
  return map[status] || ''
}

const getStatusLabel = (status: string) => {
  const map: Record<string, string> = { upcoming: '未开始', signup: '报名中', ongoing: '进行中', ended: '已结束', cancelled: '已取消' }
  return map[status] || status
}

const loadActivities = async () => {
  loading.value = true
  try {
    const res = await request.get('/admin/marketing/activities')
    activities.value = res.data?.list || []
  } catch (error) {
    ElMessage.error('加载活动失败')
  } finally {
    loading.value = false
  }
}

const editActivity = (activity: any) => {
  editingActivity.value = activity
  form.title = activity.title
  form.description = activity.description
  form.cover = activity.cover
  form.maxPeople = activity.maxPeople
  form.fee = activity.fee
  showCreateDialog.value = true
}

const submitActivity = async () => {
  submitting.value = true
  try {
    const data = {
      ...form,
      startAt: form.dateRange?.[0]?.toISOString(),
      endAt: form.dateRange?.[1]?.toISOString(),
    }
    if (editingActivity.value) {
      await request.put(`/admin/marketing/activities/${editingActivity.value.id}`, data)
      ElMessage.success('活动已更新')
    } else {
      await request.post('/admin/marketing/activities', data)
      ElMessage.success('活动已创建')
    }
    showCreateDialog.value = false
    editingActivity.value = null
    loadActivities()
  } catch (error) {
    ElMessage.error('操作失败')
  } finally {
    submitting.value = false
  }
}

onMounted(() => { loadActivities() })
</script>

<style scoped>
.page-container { padding: 20px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
.glass-card { background: rgba(255,255,255,0.8); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.3); border-radius: 12px; padding: 20px; }
</style>
