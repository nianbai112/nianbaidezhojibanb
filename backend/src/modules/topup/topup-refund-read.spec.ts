import { TopupService } from './topup.service';
it('shows cancelled topup refund state only from the owner payment record', async()=>{
 const prisma:any={topupOrder:{findMany:jest.fn().mockResolvedValue([{id:'order',userId:'owner',paymentNo:'pay',status:'cancelled',amount:3}])},paymentOrder:{findMany:jest.fn().mockResolvedValue([{paymentNo:'pay',status:'refunded',refundedAmount:3}])}};
 const service=new TopupService(prisma,{} as any,{} as any,{} as any);
 expect((await service.getUserOrders('owner'))[0]).toMatchObject({status:'cancelled',payment_status:'refunded',refunded_amount:3});
 expect(prisma.paymentOrder.findMany).toHaveBeenCalledWith(expect.objectContaining({where:{userId:'owner',bizType:'topup',paymentNo:{in:['pay']}}}));
});
