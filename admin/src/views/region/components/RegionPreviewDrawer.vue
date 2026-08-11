<template>
  <el-drawer v-model="visible" title="小程序预览" size="400px" direction="rtl" :before-close="handleClose">
    <div class="preview-container">
      <div class="preview-tabs">
        <el-tabs v-model="activeTab" @tab-click="handleTabClick">
          <el-tab-pane label="首页" name="home" />
          <el-tab-pane label="消息页" name="message" />
          <el-tab-pane label="我的页" name="profile" />
          <el-tab-pane label="底部导航" name="tabbar" />
          <el-tab-pane label="分享卡片" name="share" />
        </el-tabs>
      </div>

      <div class="preview-content">
        <!-- 首页预览 -->
        <div v-if="activeTab === 'home'" class="phone-frame">
          <div class="phone-header">
            <div class="phone-status-bar">
              <span>9:41</span>
              <div class="status-icons">
                <el-icon><Connection /></el-icon>
                <el-icon><Cellphone /></el-icon>
                <el-icon><Iphone /></el-icon>
              </div>
            </div>
            <div class="phone-navbar" :style="{ background: homeConfig.navbarColor || '#fff' }">
              <span class="navbar-title">{{ homeConfig.title || '首页' }}</span>
            </div>
          </div>
          <div class="phone-body">
            <div class="home-preview">
              <div v-if="homeConfig.banner" class="preview-banner">
                <img :src="homeConfig.banner" alt="轮播图" />
              </div>
              <div v-if="homeConfig.searchBar" class="preview-search">
                <el-icon><Search /></el-icon>
                <span>搜索</span>
              </div>
              <div v-if="homeConfig.gridMenu" class="preview-grid">
                <div v-for="i in 4" :key="i" class="grid-item">
                  <div class="grid-icon"></div>
                  <span>功能{{ i }}</span>
                </div>
              </div>
              <div class="preview-feed">
                <div v-for="i in 3" :key="i" class="feed-item">
                  <div class="feed-avatar"></div>
                  <div class="feed-content">
                    <div class="feed-title"></div>
                    <div class="feed-desc"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 消息页预览 -->
        <div v-if="activeTab === 'message'" class="phone-frame">
          <div class="phone-header">
            <div class="phone-status-bar">
              <span>9:41</span>
              <div class="status-icons">
                <el-icon><Connection /></el-icon>
                <el-icon><Cellphone /></el-icon>
                <el-icon><Iphone /></el-icon>
              </div>
            </div>
            <div class="phone-navbar">
              <span class="navbar-title">消息</span>
            </div>
          </div>
          <div class="phone-body">
            <div class="message-preview">
              <div v-for="(card, idx) in messageCards" :key="idx" class="message-card">
                <div class="message-icon" :style="{ background: card.color || '#3b82f6' }">
                  <el-icon><component :is="card.icon || 'ChatDotRound'" /></el-icon>
                </div>
                <div class="message-info">
                  <div class="message-title">{{ card.title || '消息' }}</div>
                  <div class="message-desc">{{ card.subtitle || '暂无消息' }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 我的页预览 -->
        <div v-if="activeTab === 'profile'" class="phone-frame">
          <div class="phone-header">
            <div class="phone-status-bar">
              <span>9:41</span>
              <div class="status-icons">
                <el-icon><Connection /></el-icon>
                <el-icon><Cellphone /></el-icon>
                <el-icon><Iphone /></el-icon>
              </div>
            </div>
            <div class="phone-navbar">
              <span class="navbar-title">我的</span>
            </div>
          </div>
          <div class="phone-body">
            <div class="profile-preview">
              <div class="profile-header">
                <div class="profile-avatar"></div>
                <div class="profile-info">
                  <div class="profile-name">用户昵称</div>
                  <div class="profile-id">ID: 123456</div>
                </div>
              </div>
              <div class="profile-menu">
                <div v-for="(item, idx) in profileItems" :key="idx" class="menu-item">
                  <div class="menu-icon" :style="{ color: item.color || '#3b82f6' }">
                    <el-icon><component :is="item.icon || 'Document'" /></el-icon>
                  </div>
                  <span class="menu-title">{{ item.title || '功能' }}</span>
                  <el-icon class="menu-arrow"><ArrowRight /></el-icon>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 底部导航预览 -->
        <div v-if="activeTab === 'tabbar'" class="phone-frame">
          <div class="phone-header">
            <div class="phone-status-bar">
              <span>9:41</span>
              <div class="status-icons">
                <el-icon><Connection /></el-icon>
                <el-icon><Cellphone /></el-icon>
                <el-icon><Iphone /></el-icon>
              </div>
            </div>
          </div>
          <div class="phone-body tabbar-body">
            <div class="tabbar-content">
              <div class="tabbar-placeholder">
                <span>小程序内容区域</span>
              </div>
            </div>
            <div
              class="tabbar-preview"
              :class="`style-${tabbarConfig.type === 'capsule' ? 'capsule' : 'bottom'}`"
              :style="{ background: tabbarConfig.backgroundColor || '#fff' }"
            >
              <div v-for="(tab, idx) in tabbarList" :key="idx" class="tabbar-item" :class="{ disabled: !tab.enabled }">
                <div class="tabbar-icon" :style="{ color: tab.enabled ? (tab.selectedColor || '#1677ff') : '#ccc' }">
                  <el-icon><component :is="getTabIcon(tab.id)" /></el-icon>
                </div>
                <span v-if="!tab.hideText" class="tabbar-text" :style="{
                  color: tab.enabled ? (tab.color || tabbarConfig.color || '#8A8A8A') : '#ccc',
                  fontSize: (tab.fontSize || 12) + 'px'
                }">
                  {{ tab.name }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- 分享卡片预览 -->
        <div v-if="activeTab === 'share'" class="phone-frame">
          <div class="phone-header">
            <div class="phone-status-bar">
              <span>9:41</span>
              <div class="status-icons">
                <el-icon><Connection /></el-icon>
                <el-icon><Cellphone /></el-icon>
                <el-icon><Iphone /></el-icon>
              </div>
            </div>
            <div class="phone-navbar">
              <span class="navbar-title">微信</span>
            </div>
          </div>
          <div class="phone-body">
            <div class="share-preview">
              <div class="share-card">
                <div class="share-card-body">
                  <div class="share-card-text">
                    <div class="share-card-title">{{ shareConfig.title || '分享标题' }}</div>
                    <div class="share-card-desc">{{ shareConfig.description || '分享描述' }}</div>
                  </div>
                  <div class="share-card-thumb">
                    <img v-if="shareConfig.imageUrl" :src="shareConfig.imageUrl" alt="" />
                    <div v-else class="share-thumb-placeholder">
                      <el-icon><Picture /></el-icon>
                    </div>
                  </div>
                </div>
                <div class="share-card-footer">
                  <div class="share-mini-icon"></div>
                  <span>{{ regionName || '小程序名称' }}</span>
                </div>
              </div>
              <div class="share-context">
                <div class="context-item">
                  <span class="context-label">分享给朋友</span>
                  <el-tag :type="shareConfig.enabled ? 'success' : 'info'" size="small">
                    {{ shareConfig.enabled ? '已启用' : '已禁用' }}
                  </el-tag>
                </div>
                <div class="context-item">
                  <span class="context-label">朋友圈分享</span>
                  <el-tag :type="shareConfig.momentsEnabled ? 'success' : 'info'" size="small">
                    {{ shareConfig.momentsEnabled ? '已启用' : '已禁用' }}
                  </el-tag>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Connection, Search, Picture, ArrowRight, ChatDotRound, Document, HomeFilled, Menu, Position, User, Cellphone, Iphone } from '@element-plus/icons-vue'

interface Props {
  modelValue: boolean
  homeConfig?: any
  messageCards?: any[]
  profileItems?: any[]
  tabbarConfig?: any
  tabbarList?: any[]
  shareConfig?: any
  regionName?: string
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: false,
  homeConfig: () => ({}),
  messageCards: () => [],
  profileItems: () => [],
  tabbarConfig: () => ({}),
  tabbarList: () => [],
  shareConfig: () => ({}),
  regionName: ''
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

const activeTab = ref('home')

function handleClose() {
  visible.value = false
}

function handleTabClick() {
  // 可以在这里添加切换tab时的逻辑
}

function getTabIcon(id: string) {
  const map: Record<string, any> = {
    home: HomeFilled,
    circle: Menu,
    publish: Position,
    message: ChatDotRound,
    mine: User
  }
  return map[id] || Menu
}
</script>

<style scoped lang="scss">
.preview-container {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.preview-tabs {
  margin-bottom: 16px;
}

.preview-content {
  flex: 1;
  display: flex;
  justify-content: center;
  overflow-y: auto;
}

.phone-frame {
  width: 320px;
  height: 568px;
  background: #fff;
  border-radius: 36px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  border: 8px solid #1a1a1a;
  display: flex;
  flex-direction: column;
}

.phone-header {
  background: #f8f8f8;
}

.phone-status-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px 4px;
  font-size: 12px;
  font-weight: 600;
  color: #333;
}

.status-icons {
  display: flex;
  gap: 4px;
}

.phone-navbar {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px 16px;
  background: #fff;
  border-bottom: 1px solid #eee;
}

.navbar-title {
  font-size: 17px;
  font-weight: 600;
  color: #333;
}

.phone-body {
  flex: 1;
  overflow-y: auto;
  background: #f5f5f5;
}

/* 首页预览 */
.home-preview {
  padding: 12px;
}

.preview-banner {
  height: 120px;
  border-radius: 6px;
  overflow: hidden;
  margin-bottom: 12px;
  background: linear-gradient(135deg, #bfdbfe, #60a5fa);
}

.preview-banner img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.preview-search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: #fff;
  border-radius: 6px;
  margin-bottom: 12px;
  color: #999;
  font-size: 14px;
}

.preview-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 12px;
}

.grid-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px 8px;
  background: #fff;
  border-radius: 6px;
}

.grid-icon {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  background: linear-gradient(135deg, #93c5fd, #3b82f6);
}

.grid-item span {
  font-size: 10px;
  color: #666;
}

.preview-feed {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.feed-item {
  display: flex;
  gap: 10px;
  padding: 12px;
  background: #fff;
  border-radius: 6px;
}

.feed-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: linear-gradient(135deg, #a5b4fc, #818cf8);
  flex-shrink: 0;
}

.feed-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.feed-title {
  height: 14px;
  background: #e2e8f0;
  border-radius: 6px;
  width: 80%;
}

.feed-desc {
  height: 10px;
  background: #f1f5f9;
  border-radius: 6px;
  width: 60%;
}

/* 消息页预览 */
.message-preview {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.message-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px;
  background: #fff;
  border-radius: 10px;
}

.message-icon {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 20px;
}

.message-info {
  flex: 1;
}

.message-title {
  font-size: 15px;
  font-weight: 600;
  color: #333;
  margin-bottom: 4px;
}

.message-desc {
  font-size: 12px;
  color: #999;
}

/* 我的页预览 */
.profile-preview {
  padding: 16px 12px;
}

.profile-header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
  background: #fff;
  border-radius: 10px;
  margin-bottom: 12px;
}

.profile-avatar {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: linear-gradient(135deg, #c7d2fe, #818cf8);
}

.profile-info {
  flex: 1;
}

.profile-name {
  font-size: 18px;
  font-weight: 700;
  color: #333;
  margin-bottom: 4px;
}

.profile-id {
  font-size: 12px;
  color: #999;
}

.profile-menu {
  background: #fff;
  border-radius: 10px;
  overflow: hidden;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid #f5f5f5;
}

.menu-item:last-child {
  border-bottom: none;
}

.menu-icon {
  font-size: 20px;
}

.menu-title {
  flex: 1;
  font-size: 15px;
  color: #333;
}

.menu-arrow {
  color: #999;
}

/* 底部导航预览 */
.tabbar-body {
  display: flex;
  flex-direction: column;
}

.tabbar-content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tabbar-placeholder {
  color: #999;
  font-size: 14px;
}

.tabbar-preview {
  display: flex;
  justify-content: space-around;
  align-items: center;
  padding: 8px 4px 12px;
  border-top: 1px solid #eee;
  background: #fff;
}

.tabbar-preview.style-capsule {
  width: calc(100% - 44px);
  margin: 0 auto 14px;
  border: 1px solid #eee;
  border-radius: 999px;
  box-shadow: 0 10px 26px rgba(15, 23, 42, .1);
}

.tabbar-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 0;
}

.tabbar-item.disabled {
  opacity: 0.3;
}

.tabbar-icon {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tabbar-text {
  white-space: nowrap;
  font-weight: 700;
}

/* 分享卡片预览 */
.share-preview {
  padding: 16px;
}

.share-card {
  background: #fff;
  border-radius: 6px;
  border: 1px solid #e5e5e5;
  overflow: hidden;
  margin-bottom: 16px;
}

.share-card-body {
  display: flex;
  padding: 12px;
  gap: 12px;
}

.share-card-text {
  flex: 1;
  min-width: 0;
}

.share-card-title {
  font-size: 14px;
  font-weight: 500;
  color: #333;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.share-card-desc {
  font-size: 12px;
  color: #999;
  margin-top: 6px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.share-card-thumb {
  width: 64px;
  height: 64px;
  border-radius: 6px;
  overflow: hidden;
  flex-shrink: 0;
  background: #f5f5f5;
}

.share-card-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.share-thumb-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ccc;
  font-size: 24px;
}

.share-card-footer {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: #f8f8f8;
  font-size: 12px;
  color: #666;
}

.share-mini-icon {
  width: 16px;
  height: 16px;
  background: #07c160;
  border-radius: 6px;
}

.share-context {
  background: #fff;
  border-radius: 6px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.context-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.context-label {
  font-size: 13px;
  color: #666;
}

:deep(.el-tabs__header) {
  margin: 0;
}

:deep(.el-tabs__nav-wrap::after) {
  height: 0;
}

:deep(.el-tabs__item) {
  height: 36px;
  padding: 0 12px;
  font-size: 13px;
}
</style>
