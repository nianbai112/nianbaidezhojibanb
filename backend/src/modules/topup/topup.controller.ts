import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { TopupService } from './topup.service';
import { JwtGuard } from '../../guards/jwt.guard';
import { CurrentUser } from '../../decorators/current-user.decorator';

@ApiTags('充值/余额')
@Controller()
export class TopupController {
  constructor(private readonly topupService: TopupService) {}

  @Get('topnotes/packages/region/:regionId')
  getPackages(@Param('regionId') regionId: string) {
    return this.topupService.getPackages(regionId);
  }

  @Post('topnotes/topup-orders')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  createTopupOrder(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.topupService.createTopupOrder(userId, dto);
  }

  @Post('topnotes/get-payment-info')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getPaymentInfo(@Body() dto: any) {
    return this.topupService.getPaymentInfo(dto.order_id);
  }

  @Get('topnotes/user-orders/:userId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getUserOrders(@Param('userId') userId: string) {
    return this.topupService.getUserOrders(userId);
  }

  @Post('topnotes/cancel-order/:orderId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  cancelOrder(@Param('orderId') orderId: string, @CurrentUser('sub') userId: string) {
    return this.topupService.cancelOrder(orderId, userId);
  }

  @Get('api/balance-recharge/history')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getRechargeHistory(@CurrentUser('sub') userId: string, @Query() query: any) {
    return this.topupService.getRechargeHistory(userId, query);
  }

  @Post('api/balance-recharge/create')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  createRechargeOrder(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.topupService.createRechargeOrder(userId, dto);
  }

  @Get('api/balance-recharge/check-wechat-binding')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  checkWechatBinding(@CurrentUser('sub') userId: string) {
    return this.topupService.checkWechatBinding(userId);
  }
}
