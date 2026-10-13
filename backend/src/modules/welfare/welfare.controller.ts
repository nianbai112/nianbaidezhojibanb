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
import { WelfareService } from "./welfare.service";

@Controller("miniapp/welfare")
export class WelfareController {
  constructor(private readonly service: WelfareService) {}
  @Get("campaigns") list(@Query() query: any) {
    return this.service.listPublic(query);
  }
  @Get("campaigns/:id") detail(@Param("id") id: string) {
    return this.service.publicDetail(id);
  }
  @Get("campaigns/:id/winners") winners(
    @Param("id") id: string,
    @Query() query: any,
  ) {
    return this.service.winners(id, query);
  }
  @Get("mine")
  @UseGuards(JwtGuard)
  mine(@Req() req: any, @Query() query: any) {
    return this.service.mine(req.user, query);
  }
  @Get("campaigns/:id/me")
  @UseGuards(JwtGuard)
  state(@Req() req: any, @Param("id") id: string) {
    return this.service.myState(id, req.user);
  }
  @Get("entries/:id/claim-qr")
  @UseGuards(JwtGuard)
  claimQr(@Req() req: any, @Param("id") id: string) {
    return this.service.claimQr(id, req.user);
  }
  @Get("entries/:id")
  @UseGuards(JwtGuard)
  entry(@Req() req: any, @Param("id") id: string) {
    return this.service.myEntry(id, req.user);
  }
  @Post("group-session")
  @UseGuards(JwtGuard)
  groupSession(@Req() req: any, @Body() body: any) {
    return this.service.groupSession(req.user, body?.code);
  }
  @Get("redeem/:code")
  @UseGuards(JwtGuard)
  redeemPreview(@Req() req: any, @Param("code") code: string) {
    return this.service.previewRedeem(code, req.user);
  }
  @Post("redeem")
  @UseGuards(JwtGuard)
  redeemByVerifier(@Req() req: any, @Body() body: any) {
    return this.service.redeemByVerifier(body?.code, req.user);
  }
  @Post("group-binding/:token")
  @UseGuards(JwtGuard)
  offerGroup(
    @Req() req: any,
    @Param("token") token: string,
    @Body() body: any,
  ) {
    return this.service.offerBinding(req.user, token, body?.proof);
  }
  @Post("campaigns/:id/check-group")
  @UseGuards(JwtGuard)
  checkGroup(@Req() req: any, @Param("id") id: string, @Body() body: any) {
    return this.service.checkGroup(id, req.user, body?.proof);
  }
  @Post("campaigns/:id/share-link")
  @UseGuards(JwtGuard)
  shareLink(@Req() req: any, @Param("id") id: string) { return this.service.shareLink(id, req.user); }
  @Post("campaigns/:id/share-visit")
  @UseGuards(JwtGuard)
  shareVisit(@Req() req: any, @Param("id") id: string, @Body() body: any) { return this.service.recordShareVisit(id, req.user, body); }
  @Get("campaigns/:id/share-code")
  @UseGuards(JwtGuard)
  shareCode(@Param("id") id: string, @Query("envVersion") envVersion?: string) {
    return this.service.shareCode(id, envVersion);
  }
  @Put("entries/:id/address")
  @UseGuards(JwtGuard)
  address(@Req() req: any, @Param("id") id: string, @Body() body: any) {
    return this.service.address(id, req.user, body);
  }
  @Post("campaigns/:id/participate")
  @UseGuards(JwtGuard)
  participate(@Req() req: any, @Param("id") id: string, @Body() body: any) {
    return this.service.participate(
      id,
      req.user,
      body?.requestKey,
      body?.groupProof,
    );
  }
}

@Controller("admin/welfare")
@UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
export class WelfareAdminController {
  constructor(private readonly service: WelfareService) {}
  @Get("options")
  @RequirePermission("activity:view")
  options(@Req() req: any) {
    return this.service.adminOptions(req.user.sub);
  }
  @Get("capabilities")
  @RequirePermission("activity:view")
  capabilities(@Req() req: any) {
    return this.service.adminCapabilities(req.user.sub);
  }
  @Get("campaigns")
  @RequirePermission("activity:view")
  list(@Req() req: any, @Query() query: any) {
    return this.service.adminList(req.user.sub, query);
  }
  @Get("campaigns/:id")
  @RequirePermission("activity:view")
  detail(@Req() req: any, @Param("id") id: string) {
    return this.service.adminDetail(id, req.user.sub);
  }
  @Get("campaigns/:id/entries")
  @RequirePermission("activity:view")
  entries(@Req() req: any, @Param("id") id: string, @Query() query: any) {
    return this.service.adminEntries(id, req.user.sub, query);
  }
  @Get("campaigns/:id/share-analytics")
  @RequirePermission("activity:view")
  shareAnalytics(@Req() req: any, @Param("id") id: string) { return this.service.shareAnalytics(id, req.user.sub); }
  @Get("campaigns/:id/logs")
  @RequirePermission("activity:view")
  logs(@Req() req: any, @Param("id") id: string) {
    return this.service.adminLogs(id, req.user.sub);
  }
  @Post("campaigns")
  @RequirePermission("activity:edit")
  create(@Req() req: any, @Body() body: any) {
    return this.service.save(null, body, req.user.sub);
  }
  @Put("campaigns/:id")
  @RequirePermission("activity:edit")
  update(@Req() req: any, @Param("id") id: string, @Body() body: any) {
    return this.service.save(id, body, req.user.sub);
  }
  @Post("campaigns/:id/group-binding/start")
  @RequirePermission("activity:edit")
  startBinding(@Req() req: any, @Param("id") id: string, @Body() body: any) {
    return this.service.startBinding(id, req.user.sub, body?.envVersion);
  }
  @Post('campaigns/:id/wecom-groups')
  @RequirePermission('activity:edit')
  addWecomGroups(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.service.addWecomGroups(id, req.user.sub, body?.groupIds);
  }
  @Get("campaigns/:id/group-binding/:token")
  @RequirePermission("activity:edit")
  inspectBinding(
    @Req() req: any,
    @Param("id") id: string,
    @Param("token") token: string,
  ) {
    return this.service.inspectBinding(id, req.user.sub, token);
  }
  @Post("campaigns/:id/group-binding/confirm")
  @RequirePermission("activity:edit")
  confirmBinding(@Req() req: any, @Param("id") id: string, @Body() body: any) {
    return this.service.confirmBinding(id, req.user.sub, body?.token);
  }
  @Post("campaigns/:id/group-binding/clear")
  @RequirePermission("activity:edit")
  clearGroups(@Req() req: any, @Param("id") id: string) {
    return this.service.clearGroups(id, req.user.sub);
  }
  @Post("entries/:id/ship")
  @RequirePermission("activity:edit")
  ship(@Req() req: any, @Param("id") id: string, @Body() body: any) {
    return this.service.ship(id, req.user.sub, body);
  }
  @Post("campaigns/:id/:action")
  @RequirePermission("activity:edit")
  action(
    @Req() req: any,
    @Param("id") id: string,
    @Param("action") action: string,
  ) {
    return this.service.transition(id, action, req.user.sub);
  }
  @Post("redeem")
  @RequirePermission("activity:edit")
  redeem(@Req() req: any, @Body() body: any) {
    return this.service.redeem(body?.code, req.user.sub);
  }

  // ========== 内定用户管理 ==========

  @Get("prizes/:prizeId/reserved")
  @RequirePermission("activity:view")
  getReservedUsers(@Req() req: any, @Param("prizeId") prizeId: string) {
    return this.service.getReservedUsers(prizeId, req.user.sub);
  }

  @Get("campaigns/:campaignId/entries-for-reserved")
  @RequirePermission("activity:view")
  getEntriesForReserved(
    @Req() req: any,
    @Param("campaignId") campaignId: string,
    @Query("keyword") keyword?: string,
  ) {
    return this.service.getEntriesForReserved(campaignId, req.user.sub, keyword);
  }

  @Post("prizes/:prizeId/reserved")
  @RequirePermission("activity:edit")
  addReservedUser(
    @Req() req: any,
    @Param("prizeId") prizeId: string,
    @Body() body: any,
  ) {
    return this.service.addReservedUser(prizeId, body?.userId, req.user.sub);
  }

  @Post("prizes/:prizeId/reserved/:userId/delete")
  @RequirePermission("activity:edit")
  removeReservedUser(
    @Req() req: any,
    @Param("prizeId") prizeId: string,
    @Param("userId") userId: string,
  ) {
    return this.service.removeReservedUser(prizeId, userId, req.user.sub);
  }
}
