<template>
  <div class="marketing-page">
    <div class="marketing-header">
      <div>
        <p class="eyebrow">运营与系统 / 通知投递</p>
        <h2>通知投递</h2>
        <p>面向用户投递业务与系统通知；写入 notifications，不创建客服私聊或工单回复。</p>
      </div>
      <el-button v-if="hasSendPermission" type="primary" @click="showSendDialog = true">新建通知</el-button>
    </div>

    <StatGrid :items="statItems" />

    <div class="data-card">
      <div class="filters">
        <el-input v-model="filters.userId" clearable placeholder="用户 ID" @keyup.enter="applyFilters" />
        <el-input v-model="filters.regionId" clearable placeholder="区域 ID" @keyup.enter="applyFilters" />
        <el-select v-model="filters.type" clearable placeholder="通知类型">
          <el-option v-for="type in notificationTypes" :key="type" :label="type" :value="type" />
        </el-select>
        <el-select v-model="filters.readStatus" clearable placeholder="阅读状态">
          <el-option label="已读" value="read" />
          <el-option label="未读" value="unread" />
        </el-select>
        <el-select v-model="filters.hiddenStatus" clearable placeholder="用户侧状态">
          <el-option label="正常显示" value="visible" />
          <el-option label="用户已隐藏" value="hidden" />
        </el-select>
        <el-select v-model="filters.deliveryStatus" clearable placeholder="投递状态">
          <el-option label="已送达" value="delivered" />
          <el-option label="部分失败" value="partial" />
          <el-option label="等待处理" value="pending" />
        </el-select>
        <el-button type="primary" @click="applyFilters">查询</el-button>
        <el-button @click="resetFilters">重置</el-button>
      </div>
      <el-table :data="notifications" v-loading="loading" empty-text="暂无真实通知数据">
        <el-table-column label="用户" min-width="160">
          <template #default="{ row }">{{ row.user?.nickname || '未命名用户' }}<div class="cell-sub">{{ row.userId }}</div></template>
        </el-table-column>
        <el-table-column prop="regionId" label="区域" min-width="150" show-overflow-tooltip />
        <el-table-column prop="title" label="标题" min-width="180" />
        <el-table-column prop="content" label="内容" min-width="260" show-overflow-tooltip />
        <el-table-column prop="type" label="类型" width="140">
          <template #default="{ row }"><el-tag size="small">{{ row.type }}</el-tag></template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="row.isRead ? 'success' : 'warning'" size="small">{{ row.isRead ? '已读' : '未读' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="用户侧" width="110">
          <template #default="{ row }">
            <el-tag :type="row.hiddenAt ? 'info' : 'success'" size="small">{{ row.hiddenAt ? '已隐藏' : '显示中' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="投递状态" width="120">
          <template #default="{ row }">
            <el-tag :type="deliveryTagType(row.deliveryStatus)" size="small">{{ deliveryLabel(row.deliveryStatus) }}</el-tag>
            <div class="cell-sub">尝试 {{ row.deliveryAttempts || 0 }} 次</div>
          </template>
        </el-table-column>
        <el-table-column label="渠道结果" min-width="190">
          <template #default="{ row }">
            <div v-for="channel in channelRows(row)" :key="channel.name" class="channel-row">
              <span>{{ channel.name }}</span>
              <el-tooltip v-if="channel.error" :content="channel.error" placement="top">
                <el-tag :type="channel.type" size="small">{{ channel.label }}</el-tag>
              </el-tooltip>
              <el-tag v-else :type="channel.type" size="small">{{ channel.label }}</el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="时间" width="190">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="90" fixed="right">
          <template #default="{ row }">
            <el-button v-if="['partial', 'failed', 'pending'].includes(row.deliveryStatus)" link type="primary" @click="retryDelivery(row)">重试</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="pager">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :total="pagination.total"
          layout="total, sizes, prev, pager, next"
          @current-change="loadNotifications"
          @size-change="loadNotifications"
        />
      </div>
    </div>

    <el-dialog v-model="showSendDialog" title="投递通知" width="660px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="发送目标">
          <el-select v-model="form.targetType" style="width: 100%">
            <el-option label="全部用户" value="all" />
            <el-option label="指定区域" value="region" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="form.targetType === 'region'" label="选择区域" required>
          <el-select v-model="form.regionId" filterable clearable style="width: 100%">
            <el-option v-for="region in regions" :key="region.id" :label="region.name" :value="region.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="标题" required>
          <el-input v-model="form.title" placeholder="通知标题" />
        </el-form-item>
        <el-form-item label="内容" required>
          <el-input v-model="form.content" type="textarea" :rows="4" placeholder="通知内容" />
        </el-form-item>
        <el-form-item label="通知渠道">
          <el-checkbox v-model="form.channelInApp" disabled>站内通知</el-checkbox>
          <el-checkbox v-model="form.channelWebSocket">实时推送</el-checkbox>
          <el-checkbox v-model="form.channelWechat">微信订阅消息</el-checkbox>
        </el-form-item>
        <div class="dialog-grid">
          <el-form-item label="跳转类型">
            <el-select v-model="form.linkType" clearable style="width: 100%">
              <el-option label="无跳转" value="" />
              <el-option label="帖子" value="post" />
              <el-option label="用户" value="user" />
              <el-option label="订单" value="order" />
              <el-option label="自定义页面" value="page" />
            </el-select>
          </el-form-item>
          <el-form-item label="跳转值">
            <el-input v-model="form.linkValue" placeholder="ID 或小程序路径" />
          </el-form-item>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="showSendDialog = false">取消</el-button>
        <el-button type="primary" @click="sendNotification" :loading="sending">确认投递</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { sendNotification as apiSendNotification } from '@/api/admin'
import { request } from '@/api/request'
import { errorMessage, formatTime, unwrapPage } from './utils'
import { useAuthStore } from '@/stores/auth'
import StatGrid from '@/components/glass/StatGrid.vue'
import type { StatItem } from '@/types/admin'
import { buildNotificationDeliveryPayload } from '@/views/system/notificationDelivery.mjs'

const auth = useAuthStore()
const route = useRoute()
const hasSendPermission = ref(auth.permissions.includes('notification:send') || auth.permissions.includes('marketing:view'))
const loading = ref(false)
const sending = ref(false)
const showSendDialog = ref(false)
const notifications = ref<any[]>([])
const regions = ref<any[]>([])
const stats = ref({ total: 0, today: 0, unread: 0, hidden: 0, partial: 0, pending: 0, exhausted: 0 })
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })
const notificationTypes = ['SYSTEM', 'COMMENT', 'REPLY', 'MENTION', 'LIKE', 'FOLLOW', 'SQUAT', 'MESSAGE', 'ORDER', 'REFUND']
const filters = reactive({ userId: '', regionId: '', type: '', readStatus: String(route.query.readStatus || ''), hiddenStatus: '', deliveryStatus: '' })
const statItems = computed<StatItem[]>(() => [
  { label: '通知总量', value: stats.value.total, sub: `今日新增 ${stats.value.today}`, icon: 'Bell', tone: 'blue' },
  { label: '用户未读', value: stats.value.unread, sub: '当前仍在用户列表', icon: 'Message', tone: 'orange' },
  { label: '用户已隐藏', value: stats.value.hidden, sub: '后台历史仍保留', icon: 'Hide', tone: 'blue' },
  { label: '部分失败', value: stats.value.partial, sub: '系统会自动重试', icon: 'Warning', tone: 'red' },
  { label: '待处理', value: stats.value.pending, sub: '等待首次投递', icon: 'Clock', tone: 'orange' },
  { label: '需人工处理', value: stats.value.exhausted, sub: '已达到 3 次上限', icon: 'WarningFilled', tone: 'red' },
])

const form = reactive({
  targetType: 'all',
  regionId: '',
  title: '',
  content: '',
  channelInApp: true,
  channelWebSocket: true,
  channelWechat: false,
  linkType: '',
  linkValue: '',
})

async function loadNotifications() {
  loading.value = true
  try {
    const res = await request.get('/admin/notifications', {
      params: { page: pagination.page, pageSize: pagination.pageSize, ...filters },
    })
    const page = unwrapPage(res)
    notifications.value = page.list
    pagination.total = page.total
  } catch (error: any) {
    ElMessage.error(errorMessage(error, '加载通知失败'))
  } finally {
    loading.value = false
  }
}

async function loadStats() {
  try {
    stats.value = { ...stats.value, ...await request.get('/admin/notifications/stats') }
  } catch (error: any) {
    ElMessage.warning(errorMessage(error, '加载通知统计失败'))
  }
}

function applyFilters() {
  pagination.page = 1
  loadNotifications()
}

function resetFilters() {
  Object.assign(filters, { userId: '', regionId: '', type: '', readStatus: '', hiddenStatus: '', deliveryStatus: '' })
  applyFilters()
}

watch(() => route.query.readStatus, (value) => {
  filters.readStatus = String(value || '')
  pagination.page = 1
  loadNotifications()
})

const deliveryLabel = (status: string) => ({ delivered: '已送达', partial: '部分失败', failed: '失败', pending: '等待处理' }[status] || '未记录')
const deliveryTagType = (status: string) => status === 'delivered' ? 'success' : status === 'partial' ? 'warning' : status === 'failed' ? 'danger' : 'info'
const channelLabel: Record<string, string> = { inApp: '站内', websocket: '实时', email: '邮件', sms: '短信', wechat: '微信' }
const channelRows = (row: any) => Object.entries(row.deliveryReport || {}).map(([name, value]: [string, any]) => ({
  name: channelLabel[name] || name,
  label: value?.status === 'success' ? '成功' : value?.status === 'failed' ? '失败' : value?.status === 'queued' ? '排队中' : value?.status === 'attempted' ? '已尝试' : '跳过',
  type: value?.status === 'success' ? 'success' : value?.status === 'failed' ? 'danger' : value?.status === 'queued' ? 'warning' : 'info',
  error: value?.error || value?.warning || value?.reason || '',
}))

async function retryDelivery(row: any) {
  try {
    await request.post(`/admin/notifications/${row.id}/retry-delivery`)
    ElMessage.success('已重新投递')
    await Promise.all([loadNotifications(), loadStats()])
  } catch (error: any) {
    ElMessage.error(errorMessage(error, '重试失败'))
  }
}

async function loadRegions() {
  try {
    regions.value = unwrapPage(await request.get('/admin/regions')).list
  } catch (error: any) {
    ElMessage.warning(errorMessage(error, '加载区域列表失败'))
  }
}

async function sendNotification() {
  if (!form.title.trim() || !form.content.trim()) {
    ElMessage.warning('请填写标题和内容')
    return
  }
  if (form.targetType === 'region' && !form.regionId) {
    ElMessage.warning('请选择区域')
    return
  }
  sending.value = true
  try {
    const result: any = await apiSendNotification(buildNotificationDeliveryPayload({
      target: form.targetType,
      title: form.title,
      content: form.content,
      regionId: form.regionId,
      linkType: form.linkType || undefined,
      linkValue: form.linkValue || undefined,
      websocket: form.channelWebSocket,
      wechatSubscribe: form.channelWechat,
    }))
    const createdCount = result?.createdCount ?? result?.count ?? result?.data?.createdCount ?? 0
    ElMessage.success(`通知已投递${createdCount ? `，写入 ${createdCount} 条记录` : ''}`)
    showSendDialog.value = false
    form.title = ''
    form.content = ''
    form.linkType = ''
    form.linkValue = ''
    await Promise.all([loadNotifications(), loadStats()])
  } catch (error: any) {
    ElMessage.error(errorMessage(error, '发送失败'))
  } finally {
    sending.value = false
  }
}

onMounted(() => {
  loadNotifications()
  loadStats()
  loadRegions()
})
</script>

<style scoped>
.marketing-page { padding: 24px; }
.marketing-header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 20px; }
.marketing-header h2 { margin: 4px 0; font-size: 28px; color: #0f172a; }
.marketing-header p { margin: 0; color: #64748b; font-weight: 700; }
.eyebrow { color: #2563eb !important; font-size: 13px; }
.data-card { background: rgba(255,255,255,0.86); border: 1px solid #dbe7f5; border-radius: 14px; box-shadow: 0 14px 36px rgba(37,99,235,.08); padding: 18px; }
.filters { display: grid; grid-template-columns: repeat(6, minmax(130px, 1fr)) auto auto; gap: 10px; margin-bottom: 16px; }
.cell-sub { margin-top: 2px; color: #94a3b8; font-size: 11px; }
.channel-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 3px 0; }
.pager { display: flex; justify-content: flex-end; margin-top: 16px; }
.dialog-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 12px; }
@media (max-width: 900px) {
  .dialog-grid { grid-template-columns: 1fr; }
  .filters { grid-template-columns: 1fr 1fr; }
}
</style>
