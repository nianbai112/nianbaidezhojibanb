<template>
  <!-- 真机笔记卡复刻：DOM/class 对齐 components/xiaoyi-NotesCard/xiaoyi-NotesCard.wxml -->
  <div class="native-feed">
    <div v-for="note in notes" :key="note.id" class="gg-box">
      <div class="gg-header">
        <div class="gg-avatar">
          <img class="gg-avatar-img" :src="note.avatar" alt="" :style="{ objectPosition: note.avatarPos }" />
        </div>
        <div class="gg-user-info">
          <div class="gg-user-main df">
            <div class="name ohto">{{ note.name }}</div>
            <div class="tag df">
              <div class="gender-icon" :class="note.gender">
                <span class="txtIcon" :class="note.gender === 'gender-female' ? 'icon-nv1' : 'icon-nan1'" />
              </div>
              <span class="age-text">{{ note.age }}</span>
            </div>
            <span v-if="note.featured" class="featured-tag">精选</span>
            <span v-if="note.hot" class="hot-tag">热点</span>
          </div>
        </div>
      </div>
      <div class="gg-content">
        <div class="gg-item-content ohto2">{{ note.content }}</div>
        <div v-if="note.topics.length" class="note-topic-list">
          <div v-for="t in note.topics" :key="t" class="note-topic-tag">
            <span class="txtIcon icon-huatifuhao topic-icon" />
            <span class="topic-text">{{ t }}</span>
          </div>
        </div>
        <div v-if="note.images.length" class="gg-item-file">
          <div v-for="(img, i) in note.images" :key="i" class="file-img">
            <img class="file-img-el" :src="img.url" :style="{ objectPosition: img.position }" alt="" />
          </div>
        </div>
        <div class="gg-item-time">{{ note.time }} <template v-if="note.area"> · {{ note.area }}</template> · 浏览 {{ note.views }}</div>
        <div class="gg-item-unm df">
          <div class="unm-item">
            <span class="txtIcon icon-pinglun_16" />
            <span>{{ note.comments }} 评论</span>
          </div>
          <div class="unm-item">
            <span class="txtIcon icon-like-o" />
            <span>{{ note.likes }} 点赞</span>
          </div>
          <div class="unm-item" style="margin-left: auto">
            <span class="txtIcon icon-fasong1" />
          </div>
        </div>
      </div>
    </div>
    <div v-if="showNote" class="native-note">{{ source === 'real' ? '真实帖子数据 · 与线上一致' : '演示数据 · 线上为真实内容' }}</div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { request } from '@/api/request'
import { demoAvatar, ensureCanvasTheme, injectRealWxss, realImage } from './realWxss'
import { ensureIconfont } from './iconfont'

const props = withDefaults(defineProps<{ variant?: string; showNote?: boolean; regionId?: string }>(), {
  variant: 'feed',
  showNote: true,
  regionId: 'global',
})

interface NoteImage { url: string; position: string }
interface NoteVM {
  id: string; name: string; gender: string; age: string; avatar: string; avatarPos: string
  featured: boolean; hot: boolean; content: string; topics: string[]
  images: NoteImage[]; time: string; area: string; views: string | number; comments: number | string; likes: number | string
}

const notes = ref<NoteVM[]>([])
const source = ref<'real' | 'demo'>('demo')

/** 写死的兜底演示数据（图片位使用 uploads 真实帖子照片） */
function demoNotes(): NoteVM[] {
  return [
    {
      id: 'n1',
      name: '念白',
      gender: 'gender-male',
      age: '20岁',
      avatar: realImage(0).url,
      avatarPos: 'center',
      featured: props.variant === 'hot-posts',
      hot: false,
      content: '后街新开的糖水铺真的绝了🍧 双皮奶一口回到广州，老板说食材每天现做，下午四点就卖完，想吃的姐妹早点去！',
      topics: ['校园美食', '糖水铺'],
      images: [realImage(0), realImage(1), realImage(2)],
      time: '2小时前',
      area: '东区',
      views: '1.2万',
      comments: 128,
      likes: 892,
    },
    {
      id: 'n2',
      name: '图书馆常驻人口',
      gender: 'gender-male',
      age: '22岁',
      avatar: demoAvatar(3, '图'),
      avatarPos: 'center',
      featured: false,
      hot: props.variant === 'hot-posts',
      content: '期末复习搭子有无？每天早上八点到晚上十点，三楼靠窗老位置，自带插排和咖啡，安静互不打扰型。',
      topics: ['期末复习', '自习搭子'],
      images: [],
      time: '5小时前',
      area: '',
      views: '3,456',
      comments: 46,
      likes: 233,
    },
  ]
}

/** 相对时间（与真机口吻一致） */
function relativeTime(t: any): string {
  const d = t ? new Date(t) : null
  if (!d || isNaN(d.getTime())) return '刚刚'
  const diff = Date.now() - d.getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min}分钟前`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour}小时前`
  const day = Math.floor(hour / 24)
  if (day < 30) return `${day}天前`
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

function fmtCount(n: any): string | number {
  const v = Number(n) || 0
  return v >= 10000 ? `${(v / 10000).toFixed(1)}万` : v
}

/** 真实帖子 → 卡片视图模型（字段按 post.service formatMiniPost 防御式映射） */
function mapPost(p: any, i: number): NoteVM {
  const user = p.user || p.author || {}
  const images: NoteImage[] = (Array.isArray(p.images) ? p.images : [])
    .map((x: any) => (typeof x === 'string' ? x : x?.url || x?.src || ''))
    .filter(Boolean)
    .slice(0, 9)
    .map((url: string) => ({ url, position: 'center' }))
  const topics = (Array.isArray(p.topics) ? p.topics : [])
    .map((t: any) => t?.name || t?.title || t?.topic?.name || '')
    .filter(Boolean)
    .slice(0, 3)
  return {
    id: p.id || `post_${i}`,
    name: user.nickname || user.name || '校园用户',
    gender: Number(user.gender) === 2 ? 'gender-female' : 'gender-male',
    age: user.age ? `${user.age}岁` : '',
    avatar: user.avatar || realImage(i).url,
    avatarPos: 'center',
    featured: !!p.isFeatured,
    hot: !!p.isHot,
    content: p.content || p.text || p.title || '',
    topics,
    images,
    time: relativeTime(p.createdAt || p.created_at),
    area: '',
    views: fmtCount(p.viewCount ?? p.view_count ?? p.views),
    comments: fmtCount(p.commentCount ?? p.comment_count ?? p.comments),
    likes: fmtCount(p.likeCount ?? p.like_count ?? p.likes),
  }
}

/** 拉真实帖子；拉不到（无数据/接口失败）回退演示数据 */
async function loadRealPosts() {
  try {
    const res: any = await request.get(`/posts/region-posts/${props.regionId || 'global'}`, {
      params: { page: 1, limit: 4 },
    })
    const list = res?.list || res?.posts || res?.data || []
    const mapped = (Array.isArray(list) ? list : []).slice(0, 2).map(mapPost)
    if (mapped.length) {
      notes.value = mapped
      source.value = 'real'
      return
    }
    console.warn(`[native-feed] 区域 ${props.regionId || 'global'} 暂无真实帖子，回退演示数据`)
  } catch (e) {
    console.warn('[native-feed] 真实帖子拉取失败，回退演示数据', e)
  }
  notes.value = demoNotes()
  source.value = 'demo'
}

onMounted(() => {
  injectRealWxss('native-feed-wxss', [
    { path: 'components/xiaoyi-NotesCard/xiaoyi-NotesCard.wxss', scope: '.native-feed' },
  ])
  ensureCanvasTheme()
  ensureIconfont()
  loadRealPosts()
})
</script>

<style scoped>
.native-feed {
  pointer-events: none;
}
/* xiaoyi-lazy-image → img 等效铺满 */
.gg-avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.file-img-el {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.unm-item span {
  font-size: 11px;
  color: var(--text-secondary, #55604f);
  margin-left: 3px;
}
.native-note {
  padding: 6px 0 8px;
  text-align: center;
  font-size: 10px;
  color: var(--text-tertiary, #8a9384);
  background: var(--bg-card, #fff);
}
</style>
