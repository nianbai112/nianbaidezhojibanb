import {
  Controller, Get, Post, Body, Query, Req, Res, UseGuards, Headers,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { JwtGuard } from '../../guards/jwt.guard';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { WechatOfficialService } from './wechat-official.service';
import { WechatSubscribeService } from './wechat-subscribe.service';

@ApiTags('微信')
@Controller('wechat')
export class WechatController {
  constructor(
    private readonly officialService: WechatOfficialService,
    private readonly subscribeService: WechatSubscribeService,
  ) {}

  @Get('subscribe-templates')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取当前页面可申请的订阅消息模板' })
  async getSubscribeTemplates(@Query('types') rawTypes?: string) {
    const types = String(rawTypes || '').split(',').map((value) => value.trim()).filter((value) => /^takeaway_(order_status|merchant_order|rider_order)$/.test(value));
    return { list: await this.subscribeService.listEnabledTemplates(types) };
  }

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
    res.send(result);
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
    const xmlBody = Buffer.isBuffer(rawBody)
      ? rawBody.toString('utf8')
      : typeof rawBody === 'string'
        ? rawBody
        : '';
    const result = await this.officialService.handleCallback(
      xmlBody,
      query,
    );
    res.send(result);
  }
}
