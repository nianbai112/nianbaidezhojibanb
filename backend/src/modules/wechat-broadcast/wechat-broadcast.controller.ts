import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../decorators/require-permission.decorator";
import { AdminGuard, AdminPermissionGuard } from "../../guards/admin.guard";
import { JwtGuard } from "../../guards/jwt.guard";
import { WechatBroadcastService } from "./wechat-broadcast.service";

@ApiTags("订单群播报")
@ApiBearerAuth()
@Controller("admin/wechat-broadcast")
@UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
export class WechatBroadcastController {
  constructor(private readonly service: WechatBroadcastService) {}

  @Get("status")
  @RequirePermission("wechat:broadcast:view")
  status() {
    return this.service.status();
  }

  @Put("settings")
  @RequirePermission("wechat:broadcast:edit")
  settings(@Body() input: any) {
    return this.service.saveSettings(input);
  }

  @Put("groups/:regionId")
  @RequirePermission("wechat:broadcast:edit")
  saveGroup(@Param("regionId") regionId: string, @Body() input: any) {
    return this.service.saveGroup(regionId, input);
  }

  @Delete("groups/:regionId")
  @RequirePermission("wechat:broadcast:edit")
  removeGroup(@Param("regionId") regionId: string) {
    return this.service.removeGroup(regionId);
  }

  @Post("groups/:regionId/test")
  @RequirePermission("wechat:broadcast:edit")
  testSend(@Param("regionId") regionId: string) {
    return this.service.testSend(regionId);
  }

  @Get("records")
  @RequirePermission("wechat:broadcast:view")
  records(@Query() query: any) {
    return this.service.records(query);
  }

  @Post("records/:id/resolve")
  @RequirePermission("wechat:broadcast:edit")
  resolve(@Param("id") id: string, @Body() input: any) {
    return this.service.resolveUnknown(id, input);
  }

  @Post("preview")
  @RequirePermission("wechat:broadcast:view")
  preview(@Body() input: any) {
    return this.service.preview(input);
  }
}
