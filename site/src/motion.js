import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

/**
 * 灵萌官网动效层 —— 进场编排 / 滚动驱动 / 常驻生命感
 * 全部动效在 prefers-reduced-motion 下自动关闭
 */
export function initSiteMotion() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {}

  const ctx = gsap.context(() => {
    splitHeroTitle()
    heroIntro()
    sectionReveals()
    figureReveals()
    figureParallax()
    noticeBoardReveal()
    metaRowReveal()
    tileStagger()
    marqueeLoop()
    sealFloat()
    qrTilt()
    footerWordmark()
  })

  return () => ctx.revert()
}

export function refreshMotion() {
  ScrollTrigger.refresh()
}

/* 主标题逐字拆分：每个字外套 mask，逐字升起 */
function splitHeroTitle() {
  const title = document.querySelector('.hero-title')
  if (!title || title.dataset.split) return
  title.dataset.split = '1'
  const nodes = Array.from(title.childNodes)
  nodes.forEach(node => {
    if (node.nodeType !== Node.TEXT_NODE || !node.textContent.trim()) return
    const frag = document.createDocumentFragment()
    Array.from(node.textContent).forEach(ch => {
      const mask = document.createElement('span')
      mask.className = 'ch'
      const inner = document.createElement('span')
      inner.className = 'ch-in'
      inner.textContent = ch
      mask.appendChild(inner)
      frag.appendChild(mask)
    })
    title.replaceChild(frag, node)
  })
}

/* Hero 进场时间线：逐字标题 → 副文案 → 下载徽章 → 图框揭幕 → 印章弹入 */
function heroIntro() {
  const tl = gsap.timeline({ defaults: { ease: 'power4.out' } })

  gsap.set('.meta-line span', { y: 18, autoAlpha: 0 })
  gsap.set('.hero-title .ch-in', { yPercent: 115 })
  gsap.set('.title-tag', { scale: 0.5, autoAlpha: 0 })
  gsap.set('.hero-sub', { y: 26, autoAlpha: 0 })
  gsap.set('.download-badge', { y: 28, autoAlpha: 0 })
  gsap.set('.hero-note', { autoAlpha: 0 })
  gsap.set('.hero-main .figure-frame', { clipPath: 'inset(0 0 100% 0)' })
  gsap.set('.hero-main .figure-frame img', { scale: 1.28 })
  gsap.set('.hero-side', { x: -36, autoAlpha: 0 })
  gsap.set('.hero-figures .mascot-seal', { scale: 0, rotate: -40 })
  gsap.set('.meta-cell', { y: 28, autoAlpha: 0 })

  tl.to('.meta-line span', { y: 0, autoAlpha: 1, duration: 0.6, stagger: 0.1 }, 0.1)
    .to('.hero-title .ch-in', { yPercent: 0, duration: 1.0, stagger: 0.045 }, 0.25)
    .to('.title-tag', { scale: 1, autoAlpha: 1, duration: 0.7, ease: 'back.out(2.2)' }, '-=0.5')
    .to('.hero-sub', { y: 0, autoAlpha: 1, duration: 0.7 }, '-=0.55')
    .to('.download-badge', { y: 0, autoAlpha: 1, duration: 0.6, stagger: 0.09 }, '-=0.45')
    .to('.hero-note', { autoAlpha: 1, duration: 0.6 }, '-=0.3')
    .to('.hero-main .figure-frame', { clipPath: 'inset(0 0 0% 0)', duration: 1.15, ease: 'expo.out' }, 0.5)
    .to('.hero-main .figure-frame img', { scale: 1, duration: 1.6, ease: 'expo.out' }, 0.5)
    .to('.hero-side', { x: 0, autoAlpha: 1, duration: 0.9 }, '-=1.0')
    .to('.hero-figures .mascot-seal', { scale: 1, rotate: 0, duration: 1.0, ease: 'elastic.out(1, 0.55)' }, '-=0.7')
    .to('.meta-cell', { y: 0, autoAlpha: 1, duration: 0.7, stagger: 0.12 }, '-=0.9')
}

/* 各节标题：eyebrow 淡入 + h2 升起 */
function sectionReveals() {
  gsap.utils.toArray('.section-head, .entry-copy, .cooperation-card').forEach(block => {
    const targets = block.querySelectorAll('.eyebrow, h2, p')
    if (!targets.length) return
    gsap.from(targets, {
      y: 30,
      autoAlpha: 0,
      duration: 0.85,
      ease: 'power3.out',
      stagger: 0.12,
      scrollTrigger: { trigger: block, start: 'top 82%' },
    })
  })
}

/* 图框揭幕：clip-path 自下而上揭开，内部图片缓放 */
function figureReveals() {
  gsap.utils.toArray('.story-collage .figure, .tile .figure, .cooperation-photo, .entry-exhibit .figure, .qr-plate').forEach(fig => {
    const frame = fig.querySelector('.figure-frame') || fig
    const img = frame.querySelector('img')
    gsap.set(frame, { clipPath: 'inset(0 0 100% 0)' })
    if (img) gsap.set(img, { scale: 1.22 })
    const st = { trigger: fig, start: 'top 86%' }
    gsap.to(frame, { clipPath: 'inset(0 0 0% 0)', duration: 1.1, ease: 'expo.out', scrollTrigger: st })
    if (img) gsap.to(img, { scale: 1, duration: 1.5, ease: 'expo.out', scrollTrigger: st })
    const caption = fig.querySelector('figcaption')
    if (caption) {
      gsap.from(caption, {
        y: 12,
        autoAlpha: 0,
        duration: 0.6,
        delay: 0.5,
        ease: 'power3.out',
        scrollTrigger: st,
      })
    }
  })
}

/* 滚动视差：图片在框内上下漂移，校园「活」起来 */
function figureParallax() {
  gsap.utils.toArray('.figure-frame img').forEach(img => {
    const trigger = img.closest('.figure') || img
    gsap.fromTo(img, { yPercent: -5 }, {
      yPercent: 5,
      ease: 'none',
      scrollTrigger: { trigger, start: 'top bottom', end: 'bottom top', scrub: 1.2 },
    })
  })
  /* hero 文案随滚动轻微上移，与图片错位 */
  gsap.to('.hero-copy', {
    yPercent: -6,
    ease: 'none',
    scrollTrigger: { trigger: '.hero-section', start: 'top top', end: 'bottom top', scrub: 1.5 },
  })
}

/* 布告栏：整体浮起 + 三则布告交错 */
function noticeBoardReveal() {
  const board = document.querySelector('.notice-board')
  if (!board) return
  gsap.from(board, {
    y: 42,
    autoAlpha: 0,
    duration: 0.9,
    ease: 'power3.out',
    scrollTrigger: { trigger: board, start: 'top 88%' },
  })
  gsap.from('.notice-item', {
    y: 26,
    autoAlpha: 0,
    duration: 0.7,
    ease: 'power3.out',
    stagger: 0.13,
    delay: 0.25,
    clearProps: 'transform', /* 保留便签的 CSS 微旋转 */
    scrollTrigger: { trigger: board, start: 'top 88%' },
  })
}

/* 发丝线行：进入视口时底线从 0 拉到 25%（悬停再到 100%） */
function metaRowReveal() {
  gsap.utils.toArray('.ruled-row').forEach(row => {
    gsap.from(row, {
      y: 18,
      autoAlpha: 0,
      duration: 0.7,
      ease: 'power3.out',
      scrollTrigger: { trigger: row, start: 'top 92%' },
    })
  })
}

/* 发现区三卡：交错浮起 */
function tileStagger() {
  const tiles = gsap.utils.toArray('.tile')
  if (!tiles.length) return
  gsap.from(tiles, {
    y: 46,
    autoAlpha: 0,
    duration: 0.9,
    ease: 'power3.out',
    stagger: 0.14,
    scrollTrigger: { trigger: '.tile-grid', start: 'top 85%' },
  })
}

/* 校园脉搏跑马灯：无缝横滚 */
function marqueeLoop() {
  const track = document.querySelector('.marquee-track')
  if (!track) return
  gsap.to(track, { xPercent: -50, duration: 26, ease: 'none', repeat: -1 })
}

/* 印章常驻呼吸浮动 */
function sealFloat() {
  gsap.utils.toArray('.mascot-seal').forEach((seal, i) => {
    gsap.to(seal, {
      y: -9,
      duration: 2.4 + i * 0.4,
      ease: 'sine.inOut',
      yoyo: true,
      repeat: -1,
    })
  })
}

/* 二维码铭牌：跟随指针 3D 倾斜 */
function qrTilt() {
  const plate = document.querySelector('.qr-plate')
  if (!plate) return
  gsap.set(plate, { transformPerspective: 800 })
  const rotX = gsap.quickTo(plate, 'rotationX', { duration: 0.6, ease: 'power3.out' })
  const rotY = gsap.quickTo(plate, 'rotationY', { duration: 0.6, ease: 'power3.out' })
  plate.addEventListener('pointermove', e => {
    const rect = plate.getBoundingClientRect()
    const px = (e.clientX - rect.left) / rect.width - 0.5
    const py = (e.clientY - rect.top) / rect.height - 0.5
    rotX(py * -14)
    rotY(px * 14)
  })
  plate.addEventListener('pointerleave', () => {
    rotX(0)
    rotY(0)
  })
}

/* 页脚水印：滚动时从下方浮出 */
function footerWordmark() {
  gsap.from('.footer-wordmark', {
    yPercent: 46,
    ease: 'none',
    scrollTrigger: { trigger: '.site-footer', start: 'top bottom', end: 'bottom bottom', scrub: 1 },
  })
}
