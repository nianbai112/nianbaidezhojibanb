import axios from 'axios';
import { AuthService } from './auth.service';

jest.mock('axios');
const http = axios as jest.Mocked<typeof axios>;

describe('rider payout mini-program identity verification', () => {
  const rider = { id: 'rider', status: 'ACTIVE', phone: '13800000000', openid: 'bound-wechat' };
  function harness(user: any = rider) {
    const db: any = { user: { findUnique: jest.fn().mockResolvedValue(user) } };
    const service = new AuthService(db, {} as any, {} as any, {} as any, {} as any);
    jest.spyOn(service as any, 'getMiniappCredentials').mockResolvedValue({ appid: 'wx-app', secret: 'server-secret' });
    return { db, service };
  }
  beforeEach(() => { jest.clearAllMocks(); http.get.mockResolvedValue({ data: { openid: rider.openid } }); });
  it('verifies fresh login code against the logged-in platform user', async () => {
    const h = harness();
    await expect(h.service.verifyMiniappIdentity('rider', 'fresh-code')).resolves.toMatchObject({ id: 'rider', openid: rider.openid, appid: 'wx-app' });
    expect(h.db.user.findUnique).toHaveBeenCalledWith({ where: { id: 'rider' } });
    expect(http.get).toHaveBeenCalledWith('https://api.weixin.qq.com/sns/jscode2session', expect.objectContaining({
      params: { appid: 'wx-app', secret: 'server-secret', js_code: 'fresh-code', grant_type: 'authorization_code' }, timeout: 10000,
    }));
  });
  it.each([null, { ...rider, status: 'BANNED' }, { ...rider, phone: null },
    { ...rider, openid: 'phone_login_13800000000' }, { ...rider, openid: 'another-wechat' }])('rejects an unbound, inactive or mismatched account %j', async user => {
    await expect(harness(user).service.verifyMiniappIdentity('rider', 'code')).rejects.toThrow('绑定');
  });
  it.each([{ errcode: 40029 }, {}, { openid: 'another-wechat' }])('rejects invalid WeChat responses %j', async data => {
    http.get.mockResolvedValue({ data });
    await expect(harness().service.verifyMiniappIdentity('rider', 'code')).rejects.toThrow('绑定');
  });
  it.each(['', 'a'.repeat(129)])('rejects an invalid code before calling WeChat', async code => {
    await expect(harness().service.verifyMiniappIdentity('rider', code)).rejects.toThrow('凭证');
    expect(http.get).not.toHaveBeenCalled();
  });
});
