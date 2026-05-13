<template>
  <div class="preview-home-page">
    <!-- 区域头部 -->
    <div class="region-header">
      <div class="header-bg" :style="regionBgStyle"></div>
      <div class="header-content">
        <div class="region-logo">
          <img v-if="region?.logo" :src="region.logo" alt="logo" />
          <span v-else class="logo-text">{{ region?.name?.charAt(0) || '灵' }}</span>
        </div>
        <div class="region-name">{{ region?.name || '灵萌圈友' }}</div>
        <div class="header-actions">
          <svg class="action-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
          </svg>
        </div>
      </div>
    </div>

    <!-- 搜索栏 -->
    <div class="search-bar" @click="$emit('goToSearch')">
      <div class="search-input">
        <svg class="search-icon" viewBox="0 0 24 24" fill="currentColor">
          <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
        </svg>
        <span>搜索内容、用户、商家</span>
      </div>
    </div>

    <!-- 轮播图 -->
    <div v-if="showCarousel && carouselImages.length > 0" class="carousel-section">
      <div class="carousel-wrapper">
        <div class="carousel-track" :style="{ transform: `translateX(-${currentCarouselIndex * 100}%)` }">
          <div v-for="(img, index) in carouselImages" :key="index" class="carousel-slide">
            <img :src="img" :alt="`轮播图 ${index + 1}`" />
          </div>
        </div>
        <div v-if="carouselImages.length > 1" class="carousel-indicators">
          <div
            v-for="(_, index) in carouselImages"
            :key="index"
            class="indicator"
            :class="{ active: index === currentCarouselIndex }"
          ></div>
        </div>
      </div>
    </div>
    <div v-else-if="showCarousel" class="carousel-section">
      <div class="carousel-placeholder">
        <svg class="placeholder-icon" viewBox="0 0 24 24" fill="currentColor">
          <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
        </svg>
        <span>轮播图区域</span>
      </div>
    </div>

    <!-- 公告 -->
    <div v-if="showAnnouncement" class="announcement-section">
      <div class="announcement-box">
        <svg class="announcement-icon" viewBox="0 0 24 24" fill="currentColor">
          <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-7 9h-2V5h2v6zm0 4h-2v-2h2v2z"/>
        </svg>
        <span class="announcement-text">{{ announcementText || '欢迎使用灵萌圈友，发现精彩校园生活！' }}</span>
        <svg class="arrow-icon" viewBox="0 0 24 24" fill="currentColor">
          <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
        </svg>
      </div>
    </div>

    <!-- 金刚区/快捷入口 -->
    <div v-if="showKingkong" class="kingkong-section">
      <div class="kingkong-grid">
        <div v-for="(item, index) in displayNavItems" :key="index" class="kingkong-item" @click="$emit('navigateTo', item)">
          <div class="kingkong-icon" :style="getIconStyle(item, index)">
            <img v-if="item.icon" :src="item.icon" :alt="item.name" />
            <svg v-else class="default-icon" viewBox="0 0 24 24" fill="currentColor">
              <path :d="getDefaultIconPath(index)"/>
            </svg>
          </div>
          <span class="kingkong-name">{{ item.name || getDefaultNavName(index) }}</span>
        </div>
      </div>
    </div>

    <!-- 首页 Tabs -->
    <div v-if="enabledTabs.length > 0" class="tabs-section">
      <div class="tabs-scroll">
        <div
          v-for="(tab, index) in enabledTabs"
          :key="index"
          class="tab-item"
          :class="{ active: currentTabIndex === index }"
          @click="currentTabIndex = index"
        >
          <span class="tab-icon" :class="{ 'has-image': !!tab.icon }">
            <img v-if="tab.icon" :src="tab.icon" :alt="tab.name" />
            <svg v-else viewBox="0 0 24 24" fill="currentColor">
              <path :d="getTabIconPath(tab.type, index)" />
            </svg>
          </span>
          <span class="tab-name">{{ tab.name }}</span>
          <span v-if="tab.linkType && tab.linkType !== 'filter'" class="tab-link-dot"></span>
        </div>
      </div>
      <div v-if="activeTabCover" class="tab-cover-preview">
        <img :src="activeTabCover" alt="" />
      </div>
    </div>

    <!-- 热门/精选模块 -->
    <div v-if="showHotList && (hotFeaturedDisplay === 'hot_first' || hotFeaturedDisplay === 'featured_first' || hotFeaturedDisplay === 'mixed')" class="hot-section">
      <div class="section-header">
        <span class="section-title">{{ hotFeaturedDisplay === 'hot_first' ? '热门推荐' : '精选内容' }}</span>
        <span class="section-more">查看更多</span>
      </div>
      <div class="hot-list">
        <div v-for="(item, index) in hotListData" :key="index" class="hot-item">
          <div class="hot-cover" :style="{ background: item.coverBg }"></div>
          <div class="hot-info">
            <div class="hot-title">{{ item.title }}</div>
            <div class="hot-meta">
              <div class="hot-author">
                <div class="author-avatar" :style="{ background: item.avatarBg }"></div>
                <span>{{ item.author }}</span>
              </div>
              <span class="hot-likes">{{ item.likes }} 赞</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 榜单模块 -->
    <div v-if="leaderboard && leaderboard.enabled && leaderboard.items?.length > 0" class="leaderboard-section">
      <div class="section-header">
        <span class="section-title">{{ leaderboard.items[0]?.title || '排行榜' }}</span>
        <span class="section-more">查看更多</span>
      </div>
      <div class="leaderboard-list">
        <div v-for="(item, index) in enabledLeaderboardItems" :key="index" class="leaderboard-item">
          <span class="rank" :class="{ 'top-rank': index < 3 }">{{ index + 1 }}</span>
          <span class="rank-title">{{ item.title }}</span>
          <svg class="rank-arrow" viewBox="0 0 24 24" fill="currentColor">
            <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
          </svg>
        </div>
      </div>
    </div>

    <!-- 内容列表 -->
    <div class="content-list">
      <div v-for="(post, index) in contentListData" :key="index" class="content-card">
        <div class="card-header">
          <div class="user-avatar" :style="{ background: post.avatarBg }"></div>
          <div class="user-info">
            <span class="user-name">{{ post.userName }}</span>
            <span class="post-time">{{ post.time }}</span>
          </div>
        </div>
        <div class="card-content">
          <div class="content-text">{{ post.content }}</div>
          <div v-if="post.hasImages" class="content-images">
            <div v-for="j in 3" :key="j" class="image-placeholder" :style="{ background: post.imageBg }"></div>
          </div>
        </div>
        <div class="card-footer">
          <span class="action-item">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
            {{ post.likes }}
          </span>
          <span class="action-item">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M21.99 4c0-1.1-.89-2-1.99-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4-.01-18z"/></svg>
            {{ post.comments }}
          </span>
        </div>
      </div>
    </div>

    <!-- 底部占位 -->
    <div class="bottom-space"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'

const props = defineProps<{
  region?: any
  showCarousel?: boolean
  showAnnouncement?: boolean
  showKingkong?: boolean
  showHotList?: boolean
  hotFeaturedDisplay?: string
  carouselImages?: string[]
  announcementText?: string
  navItems?: any[]
  tabs?: any[]
  leaderboard?: any
  homeFeatureStyle?: string
}>()

const emit = defineEmits(['navigateTo', 'goToSearch'])

const currentCarouselIndex = ref(0)
const currentTabIndex = ref(0)
let carouselTimer: ReturnType<typeof setInterval> | null = null

// 区域头部背景
const regionBgStyle = computed(() => {
  if (props.region?.background_url) {
    return { backgroundImage: `url(${props.region.background_url})`, backgroundSize: 'cover' }
  }
  return { background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }
})

// 启用的 Tabs
const enabledTabs = computed(() => {
  return (props.tabs || []).filter(tab => tab.enabled !== false)
})

const activeTabCover = computed(() => {
  const tab = enabledTabs.value[currentTabIndex.value]
  return tab?.image || tab?.imageUrl || ''
})

// 显示的导航项
const displayNavItems = computed(() => {
  const items = props.navItems || []
  const enabled = items.filter(item => item.enabled !== false)
  return enabled.length > 0 ? enabled.slice(0, 10) : getDefaultNavItems()
})

// 启用的榜单项
const enabledLeaderboardItems = computed(() => {
  if (!props.leaderboard?.items) return []
  return props.leaderboard.items.filter((i: any) => i.enabled !== false).slice(0, 5)
})

// 默认导航项
const getDefaultNavItems = () => [
  { name: '笔记', icon: '', page: '/pages/note/list', enabled: true },
  { name: '外卖', icon: '', page: '/pages/takeout/list', enabled: true },
  { name: '二手', icon: '', page: '/pages/secondhand/list', enabled: true },
  { name: '活动', icon: '', page: '/pages/activity/list', enabled: true },
  { name: '圈子', icon: '', page: '/pages/circle/list', enabled: true },
]

// 默认导航名称
const getDefaultNavName = (index: number) => {
  const names = ['笔记', '外卖', '二手', '活动', '圈子', '跑腿', '评分', '打卡', '更多', '发现']
  return names[index] || '入口'
}

// 默认图标路径
const getDefaultIconPath = (index: number) => {
  const paths = [
    'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z', // 笔记
    'M11 9H9V2H7v7H5V2H3v7c0 2.12 1.66 3.84 3.75 3.97V22h2.5v-9.03C11.34 12.84 13 11.12 13 9V2h-2v7zm5-3v8h2.5v8H21V2c-2.76 0-5 2.24-5 4z', // 外卖
    'M12.5 6.9c1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-.39.08-.75.21-1.1.36l1.51 1.51c.32-.08.69-.13 1.08-.13zM5.33 4.06L4.06 5.33 7.5 8.77c0 2.08 1.56 3.22 3.91 3.91l3.51 3.51c-.34.48-1.05.91-2.42.91-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c.96-.18 1.83-.55 2.46-1.12l2.22 2.22 1.27-1.27L5.33 4.06z', // 二手
    'M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2zm-7 5h5v5h-5v-5z', // 活动
    'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z', // 圈子
    'M20 8h-3V4H3c-1.1 0-2 .9-2 2v11h2c0 1.66 1.34 3 3 3s3-1.34 3-3h6c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-4zM6 18.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm13.5-9l1.96 2.5H17V9.5h2.5zm-1.5 9c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z', // 跑腿
    'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z', // 评分
    'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 3c1.93 0 3.5 1.57 3.5 3.5S13.93 13 12 13s-3.5-1.57-3.5-3.5S10.07 6 12 6zm7 13H5v-.23c0-.62.28-1.2.76-1.58C7.47 15.82 9.64 15 12 15s4.53.82 6.24 2.19c.48.38.76.97.76 1.58V19z', // 打卡
    'M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z', // 更多
    'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z', // 发现
  ]
  return paths[index] || paths[0]
}

const getTabIconPath = (type: string, index: number) => {
  const byType: Record<string, string> = {
    note: getDefaultIconPath(0),
    takeout: getDefaultIconPath(1),
    secondhand: getDefaultIconPath(2),
    activity: getDefaultIconPath(3),
    circle: getDefaultIconPath(4),
    errand: getDefaultIconPath(5),
    vote: getDefaultIconPath(6),
    merchant: getDefaultIconPath(7),
  }
  return byType[type] || getDefaultIconPath(index)
}

// 获取图标样式
const getIconStyle = (item: any, index: number) => {
  const colors = [
    'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
    'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
    'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
    'linear-gradient(135deg, #fccb90 0%, #d57eeb 100%)',
    'linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)',
    'linear-gradient(135deg, #f5576c 0%, #ff6a00 100%)',
    'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  ]
  if (item.icon) {
    return { backgroundImage: `url(${item.icon})`, backgroundSize: 'cover' }
  }
  return { background: colors[index % colors.length] }
}

// 稳定的热门列表数据
const hotListData = computed(() => [
  {
    title: '校园美食推荐：这家食堂的新菜品太好吃了！',
    author: '美食达人',
    likes: 328,
    coverBg: 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)',
    avatarBg: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
  },
  {
    title: '二手教材转让，价格优惠，需要的同学看过来',
    author: '学霸小王',
    likes: 156,
    coverBg: 'linear-gradient(135deg, #a1c4fd 0%, #c2e9fb 100%)',
    avatarBg: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)'
  },
  {
    title: '周末活动召集：一起去爬山吧！',
    author: '活动组织者',
    likes: 89,
    coverBg: 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)',
    avatarBg: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)'
  }
])

// 稳定的内容列表数据
const contentListData = computed(() => [
  {
    userName: '校园小助手',
    time: '2小时前',
    content: '今天的校园生活也太精彩了吧！图书馆新开的咖啡区真的太棒了，一边看书一边喝咖啡，完美的下午时光～',
    hasImages: true,
    likes: 128,
    comments: 32,
    avatarBg: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    imageBg: 'linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%)'
  },
  {
    userName: '美食探店',
    time: '3小时前',
    content: '发现了一家超好吃的外卖店！推荐他们家的麻辣香锅，分量足味道好，性价比超高！',
    hasImages: false,
    likes: 256,
    comments: 48,
    avatarBg: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    imageBg: 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)'
  },
  {
    userName: '学习委员',
    time: '5小时前',
    content: '期末考试复习资料整理好了，需要的同学可以私信我获取～包含所有重点知识点和历年真题！',
    hasImages: true,
    likes: 512,
    comments: 128,
    avatarBg: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    imageBg: 'linear-gradient(135deg, #a1c4fd 0%, #c2e9fb 100%)'
  },
  {
    userName: '运动达人',
    time: '6小时前',
    content: '今天跑步5公里打卡！坚持运动第30天，感觉整个人都精神了。有没有一起跑步的小伙伴？',
    hasImages: false,
    likes: 64,
    comments: 16,
    avatarBg: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
    imageBg: 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)'
  }
])

// 自动轮播
const startCarousel = () => {
  if (props.carouselImages && props.carouselImages.length > 1) {
    carouselTimer = setInterval(() => {
      currentCarouselIndex.value = (currentCarouselIndex.value + 1) % props.carouselImages!.length
    }, 3000)
  }
}

const stopCarousel = () => {
  if (carouselTimer) {
    clearInterval(carouselTimer)
    carouselTimer = null
  }
}

watch(() => props.carouselImages, () => {
  stopCarousel()
  currentCarouselIndex.value = 0
  startCarousel()
}, { immediate: true })

onMounted(() => {
  startCarousel()
})

onUnmounted(() => {
  stopCarousel()
})
</script>

<style scoped>
.preview-home-page {
  min-height: 100%;
  background: #f5f5f5;
}

/* 区域头部 */
.region-header {
  position: relative;
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

.header-content {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px;
}

.region-logo {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  backdrop-filter: blur(10px);
}

.region-logo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.logo-text {
  font-size: 18px;
  font-weight: 600;
  color: #ffffff;
}

.region-name {
  flex: 1;
  font-size: 16px;
  font-weight: 600;
  color: #ffffff;
}

.header-actions {
  display: flex;
  gap: 12px;
}

.action-icon {
  width: 24px;
  height: 24px;
  color: #ffffff;
}

/* 搜索栏 */
.search-bar {
  padding: 0 12px 12px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.search-input {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 20px;
  padding: 10px 16px;
  font-size: 13px;
  color: #999;
  backdrop-filter: blur(10px);
}

.search-icon {
  width: 16px;
  height: 16px;
  color: #999;
}

/* 轮播图 */
.carousel-section {
  margin: 0;
}

.carousel-wrapper {
  position: relative;
  overflow: hidden;
  height: 160px;
}

.carousel-track {
  display: flex;
  transition: transform 0.3s ease;
  height: 100%;
}

.carousel-slide {
  min-width: 100%;
  height: 100%;
}

.carousel-slide img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.carousel-indicators {
  position: absolute;
  bottom: 10px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 6px;
}

.indicator {
  width: 6px;
  height: 6px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.5);
  transition: all 0.3s;
}

.indicator.active {
  width: 18px;
  background: #ffffff;
}

.carousel-placeholder {
  height: 160px;
  background: linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.placeholder-icon {
  width: 40px;
  height: 40px;
  color: #6366f1;
}

.carousel-placeholder span {
  font-size: 12px;
  color: #6366f1;
}

/* 公告 */
.announcement-section {
  padding: 8px 12px;
  background: #ffffff;
}

.announcement-box {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: linear-gradient(135deg, #fff9e6 0%, #fff3cd 100%);
  border-radius: 8px;
}

.announcement-icon {
  width: 20px;
  height: 20px;
  color: #f59e0b;
  flex-shrink: 0;
}

.announcement-text {
  flex: 1;
  font-size: 13px;
  color: #92400e;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.arrow-icon {
  width: 16px;
  height: 16px;
  color: #999;
  flex-shrink: 0;
}

/* 金刚区 */
.kingkong-section {
  padding: 16px 12px;
  background: #ffffff;
}

.kingkong-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 16px;
}

.kingkong-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.kingkong-icon {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.kingkong-icon img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.default-icon {
  width: 24px;
  height: 24px;
  color: #ffffff;
}

.kingkong-name {
  font-size: 11px;
  color: #333;
  text-align: center;
  line-height: 1.2;
}

/* Tabs */
.tabs-section {
  background: #ffffff;
  border-bottom: 0.5px solid #e5e5e5;
  position: sticky;
  top: 0;
  z-index: 10;
}

.tabs-scroll {
  display: flex;
  overflow-x: auto;
  padding: 0 12px;
  -webkit-overflow-scrolling: touch;
}

.tabs-scroll::-webkit-scrollbar {
  display: none;
}

.tab-item {
  flex-shrink: 0;
  padding: 10px 12px 11px;
  font-size: 13px;
  color: #666;
  position: relative;
  cursor: pointer;
  transition: all 0.2s;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 44px;
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
  width: 20px;
  height: 3px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 2px;
}

.tab-icon {
  width: 18px;
  height: 18px;
  border-radius: 6px;
  display: inline-grid;
  place-items: center;
  color: currentColor;
  background: rgba(102, 126, 234, .1);
  overflow: hidden;
}

.tab-icon svg {
  width: 13px;
  height: 13px;
}

.tab-icon img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.tab-name {
  white-space: nowrap;
}

.tab-link-dot {
  width: 5px;
  height: 5px;
  border-radius: 99px;
  background: #1677ff;
  box-shadow: 0 0 0 3px rgba(22, 119, 255, .12);
}

.tab-cover-preview {
  margin: 0 12px 10px;
  height: 78px;
  border-radius: 14px;
  overflow: hidden;
  background: #f1f5f9;
}

.tab-cover-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

/* 热门模块 */
.hot-section {
  margin-top: 8px;
  background: #ffffff;
  padding: 16px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: #333;
}

.section-more {
  font-size: 12px;
  color: #999;
}

.hot-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.hot-item {
  display: flex;
  gap: 12px;
  padding: 12px;
  background: #f8f9fa;
  border-radius: 10px;
}

.hot-cover {
  width: 80px;
  height: 80px;
  border-radius: 8px;
  flex-shrink: 0;
}

.hot-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.hot-title {
  font-size: 14px;
  font-weight: 500;
  color: #333;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.hot-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: #999;
}

.hot-author {
  display: flex;
  align-items: center;
  gap: 6px;
}

.author-avatar {
  width: 20px;
  height: 20px;
  border-radius: 50%;
}

/* 榜单模块 */
.leaderboard-section {
  margin-top: 8px;
  background: #ffffff;
  padding: 16px;
}

.leaderboard-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.leaderboard-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: #f8f9fa;
  border-radius: 8px;
}

.rank {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  background: #e5e7eb;
  color: #6b7280;
  flex-shrink: 0;
}

.rank.top-rank {
  background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
  color: #ffffff;
}

.rank-title {
  flex: 1;
  font-size: 13px;
  color: #333;
}

.rank-arrow {
  width: 16px;
  height: 16px;
  color: #999;
}

/* 内容列表 */
.content-list {
  margin-top: 8px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.content-card {
  background: #ffffff;
  border-radius: 12px;
  overflow: hidden;
  padding: 14px;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.user-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  flex-shrink: 0;
}

.user-info {
  display: flex;
  flex-direction: column;
}

.user-name {
  font-size: 14px;
  font-weight: 500;
  color: #333;
}

.post-time {
  font-size: 12px;
  color: #999;
}

.card-content {
  margin-bottom: 10px;
}

.content-text {
  font-size: 14px;
  color: #333;
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.content-images {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  margin-top: 10px;
}

.image-placeholder {
  aspect-ratio: 1;
  border-radius: 6px;
}

.card-footer {
  display: flex;
  gap: 24px;
  padding-top: 10px;
  border-top: 0.5px solid #f0f0f0;
}

.action-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #999;
}

.action-item svg {
  width: 16px;
  height: 16px;
}

.bottom-space {
  height: 20px;
}
</style>
