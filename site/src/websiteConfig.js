export const fallbackSite = {
  siteName: '灵萌',
  siteShortName: '灵萌',
  slogan: '把校园装进口袋',
  description: '灵萌把校园里的内容、连接和服务收进一个更轻快的入口。',
  logo: '/brand/mascot.png',
  siteLogo: '/brand/mascot.png',
  favicon: '',
  mascotUrl: '/brand/mascot.png',
  previewImageUrl: '/website/campus-track.png',
  heroTitle: '把校园装进口袋',
  heroSubtitle: '从今天的校园开始',
  heroPosterUrl: '/website/campus-hero.png',
  heroImageUrl: '/website/campus-hero.png',
  heroVideoUrl: '',
  miniappQrUrl: '/product/miniapp-qr.png',
  storyImageOneUrl: '/website/campus-hero.png',
  storyImageTwoUrl: '/website/campus-library.png',
  storyImageThreeUrl: '/website/campus-track.png',
  cooperationImageUrl: '/website/campus-cooperation.png',
  downloads: {
    ios: '',
    android: '',
    miniapp: '',
  },
  contact: {
    email: '',
    phone: '',
    wechat: '',
  },
  cooperation: {
    title: '一起把校园连接起来',
    subtitle: '欢迎学校、区域伙伴与校园商家了解灵萌。',
    email: '',
    phone: '',
  },
  compliance: {
    icpNumber: '',
    policeNumber: '',
    policeLink: '',
    copyright: '© 2026 Lingmeng',
  },
}

const ADMIN_ONLY_FIELDS = new Set([
  'adminPath',
  'adminTitle',
  'adminSubtitle',
  'browserTitle',
  'loginSlogan',
])

export function normalizePublicSiteData(payload = {}) {
  const data = payload?.data || payload || {}
  const media = data.media || {}
  const clean = {}

  for (const [key, value] of Object.entries(data)) {
    if (!ADMIN_ONLY_FIELDS.has(key)) clean[key] = value
  }

  const downloads = {
    ...fallbackSite.downloads,
    ...(data.downloads || {}),
  }
  downloads.ios = downloads.ios || data.iosDownloadUrl || data.iosUrl || data.appStoreUrl || ''
  downloads.android = downloads.android || data.androidDownloadUrl || data.androidUrl || data.apkUrl || ''
  downloads.miniapp = downloads.miniapp || data.miniappUrl || ''

  return {
    ...fallbackSite,
    ...clean,
    siteShortName: data.siteShortName || data.siteName || fallbackSite.siteShortName,
    logo: data.logo || data.siteLogo || fallbackSite.logo,
    siteLogo: data.siteLogo || data.logo || fallbackSite.siteLogo,
    mascotUrl: data.mascotUrl || media.mascotUrl || fallbackSite.mascotUrl,
    previewImageUrl: data.previewImageUrl || media.previewImageUrl || data.productPreviewImageUrl || media.productPreviewImageUrl || fallbackSite.previewImageUrl,
    heroVideoUrl: data.heroVideoUrl || media.heroVideoUrl || '',
    heroPosterUrl: data.heroPosterUrl || media.heroPosterUrl || data.heroImageUrl || media.heroImageUrl || fallbackSite.heroPosterUrl,
    heroImageUrl: data.heroImageUrl || media.heroImageUrl || data.heroPosterUrl || media.heroPosterUrl || fallbackSite.heroImageUrl,
    storyImageOneUrl: data.storyImageOneUrl || media.storyImageOneUrl || fallbackSite.storyImageOneUrl,
    storyImageTwoUrl: data.storyImageTwoUrl || media.storyImageTwoUrl || fallbackSite.storyImageTwoUrl,
    storyImageThreeUrl: data.storyImageThreeUrl || media.storyImageThreeUrl || fallbackSite.storyImageThreeUrl,
    cooperationImageUrl: data.cooperationImageUrl || media.cooperationImageUrl || fallbackSite.cooperationImageUrl,
    miniappQrUrl: data.miniappQrUrl || media.miniappQrUrl || data.miniappQr || fallbackSite.miniappQrUrl,
    downloads,
    contact: { ...fallbackSite.contact, ...(data.contact || {}) },
    cooperation: { ...fallbackSite.cooperation, ...(data.cooperation || {}) },
    compliance: { ...fallbackSite.compliance, ...(data.compliance || {}) },
  }
}

export function getDownloadEntries(site = {}) {
  const downloads = site.downloads || {}
  return [
    {
      key: 'ios',
      label: 'iOS 下载',
      eyebrow: 'Download on the',
      title: 'App Store',
      icon: 'apple',
      href: downloads.ios || '',
    },
    {
      key: 'android',
      label: 'Android 下载',
      eyebrow: 'Download for',
      title: 'Android',
      icon: 'android',
      href: downloads.android || '',
    },
    {
      key: 'miniapp',
      label: '微信小程序',
      eyebrow: 'Open on the',
      title: '微信小程序',
      icon: 'miniapp',
      href: downloads.miniapp || '',
      qrUrl: site.miniappQrUrl || '',
    },
  ]
}
