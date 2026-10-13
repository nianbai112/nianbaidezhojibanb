import { Prisma } from '@prisma/client';
import { ShopRankingService, shopRankingPeriod } from './shop-ranking.service';
const now = new Date('2026-09-28T16:30:00.000Z');
const merchant = (id: string) => ({ id, name: id, logo: null, businessType: 'takeaway' });
function fixture() {
  const tx = { merchant: { findMany: jest.fn().mockResolvedValue([merchant('a'), merchant('b'), merchant('c')]) }, order: { groupBy: jest.fn().mockResolvedValue([{ merchantId: 'b', _count: { id: 2 }, _sum: { payAmount: new Prisma.Decimal('0.30') } }]) }, review: { findMany: jest.fn().mockResolvedValue([{ id: 'r1', rating: 4, order: { merchantId: 'a' } }, { id: 'r2', rating: 5, order: { merchantId: 'a' } }, { id: 'r3', rating: 5, order: { merchantId: 'b' } }]) } };
  const db = { $transaction: jest.fn(work => work(tx)) };
  return { tx, db, service: new ShopRankingService(db as any) };
}
describe('Shanghai merchant rankings', () => {
  it.each([
    ['day', '2026-09-28T16:00:00.000Z', now.toISOString()],
    ['yesterday', '2026-09-27T16:00:00.000Z', '2026-09-28T16:00:00.000Z'],
    ['week', '2026-09-27T16:00:00.000Z', now.toISOString()],
    ['month', '2026-08-31T16:00:00.000Z', now.toISOString()],
    ['year', '2025-12-31T16:00:00.000Z', now.toISOString()],
  ])('%s uses Asia/Shanghai boundaries irrespective of server timezone', (range, start, end) => {
    const result = shopRankingPeriod(range, now); expect(result.start.toISOString()).toBe(start); expect(result.end.toISOString()).toBe(end);
  });
  it('Sunday is in the prior Monday week and January/leap-day rollover is exact', () => {
    expect(shopRankingPeriod('week', new Date('2026-09-27T15:59:59Z')).start.toISOString()).toBe('2026-09-20T16:00:00.000Z');
    expect(shopRankingPeriod('yesterday', new Date('2024-03-01T00:00:00Z')).start.toISOString()).toBe('2024-02-28T16:00:00.000Z');
    expect(shopRankingPeriod('year', new Date('2026-12-31T16:00:00Z')).start.toISOString()).toBe('2026-12-31T16:00:00.000Z');
  });
  it('uses real decimal income and review samples, never merchant default rating', async () => {
    const f=fixture(), row=await f.service.list({region_id:'campus',sort_by:'ratings'},now);
    expect(row.list.map(x=>x.merchant_id)).toEqual(['b','a','c']); expect(row.list[1].rating).toBe(4.5); expect(row.list[1].positive_rate).toBe(100); expect(row.list[2].rating).toBeNull(); expect(row.list[2].review_count).toBe(0);
    expect(row.list[0].net_paid).toBe('0.30'); expect(row.list[0].average_order_paid).toBe('0.15'); expect(row.sales_label).toBe('未退款完结订单实收');
    expect(f.tx.order.groupBy.mock.calls[0][0].where.AND[0]).toMatchObject({merchantId:{in:['a','b','c']},status:{in:['RECEIVED','COMPLETED']},refundStatus:'none',refunds:{none:{status:{in:['pending','approved','completed']}}}});
    expect(f.db.$transaction).toHaveBeenCalledWith(expect.any(Function),{isolationLevel:'RepeatableRead',timeout:15000});
  });
  it('public/current-region scope excludes unreviewed merchants and uses completed timestamps', async () => {
    const f=fixture(); await f.service.list({region_id:'campus'},now);
    expect(f.tx.merchant.findMany.mock.calls[0][0].where).toEqual({regionId:'campus',OR:[{businessType:'takeaway',status:'approved'},{businessType:'dorm_shop',status:{in:['approved','closed']}}]});
    expect(f.tx.order.groupBy.mock.calls[0][0].where.AND[1].OR[1]).toEqual({completeTime:null,receiveTime:{gte:new Date('2026-09-28T16:00:00Z'),lt:now}});
    expect(f.tx.review.findMany.mock.calls[0][0]).toMatchObject({where:{status:'active',rating:{gte:1,lte:5}},select:{order:{select:{merchantId:true}}}});
  });
  it('tie breaks by sample count then stable ID and paginates after sorting',async()=>{
    const f=fixture(); f.tx.review.findMany.mockResolvedValue([]); const first=await f.service.list({region_id:'campus',sort_by:'orders',page_size:2},now),second=await f.service.list({region_id:'campus',sort_by:'orders',page_size:2,page:2,as_of:first.as_of},new Date(now.getTime()+1000));
    expect(first.list.map(x=>x.merchant_id)).toEqual(['b','a']); expect(first.has_more).toBe(true); expect(second.list.map(x=>x.merchant_id)).toEqual(['c']); expect(second.list[0].rank).toBe(3); expect(second.total).toBe(3); expect(second.has_more).toBe(false); expect(second.period_end).toBe(first.period_end);
  });
  it.each([{region_id:''},{region_id:'a',time_range:'all'},{region_id:'a',sort_by:'sql'},{region_id:'a',page_size:51},{region_id:'a',page:-1},{region_id:'a',as_of:'2026-09-29T00:00:00Z'},{region_id:'a',as_of:'2026-01-01'}])('rejects invalid query without issuing queries: %j',async query=>{const f=fixture(); await expect(f.service.list(query,now)).rejects.toThrow(); expect(f.db.$transaction).not.toHaveBeenCalled()});
  it('empty campus never performs unscoped order/review queries',async()=>{const f=fixture();f.tx.merchant.findMany.mockResolvedValue([]);const result=await f.service.list({region_id:'campus'},now);expect(result.list).toEqual([]);expect(f.tx.order.groupBy).not.toHaveBeenCalled();expect(f.tx.review.findMany).not.toHaveBeenCalled()});
  it('reads legacy reviews in bounded pages through their order merchant relation',async()=>{const f=fixture();f.tx.review.findMany.mockResolvedValueOnce(Array.from({length:1000},(_,i)=>({id:'r'+i,rating:1,order:{merchantId:'c'}}))).mockResolvedValueOnce([{id:'last',rating:5,order:{merchantId:'c'}}]); const result=await f.service.list({region_id:'campus',sort_by:'ratings'},now);expect(result.list.find(row=>row.merchant_id==='c')?.review_count).toBe(1001);expect(f.tx.review.findMany.mock.calls[1][0]).toMatchObject({cursor:{id:'r999'},skip:1,take:1000})});
});
