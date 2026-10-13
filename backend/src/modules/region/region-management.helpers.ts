import { BadRequestException } from '@nestjs/common';

const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
export const managementCategory = (type: string): string => ['nav', 'menu', 'navItem'].includes(type) ? 'navItem' : type;
const safeImage = (value: unknown): string => {
  const url = text(value);
  if (url && (!/^https:\/\/[^\s]+$/i.test(url) || url.length > 2048)) throw new BadRequestException('图片须使用已上传的 HTTPS 地址');
  return url;
};
export function decodeManagementLink(link: unknown) {
  const raw = text(link);
  if (raw.startsWith('miniapp_half:') || raw.startsWith('miniapp:')) {
    const half = raw.startsWith('miniapp_half:'); const body = raw.slice(half ? 13 : 8); const split = body.indexOf('|');
    return { type: half ? 'miniprogram-half' : 'miniprogram', appId: split >= 0 ? body.slice(0, split) : '', target: split >= 0 ? body.slice(split + 1) : body };
  }
  if (raw.startsWith('tel:')) return { type: 'phone', target: raw.slice(4), appId: '' };
  if (raw.startsWith('contact:')) return { type: 'contact', target: raw.slice(8), appId: '' };
  if (/^https?:\/\//i.test(raw)) return { type: 'webview', target: raw, appId: '' };
  return { type: 'page', target: raw.replace(/^internal:/, ''), appId: '' };
}
export function serializeManagementItem(row: any) {
  return { id: row.id, regionId: row.regionId, category: managementCategory(row.type), title: row.title || '', image: row.image || '', icon: row.image || '', content: row.content || '', sortOrder: row.sortOrder, isShow: row.isShow, ...decodeManagementLink(row.link) };
}
export function buildManagementContentData(dto: any, previous?: any) {
  if (!dto || typeof dto !== 'object' || Array.isArray(dto)) throw new BadRequestException('内容格式不正确');
  // Whitelist the legacy database representation as well as the mobile editor DTO.
  const category = managementCategory(text(dto.category ?? previous?.type ?? dto.type));
  if (!['banner', 'notice', 'navItem'].includes(category)) throw new BadRequestException('不支持的内容类别');
  const title = text(dto.title ?? previous?.title);
  if (!title || title.length > 100) throw new BadRequestException('标题须为 1 至 100 个字符');
  const image = safeImage((category === 'banner' ? dto.image ?? dto.icon : dto.icon ?? dto.image) ?? previous?.image ?? '');
  if (category !== 'notice' && !image) throw new BadRequestException('请上传轮播图片或导航图标');
  const current = decodeManagementLink(previous?.link ?? dto.link);
  const jump = text(dto.category ? dto.type ?? current.type : current.type);
  const target = text(dto.target ?? current.target);
  let link = '';
  if (target.length > 2048 || /[\u0000-\u001f]/.test(target)) throw new BadRequestException('跳转目标格式不正确');
  if (jump === 'page') {
    if (!/^\/?(?:pages[A-Za-z]*|campusMap)\/[A-Za-z0-9_/?&=.%+~:#-]+$/.test(target) || target.includes('..')) throw new BadRequestException('请填写有效站内页面路径');
    link = `internal:${target.replace(/^\//, '')}`;
  } else if (jump === 'webview') {
    if (!/^https:\/\/[^\s]+$/i.test(target)) throw new BadRequestException('网页链接须为 HTTPS 地址');
    link = target;
  } else if (jump === 'phone') {
    if (!/^[0-9+\-\s]{6,20}$/.test(target)) throw new BadRequestException('电话号码格式不正确');
    link = `tel:${target}`;
  } else if (jump === 'contact') {
    if (!target || target.length > 500) throw new BadRequestException('请填写不超过 500 字的客服消息');
    link = `contact:${target}`;
  } else if (jump === 'miniprogram' || jump === 'miniprogram-half') {
    const appId = text(dto.appId ?? current.appId);
    if (!/^wx[a-zA-Z0-9]{16}$/.test(appId) || !target || /[\s|]/.test(target) || target.includes('..') || /^[a-z]+:/i.test(target)) throw new BadRequestException('请填写微信小程序 AppID 和有效页面路径');
    link = `${jump === 'miniprogram' ? 'miniapp' : 'miniapp_half'}:${appId}|${target.replace(/^\//, '')}`;
  } else throw new BadRequestException('不支持的跳转类型');
  const sortOrder = dto.sortOrder ?? dto.sort_order ?? previous?.sortOrder ?? 0;
  if (typeof sortOrder !== 'number' || !Number.isSafeInteger(sortOrder) || Math.abs(sortOrder) > 100000) throw new BadRequestException('排序须为 -100000 至 100000 的整数');
  const isShow = dto.isShow ?? previous?.isShow ?? true;
  if (typeof isShow !== 'boolean') throw new BadRequestException('显示状态须为布尔值');
  const content = text(dto.content ?? previous?.content);
  if (content.length > 5000) throw new BadRequestException('内容过长');
  return { type: category === 'navItem' ? 'menu' : category, title, image, content, link, sortOrder, isShow };
}
