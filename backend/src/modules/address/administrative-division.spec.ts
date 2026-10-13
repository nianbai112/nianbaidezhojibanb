import axios from 'axios';
import { AdministrativeDivisionService } from './administrative-division.service';
import { AddressService } from './address.service';
jest.mock('axios');
const api = axios.get as jest.Mock;
describe('verified shipping divisions', () => {
 beforeEach(() => jest.clearAllMocks());
 it('checks actual hierarchy and refuses mismatched province/district', async () => {
  const service = new AdministrativeDivisionService({ get: () => '' } as any);
  jest.spyOn(service, 'children').mockImplementation(async parent => ({'': [{code:'440000',name:'广东省'}], '440000':[{code:'440100',name:'广州市'}], '440100':[{code:'440106',name:'天河区'}]}[parent || ''] || []));
  expect(await service.validatePath('440000','440100','440106')).toMatchObject({label:'广东省 广州市 天河区'});
  await expect(service.validatePath('440000','440100','110101')).rejects.toThrow('区县');
  await expect(service.validatePath('110000','440100','440106')).rejects.toThrow('省份');
 });
 it('handles municipalities without invented city codes and cities without counties', async () => {
  const service = new AdministrativeDivisionService({get:()=>''} as any);
  jest.spyOn(service,'children').mockImplementation(async p => ({'':[{code:'110000',name:'北京市'},{code:'440000',name:'广东省'}], '110000':[{code:'110101',name:'东城区'}], '440000':[{code:'441900',name:'东莞市'}], '441900':[]}[p || ''] || []));
  expect((await service.validatePath('110000','110000','110101')).label).toBe('北京市 东城区');
  expect((await service.validatePath('440000','441900','441900')).label).toBe('广东省 东莞市');
 });
 it('accepts a county administered directly by a province without fabricating a city',async()=>{
  const service=new AdministrativeDivisionService({get:()=>''} as any);
  jest.spyOn(service,'children').mockImplementation(async p=>({'':[{code:'460000',name:'海南省'}],'460000':[{code:'460100',name:'海口市'},{code:'469001',name:'五指山市'}],'469001':[]}[p||'']||[]));
  expect((await service.validatePath('460000','469001','469001')).label).toBe('海南省 五指山市');
  await expect(service.validatePath('460000','460000','469001')).rejects.toThrow('城市');
 });
 it('bounds provider requests, strips metadata and caches only successful data',async()=>{
  const service = new AdministrativeDivisionService({get:(k:string)=>k.endsWith('_KEY')?'fake-test-key':''} as any);
  api.mockResolvedValueOnce({data:{status:0,result:[[{id:'440000',fullname:'广东省',secret:'none'},{id:'bad',fullname:'bad'}]]}});
  expect(await service.children()).toEqual([{code:'440000',name:'广东省'}]);await service.children();expect(api).toHaveBeenCalledTimes(1);
  expect(api).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\/apis.map.qq.com\/ws\/district\/v1\/getchildren\?key=/),expect.objectContaining({maxRedirects:0,timeout:8000}));
 });
 it('provider errors never expose key and unconfigured service never performs a request',async()=>{
  const missing=new AdministrativeDivisionService({get:()=>''} as any);await expect(missing.children()).rejects.toThrow('尚未配置');expect(api).not.toHaveBeenCalled();
  const service=new AdministrativeDivisionService({get:()=> 'secret-key'} as any);api.mockRejectedValue(new Error('secret-key'));await expect(service.children()).rejects.toThrow('暂不可用');
 });
 it('address saves validate all codes and clearing address text cannot keep stale freight scope',async()=>{
  const service:any=new AddressService({} as any,{validatePath:jest.fn().mockResolvedValue({provinceCode:'440000',cityCode:'440100',districtCode:'440106'})} as any);
  expect(await service.validateDivisionPayload({provinceCode:'440000',cityCode:'440100',districtCode:'440106'})).toEqual({provinceCode:'440000',cityCode:'440100',districtCode:'440106'});
  expect(await service.validateDivisionPayload({full_address:'上海新地址'},{fullAddress:'广州旧地址',provinceCode:'440000'})).toEqual({provinceCode:null,cityCode:null,districtCode:null});
  expect(await service.validateDivisionPayload({is_default:1},{provinceCode:'440000'})).toEqual({});
 });
});
