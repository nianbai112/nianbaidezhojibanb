import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtGuard } from '../../guards/jwt.guard';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { RiderAppService } from './rider-app.service';

@ApiTags('官方骑手App')
@Controller()
export class RiderAppController {
  constructor(private readonly riderAppService: RiderAppService) {}

  @Post('rider-app/login/wechat')
  @ApiOperation({ summary: '骑手App微信登录' })
  loginWechat(@Body() dto: { code: string }) {
    return this.riderAppService.loginWechat(dto);
  }

  @Post('rider-app/login/phone')
  @ApiOperation({ summary: '骑手App手机号登录（暂未开通）' })
  loginPhone(@Body() dto: { phone?: string; code?: string }) {
    return this.riderAppService.loginPhone(dto);
  }

  @Get('rider-app/session')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '骑手App会话与资质校验' })
  getSession(@CurrentUser('sub') userId: string) {
    return this.riderAppService.getSession(userId);
  }
}
