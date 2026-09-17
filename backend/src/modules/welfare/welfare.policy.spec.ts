import { choose, dayKey, instantPrize, maskNickname, validateCampaign } from './welfare.policy';
const input = () => ({ title:'校园好礼', description:'免费参与', mode:'instant', startAt:'2099-01-01T00:00:00Z', endAt:'2099-01-02T00:00:00Z', claimUntil:'2099-01-10T00:00:00Z', dailyLimit:2, totalLimit:5, maxEntries:100, pickupLocation:'活动中心', prizes:[{name:'礼物',kind:'physical',quantity:1,probabilityBps:2000}] });
describe('福利抽奖规则',()=>{
 test('概率区间边界和未中奖区间',()=>{const a={quantity:2,issuedCount:0,probabilityBps:2000};const b={quantity:1,issuedCount:0,probabilityBps:3000};expect(instantPrize([a,b],()=>1999)).toBe(a);expect(instantPrize([a,b],()=>2000)).toBe(b);expect(instantPrize([a,b],()=>5000)).toBeNull();});
 test('库存耗尽不会把概率转移给其他奖项',()=>expect(instantPrize([{quantity:1,issuedCount:1,probabilityBps:5000},{quantity:5,issuedCount:0,probabilityBps:5000}],()=>1)).toBeNull());
 test('人数不足不重复选人且不修改候选集合',()=>{const pool=[1,2,3];const winners=choose(pool,10,()=>0);expect(new Set(winners).size).toBe(3);expect(pool).toEqual([1,2,3]);});
 test('次数按北京时间跨天',()=>{expect(dayKey(new Date('2026-09-16T15:59:59Z'))).toBe('2026-09-16');expect(dayKey(new Date('2026-09-16T16:00:00Z'))).toBe('2026-09-17');});
 test('掩码支持非BMP昵称',()=>expect(maskNickname('🐰同学')).toBe('🐰**'));
 test('拒绝概率大于100%、非法时间、非整数、空奖项',()=>{for(const patch of [{prizes:[{name:'x',kind:'physical',quantity:1,probabilityBps:10001}]},{claimUntil:'2098-01-01'},{maxEntries:1.5},{prizes:[null]}])expect(()=>validateCampaign({...input(),...patch})).toThrow();});
 test('白名单忽略客户端中奖和发布字段',()=>{const result=validateCampaign({...input(),status:'published',issuedCount:999,createdBy:'evil'});expect(result).not.toHaveProperty('status');expect(result).not.toHaveProperty('createdBy');expect(result.prizes[0]).not.toHaveProperty('issuedCount');});
 test('定时开奖禁止早于截止，次数固定为1',()=>{expect(()=>validateCampaign({...input(),mode:'scheduled',drawAt:'2099-01-01'})).toThrow();const result=validateCampaign({...input(),mode:'scheduled',drawAt:'2099-01-03'});expect(result.dailyLimit).toBe(1);expect(result.totalLimit).toBe(1);expect(result.prizes[0].probabilityBps).toBe(0);});
});
