import {
  DEFAULT_RIDER_APP_CONTROL_CONFIG,
  normalizeRiderAppControlConfig,
} from './rider-app-control.config';

describe('rider App control config', () => {
  it('fills missing fields without exposing a mutable shared default', () => {
    const first = normalizeRiderAppControlConfig({ maintenance: { enabled: true } });
    const second = normalizeRiderAppControlConfig({});

    expect(first).toMatchObject({
      enabled: true,
      maintenance: {
        enabled: true,
        title: '系统维护中',
      },
      version: {
        latest: '1.0.0',
        minimum: '1.0.0',
      },
      runtime: {
        wsPath: '/api/ws-native',
        locationIntervalSeconds: 30,
      },
      features: {
        orderPool: true,
        chat: true,
        income: true,
        incentives: true,
      },
    });

    first.maintenance.title = 'changed';
    expect(second.maintenance.title).toBe('系统维护中');
    expect(DEFAULT_RIDER_APP_CONTROL_CONFIG.maintenance.title).toBe('系统维护中');
  });

  it.each([
    [{ version: { latest: '1.0' } }, '最新版本号'],
    [{ version: { minimum: 'v1.0.0' } }, '最低版本号'],
    [{ version: { iosDownloadUrl: 'http://example.com/app' } }, 'iOS 下载地址'],
    [{ version: { androidDownloadUrl: 'javascript:alert(1)' } }, 'Android 下载地址'],
    [{ runtime: { wsPath: 'wss://evil.example/ws' } }, 'WebSocket 路径'],
    [{ runtime: { locationIntervalSeconds: 14 } }, '定位上传间隔'],
    [{ runtime: { locationIntervalSeconds: 301 } }, '定位上传间隔'],
  ])('rejects unsafe or out-of-range values', (value, message) => {
    expect(() => normalizeRiderAppControlConfig(value)).toThrow(message);
  });
});
