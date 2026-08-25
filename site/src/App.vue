<template>
  <main class="site-shell">
    <section v-if="isAgreementPage" class="agreement-page">
      <a class="back-home" href="/">← 返回灵萌官网</a>
      <article class="agreement-document">
        <p class="eyebrow">AGREEMENT / 协议说明</p>
        <h1>{{ agreement.title }}</h1>
        <div class="agreement-meta">
          <span>版本 {{ agreement.version }}</span>
          <span>更新时间 {{ agreement.updatedAt }}</span>
        </div>
        <div class="agreement-content" v-html="agreement.content"></div>
      </article>
    </section>

    <template v-else>
      <section id="home" class="hero-section">
        <div class="hero-media" aria-hidden="true">
          <video
            v-if="heroVideo"
            :src="heroVideo"
            :poster="heroPoster"
            autoplay
            muted
            loop
            playsinline
            preload="metadata"
          />
        </div>

        <header class="site-header">
          <a class="brand" href="#home" aria-label="灵萌官网首页">
            <img class="brand-logo" :src="brandLogo" alt="" />
            <span class="brand-name">{{ site.siteShortName || site.siteName }}</span>
          </a>
          <nav class="nav-links" aria-label="官网导航">
            <a href="#home">首页</a>
            <a href="#campus">校园生活</a>
            <a href="#map">校园地图</a>
            <a href="#circle">圈子</a>
            <a href="#discover">发现</a>
            <a href="#about">关于我们</a>
          </nav>
          <a class="header-download link-underline" href="#download">下载灵萌</a>
        </header>

        <div class="hero-grid">
          <p class="meta-line">
            <span>LINGMENG · CAMPUS LIFE</span>
            <span>校园本地生活 / 内容 · 圈子 · 服务</span>
            <span>2026 春 · 第 19 周</span>
          </p>
          <h1 class="hero-title">
            {{ heroTitle }}<span class="title-tag">{{ site.siteShortName || '灵萌' }}</span>
          </h1>
          <span class="hero-vertical" aria-hidden="true">校园本地生活・二〇二六</span>

          <div class="hero-copy">
            <p class="hero-sub">{{ heroSubtitle }}</p>
            <div id="download" class="download-row" aria-label="下载灵萌">
              <a
                v-for="entry in downloadEntries"
                :key="entry.key"
                class="download-badge"
                :class="entry.key"
                :href="entry.href || undefined"
                @click="handleDownloadClick(entry, $event)"
              >
                <span class="platform-mark">{{ platformMark(entry.key) }}</span>
                <span class="badge-text">
                  <small>{{ entry.eyebrow }}</small>
                  <strong>{{ entry.title }}</strong>
                </span>
                <span v-if="entry.key === 'miniapp' && miniappQr" class="qr-popover">
                  <img :src="miniappQr" alt="灵萌小程序二维码" />
                  <em>微信扫码进入</em>
                </span>
              </a>
            </div>
            <p class="hero-note">iOS — ANDROID — 微信小程序</p>
          </div>

          <div class="hero-figures">
            <figure class="figure figure-landscape hero-main">
              <div class="figure-frame">
                <img :src="heroPoster" alt="灵萌校园实景" />
                <span class="fig-badge">图·01</span>
              </div>
              <figcaption><span>今日校园</span><span>同学动态 · 2026.05 摄</span></figcaption>
            </figure>
            <figure class="figure figure-portrait hero-side">
              <div class="figure-frame">
                <img :src="storyImages[2]" alt="校园一隅" />
                <span class="fig-badge">图·02</span>
              </div>
              <figcaption><span>我的校园</span></figcaption>
            </figure>
            <span class="mascot-seal" aria-hidden="true">
              <img :src="mascotImage" alt="" />
            </span>
          </div>
        </div>

        <div class="hero-meta-row">
          <div class="meta-cell">
            <span class="meta-index">01</span>
            <strong>校园认证</strong>
            <span class="meta-desc">真实学生身份体系</span>
          </div>
          <div class="meta-cell">
            <span class="meta-index">02</span>
            <strong>内容安全</strong>
            <span class="meta-desc">审核与举报闭环</span>
          </div>
          <div class="meta-cell">
            <span class="meta-index">03</span>
            <strong>服务入口</strong>
            <span class="meta-desc">外卖跑腿商城一体</span>
          </div>
        </div>
      </section>

      <section id="campus" class="story-section">
        <header class="section-head">
          <p class="eyebrow">01 / CAMPUS STORY</p>
          <h2>校园的一天，在灵萌里展开</h2>
        </header>
        <div class="story-grid">
          <div class="section-copy">
            <p>看见同学，也看见生活。灵萌把校园里的真实瞬间收拢成一个轻快入口，让每一次打开都有熟悉的校园气息。</p>
            <a href="#download" class="text-link link-underline">继续往下看</a>
          </div>
          <div class="story-collage">
            <figure class="figure figure-landscape story-main">
              <div class="figure-frame">
                <img :src="storyImages[0]" alt="" />
                <span class="fig-badge">档·03</span>
              </div>
              <figcaption><span>清晨 · 校道</span><span>2026.04 摄</span></figcaption>
            </figure>
            <figure class="figure figure-portrait story-side top">
              <div class="figure-frame">
                <img :src="storyImages[1]" alt="" />
                <span class="fig-badge">档·04</span>
              </div>
              <figcaption><span>午后 · 图书馆</span></figcaption>
            </figure>
            <figure class="figure figure-portrait story-side bottom">
              <div class="figure-frame">
                <img :src="storyImages[2]" alt="" />
                <span class="fig-badge">档·05</span>
              </div>
              <figcaption><span>傍晚 · 运动场</span></figcaption>
            </figure>
          </div>
        </div>
      </section>

      <CampusMap />

      <section class="notice-section">
        <div class="notice-board">
          <div class="notice-board-head">
            <span>灵萌校园布告栏 · BULLETIN</span>
            <span>2026 春 · 第 19 周 · 共 3 则</span>
          </div>
          <article v-for="n in notices" :key="n.title" class="notice-item">
            <span class="notice-date">{{ n.date }}</span>
            <h3>{{ n.title }}</h3>
            <p>{{ n.desc }}</p>
            <span class="notice-tag">{{ n.tag }}</span>
          </article>
        </div>
      </section>

      <div class="marquee" aria-hidden="true">
        <div class="marquee-track">
          <div class="marquee-group">
            <span v-for="item in marqueeItems" :key="item">{{ item }}</span>
          </div>
          <div class="marquee-group">
            <span v-for="item in marqueeItems" :key="`${item}-dup`">{{ item }}</span>
          </div>
        </div>
      </div>

      <section id="circle" class="entry-section">
        <div class="entry-grid">
          <div class="entry-copy">
            <p class="eyebrow">03 / MINI PROGRAM</p>
            <h2>打开灵萌，进入你的校园</h2>
            <p>下载 App 或打开小程序，把校园入口留在手边。官网只做最重要的品牌、下载和联系。</p>
            <div class="entry-downloads">
              <a
                v-for="entry in downloadEntries"
                :key="entry.key"
                class="ruled-row"
                :href="entry.href || undefined"
                @click="handleDownloadClick(entry, $event)"
              >
                <span class="row-mark">{{ platformMark(entry.key) }}</span>
                <span class="row-label">{{ entry.label }}</span>
                <span class="row-arrow">→</span>
              </a>
            </div>
          </div>
          <div class="entry-exhibit">
            <figure class="qr-plate">
              <div class="qr-frame"><img :src="miniappQr" alt="灵萌小程序二维码" /></div>
              <figcaption>
                <strong>扫码体验小程序</strong>
                <span>微信扫码进入</span>
              </figcaption>
            </figure>
            <figure class="figure figure-landscape entry-preview">
              <div class="figure-frame"><img :src="previewImage" alt="" /></div>
              <figcaption><span>今日校园</span><span>属于你的校园入口</span></figcaption>
            </figure>
            <span class="mascot-seal dark" aria-hidden="true">
              <img :src="mascotImage" alt="" />
            </span>
          </div>
        </div>
      </section>

      <section id="discover" class="tile-section">
        <header class="section-head">
          <p class="eyebrow">04 / DISCOVER</p>
          <h2>发现校园的三种方式</h2>
        </header>
        <div class="tile-grid">
          <article v-for="(tile, i) in tiles" :key="tile.title" class="tile">
            <span class="tile-index">{{ ['01', '02', '03'][i] }}</span>
            <figure class="figure figure-landscape">
              <div class="figure-frame">
                <img :src="tile.image" alt="" />
                <span class="fig-badge">档·0{{ i + 6 }}</span>
              </div>
            </figure>
            <strong>{{ tile.title }}</strong>
          </article>
        </div>
      </section>

      <section id="about" class="cooperation-section">
        <figure class="figure figure-portrait cooperation-photo">
          <div class="figure-frame"><img :src="cooperationImage" alt="" /></div>
          <figcaption><span>校园共建 · 区域合作</span></figcaption>
        </figure>
        <div class="cooperation-card">
          <p class="eyebrow">05 / COOPERATION</p>
          <h2>{{ site.cooperation.title }}</h2>
          <p>{{ site.cooperation.subtitle }}</p>
          <div class="cooperation-options">
            <span class="ruled-row static"><span class="row-label">合作咨询</span><span class="row-arrow">→</span></span>
            <span class="ruled-row static"><span class="row-label">商家入驻</span><span class="row-arrow">→</span></span>
            <span class="ruled-row static"><span class="row-label">区域合作</span><span class="row-arrow">→</span></span>
          </div>
          <div class="contact-lines">
            <a v-if="site.contact.email" :href="`mailto:${site.contact.email}`" class="link-underline">{{ site.contact.email }}</a>
            <a v-if="site.contact.phone" :href="`tel:${site.contact.phone}`" class="link-underline">{{ site.contact.phone }}</a>
            <span v-if="site.contact.wechat">微信 {{ site.contact.wechat }}</span>
          </div>
          <a href="#download" class="primary-link">提交合作意向</a>
        </div>
      </section>

      <footer class="site-footer">
        <div class="footer-grid">
          <div class="footer-brand-block">
            <a class="footer-brand" href="#home">
              <img :src="brandLogo" alt="" />
              <strong>{{ site.siteShortName || site.siteName }}</strong>
            </a>
            <p>{{ site.description }}</p>
          </div>
          <nav class="footer-nav">
            <a href="#home">首页</a>
            <a href="#campus">校园生活</a>
            <a href="#map">校园地图</a>
            <a href="#circle">圈子</a>
            <a href="#discover">发现</a>
            <a href="#about">关于我们</a>
            <a href="/agreement/terms">用户协议</a>
            <a href="/agreement/privacy">隐私政策</a>
          </nav>
        </div>
        <div class="footer-wordmark" aria-hidden="true">{{ site.siteShortName || site.siteName }}</div>
        <div class="footer-meta">
          <span>{{ site.compliance.copyright }}</span>
          <span v-if="site.compliance.icpNumber">{{ site.compliance.icpNumber }}</span>
          <a v-if="site.compliance.policeLink" :href="site.compliance.policeLink">{{ site.compliance.policeNumber }}</a>
          <span v-else-if="site.compliance.policeNumber">{{ site.compliance.policeNumber }}</span>
        </div>
      </footer>
    </template>
  </main>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive } from 'vue'
import { fallbackSite, getDownloadEntries, normalizePublicSiteData } from './websiteConfig.js'
import { initSiteMotion, refreshMotion } from './motion.js'
import CampusMap from './CampusMap.vue'

type PublicSiteData = typeof fallbackSite

type AgreementData = {
  title: string
  content: string
  version: string
  updatedAt: string
}

const site = reactive<PublicSiteData>(normalizePublicSiteData(fallbackSite))

const agreement = reactive<AgreementData>({
  title: '用户协议',
  content: '<p>平台暂未发布该协议内容，请联系运营方完善。</p>',
  version: '1.0.0',
  updatedAt: '待发布',
})

const agreementType = computed(() => {
  const path = window.location.pathname.replace(/\/+$/, '')
  if (path === '/agreement/privacy') return 'PRIVACY_POLICY'
  if (path === '/agreement/terms') return 'TERMS_OF_SERVICE'
  return ''
})

const isAgreementPage = computed(() => Boolean(agreementType.value))
const brandLogo = computed(() => mediaUrl(site.siteLogo || site.logo || fallbackSite.siteLogo))
const heroVideo = computed(() => mediaUrl(site.heroVideoUrl || ''))
const heroPoster = computed(() => mediaUrl(site.heroPosterUrl || site.heroImageUrl || fallbackSite.heroPosterUrl))
const mascotImage = computed(() => mediaUrl(site.mascotUrl || fallbackSite.mascotUrl))
const previewImage = computed(() => mediaUrl(site.previewImageUrl || fallbackSite.previewImageUrl))
const miniappQr = computed(() => mediaUrl(site.miniappQrUrl || fallbackSite.miniappQrUrl))
const heroTitle = computed(() => site.heroTitle || fallbackSite.heroTitle)
const heroSubtitle = computed(() => site.heroSubtitle || site.slogan || fallbackSite.heroSubtitle)
const downloadEntries = computed(() => getDownloadEntries(site))
const storyImages = computed(() => [
  mediaUrl(site.storyImageOneUrl || fallbackSite.storyImageOneUrl),
  mediaUrl(site.storyImageTwoUrl || fallbackSite.storyImageTwoUrl),
  mediaUrl(site.storyImageThreeUrl || fallbackSite.storyImageThreeUrl),
])
const cooperationImage = computed(() => mediaUrl(site.cooperationImageUrl || fallbackSite.cooperationImageUrl))

const tiles = computed(() => [
  { title: '属于校园的内容', image: storyImages.value[0] },
  { title: '发现身边的精彩', image: storyImages.value[1] },
  { title: '连接真实的校园', image: heroPoster.value },
])

const marqueeItems = computed(() => [
  '05.12 认证通道开放', '05.14 商家入驻招募', '05.18 失物招领上线', '校园外卖 每日达', '跑腿代购 即时响应', '宿舍小店 持续上新',
])

const notices = [
  { date: '2026.05.12', title: '校园认证通道正式开放', desc: '新生完成学生身份认证，解锁圈子、外卖、跑腿等全部校园功能。', tag: '认证' },
  { date: '2026.05.14', title: '校园外卖商家入驻招募', desc: '校内食堂窗口与周边商家均可提交入驻申请，三个工作日内受理。', tag: '招商' },
  { date: '2026.05.18', title: '失物招领处上线试运行', desc: '线上登记与教学楼 B 区一层服务台同步受理，认领需出示学生证。', tag: '服务' },
]

let disposeMotion: () => void = () => {}

onMounted(async () => {
  disposeMotion = initSiteMotion()
  if (!isLocalStaticPreview()) await loadSiteData()
  refreshMotion()
  if (isAgreementPage.value) await loadAgreement()
})

onBeforeUnmount(() => disposeMotion())

function platformMark(key: string) {
  if (key === 'ios') return 'iOS'
  if (key === 'android') return 'A'
  return '小'
}

function handleDownloadClick(entry: { key: string; href?: string }, event: MouseEvent) {
  if (!entry.href) event.preventDefault()
}

function isLocalStaticPreview() {
  return ['localhost', '127.0.0.1'].includes(window.location.hostname) && window.location.port.startsWith('417')
}

function mediaUrl(value?: string) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (/^(https?:)?\/\//.test(raw) || raw.startsWith('data:') || raw.startsWith('blob:')) return raw
  if (raw.startsWith('/')) return raw
  return `/${raw.replace(/^\.?\//, '')}`
}

async function apiRequest(path: string) {
  const response = await fetch(`/api${path}`)
  const text = await response.text()
  const data = text ? JSON.parse(text) : null
  if (!response.ok) throw new Error(data?.message || `请求失败 ${response.status}`)
  return data
}

async function loadSiteData() {
  try {
    const payload = await apiRequest('/site/public')
    Object.assign(site, normalizePublicSiteData(payload))
  } catch {
    Object.assign(site, normalizePublicSiteData(fallbackSite))
  }
}

async function loadAgreement() {
  const type = agreementType.value
  if (!type) return
  agreement.title = type === 'PRIVACY_POLICY' ? '隐私政策' : '用户协议'
  agreement.content = '<p>平台暂未发布该协议内容，请联系运营方完善。</p>'
  if (isLocalStaticPreview()) return
  try {
    const payload = await apiRequest(`/agreements/${type}`)
    const data = payload?.data || payload?.agreement || payload
    agreement.title = data?.title || agreement.title
    agreement.content = data?.content || agreement.content
    agreement.version = data?.version || data?.versionNumber || agreement.version
    agreement.updatedAt = data?.updatedAt ? new Date(data.updatedAt).toLocaleDateString('zh-CN') : agreement.updatedAt
  } catch {
    // Keep the static agreement placeholder when the backend is offline.
  }
}
</script>
