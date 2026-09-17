import axios from 'axios';
import { WechatOfficialService } from './wechat-official.service';
describe('official account template list', () => {
 const token = { getOfficialAccessToken: jest.fn(async () => 'test-access-token') };
 const service = new WechatOfficialService({} as any, {} as any, {} as any, token as any);
 afterEach(() => jest.restoreAllMocks());
 it('returns only template information without credentials', async () => {
  jest.spyOn(axios, 'get').mockResolvedValue({ data: { template_list: [{ template_id: 'saved-id', title: '新订单通知', content: '订单编号:{{character_string1.DATA}}', unused: 'secret' }] } });
  expect(await service.listAccountTemplates()).toEqual([{ templateId: 'saved-id', title: '新订单通知', content: '订单编号:{{character_string1.DATA}}' }]);
 });
 it('reports WeChat API failure instead of an empty list', async () => {
  jest.spyOn(axios, 'get').mockResolvedValue({ data: { errcode: 40001, errmsg: 'invalid credential' } });
  await expect(service.listAccountTemplates()).rejects.toThrow('40001');
 });
 it('does not expose access tokens from transport errors', async () => {
  jest.spyOn(axios, 'get').mockRejectedValue(new Error('url?access_token=private-token'));
  await expect(service.listAccountTemplates()).rejects.toThrow('暂时无法读取');
 });
});
