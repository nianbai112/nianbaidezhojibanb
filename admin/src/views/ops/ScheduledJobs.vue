<template>
  <div class="page-container">
    <div class="page-header">
      <h2>任务调度</h2>
      <el-button type="primary" @click="showCreateDialog = true">创建任务</el-button>
    </div>

    <div class="glass-card" style="padding: 20px;">
      <el-table :data="jobs" v-loading="loading">
        <el-table-column prop="name" label="任务名称" min-width="150" />
        <el-table-column prop="type" label="类型" width="100" />
        <el-table-column prop="cron" label="Cron" width="120" />
        <el-table-column prop="isEnabled" label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="row.isEnabled ? 'success' : 'info'" size="small">{{ row.isEnabled ? '启用' : '禁用' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="lastStatus" label="上次状态" width="100">
          <template #default="{ row }">
            <el-tag v-if="row.lastStatus" :type="row.lastStatus === 'success' ? 'success' : 'danger'" size="small">{{ row.lastStatus }}</el-tag>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column label="执行器" width="130">
          <template #default="{ row }">
            <el-tag :type="row.executorBound ? 'success' : 'warning'" size="small">
              {{ row.executorBound ? '真实接入' : '未接入' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="runCount" label="执行次数" width="90" />
        <el-table-column label="操作" width="200">
          <template #default="{ row }">
            <el-button size="small" @click="viewLogs(row)">日志</el-button>
            <el-button size="small" type="success" @click="runJob(row)">执行</el-button>
            <el-button v-if="row.isEnabled" size="small" type="warning" @click="stopJob(row)">停止</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="showCreateDialog" title="创建任务" width="500px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="任务名称">
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item label="任务类型">
          <el-select v-model="form.type" style="width: 100%">
            <el-option label="日报生成" value="daily_report" />
            <el-option label="结算任务" value="settlement" />
            <el-option label="榜单刷新" value="ranking" />
            <el-option label="推荐刷新" value="recommend" />
            <el-option label="清理任务" value="cleanup" />
            <el-option label="AI任务" value="ai_task" />
            <el-option label="通知发送" value="notification" />
            <el-option label="监控检测" value="monitor" />
          </el-select>
        </el-form-item>
        <el-form-item label="Cron 表达式">
          <el-input v-model="form.cron" placeholder="如: 0 0 * * * (每天0点)" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" @click="createJob">创建</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showLogsDialog" title="任务日志" width="700px">
      <el-table :data="logs" v-loading="loadingLogs">
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'success' ? 'success' : row.status === 'failed' ? 'danger' : 'warning'" size="small">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="startedAt" label="开始时间" width="180">
          <template #default="{ row }">{{ new Date(row.startedAt).toLocaleString('zh-CN') }}</template>
        </el-table-column>
        <el-table-column prop="finishedAt" label="结束时间" width="180">
          <template #default="{ row }">{{ row.finishedAt ? new Date(row.finishedAt).toLocaleString('zh-CN') : '-' }}</template>
        </el-table-column>
        <el-table-column prop="error" label="错误" min-width="200" show-overflow-tooltip />
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { request } from '@/api/request'

const loading = ref(false)
const loadingLogs = ref(false)
const jobs = ref([])
const logs = ref([])
const showCreateDialog = ref(false)
const showLogsDialog = ref(false)
const currentJobId = ref('')

const form = reactive({ name: '', type: 'daily_report', cron: '' })

const loadJobs = async () => {
  loading.value = true
  try {
    const res: any = await request.get('/admin/jobs')
    jobs.value = res?.list || res?.data?.list || []
  } catch (e: any) {
    jobs.value = []
    ElMessage.error(e?.message || '加载任务失败')
  } finally { loading.value = false }
}

const createJob = async () => {
  try {
    await request.post('/admin/jobs', form)
    ElMessage.success('任务已创建')
    showCreateDialog.value = false
    loadJobs()
  } catch { ElMessage.error('创建失败') }
}

const runJob = async (row: any) => {
  try {
    await request.put(`/admin/jobs/${row.id}/run`)
    ElMessage.success('任务已触发')
    loadJobs()
  } catch { ElMessage.error('执行失败') }
}

const stopJob = async (row: any) => {
  try {
    await request.put(`/admin/jobs/${row.id}/stop`)
    ElMessage.success('任务已停止')
    loadJobs()
  } catch { ElMessage.error('停止失败') }
}

const viewLogs = async (row: any) => {
  currentJobId.value = row.id
  loadingLogs.value = true
  try {
    const res: any = await request.get(`/admin/jobs/${row.id}/logs`)
    logs.value = res?.list || res?.data?.list || []
    showLogsDialog.value = true
  } catch (e: any) {
    logs.value = []
    ElMessage.error(e?.message || '加载任务日志失败')
  } finally { loadingLogs.value = false }
}

onMounted(() => loadJobs())
</script>

<style scoped>
.page-container { padding: 20px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.glass-card { background: rgba(255,255,255,0.8); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.3); border-radius: 12px; }
</style>
