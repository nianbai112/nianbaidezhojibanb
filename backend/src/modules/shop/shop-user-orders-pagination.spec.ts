import { ShopService } from './shop.service';
describe('user orders merged pagination',()=>{
 const setup=(delivery:any[],errands:any[])=>{
  const fetch=(rows:any[])=>jest.fn(async(args:any)=>rows.slice(0,args.take));
  const prisma:any={order:{findMany:fetch(delivery),count:jest.fn(async()=>delivery.length)},errandOrder:{findMany:fetch(errands),count:jest.fn(async()=>errands.length)},regionRider:{findMany:jest.fn(async()=>[])}};
  const service:any=Object.create(ShopService.prototype);service.prisma=prisma;
  service.buildDeliveryOrderWhere=jest.fn((userId,status,keyword)=>({userId,status,keyword}));service.buildErrandOrderWhere=jest.fn((userId,status,keyword)=>({userId,status,keyword}));service.getOrderStatistics=jest.fn(async()=>({}));service.formatDeliveryOrder=(row:any)=>row;service.formatErrandOrder=(row:any)=>row;
  return{prisma,service};
 };
 const rows=(prefix:string,n:number,offset=0)=>Array.from({length:n},(_,i)=>({id:prefix+String(100-i),created_at:new Date(2000000-(i*2+offset)*1000).toISOString()}));
 it('reports true count and next page when all orders come from one source',async()=>{const {service,prisma}=setup(rows('s',45),[]);const a=await service.getOrders('u',{page:1,pageSize:20,status:'pending',keyword:'abc'});expect(a.orders).toHaveLength(20);expect(a.pagination).toEqual({page:1,pageSize:20,total:45,has_more:true});expect(prisma.order.count).toHaveBeenCalledWith({where:{userId:'u',status:'pending',keyword:'abc'}});expect(prisma.errandOrder.count).toHaveBeenCalledWith({where:{userId:'u',status:'pending',keyword:'abc'}});const b=await service.getOrders('u',{page:3,pageSize:20});expect(b.orders).toHaveLength(5);expect(b.pagination.has_more).toBe(false)});
 it('merges both sources before slicing with no lost second-page records',async()=>{const {service}=setup(rows('s',35),rows('e',25,1));const a=await service.getOrders('u',{page:1,pageSize:20});const b=await service.getOrders('u',{page:2,pageSize:20});expect(a.pagination.total).toBe(60);expect(b.pagination.has_more).toBe(true);expect(new Set([...a.orders,...b.orders].map((r:any)=>r.id)).size).toBe(40);expect(b.orders[0].id).toBe('s90')});
 it('requests stable within-source ordering for equal creation times',async()=>{const {service,prisma}=setup([] ,[]);await service.getOrders('u',{});expect(prisma.order.findMany.mock.calls[0][0].orderBy).toEqual([{createdAt:'desc'},{id:'desc'}]);expect(prisma.errandOrder.findMany.mock.calls[0][0].orderBy).toEqual([{createdAt:'desc'},{id:'desc'}])});
});
