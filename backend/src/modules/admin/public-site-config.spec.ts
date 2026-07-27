import { buildPublicSiteData } from './public-site-config';

describe('buildPublicSiteData', () => {
  it('keeps admin-only fields out of public website payload', () => {
    const data = buildPublicSiteData({
      siteName: '灵萌',
      adminPath: '/admin',
      adminTitle: '灵萌后台',
      browserTitle: '后台标题',
      adminSubtitle: '后台副标题',
      siteSlogan: '把校园装进口袋',
    });

    expect(data).not.toHaveProperty('adminPath');
    expect(data).not.toHaveProperty('adminTitle');
    expect(data).not.toHaveProperty('browserTitle');
    expect(data).not.toHaveProperty('adminSubtitle');
    expect(data).not.toHaveProperty('features');
  });

  it('normalizes download aliases and public website media fields', () => {
    const data = buildPublicSiteData({
      siteName: '灵萌',
      siteLogo: '/uploads/logo.png',
      heroPosterUrl: '/uploads/hero.jpg',
      miniappQrUrl: '/uploads/qr.png',
      appStoreUrl: 'https://apps.apple.com/app/lingmeng',
      apkUrl: 'https://download.example.com/lingmeng.apk',
      miniappUrl: 'weixin://dl/business/?t=lingmeng',
      contactEmail: 'hello@example.com',
      icp: '滇ICP备00000000号',
    });

    expect(data.siteName).toBe('灵萌');
    expect(data.siteLogo).toBe('/uploads/logo.png');
    expect(data.heroPosterUrl).toBe('/uploads/hero.jpg');
    expect(data.miniappQrUrl).toBe('/uploads/qr.png');
    expect(data.downloads).toEqual({
      ios: 'https://apps.apple.com/app/lingmeng',
      android: 'https://download.example.com/lingmeng.apk',
      miniapp: 'weixin://dl/business/?t=lingmeng',
    });
    expect(data.contact.email).toBe('hello@example.com');
    expect(data.compliance.icpNumber).toBe('滇ICP备00000000号');
  });
});
