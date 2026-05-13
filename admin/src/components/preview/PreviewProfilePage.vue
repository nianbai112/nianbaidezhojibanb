<template>
  <div class="preview-profile-page">
    <!-- 用户头部 -->
    <div class="profile-header">
      <div class="header-bg" :style="headerBgStyle"></div>
      <div class="header-actions">
        <svg class="action-icon" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
        </svg>
        <svg class="action-icon" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
        </svg>
      </div>
      <div class="user-section">
        <div class="user-avatar">
          <img v-if="userInfo?.avatar" :src="userInfo.avatar" alt="avatar" />
          <span v-else class="avatar-text">{{ userInfo?.nickname?.charAt(0) || '用' }}</span>
        </div>
        <div class="user-info">
          <div class="user-name">{{ userInfo?.nickname || '用户昵称' }}</div>
          <div class="user-id">ID: {{ userInfo?.id || '100001' }}</div>
        </div>
      </div>
      <div class="user-bio">{{ userInfo?.bio || '添加个人简介，让大家认识你...' }}</div>
    </div>

    <!-- 数据栏 -->
    <div class="stats-bar">
      <div class="stat-item" @click="$emit('navigateTo', 'follow', 0)">
        <span class="stat-value">{{ userInfo?.following_count || 0 }}</span>
        <span class="stat-label">关注</span>
      </div>
      <div class="stat-item" @click="$emit('navigateTo', 'follow', 1)">
        <span class="stat-value">{{ userInfo?.follower_count || 0 }}</span>
        <span class="stat-label">粉丝</span>
      </div>
      <div class="stat-item">
        <span class="stat-value">{{ userInfo?.total_like_count || 0 }}</span>
        <span class="stat-label">获赞</span>
      </div>
      <div class="stat-item" @click="$emit('navigateTo', 'squat')">
        <span class="stat-value">{{ userInfo?.squat_count || 0 }}</span>
        <span class="stat-label">蹲一蹲</span>
      </div>
    </div>

    <!-- 功能入口 -->
    <div class="function-grid">
      <div v-for="(item, index) in displayLayoutItems" :key="index" class="function-item" @click="$emit('navigateTo', item.url)">
        <div class="item-icon" :style="getItemStyle(item, index)">
          <img v-if="item.main_image" :src="item.main_image" :alt="item.title" />
          <svg v-else class="default-icon" viewBox="0 0 24 24" fill="currentColor">
            <path :d="getItemIconPath(index)"/>
          </svg>
        </div>
        <span class="item-title">{{ item.title }}</span>
      </div>
    </div>

    <!-- 内容 Tabs -->
    <div class="content-tabs">
      <div
        v-for="(tab, index) in contentTabs"
        :key="index"
        class="tab-item"
        :class="{ active: currentTabIndex === index }"
        @click="currentTabIndex = index"
      >
        {{ tab }}
      </div>
    </div>

    <!-- 内容列表 -->
    <div class="content-list">
      <div v-for="(post, index) in contentListData" :key="index" class="content-card">
        <div class="card-cover" :style="{ background: post.coverBg }"></div>
        <div class="card-info">
          <div class="card-title">{{ post.title }}</div>
          <div class="card-meta">
            <div class="user-mini">
              <div class="mini-avatar" :style="{ background: post.avatarBg }"></div>
              <span>{{ post.author }}</span>
            </div>
            <span class="likes">{{ post.likes }} 赞</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 空状态提示 -->
    <div v-if="contentListData.length === 0" class="empty-tip">
      <svg class="empty-icon" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
      </svg>
      <span>发笔记，记录灵感日常</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  profilePageLayout?: string
  userInfo?: any
  layoutItems?: any[]
}>()

const emit = defineEmits(['navigateTo'])

const currentTabIndex = ref(0)
const contentTabs = ['笔记', '赞过', '看过', '我的评论']

// 头部背景样式
const headerBgStyle = computed(() => {
  if (props.userInfo?.background_url) {
    return { backgroundImage: `url(${props.userInfo.background_url})`, backgroundSize: 'cover' }
  }
  return { background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }
})

// 默认功能入口
const defaultLayoutItems = [
  { title: '我的订单', url: 'order/index', main_image: '' },
  { title: '钱包', url: 'wallet/balance', main_image: '' },
  { title: '认证', url: 'certification', main_image: '' },
  { title: '商家入驻', url: 'merchant/management', main_image: '' },
  { title: '骑手中心', url: 'rider/center', main_image: '' },
  { title: '分享赚钱', url: 'center/share', main_image: '' },
  { title: '设置', url: 'setting/index', main_image: '' }
]

// 显示的功能入口
const displayLayoutItems = computed(() => {
  return props.layoutItems?.length ? props.layoutItems : defaultLayoutItems
})

// 获取入口图标样式
const getItemStyle = (item: any, index: number) => {
  const colors = [
    'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
    'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
    'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
    'linear-gradient(135deg, #fccb90 0%, #d57eeb 100%)',
    'linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)',
  ]
  if (item.main_image) {
    return { backgroundImage: `url(${item.main_image})`, backgroundSize: 'cover' }
  }
  return { background: colors[index % colors.length] }
}

// 获取入口图标路径
const getItemIconPath = (index: number) => {
  const paths = [
    'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 13H7v-2h10v2z', // 订单
    'M21 18v1c0 1.1-.9 2-2 2H5c-1.11 0-2-.9-2-2V5c0-1.1.89-2 2-2h14c1.1 0 2 .9 2 2v1h-9c-1.11 0-2 .9-2 2v8c0 1.1.89 2 2 2h9zm-9-2h10V8H12v8zm4-2.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z', // 钱包
    'M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z', // 认证
    'M12 7V3H2v18h20V7H12zM6 19H4v-2h2v2zm0-4H4v-2h2v2zm0-4H4V9h2v2zm0-4H4V5h2v2zm4 12H8v-2h2v2zm0-4H8v-2h2v2zm0-4H8V9h2v2zm0-4H8V5h2v2zm10 12h-8v-2h2v-2h-2v-2h2v-2h-2V9h8v10zm-2-8h-2v2h2v-2zm0 4h-2v2h2v-2z', // 商家
    'M20 8h-3V4H3c-1.1 0-2 .9-2 2v11h2c0 1.66 1.34 3 3 3s3-1.34 3-3h6c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-4zM6 18.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm13.5-9l1.96 2.5H17V9.5h2.5zm-1.5 9c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z', // 骑手
    'M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z', // 分享
    'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z', // 设置
  ]
  return paths[index] || paths[0]
}

// 稳定的内容列表数据
const contentListData = computed(() => [
  {
    title: '今天的校园生活也太精彩了',
    author: '我',
    likes: 128,
    coverBg: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    avatarBg: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)'
  },
  {
    title: '分享一下我的学习笔记',
    author: '我',
    likes: 256,
    coverBg: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    avatarBg: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)'
  },
  {
    title: '推荐一家超好吃的餐厅',
    author: '我',
    likes: 64,
    coverBg: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
    avatarBg: 'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)'
  },
  {
    title: '周末活动照片分享',
    author: '我',
    likes: 512,
    coverBg: 'linear-gradient(135deg, #a1c4fd 0%, #c2e9fb 100%)',
    avatarBg: 'linear-gradient(135deg, #fccb90 0%, #d57eeb 100%)'
  }
])
</script>

<style scoped>
.preview-profile-page {
  min-height: 100%;
  background: #f5f5f5;
}

/* 用户头部 */
.profile-header {
  position: relative;
  padding: 20px 16px 16px;
  overflow: hidden;
}

.header-bg {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.header-actions {
  position: relative;
  display: flex;
  justify-content: flex-end;
  gap: 16px;
  margin-bottom: 16px;
}

.action-icon {
  width: 24px;
  height: 24px;
  color: #ffffff;
}

.user-section {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.user-avatar {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
  border: 3px solid #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.user-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-text {
  font-size: 24px;
  font-weight: 600;
  color: #ffffff;
}

.user-info {
  flex: 1;
}

.user-name {
  font-size: 18px;
  font-weight: 700;
  color: #ffffff;
  margin-bottom: 2px;
}

.user-id {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
}

.user-bio {
  position: relative;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.9);
  line-height: 1.5;
  padding: 4px 0;
}

/* 数据栏 */
.stats-bar {
  display: flex;
  justify-content: space-around;
  padding: 16px;
  background: #ffffff;
  margin-top: 8px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  cursor: pointer;
}

.stat-value {
  font-size: 18px;
  font-weight: 700;
  color: #333;
}

.stat-label {
  font-size: 12px;
  color: #999;
}

/* 功能入口 */
.function-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  padding: 20px 16px;
  background: #ffffff;
  margin-top: 8px;
}

.function-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.item-icon {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.item-icon img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.default-icon {
  width: 24px;
  height: 24px;
  color: #ffffff;
}

.item-title {
  font-size: 12px;
  color: #333;
  text-align: center;
}

/* 内容 Tabs */
.content-tabs {
  display: flex;
  background: #ffffff;
  margin-top: 8px;
  border-bottom: 0.5px solid #e5e5e5;
  position: sticky;
  top: 0;
  z-index: 10;
}

.tab-item {
  flex: 1;
  padding: 14px 0;
  text-align: center;
  font-size: 14px;
  color: #666;
  position: relative;
  cursor: pointer;
  transition: all 0.2s;
}

.tab-item.active {
  color: #333;
  font-weight: 600;
}

.tab-item.active::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 24px;
  height: 3px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 2px;
}

/* 内容列表 */
.content-list {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  padding: 8px;
}

.content-card {
  background: #ffffff;
  border-radius: 12px;
  overflow: hidden;
}

.card-cover {
  aspect-ratio: 4/3;
}

.card-info {
  padding: 10px;
}

.card-title {
  font-size: 13px;
  font-weight: 500;
  color: #333;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-bottom: 8px;
}

.card-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.user-mini {
  display: flex;
  align-items: center;
  gap: 6px;
}

.mini-avatar {
  width: 20px;
  height: 20px;
  border-radius: 50%;
}

.user-mini span {
  font-size: 11px;
  color: #999;
}

.likes {
  font-size: 11px;
  color: #999;
}

/* 空状态提示 */
.empty-tip {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  text-align: center;
  gap: 12px;
}

.empty-icon {
  width: 48px;
  height: 48px;
  color: #d1d5db;
}

.empty-tip span {
  font-size: 14px;
  color: #999;
}
</style>
