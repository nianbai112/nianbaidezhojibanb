import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { normalizePublicSiteData, getDownloadEntries } from '../src/websiteConfig.js'

describe('normalizePublicSiteData', () => {
  it('drops admin-only fields from website runtime data', () => {
    const data = normalizePublicSiteData({
      siteName: '灵萌',
      adminPath: '/admin',
      adminTitle: '后台',
      downloads: { ios: '/ios', android: '/apk', miniapp: '/miniapp' },
    })

    assert.equal(data.siteName, '灵萌')
    assert.equal('adminPath' in data, false)
    assert.equal('adminTitle' in data, false)
  })

  it('creates iOS Android and mini-program download entries in order', () => {
    const entries = getDownloadEntries({
      downloads: {
        ios: 'https://apps.apple.com/app/lingmeng',
        android: 'https://download.example.com/lingmeng.apk',
        miniapp: 'weixin://dl/business/?t=lingmeng',
      },
      miniappQrUrl: '/uploads/qr.png',
    })

    assert.deepEqual(entries.map((entry) => entry.key), ['ios', 'android', 'miniapp'])
    assert.equal(entries[2].qrUrl, '/uploads/qr.png')
  })
})
