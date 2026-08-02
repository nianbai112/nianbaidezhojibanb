<template>
  <div class="page-shell">
    <GlassPageHeader title="首页镜像" subtitle="用真实区域数据在后台复刻小程序首页，绿色角标为远程可配部分">
      <template #actions>
        <el-select v-model="regionId" placeholder="选择区域" style="width: 200px" @change="loadAll">
          <el-option v-for="r in regions" :key="r.id" :label="r.name" :value="r.id" />
        </el-select>
        <el-button :icon="Refresh" :loading="loading" @click="loadAll">刷新</el-button>
      </template>
    </GlassPageHeader>

    <div class="mirror-layout">
      <!-- 手机镜像 -->
      <div class="phone">
        <div class="phone-notch" />
        <div class="phone-status"><span>9:41</span><span class="sig">●●●</span></div>
        <div class="phone-screen">
          <!-- 导航栏 -->
          <div class="m-nav">
            <div class="m-nav-left">
              <span class="m-region-logo">{{ (region?.name || '灵').slice(0, 1) }}</span>
              <span class="m-region-name">{{ region?.name || '加载中…' }}</span>
            </div>
            <span class="m-nav-dot">···</span>
          </div>

          <!-- Hero + 搜索 -->
          <div class="m-section">
            <span class="m-badge code">代码内置</span>
            <div class="m-hero">
              <div class="m-hero-title">{{ heroTitle }}</div>
              <div class="m-hero-sub">{{ heroSubtitle }}</div>
              <div class="m-search"><span>🔍</span><span class="m-search-ph">{{ searchPlaceholder }}</span></div>
            </div>
          </div>

          <!-- 金刚区 -->
          <div class="m-section">
            <span class="m-badge remote">远程可配</span>
            <div class="m-grid">
              <div v-for="(m, i) in menuItems" :key="i" class="m-grid-item">
                <img v-if="isHttp(m.icon)" :src="m.icon" class="m-grid-icon" alt="" @error="onImgError" />
                <span v-else class="m-grid-icon m-grid-letter">{{ (m.title || '?').slice(0, 1) }}</span>
                <span class="m-grid-text">{{ m.title }}</span>
              </div>
              <div v-if="!menuItems.length" class="m-empty">未配置金刚区</div>
            </div>
          </div>

          <!-- 轮播 -->
          <div class="m-section" v-if="banners.length">
            <span class="m-badge remote">远程可配</span>
            <div class="m-banner">
              <img v-if="isHttp(banners[0])" :src="banners[0]" alt="" @error="onImgError" />
              <span v-else class="m-banner-ph">轮播图（{{ banners.length }} 张 · 小程序本地素材）</span>
            </div>
          </div>

          <!-- 热榜 -->
          <div class="m-section">
            <span class="m-badge data">实时数据</span>
            <div class="m-hot">
              <span class="m-hot-tag">热</span>
              <span class="m-hot-text">{{ hotPosts[0]?.title || hotPosts[0]?.content || '暂无热榜内容' }}</span>
            </div>
          </div>

          <!-- 帖子流 -->
          <div class="m-section">
            <span class="m-badge data">实时数据</span>
            <div class="m-feed">
              <div v-for="p in posts" :key="p.id" class="m-post">
                <div class="m-post-head">
                  <img v-if="isHttp(p.user?.avatar)" :src="p.user.avatar" class="m-avatar" alt="" @error="onImgError" />
                  <span v-else class="m-avatar m-avatar-letter">{{ (p.user?.nickname || '匿').slice(0, 1) }}</span>
                  <div class="m-post-meta">
                    <div class="m-post-name">{{ p.user?.nickname || '匿名用户' }}</div>
                    <div class="m-post-time">{{ formatTime(p.createdAt || p.created_at) }}</div>
                  </div>
                </div>
                <div class="m-post-body">{{ p.title || p.content }}</div>
                <div class="m-post-foot">
                  <span>♡ {{ p.likeCount ?? p.like_count ?? 0 }}</span>
                  <span>💬 {{ p.commentCount ?? p.comment_count ?? 0 }}</span>
                </div>
              </div>
              <div v-if="!posts.length" class="m-empty">该区域暂无帖子</div>
            </div>
          </div>
        </div>

        <!-- TabBar -->
        <div class="m-tabbar">
          <div v-for="(t, i) in tabbar" :key="i" class="m-tab" :class="{ active: i === 0 }">
            <span class="m-tab-icon">{{ tabIcon(t) }}</span>
            <span class="m-tab-text">{{ t.text || t.name }}</span>
          </div>
        </div>
        <div class="phone-home" />
      </div>

      <!-- 侧栏说明 -->
      <div class="side">
        <div class="glass-card side-card">
          <div class="side-title">这是什么</div>
          <p>这是小程序首页在后台的<b>高保真镜像</b>：用区域真实配置和实时数据渲染，和你在线上看到的版式一一对应。</p>
        </div>
        <div class="glass-card side-card">
          <div class="side-title">角标含义</div>
          <div class="legend"><span class="m-badge remote">远程可配</span><p>后台改完立即生效，不用重新上传。去「首页布局 / 区域页面装修 / TabBar 配置」改。</p></div>
          <div class="legend"><span class="m-badge code">代码内置</span><p>写死在小程序代码里，只能改源码重新上传。主题和 app.json 可在「代码包与主题」页改。</p></div>
          <div class="legend"><span class="m-badge data">实时数据</span><p>用户产生的内容（帖子、热榜），后台只展示不编辑。</p></div>
        </div>
        <div class="glass-card side-card">
          <div class="side-title">数据概况</div>
          <div class="stat-row"><span>金刚区入口</span><b>{{ menuItems.length }}</b></div>
          <div class="stat-row"><span>轮播图</span><b>{{ banners.length }}</b></div>
          <div class="stat-row"><span>热榜内容</span><b>{{ hotPosts.length }}</b></div>
          <div class="stat-row"><span>最新帖子</span><b>{{ posts.length }}</b></div>
          <div class="stat-row"><span>TabBar 项</span><b>{{ tabbar.length }}</b></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { request } from '@/api/request'
import GlassPageHeader from '@/components/glass/GlassPageHeader.vue'

const regions = ref<any[]>([])
const regionId = ref('')
const region = ref<any>(null)
const menuItems = ref<any[]>([])
const banners = ref<string[]>([])
const hotPosts = ref<any[]>([])
const posts = ref<any[]>([])
const tabbar = ref<any[]>([])
const loading = ref(false)

const heroTitle = computed(() => region.value?.name || '灵萌校园')
const heroSubtitle = computed(() => region.value?.description || '发现校园美好生活')
const searchPlaceholder = computed(() => '搜索校园生活')

const isHttp = (v: string) => /^https?:\/\//.test(String(v || ''))
const onImgError = (e: Event) => {
  (e.target as HTMLImageElement).style.display = 'none'
}
const formatTime = (t: string) => (t ? String(t).slice(0, 10) : '')
const tabIcon = (t: any) => {
  const map: Record<string, string> = { home: '🏠', containers: '📦', news: '💬', auth: '👤' }
  const key = String(t.id || t.pagePath || '')
  return map[key] || '●'
}

async function loadRegions() {
  const res: any = await request.get('/regions')
  regions.value = Array.isArray(res) ? res : res?.data?.list || res?.list || []
  if (!regionId.value && regions.value.length) {
    regionId.value = regions.value[0].id || regions.value[0].region_id
  }
}

async function loadAll() {
  if (!regionId.value) return
  loading.value = true
  const rid = regionId.value
  const safe = (p: Promise<any>, fb: any) => p.catch(() => fb)
  try {
    const [regionRes, contentRes, hotRes, postsRes, tabbarRes] = await Promise.all([
      safe(request.get(`/regions/${rid}`), null),
      safe(request.get('/region/home-page-content', { params: { region_id: rid } }), null),
      safe(request.get(`/posts/featured-hot-posts/${rid}`), null),
      safe(request.get(`/posts/region-posts/${rid}`, { params: { page: 1, limit: 6 } }), null),
      safe(request.get(`/regions/${rid}/tabbar`), null),
    ])

    region.value = regionRes
    const items = contentRes?.data?.items || contentRes?.items || []
    menuItems.value = items.filter((i: any) => i.module_type === 'menu' && i.is_show !== false)
    const carousel = regionRes?.carouselImages || regionRes?.carousel_images || []
    banners.value = (Array.isArray(carousel) ? carousel : []).map((b: any) => b.image || b.url || b).filter(Boolean)
    hotPosts.value = hotRes?.list || hotRes?.posts || hotRes?.data || []
    posts.value = postsRes?.list || postsRes?.posts || postsRes?.data || []
    const tabs = tabbarRes?.list || tabbarRes?.tabs || tabbarRes?.data?.list || []
    tabbar.value = tabs.filter((t: any) => t.enabled !== false)
  } catch (e) {
    ElMessage.error('加载镜像数据失败')
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  try {
    await loadRegions()
    await loadAll()
  } catch {
    ElMessage.error('加载区域列表失败')
  }
})
</script>

<style scoped lang="scss">
.mirror-layout {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 24px;
  align-items: start;
  justify-content: center;
}

/* ===== 手机壳 ===== */
.phone {
  width: 350px;
  border: 3px solid #172033;
  border-radius: 40px;
  background: #f4f7f1;
  overflow: hidden;
  box-shadow: 0 16px 40px rgba(15, 23, 42, .14);
  position: sticky;
  top: 16px;
}
.phone-notch {
  width: 110px;
  height: 22px;
  background: #172033;
  border-radius: 0 0 14px 14px;
  margin: 0 auto;
}
.phone-status {
  display: flex;
  justify-content: space-between;
  padding: 6px 20px 8px;
  font-size: 11px;
  font-weight: 700;
}
.sig { letter-spacing: 2px; font-size: 8px; }
.phone-screen {
  height: 600px;
  overflow-y: auto;
  background: #f4f7f1;
  padding-bottom: 12px;
}
.phone-home {
  width: 100px;
  height: 4px;
  border-radius: 999px;
  background: #172033;
  margin: 6px auto 10px;
}

/* ===== 角标 ===== */
.m-section { position: relative; }
.m-badge {
  position: absolute;
  top: 2px;
  right: 12px;
  z-index: 3;
  font-size: 10px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 999px;
}
.m-badge.remote { background: #e7f8f2; color: #0d9467; }
.m-badge.code { background: #f0f1f3; color: #64748b; }
.m-badge.data { background: #e9effd; color: #2563eb; }

/* ===== 导航 / Hero ===== */
.m-nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px;
}
.m-nav-left { display: flex; align-items: center; gap: 8px; }
.m-region-logo {
  width: 26px; height: 26px;
  border-radius: 8px;
  background: #36a853;
  color: #fff;
  font-size: 13px; font-weight: 700;
  display: grid; place-items: center;
}
.m-region-name { font-size: 15px; font-weight: 700; color: #1d271f; }
.m-nav-dot { color: #8a9384; font-weight: 700; }

.m-hero { padding: 10px 16px 14px; }
.m-hero-title { font-size: 21px; font-weight: 800; color: #1d271f; }
.m-hero-sub { font-size: 12px; color: #8a9384; margin-top: 4px; }
.m-search {
  margin-top: 12px;
  background: #fff;
  border-radius: 999px;
  padding: 9px 14px;
  display: flex; align-items: center; gap: 8px;
  box-shadow: 0 2px 8px rgba(38, 58, 32, .06);
}
.m-search-ph { color: #8a9384; font-size: 12px; }

/* ===== 金刚区 ===== */
.m-grid {
  margin: 4px 12px;
  background: #fff;
  border-radius: 14px;
  padding: 14px 0 6px;
  display: flex;
  flex-wrap: wrap;
  box-shadow: 0 2px 8px rgba(38, 58, 32, .06);
}
.m-grid-item {
  width: 25%;
  display: flex; flex-direction: column; align-items: center;
  padding: 6px 0 12px;
  box-sizing: border-box;
}
.m-grid-icon { width: 40px; height: 40px; border-radius: 14px; margin-bottom: 5px; }
.m-grid-letter {
  background: #e8f3e4; color: #36a853;
  font-size: 16px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
}
.m-grid-text { font-size: 11px; color: #1d271f; }

/* ===== 轮播 / 热榜 ===== */
.m-banner {
  margin: 8px 12px;
  height: 110px;
  border-radius: 12px;
  background: #e8f3e4;
  overflow: hidden;
  display: flex; align-items: center; justify-content: center;
}
.m-banner img { width: 100%; height: 100%; object-fit: cover; }
.m-banner-ph { color: #55604f; font-size: 12px; }
.m-hot {
  margin: 8px 12px;
  background: #fff;
  border-radius: 10px;
  padding: 9px 12px;
  display: flex; align-items: center; gap: 8px;
  box-shadow: 0 2px 8px rgba(38, 58, 32, .06);
}
.m-hot-tag {
  background: #ff4d4f; color: #fff;
  font-size: 10px; font-weight: 700;
  padding: 1px 6px; border-radius: 4px;
}
.m-hot-text {
  font-size: 12px; color: #1d271f;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

/* ===== 帖子流 ===== */
.m-feed { margin: 8px 12px; display: grid; gap: 8px; }
.m-post {
  background: #fff;
  border-radius: 12px;
  padding: 12px;
  box-shadow: 0 2px 8px rgba(38, 58, 32, .06);
}
.m-post-head { display: flex; align-items: center; gap: 8px; }
.m-avatar { width: 28px; height: 28px; border-radius: 50%; }
.m-avatar-letter {
  background: #e8f3e4; color: #36a853;
  font-size: 12px; font-weight: 700;
  display: grid; place-items: center;
}
.m-post-name { font-size: 12px; font-weight: 700; color: #1d271f; }
.m-post-time { font-size: 10px; color: #8a9384; }
.m-post-body {
  margin-top: 8px;
  font-size: 12.5px; color: #1d271f; line-height: 1.5;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden;
}
.m-post-foot {
  margin-top: 8px;
  display: flex; gap: 16px;
  font-size: 11px; color: #8a9384;
}
.m-empty { padding: 24px 0; text-align: center; color: #8a9384; font-size: 12px; width: 100%; }

/* ===== TabBar ===== */
.m-tabbar {
  display: flex;
  background: #fff;
  border-top: 1px solid #eef2e8;
  padding: 6px 0 2px;
}
.m-tab {
  flex: 1;
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  color: #8a9384;
}
.m-tab.active { color: #36a853; }
.m-tab-icon { font-size: 16px; }
.m-tab-text { font-size: 10px; }

/* ===== 侧栏 ===== */
.side { display: grid; gap: 16px; max-width: 460px; }
.side-card { padding: 16px 18px; }
.side-title { font-size: 15px; font-weight: 700; color: var(--mx-text); margin-bottom: 10px; }
.side-card p { color: var(--mx-sub); font-size: 13px; line-height: 1.7; }
.legend { display: flex; gap: 12px; align-items: flex-start; margin-top: 10px; }
.legend .m-badge { position: static; flex: 0 0 auto; margin-top: 2px; }
.legend p { flex: 1; margin: 0; font-size: 12.5px; }
.stat-row {
  display: flex; justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid var(--mx-border);
  font-size: 13px; color: var(--mx-sub);
}
.stat-row:last-child { border-bottom: 0; }
.stat-row b { color: var(--mx-text); font-variant-numeric: tabular-nums; }

@media (max-width: 1100px) {
  .mirror-layout { grid-template-columns: 1fr; }
  .phone { margin: 0 auto; position: static; }
  .side { max-width: none; }
}
</style>
