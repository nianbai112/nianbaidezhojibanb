import request from '@/utils/request'
import type { ApiResponse, PageParams, PageResult } from '@/types/api'
import type { ContactCategory, Contact } from '@/types/contacts'

export const contactsApi = {
  getCategoryList(params: PageParams & { regionId?: string }) {
    return request.get<ApiResponse<PageResult<ContactCategory>>>('/admin/contact-categories', { params })
  },
  createCategory(data: Partial<ContactCategory>) {
    return request.post<ApiResponse>('/admin/contact-categories', data)
  },
  updateCategory(id: string, data: Partial<ContactCategory>) {
    return request.put<ApiResponse>(`/admin/contact-categories/${id}`, data)
  },
  deleteCategory(id: string) {
    return request.delete<ApiResponse>(`/admin/contact-categories/${id}`)
  },
  getContactList(params: PageParams & { categoryId?: string; keyword?: string }) {
    return request.get<ApiResponse<PageResult<Contact>>>('/admin/contacts', { params })
  },
  createContact(data: Partial<Contact>) {
    return request.post<ApiResponse>('/admin/contacts', data)
  },
  updateContact(id: string, data: Partial<Contact>) {
    return request.put<ApiResponse>(`/admin/contacts/${id}`, data)
  },
  deleteContact(id: string) {
    return request.delete<ApiResponse>(`/admin/contacts/${id}`)
  },
}
