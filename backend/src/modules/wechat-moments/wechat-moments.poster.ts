import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import sharp from 'sharp';
import type { OverlayOptions } from 'sharp';

/**
 * 服务端笔记海报（小红书分享卡风格）。
 *
 *   ┌──────────────────────┐  暖米色底 + 白色圆角卡片
 *   │   封面 4:5（1/N）     │  有图：第一张图/视频封面
 *   │                      │  纯文字：文字封面模板 + 大字
 *   ├──────────────────────┤
 *   │ 标题（粗，2 行）       │  纯文字帖不重复显示
 *   │ 正文摘要（灰，2 行）   │
 *   │ ○ 作者        #圈子   │
 *   │ - - - - - - - - - - -│
 *   │ logo 品牌名     [码]  │
 *   └──────────────────────┘
 *
 * 朋友圈多图会被裁成正方形缩略图，只露中间一段，所以大字放在封面的 24%~62% 高度之间。
 * 依赖服务器已安装中文字体（默认 Noto Sans CJK SC）。
 */

export interface MomentPosterInput {
  postId: string;
  authorName: string;
  authorAvatar?: string;
  circleName?: string;
  title?: string;
  content: string;
  /** 可做封面的图片（图片 URL 或视频封面），取第一张 */
  images: string[];
  photoCount: number;
  videoCount: number;
  brandName: string;
  logoUrl?: string;
  qrcodeUrl: string;
  footerText?: string;
}

export interface MomentPosterOptions {
  fontFamily?: string;
  fontFile?: string;
  fetchImage: (url: string) => Promise<Buffer | null>;
  /** 文字封面模板目录，默认取本模块旁的 templates/ */
  templateDir?: string;
}

export interface RenderedPoster {
  buffer: Buffer;
  width: number;
  height: number;
  mimeType: 'image/jpeg';
}

/** 文字封面模板（来自“文字封面模板-短竖版4比5”），x/y/w/h 为可写字区域占模板宽高的比例 */
export const TEXT_COVER_TEMPLATES = [
  { file: '01-campus-note.png', x: 0.1, y: 0.13, w: 0.74, h: 0.5, color: '#3B2E1A' },
  { file: '02-chat-bubble.png', x: 0.13, y: 0.14, w: 0.72, h: 0.5, color: '#1F2A37' },
  { file: '03-campus-notice.png', x: 0.13, y: 0.12, w: 0.72, h: 0.46, color: '#3B2E1A' },
  { file: '04-fresh-geometry.png', x: 0.12, y: 0.17, w: 0.6, h: 0.45, color: '#1F3B2B' },
];

const W = 1080;
const M = 56; // 卡片外边距
const CARD_W = W - M * 2;
const PAD = 48; // 卡片内边距
const TEXT_X = M + PAD;
const TEXT_W = CARD_W - PAD * 2;
const COVER_H = Math.round(CARD_W * 1.25); // 4:5
const RADIUS = 36;
const QR = 168;
const COLORS = {
  page: '#F3F0EA',
  card: '#FFFFFF',
  title: '#1F1F1F',
  body: '#6B6B6B',
  author: '#333333',
  muted: '#8A8A8A',
  chip: '#F2F2F2',
  divider: '#E5E1D8',
};

type Layer = OverlayOptions;
type TextBlock = { buffer: Buffer; width: number; height: number };

export function escapeMarkup(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** 按字符截断（中文按 1 个字符计），超出时补省略号 */
export function truncateChars(value: string, max: number): string {
  const chars = Array.from(String(value || '').trim());
  if (chars.length <= max) return chars.join('');
  return `${chars.slice(0, Math.max(0, max - 1)).join('')}…`;
}

export function compactText(value: string): string {
  return String(value || '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 同一个帖子总是用同一张模板，不同帖子轮换 */
export function pickTemplateIndex(postId: string): number {
  let hash = 0;
  for (const ch of String(postId || '')) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return hash % TEXT_COVER_TEMPLATES.length;
}

/** 大字封面字号：字越少越大 */
export function coverFontSize(text: string): number {
  const n = Array.from(text).length;
  if (n <= 16) return 84;
  if (n <= 36) return 68;
  if (n <= 60) return 56;
  return 48;
}

export function mediaBadge(photoCount: number, videoCount: number): string {
  const total = photoCount + videoCount;
  if (videoCount > 0 && photoCount === 0) return videoCount > 1 ? `▶ ${videoCount}段视频` : '▶ 视频';
  return total > 1 ? `1/${total}` : '';
}

export function resolveTemplateDir(custom?: string): string {
  const candidates = [
    custom,
    join(__dirname, 'templates'),
    join(process.cwd(), 'src/modules/wechat-moments/templates'),
    join(process.cwd(), 'dist/src/modules/wechat-moments/templates'),
  ].filter(Boolean) as string[];
  return candidates.find((dir) => existsSync(join(dir, TEXT_COVER_TEMPLATES[0].file))) || candidates[1];
}

export async function renderMomentPoster(input: MomentPosterInput, options: MomentPosterOptions): Promise<RenderedPoster> {
  const fontFamily = options.fontFamily || 'Noto Sans CJK SC';
  const text = (value: string, size: number, color: string, extra: { weight?: string; width?: number; spacing?: number } = {}) =>
    renderText(value, size, color, { fontFamily, fontFile: options.fontFile, ...extra });
  const layers: Layer[] = [];

  // ---------- 封面 ----------
  const title = compactText(input.title || '');
  const content = compactText(input.content || '');
  const coverSource = input.images.find(Boolean);
  const photo = coverSource ? await loadImage(options, coverSource) : null;
  const textOnly = !photo;
  const cover = textOnly
    ? await renderTextCover(title || content || '分享了一篇笔记', input.postId, options, text)
    : photo!;
  layers.push({ input: await roundedImage(cover, CARD_W, COVER_H, RADIUS, 'top'), left: M, top: M });

  const badge = textOnly ? '' : mediaBadge(input.photoCount, input.videoCount);
  if (badge) {
    const b = await text(badge, 26, '#FFFFFF', { weight: 'bold' });
    const bw = b.width + 36;
    layers.push({ input: svgBuffer(bw, 50, `<rect width="${bw}" height="50" rx="25" fill="#000" fill-opacity="0.42"/>`), left: M + CARD_W - bw - 28, top: M + 28 });
    layers.push({ input: b.buffer, left: M + CARD_W - bw - 28 + 18, top: M + 28 + Math.round((50 - b.height) / 2) });
  }

  // ---------- 标题 + 摘要（纯文字帖的字已经在封面上） ----------
  let y = M + COVER_H + 40;
  if (!textOnly) {
    const headline = await fitText(truncateChars(title || content || '分享了一篇笔记', 60), 2 * 64 + 6, (v) =>
      text(v, 46, COLORS.title, { weight: 'bold', width: TEXT_W, spacing: 18 }),
    );
    layers.push({ input: headline.buffer, left: TEXT_X, top: y });
    y += headline.height + 16;
    if (title && content) {
      const excerpt = await fitText(truncateChars(content, 90), 2 * 44 + 6, (v) => text(v, 30, COLORS.body, { width: TEXT_W, spacing: 14 }));
      layers.push({ input: excerpt.buffer, left: TEXT_X, top: y });
      y += excerpt.height + 8;
    }
    y += 20;
  }

  // ---------- 作者行 ----------
  const avatar = input.authorAvatar ? await loadImage(options, input.authorAvatar) : null;
  layers.push({
    input: avatar ? await roundedImage(avatar, 60, 60, 30) : svgBuffer(60, 60, `<circle cx="30" cy="30" r="30" fill="#E8E2D6"/>`),
    left: TEXT_X,
    top: y,
  });
  const name = await text(truncateChars(input.authorName || '同学', 14), 30, COLORS.author, { weight: '500' });
  layers.push({ input: name.buffer, left: TEXT_X + 76, top: y + 30 - Math.round(name.height / 2) });
  if (input.circleName) {
    const chip = await text(`# ${truncateChars(input.circleName, 10)}`, 26, COLORS.muted);
    const cw = chip.width + 32;
    layers.push({ input: svgBuffer(cw, 46, `<rect width="${cw}" height="46" rx="23" fill="${COLORS.chip}"/>`), left: TEXT_X + TEXT_W - cw, top: y + 7 });
    layers.push({ input: chip.buffer, left: TEXT_X + TEXT_W - cw + 16, top: y + 30 - Math.round(chip.height / 2) });
  }

  // ---------- 品牌栏 + 小程序码 ----------
  const footerTop = y + 60 + 36;
  const logo = input.logoUrl ? await loadImage(options, input.logoUrl) : null;
  const brandX = logo ? TEXT_X + 104 : TEXT_X;
  if (logo) layers.push({ input: await roundedImage(logo, 84, 84, 22, 'all', 'contain'), left: TEXT_X, top: footerTop + 50 });
  const brand = await text(truncateChars(input.brandName || '校小伴', 12), 36, COLORS.title, { weight: 'bold' });
  layers.push({ input: brand.buffer, left: brandX, top: footerTop + 46 });
  const slogan = await text(truncateChars(input.footerText || '长按识别小程序码 · 查看完整笔记', 20), 25, COLORS.muted);
  layers.push({ input: slogan.buffer, left: brandX, top: footerTop + 46 + brand.height + 10 });
  const qr = await loadImage(options, input.qrcodeUrl);
  if (qr) layers.push({ input: await roundedImage(qr, QR, QR, 16, 'all', 'contain'), left: TEXT_X + TEXT_W - QR, top: footerTop + 16 });

  const H = footerTop + 16 + QR + 40 + M;
  const base = svgBuffer(
    W,
    H,
    `<rect width="${W}" height="${H}" fill="${COLORS.page}"/>
     <rect x="${M}" y="${M}" width="${CARD_W}" height="${H - M * 2}" rx="${RADIUS}" fill="${COLORS.card}"/>
     <line x1="${TEXT_X}" y1="${footerTop}" x2="${TEXT_X + TEXT_W}" y2="${footerTop}" stroke="${COLORS.divider}" stroke-width="2" stroke-dasharray="10 10"/>`,
  );
  const buffer = await sharp(base).composite(layers).jpeg({ quality: 88, chromaSubsampling: '4:4:4' }).toBuffer();
  return { buffer, width: W, height: H, mimeType: 'image/jpeg' };
}

/** 小红书式大字封面：模板铺满 4:5，文字写在模板空白处并尽量居中 */
async function renderTextCover(
  value: string,
  postId: string,
  options: MomentPosterOptions,
  text: (value: string, size: number, color: string, extra?: { weight?: string; width?: number; spacing?: number }) => Promise<TextBlock>,
): Promise<Buffer> {
  const tpl = TEXT_COVER_TEMPLATES[pickTemplateIndex(postId)];
  const file = join(resolveTemplateDir(options.templateDir), tpl.file);
  const base = existsSync(file)
    ? await sharp(readFileSync(file)).resize(CARD_W, COVER_H, { fit: 'cover' }).png().toBuffer()
    : svgBuffer(CARD_W, COVER_H, `<rect width="${CARD_W}" height="${COVER_H}" fill="#FFF6E8"/>`);

  const boxTop = Math.round(COVER_H * Math.max(tpl.y, 0.24));
  const boxBottom = Math.round(COVER_H * Math.min(tpl.y + tpl.h, 0.62));
  const boxW = Math.round(CARD_W * tpl.w);
  const content = truncateChars(value, 80);
  const size = coverFontSize(content);
  const block = await fitText(content, boxBottom - boxTop, (v) => text(v, size, tpl.color, { weight: 'bold', width: boxW, spacing: Math.round(size * 0.45) }));
  const top = Math.max(boxTop, Math.round((boxTop + boxBottom - block.height) / 2));
  return sharp(base).composite([{ input: block.buffer, left: Math.round(CARD_W * tpl.x), top }]).png().toBuffer();
}

async function renderText(
  value: string,
  size: number,
  color: string,
  opts: { fontFamily: string; fontFile?: string; weight?: string; width?: number; spacing?: number },
): Promise<TextBlock> {
  const markup = `<span foreground="${color}"${opts.weight ? ` weight="${opts.weight}"` : ''}>${escapeMarkup(value || ' ')}</span>`;
  const { data, info } = await sharp({
    text: {
      text: markup,
      font: `${opts.fontFamily} ${size}`,
      ...(opts.fontFile ? { fontfile: opts.fontFile } : {}),
      ...(opts.width ? { width: opts.width } : {}),
      dpi: 72,
      rgba: true,
      wrap: 'word-char',
      ...(opts.spacing ? { spacing: opts.spacing } : {}),
    },
  })
    .png()
    .toBuffer({ resolveWithObject: true });
  return { buffer: data, width: info.width, height: info.height };
}

/** 过长时逐步截短并补“…”，直到高度不超过 maxHeight */
async function fitText(value: string, maxHeight: number, render: (value: string) => Promise<TextBlock>): Promise<TextBlock> {
  let chars = Array.from(value);
  let current = await render(value);
  while (current.height > maxHeight && chars.length > 1) {
    chars = chars.slice(0, Math.max(1, Math.floor(chars.length * 0.88)));
    current = await render(`${chars.join('').replace(/…$/, '')}…`);
  }
  return current;
}

async function loadImage(options: MomentPosterOptions, url: string): Promise<Buffer | null> {
  try {
    const buffer = await options.fetchImage(url);
    if (!buffer?.length) return null;
    await sharp(buffer).metadata();
    return buffer;
  } catch {
    return null;
  }
}

async function roundedImage(source: Buffer, w: number, h: number, radius: number, corners: 'all' | 'top' = 'all', fit: 'cover' | 'contain' = 'cover') {
  const resized = await sharp(source)
    .rotate()
    .resize(w, h, { fit, background: { r: 255, g: 255, b: 255, alpha: fit === 'contain' ? 0 : 1 } })
    .ensureAlpha()
    .png()
    .toBuffer();
  const shape =
    corners === 'top'
      ? `<path d="M0,${radius} Q0,0 ${radius},0 L${w - radius},0 Q${w},0 ${w},${radius} L${w},${h} L0,${h} Z" fill="#fff"/>`
      : `<rect width="${w}" height="${h}" rx="${radius}" ry="${radius}" fill="#fff"/>`;
  return sharp(resized).composite([{ input: svgBuffer(w, h, shape), blend: 'dest-in' }]).png().toBuffer();
}

function svgBuffer(w: number, h: number, inner: string): Buffer {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${inner}</svg>`);
}
