import { BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';

const mockSendSms = jest.fn();
const mockTencentClient = jest.fn().mockImplementation(() => ({ SendSms: mockSendSms }));

jest.mock(
  'tencentcloud-sdk-nodejs-sms',
  () => ({ sms: { v20210111: { Client: mockTencentClient } } }),
  { virtual: true },
);

describe('AuthService SMS providers', () => {
  const createRedis = () => {
    const values = new Map<string, string>();
    const redis = {
      get: jest.fn(async (key: string) => values.get(key) || null),
      set: jest.fn(async (key: string, value: string) => {
        values.set(key, String(value));
      }),
      incr: jest.fn(async (key: string) => {
        const next = Number(values.get(key) || '0') + 1;
        values.set(key, String(next));
        return next;
      }),
      expire: jest.fn().mockResolvedValue(undefined),
      del: jest.fn(async (key: string) => {
        values.delete(key);
      }),
    };
    return { redis, values };
  };

  const createService = (savedSms: Record<string, unknown> = {}, redis: Record<string, jest.Mock> = {}) => {
    const prisma = {
      config: {
        findUnique: jest.fn().mockResolvedValue({ value: { sms: savedSms } }),
      },
    };
    const config = {
      get: jest.fn((key: string) => (key === 'NODE_ENV' ? 'production' : undefined)),
    };
    return new AuthService(prisma as any, {} as any, config as any, redis as any, {} as any);
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('只调用后台选中的腾讯云服务商', async () => {
    const service = createService({ provider: 'tencent' });
    const aliyun = jest.spyOn(service as any, 'sendAliyunSmsCode').mockResolvedValue(undefined);
    const tencent = jest.spyOn(service as any, 'sendTencentSmsCode').mockResolvedValue(undefined);

    await (service as any).sendSmsCode('13800138000', '654321');

    expect(tencent).toHaveBeenCalledTimes(1);
    expect(aliyun).not.toHaveBeenCalled();
  });

  it('自动主备模式在主通道明确失败后使用备用通道', async () => {
    const service = createService({ mode: 'auto', provider: 'aliyun' });
    jest.spyOn(service as any, 'sendAliyunSmsCode').mockRejectedValue(new BadRequestException('阿里云明确拒绝'));
    const tencent = jest.spyOn(service as any, 'sendTencentSmsCode').mockResolvedValue(undefined);

    const result = await (service as any).sendSmsCode('13800138000', '654321');

    expect(tencent).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      provider: 'tencent',
      attemptedProviders: ['aliyun', 'tencent'],
      deliveryUnknown: false,
    });
  });

  it('手动模式主通道失败后不调用备用通道', async () => {
    const service = createService({ mode: 'manual', provider: 'aliyun' });
    jest.spyOn(service as any, 'sendAliyunSmsCode').mockRejectedValue(new BadRequestException('阿里云明确拒绝'));
    const tencent = jest.spyOn(service as any, 'sendTencentSmsCode').mockResolvedValue(undefined);

    await expect((service as any).sendSmsCode('13800138000', '654321')).rejects.toThrow('阿里云明确拒绝');
    expect(tencent).not.toHaveBeenCalled();
  });

  it('主通道超时时不立即双发并返回受理状态不确定', async () => {
    const service = createService({ mode: 'auto', provider: 'aliyun' });
    jest.spyOn(service as any, 'sendAliyunSmsCode').mockRejectedValue(
      Object.assign(new Error('request timeout'), { code: 'ETIMEDOUT' }),
    );
    const tencent = jest.spyOn(service as any, 'sendTencentSmsCode').mockResolvedValue(undefined);

    const result = await (service as any).sendSmsCode('13800138000', '654321');

    expect(tencent).not.toHaveBeenCalled();
    expect(result).toEqual({
      provider: 'aliyun',
      attemptedProviders: ['aliyun'],
      deliveryUnknown: true,
    });
  });

  it('按腾讯云短信 API 要求发送中国大陆手机号和验证码参数', async () => {
    mockSendSms.mockResolvedValue({
      SendStatusSet: [{ Code: 'Ok', Message: 'send success', SerialNo: 'serial-1' }],
      RequestId: 'request-1',
    });
    const service = createService();

    await (service as any).sendTencentSmsCode('13800138000', '654321', {
      tencentSecretId: 'secret-id',
      tencentSecretKey: 'secret-key',
      tencentSmsSdkAppId: '1400000000',
      tencentSignName: '测试签名',
      tencentTemplateId: '123456',
      tencentEndpoint: 'sms.tencentcloudapi.com',
      tencentRegion: 'ap-guangzhou',
    });

    expect(mockTencentClient).toHaveBeenCalledWith(
      expect.objectContaining({
        credential: { secretId: 'secret-id', secretKey: 'secret-key' },
        region: 'ap-guangzhou',
      }),
    );
    expect(mockSendSms).toHaveBeenCalledWith({
      PhoneNumberSet: ['+8613800138000'],
      SmsSdkAppId: '1400000000',
      SignName: '测试签名',
      TemplateId: '123456',
      TemplateParamSet: ['654321'],
    });
  });

  it('腾讯云返回失败状态时不再尝试其他服务商', async () => {
    mockSendSms.mockResolvedValue({
      SendStatusSet: [{ Code: 'FailedOperation.SignatureIncorrectOrUnapproved', Message: '签名未通过审核' }],
    });
    const service = createService();

    await expect(
      (service as any).sendTencentSmsCode('13800138000', '654321', {
        tencentSecretId: 'secret-id',
        tencentSecretKey: 'secret-key',
        tencentSmsSdkAppId: '1400000000',
        tencentSignName: '测试签名',
        tencentTemplateId: '123456',
        tencentEndpoint: 'sms.tencentcloudapi.com',
        tencentRegion: 'ap-guangzhou',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('服务商发送失败时解除手机号冷却，允许切换后立即重试', async () => {
    const redis = {
      get: jest.fn().mockResolvedValue(null),
      incr: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(undefined),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };
    const service = createService({}, redis);
    jest.spyOn(service as any, 'sendSmsCode').mockRejectedValue(new BadRequestException('发送失败'));

    await expect(service.sendPhoneLoginCode({ phone: '13800138000' }, '127.0.0.1')).rejects.toThrow('发送失败');

    expect(redis.del).toHaveBeenCalledWith('phone_login:cooldown:13800138000');
  });

  it('六十秒后再次获取时复用原验证码并改走另一家', async () => {
    const { redis, values } = createRedis();
    const service = createService({ mode: 'auto', provider: 'aliyun' }, redis);
    const aliyun = jest.spyOn(service as any, 'sendAliyunSmsCode').mockResolvedValue(undefined);
    const tencent = jest.spyOn(service as any, 'sendTencentSmsCode').mockResolvedValue(undefined);

    await service.sendPhoneLoginCode({ phone: '13800138000' }, '127.0.0.1');
    values.delete('phone_login:cooldown:13800138000');
    await service.sendPhoneLoginCode({ phone: '13800138000' }, '127.0.0.1');

    expect(aliyun).toHaveBeenCalledTimes(1);
    expect(tencent).toHaveBeenCalledTimes(1);
    expect(aliyun.mock.calls[0][1]).toBe(tencent.mock.calls[0][1]);
    expect(redis.set.mock.calls.filter(([key]) => key === 'phone_login:code:13800138000')).toHaveLength(1);
  });

  it('同一验证码两家都尝试后拒绝继续重复发送', async () => {
    const { redis, values } = createRedis();
    values.set('phone_login:code:13800138000', '654321');
    values.set('phone_login:sms_state:13800138000', JSON.stringify({
      attemptedProviders: ['aliyun', 'tencent'],
      lastProvider: 'tencent',
      deliveryUnknown: false,
    }));
    const service = createService({ mode: 'auto', provider: 'aliyun' }, redis);
    const aliyun = jest.spyOn(service as any, 'sendAliyunSmsCode').mockResolvedValue(undefined);
    const tencent = jest.spyOn(service as any, 'sendTencentSmsCode').mockResolvedValue(undefined);

    await expect(service.sendPhoneLoginCode({ phone: '13800138000' }, '127.0.0.1')).rejects.toThrow(
      '本验证码已通过双通道发送',
    );

    expect(aliyun).not.toHaveBeenCalled();
    expect(tencent).not.toHaveBeenCalled();
  });

  it('备用通道明确失败后仍记录为已尝试并阻止第三次发送', async () => {
    const { redis, values } = createRedis();
    const service = createService({ mode: 'auto', provider: 'aliyun' }, redis);
    const aliyun = jest.spyOn(service as any, 'sendAliyunSmsCode').mockResolvedValue(undefined);
    const tencent = jest.spyOn(service as any, 'sendTencentSmsCode').mockRejectedValue(new BadRequestException('腾讯云明确拒绝'));

    await service.sendPhoneLoginCode({ phone: '13800138000' }, '127.0.0.1');
    values.delete('phone_login:cooldown:13800138000');
    await expect(service.sendPhoneLoginCode({ phone: '13800138000' }, '127.0.0.1')).rejects.toThrow('腾讯云明确拒绝');
    values.delete('phone_login:cooldown:13800138000');
    await expect(service.sendPhoneLoginCode({ phone: '13800138000' }, '127.0.0.1')).rejects.toThrow(
      '本验证码已通过双通道发送',
    );

    expect(aliyun).toHaveBeenCalledTimes(1);
    expect(tencent).toHaveBeenCalledTimes(1);
  });

  it('验证码验证成功后清理短信通道状态', async () => {
    const { redis, values } = createRedis();
    values.set('phone_login:code:13800138000', '654321');
    values.set('phone_login:sms_state:13800138000', JSON.stringify({
      attemptedProviders: ['aliyun'],
      lastProvider: 'aliyun',
      deliveryUnknown: false,
    }));
    const service = createService({}, redis);

    await (service as any).verifyPhoneLoginCode('13800138000', '654321');

    expect(values.has('phone_login:code:13800138000')).toBe(false);
    expect(values.has('phone_login:sms_state:13800138000')).toBe(false);
  });
});
