const ACCENTS = [
  'linear-gradient(135deg, #58d77b 0%, #fff06a 52%, #ff9b54 100%)',
  'linear-gradient(135deg, #44c8ff 0%, #a6f37a 50%, #ffe66a 100%)',
  'linear-gradient(135deg, #ffb74d 0%, #ffe36d 48%, #87e58c 100%)',
  'linear-gradient(135deg, #7bdcff 0%, #f8ff82 45%, #70df74 100%)',
]

export const fallbackHotPosts = [
  {
    id: 'fallback-1',
    title: '今天操场晚霞绝了',
    summary: '有人在操场拍到了很亮的云，评论区已经开始约夜跑搭子。',
    author: '灵萌同学',
    circleName: '校园生活',
    cover: '/product/map.jpg',
    avatar: '/brand/mascot.png',
    heat: 986,
    rank: 1,
    stats: '986 热度 · 128 喜欢 · 24 评论',
    createdAt: '',
    accent: ACCENTS[0],
  },
  {
    id: 'fallback-2',
    title: '食堂新窗口试吃反馈',
    summary: '烤鸡饭、冰粉和柠檬茶被同学们刷屏，最热回复已经整理出避雷和推荐。',
    author: '校园观察员',
    circleName: '新鲜事',
    cover: '',
    avatar: '/brand/mascot.png',
    heat: 742,
    rank: 2,
    stats: '742 热度 · 96 喜欢 · 31 评论',
    createdAt: '',
    accent: ACCENTS[1],
  },
  {
    id: 'fallback-3',
    title: '失物招领：钥匙扣在操场附近',
    summary: '同学捡到一个绿色挂件钥匙扣，热帖已经帮它找到不少线索。',
    author: '热心同学',
    circleName: '求助',
    cover: '',
    avatar: '/brand/mascot.png',
    heat: 621,
    rank: 3,
    stats: '621 热度 · 72 喜欢 · 18 评论',
    createdAt: '',
    accent: ACCENTS[2],
  },
  {
    id: 'fallback-4',
    title: '毕业季闲置交换清单',
    summary: '小书桌、台灯、收纳盒和教材都在流转，评论区很快配对成功。',
    author: '二手小站',
    circleName: '二手闲置',
    cover: '',
    avatar: '/brand/mascot.png',
    heat: 508,
    rank: 4,
    stats: '508 热度 · 64 喜欢 · 15 评论',
    createdAt: '',
    accent: ACCENTS[3],
  },
]

export function listFrom(payload) {
  const data = payload?.data || payload
  if (Array.isArray(data)) return data
  return data?.list || data?.rows || data?.items || data?.posts || data?.records || []
}

export function normalizeHotPost(post, index = 0) {
  const media = Array.isArray(post?.media) ? post.media : []
  const firstImage = media.find((item) => item?.type === 'IMAGE' && item?.url)
  const firstVideo = media.find((item) => item?.type === 'VIDEO' && (item?.thumb || item?.url))
  const images = Array.isArray(post?.images) ? post.images.filter(Boolean) : []
  const content = String(post?.content || post?.text || '').trim()
  const rawTitle = String(post?.title || '').trim()
  const title = rawTitle || content.slice(0, 34) || '校园热帖'
  const user = post?.user || post?.author || {}
  const viewCount = numberOf(post?.view_count ?? post?.viewCount)
  const likeCount = numberOf(post?.like_count ?? post?.likeCount)
  const commentCount = numberOf(post?.comment_count ?? post?.commentCount)
  const cover = String(post?.cover_url || post?.coverUrl || images[0] || firstImage?.url || firstVideo?.thumb || '').trim()

  return {
    id: String(post?.id || post?.post_id || `hot-${index}`),
    title,
    summary: content || '这条热帖暂时没有正文，但已经在校园里被很多同学看见。',
    author: user?.nickname || post?.nickname || post?.name || '灵萌同学',
    avatar: user?.avatar || post?.avatar || '/brand/mascot.png',
    circleName: post?.circle_name || post?.circleName || post?.circle?.name || '校园广场',
    cover,
    heat: likeCount * 12 + commentCount * 24 + viewCount,
    rank: index + 1,
    stats: `${viewCount} 浏览 · ${likeCount} 喜欢 · ${commentCount} 评论`,
    createdAt: post?.created_at || post?.createdAt || '',
    accent: ACCENTS[index % ACCENTS.length],
  }
}

export function getHotPostCards(payload) {
  const cards = listFrom(payload)
    .map((post, index) => normalizeHotPost(post, index))
    .filter((post) => post.id)

  return cards.length ? cards : fallbackHotPosts
}

function numberOf(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : 0
}
