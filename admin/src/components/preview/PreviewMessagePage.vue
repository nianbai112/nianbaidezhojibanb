<template>
  <div class="preview-message-page">
    <!-- 消息导航卡片 -->
    <div v-if="messageNavigationCards.length > 0" class="navigation-cards">
      <div v-for="(card, index) in messageNavigationCards" :key="index" class="nav-card" @click="$emit('handleCardAction', card)">
        <div class="card-icon" :style="getCardIconStyle(card)">
          <svg v-if="card.type === 'icon'" class="icon" viewBox="0 0 24 24" fill="currentColor">
            <path :d="getCardIconPath(card.icon)"/>
          </svg>
          <img v-else-if="card.type === 'img' && card.img" :src="card.img" alt="icon" />
        </div>
        <div class="card-content">
          <div class="card-title">{{ card.title?.text || '系统通知' }}</div>
          <div class="card-desc">{{ card.description?.text || '查看系统消息和通知' }}</div>
        </div>
        <div class="card-action">
          <span>{{ card.shortText?.text || '查看' }}</span>
          <svg class="arrow" viewBox="0 0 24 24" fill="currentColor">
            <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
          </svg>
        </div>
      </div>
    </div>

    <!-- 默认导航卡片 -->
    <div v-else class="navigation-cards">
      <div class="nav-card" @click="$emit('handleCardAction', { action: { type: 'internal', url: '/pagesA/news/SystemNotification/SystemNotification' } })">
        <div class="card-icon" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%)">
          <svg class="icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
          </svg>
        </div>
        <div class="card-content">
          <div class="card-title">系统通知</div>
          <div class="card-desc">查看系统消息和通知</div>
        </div>
        <div class="card-action">
          <span>查看</span>
          <svg class="arrow" viewBox="0 0 24 24" fill="currentColor">
            <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
          </svg>
        </div>
      </div>
    </div>

    <!-- 消息 Tabs -->
    <div class="message-tabs">
      <div
        v-for="(tab, index) in messageTabs"
        :key="index"
        class="tab-item"
        :class="{ active: currentTab === index }"
        @click="currentTab = index"
      >
        <span class="tab-name">{{ tab.name }}</span>
        <span v-if="tab.unread > 0" class="tab-badge">{{ tab.unread > 99 ? '99+' : tab.unread }}</span>
      </div>
    </div>

    <!-- 消息列表 -->
    <div class="message-list">
      <!-- 系统/聊天 -->
      <template v-if="currentTab === 0">
        <div v-for="(msg, index) in systemMessages" :key="index" class="message-item" :class="{ unread: msg.unread }">
          <div class="msg-avatar" :style="{ background: msg.avatarBg }">
            <span class="avatar-text">{{ msg.name.charAt(0) }}</span>
            <span v-if="msg.unread" class="unread-dot"></span>
          </div>
          <div class="msg-content">
            <div class="msg-header">
              <span class="msg-name">{{ msg.name }}</span>
              <span class="msg-time">{{ msg.time }}</span>
            </div>
            <div class="msg-preview">{{ msg.preview }}</div>
          </div>
        </div>
      </template>

      <!-- 评论/回复 -->
      <template v-if="currentTab === 1">
        <div v-for="(msg, index) in commentMessages" :key="index" class="message-item" :class="{ unread: msg.unread }">
          <div class="msg-avatar" :style="{ background: msg.avatarBg }">
            <span class="avatar-text">{{ msg.name.charAt(0) }}</span>
            <span v-if="msg.unread" class="unread-dot"></span>
          </div>
          <div class="msg-content">
            <div class="msg-header">
              <span class="msg-name">{{ msg.name }}</span>
              <span class="msg-time">{{ msg.time }}</span>
            </div>
            <div class="msg-preview">{{ msg.action }}</div>
            <div class="msg-post" v-if="msg.postTitle">
              <span class="post-tag">笔记</span>
              <span class="post-title">{{ msg.postTitle }}</span>
            </div>
          </div>
        </div>
      </template>

      <!-- 喜欢 -->
      <template v-if="currentTab === 2">
        <div v-for="(msg, index) in likeMessages" :key="index" class="message-item" :class="{ unread: msg.unread }">
          <div class="msg-avatar" :style="{ background: msg.avatarBg }">
            <span class="avatar-text">{{ msg.name.charAt(0) }}</span>
            <span v-if="msg.unread" class="unread-dot"></span>
          </div>
          <div class="msg-content">
            <div class="msg-header">
              <span class="msg-name">{{ msg.name }}</span>
              <span class="msg-time">{{ msg.time }}</span>
            </div>
            <div class="msg-preview">{{ msg.action }}</div>
          </div>
        </div>
      </template>

      <!-- 关注 -->
      <template v-if="currentTab === 3">
        <div v-for="(msg, index) in followMessages" :key="index" class="message-item" :class="{ unread: msg.unread }">
          <div class="msg-avatar" :style="{ background: msg.avatarBg }">
            <span class="avatar-text">{{ msg.name.charAt(0) }}</span>
            <span v-if="msg.unread" class="unread-dot"></span>
          </div>
          <div class="msg-content">
            <div class="msg-header">
              <span class="msg-name">{{ msg.name }}</span>
              <span class="msg-time">{{ msg.time }}</span>
            </div>
            <div class="msg-preview">{{ msg.action }}</div>
          </div>
        </div>
      </template>

      <!-- 蹲一蹲 -->
      <template v-if="currentTab === 4">
        <div v-for="(msg, index) in squatMessages" :key="index" class="message-item" :class="{ unread: msg.unread }">
          <div class="msg-avatar" :style="{ background: msg.avatarBg }">
            <span class="avatar-text">{{ msg.name.charAt(0) }}</span>
            <span v-if="msg.unread" class="unread-dot"></span>
          </div>
          <div class="msg-content">
            <div class="msg-header">
              <span class="msg-name">{{ msg.name }}</span>
              <span class="msg-time">{{ msg.time }}</span>
            </div>
            <div class="msg-preview">{{ msg.action }}</div>
          </div>
        </div>
      </template>

      <!-- 空状态 -->
      <div v-if="currentMessages.length === 0" class="empty-state">
        <svg class="empty-icon" viewBox="0 0 24 24" fill="currentColor">
          <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/>
        </svg>
        <span class="empty-text">暂无{{ messageTabs[currentTab]?.name || '消息' }}</span>
        <span class="empty-hint">{{ emptyHints[currentTab] || '暂无相关内容' }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  messagePageLayout?: string
  privateMessageEnabled?: boolean
  messageNavigationCards?: any[]
}>()

const emit = defineEmits(['handleCardAction'])

const currentTab = ref(0)

const messageTabs = computed(() => [
  { name: '系统/聊天', type: 'system', unread: 2 },
  { name: '评论/回复', type: 'comment', unread: 3 },
  { name: '喜欢', type: 'like', unread: 5 },
  { name: '关注', type: 'follow', unread: 1 },
  { name: '蹲一蹲', type: 'squat', unread: 0 }
])

const emptyHints = [
  '系统暂时没有新消息通知',
  '分享更多内容获取评论',
  '分享更多内容获取点赞',
  '多关注感兴趣的用户',
  '分享更多内容获取蹲一蹲'
]

// 稳定的系统消息数据
const systemMessages = computed(() => [
  { name: '系统通知', time: '刚刚', preview: '欢迎使用灵萌圈友！有任何问题可以随时联系我们。', unread: true, avatarBg: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
  { name: '小萌客服', time: '10分钟前', preview: '有什么问题可以随时联系我们哦~', unread: true, avatarBg: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)' },
  { name: '活动通知', time: '2小时前', preview: '您报名的活动「周末爬山」即将开始，请准时参加。', unread: false, avatarBg: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' }
])

// 稳定的评论消息数据
const commentMessages = computed(() => [
  { name: '用户A', time: '5分钟前', action: '评论了你的笔记', postTitle: '今天的校园生活也太精彩了', unread: true, avatarBg: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' },
  { name: '用户B', time: '1小时前', action: '回复了你的评论', postTitle: '求推荐：附近好吃的外卖', unread: true, avatarBg: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)' },
  { name: '用户C', time: '2小时前', action: '评论了你的笔记', postTitle: '二手教材转让', unread: false, avatarBg: 'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)' }
])

// 稳定的点赞消息数据
const likeMessages = computed(() => [
  { name: '用户D', time: '3分钟前', action: '赞了你的笔记', unread: true, avatarBg: 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)' },
  { name: '用户E', time: '30分钟前', action: '赞了你的笔记', unread: true, avatarBg: 'linear-gradient(135deg, #a1c4fd 0%, #c2e9fb 100%)' },
  { name: '用户F', time: '2小时前', action: '赞了你的评论', unread: false, avatarBg: 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)' },
  { name: '用户G', time: '3小时前', action: '赞了你的笔记', unread: false, avatarBg: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
  { name: '用户H', time: '5小时前', action: '赞了你的笔记', unread: false, avatarBg: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)' }
])

// 稳定的关注消息数据
const followMessages = computed(() => [
  { name: '用户I', time: '10分钟前', action: '关注了你', unread: true, avatarBg: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' },
  { name: '用户J', time: '1小时前', action: '关注了你', unread: false, avatarBg: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' }
])

// 稳定的蹲一蹲消息数据
const squatMessages = computed(() => [
  { name: '用户K', time: '30分钟前', action: '蹲一蹲了你的笔记', unread: false, avatarBg: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)' }
])

// 当前消息列表
const currentMessages = computed(() => {
  switch (currentTab.value) {
    case 0: return systemMessages.value
    case 1: return commentMessages.value
    case 2: return likeMessages.value
    case 3: return followMessages.value
    case 4: return squatMessages.value
    default: return []
  }
})

// 获取卡片图标样式
const getCardIconStyle = (card: any) => {
  if (card.backgroundColor) {
    return { background: card.backgroundColor }
  }
  return { background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }
}

// 获取卡片图标路径
const getCardIconPath = (icon: string) => {
  const iconMap: Record<string, string> = {
    'icon-tongzhi': 'M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z',
    'icon-xiaoxi': 'M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z',
    'icon-dianzan': 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z',
    'icon-guanzhu': 'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z'
  }
  return iconMap[icon] || 'M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z'
}
</script>

<style scoped>
.preview-message-page {
  min-height: 100%;
  background: #f5f5f5;
}

/* 导航卡片 */
.navigation-cards {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.nav-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px;
  border-radius: 12px;
  background: #ffffff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  cursor: pointer;
  transition: all 0.2s;
}

.nav-card:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.card-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}

.card-icon .icon {
  width: 24px;
  height: 24px;
  color: #ffffff;
}

.card-icon img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.card-content {
  flex: 1;
  min-width: 0;
}

.card-title {
  font-size: 14px;
  font-weight: 600;
  color: #333;
  margin-bottom: 2px;
}

.card-desc {
  font-size: 12px;
  color: #999;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-action {
  display: flex;
  align-items: center;
  gap: 2px;
  font-size: 12px;
  color: #999;
  flex-shrink: 0;
}

.arrow {
  width: 16px;
  height: 16px;
}

/* 消息 Tabs */
.message-tabs {
  display: flex;
  background: #ffffff;
  padding: 0 12px;
  border-bottom: 0.5px solid #e5e5e5;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  position: sticky;
  top: 0;
  z-index: 10;
}

.message-tabs::-webkit-scrollbar {
  display: none;
}

.tab-item {
  flex-shrink: 0;
  padding: 14px 14px;
  display: flex;
  align-items: center;
  gap: 4px;
  position: relative;
  cursor: pointer;
  transition: all 0.2s;
}

.tab-name {
  font-size: 13px;
  color: #666;
  white-space: nowrap;
}

.tab-item.active .tab-name {
  color: #333;
  font-weight: 600;
}

.tab-item.active::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 20px;
  height: 3px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 2px;
}

.tab-badge {
  padding: 1px 5px;
  background: #ef4444;
  color: #ffffff;
  font-size: 10px;
  font-weight: 600;
  border-radius: 10px;
  min-width: 16px;
  text-align: center;
}

/* 消息列表 */
.message-list {
  background: #ffffff;
}

.message-item {
  display: flex;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 0.5px solid #f0f0f0;
  cursor: pointer;
  transition: background 0.2s;
}

.message-item:hover {
  background: #f8f9fa;
}

.message-item.unread {
  background: #f0f7ff;
}

.msg-avatar {
  position: relative;
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.avatar-text {
  font-size: 16px;
  font-weight: 600;
  color: #ffffff;
}

.unread-dot {
  position: absolute;
  top: 0;
  right: 0;
  width: 10px;
  height: 10px;
  background: #ef4444;
  border-radius: 50%;
  border: 2px solid #ffffff;
}

.msg-content {
  flex: 1;
  min-width: 0;
}

.msg-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.msg-name {
  font-size: 14px;
  font-weight: 500;
  color: #333;
}

.msg-time {
  font-size: 12px;
  color: #999;
  flex-shrink: 0;
}

.msg-preview {
  font-size: 13px;
  color: #666;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-bottom: 4px;
}

.msg-post {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  background: #f5f5f5;
  border-radius: 6px;
  margin-top: 6px;
}

.post-tag {
  padding: 1px 4px;
  background: #e0e7ff;
  color: #6366f1;
  font-size: 10px;
  border-radius: 3px;
}

.post-title {
  font-size: 12px;
  color: #666;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
}

.empty-icon {
  width: 64px;
  height: 64px;
  color: #d1d5db;
  margin-bottom: 16px;
}

.empty-text {
  font-size: 16px;
  font-weight: 500;
  color: #6b7280;
  margin-bottom: 8px;
}

.empty-hint {
  font-size: 13px;
  color: #9ca3af;
}
</style>
