import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { JwtGuard } from "../../guards/jwt.guard";
import { AdminGuard, AdminPermissionGuard } from "../../guards/admin.guard";
import { RequirePermission } from "../../decorators/require-permission.decorator";
import { WelfareWecomService } from "./welfare-wecom.service";
import { decryptWecomCallback, parseWecomXml } from "./welfare-wecom.callback";

@Controller("admin/welfare/wecom")
@UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
export class WelfareWecomAdminController {
  constructor(private readonly service: WelfareWecomService) {}
  @Get("config")
  @RequirePermission("system:config")
  config(@Req() req: any) {
    return this.service.adminConfig(req.user.sub);
  }
  @Put("config")
  @RequirePermission("system:config")
  save(@Req() req: any, @Body() body: any) {
    return this.service.saveConfig(req.user.sub, body);
  }
  @Get("discover")
  @RequirePermission("system:config")
  discover(@Req() req: any, @Query("cursor") cursor?: string) {
    return this.service.discover(req.user.sub, cursor);
  }
  @Get("groups")
  @RequirePermission("activity:view")
  groups(@Req() req: any) {
    return this.service.groups(req.user.sub);
  }
  @Get("groups/:id/members")
  @RequirePermission("activity:view")
  members(@Req() req: any, @Param("id") id: string, @Query() query: any) {
    return this.service.members(req.user.sub, id, query);
  }
  @Post("groups")
  @RequirePermission("system:config")
  register(@Req() req: any, @Body() body: any) {
    return this.service.importGroups(req.user.sub, body);
  }
  @Post("groups/:id/sync")
  @RequirePermission("activity:edit")
  sync(@Req() req: any, @Param("id") id: string) {
    return this.service.sync(req.user.sub, id);
  }
}

@Controller("wechat/wecom")
export class WelfareWecomCallbackController {
  constructor(private readonly service: WelfareWecomService) {}
  @Get("callback")
  async verify(@Query() query: any, @Res() response: any) {
    const config = await this.service.config();
    const message = decryptWecomCallback(query, query.echostr, config);
    response.type("text/plain").send(message);
  }
  @Post("callback")
  @HttpCode(200)
  async event(
    @Query() query: any,
    @Req() request: any,
    @Body() body: any,
    @Res() response: any,
  ) {
    const config = await this.service.config();
    const raw = request.rawBody || body;
    const envelope = parseWecomXml(
      Buffer.isBuffer(raw) ? raw.toString("utf8") : raw,
    );
    const xml = decryptWecomCallback(query, envelope.Encrypt, config);
    const event = parseWecomXml(xml);
    if (
      event.ToUserName === config.corpId &&
      event.Event === "change_external_chat" &&
      typeof event.ChatId === "string" &&
      event.ChatId.length <= 191
    )
      if (event.ChangeType === "dismiss")
        await this.service.invalidate(config.corpId, event.ChatId, "dismiss");
      else await this.service.invalidate(config.corpId, event.ChatId);
    response.type("text/plain").send("success");
  }
}
