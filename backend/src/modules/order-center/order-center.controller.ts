import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { OrderCenterService } from "./order-center.service";
import { JwtGuard } from "../../guards/jwt.guard";
import { AdminGuard, AdminPermissionGuard } from "../../guards/admin.guard";
import { RequirePermission } from "../../decorators/require-permission.decorator";
import { CurrentUser } from "../../decorators/current-user.decorator";

@ApiTags("统一订单中心")
@Controller("admin/order-center")
@UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
@ApiBearerAuth()
export class OrderCenterController {
  constructor(private readonly orderCenterService: OrderCenterService) {}

  @Get("orders")
  @RequirePermission("order:view")
  @ApiOperation({ summary: "统一订单列表" })
  getOrders(@Query() query: any, @CurrentUser('sub') operatorId: string) {
    return this.orderCenterService.getOrders(query, operatorId);
  }

  @Get("dorm-shop/merchants")
  @RequirePermission("merchant:view")
  @ApiOperation({ summary: "宿舍小店配送运营概览" })
  getDormShopDeliveryMerchants(
    @Query() query: any,
    @CurrentUser("sub") operatorId: string,
  ) {
    return this.orderCenterService.getDormShopDeliveryMerchants(
      query,
      operatorId,
    );
  }

  @Get("dorm-shop/staff")
  @RequirePermission("merchant:view")
  @ApiOperation({ summary: "宿舍小店配送店员列表" })
  getDormShopDeliveryStaff(
    @Query() query: any,
    @CurrentUser("sub") operatorId: string,
  ) {
    return this.orderCenterService.getDormShopDeliveryStaff(query, operatorId);
  }

  @Patch("dorm-shop/staff/:staffId/status")
  @RequirePermission("merchant:audit")
  @ApiOperation({ summary: "后台暂停、恢复或移除宿舍小店配送店员" })
  updateDormShopDeliveryStaffStatus(
    @Param("staffId") staffId: string,
    @Body() dto: { status?: string; reason?: string },
    @CurrentUser("sub") operatorId: string,
  ) {
    return this.orderCenterService.updateDormShopDeliveryStaffStatus(
      staffId,
      dto,
      operatorId,
    );
  }

  @Get("export")
  @RequirePermission("order:view")
  @ApiOperation({ summary: "导出统一订单 CSV" })
  exportOrders(@Query() query: any, @CurrentUser('sub') operatorId: string) {
    return this.orderCenterService.exportOrders(query, operatorId);
  }

  @Get("orders/:id")
  @RequirePermission("order:view")
  @ApiOperation({ summary: "订单详情" })
  getOrderDetail(@Param("id") id: string, @Query("type") type?: string, @CurrentUser('sub') operatorId?: string) {
    return this.orderCenterService.getOrderDetail(id, type, operatorId);
  }

  @Get("user/:userId")
  @RequirePermission("order:view")
  @ApiOperation({ summary: "用户订单汇总" })
  getUserOrders(
    @Param("userId") userId: string,
    @Query() query: any,
    @CurrentUser('sub') operatorId: string,
  ) {
    return this.orderCenterService.getUserOrders(userId, query, operatorId);
  }

  @Get("payment/:paymentNo")
  @RequirePermission("order:view")
  @ApiOperation({ summary: "支付单查询" })
  getPaymentByNo(@Param("paymentNo") paymentNo: string, @CurrentUser('sub') operatorId: string) {
    return this.orderCenterService.getPaymentByNo(paymentNo, operatorId);
  }

  @Get("refunds")
  @RequirePermission("order:view")
  @ApiOperation({ summary: "统一退款列表" })
  getRefunds(@Query() query: any, @CurrentUser('sub') operatorId: string) {
    return this.orderCenterService.getRefunds(query, operatorId);
  }

  @Get("timeline/:orderId")
  @RequirePermission("order:view")
  @ApiOperation({ summary: "订单时间线" })
  getOrderTimeline(
    @Param("orderId") orderId: string,
    @Query("type") type?: string,
    @CurrentUser('sub') operatorId?: string,
  ) {
    return this.orderCenterService.getOrderTimeline(orderId, type, operatorId);
  }

  @Post('orders/:id/release-rider')
  @RequirePermission('order:refund')
  @ApiOperation({ summary: '将超时未取餐的外卖订单退回骑手池' })
  releaseRider(@Param('id') id: string, @CurrentUser('sub') operatorId: string) {
    return this.orderCenterService.releaseUnpickedRiderOrder(id, operatorId);
  }
}
