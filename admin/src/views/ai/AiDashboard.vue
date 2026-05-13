<template>
  <div class="page-container">
    <div class="page-header">
      <h2>AI运营中心</h2>
    </div>

    <div class="dashboard-grid">
      <div class="stat-card glass-card">
        <el-icon :size="32" style="color: #409eff"><User /></el-icon>
        <div class="stat-info">
          <div class="stat-value">{{ stats.totalBots }}</div>
          <div class="stat-label">机器人总数</div>
        </div>
      </div>
      <div class="stat-card glass-card">
        <el-icon :size="32" style="color: #67c23a"><List /></el-icon>
        <div class="stat-info">
          <div class="stat-value">{{ stats.totalTasks }}</div>
          <div class="stat-label">AI任务</div>
        </div>
      </div>
      <div class="stat-card glass-card">
        <el-icon :size="32" style="color: #e6a23c"><Document /></el-icon>
        <div class="stat-info">
          <div class="stat-value">{{ stats.todayLogs }}</div>
          <div class="stat-label">今日日志</div>
        </div>
      </div>
      <div class="stat-card glass-card">
        <el-icon :size="32" style="color: #f56c6c"><Warning /></el-icon>
        <div class="stat-info">
          <div class="stat-value">{{ stats.failedLogs }}</div>
          <div class="stat-label">失败记录</div>
        </div>
      </div>
    </div>

    <div class="quick-links">
      <el-button @click="$router.push('/ai/bots')">机器人管理</el-button>
      <el-button @click="$router.push('/ai/personas')">人设管理</el-button>
      <el-button @click="$router.push('/ai/tasks')">AI任务</el-button>
      <el-button @click="$router.push('/ai/logs')">AI日志</el-button>
      <el-button @click="$router.push('/ai/config')">AI配置</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { User, List, Document, Warning } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { request } from '@/api/request'

const loading = ref(false)
const stats = ref({
  totalBots: 0,
  totalTasks: 0,
  todayLogs: 0,
  failedLogs: 0,
})

const loadStats = async () => {
  loading.value = true
  try {
    const [bots, tasks, logs] = await Promise.all([
      request.get('/admin/ai/bots', { params: { pageSize: 1 } }),
      request.get('/admin/ai/tasks', { params: { pageSize: 1 } }),
      request.get('/admin/ai/logs', { params: { pageSize: 1 } }),
    ])
    stats.value = {
      totalBots: bots.data?.total || bots.data?.data?.total || 0,
      totalTasks: tasks.data?.total || tasks.data?.data?.total || 0,
      todayLogs: logs.data?.total || logs.data?.data?.total || 0,
      failedLogs: 0,
    }
  } catch (error: any) {
    ElMessage.error(error?.message || '加载AI统计失败')
    stats.value = { totalBots: 0, totalTasks: 0, todayLogs: 0, failedLogs: 0 }
  } finally {
    loading.value = false
  }
}

onMounted(() => { loadStats() })
</script>

<style scoped>
.page-container { padding: 20px; }
.page-header { margin-bottom: 24px; }
.dashboard-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin-bottom: 24px; }
.stat-card { display: flex; align-items: center; gap: 16px; padding: 24px; }
.stat-value { font-size: 28px; font-weight: 600; }
.stat-label { font-size: 14px; color: #909399; margin-top: 4px; }
.quick-links { display: flex; gap: 12px; }
.glass-card { background: rgba(255,255,255,0.8); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.3); border-radius: 12px; }
</style>
