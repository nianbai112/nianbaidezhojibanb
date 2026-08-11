<template>
  <!-- 页面内置内容语境：让画布像"页面"，协议组件出现在这些原生内容上方。
       首页/消息/我的/容器骨架均注入真机 WXSS，DOM/class 对齐真机 wxml（uni-app data-v 已由编译器剥离）。 -->
  <div class="npc">
    <div class="npc-divider">
      <span class="npc-divider-line" />
      <span class="npc-divider-text">以下为页面内置内容（不可在此编辑）</span>
      <span class="npc-divider-line" />
    </div>
    <div class="npc-fade">
      <!-- 首页：真机 hero（DynamicHomeContent.wxml/wxss）+ 真机笔记流 -->
      <template v-if="pageType === 'home'">
        <div class="npc-home">
          <div class="campus-template">
            <div class="campus-hero">
              <div class="campus-hero-head">
                <div class="campus-region-pill">
                  <span class="txtIcon icon-dingwei campus-region-icon" />
                  <span class="campus-region-name">阳光校区</span>
                  <span class="txtIcon icon-arrow-down campus-region-arrow" />
                </div>
              </div>
              <div class="campus-hero-main">
                <div class="campus-hero-copy">
                  <span class="campus-hero-title">今天想在校园里<br />干点啥？</span>
                  <div class="campus-title-underline" />
                  <span class="campus-hero-subtitle">发现校园美好生活</span>
                </div>
                <div class="campus-mascot">
                  <div class="campus-mascot-fallback">
                    <div class="campus-mascot-sprout" />
                    <div class="campus-mascot-face" />
                  </div>
                </div>
              </div>
              <div class="campus-search">
                <span class="txtIcon icon-search-1-copy campus-search-icon" />
                <span class="campus-search-placeholder">搜索校园生活</span>
                <span class="campus-search-btn">搜索</span>
              </div>
              <div class="campus-wave campus-wave-far" />
              <div class="campus-wave campus-wave-mid" />
              <div class="campus-wave campus-wave-near" />
            </div>
          </div>
        </div>
        <NativeFeedCard :show-note="false" :region-id="regionId" />
      </template>

      <!-- 消息页：真机消息列表（pages/tabbar/news/news.wxml 的 message-list 区块） -->
      <template v-else-if="pageType === 'message'">
        <div class="npc-message">
          <div class="message-list chat-list">
            <!-- 服务号行（真机：avatar.service-avatar + txtIcon） -->
            <div class="message-item">
              <div class="avatar service-avatar" style="background-color: var(--brand-bg, #e8f3e4)">
                <span class="txtIcon icon-guanfang1" style="color: var(--brand, #36a853)" />
              </div>
              <div class="message-content">
                <div class="message-info">
                  <span class="message-title">系统通知</span>
                  <span class="message-time">昨天</span>
                </div>
                <div class="message-preview">
                  <span class="message-text">你的学生认证已审核通过</span>
                </div>
              </div>
            </div>
            <div class="divider" />
            <!-- 私信行（真机：avatar 图片 + title-wrapper + unread-badge） -->
            <div v-for="row in messageRows" :key="row.name" class="message-item">
              <div class="avatar">
                <img class="npc-avatar-img" :src="row.avatar" alt="" />
              </div>
              <div class="message-content">
                <div class="message-info">
                  <div class="title-wrapper">
                    <span class="message-title">{{ row.name }}</span>
                    <span v-if="row.unread" class="unread-badge">{{ row.unread }}</span>
                  </div>
                  <span class="message-time">{{ row.time }}</span>
                </div>
                <div class="message-preview">
                  <span class="message-text">{{ row.preview }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- 我的页：真机用户卡 + 服务面板（PersonalHomepage.wxml 的 user-box / image11-action-panel） -->
      <template v-else-if="pageType === 'profile'">
        <div class="npc-profile">
          <div class="user-box">
            <div class="user-bg" />
            <div class="user-info-container">
              <div class="user-top df">
                <div class="avatar-wrapper">
                  <div class="avatar-container">
                    <img class="avatar-image" :src="userAvatar" alt="" />
                  </div>
                </div>
                <div class="user-info-right">
                  <div class="user-name df">
                    <span>青团日记</span>
                  </div>
                  <div class="user-uid">UID：20240118</div>
                  <div class="region-switch df">
                    <span class="region-name ohto">阳光校区</span>
                    <span class="txtIcon icon-youjiantou" />
                  </div>
                </div>
              </div>
              <div class="user-tag df">
                <div class="tag-item df">IP属地：重庆</div>
              </div>
            </div>
          </div>
          <!-- 真机统计卡（PersonalHomepage.wxml image11-stats-card） -->
          <div class="image11-stats-card">
            <div class="image11-stat">
              <span class="image11-stat-value">128</span>
              <span class="image11-stat-label">关注</span>
            </div>
            <div class="image11-stat">
              <span class="image11-stat-value">1.2万</span>
              <span class="image11-stat-label">粉丝</span>
            </div>
            <div class="image11-stat">
              <span class="image11-stat-value">3,892</span>
              <span class="image11-stat-label">获赞</span>
            </div>
            <div class="image11-stat">
              <span class="image11-stat-value">86</span>
              <span class="image11-stat-label">发布</span>
            </div>
          </div>
          <div class="image11-action-panel">
            <div class="image11-service-row">
              <div class="image11-service-card order">
                <div class="image11-service-copy">
                  <span class="image11-service-title">我的订单</span>
                  <span class="image11-service-desc">查看跑腿、闲置交易订单</span>
                  <div class="image11-mini-btn green">去查看 <span>›</span></div>
                </div>
                <div class="image11-service-art">
                  <span class="txtIcon icon-dingdan2" />
                </div>
              </div>
              <div class="image11-service-card wallet">
                <div class="image11-service-copy">
                  <span class="image11-service-title">我的钱包</span>
                  <span class="image11-service-desc">余额、收益、提现记录</span>
                  <div class="image11-mini-btn yellow">去查看 <span>›</span></div>
                </div>
                <div class="image11-service-art">
                  <span class="txtIcon icon-bill" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- 容器页：真机模块切换器（containers.wxml module-switcher）+ 任务大厅卡片（RunErrands 为内联样式编译产物，无稳定 class，保持主题变量自绘） -->
      <template v-else>
        <div class="npc-containers">
          <div class="module-switcher">
            <div class="module-switcher-knob" />
            <div class="module-switcher-item module-switcher-item--active">跑腿</div>
            <div class="module-switcher-item">圈子</div>
          </div>
          <div class="npc-list">
            <div v-for="t in tasks" :key="t.title" class="npc-task-card">
              <div class="npc-task-head">
                <b>{{ t.title }}</b>
                <span class="npc-task-price">¥{{ t.price }}</span>
              </div>
              <div class="npc-task-desc">{{ t.desc }}</div>
              <div class="npc-task-meta">
                <span class="txtIcon icon-weizhi2" /> {{ t.from }} → {{ t.to }} · {{ t.time }}
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, watch } from 'vue'
import NativeFeedCard from './NativeFeedCard.vue'
import { ensureCanvasTheme, injectRealWxss, realImage } from './realWxss'
import { ensureIconfont } from './iconfont'

const props = withDefaults(defineProps<{ pageType: string; regionId?: string }>(), { regionId: 'global' })

const userAvatar = realImage(0).url

const messageRows = [
  { name: '东门干饭王', preview: '姐妹！糖水铺排到我了，给你带一杯？', time: '12:30', unread: 2, avatar: realImage(1).url },
  { name: '期末复习互助群', preview: '[图片] 第三章重点整理好了，自取', time: '11:05', unread: 5, avatar: realImage(2).url },
]

const tasks = [
  { title: '帮忙代取快递（菜鸟驿站）', price: 3, desc: '两件小件，取件码发你，送到 6 号楼下', from: '菜鸟驿站', to: '6 号楼', time: '今天 18:00 前' },
  { title: '食堂带饭 · 二食堂麻辣香锅', price: 2, desc: '微辣，打包带回，谢谢！', from: '二食堂', to: '图书馆', time: '今天 12:00 前' },
]

/** 按页签注入对应真机页面 WXSS（页签切换时重注，id 去重幂等） */
function injectPageWxss(pageType: string) {
  const map: Record<string, { path: string; scope: string }> = {
    home: { path: 'components/DynamicHomeContent.wxss', scope: '.npc-home' },
    message: { path: 'pages/tabbar/news/news.wxss', scope: '.npc-message' },
    profile: { path: 'pages/tabbar/auth/PersonalHomepage.wxss', scope: '.npc-profile' },
    containers: { path: 'pages/tabbar/containers/containers.wxss', scope: '.npc-containers' },
  }
  const target = map[pageType] || map.containers
  injectRealWxss(`npc-${pageType}-wxss`, [target])
}

watch(() => props.pageType, (v) => injectPageWxss(v))

onMounted(() => {
  injectPageWxss(props.pageType)
  ensureCanvasTheme()
  ensureIconfont()
})
</script>

<style scoped>
.npc {
  margin-top: 6px;
}
.npc-divider {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 14px 6px;
}
.npc-divider-line {
  flex: 1;
  height: 1px;
  background: repeating-linear-gradient(90deg, #c4cabe 0 4px, transparent 4px 8px);
}
.npc-divider-text {
  font-size: 10px;
  color: #8a9384;
  white-space: nowrap;
}
/* 内置内容：淡化 + 不可交互 */
.npc-fade {
  opacity: 0.6;
  pointer-events: none;
}

/* xiaoyi-lazy-image/lazyload → img 等效铺满 */
.npc-avatar-img,
.avatar-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

/* 真机 module-switcher 是 position:fixed 悬浮件，画布内改为文档流 */
.npc-containers .module-switcher {
  position: relative;
  left: auto;
  top: auto;
  transform: none;
  margin: 4px auto 8px;
  z-index: 1;
}

/* 任务大厅卡片（RunErrands 无稳定 class，主题变量自绘） */
.npc-list {
  padding: 4px 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.npc-task-card {
  background: var(--bg-card, #fff);
  border-radius: 12px;
  padding: 12px 14px;
}
.npc-task-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.npc-task-head b {
  font-size: 13px;
  color: var(--text-primary, #1d271f);
}
.npc-task-price {
  font-size: 15px;
  font-weight: 700;
  color: var(--danger, #fa5150);
}
.npc-task-desc {
  margin-top: 4px;
  font-size: 11px;
  color: var(--text-secondary, #55604f);
}
.npc-task-meta {
  margin-top: 6px;
  font-size: 10px;
  color: var(--text-tertiary, #8a9384);
  display: flex;
  align-items: center;
  gap: 3px;
}
.npc-task-meta .txtIcon {
  font-size: 11px;
}
</style>
