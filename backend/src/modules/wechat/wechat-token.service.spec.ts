import axios from 'axios';
import { WechatTokenService } from './wechat-token.service';

describe('WechatTokenService official access token', () => {
  it('uses the stable token endpoint and caches the result per official appid', async () => {
    const prisma = {
      config: {
        findUnique: jest.fn().mockResolvedValue({
          value: { appId: 'wx-official-app', appSecret: 'official-secret' },
        }),
      },
    };
    const redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    };
    const service = new WechatTokenService(
      prisma as any,
      redis as any,
      { get: jest.fn() } as any,
    );
    const post = jest.spyOn(axios, 'post').mockResolvedValue({
      data: { access_token: 'stable-access-token', expires_in: 7200 },
    } as any);

    await expect(service.getOfficialAccessToken()).resolves.toBe('stable-access-token');

    expect(post).toHaveBeenCalledWith(
      'https://api.weixin.qq.com/cgi-bin/stable_token',
      {
        grant_type: 'client_credential',
        appid: 'wx-official-app',
        secret: 'official-secret',
        force_refresh: false,
      },
      { timeout: 10000 },
    );
    expect(redis.set).toHaveBeenCalledWith(
      'wx:official:access_token:wx-official-app',
      'stable-access-token',
      7140,
    );
    post.mockRestore();
  });
});
