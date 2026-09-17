// Configuration evidence is intentionally separate from WeChat delivery receipts.
export function describeWechatTemplateState(records = [], loadState = 'loaded') {
  if (loadState === 'loading') return { label: '检查中', type: 'info', note: '正在读取模板配置。' };
  if (loadState === 'failed') return { label: '读取失败', type: 'danger', note: '暂时无法判断配置，请刷新重试。' };
  if (!records.length) return { label: '待配置', type: 'info', note: '尚未保存此场景的模板。' };
  const enabled = records.filter(row => row.enabled === true);
  if (!enabled.length) return { label: '模板已停用', type: 'warning', note: '有模板记录，但全部已停用，当前不会使用这些模板发送。' };
  const missingIds = enabled.filter(row => !String(row.templateId || '').trim());
  if (missingIds.length) return { label: '模板 ID 缺失', type: 'danger', note: `${missingIds.length} 个启用配置缺少模板 ID。` };
  const missingMappings = enabled.filter(row => {
    const mapping = row.fieldMapping;
    return !mapping || typeof mapping !== 'object' || Array.isArray(mapping)
      || !Object.entries(mapping).length || Object.entries(mapping).some(([key, value]) => !key.trim() || typeof value !== 'string' || !value.trim());
  });
  if (missingMappings.length) return { label: '字段待配置', type: 'danger', note: `${missingMappings.length} 个启用配置缺少有效字段映射。` };
  return {
    label: enabled.length === records.length ? '已保存配置' : '部分模板停用',
    type: enabled.length === records.length ? 'info' : 'warning',
    note: `共 ${records.length} 个全局或校区配置，${enabled.length} 个启用。仍需核对微信模板、场景开关及接收条件，实际送达以发送日志中的微信回执为准。`,
  };
}
