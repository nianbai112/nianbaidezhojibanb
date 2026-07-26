import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { OrderCenterService } from "./order-center.service";
import { JwtGuard } from "../../guards/jwt.guard";
import { AdminGuard, AdminPermissionGuard } from "../../guards/admin.guard";
import { RequirePermission } from "../../decorators/require-permission.decorator";

@ApiTags("统一订单中心")
@Controller("admin/order-center")
@UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
@ApiBearerAuth()
export class OrderCenterController {
  constructor(private readonly orderCenterService: OrderCenterService) {}

  @Get("orders")
  @RequirePermission("order:view")
  @ApiOperation({ summary: "统一订单列表" })
  getOrders(@Query() query: any) {
    return this.orderCenterService.getOrders(query);
  }

  @Get("export")
  @RequirePermission("order:view")
  @ApiOperation({ summary: "导出统一订单 CSV" })
  exportOrders(@Query() query: any) {
    return this.orderCenterService.exportOrders(query);
  }

  @Get("orders/:id")
  @RequirePermission("order:view")
  @ApiOperation({ summary: "订单详情" })
  getOrderDetail(@Param("id") id: string, @Query("type") type?: string) {
    return this.orderCenterService.getOrderDetail(id, type);
  }

  @Get("user/:userId")
  @RequirePermission("order:view")
  @ApiOperation({ summary: "用户订单汇总" })
  getUserOrders(
    @Param("userId") userId: string,
    @Query() query: any,
  ) {
    return this.orderCenterService.getUserOrders(userId, query);
  }

  @Get("payment/:paymentNo")
  @RequirePermission("order:view")
  @ApiOperation({ summary: "支付单查询" })
  getPaymentByNo(@Param("paymentNo") paymentNo: string) {
    return this.orderCenterService.getPaymentByNo(paymentNo);
  }

  @Get("refunds")
  @RequirePermission("order:view")
  @ApiOperation({ summary: "统一退款列表" })
  getRefunds(@Query() query: any) {
    return this.orderCenterService.getRefunds(query);
  }

  @Get("timeline/:orderId")
  @RequirePermission("order:view")
  @ApiOperation({ summary: "订单时间线" })
  getOrderTimeline(
    @Param("orderId") orderId: string,
    @Query("type") type?: string,
  ) {
    return this.orderCenterService.getOrderTimeline(orderId, type);
  }
}
