<template>
  <div class="page-shell private-message-page">
    <PageHeader title="私信审核" subtitle="只审核用户与用户之间的聊天记录；官方客服回复请进入客服工作台" />

    <!-- KPI：每个指标带一句人话解释 -->
    <div class="pm-kpis">
      <div class="pm-kpi">
        <div class="pm-kpi-label"><span class="pm-dot b"></span>私信会话</div>
        <div class="pm-kpi-value">{{ stats.totalConversations }}</div>
        <div class="pm-kpi-hint">平台内全部一对一聊天</div>
      </div>
      <div class="pm-kpi attn">
        <div class="pm-kpi-label"><span class="pm-dot a"></span>含风险词（本页）</div>
        <div class="pm-kpi-value">{{ riskCount }}</div>
        <div class="pm-kpi-hint">当前页会话最后消息命中敏感词，建议优先核查</div>
      </div>
      <div class="pm-kpi alert">
        <div class="pm-kpi-label"><span class="pm-dot r"></span>已屏蔽</div>
        <div class="pm-kpi-value">{{ stats.blockedConversations }}</div>
        <div class="pm-kpi-hint">这些会话双方当前无法互发消息</div>
      </div>
      <div class="pm-kpi">
        <div class="pm-kpi-label"><span class="pm-dot g"></span>私信消息总数</div>
        <div class="pm-kpi-value">{{ stats.totalMessages }}</div>
        <div class="pm-kpi-hint">全部会话累计消息量</div>
      </div>
    </div>

    <!-- 分组页签：直接点，不用开下拉 -->
    <div class="pm-tabs">
      <span
        v-for="tab in tabs"
        :key="tab.key"
        class="pm-tab"
        :class="{ cur: activeTab === tab.key, risk: tab.key === 'risk' }"
        @click="switchTab(tab.key)"
      >
        {{ tab.label }}
        <span class="cnt">{{ tabCount(tab.key) }}</span>
      </span>
      <span v-if="activeTab === 'risk'" class="pm-tabs-note">风险词按当前页会话的最后消息匹配</span>
    </div>

    <!-- 筛选栏 -->
    <div class="pm-filterbar">
      <el-input
        v-model="filters.keyword"
        placeholder="搜索昵称、手机号、用户ID、消息内容"
        clearable
        class="pm-keyword"
        @clear="reloadFirstPage"
        @keyup.enter="reloadFirstPage"
      />
      <el-select v-model="filters.messageType" placeholder="消息类型" class="pm-select" clearable @change="reloadFirstPage">
        <el-option v-for="item in messageTypeOptions" :key="item.value" :label="item.label" :value="item.value" />
      </el-select>
      <el-date-picker
        v-model="dateRange"
        type="daterange"
        range-separator="至"
        start-placeholder="最后互动开始"
        end-placeholder="最后互动结束"
        class="pm-daterange"
        @change="reloadFirstPage"
      />
      <el-button type="primary" class="pm-btn-query" @click="reloadFirstPage">查询</el-button>
      <el-button class="pm-btn-plain" @click="resetFilters">重置</el-button>
      <el-button class="pm-btn-plain" :loading="loading" @click="loadData">刷新</el-button>
    </div>

    <!-- 会话表 -->
    <div class="pm-tablewrap" v-loading="loading">
      <table class="pm-table">
        <thead>
          <tr>
            <th style="width: 27%">聊天双方</th>
            <th style="width: 30%">最后消息</th>
            <th class="r" style="width: 76px">消息数</th>
            <th style="width: 128px">状态</th>
            <th class="r" style="width: 108px">最后互动</th>
            <th class="r" style="width: 168px">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in displayList" :key="row.id" @click="openConversation(row)">
            <td>
              <div class="pm-party">
                <div class="pm-avatars">
                  <el-avatar
                    v-for="member in row.participants"
                    :key="member.userId"
                    :size="32"
                    :src="member.avatar"
                    class="pm-av"
                  >{{ avatarText(member.name) }}</el-avatar>
                </div>
                <div>
                  <div class="pm-names">
                    <template v-for="(member, i) in row.participants" :key="member.userId">
                      <span v-if="i > 0" class="sep">⇄</span>{{ member.name }}
                    </template>
                  </div>
                  <div class="pm-contact">
                    {{ row.participants.map(m => m.phone || `UID ${m.userId}`).join(' · ') }}
                  </div>
                </div>
              </div>
            </td>
            <td>
              <div class="pm-lastmsg">
                <div class="preview">{{ row.lastMessage || '-' }}</div>
                <span v-if="rowRiskInfo(row)" class="pm-riskflag">
                  ⚠ {{ rowRiskInfo(row).label }} <span class="words">命中：{{ rowRiskInfo(row).hits.join(' · ') }}</span>
                </span>
              </div>
            </td>
            <td class="r pm-count">{{ row.messageCount }}</td>
            <td>
              <div class="pm-statuspill">
                <span class="top" :class="row.isBlocked ? 'ban' : 'ok'">
                  <span class="pm-dot" :class="row.isBlocked ? 'r' : 'g'"></span>{{ row.isBlocked ? '已屏蔽' : '正常' }}
                </span>
                <span class="conseq">{{ row.isBlocked ? '双方无法互发消息' : '双方可互发消息' }}</span>
              </div>
            </td>
            <td class="r pm-when">
              <div class="rel">{{ formatRel(row.lastMsgTime) }}</div>
              <div class="abs">{{ formatShort(row.lastMsgTime) }}</div>
            </td>
            <td class="r pm-ops" @click.stop>
              <el-button class="pm-btn-view" size="small" @click="openConversation(row)">查看记录</el-button>
              <el-button
                v-if="hasManagePermission"
                link
                size="small"
                :class="row.isBlocked ? 'pm-op-calm' : 'pm-op-danger'"
                @click="toggleBlock(row)"
              >{{ row.isBlocked ? '解除屏蔽' : '屏蔽会话' }}</el-button>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="!loading && !displayList.length" class="pm-empty">
        <EmptyState :description="activeTab === 'risk' ? '当前页没有命中风险词的会话' : '暂无私信会话'" />
      </div>
      <div class="pm-tablefoot">
        <span>共 {{ activeTab === 'risk' ? `${displayList.length} 条命中（本页）` : `${total} 个会话` }} · 每页 {{ pageSize }} 条</span>
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="[10, 20, 50, 100]"
          layout="sizes, prev, pager, next, jumper"
          @size-change="loadData"
          @current-change="loadData"
        />
      </div>
    </div>

    <!-- 抽屉：拟真聊天记录 -->
    <el-drawer v-model="drawerVisible" :with-header="false" size="660px" destroy-on-close class="pm-drawer">
      <div class="pm-drawer-shell" v-loading="messagesLoading">
        <template v-if="selectedConversation">
          <div class="pm-drawer-head">
            <div class="pm-crumb">私信记录 · 共 {{ messagesTotal }} 条消息</div>
            <div class="pm-versus">
              <div class="pm-person" v-if="participantAt(0)">
                <el-avatar :size="36" :src="participantAt(0).avatar" class="pm-av a1">{{ avatarText(participantAt(0).name) }}</el-avatar>
                <div>
                  <div class="pm-p-name">{{ participantAt(0).name }}</div>
                  <div class="pm-p-info">{{ participantAt(0).phone || '-' }} · UID {{ participantAt(0).userId }}</div>
                </div>
              </div>
              <div class="pm-vs-mid">⇄</div>
              <div class="pm-person" v-if="participantAt(1)">
                <el-avatar :size="36" :src="participantAt(1).avatar" class="pm-av a2">{{ avatarText(participantAt(1).name) }}</el-avatar>
                <div>
                  <div class="pm-p-name">{{ participantAt(1).name }}</div>
                  <div class="pm-p-info">{{ participantAt(1).phone || '-' }} · UID {{ participantAt(1).userId }}</div>
                </div>
              </div>
            </div>
            <div class="pm-state-banner" :class="selectedConversation.isBlocked ? 'ban' : 'ok'">
              <span class="pm-dot" :class="selectedConversation.isBlocked ? 'r' : 'g'"></span>
              <span class="t">{{ selectedConversation.isBlocked ? '已屏蔽' : '正常' }}</span>
              <span class="c">{{ selectedConversation.isBlocked ? '双方当前无法互发消息，解除后立即恢复' : '双方当前可正常互发消息' }}</span>
              <span class="right">最后互动 {{ formatShort(selectedConversation.lastMsgTime) }}</span>
            </div>
          </div>

          <div v-if="drawerRisk" class="pm-risk-banner">
            ⚠ <span>本会话命中 <b>{{ drawerRisk.count }} 类风险词</b>，已在下方消息中高亮：</span>
            <span class="kws"><span v-for="w in drawerRisk.words" :key="w" class="kw">{{ w }}</span></span>
          </div>

          <div class="pm-msg-filter">
            <el-input
              v-model="messageFilters.keyword"
              placeholder="搜索本会话消息内容、发送人、手机号"
              clearable
              @clear="loadMessages"
              @keyup.enter="loadMessages"
            />
            <el-select v-model="messageFilters.messageType" placeholder="类型" clearable class="pm-msg-type" @change="loadMessages">
              <el-option v-for="item in messageTypeOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
            <el-button type="primary" @click="loadMessages">搜索</el-button>
          </div>

          <div v-if="messages.length" class="pm-msg-scroll">
            <template v-for="(message, idx) in messages" :key="message.id">
              <div v-if="showDaySep(idx)" class="pm-day-sep"><span>{{ dayLabel(message.createdAt) }}</span></div>

              <div class="pm-chat" :class="{ me: chatSide(message) === 'right' }">
                <el-avatar
                  :size="34"
                  :src="message.senderAvatar"
                  class="pm-av"
                  :class="chatSide(message) === 'right' ? 'a2' : 'a1'"
                >{{ avatarText(message.senderName) }}</el-avatar>
                <div class="pm-col">
                  <div class="pm-who">
                    <span class="name">{{ message.senderName }}</span>
                    <span>{{ formatClock(message.createdAt) }}</span>
                  </div>

                  <!-- 已撤回 -->
                  <div v-if="message.isRecalled" class="pm-bubble recalled">此消息已被管理员撤回</div>

                  <!-- 文本（风险词高亮） -->
                  <div v-else-if="message.renderType === 'text' || !message.renderType" class="pm-bubble">
                    <template v-for="(part, i) in highlightParts(message.displayContent || message.content)" :key="i">
                      <mark v-if="part.hit">{{ part.text }}</mark><template v-else>{{ part.text }}</template>
                    </template>
                  </div>

                  <!-- 图片 -->
                  <div v-else-if="message.renderType === 'image'" class="pm-bubble media">
                    <el-image
                      v-if="message.mediaUrl"
                      class="pm-media-img"
                      :src="message.mediaUrl"
                      :preview-src-list="[message.mediaUrl]"
                      fit="cover"
                      preview-teleported
                    />
                  </div>

                  <!-- 视频 -->
                  <div v-else-if="message.renderType === 'video'" class="pm-bubble media">
                    <video v-if="message.mediaUrl" class="pm-media-video" :src="message.mediaUrl" :poster="message.posterUrl" controls />
                  </div>

                  <!-- 语音 -->
                  <div v-else-if="message.renderType === 'audio'" class="pm-bubble">
                    <div class="pm-media-audio">
                      <button class="pm-playbtn" @click.stop="toggleAudio(message)">
                        <svg v-if="playingId !== message.id" width="9" height="11" viewBox="0 0 10 12" fill="none"><path d="M0 0L10 6L0 12V0Z" fill="#454c59"/></svg>
                        <svg v-else width="9" height="11" viewBox="0 0 10 12" fill="none"><rect x="0" y="0" width="3.5" height="12" fill="#454c59"/><rect x="6.5" y="0" width="3.5" height="12" fill="#454c59"/></svg>
                      </button>
                      <span class="pm-wave"><i v-for="(h, i) in waveBars(message.id)" :key="i" :style="{ height: h + 'px' }"></i></span>
                      <span class="dur">{{ message.duration ? `${message.duration}″` : '语音' }}</span>
                      <audio v-if="message.mediaUrl" :ref="registerAudio(message.id)" :src="message.mediaUrl" preload="none" />
                    </div>
                  </div>

                  <!-- 位置 -->
                  <div v-else-if="message.renderType === 'location'" class="pm-bubble">
                    <div class="pm-location">
                      <strong>{{ message.location?.name || '位置消息' }}</strong>
                      <span>{{ message.location?.address || '-' }}</span>
                      <em v-if="message.location?.latitude && message.location?.longitude">
                        {{ message.location.latitude }}, {{ message.location.longitude }}
                      </em>
                    </div>
                  </div>

                  <!-- 文件 -->
                  <div v-else-if="message.renderType === 'file'" class="pm-bubble">
                    <a class="pm-file" :href="message.mediaUrl || message.file?.url" target="_blank" rel="noreferrer">
                      <strong>{{ message.file?.name || '文件消息' }}</strong>
                      <span v-if="message.file?.size">{{ formatFileSize(message.file.size) }} · 点击打开</span>
                    </a>
                  </div>

                  <!-- 笔记 -->
                  <div v-else-if="message.renderType === 'note' && message.note" class="pm-bubble media">
                    <router-link
                      class="pm-note"
                      :to="{ path: '/content/posts', query: { id: message.note.noteId } }"
                      target="_blank"
                      @click.stop
                    >
                      <img v-if="message.note.coverImage" class="pm-note-cover" :src="message.note.coverImage" alt="" />
                      <div class="pm-note-body">
                        <strong>{{ message.note.title || '无标题' }}</strong>
                        <span v-if="message.note.content">{{ message.note.content }}</span>
                        <div class="pm-note-meta">
                          <span>{{ message.note.authorName || '未知用户' }}</span>
                          <em>查看笔记 ›</em>
                        </div>
                      </div>
                    </router-link>
                  </div>

                  <!-- 订单 -->
                  <div v-else-if="message.renderType === 'order'" class="pm-bubble media">
                    <div class="pm-order">
                      <div class="o-head">
                        <span class="o-type">{{ orderTypeText(message.order?.orderType) }}</span>
                        <span class="o-status">{{ orderStatusText(message.order) }}</span>
                      </div>
                      <div class="o-title">{{ message.order?.title || '订单问题' }}</div>
                      <div class="o-meta">
                        <span>订单号 {{ message.order?.orderNo || message.order?.orderId || '-' }}</span>
                        <span v-if="formatOrderAmount(message.order?.amount)">金额 {{ formatOrderAmount(message.order?.amount) }}</span>
                        <span v-if="message.order?.createdAt">下单于 {{ formatShort(message.order.createdAt) }}</span>
                      </div>
                      <div v-if="message.order?.summary" class="o-summary">{{ message.order.summary }}</div>
                    </div>
                  </div>

                  <!-- 其他类型兜底 -->
                  <div v-else class="pm-bubble">{{ message.displayContent || message.content }}</div>

                  <div class="pm-msg-meta">
                    <span v-if="message.isRecalled">原发送于 {{ formatClock(message.createdAt) }}</span>
                    <span v-else-if="message.senderPhone">{{ message.senderPhone }}</span>
                    <button
                      v-if="hasManagePermission && !message.isRecalled"
                      class="pm-recall-btn"
                      @click.stop="recallMessage(message)"
                    >撤回此消息</button>
                  </div>
                </div>
              </div>
            </template>
          </div>
          <div v-else class="pm-drawer-empty">
            <EmptyState description="暂无私信消息" />
          </div>
        </template>
      </div>

      <template #footer>
        <div class="pm-drawer-foot" v-if="selectedConversation">
          <el-button
            v-if="hasManagePermission"
            :class="selectedConversation.isBlocked ? 'pm-btn-unban' : 'pm-btn-ban'"
            @click="toggleBlock(selectedConversation)"
          >{{ selectedConversation.isBlocked ? '解除屏蔽' : '屏蔽会话' }}</el-button>
          <span class="hint">{{ selectedConversation.isBlocked ? '解除后双方可立即恢复互发消息' : '屏蔽后双方将无法互发消息' }}</span>
          <el-button class="pm-btn-plain close" @click="drawerVisible = false">关闭</el-button>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageHeader from '@/components/common/PageHeader.vue'
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
const playingId = ref<string | number | null>(null)

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

/* ---------- 分组页签 ---------- */
type TabKey = 'all' | 'normal' | 'blocked' | 'risk'
const activeTab = ref<TabKey>('all')
const tabs: { key: TabKey; label: string }[] = [
  { key: 'all', label: '全部会话' },
  { key: 'normal', label: '正常' },
  { key: 'blocked', label: '已屏蔽' },
  { key: 'risk', label: '⚠ 含风险词' },
]

function tabCount(key: TabKey) {
  if (key === 'all') return stats.totalConversations
  if (key === 'normal') return stats.normalConversations
  if (key === 'blocked') return stats.blockedConversations
  return riskCount.value
}

function switchTab(key: TabKey) {
  activeTab.value = key
  filters.blocked = key === 'normal' ? 'false' : key === 'blocked' ? 'true' : ''
  reloadFirstPage()
}

/* ---------- 风险词：前端本地匹配，词表可按需扩充 ---------- */
const RISK_RULES = [
  { label: '疑似违规', words: ['加微信', '转账', '定金', '押金', '私下交易', '不走平台', '支付宝', '付款码', '红包', '银行卡', '微信号'] },
  { label: '冲突升级', words: ['骚扰', '报警', '威胁', '举报', '投诉', '曝光', '恐吓', '骂人'] },
  { label: '广告营销', words: ['刷单', '兼职', '代购', '扫码进群', '优惠群', '加群', '招代理'] },
]

function detectRisk(text?: string) {
  const value = String(text || '')
  if (!value) return null as null | { label: string; hits: string[] }
  for (const rule of RISK_RULES) {
    const hits = rule.words.filter((w) => value.includes(w))
    if (hits.length) return { label: rule.label, hits }
  }
  return null
}

function rowRiskInfo(row: any) {
  if (row.isRecalled) return null
  return detectRisk(row.lastMessage)
}

const riskCount = computed(() => list.value.filter((r) => rowRiskInfo(r)).length)
const displayList = computed(() =>
  activeTab.value === 'risk' ? list.value.filter((r) => rowRiskInfo(r)) : list.value,
)

/* 把消息文本切成「普通段 / 命中段」，不用 v-html 也能高亮 */
function highlightParts(text?: string) {
  const value = String(text || '')
  if (!value) return [] as { text: string; hit: boolean }[]
  const words = RISK_RULES.flatMap((r) => r.words).sort((a, b) => b.length - a.length)
  const parts: { text: string; hit: boolean }[] = []
  let i = 0
  while (i < value.length) {
    const matched = words.find((w) => value.startsWith(w, i))
    if (matched) {
      parts.push({ text: matched, hit: true })
      i += matched.length
    } else {
      let j = i + 1
      while (j < value.length && !words.some((w) => value.startsWith(w, j))) j += 1
      parts.push({ text: value.slice(i, j), hit: false })
      i = j
    }
  }
  return parts
}

/* 抽屉顶部风险词汇总：扫描当前已加载的文本消息 */
const drawerRisk = computed(() => {
  const byLabel = new Map<string, Set<string>>()
  for (const m of messages.value) {
    if (m.isRecalled || m.renderType !== 'text') continue
    const r = detectRisk(m.displayContent || m.content)
    if (!r) continue
    if (!byLabel.has(r.label)) byLabel.set(r.label, new Set())
    r.hits.forEach((w) => byLabel.get(r.label)!.add(w))
  }
  if (!byLabel.size) return null
  const words = [...new Set([...byLabel.values()].flatMap((s) => [...s]))].slice(0, 5)
  return { count: byLabel.size, words }
})

/* ---------- 格式化 ---------- */
function avatarText(name?: string) {
  return (name || '?').slice(0, 1)
}

function formatShort(value?: string) {
  if (!value) return '-'
  const d = new Date(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatClock(value?: string) {
  if (!value) return ''
  const d = new Date(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function formatRel(value?: string) {
  if (!value) return '-'
  const diff = Date.now() - new Date(value).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} 天前`
  return formatShort(value)
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

/* ---------- 对话流辅助 ---------- */
function participantAt(index: number) {
  return selectedConversation.value?.participants?.[index] || null
}

function senderIdOf(m: any) {
  return m.senderId ?? m.senderUid ?? m.fromUserId ?? m.userId ?? m.uid ?? null
}

/* 审核视角：第一位参与者靠左，另一方靠右，拟真对话 */
function chatSide(m: any): 'left' | 'right' {
  const first = participantAt(0)
  if (!first) return 'left'
  const sid = senderIdOf(m)
  if (sid != null && first.userId != null) return String(sid) === String(first.userId) ? 'left' : 'right'
  return m.senderName === first.name ? 'left' : 'right'
}

function dayKey(value?: string) {
  if (!value) return ''
  const d = new Date(value)
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

function showDaySep(index: number) {
  if (index === 0) return true
  return dayKey(messages.value[index]?.createdAt) !== dayKey(messages.value[index - 1]?.createdAt)
}

function dayLabel(value?: string) {
  if (!value) return ''
  const d = new Date(value)
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`
}

/* 语音：确定性伪波形（按消息 id 生成，不跳动） */
function waveBars(seed: any) {
  const s = String(seed ?? '')
  let h = 0
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const bars: number[] = []
  for (let i = 0; i < 12; i += 1) {
    h = (h * 1103515245 + 12345) >>> 0
    bars.push(6 + (h % 17))
  }
  return bars
}

const audioEls = new Map<string, HTMLAudioElement>()
function registerAudio(id: string | number) {
  return (el: any) => {
    if (el) audioEls.set(String(id), el as HTMLAudioElement)
    else audioEls.delete(String(id))
  }
}

function toggleAudio(m: any) {
  const el = audioEls.get(String(m.id))
  if (!el) return
  if (playingId.value === m.id && !el.paused) {
    el.pause()
    playingId.value = null
    return
  }
  audioEls.forEach((a) => a.pause())
  el.currentTime = 0
  el.play()
  playingId.value = m.id
  el.onended = () => {
    if (playingId.value === m.id) playingId.value = null
  }
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

/* ---------- 数据加载（逻辑不变） ---------- */
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
  activeTab.value = 'all'
  reloadFirstPage()
}

async function openConversation(row: any) {
  selectedConversation.value = row
  messageFilters.keyword = ''
  messageFilters.messageType = ''
  playingId.value = null
  drawerVisible.value = true
  await loadMessages()
}

async function loadMessages() {
  const conversationId = selectedConversation.value?.id
  if (!conversationId) return
  messagesLoading.value = true
  playingId.value = null
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
/* ============================================================
   私信审核 V2 · 管理效率优先
   看懂 > 好看：风险前置、状态说后果、记录拟真对话
   ============================================================ */
.private-message-page {
  --pm-ink: #1f2430;
  --pm-ink-2: #454c59;
  --pm-ink-3: #78808f;
  --pm-ink-4: #a4aab6;
  --pm-line: #e6e8ec;
  --pm-line-2: #d6d9df;
  --pm-paper: #ffffff;
  --pm-hover: #f6f8fb;
  --pm-blue: #2f6bdf;
  --pm-blue-soft: #eef3fd;
  --pm-green: #1d9e6c;
  --pm-red: #d23b3b;
  --pm-red-soft: #fcedec;
  --pm-amber: #b97809;
  --pm-amber-soft: #fdf3e0;
  --pm-amber-mark: #ffe9a8;
}

.page-shell {
  padding: 24px;
}

.pm-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; display: inline-block; }
.pm-dot.g { background: var(--pm-green); }
.pm-dot.r { background: var(--pm-red); }
.pm-dot.a { background: var(--pm-amber); }
.pm-dot.b { background: var(--pm-blue); }

/* ---------- KPI ---------- */
.pm-kpis {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px;
  margin: 18px 0 20px;
}
.pm-kpi {
  background: var(--pm-paper); border: 1px solid var(--pm-line); border-radius: 10px;
  padding: 16px 18px 14px;
}
.pm-kpi-label { font-size: 13px; color: var(--pm-ink-3); display: flex; align-items: center; gap: 7px; }
.pm-kpi-value { font-size: 28px; font-weight: 650; margin-top: 4px; color: var(--pm-ink); font-variant-numeric: tabular-nums; }
.pm-kpi-hint { font-size: 12px; color: var(--pm-ink-4); margin-top: 3px; line-height: 1.5; }
.pm-kpi.alert { border-color: #f0c9c7; background: linear-gradient(180deg, #fff, #fef7f6); }
.pm-kpi.alert .pm-kpi-value { color: var(--pm-red); }
.pm-kpi.attn { border-color: #eed9ae; background: linear-gradient(180deg, #fff, #fdf9ef); }
.pm-kpi.attn .pm-kpi-value { color: var(--pm-amber); }

/* ---------- 分组页签 ---------- */
.pm-tabs { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; }
.pm-tab {
  padding: 7px 14px; border-radius: 999px; cursor: pointer; user-select: none;
  font-size: 13px; color: var(--pm-ink-2);
  background: var(--pm-paper); border: 1px solid var(--pm-line-2);
  display: inline-flex; align-items: center; gap: 7px;
  transition: background 120ms ease, color 120ms ease;
}
.pm-tab .cnt { font-size: 12px; color: var(--pm-ink-4); font-variant-numeric: tabular-nums; }
.pm-tab.cur { background: var(--pm-ink); border-color: var(--pm-ink); color: #fff; font-weight: 550; }
.pm-tab.cur .cnt { color: rgba(255, 255, 255, 0.65); }
.pm-tab.risk { border-color: #e8c98f; color: var(--pm-amber); background: var(--pm-amber-soft); }
.pm-tab.risk.cur { background: var(--pm-amber); border-color: var(--pm-amber); color: #fff; }
.pm-tab.risk.cur .cnt { color: rgba(255, 255, 255, 0.75); }
.pm-tabs-note { margin-left: auto; font-size: 12px; color: var(--pm-ink-4); }

/* ---------- 筛选栏 ---------- */
.pm-filterbar {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  background: var(--pm-paper); border: 1px solid var(--pm-line); border-radius: 10px;
  padding: 12px 14px; margin-bottom: 14px;
}
.pm-keyword { width: 320px; }
.pm-select { width: 140px; }
.pm-daterange { width: 260px; }

/* ---------- 会话表 ---------- */
.pm-tablewrap {
  background: var(--pm-paper); border: 1px solid var(--pm-line); border-radius: 10px;
  overflow: hidden;
}
.pm-table { width: 100%; border-collapse: collapse; }
.pm-table thead th {
  text-align: left; font-size: 12.5px; font-weight: 500; color: var(--pm-ink-3);
  padding: 11px 16px; background: #f8f9fb; border-bottom: 1px solid var(--pm-line);
  white-space: nowrap;
}
.pm-table thead th.r, .pm-table tbody td.r { text-align: right; }
.pm-table tbody td {
  padding: 14px 16px; vertical-align: middle;
  border-bottom: 1px solid var(--pm-line);
  font-size: 13.5px; color: var(--pm-ink-2);
}
.pm-table tbody tr:last-child td { border-bottom: none; }
.pm-table tbody tr { cursor: pointer; transition: background 120ms ease; }
.pm-table tbody tr:hover { background: var(--pm-hover); }

.pm-party { display: flex; align-items: center; gap: 11px; }
.pm-avatars { display: flex; }
.pm-avatars .pm-av + .pm-av { margin-left: -11px; }
.pm-avatars .pm-av { border: 2px solid var(--pm-paper); }
.pm-av.a1 { background: #4a5568; }
.pm-av.a2 { background: #8a94a6; }
.pm-names { font-weight: 600; font-size: 14px; color: var(--pm-ink); }
.pm-names .sep { color: var(--pm-ink-4); font-weight: 400; margin: 0 4px; }
.pm-contact { font-size: 12px; color: var(--pm-ink-3); margin-top: 2px; font-variant-numeric: tabular-nums; }

.pm-lastmsg .preview {
  color: var(--pm-ink-2); font-size: 13px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 340px;
}
.pm-riskflag {
  display: inline-flex; align-items: center; gap: 5px;
  margin-top: 5px; padding: 2px 8px; border-radius: 5px;
  background: var(--pm-amber-soft); color: var(--pm-amber);
  font-size: 12px; font-weight: 550;
}
.pm-riskflag .words { font-weight: 400; color: #966508; }

.pm-count { font-variant-numeric: tabular-nums; }

.pm-statuspill { display: inline-flex; flex-direction: column; gap: 2px; }
.pm-statuspill .top { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 550; white-space: nowrap; }
.pm-statuspill .top.ok { color: var(--pm-green); }
.pm-statuspill .top.ban { color: var(--pm-red); }
.pm-statuspill .conseq { font-size: 11.5px; color: var(--pm-ink-4); white-space: nowrap; }

.pm-when .rel { font-size: 13px; color: var(--pm-ink); font-weight: 550; white-space: nowrap; }
.pm-when .abs { font-size: 11.5px; color: var(--pm-ink-4); margin-top: 1px; font-variant-numeric: tabular-nums; white-space: nowrap; }

.pm-ops { white-space: nowrap; }
.pm-btn-view {
  background: var(--pm-blue-soft); border: 1px solid #cfddf7;
  color: var(--pm-blue); font-weight: 550;
}
.pm-btn-view:hover, .pm-btn-view:focus { background: #e2ebfc; border-color: #b9cdf4; color: var(--pm-blue); }
.pm-op-danger { color: var(--pm-red) !important; }
.pm-op-calm { color: var(--pm-ink-3) !important; }

.pm-empty { padding: 32px 0; }

.pm-tablefoot {
  display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap;
  padding: 12px 16px; font-size: 12.5px; color: var(--pm-ink-3);
  border-top: 1px solid var(--pm-line);
}

/* ---------- 抽屉 ---------- */
.pm-drawer-shell {
  min-height: 420px;
  display: flex; flex-direction: column;
  background: #f6f7f9;
  height: 100%;
}

.pm-drawer-head {
  background: var(--pm-paper); border-bottom: 1px solid var(--pm-line);
  padding: 16px 20px 14px;
}
.pm-crumb { font-size: 12px; color: var(--pm-ink-4); margin-bottom: 10px; }

.pm-versus { display: grid; grid-template-columns: 1fr auto 1fr; gap: 10px; align-items: stretch; }
.pm-person {
  background: #f6f7f9; border: 1px solid var(--pm-line); border-radius: 9px;
  padding: 10px 12px; display: flex; align-items: center; gap: 10px; min-width: 0;
}
.pm-p-name { font-weight: 650; font-size: 14px; color: var(--pm-ink); }
.pm-p-info { font-size: 11.5px; color: var(--pm-ink-3); margin-top: 1px; font-variant-numeric: tabular-nums; }
.pm-vs-mid { display: grid; place-items: center; color: var(--pm-ink-4); font-size: 15px; }

.pm-state-banner {
  margin-top: 12px; border-radius: 8px; padding: 10px 14px;
  display: flex; align-items: center; gap: 9px; font-size: 13px;
}
.pm-state-banner.ban { background: var(--pm-red-soft); border: 1px solid #f0c9c7; }
.pm-state-banner.ban .t { color: var(--pm-red); font-weight: 650; }
.pm-state-banner.ban .c { color: #a2524f; }
.pm-state-banner.ok { background: #e9f7f1; border: 1px solid #c4e8d9; }
.pm-state-banner.ok .t { color: var(--pm-green); font-weight: 650; }
.pm-state-banner.ok .c { color: #4a7a66; }
.pm-state-banner .right { margin-left: auto; font-size: 12px; color: var(--pm-ink-3); font-variant-numeric: tabular-nums; white-space: nowrap; }

.pm-risk-banner {
  margin: 10px 20px 0; border-radius: 8px; padding: 9px 14px;
  background: var(--pm-amber-soft); border: 1px solid #eed9ae;
  font-size: 12.5px; color: #8a5d07;
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
}
.pm-risk-banner b { color: var(--pm-amber); }
.pm-risk-banner .kws { display: inline-flex; gap: 5px; margin-left: 4px; flex-wrap: wrap; }
.pm-risk-banner .kw {
  background: #fff; border: 1px solid #eed9ae; border-radius: 5px;
  padding: 1px 7px; font-size: 12px; color: var(--pm-amber); font-weight: 550;
}

.pm-msg-filter { display: flex; gap: 8px; padding: 12px 20px; }
.pm-msg-filter .el-input { flex: 1; }
.pm-msg-type { width: 104px; flex: none; }

.pm-msg-scroll { flex: 1; overflow-y: auto; padding: 6px 20px 20px; }

.pm-day-sep { text-align: center; margin: 16px 0 12px; }
.pm-day-sep span {
  font-size: 11.5px; color: var(--pm-ink-3);
  background: #e9ebef; border-radius: 999px; padding: 3px 12px;
}

/* 聊天气泡：左 = 第一位参与者，右 = 另一方 */
.pm-chat { display: flex; gap: 9px; margin-bottom: 14px; max-width: 86%; }
.pm-chat .pm-av { flex: none; }
.pm-col { min-width: 0; width: fit-content; max-width: 100%; }
.pm-who { display: flex; align-items: baseline; gap: 8px; margin-bottom: 4px; font-size: 11.5px; color: var(--pm-ink-3); }
.pm-who .name { font-weight: 600; color: var(--pm-ink-2); font-size: 12px; }

.pm-bubble {
  display: inline-block; width: fit-content; max-width: 100%;
  padding: 9px 13px; border-radius: 4px 12px 12px 12px;
  background: var(--pm-paper); border: 1px solid var(--pm-line);
  font-size: 13.5px; color: var(--pm-ink); white-space: pre-wrap; word-break: break-word;
}
.pm-bubble mark { background: var(--pm-amber-mark); color: inherit; border-radius: 3px; padding: 0 2px; }
.pm-bubble.media { padding: 6px; }
.pm-bubble.recalled {
  background: transparent; border: 1px dashed var(--pm-line-2); color: var(--pm-ink-4);
  font-size: 12.5px;
}

.pm-chat.me { margin-left: auto; flex-direction: row-reverse; }
.pm-chat.me .pm-who { flex-direction: row-reverse; }
.pm-chat.me .pm-col { text-align: right; }
.pm-chat.me .pm-bubble {
  border-radius: 12px 4px 12px 12px;
  background: #dcebff; border-color: #c4dbfc; text-align: left;
}
.pm-chat.me .pm-bubble.recalled { background: transparent; border-color: var(--pm-line-2); }

.pm-msg-meta { margin-top: 4px; font-size: 11px; color: var(--pm-ink-4); display: flex; gap: 10px; align-items: center; }
.pm-chat.me .pm-msg-meta { justify-content: flex-end; }
.pm-recall-btn {
  background: none; border: none; color: var(--pm-ink-4); font-size: 11px; cursor: pointer;
  opacity: 0; transition: opacity 120ms ease; font-family: inherit; padding: 0;
}
.pm-chat:hover .pm-recall-btn { opacity: 1; }
.pm-recall-btn:hover { color: var(--pm-red); }

/* 媒体 */
.pm-media-img {
  width: 200px; height: 140px; border-radius: 8px; display: block;
  border: 1px solid var(--pm-line); background: #eceef1;
}
.pm-media-video {
  width: 260px; max-width: 100%; border-radius: 8px; display: block; background: #1f2430;
}
.pm-media-audio { display: flex; align-items: center; gap: 10px; min-width: 190px; }
.pm-playbtn {
  width: 30px; height: 30px; border-radius: 50%; flex: none; cursor: pointer;
  border: 1px solid var(--pm-line-2); background: var(--pm-paper);
  display: grid; place-items: center;
}
.pm-wave { display: flex; align-items: center; gap: 2.5px; height: 24px; }
.pm-wave i { width: 2.5px; border-radius: 2px; background: var(--pm-ink-3); display: block; }
.pm-media-audio .dur { font-size: 12px; color: var(--pm-ink-3); }
.pm-media-audio audio { display: none; }

.pm-location, .pm-file, .pm-order { display: grid; gap: 3px; text-align: left; min-width: 200px; }
.pm-location strong, .pm-file strong { font-size: 13px; color: var(--pm-ink); }
.pm-location span, .pm-file span { font-size: 12px; color: var(--pm-ink-3); }
.pm-location em { font-size: 11.5px; color: var(--pm-ink-4); font-style: normal; font-variant-numeric: tabular-nums; }
.pm-file { text-decoration: none; }
.pm-file:hover strong { text-decoration: underline; text-underline-offset: 3px; }

.pm-note {
  display: block;
  width: 300px;
  max-width: 100%;
  overflow: hidden;
  border-radius: 8px;
  background: var(--pm-paper);
  color: var(--pm-ink);
  text-decoration: none;
  text-align: left;
}
.pm-note-cover {
  display: block;
  width: 100%;
  height: 150px;
  object-fit: cover;
  background: var(--pm-hover);
}
.pm-note-body { display: grid; gap: 6px; padding: 10px 11px; }
.pm-note-body > strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pm-note-body > span {
  display: -webkit-box;
  overflow: hidden;
  color: var(--pm-ink-3);
  font-size: 12px;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.pm-note-meta { display: flex; justify-content: space-between; gap: 12px; color: var(--pm-ink-3); font-size: 12px; }
.pm-note-meta em { color: var(--pm-blue); font-style: normal; font-weight: 650; }

.pm-order { width: 300px; max-width: 100%; }
.pm-order .o-head {
  display: flex; justify-content: space-between; align-items: center;
  padding-bottom: 7px; margin-bottom: 7px; border-bottom: 1px solid var(--pm-line);
  font-size: 12px;
}
.pm-order .o-type { font-weight: 650; }
.pm-order .o-status { color: var(--pm-green); font-weight: 550; }
.pm-order .o-title { font-size: 13.5px; font-weight: 600; color: var(--pm-ink); }
.pm-order .o-meta { margin-top: 4px; font-size: 12px; color: var(--pm-ink-3); display: grid; gap: 1px; font-variant-numeric: tabular-nums; }
.pm-order .o-summary { margin-top: 6px; font-size: 12px; color: var(--pm-ink-4); }

.pm-drawer-empty { flex: 1; display: grid; place-items: center; padding: 48px 0; }

/* 底部操作条 */
.pm-drawer-foot {
  background: var(--pm-paper);
  padding: 14px 20px; display: flex; align-items: center; gap: 12px;
}
.pm-btn-unban {
  background: var(--pm-green); border-color: var(--pm-green); color: #fff; font-weight: 600;
}
.pm-btn-unban:hover, .pm-btn-unban:focus { background: #188a5e; border-color: #188a5e; color: #fff; }
.pm-btn-ban {
  background: var(--pm-red); border-color: var(--pm-red); color: #fff; font-weight: 600;
}
.pm-btn-ban:hover, .pm-btn-ban:focus { background: #b92f2f; border-color: #b92f2f; color: #fff; }
.pm-drawer-foot .hint { font-size: 12px; color: var(--pm-ink-4); }
.pm-drawer-foot .close { margin-left: auto; }

@media (max-width: 960px) {
  .pm-kpis { grid-template-columns: repeat(2, 1fr); }
}

@media (max-width: 720px) {
  .page-shell { padding: 16px; }
  .pm-keyword, .pm-select, .pm-daterange { width: 100%; }
  .pm-table thead th:nth-child(3), .pm-table tbody td:nth-child(3),
  .pm-table thead th:nth-child(5), .pm-table tbody td:nth-child(5) { display: none; }
  .pm-versus { grid-template-columns: 1fr; }
  .pm-vs-mid { display: none; }
}
</style>

<!-- el-drawer 内容被 teleport 到 body，内部内边距覆盖需用非 scoped 全局块 -->
<style>
.pm-drawer .el-drawer__body { padding: 0; }
.pm-drawer .el-drawer__footer { padding: 0; border-top: 1px solid #e6e8ec; }
</style>
