type WebsiteInfoValue = Record<string, any>;

type PublicSiteCounts = {
  users?: number;
  posts?: number;
  merchants?: number;
  regions?: number;
};

function text(value: any, fallback = "") {
  const next = String(value ?? "").trim();
  return next || fallback;
}

export function buildPublicSiteData(value: WebsiteInfoValue = {}, counts: PublicSiteCounts = {}) {
  const siteLogo = text(value.siteLogo || value.logo || value.websiteLogo);
  const siteName = text(value.siteName, "灵萌");
  const androidUrl = text(value.androidDownloadUrl || value.androidUrl || value.apkUrl);
  const iosUrl = text(value.iosDownloadUrl || value.iosUrl || value.appStoreUrl);
  const miniappUrl = text(value.miniappUrl);
  const heroPosterUrl = text(value.heroPosterUrl || value.heroPoster || value.heroImageUrl);
  const heroImageUrl = text(value.heroImageUrl || value.heroPosterUrl || value.heroPoster);
  const miniappQrUrl = text(value.miniappQrUrl || value.miniappQr || value.miniProgramQrUrl);

  return {
    siteName,
    siteShortName: text(value.siteShortName, siteName),
    slogan: text(value.siteSlogan, "把校园装进口袋"),
    description: text(value.siteDescription, "灵萌把校园里的内容、连接和服务收进一个更轻快的入口。"),
    heroTitle: text(value.heroTitle, "把校园装进口袋"),
    heroSubtitle: text(value.heroSubtitle, "从今天的校园开始"),
    logo: siteLogo,
    siteLogo,
    favicon: text(value.favicon),
    mascotUrl: text(value.mascotUrl || value.mascotImageUrl),
    previewImageUrl: text(value.previewImageUrl || value.productPreviewImageUrl),
    storyImageOneUrl: text(value.storyImageOneUrl),
    storyImageTwoUrl: text(value.storyImageTwoUrl),
    storyImageThreeUrl: text(value.storyImageThreeUrl),
    cooperationImageUrl: text(value.cooperationImageUrl),
    heroVideoUrl: text(value.heroVideoUrl || value.heroVideo),
    heroPosterUrl,
    heroImageUrl,
    miniappQrUrl,
    media: {
      heroVideoUrl: text(value.heroVideoUrl || value.heroVideo),
      heroPosterUrl,
      heroImageUrl,
      miniappQrUrl,
      mascotUrl: text(value.mascotUrl || value.mascotImageUrl),
      previewImageUrl: text(value.previewImageUrl || value.productPreviewImageUrl),
      storyImageOneUrl: text(value.storyImageOneUrl),
      storyImageTwoUrl: text(value.storyImageTwoUrl),
      storyImageThreeUrl: text(value.storyImageThreeUrl),
      cooperationImageUrl: text(value.cooperationImageUrl),
    },
    downloads: {
      ios: iosUrl,
      android: androidUrl,
      miniapp: miniappUrl,
    },
    contact: {
      email: text(value.contactEmail),
      phone: text(value.contactPhone),
      wechat: text(value.contactWechat),
    },
    cooperation: {
      title: text(value.cooperationTitle, "一起把校园连接起来"),
      subtitle: text(value.cooperationSubtitle, "欢迎学校、区域伙伴与校园商家了解灵萌。"),
      email: text(value.cooperationEmail || value.contactEmail),
      phone: text(value.cooperationPhone || value.contactPhone),
    },
    compliance: {
      icpNumber: text(value.icpNumber || value.icp),
      policeNumber: text(value.policeNumber),
      policeLink: text(value.policeLink),
      copyright: text(value.copyright, "© 2026 Lingmeng"),
    },
    metrics: {
      users: counts.users || 0,
      posts: counts.posts || 0,
      merchants: counts.merchants || 0,
      regions: counts.regions || 0,
    },
    agreements: {
      privacy: "/agreement/privacy",
      terms: "/agreement/terms",
    },
  };
}
