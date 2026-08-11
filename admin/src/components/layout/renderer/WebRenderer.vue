<template>
  <!-- 真机渲染层：DOM/class 逐一对齐 page-renderer.wxml，样式来自真机 page-renderer.wxss 编译注入 -->
  <div class="web-renderer pr-root">
    <!-- 顶部导航 -->
    <div v-if="block.type === 'navbar'" class="pr-navbar">
      <span class="pr-navbar-title">{{ block.cfg.title || '首页' }}</span>
    </div>

    <!-- 搜索框 -->
    <div v-else-if="block.type === 'search'" class="pr-search">
      <span class="pr-search-icon">🔍</span>
      <span class="pr-search-ph">{{ block.cfg.placeholder || '搜索' }}</span>
    </div>

    <!-- 轮播图（swiper → 静态轮播 + 指示点） -->
    <div v-else-if="block.type === 'banner'" class="pr-banner">
      <template v-if="block.bannerImages.length">
        <div class="pr-banner-swiper" :style="{ height: bannerH }">
          <img
            v-for="(img, i) in block.bannerImages"
            v-show="i === bannerIndex"
            :key="i"
            class="pr-banner-img"
            :src="img.image || img.src || img"
            alt=""
            @error="hideImg"
          />
          <div v-if="block.cfg.indicatorDots !== false && block.bannerImages.length > 1" class="pr-banner-dots">
            <i v-for="(img, i) in block.bannerImages" :key="i" class="pr-banner-dot" :class="{ on: i === bannerIndex }" />
          </div>
        </div>
      </template>
      <div v-else class="pr-empty-slot" :style="{ height: bannerH }">轮播图 · 待配置图片</div>
    </div>

    <!-- 金刚区 -->
    <div v-else-if="block.type === 'grid-menu'" class="pr-grid">
      <div
        v-for="(g, i) in block.gridItems"
        :key="i"
        class="pr-grid-item"
        :style="{ width: `${100 / block.columns}%` }"
      >
        <img v-if="g.icon || g.image" class="pr-grid-icon" :src="g.icon || g.image" alt="" @error="hideImg" />
        <div v-else class="pr-grid-icon pr-grid-icon-ph">{{ g.firstLetter }}</div>
        <span class="pr-grid-text">{{ g.text || g.name }}</span>
      </div>
      <div v-if="!block.gridItems.length" class="pr-empty-slot pr-grid-empty">金刚区 · 待配置入口</div>
    </div>

    <!-- 公告（纵向 swiper → 轮换单行） -->
    <div v-else-if="block.type === 'announcement'" class="pr-notice">
      <span class="pr-notice-icon">📢</span>
      <div v-if="block.notices.length" class="pr-notice-swiper">
        <div class="pr-notice-line">{{ noticeText(block.notices[noticeIndex % block.notices.length]) }}</div>
      </div>
      <span v-else class="pr-notice-line">暂无公告</span>
    </div>

    <!-- 模块标题 -->
    <div v-else-if="block.type === 'module-title'" class="pr-mt">
      <div class="pr-mt-left" :style="block.mtStyle">
        <img v-if="block.cfg.icon" class="pr-mt-icon" :src="block.cfg.icon" alt="" @error="hideImg" />
        <span class="pr-mt-title">{{ block.cfg.title || '模块标题' }}</span>
      </div>
      <div v-if="block.cfg.showMore && block.cfg.align !== 'center'" class="pr-mt-more">
        {{ block.cfg.moreText || '更多' }} ›
      </div>
    </div>

    <!-- 筛选标签 -->
    <div v-else-if="block.type === 'filter-tabs'" class="pr-ftabs">
      <div v-for="(t, i) in block.cfg.items" :key="i" class="pr-ftab" :class="{ active: i === 0 }">{{ t.label || '标签' }}</div>
    </div>

    <!-- 文本 -->
    <div v-else-if="block.type === 'text'" class="pr-text" :style="block.textStyle">{{ block.cfg.content || block.cfg.text || '' }}</div>

    <!-- 图片 -->
    <div v-else-if="block.type === 'image'" class="pr-image-wrap">
      <img v-if="block.cfg.image || block.cfg.src" class="pr-image" :src="block.cfg.image || block.cfg.src" alt="" @error="hideImg" />
      <div v-else class="pr-empty-slot">图片 · 待配置</div>
      <div
        v-if="block.cfg.mask"
        class="pr-image-mask"
        :style="{ background: block.cfg.maskColor || '#000000', opacity: block.cfg.maskOpacity || 0.4 }"
      />
      <div v-if="block.cfg.badge" class="pr-image-badge" :class="`pr-badge-${block.cfg.badgePosition || 'top-right'}`">{{ block.cfg.badge }}</div>
    </div>

    <!-- 按钮 -->
    <div v-else-if="block.type === 'button'" class="pr-btn-wrap">
      <div class="pr-btn" :style="block.btnStyle">{{ block.cfg.text || '按钮' }}</div>
    </div>

    <!-- 分割线 -->
    <div v-else-if="block.type === 'divider'" class="pr-divider" />

    <!-- tmagic 活动页（拉取 DSL 绝对定位渲染，对齐 page-renderer.js buildTmagicItems） -->
    <div v-else-if="block.type === 'tmagic-page'" class="pr-tmagic" :style="{ height: tmagic.height ? `${tmagic.height}px` : undefined }">
      <template v-if="tmagic.status === 'ready'">
        <template v-for="n in tmagic.items" :key="n.key">
          <div v-if="n.ttype === 'text'" class="pr-tmagic-node pr-tmagic-text" :style="n.style">{{ n.text }}</div>
          <div v-else-if="n.ttype === 'img'" class="pr-tmagic-node pr-tmagic-img" :style="n.style">
            <img v-if="n.src" class="pr-tmagic-img-el" :src="n.src" alt="" @error="hideImg" />
          </div>
          <div v-else-if="n.ttype === 'button'" class="pr-tmagic-node pr-tmagic-btn" :style="n.style">{{ n.text || '按钮' }}</div>
        </template>
      </template>
      <div v-else-if="tmagic.status === 'loading'" class="pr-tmagic-skeleton">活动页加载中…</div>
      <div v-else class="pr-empty-slot">活动页{{ block.cfg.slug ? ` ${block.cfg.slug}` : '' }} · 未配置或加载失败</div>
    </div>

    <!-- 动态模块：信息流 / 榜单 / 推荐商家 → 真卡复刻；其余保持真机占位 -->
    <NativeFeedCard v-else-if="block.type === 'feed' || block.type === 'hot-posts'" :variant="block.type" :region-id="regionId" />
    <NativeMerchantCard v-else-if="block.type === 'recommend-merchant'" :region-id="regionId" />
    <NativeRankCards v-else-if="block.type === 'ranking'" :region-id="regionId" />
    <div v-else class="pr-dynamic">
      <span class="pr-dynamic-name">{{ block.dynamicName }}</span>
      <span class="pr-dynamic-tip">动态模块 · 小程序内渲染</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { request } from '@/api/request'
import { bannerHeight, buildTmagicItems, normalizeBlock } from './normalize'
import type { TmagicBlock } from './normalize'
import { ensureCanvasTheme, injectRealWxss } from './realWxss'
import { ensureIconfont } from './iconfont'
import NativeFeedCard from './NativeFeedCard.vue'
import NativeMerchantCard from './NativeMerchantCard.vue'
import NativeRankCards from './NativeRankCards.vue'

const props = withDefaults(defineProps<{ comp: any; regionId?: string }>(), { regionId: 'global' })

/** 数据流对齐 page-renderer.js normalize() */
const block = computed(() => normalizeBlock(props.comp))

const bannerH = computed(() => bannerHeight(block.value.cfg))

// ===== tmagic 活动页：按 slug 拉 DSL（对齐真机 loadTmagicBlock，slug 变化重拉） =====
const tmagic = ref<TmagicBlock>({ status: 'empty', items: [], height: 0 })

async function loadTmagic(slug: string) {
  if (block.value.type !== 'tmagic-page') return
  if (!slug) {
    tmagic.value = { status: 'empty', items: [], height: 0 }
    return
  }
  tmagic.value = { status: 'loading', items: [], height: 120 }
  try {
    const res: any = await request.get(`/layout/tmagic/${slug}`)
    const dsl = res?.data ?? res ?? null
    tmagic.value = buildTmagicItems(dsl)
  } catch (e) {
    console.warn(`[web-renderer] tmagic 活动页加载失败: ${slug}`, e)
    tmagic.value = { status: 'empty', items: [], height: 0 }
  }
}

watch(() => block.value.cfg?.slug, (slug: string) => loadTmagic(slug), { immediate: true })

// ===== swiper 模拟：轮播图 / 公告定时轮换 =====
const bannerIndex = ref(0)
const noticeIndex = ref(0)
let timer: ReturnType<typeof setInterval> | undefined

onMounted(() => {
  injectRealWxss('web-renderer-pr-wxss', [
    { path: 'components/page-renderer/page-renderer.wxss', scope: '.web-renderer' },
  ])
  ensureCanvasTheme()
  ensureIconfont()
  timer = setInterval(() => {
    const b = block.value
    if (b.bannerImages.length > 1 && b.cfg.autoplay !== false) {
      bannerIndex.value = (bannerIndex.value + 1) % b.bannerImages.length
    }
    if (b.notices.length > 1) {
      noticeIndex.value = (noticeIndex.value + 1) % b.notices.length
    }
  }, 3000)
})

onBeforeUnmount(() => clearInterval(timer))

const noticeText = (n: any) => n?.text || n?.title || String(n ?? '')
const hideImg = (e: Event) => ((e.target as HTMLElement).style.display = 'none')
</script>

<style scoped>
/* 画布内交互由 LayoutBuilder 的 .wb-item 接管，渲染层不拦截事件 */
.web-renderer {
  pointer-events: none;
}
/* swiper 指示点（真机由 swiper 组件自带，这里按 indicator-color 复刻） */
.pr-banner-swiper {
  position: relative;
}
.pr-banner-dots {
  position: absolute;
  bottom: 8px;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  gap: 5px;
}
.pr-banner-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.5);
}
.pr-banner-dot.on {
  background: #ffffff;
}
.pr-notice-swiper {
  overflow: hidden;
}
.pr-image {
  object-fit: cover;
}
/* tmagic 加载骨架条 */
.pr-tmagic-skeleton {
  margin: 8px 12px;
  height: 100%;
  min-height: 60px;
  border-radius: 12px;
  background: linear-gradient(90deg, #eef2ea 25%, #f7faf4 50%, #eef2ea 75%);
  background-size: 200% 100%;
  animation: pr-tmagic-shimmer 1.2s infinite;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: #8a9384;
}
@keyframes pr-tmagic-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
</style>
