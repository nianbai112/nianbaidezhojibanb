import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { JwtGuard } from '../../guards/jwt.guard';
import { MembershipService } from './membership.service';

@ApiTags('会员中心')
@Controller('membership')
export class MembershipController {
  constructor(private readonly service: MembershipService) {}

  @Get('center')
  @UseGuards(JwtGuard)
  getCenter(@CurrentUser('sub') userId: string) {
    return this.service.getCenter(userId);
  }

  @Post('orders')
  @UseGuards(JwtGuard)
  createOrder(@Body() dto: any, @CurrentUser('sub') userId: string) {
    return this.service.createOrder(userId, dto);
  }

  @Get('benefits')
  @UseGuards(JwtGuard)
  benefits(@CurrentUser('sub') userId: string) {
    return this.service.getUserBenefits(userId);
  }

  // AUD-P1-054：已移除用户端 `POST membership/benefits/use` 直扣路由。
  // 付费会员权益（免费置顶/二手刷新/活动券等）禁止由用户端绕过业务流程直接消耗，
  // 仅允许商城/跑腿/活动/二手/帖子置顶等后端业务服务内部调用
  // MembershipService.consumeBenefit / consumeBenefitWithDb 完成真实履约后的扣减。
}
