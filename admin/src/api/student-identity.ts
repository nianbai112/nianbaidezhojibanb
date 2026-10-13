import { request } from './request';
const base = '/admin/student-identity';
export const studentIdentityApi = {
  schools: (keyword = '') =>
    request.get(`${base}/schools`, { params: { keyword }, skipGetDeduplication: true }) as Promise<any>,
  roster: (school: string, params: any) =>
    request.get(`${base}/schools/${school}/roster`, { params, skipGetDeduplication: true }) as Promise<any>,
  applications: (params: any) =>
    request.get(`${base}/applications`, { params, skipGetDeduplication: true }) as Promise<any>,
  review: (user: string, data: any) =>
    request.post(`${base}/applications/${user}/review`, data),
  preview: (school: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request.post(`${base}/schools/${school}/import/preview`, form, {
      timeout: 45000,
    }) as Promise<any>;
  },
  commit: (school: string, batch: string) =>
    request.post(
      `${base}/schools/${school}/import/${batch}/commit`,
      {},
      { timeout: 45000 },
    ),
  policy: (school: string, data: any) =>
    request.patch(`${base}/schools/${school}/policy`, data),
  enrollment: (school: string, student: string, data: any) =>
    request.patch(
      `${base}/schools/${school}/students/${student}/enrollment`,
      data,
    ),
  release: (school: string, student: string, data: any) =>
    request.post(`${base}/schools/${school}/students/${student}/release`, data),
  events: (school: string, userId?: string) =>
    request.get(`${base}/schools/${school}/events`, {
      params: { userId },
      skipGetDeduplication: true,
    }) as Promise<any>,
  material: (id: string) =>
    request.get(`${base}/materials/${id}`, {
      responseType: 'blob',
      skipGetDeduplication: true,
    }) as unknown as Promise<Blob>,
};
