<template>
  <main class="site-shell">
    <section v-if="isAgreementPage" class="agreement-page">
      <a class="back-home" href="/">返回灵萌官网</a>
      <article class="agreement-document">
        <p class="eyebrow">协议说明</p>
        <h1>{{ agreement.title }}</h1>
        <div class="agreement-meta">
          <span>版本 {{ agreement.version }}</span>
          <span>更新时间 {{ agreement.updatedAt }}</span>
        </div>
        <div class="agreement-content">
          <p v-for="(paragraph, index) in agreementParagraphs" :key="index">{{ paragraph }}</p>
        </div>
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
          <img v-else :src="heroPoster" alt="" />
        </div>

        <header class="site-header">
          <a class="brand" href="#home" aria-label="灵萌官网首页">
            <img class="brand-logo" :src="brandLogo" alt="" />
            <span>{{ site.siteShortName || site.siteName }}</span>
          </a>
          <nav class="nav-links" aria-label="官网导航">
            <a href="#home">首页</a>
            <a href="#campus">校园生活</a>
            <a href="#circle">圈子</a>
            <a href="#discover">发现</a>
            <a href="#about">关于我们</a>
          </nav>
          <a class="header-download" href="#download">下载灵萌</a>
        </header>

        <div class="hero-content">
          <div class="hero-copy">
            <h1>{{ heroTitle }}</h1>
            <p>{{ heroSubtitle }}</p>
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
                <span>
                  <small>{{ entry.eyebrow }}</small>
                  <strong>{{ entry.title }}</strong>
                </span>
                <span v-if="entry.key === 'miniapp' && miniappQr" class="qr-popover">
                  <img :src="miniappQr" alt="灵萌小程序二维码" />
                  <em>微信扫码进入</em>
                </span>
              </a>
            </div>
            <img class="hero-mascot" :src="mascotImage" alt="" />
          </div>

          <aside class="phone-preview" aria-label="灵萌小程序预览">
            <div class="phone-head">
              <strong>{{ site.siteShortName || '灵萌' }}</strong>
              <span>•••</span>
            </div>
            <div class="phone-tabs">
              <span class="active">推荐</span>
              <span>校园</span>
              <span>圈子</span>
              <span>发现</span>
            </div>
            <div class="phone-feed">
              <article v-for="item in previewCards" :key="item.title">
                <img :src="item.image" alt="" />
                <div>
                  <strong>{{ item.title }}</strong>
                  <span>{{ item.meta }}</span>
                </div>
              </article>
            </div>
          </aside>
        </div>
      </section>

      <section id="campus" class="story-section">
        <div class="section-copy">
          <p class="eyebrow">Campus Story</p>
          <h2>校园的一天，在灵萌里展开</h2>
          <p>看见同学，也看见生活。灵萌把校园里的真实瞬间收拢成一个轻快入口，让每一次打开都有熟悉的校园气息。</p>
          <a href="#download" class="text-link">继续往下看</a>
        </div>
        <div class="story-collage">
          <img class="story-main" :src="storyImages[0]" alt="" />
          <img class="story-side top" :src="storyImages[1]" alt="" />
          <img class="story-side bottom" :src="storyImages[2]" alt="" />
          <div class="mini-strip">
            <span>今日校园</span>
            <strong>同学动态</strong>
            <em>我的校园</em>
          </div>
        </div>
      </section>

      <section id="circle" class="entry-section">
        <div class="entry-panel">
          <div class="entry-copy">
            <p class="eyebrow">Mini Program</p>
            <h2>打开灵萌，进入你的校园</h2>
            <p>下载 App 或打开小程序，把校园入口留在手边。官网只做最重要的品牌、下载和联系。</p>
            <div class="entry-downloads">
              <a v-for="entry in downloadEntries" :key="entry.key" :href="entry.href || undefined" @click="handleDownloadClick(entry, $event)">
                <span>{{ platformMark(entry.key) }}</span>
                {{ entry.label }}
              </a>
            </div>
          </div>
          <div class="qr-feature">
            <img :src="miniappQr" alt="灵萌小程序二维码" />
            <strong>扫码体验小程序</strong>
            <span>微信扫码进入</span>
            <img class="qr-mascot" :src="mascotImage" alt="" />
          </div>
          <div class="product-preview">
            <img :src="previewImage" alt="" />
            <div class="preview-note">
              <span>今日校园</span>
              <strong>属于你的校园入口</strong>
            </div>
          </div>
        </div>
        <div class="proof-row">
          <span>校园认证</span>
          <span>内容安全</span>
          <span>服务入口</span>
        </div>
      </section>

      <section id="discover" class="tile-section">
        <article v-for="tile in tiles" :key="tile.title">
          <img :src="tile.image" alt="" />
          <strong>{{ tile.title }}</strong>
        </article>
      </section>

      <section id="about" class="cooperation-section">
        <div class="cooperation-photo">
          <img :src="cooperationImage" alt="" />
        </div>
        <div class="cooperation-card">
          <p class="eyebrow">Cooperation</p>
          <h2>{{ site.cooperation.title }}</h2>
          <p>{{ site.cooperation.subtitle }}</p>
          <div class="cooperation-options">
            <span>合作咨询</span>
            <span>商家入驻</span>
            <span>区域合作</span>
          </div>
          <div class="contact-lines">
            <a v-if="site.contact.email" :href="`mailto:${site.contact.email}`">{{ site.contact.email }}</a>
            <a v-if="site.contact.phone" :href="`tel:${site.contact.phone}`">{{ site.contact.phone }}</a>
            <span v-if="site.contact.wechat">微信 {{ site.contact.wechat }}</span>
          </div>
          <a href="#download" class="primary-link">提交合作意向</a>
        </div>
      </section>

      <footer class="site-footer">
        <div>
          <a class="footer-brand" href="#home">
            <img :src="brandLogo" alt="" />
            <strong>{{ site.siteShortName || site.siteName }}</strong>
          </a>
          <p>{{ site.description }}</p>
        </div>
        <nav>
          <a href="#home">首页</a>
          <a href="#campus">校园生活</a>
          <a href="#circle">圈子</a>
          <a href="#discover">发现</a>
          <a href="#about">关于我们</a>
          <a href="/agreement/terms">用户协议</a>
          <a href="/agreement/privacy">隐私政策</a>
        </nav>
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
import { computed, onMounted, reactive } from 'vue'
import { fallbackSite, getDownloadEntries, normalizePublicSiteData } from './websiteConfig.js'

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
const agreementParagraphs = computed(() => {
  const document = new DOMParser().parseFromString(String(agreement.content || ''), 'text/html')
  const blocks = Array.from(document.body.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, blockquote'))
    .map((element) => element.textContent?.trim() || '')
    .filter(Boolean)
  return blocks.length ? blocks : [document.body.textContent?.trim() || ''].filter(Boolean)
})
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

const previewCards = computed(() => [
  { title: '初夏的校园照片', meta: '校园 · 12分钟前', image: heroPoster.value },
  { title: '期末前的自习时光', meta: '图书馆 · 1小时前', image: storyImages.value[1] },
  { title: '运动让生活更有光', meta: '校园日常 · 2小时前', image: storyImages.value[2] },
])

const tiles = computed(() => [
  { title: '属于校园的内容', image: storyImages.value[0] },
  { title: '发现身边的精彩', image: storyImages.value[1] },
  { title: '连接真实的校园', image: heroPoster.value },
])

onMounted(async () => {
  if (!isLocalStaticPreview()) await loadSiteData()
  if (isAgreementPage.value) await loadAgreement()
})

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
