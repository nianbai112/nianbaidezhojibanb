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
import { AcademicService } from "./academic.service";

@Controller("miniapp/academic")
@UseGuards(JwtGuard)
export class AcademicController {
  constructor(private readonly service: AcademicService) {}
  @Get("catalog") catalog(@Req() req: any, @Query() q: any) {
    return this.service.catalog(req.user.sub, q.regionId, q.sessionId);
  }
  @Get("timetable") timetable(@Req() req: any, @Query() q: any) {
    return this.service.timetable(req.user.sub, q);
  }
  @Put("subscription") subscribe(@Req() req: any, @Body() body: any) {
    return this.service.subscribe(req.user.sub, body);
  }
}

@Controller("admin/academic")
@UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
export class AcademicAdminController {
  constructor(private readonly service: AcademicService) {}
  @Get("options") @RequirePermission("academic:view") options(@Req() req: any) {
    return this.service.options(req.user.sub);
  }
  @Get("workspace") @RequirePermission("academic:view") workspace(
    @Req() req: any,
    @Query() q: any,
  ) {
    return this.service.workspace(req.user.sub, q);
  }
  @Post("terms") @RequirePermission("academic:edit") term(
    @Req() req: any,
    @Body() b: any,
  ) {
    return this.service.saveTerm(req.user.sub, b);
  }
  @Post("classes") @RequirePermission("academic:edit") classes(
    @Req() req: any,
    @Body() b: any,
  ) {
    return this.service.saveClass(req.user.sub, b);
  }
  @Post("teachers") @RequirePermission("academic:edit") teachers(
    @Req() req: any,
    @Body() b: any,
  ) {
    return this.service.saveTeacher(req.user.sub, b);
  }
  @Post("rules") @RequirePermission("academic:edit") rule(
    @Req() req: any,
    @Body() b: any,
  ) {
    return this.service.saveRule(req.user.sub, b);
  }
  @Get("rules/:id/preview") @RequirePermission("academic:view") preview(
    @Req() req: any,
    @Param("id") id: string,
  ) {
    return this.service.preview(req.user.sub, id);
  }
  @Post("rules/:id/publish") @RequirePermission("academic:edit") publish(
    @Req() req: any,
    @Param("id") id: string,
    @Body() b: any,
  ) {
    return this.service.publish(req.user.sub, id, b?.version);
  }
  @Post("sessions") @RequirePermission("academic:edit") extra(
    @Req() req: any,
    @Body() b: any,
  ) {
    return this.service.extra(req.user.sub, b);
  }
  @Put("sessions/:id") @RequirePermission("academic:edit") session(
    @Req() req: any,
    @Param("id") id: string,
    @Body() b: any,
  ) {
    return this.service.changeSession(req.user.sub, id, b);
  }
  @Put("settings") @RequirePermission("academic:config") settings(
    @Req() req: any,
    @Body() b: any,
  ) {
    return this.service.settings(req.user.sub, b);
  }
}
