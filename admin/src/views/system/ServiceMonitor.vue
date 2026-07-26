<template>
  <div class="page-shell">
    <PageHeader title="服务监控" subtitle="实时监控服务器健康状态和日志" icon="Monitor">
      <template #actions>
        <el-button @click="loadAll" :loading="loading">刷新</el-button>
        <el-button v-if="isSuperAdmin" type="danger" plain @click="confirmRestart">重启服务</el-button>
      </template>
    </PageHeader>

    <div class="status-cards">
      <el-card v-for="s in statusItems" :key="s.key" shadow="hover" class="status-card">
        <div class="status-icon" :style="{ background: s.bgColor }">
          <el-icon :size="20"><component :is="s.icon" /></el-icon>
        </div>
        <div class="status-info">
          <div class="status-label">{{ s.label }}</div>
          <div class="status-value" :style="{ color: s.color }">{{ s.value }}</div>
        </div>
      </el-card>
    </div>

    <el-row :gutter="16">
      <el-col :span="12">
        <el-card shadow="never">
          <template #header><span>第三方配置状态</span></template>
          <div class="config-list">
            <div v-for="c in configStatus" :key="c.key" class="config-item">
              <div>
                <div class="config-name">{{ c.name }}</div>
                <div class="config-message">{{ c.message }}</div>
              </div>
              <el-tag :type="configTagType(c.status)" size="small">{{ c.label }}</el-tag>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="never">
          <template #header><span>服务器信息</span></template>
          <el-descriptions :column="1" size="small" border>
            <el-descriptions-item label="运行环境">{{ health.environment }}</el-descriptions-item>
            <el-descriptions-item label="Node 版本">{{ health.nodeVersion }}</el-descriptions-item>
            <el-descriptions-item label="平台">{{ health.platform }}</el-descriptions-item>
            <el-descriptions-item label="进程 PID">{{ health.processPid }}</el-descriptions-item>
            <el-descriptions-item label="运行时间">{{ formatUptime(health.uptimeSeconds) }}</el-descriptions-item>
            <el-descriptions-item label="最近重启">{{ overview.lastRestartAt ? new Date(overview.lastRestartAt).toLocaleString('zh-CN') : '无' }}</el-descriptions-item>
          </el-descriptions>
        </el-card>
      </el-col>
    </el-row>

    <el-card shadow="never">
      <template #header>
        <div class="log-header">
          <span>服务器日志</span>
          <div class="log-filters">
            <el-select v-model="logFilters.level" clearable placeholder="级别" style="width: 100px" @change="loadLogs">
              <el-option label="error" value="error" />
              <el-option label="warn" value="warn" />
              <el-option label="info" value="info" />
            </el-select>
            <el-input v-model="logFilters.keyword" placeholder="关键词" clearable style="width: 160px" @keyup.enter="loadLogs" />
            <el-button @click="loadLogs" size="small">搜索</el-button>
            <el-button v-if="isSuperAdmin" type="warning" plain size="small" @click="confirmCleanup">清理日志</el-button>
          </div>
        </div>
      </template>
      <el-table :data="logs" v-loading="logLoading" stripe size="small" max-height="400">
        <el-table-column prop="level" label="级别" width="80">
          <template #default="{ row }">
            <el-tag :type="row.level === 'error' ? 'danger' : row.level === 'warn' ? 'warning' : 'info'" size="small">{{ row.level }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="module" label="模块" width="120" />
        <el-table-column prop="message" label="消息" min-width="300" show-overflow-tooltip />
        <el-table-column prop="path" label="路径" width="200" show-overflow-tooltip />
        <el-table-column prop="createdAt" label="时间" width="180">
          <template #default="{ row }">{{ new Date(row.createdAt).toLocaleString('zh-CN') }}</template>
        </el-table-column>
      </el-table>
      <div class="pagination-wrap">
        <el-pagination
          v-model:current-page="logPagination.page"
          v-model:page-size="logPagination.pageSize"
          :total="logPagination.total"
          :page-sizes="[20, 50]"
          layout="total, sizes, prev, pager, next"
          @change="loadLogs"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Monitor, CircleCheckFilled, WarningFilled } from '@element-plus/icons-vue'
import PageHeader from '@/components/common/PageHeader.vue'
import { request } from '@/api/request'

const loading = ref(false)
const logLoading = ref(false)
const overview = ref<any>({})
const health = ref<any>({})
const logs = ref<any[]>([])
const logPagination = reactive({ page: 1, pageSize: 20, total: 0 })
const logFilters = reactive({ level: '', keyword: '' })

const isSuperAdmin = computed(() => {
  try {
    const user = JSON.parse(localStorage.getItem('LM_ADMIN_USER') || '{}')
    return user?.role === 'super_admin'
  } catch (e: any) { ElMessage.error(e?.message || '加载失败'); return false }
})

const statusItems = computed(() => [
  { key: 'backend', label: '后端服务', value: overview.value.backendStatus === 'running' ? '运行中' : '异常', color: '#67c23a', bgColor: '#f0f9eb', icon: CircleCheckFilled },
  { key: 'db', label: '数据库', value: health.value.dbStatus === 'healthy' ? '正常' : '异常', color: health.value.dbStatus === 'healthy' ? '#67c23a' : '#f56c6c', bgColor: health.value.dbStatus === 'healthy' ? '#f0f9eb' : '#fef0f0', icon: CircleCheckFilled },
  { key: 'redis', label: 'Redis', value: health.value.redisStatus === 'healthy' ? '正常' : '异常', color: health.value.redisStatus === 'healthy' ? '#67c23a' : '#f56c6c', bgColor: health.value.redisStatus === 'healthy' ? '#f0f9eb' : '#fef0f0', icon: CircleCheckFilled },
  { key: 'cpu', label: 'CPU', value: `${overview.value.cpuUsage ?? 0}%`, color: (overview.value.cpuUsage ?? 0) > 80 ? '#f56c6c' : '#67c23a', bgColor: '#ecf5ff', icon: Monitor },
  { key: 'memory', label: '内存', value: `${overview.value.memoryUsage ?? 0}%`, color: (overview.value.memoryUsage ?? 0) > 80 ? '#f56c6c' : '#67c23a', bgColor: '#ecf5ff', icon: Monitor },
  { key: 'disk', label: '磁盘', value: `${overview.value.diskUsage ?? 0}%`, color: (overview.value.diskUsage ?? 0) > 90 ? '#f56c6c' : '#67c23a', bgColor: '#ecf5ff', icon: Monitor },
  { key: 'errors', label: '今日错误', value: overview.value.todayErrorCount ?? 0, color: (overview.value.todayErrorCount ?? 0) > 0 ? '#f56c6c' : '#67c23a', bgColor: '#ecf5ff', icon: WarningFilled },
])

const configStatus = computed(() => {
  const remote = overview.value.configStatus || health.value.configStatus
  if (Array.isArray(remote) && remote.length) return remote
  const env = health.value.envSecurity || {}
  return [
    { key: 'miniapp', name: '微信小程序', status: env.wxMiniConfigured ? 'ok' : 'missing', label: env.wxMiniConfigured ? '已配置' : '未配置', message: '后端未返回详细配置状态' },
    { key: 'amap', name: '高德地图', status: env.amapConfigured ? 'ok' : 'missing', label: env.amapConfigured ? '已配置' : '未配置', message: '后端未返回详细配置状态' },
    { key: 'storage', name: '存储上传', status: env.storageConfigured ? 'ok' : 'warning', label: env.storageConfigured ? '已配置' : '待确认', message: '后端未返回详细配置状态' },
    { key: 'ai', name: 'AI 配置', status: env.aiConfigured ? 'ok' : 'disabled', label: env.aiConfigured ? '已配置' : '未启用', message: '后端未返回详细配置状态' },
    { key: 'payment', name: '支付配置', status: env.wxPayConfigured ? 'ok' : 'missing', label: env.wxPayConfigured ? '已配置' : '未配置', message: '后端未返回详细配置状态' },
  ]
})

function configTagType(status: string) {
  if (status === 'ok') return 'success'
  if (status === 'disabled') return 'info'
  if (status === 'missing') return 'danger'
  return 'warning'
}

function formatUptime(seconds: number) {
  if (!seconds) return '-'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}小时${m}分钟` : `${m}分钟`
}

async function loadOverview() {
  try {
    const res: any = await request.get('/admin/ops/overview')
    overview.value = res
  } catch (e: any) { ElMessage.error(e?.message || '加载失败') }
}

async function loadHealth() {
  try {
    const res: any = await request.get('/admin/ops/health')
    health.value = res
  } catch (e: any) { ElMessage.error(e?.message || '加载失败') }
}

async function loadLogs() {
  logLoading.value = true
  try {
    const params = { ...logFilters, page: logPagination.page, pageSize: logPagination.pageSize }
    const res: any = await request.get('/admin/ops/logs', { params })
    logs.value = res.list || []
    logPagination.total = res.total || 0
  } catch (e: any) {
    ElMessage.error(e?.message || '加载失败')
    logs.value = []
  } finally {
    logLoading.value = false
  }
}

function loadAll() {
  loading.value = true
  Promise.all([loadOverview(), loadHealth(), loadLogs()]).finally(() => { loading.value = false })
}

async function confirmRestart() {
  try {
    const { value: reason } = await ElMessageBox.prompt('请输入重启原因', '重启服务', {
      inputPlaceholder: '重启原因',
      confirmButtonText: '下一步',
      cancelButtonText: '取消',
      inputValidator: (v) => !!v?.trim() || '请输入原因',
    })
    await ElMessageBox.confirm('确认重启后端服务？此操作将中断所有连接。', '确认重启', {
      confirmButtonText: '确认重启',
      cancelButtonText: '取消',
      type: 'warning',
    })
    await request.post('/admin/ops/restart', { reason, confirmText: '确认重启' })
    ElMessage.success('重启命令已发出')
  } catch (e: any) { if (e !== 'cancel') ElMessage.error(e?.message || '操作失败') }
}

async function confirmCleanup() {
  try {
    const { value: days } = await ElMessageBox.prompt('请输入保留天数', '清理日志', {
      inputPlaceholder: '保留最近多少天的日志',
      confirmButtonText: '清理',
      cancelButtonText: '取消',
      inputValidator: (v) => {
        const n = Number(v)
        return (n >= 7) || '最少保留 7 天'
      },
    })
    const res: any = await request.post('/admin/ops/logs/cleanup', { beforeDays: Number(days) })
    ElMessage.success(`已清理 ${res.deletedCount} 条日志`)
    loadLogs()
  } catch (e: any) { if (e !== 'cancel') ElMessage.error(e?.message || '操作失败') }
}

onMounted(loadAll)
</script>

<style scoped>
.page-shell { padding: 24px; display: flex; flex-direction: column; gap: 16px; }
.status-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; }
.status-card :deep(.el-card__body) { display: flex; align-items: center; gap: 12px; padding: 16px; }
.status-icon { width: 40px; height: 40px; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #fff; }
.status-label { font-size: 12px; color: #666; }
.status-value { font-size: 18px; font-weight: 700; }
.config-list { display: flex; flex-direction: column; gap: 12px; }
.config-item { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.config-name { font-size: 14px; font-weight: 800; color: #1f2937; }
.config-message { margin-top: 4px; color: #64748b; font-size: 12px; line-height: 1.5; }
.log-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; }
.log-filters { display: flex; gap: 8px; align-items: center; }
.pagination-wrap { display: flex; justify-content: flex-end; margin-top: 12px; }
</style>
