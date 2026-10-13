import { OperationService } from './operation.service';
const fixture = () => {
 const contact: any = { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0), create: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }), deleteMany: jest.fn().mockResolvedValue({ count: 1 }) };
 const prisma: any = { contact, contactCategory: { findUnique: jest.fn().mockResolvedValue({ id: 'c1', regionId: 'r1' }) }, region: { findUnique: jest.fn().mockResolvedValue({ contactsRequireStudentAuth: true }) } };
 const access: any = { assertStudentProtectedAction: jest.fn().mockResolvedValue(undefined) };
 return { contact, prisma, access, service: new OperationService(prisma, {} as any, {} as any, {} as any, {} as any, access) };
};
const form = { name: '联系人', phone: '13800138000', category: 'c1', region_id: 'r1', userId: 'victim', isPublic: true };
it('个人联系人归属来自JWT，不能创建公开通讯录或伪造所有者', async () => {
 const { service, contact } = fixture(); await service.createContact('u1', form);
 expect(contact.create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: 'u1', isPublic: false, categoryId: 'c1' }) });
});
it('禁止使用跨校区分类且验证实际分类所在校区的认证', async () => {
 const { service, access, contact } = fixture();
 await expect(service.createContact('u1', { ...form, region_id: 'r2' })).rejects.toThrow('其他校区');
 expect(contact.create).not.toHaveBeenCalled(); await service.createContact('u1', form);
 expect(access.assertStudentProtectedAction).toHaveBeenCalledWith('u1', 'r1', '管理个人通讯录', true);
});
it.each([{ userId: 'other', isPublic: false }, { userId: 'u1', isPublic: true }, { userId: null, isPublic: false }])('他人/公共/无主联系人不允许普通用户编辑删除 %s', async (row) => {
 const { service, contact } = fixture(); contact.findUnique.mockResolvedValue({ id: 'c', ...row, category: { regionId: 'r1' } });
 await expect(service.updateContact('c', 'u1', form)).rejects.toThrow('不存在');
 await expect(service.deleteContact('c', 'u1')).rejects.toThrow('不存在');
 expect(contact.updateMany).not.toHaveBeenCalled();expect(contact.deleteMany).not.toHaveBeenCalled();
});
it('更新和删除写条件仍校验所有权，避免检查与写入之间被修改', async () => {
 const { service, contact } = fixture();contact.findUnique.mockResolvedValue({ id: 'c', userId: 'u1', isPublic: false, categoryId: 'c1', category: { regionId: 'r1' } });
 await service.updateContact('c', 'u1', form); await service.deleteContact('c','u1');
 expect(contact.updateMany.mock.calls[0][0].where).toEqual({id:'c',userId:'u1',isPublic:false,categoryId:'c1'});
 expect(contact.deleteMany.mock.calls[0][0].where).toEqual({id:'c',userId:'u1',isPublic:false,categoryId:'c1'});
});
it('公开和个人列表都分页，私有列表不接受传入别人的userId', async () => {
 const { service, contact } = fixture();await service.getMyContacts('u1',{region_id:'r1',userId:'victim',page:2,limit:20,keyword:'张'});
 expect(contact.findMany.mock.calls[0][0]).toMatchObject({where:{userId:'u1',isPublic:false,category:{regionId:'r1'}},skip:20,take:20});
 await service.getContacts({region_id:'r1',page:3,limit:10},'u1');
 expect(contact.findMany.mock.calls[1][0]).toMatchObject({where:{isPublic:true,category:{regionId:'r1'}},skip:20,take:10});
});
