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
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../../decorators/current-user.decorator";
import { JwtGuard } from "../../guards/jwt.guard";
import {
  CreateOrderAppealDto,
  MerchantReplyOrderAppealDto,
  SupplementOrderAppealDto,
} from "./dto/order-appeal.dto";
import { OrderAppealService } from "./order-appeal.service";

@ApiTags("订单申诉")
@Controller("order-appeals")
@UseGuards(JwtGuard)
@ApiBearerAuth()
export class OrderAppealController {
  constructor(private readonly service: OrderAppealService) {}

  @Get("eligible-orders")
  @ApiOperation({ summary: "当前用户可申诉订单" })
  listEligible(@CurrentUser("sub") userId: string, @Query() query: any) {
    return this.service.listEligibleOrders(userId, query);
  }

  @Post()
  @ApiOperation({ summary: "提交订单申诉" })
  create(
    @CurrentUser("sub") userId: string,
    @Body() dto: CreateOrderAppealDto,
  ) {
    return this.service.createAppeal(userId, dto);
  }

  @Patch(":id/supplement")
  @ApiOperation({ summary: "补充订单申诉材料" })
  supplement(
    @CurrentUser("sub") userId: string,
    @Param("id") id: string,
    @Body() dto: SupplementOrderAppealDto,
  ) {
    return this.service.supplementAppeal(userId, id, dto);
  }

  @Get("merchant/:id")
  @ApiOperation({ summary: "商家查看关联订单申诉" })
  getMerchantAppeal(
    @CurrentUser("sub") userId: string,
    @Param("id") id: string,
  ) {
    return this.service.getMerchantAppeal(userId, id);
  }

  @Post(":id/merchant-reply")
  @ApiOperation({ summary: "商家补充订单申诉说明" })
  replyAsMerchant(
    @CurrentUser("sub") userId: string,
    @Param("id") id: string,
    @Body() dto: MerchantReplyOrderAppealDto,
  ) {
    return this.service.replyMerchantAppeal(userId, id, dto);
  }

  @Get("my")
  @ApiOperation({ summary: "我的订单申诉" })
  listMine(@CurrentUser("sub") userId: string) {
    return this.service.listMyAppeals(userId);
  }
}
