import { BadRequestException, Controller, Headers, HttpCode, Post, Req } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Request } from 'express';
import { WechatMomentsService, verifyWebhookSignature } from './wechat-moments.service';
import { parseJsonKeepingBigInts } from './wechatpad.client';
import { WechatChatService } from '../wechat-chat/wechat-chat.service';

/** One signed callback fans out to chat and Moments; the old URL remains compatible. */
@ApiExcludeController()
@Controller(['api/wechat-channel', 'api/wechat-moments'])
export class WechatMomentsWebhookController {
  constructor(private readonly service: WechatMomentsService, private readonly chat: WechatChatService) {}

  @Post('webhook')
  @HttpCode(200)
  async webhook(@Req() req: Request & { rawBody?: Buffer }, @Headers('x-signature') signature: string, @Headers('x-device-id') deviceHeader: string) {
    if (!Buffer.isBuffer(req.rawBody)) throw new BadRequestException('缺少原始回调体');
    const config = await this.service.getConfig();
    if (!config.webhookSecret || !verifyWebhookSignature(config.webhookSecret, req.rawBody, signature)) throw new BadRequestException('回调签名无效');
    let body: any;
    try { body = parseJsonKeepingBigInts(req.rawBody.toString('utf8')); } catch { throw new BadRequestException('回调 JSON 无效'); }
    if (!config.wechatpad.deviceId || body?.device_id !== config.wechatpad.deviceId || deviceHeader !== body.device_id) throw new BadRequestException('回调设备不匹配');
    if (body.message) return this.chat.receive(body);
    return this.service.handleWebhook(req.rawBody, signature, body);
  }
}
