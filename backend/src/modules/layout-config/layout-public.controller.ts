import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { LayoutConfigService } from './layout-config.service';

/**
 * 小程序端布局配置公开接口。
 * 只读已发布配置，无需鉴权；与 admin/layout 管理接口分离。
 */
@ApiTags('页面布局(小程序端)')
@Controller('layout')
export class LayoutPublicController {
  constructor(private readonly layoutConfigService: LayoutConfigService) {}

  /**
   * tmagic 活动页 DSL 公开读取。
   * 注意：必须声明在 ':pageType/:regionId' 之前，否则 tmagic/<slug> 会被两段通配路由吞掉。
   */
  @Get('tmagic/:slug')
  @ApiOperation({ summary: '获取 tmagic 活动页 DSL（小程序端）' })
  getTmagicPage(@Param('slug') slug: string) {
    return this.layoutConfigService.getTmagicPage(slug);
  }

  @Get(':pageType/:regionId')
  @ApiOperation({ summary: '获取已发布页面布局（小程序端）' })
  getPublishedLayout(
    @Param('pageType') pageType: string,
    @Param('regionId') regionId: string,
  ) {
    return this.layoutConfigService.getPublishedLayout(pageType, regionId);
  }
}
