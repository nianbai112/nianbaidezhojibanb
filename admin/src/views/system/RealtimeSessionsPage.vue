<template>
  <div class="page-shell realtime-page">
    <GlassPageHeader title="客服工作台" subtitle="处理用户发起的官方客服会话；在线连接只用于排障，通知投递请走 notifications">
      <template #actions>
        <el-switch v-model="autoRefresh" active-text="自动刷新" />
        <el-button :icon="RefreshRight" :loading="loading" @click="loadSessions(true)">刷新</el-button>
      </template>
    </GlassPageHeader>

    <StatGrid :items="statItems" />

    <div class="glass-card realtime-health-card" v-loading="statusLoading">
      <div class="health-head">
        <div>
          <h3>实时通信状态</h3>
          <p>检测小程序 WebSocket、Redis 在线状态和客户部署入口。</p>
        </div>
        <div class="health-actions">
          <el-button size="small" :icon="RefreshRight" :loading="statusLoading" @click="loadRealtimeStatus(true)">检测</el-button>
          <el-button size="small" type="primary" plain :loading="wsProbeLoading" @click="testApiWebSocketProxy">测试转发</el-button>
        </div>
      </div>
      <div class="health-grid">
        <div class="health-item">
          <span>WebSocket</span>
          <strong>{{ realtimeStatus.websocket?.localConnections ?? 0 }} 连接</strong>
          <em>{{ realtimeStatus.websocket?.localUsers ?? 0 }} 个本机用户 · DB {{ realtimeStatus.websocket?.dbOnlineCount ?? 0 }}</em>
        </div>
        <div class="health-item" :class="{ danger: realtimeStatus.redis && !realtimeStatus.redis.ok }">
          <span>Redis</span>
          <strong>{{ realtimeStatus.redis?.ok ? '正常' : '异常' }}</strong>
          <em>{{ realtimeStatus.redis?.onlineSockets ?? 0 }} socket · {{ realtimeStatus.redis?.onlineUsers ?? 0 }} 用户</em>
        </div>
        <div class="health-item">
          <span>推送通道</span>
          <strong>{{ realtimeStatus.redis?.pushChannel || '-' }}</strong>
          <em>{{ realtimeStatus.websocket?.instanceId || '-' }}</em>
        </div>
        <div class="health-item">
          <span>Nginx 入口</span>
          <strong>{{ realtimeStatus.nginx?.expectedApiWebSocketPath || '/api/ws-native' }}</strong>
          <em>转发到 {{ realtimeStatus.nginx?.backendNativePath || '/ws-native' }}</em>
        </div>
      </div>
      <div class="health-note">
        <el-tag :type="realtimeStatus.redis?.ok ? 'success' : 'danger'" effect="plain">
          {{ realtimeStatus.redis?.message || '等待检测' }}
        </el-tag>
        <el-tag v-if="wsProbe.status" :type="wsProbe.status === 'success' ? 'success' : 'danger'" effect="plain">
          {{ wsProbe.message }}
        </el-tag>
        <span>{{ realtimeStatus.nginx?.note || '客户只需要配置 https://域名/api' }}</span>
      </div>
      <div class="limit-row">
        <span>{{ realtimeStatus.limits?.connect || '连接限流待检测' }}</span>
        <span>{{ realtimeStatus.limits?.send || '发送限流待检测' }}</span>
        <span>{{ realtimeStatus.limits?.operation || '操作限流待检测' }}</span>
      </div>
    </div>

    <el-alert
      type="info"
      :closable="false"
      show-icon
      title="客服回复与通知投递已经分开"
      description="在线连接列表不再提供主动推送。只有下方客服会话队列可以回复用户；业务通知、区域通知和全站通知请前往“通知投递”。"
    />

    <div class="glass-card filter-card">
      <el-select v-model="filters.platform" placeholder="平台" clearable @change="reloadFirstPage">
        <el-option label="全部平台" value="" />
        <el-option label="小程序" value="miniapp" />
        <el-option label="骑手 App" value="rider_app" />
        <el-option label="后台" value="admin" />
      </el-select>
      <el-select v-model="filters.online" placeholder="在线状态" clearable @change="reloadFirstPage">
        <el-option label="全部状态" value="" />
        <el-option label="在线" value="true" />
        <el-option label="离线" value="false" />
      </el-select>
      <el-button type="primary" @click="reloadFirstPage">查询</el-button>
      <el-button @click="resetFilters">重置</el-button>
      <span class="refresh-hint">最后刷新：{{ lastRefreshText }}</span>
    </div>

    <div class="glass-card table-card">
      <el-table :data="sessions" v-loading="loading" stripe>
        <el-table-column label="连接对象" min-width="260">
          <template #default="{ row }">
            <div class="actor-cell">
              <el-avatar :size="38" :src="row.actor?.avatar">
                {{ avatarText(row.actor?.name) }}
              </el-avatar>
              <div class="actor-info">
                <div class="actor-name">{{ row.actor?.name || '-' }}</div>
                <div class="actor-subtitle">{{ row.actor?.type }} · {{ row.actor?.subtitle || row.userId || row.adminId || '-' }}</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="真实连接" width="115">
          <template #default="{ row }">
            <el-tag size="small" :type="row.liveSocketCount > 0 ? 'success' : 'danger'" effect="plain">
              {{ row.liveSocketCount || 0 }} 个
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="socketId" label="Socket ID" min-width="185" show-overflow-tooltip />
        <el-table-column prop="platform" label="平台" width="100">
          <template #default="{ row }">
            <el-tag size="small" :type="row.platform === 'miniapp' ? 'primary' : row.platform === 'rider_app' ? 'success' : 'warning'" effect="plain">
              {{ row.platform === 'miniapp' ? '小程序' : row.platform === 'rider_app' ? '骑手 App' : '后台' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="online" label="状态" width="90">
          <template #default="{ row }">
            <el-tag size="small" :type="row.online && row.socketLive ? 'success' : row.online ? 'warning' : 'info'" effect="plain">
              {{ row.online && row.socketLive ? '在线' : row.online ? '疑似离线' : '离线' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="ip" label="IP" width="145" show-overflow-tooltip />
        <el-table-column prop="lastSeenAt" label="最后活跃" width="175">
          <template #default="{ row }">{{ formatTime(row.lastSeenAt) }}</template>
        </el-table-column>
        <el-table-column prop="createdAt" label="连接时间" width="175">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column prop="userAgent" label="设备/UserAgent" min-width="220" show-overflow-tooltip />
      </el-table>

      <div class="pagination-wrap">
        <el-pagination
          v-model:current-page="filters.page"
          v-model:page-size="filters.pageSize"
          :total="total"
          :page-sizes="[50, 100, 200]"
          layout="total, sizes, prev, pager, next, jumper"
          @current-change="loadSessions()"
          @size-change="loadSessions()"
        />
      </div>
    </div>

    <div ref="officialCardRef" class="glass-card official-card">
      <div class="card-toolbar">
        <div>
          <h3>客服会话队列</h3>
          <p>只处理用户主动发起的客服私聊。工单按 conversationId 明确关联，回复前请核对 ticketId。</p>
        </div>
        <div class="official-actions">
          <el-input
            v-model="officialFilters.keyword"
            placeholder="搜索用户昵称 / 手机 / OpenID"
            clearable
            @keyup.enter="loadOfficialConversations()"
          />
          <el-select v-model="officialFilters.status" clearable placeholder="处理状态" @change="loadOfficialConversations()">
            <el-option label="待处理" value="pending" />
            <el-option label="处理中" value="processing" />
            <el-option label="待用户补充" value="waiting_user" />
            <el-option label="已解决" value="resolved" />
            <el-option label="已驳回" value="rejected" />
          </el-select>
          <el-button :loading="officialLoading" @click="loadOfficialConversations()">刷新会话</el-button>
        </div>
      </div>
      <div class="official-status-shortcuts" aria-label="客服会话处理状态筛选">
        <el-button
          v-for="item in officialStatusFilters"
          :key="item.value || 'all'"
          size="small"
          :type="officialFilters.status === item.value ? item.type : 'info'"
          :plain="officialFilters.status !== item.value"
          @click="filterOfficialStatus(item.value)"
        >{{ item.label }}</el-button>
      </div>
      <el-table :data="officialConversations" v-loading="officialLoading" stripe>
        <el-table-column label="用户" min-width="260">
          <template #default="{ row }">
            <div class="actor-cell">
              <el-avatar :size="38" :src="row.user?.avatar">
                {{ avatarText(row.user?.name) }}
              </el-avatar>
              <div class="actor-info">
                <div class="actor-name">{{ row.user?.name || '未知用户' }}</div>
                <div class="actor-subtitle">{{ row.user?.subtitle || row.userId || '-' }}</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="工单上下文" min-width="290">
          <template #default="{ row }">
            <div v-if="row.ticket" class="ticket-cell">
              <div class="ticket-cell-head">
                <span class="actor-name">{{ row.ticket.title }}</span>
                <el-tag type="success" size="small" effect="plain">已关联</el-tag>
              </div>
              <div class="actor-subtitle">{{ row.ticket.ticketNo }} · {{ officialStatusText(row.ticket.status) }}</div>
              <code>ticketId: {{ row.ticket.id }}</code>
            </div>
            <span v-else class="ticket-empty">未关联工单</span>
          </template>
        </el-table-column>
        <el-table-column label="最后消息" min-width="320" show-overflow-tooltip>
          <template #default="{ row }">{{ formatChatMessagePreview(row.rawLastMessage || row.lastMessage) }}</template>
        </el-table-column>
        <el-table-column label="官方未读" width="110">
          <template #default="{ row }">
            <el-tag :type="row.unreadCount > 0 ? 'danger' : 'info'" effect="plain">{{ row.unreadCount || 0 }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="处理状态" width="110">
          <template #default="{ row }">
            <el-tag :type="officialStatusType(row.serviceStatus)" effect="plain">{{ officialStatusText(row.serviceStatus) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="lastMsgTime" label="最后互动" width="175">
          <template #default="{ row }">{{ formatTime(row.lastMsgTime) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="110" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="openOfficialConversation(row)">进入处理</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-drawer v-model="officialDrawerVisible" :title="officialDrawerTitle" size="520px" destroy-on-close>
      <div class="official-chat-drawer" v-loading="messagesLoading">
        <div class="ticket-context" :class="{ missing: !activeTicketId }">
          <div class="ticket-context-head">
            <strong>{{ activeTicketId ? '已关联工单上下文' : '当前会话未关联工单' }}</strong>
            <el-tag v-if="activeTicketId" type="success" size="small" effect="plain">conversationId 强绑定</el-tag>
          </div>
          <template v-if="activeTicketId">
            <span>{{ selectedOfficialConversation?.ticket?.ticketNo }} · {{ selectedOfficialConversation?.ticket?.title }}</span>
            <code>ticketId: {{ activeTicketId }}</code>
            <p>回复请求会携带此 ticketId，后端只向该工单写入回复或更新状态。</p>
          </template>
          <p v-else>未关联 ticketId 时只写客服会话消息，不会隐式追加到用户的其他工单。</p>
        </div>
        <div v-if="officialMessages.length" class="message-list">
          <div
            v-for="message in officialMessages"
            :key="message.id"
            class="message-bubble-row"
            :class="{ official: message.isOfficial }"
          >
            <el-avatar :size="30" :src="message.senderAvatar">{{ avatarText(message.senderName) }}</el-avatar>
            <div class="message-bubble">
              <div class="message-meta">{{ message.senderName }} · {{ formatTime(message.createdAt) }}</div>
              <div class="message-content">
                <el-image
                  v-if="message.renderType === 'image' && message.mediaUrl"
                  class="message-image"
                  :src="message.mediaUrl"
                  :preview-src-list="[message.mediaUrl]"
                  fit="cover"
                  preview-teleported
                />
                <video
                  v-else-if="message.renderType === 'video' && message.mediaUrl"
                  class="message-video"
                  :src="message.mediaUrl"
                  :poster="message.posterUrl"
                  controls
                />
                <div v-else-if="message.renderType === 'audio' && message.mediaUrl" class="audio-card">
                  <audio :src="message.mediaUrl" controls />
                  <span v-if="message.duration">{{ message.duration }} 秒</span>
                </div>
                <div v-else-if="message.renderType === 'location'" class="location-card">
                  <strong>{{ message.location?.name || '位置消息' }}</strong>
                  <span>{{ message.location?.address || '-' }}</span>
                  <em v-if="message.location?.latitude && message.location?.longitude">
                    {{ message.location.latitude }}, {{ message.location.longitude }}
                  </em>
                </div>
                <a
                  v-else-if="message.renderType === 'file'"
                  class="file-card"
                  :href="message.mediaUrl || message.file?.url"
                  target="_blank"
                  rel="noreferrer"
                >
                  <strong>{{ message.file?.name || '文件消息' }}</strong>
                  <span v-if="message.file?.size">{{ formatFileSize(message.file.size) }}</span>
                </a>
                <router-link
                  v-else-if="message.renderType === 'note' && message.note"
                  class="note-card"
                  :to="{ path: '/content/posts', query: { id: message.note.noteId } }"
                  target="_blank"
                  @click.stop
                >
                  <img v-if="message.note.coverImage" class="note-cover" :src="message.note.coverImage" alt="" />
                  <div class="note-body">
                    <strong>{{ message.note.title || '无标题' }}</strong>
                    <span v-if="message.note.content">{{ message.note.content }}</span>
                    <div class="note-meta">
                      <span>{{ message.note.authorName || '未知用户' }}</span>
                      <em>查看笔记 ›</em>
                    </div>
                  </div>
                </router-link>
                <div v-else-if="message.renderType === 'order'" class="order-card">
                  <div class="order-card-head">
                    <strong>{{ orderTypeText(message.order?.orderType) }}</strong>
                    <el-tag size="small" effect="plain">{{ orderStatusText(message.order) }}</el-tag>
                  </div>
                  <div class="order-title">{{ message.order?.title || '订单问题' }}</div>
                  <div class="order-meta">
                    <span>订单号：{{ message.order?.orderNo || message.order?.orderId || '-' }}</span>
                    <span v-if="formatOrderAmount(message.order?.amount)">金额：{{ formatOrderAmount(message.order?.amount) }}</span>
                    <span v-if="message.order?.createdAt">下单：{{ formatTime(message.order.createdAt) }}</span>
                  </div>
                  <div v-if="message.order?.summary" class="order-summary">{{ message.order.summary }}</div>
                </div>
                <span v-else>{{ message.displayContent || message.content }}</span>
              </div>
            </div>
          </div>
        </div>
        <EmptyState v-else description="暂无会话消息" />
      </div>
      <template #footer>
        <div class="reply-box">
          <div class="status-actions">
            <span>处理状态：<el-tag :type="officialStatusType(selectedOfficialConversation?.serviceStatus)" effect="plain">{{ officialStatusText(selectedOfficialConversation?.serviceStatus) }}</el-tag></span>
            <span class="status-ticket-id">ticketId: {{ activeTicketId || '未关联' }}</span>
            <el-button size="small" :loading="updatingStatus" @click="updateConversationStatus('processing')">受理</el-button>
            <el-button size="small" type="warning" plain :loading="updatingStatus" @click="updateConversationStatus('waiting_user')">待补充</el-button>
            <el-button size="small" type="success" plain :loading="updatingStatus" @click="updateConversationStatus('resolved')">解决</el-button>
            <el-button size="small" type="danger" plain :loading="updatingStatus" @click="updateConversationStatus('rejected')">驳回</el-button>
          </div>
          <el-input
            v-model="replyContent"
            type="textarea"
            :rows="3"
            maxlength="500"
            show-word-limit
            :placeholder="officialResolutionHint"
          />
          <div class="reply-actions">
            <el-upload accept="image/*" :show-file-list="false" :http-request="sendOfficialImage">
              <el-button :loading="replying">发送图片</el-button>
            </el-upload>
            <el-button type="primary" :loading="replying" @click="sendOfficialReply">发送回复</el-button>
          </div>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { RefreshRight } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import GlassPageHeader from '@/components/glass/GlassPageHeader.vue'
import StatGrid from '@/components/glass/StatGrid.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import {
  fetchOfficialConversationMessages,
  fetchOfficialConversations,
  fetchRealtimeSessions,
  fetchRealtimeStatus,
  fetchRealtimeWsTestToken,
  replyOfficialConversation,
  updateOfficialConversationStatus,
  uploadAdminFile,
} from '@/api/admin'
import { formatChatMessagePreview, normalizeChatMessage } from '@/utils/chatMessage'

const loading = ref(false)
const route = useRoute()
const sessions = ref<any[]>([])
const total = ref(0)
const autoRefresh = ref(true)
const lastRefreshAt = ref<Date | null>(null)
let timer: number | undefined
const statusLoading = ref(false)
const realtimeStatus = ref<any>({})
const wsProbeLoading = ref(false)
const wsProbe = reactive({
  status: '',
  message: '',
})

const stats = reactive({
  onlineCount: 0,
  miniappOnlineCount: 0,
  riderAppOnlineCount: 0,
  adminOnlineCount: 0,
})

const filters = reactive({
  platform: '',
  online: 'true',
  page: 1,
  pageSize: 50,
})

const officialLoading = ref(false)
const officialConversations = ref<any[]>([])
const officialFilters = reactive({
  keyword: '',
  status: '',
  page: 1,
  pageSize: 20,
})
const selectedOfficialConversation = ref<any | null>(null)
const officialDrawerVisible = ref(false)
const officialMessages = ref<any[]>([])
const messagesLoading = ref(false)
const replyContent = ref('')
const replying = ref(false)
const updatingStatus = ref(false)
const officialCardRef = ref<HTMLElement | null>(null)
const officialStatusFilters = [
  { value: '', label: '全部会话', type: 'info' },
  { value: 'pending', label: '待处理', type: 'warning' },
  { value: 'processing', label: '受理中', type: 'primary' },
  { value: 'waiting_user', label: '待补充', type: 'warning' },
  { value: 'resolved', label: '已解决', type: 'success' },
  { value: 'rejected', label: '已驳回', type: 'danger' },
]

const lastRefreshText = computed(() => lastRefreshAt.value ? lastRefreshAt.value.toLocaleTimeString('zh-CN') : '-')

const statItems = computed(() => [
  { label: '在线连接', value: stats.onlineCount, icon: 'Connection' },
  { label: '小程序在线', value: stats.miniappOnlineCount, tone: 'blue' as const, icon: 'Iphone' },
  { label: '骑手 App 在线', value: stats.riderAppOnlineCount, tone: 'green' as const, icon: 'Position' },
  { label: '后台在线', value: stats.adminOnlineCount, tone: 'orange' as const, icon: 'Monitor' },
  { label: '当前列表', value: total.value, tone: 'green' as const, icon: 'List' },
])
const officialDrawerTitle = computed(() => selectedOfficialConversation.value?.user?.name
  ? `客服会话：${selectedOfficialConversation.value.user.name}`
  : '客服会话')
const activeTicketId = computed(() => String(selectedOfficialConversation.value?.ticket?.id || '').trim())
const officialResolutionHint = computed(() => '输入给用户的处理说明；待补充、解决、驳回时必填')

function formatTime(t: string) {
  if (!t) return '-'
  return new Date(t).toLocaleString('zh-CN')
}

function avatarText(name?: string) {
  return (name || '?').slice(0, 1)
}

function formatFileSize(value?: number | string) {
  const size = Number(value || 0)
  if (!Number.isFinite(size) || size <= 0) return ''
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function formatOrderAmount(value?: number | string) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount) || amount <= 0) return ''
  return `¥${amount.toFixed(2)}`
}

function orderTypeText(value?: string) {
  const map: Record<string, string> = {
    delivery: '外卖订单',
    errand: '跑腿订单',
    mall: '商城订单',
    second_hand: '二手订单',
    order: '订单',
  }
  return map[String(value || '')] || '订单'
}

function orderStatusText(order?: any) {
  const map: Record<string, string> = {
    pending: '待付款',
    unpaid: '待付款',
    paid: '已付款',
    awaiting_delivery: '待配送',
    delivering: '配送中',
    completed: '已完成',
    cancelled: '已取消',
    refunded: '已退款',
    confirmed: '待接单',
    dispatched: '已接单',
    picked_up: '已取货',
    shipped: '已发货',
    received: '已收货',
  }
  return order?.statusText || map[String(order?.status || '')] || order?.status || '待处理'
}

function officialStatusText(status?: string) {
  return ({ pending: '待处理', processing: '处理中', waiting_user: '待用户补充', resolved: '已解决', rejected: '已驳回', closed: '已关闭' } as Record<string, string>)[String(status || 'pending')] || '待处理'
}

function officialStatusType(status?: string) {
  return ({ pending: 'warning', processing: 'primary', waiting_user: 'warning', resolved: 'success', rejected: 'danger', closed: 'info' } as Record<string, string>)[String(status || 'pending')] || 'info'
}

function refreshHeaderStats() {
  window.dispatchEvent(new CustomEvent('admin-header-stats-refresh'))
}

function focusOfficialConversations() {
  nextTick(() => officialCardRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
}

async function loadSessions(showSuccess = false) {
  loading.value = true
  try {
    const res: any = await fetchRealtimeSessions(filters)
    sessions.value = res?.list || res?.data?.list || []
    total.value = res?.total || res?.data?.total || 0
    const nextStats = res?.stats || res?.data?.stats || {}
    stats.onlineCount = Number(nextStats.onlineCount || 0)
    stats.miniappOnlineCount = Number(nextStats.miniappOnlineCount || 0)
    stats.riderAppOnlineCount = Number(nextStats.riderAppOnlineCount || 0)
    stats.adminOnlineCount = Number(nextStats.adminOnlineCount || 0)
    lastRefreshAt.value = new Date()
    if (showSuccess) ElMessage.success('实时连接已刷新')
  } catch (e: any) {
    ElMessage.error(e?.message || '加载实时连接失败')
  } finally {
    loading.value = false
  }
}

async function loadRealtimeStatus(showSuccess = false) {
  statusLoading.value = true
  try {
    const res: any = await fetchRealtimeStatus()
    realtimeStatus.value = res?.data || res || {}
    if (showSuccess) ElMessage.success('实时通信状态已刷新')
  } catch (e: any) {
    ElMessage.error(e?.message || '加载实时通信状态失败')
  } finally {
    statusLoading.value = false
  }
}

function buildApiWebSocketUrl(token: string) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/api/ws-native?token=${encodeURIComponent(token)}`
}

async function testApiWebSocketProxy() {
  wsProbeLoading.value = true
  wsProbe.status = ''
  wsProbe.message = ''
  let socket: WebSocket | null = null
  try {
    const res: any = await fetchRealtimeWsTestToken()
    const token = res?.token || res?.data?.token
    if (!token) throw new Error('测试 token 生成失败')
    const url = buildApiWebSocketUrl(token)
    await new Promise<void>((resolve, reject) => {
      let settled = false
      const timer = window.setTimeout(() => {
        if (settled) return
        settled = true
        reject(new Error('/api/ws-native 连接超时，请检查 Nginx WebSocket 转发'))
      }, 8000)
      socket = new WebSocket(url)
      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(String(event.data || '{}'))
          if (data.event === 'connected' || data.status === 'connected') {
            if (settled) return
            settled = true
            window.clearTimeout(timer)
            resolve()
          }
        } catch {
          // Ignore non-JSON probe frames.
        }
      }
      socket.onerror = () => {
        if (settled) return
        settled = true
        window.clearTimeout(timer)
        reject(new Error('/api/ws-native 连接失败，请检查域名 SSL 和 Nginx Upgrade 配置'))
      }
      socket.onclose = () => {
        if (settled) return
        settled = true
        window.clearTimeout(timer)
        reject(new Error('/api/ws-native 连接被关闭，请检查后端 /ws-native 是否可用'))
      }
    })
    wsProbe.status = 'success'
    wsProbe.message = '/api/ws-native 转发正常'
    ElMessage.success('WebSocket 转发测试通过')
    loadRealtimeStatus()
  } catch (e: any) {
    wsProbe.status = 'failed'
    wsProbe.message = e?.message || 'WebSocket 转发测试失败'
    ElMessage.error(wsProbe.message)
  } finally {
    if (socket && socket.readyState === WebSocket.OPEN) socket.close()
    wsProbeLoading.value = false
  }
}

function reloadFirstPage() {
  filters.page = 1
  loadSessions()
}

function resetFilters() {
  filters.platform = ''
  filters.online = 'true'
  filters.page = 1
  loadSessions()
}

async function loadOfficialConversations() {
  officialLoading.value = true
  try {
    const res: any = await fetchOfficialConversations(officialFilters)
    officialConversations.value = res?.list || res?.data?.list || []
  } catch (e: any) {
    ElMessage.error(e?.message || '加载官方会话失败')
  } finally {
    officialLoading.value = false
  }
}

function filterOfficialStatus(status: string) {
  officialFilters.status = status
  officialFilters.page = 1
  loadOfficialConversations()
}

async function openOfficialConversation(row: any) {
  selectedOfficialConversation.value = row
  officialDrawerVisible.value = true
  replyContent.value = ''
  await loadOfficialMessages(row.conversationId || row.id)
}

async function loadOfficialMessages(conversationId: string) {
  if (!conversationId) return
  messagesLoading.value = true
  try {
    const res: any = await fetchOfficialConversationMessages(conversationId, { page: 1, pageSize: 80 })
    officialMessages.value = (res?.messages || res?.data?.messages || []).map((item: any) => normalizeChatMessage(item))
    await loadOfficialConversations()
    refreshHeaderStats()
  } catch (e: any) {
    ElMessage.error(e?.message || '加载会话消息失败')
  } finally {
    messagesLoading.value = false
  }
}

async function sendOfficialReply() {
  const conversationId = selectedOfficialConversation.value?.conversationId || selectedOfficialConversation.value?.id
  if (!conversationId) {
    ElMessage.warning('请先选择会话')
    return
  }
  if (!replyContent.value.trim()) {
    ElMessage.warning('请输入回复内容')
    return
  }
  replying.value = true
  try {
    const res: any = await replyOfficialConversation(conversationId, replyContent.value.trim(), activeTicketId.value || undefined)
    ElMessage.success(res?.message || '官方回复已发送')
    replyContent.value = ''
    await loadOfficialMessages(conversationId)
    refreshHeaderStats()
  } catch (e: any) {
    ElMessage.error(e?.message || '发送失败')
  } finally {
    replying.value = false
  }
}

async function sendOfficialImage(option: any) {
  const conversationId = selectedOfficialConversation.value?.conversationId || selectedOfficialConversation.value?.id
  if (!conversationId || !option?.file) return
  replying.value = true
  try {
    const uploaded: any = await uploadAdminFile(option.file, 'official_chat')
    const url = uploaded?.url || uploaded?.data?.url
    if (!url) throw new Error('图片上传失败')
    const res: any = await replyOfficialConversation(conversationId, `img:${url}`, activeTicketId.value || undefined)
    option.onSuccess?.(res)
    ElMessage.success(res?.message || '官方图片已发送')
    await loadOfficialMessages(conversationId)
  } catch (e: any) {
    option.onError?.(e)
    ElMessage.error(e?.message || '图片发送失败')
  } finally {
    replying.value = false
  }
}

async function updateConversationStatus(status: string) {
  const conversationId = selectedOfficialConversation.value?.conversationId || selectedOfficialConversation.value?.id
  if (!conversationId) return
  const content = replyContent.value.trim()
  if (['waiting_user', 'resolved', 'rejected'].includes(status) && !content) {
    ElMessage.warning('请先填写给用户的处理说明')
    return
  }
  updatingStatus.value = true
  try {
    const res: any = await updateOfficialConversationStatus(conversationId, status, content || undefined, activeTicketId.value || undefined)
    selectedOfficialConversation.value = { ...selectedOfficialConversation.value, serviceStatus: res?.status || status }
    if (content) replyContent.value = ''
    ElMessage.success(`已更新为${officialStatusText(res?.status || status)}`)
    await loadOfficialMessages(conversationId)
  } catch (e: any) {
    ElMessage.error(e?.message || '更新处理状态失败')
  } finally {
    updatingStatus.value = false
  }
}

function setupTimer() {
  if (timer) window.clearInterval(timer)
  if (autoRefresh.value) timer = window.setInterval(() => {
    loadSessions()
    loadRealtimeStatus()
  }, 15000)
}

watch(autoRefresh, setupTimer)
watch(() => route.query.official, (value) => {
  if (value === '1') focusOfficialConversations()
})
onMounted(() => {
  loadSessions()
  loadRealtimeStatus()
  loadOfficialConversations()
  setupTimer()
  if (route.query.official === '1') focusOfficialConversations()
})
onBeforeUnmount(() => {
  if (timer) window.clearInterval(timer)
})
</script>

<style scoped lang="scss">
.realtime-page {
  display: grid;
  gap: 18px;
}
.realtime-health-card {
  padding: 16px;
  display: grid;
  gap: 14px;
}
.health-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.health-head h3 {
  margin: 0;
  color: var(--mx-text);
  font-size: 18px;
  font-weight: 950;
}
.health-head p {
  margin: 6px 0 0;
  color: var(--mx-sub);
  font-size: 13px;
  font-weight: 700;
}
.health-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.health-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}
.health-item {
  min-width: 0;
  border: 1px solid var(--mx-border);
  border-radius: 6px;
  background: var(--mx-soft);
  padding: 12px;
  display: grid;
  gap: 6px;
}
.health-item span,
.limit-row span {
  color: var(--mx-sub);
  font-size: 12px;
  font-weight: 800;
}
.health-item strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--mx-text);
  font-size: 17px;
  font-weight: 950;
}
.health-item em {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--mx-sub);
  font-size: 12px;
  font-style: normal;
  font-weight: 700;
}
.health-item.danger {
  border-color: var(--el-color-danger-light-7);
  background: var(--el-color-danger-light-9);
}
.health-note {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--mx-sub);
  font-size: 13px;
  font-weight: 750;
  flex-wrap: wrap;
}
.limit-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.limit-row span {
  border-radius: 999px;
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary-dark-2);
  padding: 5px 9px;
}
.filter-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  flex-wrap: wrap;
}
.filter-card .el-select {
  width: 180px;
}
.refresh-hint {
  margin-left: auto;
  color: var(--mx-sub);
  font-size: 13px;
  font-weight: 800;
}
.table-card {
  padding: 14px;
}
.official-card {
  padding: 16px;
}
.card-toolbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}
.card-toolbar h3 {
  margin: 0;
  color: var(--mx-text);
  font-size: 18px;
  font-weight: 950;
}
.card-toolbar p {
  margin: 6px 0 0;
  color: var(--mx-sub);
  font-size: 13px;
  font-weight: 700;
}
.official-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.official-status-shortcuts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0 0 14px;
}
.official-actions .el-input {
  width: 260px;
}
.official-actions .el-select {
  width: 120px;
}
.actor-cell {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.actor-info {
  min-width: 0;
}
.actor-name {
  color: var(--mx-text);
  font-size: 14px;
  font-weight: 900;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.actor-subtitle {
  margin-top: 3px;
  color: var(--mx-sub);
  font-size: 12px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ticket-cell {
  display: grid;
  gap: 4px;
}
.ticket-cell-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ticket-cell-head .actor-name {
  min-width: 0;
  flex: 1;
}
.ticket-cell code,
.ticket-context code,
.status-ticket-id {
  color: var(--el-color-primary-dark-2);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
  font-weight: 800;
  word-break: break-all;
}
.ticket-empty {
  color: var(--mx-sub);
  font-size: 12px;
  font-weight: 750;
}
.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
.official-chat-drawer {
  min-height: 360px;
}
.ticket-context {
  display: grid;
  gap: 6px;
  margin-bottom: 16px;
  border: 1px solid var(--el-color-success-light-5);
  border-radius: 8px;
  background: var(--el-color-success-light-9);
  padding: 12px;
}
.ticket-context.missing {
  border-color: var(--mx-border);
  background: var(--mx-soft);
}
.ticket-context-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.ticket-context span,
.ticket-context p {
  margin: 0;
  color: var(--mx-sub);
  font-size: 12px;
  line-height: 1.55;
}
.status-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  color: var(--mx-sub);
  font-size: 13px;
  font-weight: 800;
}
.reply-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 10px;
}
.message-list {
  display: grid;
  gap: 14px;
}
.message-bubble-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
.message-bubble-row.official {
  flex-direction: row-reverse;
}
.message-bubble {
  max-width: 78%;
  padding: 10px 12px;
  border: 1px solid var(--mx-border);
  border-radius: 14px;
  background: var(--mx-soft);
}
.message-bubble-row.official .message-bubble {
  color: var(--mx-card);
  background: var(--el-color-primary);
  border-color: transparent;
}
.message-meta {
  margin-bottom: 5px;
  font-size: 11px;
  font-weight: 800;
  color: var(--mx-sub);
}
.message-bubble-row.official .message-meta {
  color: color-mix(in srgb, var(--mx-card) 82%, transparent);
}
.message-content {
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.55;
  font-size: 13px;
  font-weight: 700;
}
.message-image {
  width: 180px;
  max-width: 100%;
  height: 130px;
  border-radius: 6px;
  border: 1px solid var(--mx-border);
  background: var(--mx-soft);
}
.message-video {
  width: 260px;
  max-width: 100%;
  border-radius: 6px;
  background: var(--mx-text);
}
.audio-card {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.audio-card audio {
  width: 260px;
  max-width: 100%;
}
.audio-card span {
  font-size: 12px;
  opacity: 0.78;
}
.location-card,
.file-card,
.note-card,
.order-card {
  display: grid;
  gap: 6px;
  width: min(100%, 320px);
  border: 1px solid var(--el-color-primary-light-7);
  border-radius: 6px;
  background: var(--el-color-primary-light-9);
  padding: 10px 12px;
  color: var(--el-color-primary-dark-2);
  text-decoration: none;
}
.note-card {
  overflow: hidden;
  padding: 0;
  background: var(--mx-card);
}
.note-cover {
  display: block;
  width: 100%;
  height: 150px;
  object-fit: cover;
  background: var(--mx-soft);
}
.note-body {
  display: grid;
  gap: 6px;
  padding: 11px 12px;
}
.note-body > span {
  display: -webkit-box;
  overflow: hidden;
  color: var(--mx-sub);
  font-size: 12px;
  font-weight: 500;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.note-meta {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  color: var(--mx-sub);
  font-size: 12px;
}
.note-meta em {
  color: var(--el-color-primary);
  font-style: normal;
  font-weight: 800;
}
.location-card span,
.file-card span,
.order-card span,
.location-card em {
  color: var(--mx-sub);
  font-size: 12px;
  font-style: normal;
}

.order-card {
  width: min(100%, 390px);
  border-color: var(--mx-border);
  background: var(--mx-card);
  color: var(--mx-text);
}

.order-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.order-title {
  color: var(--mx-text);
  font-weight: 800;
}

.order-meta {
  display: grid;
  gap: 3px;
}

.order-summary {
  color: var(--mx-sub);
  font-size: 12px;
}
.reply-box {
  display: grid;
  gap: 10px;
}
.reply-box .el-button {
  justify-self: end;
}
@media (max-width: 1000px) {
  .refresh-hint {
    width: 100%;
    margin-left: 0;
  }
  .card-toolbar,
  .official-actions {
    align-items: stretch;
    flex-direction: column;
  }
  .official-actions .el-input {
    width: 100%;
  }
}
</style>
