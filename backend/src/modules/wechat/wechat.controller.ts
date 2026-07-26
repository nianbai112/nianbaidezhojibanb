import {
  Controller, Get, Post, Body, Query, Req, Res, UseGuards, Headers,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { JwtGuard } from '../../guards/jwt.guard';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { WechatOfficialService } from './wechat-official.service';

@ApiTags('微信')
@Controller('wechat')
export class WechatController {
  constructor(private readonly officialService: WechatOfficialService) {}

  @Get('binding/status')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取公众号绑定状态' })
  getBindingStatus(@CurrentUser('sub') userId: string) {
    return this.officialService.getBindingStatus(userId);
  }

  @Get('official/bind-url')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取公众号绑定二维码' })
  getBindUrl(@CurrentUser('sub') userId: string) {
    return this.officialService.generateBindQrcode(userId);
  }

  @Get('official/callback')
  @ApiOperation({ summary: '公众号回调验证（GET）' })
  async callbackVerify(
    @Query() query: Record<string, string>,
    @Res() res: Response,
  ) {
    const result = await this.officialService.handleCallback('', query);
    // 纯文本返回（echostr 原样回显），避免被浏览器按 HTML 解析造成反射型 XSS
    res.type('text/plain').send(String(result ?? ''));
  }

  @Post('official/callback')
  @ApiOperation({ summary: '公众号事件回调（POST）' })
  async callbackEvent(
    @Body() body: any,
    @Query() query: Record<string, string>,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    // 获取原始 XML body
    const rawBody = (req as any).rawBody || body;
    const result = await this.officialService.handleCallback(
      typeof rawBody === 'string' ? rawBody : '',
      query,
    );
    res.type('text/plain').send(String(result ?? ''));
  }
}
