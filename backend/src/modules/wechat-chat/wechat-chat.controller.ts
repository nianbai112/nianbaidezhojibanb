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
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../decorators/require-permission.decorator";
import { AdminGuard, AdminPermissionGuard } from "../../guards/admin.guard";
import { JwtGuard } from "../../guards/jwt.guard";
import { WechatChatService } from "./wechat-chat.service";

@ApiTags("微信 AI 聊天")
@ApiBearerAuth()
@Controller("admin/wechat-chat")
@UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
export class WechatChatController {
  constructor(private readonly service: WechatChatService) {}

  @Get("status")
  @RequirePermission("wechat:conversation:view")
  status() {
    return this.service.status();
  }

  @Put("settings")
  @RequirePermission("wechat:reply:edit")
  settings(@Body() input: any) {
    return this.service.saveSettings(input);
  }

  @Get("conversations")
  @RequirePermission("wechat:conversation:view")
  conversations(@Query() query: any) {
    return this.service.conversations(query);
  }

  @Put("conversations/:id")
  @RequirePermission("wechat:reply:edit")
  updateConversation(@Param("id") id: string, @Body() input: any) {
    return this.service.updateConversation(id, input);
  }

  @Get("conversations/:id/messages")
  @RequirePermission("wechat:content:view")
  messages(@Param("id") id: string) {
    return this.service.messages(id);
  }

  @Get("jobs")
  @RequirePermission("wechat:log:view")
  jobs(@Query() query: any) {
    return this.service.jobs(query);
  }

  @Post("jobs/:id/resolve")
  @RequirePermission("wechat:reply:edit")
  resolve(@Param("id") id: string, @Body() input: any) {
    return this.service.resolveUnknown(id, input);
  }

  @Get("skills")
  @RequirePermission("skill:view")
  skills() {
    return this.service.skills();
  }

  @Post("skills/:id/versions")
  @RequirePermission("skill:edit")
  createSkill(@Param("id") id: string, @Body() input: any, @Req() req: any) {
    return this.service.createSkillVersion(id, input, req.user.sub);
  }

  @Post("skills/:id/publish")
  @RequirePermission("skill:publish")
  publishSkill(@Param("id") id: string, @Body() input: any) {
    return this.service.publishSkill(id, input);
  }

  @Get("knowledge")
  @RequirePermission("wechat:knowledge:edit")
  knowledge() {
    return this.service.knowledge();
  }

  @Post("knowledge")
  @RequirePermission("wechat:knowledge:edit")
  createKnowledge(@Body() input: any) {
    return this.service.saveKnowledge(undefined, input);
  }

  @Put("knowledge/:id")
  @RequirePermission("wechat:knowledge:edit")
  updateKnowledge(@Param("id") id: string, @Body() input: any) {
    return this.service.saveKnowledge(id, input);
  }

  @Post("preview")
  @RequirePermission("wechat:reply:edit", "wechat:content:view")
  preview(@Body() input: any) {
    return this.service.preview(input);
  }

  @Post("inspect-callback")
  @RequirePermission("wechat:reply:edit", "wechat:content:view")
  inspectCallback(@Body() input: any) {
    return this.service.inspectCallback(input);
  }
}
