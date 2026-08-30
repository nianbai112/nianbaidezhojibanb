import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
// @types/archiver 新版类型不含工厂函数签名，运行时实为可调用工厂，这里显式声明
// eslint-disable-next-line @typescript-eslint/no-var-requires
const archiver = require('archiver') as (format: string, options?: any) => import('archiver').Archiver;

/** 打包时排除的目录/文件 */
const EXPORT_EXCLUDES = new Set(['node_modules', '.git', 'minitest', 'output', '.DS_Store']);

/** app.json 允许通过后台修改的顶层字段（防止误改 pages/分包等结构） */
const APP_JSON_EDITABLE_KEYS = ['window', 'tabBar', 'permission', 'requiredBackgroundModes'];

@Injectable()
export class MiniappCodeService {
  /** 小程序源码目录：可用环境变量 MINIAPP_SOURCE_DIR 覆盖 */
  private get sourceDir(): string {
    return process.env.MINIAPP_SOURCE_DIR || path.join(os.homedir(), 'Desktop', '前端文件');
  }

  private assertSourceDir(): string {
    const dir = this.sourceDir;
    if (!fs.existsSync(dir) || !fs.existsSync(path.join(dir, 'app.json'))) {
      throw new NotFoundException(`小程序源码目录不存在或缺少 app.json：${dir}`);
    }
    return dir;
  }

  /** 写文件前备份（保留最近 5 份） */
  private backupFile(filePath: string) {
    const bak = `${filePath}.bak-${Date.now()}`;
    fs.copyFileSync(filePath, bak);
    const dir = path.dirname(filePath);
    const base = path.basename(filePath);
    const olds = fs
      .readdirSync(dir)
      .filter((f) => f.startsWith(`${base}.bak-`))
      .sort();
    while (olds.length > 5) {
      const victim = olds.shift();
      if (victim) fs.unlinkSync(path.join(dir, victim));
    }
  }

  // ==================== 代码包信息 ====================

  getCodeInfo() {
    const dir = this.assertSourceDir();
    const appJson = JSON.parse(fs.readFileSync(path.join(dir, 'app.json'), 'utf8'));
    let fileCount = 0;
    const walk = (d: string) => {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        if (EXPORT_EXCLUDES.has(entry.name)) continue;
        const full = path.join(d, entry.name);
        if (entry.isDirectory()) walk(full);
        else fileCount += 1;
      }
    };
    walk(dir);
    const stat = fs.statSync(path.join(dir, 'app.json'));
    return {
      success: true,
      data: {
        sourceDir: dir,
        fileCount,
        pageCount: (appJson.pages || []).length,
        subPackageCount: (appJson.subPackages || []).length,
        tabBarCount: appJson.tabBar?.list?.length || 0,
        lastModified: stat.mtime,
      },
    };
  }

  // ==================== 打包导出 ====================

  /** 将小程序源码目录流式打包到 HTTP 响应 */
  async exportZip(res: any) {
    const dir = this.assertSourceDir();
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="miniapp-${stamp}.zip"`);

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', (err: Error) => {
      throw err;
    });
    archive.pipe(res);
    archive.glob(
      '**/*',
      {
        cwd: dir,
        dot: false,
        ignore: [...EXPORT_EXCLUDES].map((name) => `${name}/**`).concat(['**/*.bak-*', '**/*.bak-decor']),
      },
      {},
    );
    await archive.finalize();
  }

  // ==================== 主题变量（app.wxss :root） ====================

  private readWxss(): string {
    const dir = this.assertSourceDir();
    return fs.readFileSync(path.join(dir, 'app.wxss'), 'utf8');
  }

  getTheme() {
    const content = this.readWxss();
    // uni-app 编译产物的设计变量定义在 page 选择器，源码通常在 :root。
    // 文件里可能有多个 page 块（uni 注入的运行时变量 + 设计变量），取变量最多的块。
    const blockRe = /(?:^|\s)(?::root|page)\s*\{([^}]*)\}/g;
    const varRe = /(--[\w-]+)\s*:\s*([^;]+);/g;
    let best: Array<{ name: string; value: string }> = [];
    let m: RegExpExecArray | null;
    while ((m = blockRe.exec(content)) !== null) {
      const vars: Array<{ name: string; value: string }> = [];
      let v: RegExpExecArray | null;
      varRe.lastIndex = 0;
      while ((v = varRe.exec(m[1])) !== null) {
        vars.push({ name: v[1], value: v[2].trim() });
      }
      if (vars.length > best.length) best = vars;
    }
    return { success: true, data: { vars: best } };
  }

  updateTheme(vars: Array<{ name: string; value: string }>) {
    if (!Array.isArray(vars) || !vars.length) {
      throw new BadRequestException('缺少要更新的变量');
    }
    // 只允许合法 CSS 变量名和安全的值（禁止注入选择器/注释）
    for (const v of vars) {
      if (!/^--[\w-]+$/.test(v.name) || /[{}<>]/.test(v.value) || v.value.length > 200) {
        throw new BadRequestException(`非法的主题变量：${v.name}`);
      }
    }
    const dir = this.assertSourceDir();
    const file = path.join(dir, 'app.wxss');
    let content = fs.readFileSync(file, 'utf8');

    let changed = 0;
    for (const v of vars) {
      const re = new RegExp(`(${v.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:\\s*)([^;]+)(;)`);
      if (re.test(content)) {
        content = content.replace(re, `$1${v.value}$3`);
        changed += 1;
      }
    }
    if (!changed) {
      throw new BadRequestException('没有匹配到任何已有变量，未做修改');
    }
    this.backupFile(file);
    fs.writeFileSync(file, content, 'utf8');
    return { success: true, message: `已更新 ${changed} 个主题变量` };
  }

  // ==================== 源码文件只读访问 ====================

  /** 读取小程序源码文件（限 wxml/wxss/js/json/css，沙盒在源码目录内） */
  getSourceFile(relPath: string) {
    const dir = this.assertSourceDir();
    const rel = String(relPath || '').replace(/^\/+/, '').replace(/\.\./g, '');
    if (!/\.(wxml|wxss|js|json|css)$/.test(rel)) {
      throw new BadRequestException('仅支持 wxml/wxss/js/json/css 文件');
    }
    const full = path.join(dir, rel);
    if (!full.startsWith(dir) || !fs.existsSync(full) || !fs.statSync(full).isFile()) {
      throw new NotFoundException(`文件不存在：${rel}`);
    }
    if (fs.statSync(full).size > 2 * 1024 * 1024) {
      throw new BadRequestException('文件过大');
    }
    return { success: true, data: { path: rel, content: fs.readFileSync(full, 'utf8') } };
  }

  // ==================== app.json（受限字段） ====================

  getAppJson() {
    const dir = this.assertSourceDir();
    const raw = fs.readFileSync(path.join(dir, 'app.json'), 'utf8');
    const appJson = JSON.parse(raw);
    const data: Record<string, any> = {};
    for (const key of APP_JSON_EDITABLE_KEYS) {
      if (appJson[key] !== undefined) data[key] = appJson[key];
    }
    return { success: true, data };
  }

  updateAppJson(partial: Record<string, any>) {
    if (!partial || typeof partial !== 'object') {
      throw new BadRequestException('配置格式无效');
    }
    const keys = Object.keys(partial);
    const illegal = keys.filter((k) => !APP_JSON_EDITABLE_KEYS.includes(k));
    if (illegal.length) {
      throw new BadRequestException(`不允许修改的字段：${illegal.join(', ')}`);
    }
    const dir = this.assertSourceDir();
    const file = path.join(dir, 'app.json');
    const appJson = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const key of keys) {
      appJson[key] = partial[key];
    }
    this.backupFile(file);
    fs.writeFileSync(file, JSON.stringify(appJson, null, 2) + '\n', 'utf8');
    return { success: true, message: 'app.json 已更新' };
  }

  // ==================== 代码包素材库（static/editor） ====================

  private assetsDir(): string {
    const dir = this.assertSourceDir();
    const assets = path.join(dir, 'static', 'editor');
    fs.mkdirSync(assets, { recursive: true });
    return assets;
  }

  listAssets() {
    const dir = this.assetsDir();
    const list = fs
      .readdirSync(dir)
      .filter((f) => /\.(png|jpe?g|gif|webp|svg)$/i.test(f))
      .map((f) => {
        const stat = fs.statSync(path.join(dir, f));
        return {
          name: f,
          path: `/static/editor/${f}`,
          previewUrl: `/miniapp-static/editor/${f}`,
          size: stat.size,
          updatedAt: stat.mtime,
        };
      })
      .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
    return { success: true, data: { list, total: list.length } };
  }

  saveAsset(name: string, base64: string) {
    const rawName = String(name || '').replace(/[\\/]/g, '');
    const ext = (rawName.match(/\.(png|jpe?g|gif|webp|svg)$/i) || [])[0]?.toLowerCase();
    if (!ext) {
      throw new BadRequestException('仅支持 png/jpg/jpeg/gif/webp/svg 图片');
    }
    const m = /^data:image\/[\w+.-]+;base64,(.+)$/.exec(String(base64 || ''));
    if (!m) {
      throw new BadRequestException('图片数据格式无效（需要 base64 data URL）');
    }
    const buf = Buffer.from(m[1], 'base64');
    if (!buf.length || buf.length > 5 * 1024 * 1024) {
      throw new BadRequestException('图片大小需在 5MB 以内');
    }
    const base = rawName
      .replace(/\.[^.]+$/, '')
      .replace(/[^\w一-龥-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'img';
    const fileName = `${Date.now()}-${base}${ext}`;
    fs.writeFileSync(path.join(this.assetsDir(), fileName), buf);
    return {
      success: true,
      message: '素材已写入代码包',
      data: { name: fileName, path: `/static/editor/${fileName}`, previewUrl: `/miniapp-static/editor/${fileName}`, size: buf.length },
    };
  }

  deleteAsset(name: string) {
    const safe = String(name || '').replace(/[\\/]/g, '').replace(/\.\./g, '');
    const file = path.join(this.assetsDir(), safe);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      throw new NotFoundException('素材不存在');
    }
    fs.unlinkSync(file);
    return { success: true, message: '素材已删除' };
  }
}
