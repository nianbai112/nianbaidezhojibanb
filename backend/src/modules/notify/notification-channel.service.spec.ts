import { NotificationChannelService } from './notification-channel.service';

describe('NotificationChannelService', () => {
  it('does not report a simulated Aliyun SMS as delivered', async () => {
    const service = new NotificationChannelService({
      config: {
        findUnique: jest.fn().mockResolvedValue({ value: { provider: 'aliyun' } }),
      },
    } as any);

    await expect(service.sendSms('13800138000', '退款已处理')).resolves.toBe(false);
  });

  it('enables email for an enabled order notice and keeps SMS unavailable', async () => {
    const service = new NotificationChannelService({
      config: {
        findUnique: jest.fn().mockResolvedValue({
          value: { emailEnabled: true, smsEnabled: true, orderPaymentNotice: true },
        }),
      },
    } as any);

    await expect((service as any).resolveChannelMask({ inApp: true }, 'ORDER')).resolves.toEqual({
      inApp: true,
      email: true,
      sms: false,
    });
  });
});
