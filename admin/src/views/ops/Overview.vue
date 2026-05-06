<template>
  <div class="ops-page" style="padding:24px">
    <a-page-header title="服务器概览" sub-title="仅超级管理员可见" />

    <a-row :gutter="[16, 16]">
      <a-col :span="6">
        <a-statistic title="后端状态" :value="overview.backendStatus">
          <template #prefix>
            <a-tag :color="overview.backendStatus === 'running' ? 'success' : 'error'">
              {{ overview.backendStatus === 'running' ? '运行中' : overview.backendStatus }}
            </a-tag>
          </template>
        </a-statistic>
      </a-col>
      <a-col :span="6">
        <a-statistic title="已运行时间" :value="formatUptime(overview.uptimeSeconds)" />
      </a-col>
      <a-col :span="6">
        <a-statistic title="今日错误数" :value="overview.todayErrorCount">
          <template #prefix>
            <span v-if="overview.todayErrorCount > 0" style="color:#ef4444">⚠️</span>
          </template>
        </a-statistic>
      </a-col>
      <a-col :span="6">
        <a-statistic title="今日请求数" :value="overview.todayRequestCount" />
      </a-col>
    </a-row>

    <a-divider />

    <a-row :gutter="[16, 16]">
      <a-col :span="8">
        <a-card title="CPU 使用率" size="small">
          <a-progress :percent="overview.cpuUsage" :status="overview.cpuUsage > 80 ? 'exception' : 'normal'" />
        </a-card>
      </a-col>
      <a-col :span="8">
        <a-card title="内存使用率" size="small">
          <a-progress :percent="overview.memoryUsage" :status="overview.memoryUsage > 80 ? 'exception' : 'normal'" />
        </a-card>
      </a-col>
      <a-col :span="8">
        <a-card title="磁盘使用率" size="small">
          <a-progress :percent="overview.diskUsage" :status="overview.diskUsage > 80 ? 'exception' : 'normal'" />
        </a-card>
      </a-col>
    </a-row>

    <a-divider />

    <a-row :gutter="[16, 16]">
      <a-col :span="12">
        <a-descriptions title="基础设施" bordered size="small" :column="2">
          <a-descriptions-item label="数据库">{{ overview.dbStatus }}</a-descriptions-item>
          <a-descriptions-item label="Redis">{{ overview.redisStatus }}</a-descriptions-item>
          <a-descriptions-item label="Node 版本">{{ overview.nodeVersion }}</a-descriptions-item>
          <a-descriptions-item label="环境">{{ overview.environment }}</a-descriptions-item>
          <a-descriptions-item label="版本">{{ overview.version }}</a-descriptions-item>
          <a-descriptions-item label="启动时间">{{ overview.startedAt ? dayjs(overview.startedAt).format('YYYY-MM-DD HH:mm:ss') : '-' }}</a-descriptions-item>
          <a-descriptions-item label="最近重启">{{ overview.lastRestartAt ? dayjs(overview.lastRestartAt).format('YYYY-MM-DD HH:mm:ss') : '-' }}</a-descriptions-item>
        </a-descriptions>
      </a-col>
      <a-col :span="12">
        <a-card title="最近错误" size="small">
          <a-empty v-if="!overview.recentErrors?.length" description="暂无错误" />
          <a-list v-else size="small" :data-source="overview.recentErrors">
            <template #renderItem="{ item }">
              <a-list-item>
                <a-space direction="vertical" :size="0">
                  <span style="color:#ef4444">{{ item.message }}</span>
                  <span style="font-size:12px;color:#9ca3af">{{ item.path }} | {{ dayjs(item.createdAt).format('MM-DD HH:mm') }}</span>
                </a-space>
              </a-list-item>
            </template>
          </a-list>
        </a-card>
      </a-col>
    </a-row>

    <a-divider />

    <a-space>
      <a-button type="primary" @click="fetchOverview">刷新状态</a-button>
      <a-button danger @click="showRestartModal = true">重启后端服务</a-button>
    </a-space>

    <!-- 重启确认 Modal -->
    <a-modal
      v-model:open="showRestartModal"
      title="重启后端服务"
      :confirm-loading="restarting"
      @ok="handleRestart"
      @cancel="showRestartModal = false"
      okText="确认重启"
      :ok-button-props="{ danger: true }"
    >
      <a-alert type="warning" message="重启期间用户可能短暂无法访问，请谨慎操作" show-icon style="margin-bottom:16px" />
      <a-form layout="vertical">
        <a-form-item label="重启原因" required>
          <a-input v-model:value="restartForm.reason" placeholder="请输入重启原因" />
        </a-form-item>
        <a-form-item label="确认文字" required>
          <a-input v-model:value="restartForm.confirmText" placeholder="请输入：确认重启" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import dayjs from 'dayjs'
import { opsApi } from '@/api/ops'

const overview = reactive<any>({
  backendStatus: '-',
  uptimeSeconds: 0,
  startedAt: null,
  cpuUsage: 0,
  memoryUsage: 0,
  diskUsage: 0,
  dbStatus: '-',
  redisStatus: '-',
  todayErrorCount: 0,
  todayRequestCount: 0,
  recentErrors: [],
  lastRestartAt: null,
  version: '-',
  nodeVersion: '-',
  environment: '-',
})

const showRestartModal = ref(false)
const restarting = ref(false)
const restartForm = reactive({ reason: '', confirmText: '' })

function formatUptime(seconds: number) {
  if (!seconds) return '-'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 24) {
    const d = Math.floor(h / 24)
    return `${d}天 ${h % 24}小时`
  }
  return `${h}小时 ${m}分 ${s}秒`
}

async function fetchOverview() {
  try {
    const res = await opsApi.getOverview()
    if (res.data?.code === 0) {
      Object.assign(overview, res.data.data)
    }
  } catch (err: any) {
    message.error(err.response?.data?.message || '获取概览失败')
  }
}

async function handleRestart() {
  if (!restartForm.reason.trim()) {
    message.error('重启原因必填')
    return
  }
  if (restartForm.confirmText !== '确认重启') {
    message.error('确认文字不正确，请输入：确认重启')
    return
  }
  restarting.value = true
  try {
    const res = await opsApi.restartBackend({
      reason: restartForm.reason,
      confirmText: restartForm.confirmText,
    })
    if (res.data?.code === 0) {
      message.success(res.data.data?.message || '重启命令已发出')
      showRestartModal.value = false
      restartForm.reason = ''
      restartForm.confirmText = ''
    } else {
      message.error(res.data?.message || '重启失败')
    }
  } catch (err: any) {
    message.error(err.response?.data?.message || '重启请求失败')
  } finally {
    restarting.value = false
  }
}

onMounted(fetchOverview)
</script>

<style lang="less" scoped>
.ops-page {
  .ant-statistic { margin-bottom: 8px; }
}
</style>
