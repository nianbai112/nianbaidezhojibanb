import { BadRequestException, Body, Controller, Get, Headers, Post, RawBodyRequest, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { JwtGuard } from '../../guards/jwt.guard';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { RiderAuthorizationService } from './rider-authorization.service';

@Controller()
export class RiderPayoutController {
  constructor(private readonly authorization: RiderAuthorizationService) {}

  @Get('finance/rider-wechat/status')
  @UseGuards(JwtGuard)
  status(@CurrentUser('sub') userId: string) { return this.authorization.status(userId); }

  @Post('finance/rider-wechat/authorize')
  @UseGuards(JwtGuard)
  authorize(@CurrentUser('sub') userId: string, @Body() body: any) {
    return this.authorization.start(userId, typeof body?.loginCode === 'string' ? body.loginCode.trim() : '');
  }

  @Post('finance/rider-wechat/refresh')
  @UseGuards(JwtGuard)
  refresh(@CurrentUser('sub') userId: string) { return this.authorization.refresh(userId); }

  @Post('finance/rider-wechat/close')
  @UseGuards(JwtGuard)
  close(@CurrentUser('sub') userId: string) { return this.authorization.close(userId); }

  @Post('wxpay/rider-authorization-notify')
  async notify(@Req() req: RawBodyRequest<Request>, @Headers() headers: any, @Res() res: Response) {
    if (!Buffer.isBuffer(req.rawBody)) throw new BadRequestException('缺少微信通知原始报文');
    await this.authorization.notification(req.rawBody, headers);
    res.status(204).send();
  }
}
