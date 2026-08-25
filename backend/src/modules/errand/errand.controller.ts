import { Controller, Get, Post, Put, Body, Param, Query, UseGuards, BadRequestException } from '@nestjs/common';
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

  @Get('errand/order/available-coupons')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getAvailableCoupons(@CurrentUser('sub') userId: string, @Query() query: any) {
    return this.errandService.getAvailableCoupons(userId, query);
  }

  @Post('errand/order/estimate')
  estimateOrderTiming(@Body() dto: any) {
    return this.errandService.estimateOrderTiming(dto);
  }

  @Post('errand/order/risk-preview')
  previewOrderRisk(@Body() dto: any) {
    return this.errandService.previewOrderRisk(dto);
  }

  @Post('errand/order/quote')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  quoteOrder(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.errandService.quoteOrder(userId, dto);
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

  @Post('errand/order/:orderId/confirm-receipt')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  confirmReceipt(@Param('orderId') orderId: string, @CurrentUser('sub') userId: string) {
    return this.errandService.confirmReceipt(orderId, userId);
  }

  @Post('errand/order/:orderId/confirm-receipt-by-code')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  confirmReceiptByCode(@Param('orderId') orderId: string, @CurrentUser('sub') userId: string, @Body() dto: any) {
    const code = String(dto?.code || dto?.receiptCode || dto?.receipt_code || '').trim();
    if (!code) throw new BadRequestException('缺少收货码');
    return this.errandService.confirmReceiptByCode(orderId, userId, code);
  }

  @Post('errand/order/:orderId/review')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  createReview(@Param('orderId') orderId: string, @CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.errandService.createReview(userId, orderId, dto);
  }

  @Get('errand/order/:orderId/review')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getReview(@Param('orderId') orderId: string, @CurrentUser('sub') userId: string) {
    return this.errandService.getReview(userId, orderId);
  }

  @Post('errand/order/refund/:orderId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  refundOrder(@Param('orderId') orderId: string, @CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.errandService.refundOrder(orderId, userId, dto);
  }

  @Post('errand/order/cancel/:orderId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  cancelOrder(@Param('orderId') orderId: string, @CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.errandService.cancelOrder(orderId, userId, dto);
  }

  @Get(['errand/order/detail/:orderId', 'api/delivery-orders/:orderId', 'delivery-orders/:orderId'])
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getOrderDetail(@Param('orderId') orderId: string, @CurrentUser('sub') userId: string) {
    return this.errandService.getOrderDetail(orderId, userId);
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

  @Post(['api/delivery-orders', 'delivery-orders'])
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  receiveOrder(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.errandService.receiveOrder(userId, dto);
  }

  @Get(['api/delivery-orders/distribution/list', 'delivery-orders/distribution/list'])
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getDeliveryOrdersList(@CurrentUser('sub') userId: string, @Query() query: any) {
    return this.errandService.getDeliveryOrdersList(userId, query);
  }

  @Put(['api/delivery-orders/:orderId', 'delivery-orders/:orderId'])
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  updateDeliveryOrder(@Param('orderId') orderId: string, @CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.errandService.updateDeliveryOrder(orderId, userId, dto);
  }

  @Post(['api/return-to-pool/:orderId', 'return-to-pool/:orderId'])
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  returnToPool(@Param('orderId') orderId: string, @CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.errandService.returnToPool(orderId, userId, dto);
  }

  @Get(['api/current/rider', 'current/rider'])
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getRiderInfo(@CurrentUser('sub') userId: string) {
    return this.errandService.getRiderInfo(userId);
  }

  @Put(['api/riders/current', 'riders/current'])
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  updateRiderInfo(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.errandService.updateRiderInfo(userId, dto);
  }

  @Get(['api/current/rider/orders/stats', 'current/rider/orders/stats'])
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getOrderStats(@CurrentUser('sub') userId: string) {
    return this.errandService.getOrderStats(userId);
  }

  @Post(['api/rider/apply', 'rider/apply'])
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  applyRider(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.errandService.applyRider(userId, dto);
  }

  @Post(['api/location', 'location'])
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  updateLocation(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.errandService.updateLocation(userId, dto);
  }

  @Get(['api/location/:riderId', 'location/:riderId'])
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getRiderLocation(
    @CurrentUser('sub') userId: string,
    @Param('riderId') riderId: string,
    @Query('order_id') orderId?: string,
  ) {
    return this.errandService.getRiderLocation(userId, riderId, orderId);
  }

  @Post(['api/transfer/request/:orderId', 'transfer/request/:orderId'])
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  requestTransfer(@Param('orderId') orderId: string, @CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.errandService.requestTransfer(orderId, userId, dto);
  }

  @Get(['api/transfer/requests', 'transfer/requests'])
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getTransferRequests(@CurrentUser('sub') userId: string) {
    return this.errandService.getTransferRequests(userId);
  }

  @Post(['api/transfer/respond/:transferId', 'transfer/respond/:transferId'])
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  respondToTransfer(@Param('transferId') transferId: string, @CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.errandService.respondToTransfer(transferId, userId, dto);
  }

  @Get(['api/region-riders', 'region-riders'])
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getRegionRiders(@CurrentUser('sub') userId: string) {
    return this.errandService.getRegionRiders(userId);
  }

  @Get('api/region/incentives/my-records')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getMyIncentiveRecords(@CurrentUser('sub') userId: string, @Query() query: any) {
    return this.errandService.getMyIncentiveRecords(userId, query);
  }
}
