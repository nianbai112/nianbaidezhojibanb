import { Controller, Get, Post, Put, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ErrandService } from './errand.service';
import { JwtGuard } from '../../guards/jwt.guard';
import { CurrentUser } from '../../decorators/current-user.decorator';

@ApiTags('跑腿')
@Controller()
export class ErrandController {
  constructor(private readonly errandService: ErrandService) {}

  @Get('errand/config/get')
  getConfig(@Query('region_id') regionId: string) {
    return this.errandService.getConfig(regionId);
  }

  @Get('errand/item-size/list')
  getItemSizes(@Query('region_id') regionId: string, @Query('apply_to') applyTo: string) {
    return this.errandService.getItemSizes(regionId, applyTo);
  }

  @Get('errand/pickup-point/list')
  getPickupPoints(@Query('region_id') regionId: string, @Query('type') type: string) {
    return this.errandService.getPickupPoints(regionId, type);
  }

  @Post('errand/order/create')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  createOrder(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.errandService.createOrder(userId, dto);
  }

  @Post('errand/order/pay')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  payOrder(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.errandService.payOrder(userId, dto);
  }

  @Put('errand/order/accept/:orderId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  acceptOrder(@Param('orderId') orderId: string, @CurrentUser('sub') userId: string) {
    return this.errandService.acceptOrder(orderId, userId);
  }

  @Put('errand/order/rider-status/:orderId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  updateRiderStatus(@Param('orderId') orderId: string, @CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.errandService.updateRiderStatus(orderId, userId, dto);
  }

  @Post('errand/order/refund/:orderId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  refundOrder(@Param('orderId') orderId: string, @CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.errandService.refundOrder(orderId, userId, dto);
  }

  @Get('errand/order/user-orders')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getUserOrders(@CurrentUser('sub') userId: string, @Query() query: any) {
    return this.errandService.getUserOrders(userId, query);
  }

  @Get('errand/order/region-completed-orders')
  getRegionCompletedOrders(@Query() query: any) {
    return this.errandService.getRegionCompletedOrders(query);
  }

  @Get('errand/page-config/user/region')
  getPageConfig(@Query('region_id') regionId: string) {
    return this.errandService.getPageConfig(regionId);
  }

  @Post('api/delivery-orders')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  receiveOrder(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.errandService.receiveOrder(userId, dto);
  }

  @Get('api/delivery-orders/distribution/list')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getDeliveryOrdersList(@CurrentUser('sub') userId: string, @Query() query: any) {
    return this.errandService.getDeliveryOrdersList(userId, query);
  }

  @Put('api/delivery-orders/:orderId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  updateDeliveryOrder(@Param('orderId') orderId: string, @CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.errandService.updateDeliveryOrder(orderId, userId, dto);
  }

  @Post('api/return-to-pool/:orderId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  returnToPool(@Param('orderId') orderId: string, @CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.errandService.returnToPool(orderId, userId, dto);
  }

  @Get('api/current/rider')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getRiderInfo(@CurrentUser('sub') userId: string) {
    return this.errandService.getRiderInfo(userId);
  }

  @Put('api/riders/current')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  updateRiderInfo(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.errandService.updateRiderInfo(userId, dto);
  }

  @Get('api/current/rider/orders/stats')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getOrderStats(@CurrentUser('sub') userId: string) {
    return this.errandService.getOrderStats(userId);
  }

  @Post('api/rider/apply')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  applyRider(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.errandService.applyRider(userId, dto);
  }

  @Post('api/location')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  updateLocation(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.errandService.updateLocation(userId, dto);
  }

  @Get('api/location/:riderId')
  getRiderLocation(@Param('riderId') riderId: string) {
    return this.errandService.getRiderLocation(riderId);
  }

  @Post('api/transfer/request/:orderId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  requestTransfer(@Param('orderId') orderId: string, @CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.errandService.requestTransfer(orderId, userId, dto);
  }

  @Get('api/transfer/requests')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getTransferRequests(@CurrentUser('sub') userId: string) {
    return this.errandService.getTransferRequests(userId);
  }

  @Post('api/transfer/respond/:transferId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  respondToTransfer(@Param('transferId') transferId: string, @CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.errandService.respondToTransfer(transferId, userId, dto);
  }

  @Get('api/region-riders')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getRegionRiders() {
    return this.errandService.getRegionRiders();
  }

  @Get('api/region/incentives/my-records')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getMyIncentiveRecords(@CurrentUser('sub') userId: string, @Query() query: any) {
    return this.errandService.getMyIncentiveRecords(userId, query);
  }
}
