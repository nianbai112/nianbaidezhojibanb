<template>
  <div class="page-container">
    <div class="page-header">
      <h2>AI日志</h2>
    </div>

    <div class="glass-card">
      <el-table :data="logs" v-loading="loading">
        <el-table-column prop="bot.nickname" label="机器人" width="120" />
        <el-table-column prop="task.name" label="任务" width="150" />
        <el-table-column prop="task.type" label="类型" width="100">
          <template #default="{ row }">
            <el-tag size="small">{{ row.task?.type || '-' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'success' ? 'success' : 'danger'" size="small">
              {{ row.status === 'success' ? '成功' : '失败' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="message" label="消息" show-overflow-tooltip />
        <el-table-column prop="createdAt" label="时间" width="180" />
      </el-table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { request } from '@/api/request'

const loading = ref(false)
const logs = ref<any[]>([])

const loadLogs = async () => {
  loading.value = true
  try {
    const res = await request.get('/admin/ai/logs')
    logs.value = res.data?.list || []
  } catch (error) {
    ElMessage.error('加载日志失败')
  } finally {
    loading.value = false
  }
}

onMounted(() => { loadLogs() })
</script>

<style scoped>
.page-container { padding: 20px; }
.page-header { margin-bottom: 24px; }
.glass-card { background: rgba(255,255,255,0.8); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.3); border-radius: 12px; padding: 20px; }
</style>
