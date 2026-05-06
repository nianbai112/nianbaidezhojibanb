import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Query,
  Body,
  Param,
  UseGuards,
  Req,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { SystemConfigService } from "./system-config.service";
import { JwtGuard } from "../../guards/jwt.guard";
import { AdminGuard, AdminPermissionGuard } from "../../guards/admin.guard";
import { RequirePermission } from "../../decorators/require-permission.decorator";
import { CurrentUser } from "../../decorators/current-user.decorator";
import { Request } from "express";

@ApiTags("系统配置")
@Controller()
@UseGuards(JwtGuard, AdminGuard)
@ApiBearerAuth()
export class SystemConfigController {
  constructor(private readonly systemConfigService: SystemConfigService) {}

  @Get("admin/configs")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "获取配置列表" })
  getConfigs(
    @Query("group") group?: string,
    @Query("regionId") regionId?: string,
  ) {
    return this.systemConfigService.getConfigs(group, regionId);
  }

  @Get("admin/config")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "按分组获取配置（后台兼容路径）" })
  getConfigGroup(
    @Query("group") group?: string,
    @Query("regionId") regionId?: string,
  ) {
    return this.systemConfigService.getConfigs(group, regionId);
  }

  @Get("admin/configs/:key")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "获取单个配置" })
  getConfigByKey(
    @Param("key") key: string,
    @Query("regionId") regionId?: string,
  ) {
    return this.systemConfigService.getConfigByKey(key, regionId);
  }

  @Put("admin/configs")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "批量更新配置" })
  updateConfigs(
    @Body() dto: { configs: any[] },
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.systemConfigService.updateConfigs(
      dto.configs,
      operatorId,
      req.ip,
    );
  }

  @Put("admin/config")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "批量保存配置（后台兼容路径）" })
  saveConfigGroup(
    @Body() dto: { configs: any[] },
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.systemConfigService.updateConfigs(
      dto.configs,
      operatorId,
      req.ip,
    );
  }

  @Post("admin/config/reset")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  resetConfigGroup(
    @Body() dto: { group: string },
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.systemConfigService.resetGroup(dto.group, operatorId, req.ip);
  }

  @Get("admin/config/ai")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  getAiConfig() {
    return this.systemConfigService.getNamedConfig("ai");
  }

  @Put("admin/config/ai")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  saveAiConfig(
    @Body() dto: any,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.systemConfigService.setNamedConfig(
      "ai",
      dto,
      operatorId,
      req.ip,
    );
  }

  @Post("admin/config/ai/test")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  testAiConfig() {
    return this.systemConfigService.testAiConfig();
  }

  @Get("admin/config/robot")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  getRobotConfig() {
    return this.systemConfigService.getNamedConfig("robot");
  }

  @Put("admin/config/robot")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  saveRobotConfig(
    @Body() dto: any,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.systemConfigService.setNamedConfig(
      "robot",
      dto,
      operatorId,
      req.ip,
    );
  }

  @Get("admin/sensitive-words")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  sensitiveWords(@Query() query: any) {
    return this.systemConfigService.sensitiveWords(query);
  }

  @Post("admin/sensitive-words")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  createSensitiveWord(
    @Body() dto: any,
    @CurrentUser("sub") operatorId: string,
  ) {
    return this.systemConfigService.createSensitiveWord(dto, operatorId);
  }

  @Put("admin/sensitive-words/:id")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  updateSensitiveWord(
    @Param("id") id: string,
    @Body() dto: any,
    @CurrentUser("sub") operatorId: string,
  ) {
    return this.systemConfigService.updateSensitiveWord(id, dto, operatorId);
  }

  @Delete("admin/sensitive-words/:id")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  deleteSensitiveWord(@Param("id") id: string) {
    return this.systemConfigService.deleteSensitiveWord(id);
  }

  @Post("admin/sensitive-words/batch")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  batchSensitiveWords(
    @Body() dto: { words: string[] },
    @CurrentUser("sub") operatorId: string,
  ) {
    return this.systemConfigService.batchSensitiveWords(dto.words, operatorId);
  }

  @Get("admin/advertisements")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  advertisements(@Query() query: any) {
    return this.systemConfigService.advertisements(query);
  }

  @Post("admin/advertisements")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  createAdvertisement(
    @Body() dto: any,
    @CurrentUser("sub") operatorId: string,
  ) {
    return this.systemConfigService.createAdvertisement(dto, operatorId);
  }

  @Put("admin/advertisements/:id")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  updateAdvertisement(
    @Param("id") id: string,
    @Body() dto: any,
    @CurrentUser("sub") operatorId: string,
  ) {
    return this.systemConfigService.updateAdvertisement(id, dto, operatorId);
  }

  @Delete("admin/advertisements/:id")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  deleteAdvertisement(@Param("id") id: string) {
    return this.systemConfigService.deleteAdvertisement(id);
  }

  @Put("admin/advertisements/:id/status")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  advertisementStatus(
    @Param("id") id: string,
    @Body() dto: { status: number },
  ) {
    return this.systemConfigService.updateAdvertisement(id, {
      status: dto.status,
    });
  }
}
