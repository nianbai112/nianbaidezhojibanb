<template>
  <div class="page-shell private-message-page">
    <PageHeader title="私信管理" subtitle="查看用户与用户之间的聊天记录，处理冲突和违规风险" icon="ChatDotRound" />

    <StatGrid :items="statItems" />

    <div class="filter-bar">
      <el-input
        v-model="filters.keyword"
        placeholder="搜索昵称、手机号、用户ID、消息内容"
        clearable
        class="keyword-input"
        @clear="reloadFirstPage"
        @keyup.enter="reloadFirstPage"
      />
      <el-select v-model="filters.blocked" placeholder="会话状态" class="status-select" @change="reloadFirstPage">
        <el-option label="全部会话" value="" />
        <el-option label="正常" value="false" />
        <el-option label="已屏蔽" value="true" />
      </el-select>
      <el-select v-model="filters.messageType" placeholder="消息类型" class="status-select" clearable @change="reloadFirstPage">
        <el-option v-for="item in messageTypeOptions" :key="item.value" :label="item.label" :value="item.value" />
      </el-select>
      <el-date-picker
        v-model="dateRange"
        type="daterange"
        range-separator="至"
        start-placeholder="最后互动开始"
        end-placeholder="最后互动结束"
        class="date-range"
        @change="reloadFirstPage"
      />
      <el-button type="primary" @click="reloadFirstPage">查询</el-button>
      <el-button @click="resetFilters">重置</el-button>
      <el-button :loading="loading" @click="loadData">刷新</el-button>
    </div>

    <el-table :data="list" v-loading="loading" border stripe>
      <el-table-column label="聊天双方" min-width="280">
        <template #default="{ row }">
          <div class="participants">
            <div v-for="member in row.participants" :key="member.userId" class="participant">
              <el-avatar :size="34" :src="member.avatar">{{ avatarText(member.name) }}</el-avatar>
              <div>
                <div class="name-line">{{ member.name }}</div>
                <div class="sub-line">{{ member.phone || member.userId }}</div>
              </div>
            </div>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="lastMessage" label="最后消息" min-width="300" show-overflow-tooltip />
      <el-table-column prop="lastMessageTypeLabel" label="消息类型" width="105" />
      <el-table-column prop="messageCount" label="消息数" width="90" align="center" />
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="row.isBlocked ? 'danger' : 'success'" effect="plain">
            {{ row.isBlocked ? '已屏蔽' : '正常' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="lastMsgTime" label="最后互动" width="175">
        <template #default="{ row }">{{ formatTime(row.lastMsgTime) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="190" fixed="right">
        <template #default="{ row }">
          <el-button type="primary" link size="small" @click="openConversation(row)">查看记录</el-button>
          <el-button v-if="hasManagePermission" :type="row.isBlocked ? 'success' : 'danger'" link size="small" @click="toggleBlock(row)">
            {{ row.isBlocked ? '解除屏蔽' : '屏蔽' }}
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="pagination-bar">
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper"
        @size-change="loadData"
        @current-change="loadData"
      />
    </div>

    <el-drawer v-model="drawerVisible" :title="drawerTitle" size="640px" destroy-on-close>
      <div class="drawer-shell" v-loading="messagesLoading">
        <div v-if="selectedConversation" class="conversation-card">
          <div class="conversation-main">
            <div class="drawer-participants">
              <span v-for="member in selectedConversation.participants" :key="member.userId">{{ member.name }}</span>
            </div>
            <el-tag :type="selectedConversation.isBlocked ? 'danger' : 'success'" effect="plain">
              {{ selectedConversation.isBlocked ? '已屏蔽' : '正常' }}
            </el-tag>
          </div>
          <div class="conversation-meta">
            共 {{ messagesTotal }} 条消息，最后互动 {{ formatTime(selectedConversation.lastMsgTime) }}
          </div>
        </div>

        <div class="message-filter">
          <el-input
            v-model="messageFilters.keyword"
            placeholder="搜索本会话消息内容、发送人、UID、手机号"
            clearable
            @clear="loadMessages"
            @keyup.enter="loadMessages"
          />
          <el-select v-model="messageFilters.messageType" placeholder="消息类型" clearable style="width: 130px" @change="loadMessages">
            <el-option v-for="item in messageTypeOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
          <el-button @click="loadMessages">搜索</el-button>
        </div>

        <div v-if="messages.length" class="message-list">
          <div v-for="message in messages" :key="message.id" class="message-row">
            <el-avatar :size="32" :src="message.senderAvatar">{{ avatarText(message.senderName) }}</el-avatar>
            <div class="message-card" :class="{ recalled: message.isRecalled }">
              <div class="message-top">
                <span class="sender">{{ message.senderName }}</span>
                <el-tag size="small" effect="plain">{{ message.typeLabel }}</el-tag>
                <span class="time">{{ formatTime(message.createdAt) }}</span>
              </div>
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
                  <div class="audio-meta">
                    <strong>语音消息</strong>
                    <span>{{ message.duration ? `${message.duration} 秒` : '时长未知' }}</span>
                  </div>
                  <audio :src="message.mediaUrl" controls />
                  <a :href="message.mediaUrl" target="_blank" rel="noreferrer">打开原文件</a>
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
              <div class="message-actions">
                <span v-if="message.senderPhone" class="phone">{{ message.senderPhone }}</span>
                <el-button
                  v-if="hasManagePermission && !message.isRecalled"
                  type="danger"
                  link
                  size="small"
                  @click="recallMessage(message)"
                >
                  撤回消息
                </el-button>
              </div>
            </div>
          </div>
        </div>
        <EmptyState v-else description="暂无私信消息" />
      </div>

      <template #footer>
        <div class="drawer-footer">
          <el-button v-if="hasManagePermission && selectedConversation" :type="selectedConversation.isBlocked ? 'success' : 'danger'" @click="toggleBlock(selectedConversation)">
            {{ selectedConversation.isBlocked ? '解除屏蔽' : '屏蔽会话' }}
          </el-button>
          <el-button @click="drawerVisible = false">关闭</el-button>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageHeader from '@/components/common/PageHeader.vue'
import StatGrid from '@/components/glass/StatGrid.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import {
  fetchPrivateConversationMessages,
  fetchPrivateMessageConversations,
  recallPrivateConversationMessage,
  setPrivateConversationBlocked,
} from '@/api/admin'
import { normalizeChatMessage } from '@/utils/chatMessage'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const hasManagePermission = ref(auth.permissions.includes('message:manage'))
const loading = ref(false)
const messagesLoading = ref(false)
const list = ref<any[]>([])
const messages = ref<any[]>([])
const total = ref(0)
const messagesTotal = ref(0)
const page = ref(1)
const pageSize = ref(20)
const drawerVisible = ref(false)
const selectedConversation = ref<any | null>(null)
const dateRange = ref<any[]>([])

const filters = reactive({
  keyword: '',
  blocked: '',
  messageType: '',
})

const messageFilters = reactive({
  keyword: '',
  messageType: '',
})

const messageTypeOptions = [
  { label: '文本', value: 'TEXT' },
  { label: '图片', value: 'IMAGE' },
  { label: '语音', value: 'AUDIO' },
  { label: '视频', value: 'VIDEO' },
  { label: '位置', value: 'LOCATION' },
  { label: '文件', value: 'FILE' },
]

const stats = reactive({
  totalConversations: 0,
  blockedConversations: 0,
  normalConversations: 0,
  totalMessages: 0,
})

const statItems = computed(() => [
  { label: '用户私信会话', value: stats.totalConversations, icon: 'ChatDotRound' },
  { label: '已屏蔽会话', value: stats.blockedConversations, tone: 'red' as const, icon: 'CircleClose' },
  { label: '正常会话', value: stats.normalConversations, icon: 'ChatRound' },
  { label: '私信消息总数', value: stats.totalMessages, icon: 'ChatLineRound' },
])

const drawerTitle = computed(() => {
  if (!selectedConversation.value) return '私信记录'
  return `私信记录：${selectedConversation.value.participantText}`
})

function avatarText(name?: string) {
  return (name || '?').slice(0, 1)
}

function formatTime(value?: string) {
  if (!value) return '-'
  return new Date(value).toLocaleString('zh-CN')
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

function normalizeStats(payload: any) {
  const source = payload?.stats || {}
  stats.totalConversations = Number(source.totalConversations || 0)
  stats.blockedConversations = Number(source.blockedConversations || 0)
  stats.normalConversations = Number(source.normalConversations || 0)
  stats.totalMessages = Number(source.totalMessages || 0)
}

async function loadData() {
  loading.value = true
  try {
    const res: any = await fetchPrivateMessageConversations({
      page: page.value,
      pageSize: pageSize.value,
      keyword: filters.keyword,
      blocked: filters.blocked,
      messageType: filters.messageType,
      lastMsgStart: dateRange.value?.[0]?.toISOString?.(),
      lastMsgEnd: dateRange.value?.[1]?.toISOString?.(),
    })
    list.value = res?.list || []
    total.value = Number(res?.total || 0)
    normalizeStats(res)
  } catch (error: any) {
    if (!error?.userMessage) ElMessage.error(error?.message || '加载私信会话失败')
  } finally {
    loading.value = false
  }
}

function reloadFirstPage() {
  page.value = 1
  loadData()
}

function resetFilters() {
  filters.keyword = ''
  filters.blocked = ''
  filters.messageType = ''
  dateRange.value = []
  reloadFirstPage()
}

async function openConversation(row: any) {
  selectedConversation.value = row
  messageFilters.keyword = ''
  messageFilters.messageType = ''
  drawerVisible.value = true
  await loadMessages()
}

async function loadMessages() {
  const conversationId = selectedConversation.value?.id
  if (!conversationId) return
  messagesLoading.value = true
  try {
    const res: any = await fetchPrivateConversationMessages(conversationId, {
      page: 1,
      pageSize: 100,
      keyword: messageFilters.keyword,
      messageType: messageFilters.messageType,
    })
    messages.value = (res?.list || res?.messages || []).map((item: any) => normalizeChatMessage(item))
    messagesTotal.value = Number(res?.total || messages.value.length)
    if (res?.conversation) selectedConversation.value = { ...selectedConversation.value, ...res.conversation }
  } catch (error: any) {
    if (!error?.userMessage) ElMessage.error(error?.message || '加载私信记录失败')
  } finally {
    messagesLoading.value = false
  }
}

async function toggleBlock(row: any) {
  const nextBlocked = !row.isBlocked
  const actionText = nextBlocked ? '屏蔽会话' : '解除屏蔽'
  const message = nextBlocked
    ? `确定屏蔽「${row.participantText}」的私信会话？屏蔽后双方不能继续发送消息。`
    : `确定解除「${row.participantText}」的私信屏蔽？解除后双方可以继续发送消息。`
  try {
    await ElMessageBox.confirm(message, actionText, {
      type: nextBlocked ? 'warning' : 'info',
      confirmButtonText: actionText,
      cancelButtonText: '取消',
    })
    await setPrivateConversationBlocked(row.id, nextBlocked)
    ElMessage.success(nextBlocked ? '已屏蔽该私信会话' : '已解除屏蔽')
    row.isBlocked = nextBlocked
    row.blocked = nextBlocked
    row.statusLabel = nextBlocked ? '已屏蔽' : '正常'
    if (selectedConversation.value?.id === row.id) {
      selectedConversation.value = { ...selectedConversation.value, ...row }
    }
    await loadData()
  } catch (error: any) {
    if (error !== 'cancel' && !error?.userMessage) ElMessage.error(error?.message || `${actionText}失败`)
  }
}

async function recallMessage(message: any) {
  try {
    await ElMessageBox.confirm(`确定撤回「${message.senderName}」发送的这条消息？`, '撤回消息', {
      type: 'warning',
      confirmButtonText: '撤回',
      cancelButtonText: '取消',
    })
    await recallPrivateConversationMessage(message.id)
    ElMessage.success('已撤回消息')
    await loadMessages()
    await loadData()
  } catch (error: any) {
    if (error !== 'cancel' && !error?.userMessage) ElMessage.error(error?.message || '撤回消息失败')
  }
}

onMounted(loadData)
</script>

<style scoped>
.page-shell {
  padding: 24px;
}

.filter-bar {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.keyword-input {
  width: 320px;
}

.status-select {
  width: 140px;
}

.participants {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.participant {
  display: flex;
  gap: 10px;
  align-items: center;
}

.name-line {
  color: var(--mx-text);
  font-weight: 600;
  line-height: 20px;
}

.sub-line {
  color: var(--mx-muted);
  font-size: 12px;
  line-height: 18px;
}

.pagination-bar {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}

.drawer-shell {
  min-height: 420px;
}

.conversation-card {
  border: 1px solid var(--mx-border-strong);
  border-radius: 6px;
  padding: 14px;
  margin-bottom: 14px;
  background: var(--mx-soft);
}

.conversation-main {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.drawer-participants {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-weight: 700;
  color: var(--mx-text);
}

.conversation-meta {
  margin-top: 8px;
  color: var(--mx-muted);
  font-size: 13px;
}

.message-filter {
  display: flex;
  gap: 10px;
  margin-bottom: 14px;
}

.message-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.message-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.message-card {
  flex: 1;
  border: 1px solid var(--mx-border-strong);
  border-radius: 6px;
  padding: 12px;
  background: var(--mx-card);
}

.message-card.recalled {
  background: var(--mx-soft);
  color: var(--mx-muted);
}

.message-top {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.sender {
  font-weight: 700;
  color: var(--mx-text);
}

.time {
  color: var(--mx-muted);
  font-size: 12px;
  margin-left: auto;
}

.message-content {
  color: var(--mx-sub);
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.6;
}

.message-image {
  width: 180px;
  max-width: 100%;
  height: 130px;
  border-radius: 6px;
  border: 1px solid var(--mx-border-strong);
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
  width: min(100%, 420px);
  border: 1px solid var(--el-color-success-light-7);
  border-radius: 6px;
  background: var(--el-color-success-light-9);
  padding: 10px 12px;
}

.audio-meta {
  display: grid;
  gap: 2px;
  min-width: 72px;
}

.audio-meta strong {
  color: var(--el-color-success-dark-2);
  font-size: 13px;
}

.audio-card audio {
  width: 260px;
  max-width: 100%;
}

.audio-card span,
.audio-card a {
  color: var(--mx-muted);
  font-size: 12px;
}

.audio-card a {
  text-decoration: none;
}

.location-card,
.file-card,
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

.location-card span,
.file-card span,
.order-card span,
.location-card em {
  color: var(--mx-muted);
  font-size: 12px;
  font-style: normal;
}

.order-card {
  width: min(100%, 390px);
  border-color: var(--mx-border-strong);
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
  font-weight: 700;
}

.order-meta {
  display: grid;
  gap: 3px;
}

.order-summary {
  color: var(--mx-muted);
  font-size: 12px;
}

.message-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
}

.phone {
  color: var(--mx-muted);
  font-size: 12px;
}

.drawer-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

@media (max-width: 720px) {
  .page-shell {
    padding: 16px;
  }

  .keyword-input,
  .status-select {
    width: 100%;
  }
}
</style>
