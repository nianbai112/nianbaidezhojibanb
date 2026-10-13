import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { JwtGuard } from "../../guards/jwt.guard";
import { AdminGuard, AdminPermissionGuard } from "../../guards/admin.guard";
import { RequirePermission } from "../../decorators/require-permission.decorator";
import { WelfareCheckinService } from "./welfare-checkin.service";

@Controller("miniapp/welfare/checkins")
@UseGuards(JwtGuard)
export class WelfareCheckinController {
  constructor(private readonly service: WelfareCheckinService) {}
  @Get(":id/me") state(@Param("id") id: string, @Req() req: any) {
    return this.service.myState(id, req.user);
  }
  @Post(":id/personal-code") personal(
    @Param("id") id: string,
    @Req() req: any,
  ) {
    return this.service.personalCode(id, req.user);
  }
  @Post("preview") preview(@Body() body: any, @Req() req: any) {
    return this.service.preview(body?.token, req.user);
  }
  @Post("confirm") confirm(@Body() body: any, @Req() req: any) {
    return this.service.confirm(body?.token, req.user);
  }
}
@Controller("admin/welfare/checkins")
@UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
export class WelfareCheckinAdminController {
  constructor(private readonly service: WelfareCheckinService) {}
  @Get() @RequirePermission("activity:view") list(
    @Req() req: any,
    @Query() q: any,
  ) {
    return this.service.adminList(req.user.sub, q);
  }
  @Get(":id") @RequirePermission("activity:view") detail(
    @Param("id") id: string,
    @Req() req: any,
  ) {
    return this.service.adminDetail(id, req.user.sub);
  }
  @Get(":id/records") @RequirePermission("activity:view") records(
    @Param("id") id: string,
    @Req() req: any,
    @Query() q: any,
  ) {
    return this.service.records(id, req.user.sub, q);
  }
  @Post() @RequirePermission("activity:edit") create(
    @Req() req: any,
    @Body() body: any,
  ) {
    return this.service.save(null, body, req.user.sub);
  }
  @Put(":id") @RequirePermission("activity:edit") update(
    @Param("id") id: string,
    @Req() req: any,
    @Body() body: any,
  ) {
    return this.service.save(id, body, req.user.sub);
  }
  @Post(":id/status") @RequirePermission("activity:edit") status(
    @Param("id") id: string,
    @Req() req: any,
    @Body() body: any,
  ) {
    return this.service.setStatus(id, req.user.sub, body?.status);
  }
  @Post(":id/public-code") @RequirePermission("activity:edit") publicCode(
    @Param("id") id: string,
    @Req() req: any,
  ) {
    return this.service.publicCode(id, req.user.sub);
  }
}
