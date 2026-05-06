import { Controller, Get, Post, Put, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DeliveryService } from './delivery.service';
import { JwtGuard } from '../../guards/jwt.guard';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { CreateDeliveryOrderDto, UpdateLocationDto, DeliveryQueryDto } from './dto/delivery.dto';

@ApiTags('外卖/跑腿')
@Controller('delivery')
export class DeliveryController {
  constructor(private readonly deliveryService: DeliveryService) {}

  @Get('orders')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '我的跑腿订单' })
  myOrders(@CurrentUser('sub') userId: string, @Query() query: DeliveryQueryDto) {
    return this.deliveryService.myOrders(userId, query);
  }

  @Get('pool')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '订单池（骑手）' })
  orderPool(@Query() query: DeliveryQueryDto) {
    return this.deliveryService.orderPool(query);
  }

  @Post('orders')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建跑腿订单' })
  createOrder(@CurrentUser('sub') userId: string, @Body() dto: CreateDeliveryOrderDto) {
    return this.deliveryService.createOrder(userId, dto);
  }

  @Post('orders/:id/accept')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '骑手接单' })
  acceptOrder(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.deliveryService.acceptOrder(id, userId);
  }

  @Post('orders/:id/complete')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '完成订单' })
  completeOrder(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.deliveryService.completeOrder(id, userId);
  }

  @Post('rider/location')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新骑手位置' })
  updateLocation(@CurrentUser('sub') userId: string, @Body() dto: UpdateLocationDto) {
    return this.deliveryService.updateLocation(userId, dto);
  }
}
