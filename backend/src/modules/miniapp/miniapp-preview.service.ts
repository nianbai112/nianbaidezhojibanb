import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const CLI_PATH = '/Applications/wechatwebdevtools.app/Contents/MacOS/cli';
const UPLOAD_DIR = path.join(process.cwd(), 'uploads');

/**
 * 真机预览：通过 miniprogram-automator 驱动微信开发者工具的模拟器，
 * 对真实小程序截图。开发者工具未就绪时返回明确的错误状态，不阻塞主流程。
 */
@Injectable()
export class MiniappPreviewService {
  private readonly logger = new Logger(MiniappPreviewService.name);
  private mp: any = null;
  private connecting: Promise<any> | null = null;
  private lastShotAt = 0;
  private lastError = '';

  private get projectPath(): string {
    return process.env.MINIAPP_SOURCE_DIR || path.join(os.homedir(), 'Desktop', '前端文件');
  }

  /** 连接（或复用）模拟器 */
  private async ensureConnection() {
    if (this.mp) return this.mp;
    if (this.connecting) return this.connecting;

    this.connecting = (async () => {
      const automator = require('miniprogram-automator');
      // 优先 connect（开发者工具已开着项目时更快），失败则 launch
      try {
        this.mp = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' });
        this.logger.log('automator connect 成功');
      } catch {
        this.mp = await automator.launch({
          cliPath: CLI_PATH,
          projectPath: this.projectPath,
        });
        this.logger.log('automator launch 成功');
      }
      return this.mp;
    })().finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  /** 等待模拟器编译完成并取到当前页（最长 waitMs） */
  private async waitForPage(mp: any, waitMs: number) {
    const start = Date.now();
    while (Date.now() - start < waitMs) {
      try {
        const page = await mp.currentPage();
        if (page && page.path) return page;
      } catch { /* 编译中 */ }
      await new Promise((r) => setTimeout(r, 5000));
    }
    return null;
  }

  getStatus() {
    return {
      success: true,
      data: {
        available: !!this.mp,
        lastShotAt: this.lastShotAt || null,
        lastError: this.lastError || null,
        imageUrl: this.lastShotAt ? `/uploads/real-preview.png?t=${this.lastShotAt}` : null,
      },
    };
  }

  /** 对真实小程序当前页面截图 */
  async refresh() {
    if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    const out = path.join(UPLOAD_DIR, 'real-preview.png');
    try {
      const mp = await this.ensureConnection();
      const page = await this.waitForPage(mp, 150000);
      if (!page) {
        this.lastError = '模拟器编译超时（开发者工具未就绪，请重启开发者工具或 Mac 后重试）';
        return { success: false, message: this.lastError };
      }
      await this.shot(mp, out);
      this.lastShotAt = Date.now();
      this.lastError = '';
      return {
        success: true,
        data: { imageUrl: `/uploads/real-preview.png?t=${this.lastShotAt}`, pagePath: page.path, shotAt: this.lastShotAt },
      };
    } catch (e: any) {
      this.lastError = `真机预览失败：${String(e?.message || e).split('\n')[0]}`;
      // 连接断开时重置，下次重连
      this.mp = null;
      return { success: false, message: this.lastError };
    }
  }

  /**
   * 截图：优先 page.screenshot（部分 DevTools 版本 mp.screenshot 会永久挂起），
   * 带超时兜底，失败快速重试而不是卡死帧循环。
   */
  private async shot(mp: any, out: string, timeoutMs = 20000) {
    let target: any = mp;
    try {
      const page = await mp.currentPage();
      if (page && typeof page.screenshot === 'function') target = page;
    } catch { /* 退回 mp.screenshot */ }
    await Promise.race([
      target.screenshot({ path: out }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('截图超时（开发者工具未响应）')), timeoutMs)),
    ]);
  }

  /** 让真实小程序跳转指定页面路径（用于预览指定装修页） */
  async navigateTo(pagePath: string) {
    try {
      const mp = await this.ensureConnection();
      await mp.reLaunch(`/${String(pagePath).replace(/^\/+/, '')}`);
      return { success: true };
    } catch (e: any) {
      this.mp = null;
      return { success: false, message: String(e?.message || e).split('\n')[0] };
    }
  }

  // ==================== 实时真机画布（画面轮询 + 输入回传） ====================

  private frameTimer: NodeJS.Timeout | null = null;
  private frameFile = '';
  private frameAt = 0;
  private lastWatch = 0;
  private interacting = false;

  /** 有人看就每 2 秒截一帧；30 秒没人看自动停 */
  private async ensureFrameLoop() {
    this.lastWatch = Date.now();
    if (this.frameTimer) return;
    if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    this.frameFile = path.join(UPLOAD_DIR, 'live-frame.png');
    this.frameTimer = setInterval(async () => {
      if (Date.now() - this.lastWatch > 30000) {
        clearInterval(this.frameTimer!);
        this.frameTimer = null;
        return;
      }
      if (this.interacting) return; // 输入回传期间不抢帧
      try {
        const mp = await this.ensureConnection();
        await this.shot(mp, this.frameFile, 15000);
        this.frameAt = Date.now();
      } catch (e: any) {
        this.lastError = String(e?.message || e).split('\n')[0];
        this.mp = null;
      }
    }, 2000);
  }

  /** 获取最新一帧（同时保活轮询） */
  async getFrame() {
    await this.ensureFrameLoop();
    return {
      success: true,
      data: {
        frameUrl: this.frameAt ? `/uploads/live-frame.png?t=${this.frameAt}` : '',
        frameAt: this.frameAt || null,
        lastError: this.lastError || null,
      },
    };
  }

  /** 归一化坐标 → 页面像素坐标 */
  private async toPageCoords(mp: any, nx: number, ny: number) {
    const size = await mp.currentPage().then((p: any) => p.size()).catch(() => null);
    const w = size?.width || 375;
    const h = size?.height || 812;
    return { x: Math.round(nx * w), y: Math.round(ny * h) };
  }

  /** 命中测试：在渲染树（含组件 shadow DOM）里找包含坐标的最小候选元素 */
  private async hitTest(mp: any, x: number, y: number) {
    const page = await mp.currentPage();
    const sels = ['.tabbar-item', 'button', 'image', '.tab-item', '.campus-menu-item', '.gg-box', 'input', '.search-btn'];
    const candidates: Array<{ el: any; sel: string; idx: number; left: number; top: number; width: number; height: number }> = [];
    for (const sel of sels) {
      const els = await page.$$(sel).catch(() => []);
      if (!els || !els.length) continue;
      const rects = await Promise.all(
        els.map(async (el: any, idx: number) => {
          try {
            const off = await el.offset();
            const size = await el.size().catch(() => ({ width: 0, height: 0 }));
            return { el, sel, idx, left: off.left || 0, top: off.top || 0, width: Number(size?.width) || 0, height: Number(size?.height) || 0 };
          } catch {
            return null;
          }
        }),
      );
      for (const r of rects) if (r) candidates.push(r);
    }
    let best: any = null;
    for (const c of candidates) {
      if (x >= c.left && x <= c.left + c.width && y >= c.top && y <= c.top + c.height) {
        const area = c.width * c.height;
        if (!best || area < best.area) best = { ...c, area };
      }
    }
    return best;
  }

  /** 坐标点按（模拟真实手指点击） */
  async tap(nx: number, ny: number) {
    try {
      this.interacting = true;
      const mp = await this.ensureConnection();
      const { x, y } = await this.toPageCoords(mp, nx, ny);
      const hit = await this.hitTest(mp, x, y);
      if (hit) {
        await hit.el.tap();
      }
      // 点击后立刻补一帧，让画布尽快反映结果
      await new Promise((r) => setTimeout(r, 500));
      await mp.screenshot({ path: this.frameFile }).catch(() => {});
      this.frameAt = Date.now();
      return { success: true, data: { hit: hit ? `${hit.sel}[${hit.idx}]` : null, frameUrl: `/uploads/live-frame.png?t=${this.frameAt}` } };
    } catch (e: any) {
      this.mp = null;
      return { success: false, message: String(e?.message || e).split('\n')[0] };
    } finally {
      this.interacting = false;
    }
  }

  /** 坐标滑动（模拟真实手指滑动） */
  async swipe(x1: number, y1: number, x2: number, y2: number) {
    try {
      this.interacting = true;
      const mp = await this.ensureConnection();
      const p1 = await this.toPageCoords(mp, x1, y1);
      const p2 = await this.toPageCoords(mp, x2, y2);
      const page = await mp.currentPage();
      // 在起点做命中测试，滑动事件发给命中的元素（退化为页面根）
      const hit = await this.hitTest(mp, p1.x, p1.y);
      let target: any = null;
      if (hit) {
        const els = await page.$$(hit.sel);
        target = els && els[hit.idx];
      }
      if (!target) target = await page.$('scroll-view') || await page.$('page');
      await target.touchstart({ touches: [{ pageX: p1.x, pageY: p1.y }] });
      const steps = 6;
      for (let i = 1; i <= steps; i++) {
        const x = Math.round(p1.x + ((p2.x - p1.x) * i) / steps);
        const y = Math.round(p1.y + ((p2.y - p1.y) * i) / steps);
        await target.touchmove({ touches: [{ pageX: x, pageY: y }] });
        await new Promise((r) => setTimeout(r, 30));
      }
      await target.touchend({ touches: [{ pageX: p2.x, pageY: p2.y }] });
      await new Promise((r) => setTimeout(r, 500));
      await mp.screenshot({ path: this.frameFile }).catch(() => {});
      this.frameAt = Date.now();
      return { success: true, data: { frameUrl: `/uploads/live-frame.png?t=${this.frameAt}` } };
    } catch (e: any) {
      this.mp = null;
      return { success: false, message: String(e?.message || e).split('\n')[0] };
    } finally {
      this.interacting = false;
    }
  }
}
