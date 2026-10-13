import {AssistantTicketService} from './assistant-ticket.service';
it('个人咨询分页仅按JWT用户筛选，回复计数来自数据库，兼容旧无分页数组',async()=>{
 const model={findMany:jest.fn().mockResolvedValue([{id:'t',content:'咨询',replies:[{content:'回复'}],_count:{replies:5}}]),count:jest.fn().mockResolvedValue(21)};
 const self:any={prisma:{assistantTicket:model},title:(v:string)=>v};
 const result=await AssistantTicketService.prototype.listMyTickets.call(self,'me',{page:2,pageSize:20,userId:'other'});
 expect(result).toMatchObject({total:21,page:2,list:[{replyCount:5}]});expect(model.findMany).toHaveBeenCalledWith(expect.objectContaining({where:{userId:'me'},skip:20,take:20}));
 expect(Array.isArray(await AssistantTicketService.prototype.listMyTickets.call(self,'me'))).toBe(true);
 await expect(AssistantTicketService.prototype.listMyTickets.call(self,'me',{page:-1})).rejects.toThrow('分页');
});
