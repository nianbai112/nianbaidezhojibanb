import {PaymentService} from './payment.service';
import {requestContext} from '../../common/request-context';
const app=(work:()=>Promise<any>)=>requestContext.run({request:{headers:{'x-client-platform':'app-android'}} as any},work);
it('通用微信支付接口也拒绝取消订单和已售商品，不能绕过业务页面校验',async()=>{
 const prisma:any={secondHandOrder:{findUnique:jest.fn().mockResolvedValue({buyerId:'me',price:1,status:'cancelled',productId:'p'})},secondHand:{findUnique:jest.fn().mockResolvedValue({status:'SOLD'})},topupOrder:{findUnique:jest.fn().mockResolvedValue({userId:'me',amount:1,status:'cancelled',postId:'post'})},paymentOrder:{findFirst:jest.fn()}};
 const service:any=new PaymentService({} as any,prisma,{getLock:async()=>true,releaseLock:async()=>{}} as any,{} as any,{} as any);
 service.getWxPayConfig=async()=>({appAppid:'wx-app',mchid:'m',notifyUrl:'https://example.test/notify'});
 const dto={bizId:'o',orderNo:'O',amount:1,userId:'me',openid:'app_login_x',description:'合成'};
 await expect(app(()=>service.wxUnifiedOrder({...dto,bizType:'second_hand'}))).rejects.toThrow('状态');
 prisma.secondHandOrder.findUnique.mockResolvedValue({buyerId:'me',price:1,status:'pending_pay',productId:'p'});
 await expect(app(()=>service.wxUnifiedOrder({...dto,bizType:'second_hand'}))).rejects.toThrow('不可购买');
 await expect(app(()=>service.wxUnifiedOrder({...dto,bizType:'topup'}))).rejects.toThrow('状态');
 expect(prisma.paymentOrder.findFirst).not.toHaveBeenCalled();
});
