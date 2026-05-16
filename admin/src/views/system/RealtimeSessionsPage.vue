<template>
  <div class="page-shell realtime-page">
    <GlassPageHeader title="在线用户与官方消息" subtitle="查看真实在线连接，向小程序用户发送官方消息并沉淀为可继续沟通的会话">
      <template #actions>
        <el-switch v-model="autoRefresh" active-text="自动刷新" />
        <el-button :icon="RefreshRight" :loading="loading" @click="loadSessions(true)">刷新</el-button>
      </template>
    </GlassPageHeader>

    <div class="realtime-stats">
      <div class="stat-card glass-card">
        <span>在线连接</span>
        <strong>{{ stats.onlineCount }}</strong>
      </div>
      <div class="stat-card glass-card miniapp">
        <span>小程序在线</span>
        <strong>{{ stats.miniappOnlineCount }}</strong>
      </div>
      <div class="stat-card glass-card admin">
        <span>后台在线</span>
        <strong>{{ stats.adminOnlineCount }}</strong>
      </div>
      <div class="stat-card glass-card">
        <span>当前列表</span>
        <strong>{{ total }}</strong>
      </div>
    </div>

    <div class="glass-card filter-card">
      <el-select v-model="filters.platform" placeholder="平台" clearable @change="reloadFirstPage">
        <el-option label="全部平台" value="" />
        <el-option label="小程序" value="miniapp" />
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
            <el-tag size="small" :type="row.platform === 'miniapp' ? 'primary' : 'warning'" effect="plain">
              {{ row.platform === 'miniapp' ? '小程序' : '后台' }}
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
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" :disabled="!row.liveSocketCount" @click="handleTestPush(row)">
              发官方消息
            </el-button>
          </template>
        </el-table-column>
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

    <div class="glass-card official-card">
      <div class="card-toolbar">
        <div>
          <h3>官方消息会话</h3>
          <p>用户回复官方后会进入这里，运营可以继续跟进。</p>
        </div>
        <div class="official-actions">
          <el-input
            v-model="officialFilters.keyword"
            placeholder="搜索用户昵称 / 手机 / OpenID"
            clearable
            @keyup.enter="loadOfficialConversations()"
          />
          <el-button :loading="officialLoading" @click="loadOfficialConversations()">刷新会话</el-button>
        </div>
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
        <el-table-column prop="lastMessage" label="最后消息" min-width="320" show-overflow-tooltip />
        <el-table-column label="官方未读" width="110">
          <template #default="{ row }">
            <el-tag :type="row.unreadCount > 0 ? 'danger' : 'info'" effect="plain">{{ row.unreadCount || 0 }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="lastMsgTime" label="最后互动" width="175">
          <template #default="{ row }">{{ formatTime(row.lastMsgTime) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="110" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="openOfficialConversation(row)">查看回复</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-drawer v-model="officialDrawerVisible" :title="officialDrawerTitle" size="520px" destroy-on-close>
      <div class="official-chat-drawer" v-loading="messagesLoading">
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
              <div class="message-content">{{ message.content }}</div>
            </div>
          </div>
        </div>
        <el-empty v-else description="暂无会话消息" />
      </div>
      <template #footer>
        <div class="reply-box">
          <el-input
            v-model="replyContent"
            type="textarea"
            :rows="3"
            maxlength="500"
            show-word-limit
            placeholder="输入官方回复，用户会在小程序官方会话里收到"
          />
          <el-button type="primary" :loading="replying" @click="sendOfficialReply">发送回复</el-button>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { RefreshRight } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import GlassPageHeader from '@/components/glass/GlassPageHeader.vue'
import {
  fetchOfficialConversationMessages,
  fetchOfficialConversations,
  fetchRealtimeSessions,
  replyOfficialConversation,
  testPushToUser,
} from '@/api/admin'

const loading = ref(false)
const sessions = ref<any[]>([])
const total = ref(0)
const autoRefresh = ref(true)
const lastRefreshAt = ref<Date | null>(null)
let timer: number | undefined

const stats = reactive({
  onlineCount: 0,
  miniappOnlineCount: 0,
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
  page: 1,
  pageSize: 20,
})
const selectedOfficialConversation = ref<any | null>(null)
const officialDrawerVisible = ref(false)
const officialMessages = ref<any[]>([])
const messagesLoading = ref(false)
const replyContent = ref('')
const replying = ref(false)

const lastRefreshText = computed(() => lastRefreshAt.value ? lastRefreshAt.value.toLocaleTimeString('zh-CN') : '-')
const officialDrawerTitle = computed(() => selectedOfficialConversation.value?.user?.name
  ? `官方会话：${selectedOfficialConversation.value.user.name}`
  : '官方会话')

function formatTime(t: string) {
  if (!t) return '-'
  return new Date(t).toLocaleString('zh-CN')
}

function avatarText(name?: string) {
  return (name || '?').slice(0, 1)
}

function refreshHeaderStats() {
  window.dispatchEvent(new CustomEvent('admin-header-stats-refresh'))
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
    stats.adminOnlineCount = Number(nextStats.adminOnlineCount || 0)
    lastRefreshAt.value = new Date()
    if (showSuccess) ElMessage.success('实时连接已刷新')
  } catch (e: any) {
    ElMessage.error(e?.message || '加载实时连接失败')
  } finally {
    loading.value = false
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

async function handleTestPush(row: any) {
  const targetId = row.userId || row.adminId
  if (!targetId) {
    ElMessage.warning('这条连接没有可推送的用户ID')
    return
  }
  const { value } = await ElMessageBox.prompt('输入官方消息内容', '发送官方推送消息', {
    inputValue: '您好，这是一条来自平台官方的消息。',
    confirmButtonText: '发送',
    cancelButtonText: '取消',
  })
  try {
    const res: any = await testPushToUser(targetId, value || '您好，这是一条来自平台官方的消息。')
    ElMessage.success(res?.message || `官方消息已发送到 ${res?.deliveredCount || 0} 个连接`)
    await loadSessions()
    await loadOfficialConversations()
    refreshHeaderStats()
  } catch (e: any) {
    ElMessage.error(e?.message || '推送失败')
  }
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
    officialMessages.value = res?.messages || res?.data?.messages || []
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
    const res: any = await replyOfficialConversation(conversationId, replyContent.value.trim())
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

function setupTimer() {
  if (timer) window.clearInterval(timer)
  if (autoRefresh.value) timer = window.setInterval(() => loadSessions(), 15000)
}

watch(autoRefresh, setupTimer)
onMounted(() => {
  loadSessions()
  loadOfficialConversations()
  setupTimer()
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
.realtime-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}
.stat-card {
  padding: 18px 20px;
  display: grid;
  gap: 8px;
}
.stat-card span {
  color: #64748b;
  font-size: 13px;
  font-weight: 800;
}
.stat-card strong {
  color: #0f172a;
  font-size: 30px;
  font-weight: 950;
}
.stat-card.miniapp strong { color: #2563eb; }
.stat-card.admin strong { color: #f59e0b; }
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
  color: #64748b;
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
  color: #0f172a;
  font-size: 18px;
  font-weight: 950;
}
.card-toolbar p {
  margin: 6px 0 0;
  color: #64748b;
  font-size: 13px;
  font-weight: 700;
}
.official-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.official-actions .el-input {
  width: 260px;
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
  color: #0f172a;
  font-size: 14px;
  font-weight: 900;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.actor-subtitle {
  margin-top: 3px;
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
.official-chat-drawer {
  min-height: 360px;
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
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 14px;
  background: rgba(248, 250, 252, 0.92);
}
.message-bubble-row.official .message-bubble {
  color: #fff;
  background: linear-gradient(135deg, #2563eb, #20b6d7);
  border-color: transparent;
}
.message-meta {
  margin-bottom: 5px;
  font-size: 11px;
  font-weight: 800;
  color: #64748b;
}
.message-bubble-row.official .message-meta {
  color: rgba(255, 255, 255, 0.82);
}
.message-content {
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.55;
  font-size: 13px;
  font-weight: 700;
}
.reply-box {
  display: grid;
  gap: 10px;
}
.reply-box .el-button {
  justify-self: end;
}
@media (max-width: 1000px) {
  .realtime-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
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
@media (max-width: 640px) {
  .realtime-stats {
    grid-template-columns: 1fr;
  }
}
</style>
