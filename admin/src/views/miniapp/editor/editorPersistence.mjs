export async function persistRegionEditor(request, regionId, payload) {
  if (!payload || !Object.keys(payload).length) return
  await request.put(`/admin/regions/${regionId}`, payload)
}
