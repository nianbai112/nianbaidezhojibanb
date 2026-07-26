<template>
  <div class="preview-share-card">
    <!-- 微信分享弹窗 -->
    <div class="wechat-share-modal">
      <div class="modal-header">
        <span class="modal-title">发送给朋友</span>
        <svg class="close-icon" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
        </svg>
      </div>

      <!-- 搜索好友 -->
      <div class="search-friend">
        <svg class="search-icon" viewBox="0 0 24 24" fill="currentColor">
          <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
        </svg>
        <span>搜索</span>
      </div>

      <!-- 最近聊天 -->
      <div class="recent-chats">
        <div class="section-title">最近聊天</div>
        <div class="chat-list">
          <div v-for="(chat, index) in recentChats" :key="index" class="chat-item">
            <div class="chat-avatar" :style="{ background: chat.avatarBg }">
              <span>{{ chat.name.charAt(0) }}</span>
            </div>
            <span class="chat-name">{{ chat.name }}</span>
          </div>
        </div>
      </div>

      <!-- 分享卡片 -->
      <div class="share-card-container">
        <div class="card-header">
          <div class="mini-program-info">
            <div class="program-avatar">
              <img v-if="regionLogo" :src="regionLogo" alt="logo" />
              <span v-else class="avatar-text">{{ regionName?.charAt(0) || '灵' }}</span>
            </div>
            <div class="program-name">{{ regionName || '灵萌圈友' }}</div>
          </div>
          <div class="wechat-badge">
            <svg class="wechat-icon" viewBox="0 0 24 24" fill="#07c160">
              <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 01.213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 00.167-.054l1.903-1.114a.864.864 0 01.717-.098 10.16 10.16 0 002.837.403c.276 0 .543-.027.811-.05a6.127 6.127 0 01-.253-1.736c0-3.54 3.28-6.41 7.326-6.41.18 0 .354.014.53.025-.838-3.2-4.153-5.461-8.04-5.461zM12.503 16.13c-3.404 0-6.162-2.354-6.162-5.26 0-2.905 2.758-5.26 6.162-5.26 3.404 0 6.162 2.355 6.162 5.26 0 2.906-2.758 5.26-6.162 5.26zm-2.846-3.474c-.497 0-.9-.403-.9-.9s.403-.9.9-.9.9.403.9.9-.403.9-.9.9zm5.692 0c-.497 0-.9-.403-.9-.9s.403-.9.9-.9.9.403.9.9-.403.9-.9.9z"/>
            </svg>
          </div>
        </div>

        <div class="card-content">
          <div class="share-title">{{ shareTitle || '欢迎来到' + (regionName || '灵萌圈友') }}</div>
          <div v-if="shareDescription" class="share-description">{{ shareDescription }}</div>
        </div>

        <div v-if="shareImage" class="card-image">
          <img :src="shareImage" alt="分享图片" />
        </div>
        <div v-else class="card-image-placeholder">
          <svg class="placeholder-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
          </svg>
        </div>

        <div class="card-footer">
          <div class="footer-left">
            <svg class="mini-logo" viewBox="0 0 24 24" fill="#07c160">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
            </svg>
            <span>小程序</span>
          </div>
          <div class="footer-arrow">
            <svg viewBox="0 0 24 24" fill="#999">
              <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
            </svg>
          </div>
        </div>
      </div>

      <!-- 创建新聊天 -->
      <div class="create-chat">
        <div class="create-icon">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
          </svg>
        </div>
        <span>创建新聊天</span>
      </div>
    </div>

    <!-- 分享类型标签 -->
    <div class="share-type-tags">
      <div class="tag" :class="{ active: shareType === 'friend' }">发送给朋友</div>
      <div class="tag" :class="{ active: shareType === 'moments' }">分享到朋友圈</div>
    </div>

    <!-- 朋友圈预览 -->
    <div v-if="shareType === 'moments'" class="moments-preview">
      <div class="moments-header">
        <div class="moments-avatar">
          <img v-if="userAvatar" :src="userAvatar" alt="avatar" />
          <span v-else class="avatar-text">我</span>
        </div>
        <div class="moments-info">
          <span class="moments-name">{{ userName || '我' }}</span>
          <span class="moments-text">{{ momentsTitle || shareTitle || '分享了一条内容' }}</span>
        </div>
      </div>
      <div v-if="momentsImage || shareImage" class="moments-image">
        <img :src="momentsImage || shareImage" alt="朋友圈图片" />
      </div>
      <div class="moments-time">1分钟前</div>
      <div class="moments-actions">
        <div class="action-btn">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
          </svg>
        </div>
        <div class="action-btn">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M21.99 4c0-1.1-.89-2-1.99-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4-.01-18z"/>
          </svg>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  regionName?: string
  regionLogo?: string
  shareTitle?: string
  shareDescription?: string
  shareImage?: string
  shareType?: string
  momentsTitle?: string
  momentsImage?: string
  userAvatar?: string
  userName?: string
}>()

const shareType = computed(() => props.shareType || 'friend')

// 稳定的最近聊天数据
const recentChats = [
  { name: '文件传输助手', avatarBg: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
  { name: '小明', avatarBg: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' },
  { name: '校园群', avatarBg: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)' },
  { name: '小红', avatarBg: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' },
  { name: '学习小组', avatarBg: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)' }
]
</script>

<style scoped>
.preview-share-card {
  padding: 16px;
  background: #f5f5f5;
  min-height: 100%;
}

/* 微信分享弹窗 */
.wechat-share-modal {
  background: #ffffff;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 0.5px solid #e5e5e5;
}

.modal-title {
  font-size: 16px;
  font-weight: 600;
  color: #333;
}

.close-icon {
  width: 20px;
  height: 20px;
  color: #999;
}

.search-friend {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 12px 16px;
  padding: 10px 12px;
  background: #f5f5f5;
  border-radius: 8px;
}

.search-icon {
  width: 16px;
  height: 16px;
  color: #999;
}

.search-friend span {
  font-size: 14px;
  color: #999;
}

.recent-chats {
  padding: 0 16px;
}

.section-title {
  font-size: 12px;
  color: #999;
  margin-bottom: 10px;
}

.chat-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 16px;
}

.chat-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
}

.chat-avatar {
  width: 40px;
  height: 40px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.chat-avatar span {
  font-size: 14px;
  font-weight: 600;
  color: #ffffff;
}

.chat-name {
  font-size: 14px;
  color: #333;
}

/* 分享卡片 */
.share-card-container {
  margin: 0 16px 16px;
  background: #ffffff;
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
}

.mini-program-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.program-avatar {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.program-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-text {
  font-size: 14px;
  font-weight: 600;
  color: #ffffff;
}

.program-name {
  font-size: 13px;
  font-weight: 500;
  color: #333;
}

.wechat-badge {
  display: flex;
  align-items: center;
}

.wechat-icon {
  width: 18px;
  height: 18px;
}

.card-content {
  padding: 0 12px 10px;
}

.share-title {
  font-size: 14px;
  font-weight: 500;
  color: #333;
  line-height: 1.4;
  margin-bottom: 4px;
}

.share-description {
  font-size: 12px;
  color: #999;
  line-height: 1.4;
}

.card-image {
  margin: 0 12px 10px;
  border-radius: 6px;
  overflow: hidden;
}

.card-image img {
  width: 100%;
  height: auto;
  display: block;
}

.card-image-placeholder {
  margin: 0 12px 10px;
  height: 100px;
  background: linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.placeholder-icon {
  width: 32px;
  height: 32px;
  color: #6366f1;
}

.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  border-top: 0.5px solid #f0f0f0;
}

.footer-left {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #999;
}

.mini-logo {
  width: 14px;
  height: 14px;
}

.footer-arrow svg {
  width: 14px;
  height: 14px;
}

.create-chat {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-top: 0.5px solid #e5e5e5;
}

.create-icon {
  width: 40px;
  height: 40px;
  border-radius: 6px;
  background: #f5f5f5;
  display: flex;
  align-items: center;
  justify-content: center;
}

.create-icon svg {
  width: 20px;
  height: 20px;
  color: #999;
}

.create-chat span {
  font-size: 14px;
  color: #333;
}

/* 分享类型标签 */
.share-type-tags {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-top: 16px;
}

.tag {
  padding: 8px 16px;
  background: #ffffff;
  border-radius: 20px;
  font-size: 13px;
  color: #666;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.tag.active {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #ffffff;
}

/* 朋友圈预览 */
.moments-preview {
  margin-top: 16px;
  background: #ffffff;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
}

.moments-header {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
}

.moments-avatar {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}

.moments-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.moments-info {
  flex: 1;
}

.moments-name {
  font-size: 14px;
  font-weight: 600;
  color: #333;
  display: block;
  margin-bottom: 4px;
}

.moments-text {
  font-size: 13px;
  color: #666;
}

.moments-image {
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: 12px;
}

.moments-image img {
  width: 100%;
  height: auto;
  display: block;
}

.moments-time {
  font-size: 12px;
  color: #999;
  margin-bottom: 12px;
}

.moments-actions {
  display: flex;
  gap: 16px;
}

.action-btn {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #f5f5f5;
  display: flex;
  align-items: center;
  justify-content: center;
}

.action-btn svg {
  width: 16px;
  height: 16px;
  color: #666;
}
</style>
