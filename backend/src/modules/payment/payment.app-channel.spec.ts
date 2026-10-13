import { PaymentService } from './payment.service';
import { requestContext } from '../../common/request-context';
import { canStartWechatPayment, assertPaymentGoodsAllowed } from '../../common/payment-client';
const inApp = (fn: () => any, platform = 'app-android') => requestContext.run({ request: { headers: { 'x-client-platform': platform } } as any }, fn);
const fixture = (existing: any = null, configured = true) => {
 const prisma: any = { mallOrder: {findUnique:jest.fn().mockResolvedValue({id:'o',status:'pending_pay',userId:'u',payAmount:1.23,payChannel:null}),updateMany:jest.fn().mockResolvedValue({count:1})}, paymentOrder: { findFirst: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(existing), create: jest.fn().mockResolvedValue({ id: 'p', paymentNo: 'PAY1', expireTime: new Date(Date.now()+60000) }), update: jest.fn().mockResolvedValue({}) } };
 const service: any = new PaymentService({} as any, prisma, { getLock: async () => true, releaseLock: async () => {} } as any, {} as any, {} as any);
 jest.spyOn(service, 'getWxPayConfig').mockResolvedValue({ appid: 'wx-mini', appAppid: configured ? 'wx-app' : '', mchid: 'm', notifyUrl: 'https://example.test/notify' });
 jest.spyOn(service, 'wxPayRequest').mockResolvedValue({ prepay_id: 'prepay' });
 jest.spyOn(service, 'generatePaySign').mockReturnValue('signature');
 return { service, prisma };
};
const dto = { bizType: 'mall_order', bizId: 'o', orderNo: 'O1', amount: 1.23, description: '商品', openid: 'app_login_123', userId: 'u' };
it('App无需小程序openid，按AppID和prepay_id签名且无payer', async () => {
 const { service, prisma } = fixture();
 const result = await inApp(() => service.wxUnifiedOrder(dto));
 const [method, path, body] = service.wxPayRequest.mock.calls[0];
 expect(method).toBe('POST'); expect(path).toBe('/v3/pay/transactions/app'); expect(body.appid).toBe('wx-app'); expect(body.payer).toBeUndefined();
 expect(result.appOrderInfo).toMatchObject({ appid: 'wx-app', prepayid: 'prepay', package: 'Sign=WXPay', sign: 'signature' });
 expect(service.generatePaySign).toHaveBeenCalledWith('wx-app', expect.any(String), expect.any(String), 'prepay', expect.anything());
 expect(prisma.paymentOrder.create.mock.calls[0][0].data.channel).toBe('wx_app');
});
it('小程序仍拒绝App占位身份，非法平台header不会跳过身份检查', async () => {
 expect(canStartWechatPayment('app_login_1')).toBe(false);
 expect(inApp(() => canStartWechatPayment('app_login_1'), 'app-evil')).toBe(false);
 const { service } = fixture();
 await expect(service.wxUnifiedOrder(dto)).rejects.toThrow('小程序');
});
it('缺少App配置、用户或非法金额不会创建支付单', async () => {
 const { service, prisma } = fixture(null, false);
 await expect(inApp(() => service.wxUnifiedOrder(dto))).rejects.toThrow('配置');
 await expect(inApp(() => service.wxUnifiedOrder({ ...dto, userId: '' }))).rejects.toThrow('登录');
 expect(prisma.paymentOrder.create).not.toHaveBeenCalled();
 const configured = fixture();
 await expect(inApp(() => configured.service.wxUnifiedOrder({ ...dto, amount: Infinity }))).rejects.toThrow('金额');
 expect(configured.prisma.paymentOrder.create).not.toHaveBeenCalled();
});
it('活跃小程序支付单不能在App重复创建，不伪造跨渠道付款', async () => {
 const { service, prisma } = fixture({ id: 'old', paymentNo: 'OLD', channel: 'wx_pay', status: 'paying', expireTime: new Date(Date.now()+60000) });
 await expect(inApp(() => service.wxUnifiedOrder(dto))).rejects.toThrow('另一支付渠道');
 expect(prisma.paymentOrder.create).not.toHaveBeenCalled(); expect(service.wxPayRequest).not.toHaveBeenCalled();
});
it('iOS数字权益不走微信支付，实体订单正常允许', () => {
 expect(() => inApp(() => assertPaymentGoodsAllowed('membership_order'), 'app-ios')).toThrow('不支持');
 expect(() => inApp(() => assertPaymentGoodsAllowed('topup'), 'app-ios')).toThrow('不支持');
 expect(() => inApp(() => assertPaymentGoodsAllowed('errand_purchase'), 'app-ios')).not.toThrow();
});
