import { Controller, Get, Param, Res, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * 小程序 static 素材公开访问（供后台编辑器画布展示真实图标）。
 * 严格沙盒在 小程序源码/static 目录内，防路径穿越。
 */
@ApiTags('小程序素材(公开)')
@Controller('miniapp-static')
export class MiniappStaticController {
  private get staticDir(): string {
    const source = process.env.MINIAPP_SOURCE_DIR || path.join(os.homedir(), 'Desktop', '前端文件');
    return path.join(source, 'static');
  }

  @Get('{*path}')
  @ApiOperation({ summary: '读取小程序 static 素材' })
  getAsset(@Param('path') wildcard: string | string[], @Res() res: Response) {
    const rel = Array.isArray(wildcard) ? wildcard.join('/') : String(wildcard || '');
    const safe = rel.replace(/^\/+/, '').replace(/\.\./g, '');
    const full = path.join(this.staticDir, safe);
    if (!full.startsWith(this.staticDir) || !fs.existsSync(full) || !fs.statSync(full).isFile()) {
      throw new NotFoundException('素材不存在');
    }
    return res.sendFile(full);
  }
}
