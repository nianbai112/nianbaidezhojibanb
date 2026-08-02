<template>
  <!-- 真机榜单卡复刻：DOM/class 对齐 components/xiaoyi-home-rank-cards/xiaoyi-home-rank-cards.wxml -->
  <div class="native-rank">
    <div class="home-rank-cards">
      <div class="rank-scroll">
        <div class="rank-scroll-content">
          <!-- 话题榜 -->
          <div class="rank-card">
            <div class="card-header">
              <div class="header-pill topic-pill">
                <span class="txtIcon icon-huatifuhao" />
                <span class="pill-text">话题榜</span>
              </div>
              <div class="header-arrow">
                <span class="txtIcon icon-youyizhishiqi" />
              </div>
            </div>
            <div class="card-body">
              <div v-for="t in topics" :key="t.name" class="row">
                <div class="row-left">
                  <div class="row-icon df">
                    <span class="txtIcon icon-huatifuhao" />
                  </div>
                  <div class="row-main">
                    <span class="row-title ohto">{{ t.name }}</span>
                    <span class="row-sub">话题共计 {{ t.count }} 笔记</span>
                  </div>
                </div>
                <div class="row-right">
                  <div class="badge hot">热议</div>
                </div>
              </div>
            </div>
          </div>
          <!-- 热帖榜 -->
          <div class="rank-card">
            <div class="card-header">
              <div class="header-pill hot-pill">
                <span class="txtIcon icon-hot-o" />
                <span class="pill-text">热帖榜</span>
              </div>
              <div class="header-arrow">
                <span class="txtIcon icon-youyizhishiqi" />
              </div>
            </div>
            <div class="card-body">
              <div v-for="(p, i) in hotPosts" :key="p.title" class="row hot-row">
                <div class="rank-badge" :class="`rank-${i + 1}`">{{ i + 1 }}</div>
                <img class="thumb" :src="p.thumb" alt="" />
                <div class="row-main hot-main">
                  <span class="row-title ohto">{{ p.title }}</span>
                  <span class="row-sub">{{ p.views }}预览</span>
                </div>
              </div>
            </div>
          </div>
          <!-- 优质榜单 -->
          <div class="rank-card">
            <div class="card-header">
              <div class="header-pill quality-pill">
                <span class="txtIcon icon-star-o" />
                <span class="pill-text">优质榜单</span>
              </div>
              <div class="header-arrow">
                <span class="txtIcon icon-youyizhishiqi" />
              </div>
            </div>
            <div class="card-body">
              <div v-for="(u, i) in users" :key="u.name" class="row user-row">
                <div class="row-left user-left">
                  <div class="rank-badge" :class="`rank-${i + 1}`">{{ i + 1 }}</div>
                  <img class="avatar" :src="u.avatar" alt="" />
                  <div class="row-main user-main">
                    <span class="row-title ohto">{{ u.name }}</span>
                    <span class="row-sub ohto">{{ u.fans }}粉丝 · {{ u.notes }}笔记</span>
                  </div>
                </div>
                <div class="row-right">
                  <div class="badge quality">优质</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="scroll-hint df">
        <span class="hint-text">左右滑动查看更多</span>
        <span class="txtIcon icon-youyizhishiqi hint-icon" />
      </div>
    </div>
    <div class="native-note">{{ source === 'real' ? '热帖榜为真实数据' : '演示数据 · 线上为真实内容' }}</div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { request } from '@/api/request'
import { ensureCanvasTheme, injectRealWxss, realImage } from './realWxss'
import { ensureIconfont } from './iconfont'

const props = withDefaults(defineProps<{ regionId?: string }>(), { regionId: 'global' })

const source = ref<'real' | 'demo'>('demo')

const topics = ref([
  { name: '期末复习互助', count: 328 },
  { name: '校园美食地图', count: 256 },
  { name: '二手闲置交换', count: 189 },
])

const hotPosts = ref([
  { title: '后街糖水铺测评合集', views: '2.1万', thumb: realImage(0).url },
  { title: '图书馆抢座攻略 3.0', views: '1.8万', thumb: realImage(1).url },
  { title: '宿舍自制简易早餐', views: '1.5万', thumb: realImage(2).url },
])

const users = ref([
  { name: '青团日记', fans: '1.2万', notes: 86, avatar: realImage(0).url },
  { name: '东门干饭王', fans: '8,934', notes: 64, avatar: realImage(1).url },
  { name: '自习室观察员', fans: '6,210', notes: 52, avatar: realImage(2).url },
])

function fmtViews(n: any): string {
  const v = Number(n) || 0
  return v >= 10000 ? `${(v / 10000).toFixed(1)}万` : String(v)
}

/** 热帖榜接真实热帖接口；话题/优质榜无公开接口，保留演示结构（真实图片位） */
async function loadRealHot() {
  try {
    const res: any = await request.get(`/posts/hot-posts/${props.regionId || 'global'}`, {
      params: { page: 1, limit: 3 },
    })
    const list = res?.list || res?.posts || res?.data || []
    if (Array.isArray(list) && list.length) {
      hotPosts.value = list.slice(0, 3).map((p: any, i: number) => ({
        title: p.title || String(p.content || '').slice(0, 14) || '热帖',
        views: fmtViews(p.viewCount ?? p.view_count ?? p.views),
        thumb: (Array.isArray(p.images) && p.images[0]) || p.cover || realImage(i).url,
      }))
      source.value = 'real'
      return
    }
    console.warn(`[native-rank] 区域 ${props.regionId || 'global'} 暂无真实热帖，回退演示数据`)
  } catch (e) {
    console.warn('[native-rank] 真实热帖拉取失败，回退演示数据', e)
  }
}

onMounted(() => {
  injectRealWxss('native-rank-wxss', [
    { path: 'components/xiaoyi-home-rank-cards/xiaoyi-home-rank-cards.wxss', scope: '.native-rank' },
  ])
  ensureCanvasTheme()
  ensureIconfont()
  loadRealHot()
})
</script>

<style scoped>
.native-rank {
  pointer-events: none;
}
/* scroll-view scroll-x → 横向滚动 */
.rank-scroll {
  overflow-x: auto;
  scrollbar-width: none;
}
.rank-scroll::-webkit-scrollbar {
  display: none;
}
.thumb,
.avatar {
  object-fit: cover;
  display: block;
}
.native-note {
  padding: 0 0 8px;
  text-align: center;
  font-size: 10px;
  color: var(--text-tertiary, #8a9384);
}
</style>
