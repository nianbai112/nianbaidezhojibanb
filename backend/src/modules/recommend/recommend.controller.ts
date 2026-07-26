import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { RecommendService } from './recommend.service';
import { JwtGuard } from '../../guards/jwt.guard';
import { AdminGuard, AdminPermissionGuard } from '../../guards/admin.guard';
import { RequirePermission } from '../../decorators/require-permission.decorator';
import { CurrentUser } from '../../decorators/current-user.decorator';

@ApiTags('推荐系统')
@Controller()
export class RecommendController {
  constructor(private readonly recommendService: RecommendService) {}

  @Get('api/recommend/feed')
  @ApiOperation({ summary: '获取推荐信息流' })
  getFeed(@Query() query: any, @CurrentUser('sub') userId?: string) {
    return this.recommendService.getFeed(query, userId);
  }

  @Get('api/recommend/posts')
  @ApiOperation({ summary: '获取推荐帖子' })
  getRecommendPosts(@Query() query: any, @CurrentUser('sub') userId?: string) {
    return this.recommendService.getRecommendPosts(query, userId);
  }

  @Get('api/recommend/merchants')
  @ApiOperation({ summary: '获取推荐商家' })
  getRecommendMerchants(@Query() query: any, @CurrentUser('sub') userId?: string) {
    return this.recommendService.getRecommendMerchants(query, userId);
  }

  @Get('api/recommend/products')
  @ApiOperation({ summary: '获取推荐商品' })
  getRecommendProducts(@Query() query: any, @CurrentUser('sub') userId?: string) {
    return this.recommendService.getRecommendProducts(query, userId);
  }

  @Get('api/recommend/topics')
  @ApiOperation({ summary: '获取推荐话题' })
  getRecommendTopics(@Query() query: any, @CurrentUser('sub') userId?: string) {
    return this.recommendService.getRecommendTopics(query, userId);
  }

  @Get('topics')
  @ApiOperation({ summary: '小程序话题列表兼容接口' })
  getTopics(@Query() query: any) {
    return this.recommendService.getTopics(query);
  }

  @Get('topics/:id')
  @ApiOperation({ summary: '小程序话题详情兼容接口' })
  getTopicDetail(@Param('id') id: string) {
    return this.recommendService.getTopicDetail(id);
  }

  @Put('topics/:id')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '小程序话题更新兼容接口' })
  updateTopic(@Param('id') id: string, @Body() body: any) {
    return this.recommendService.updateTopic(id, body);
  }

  @Get('admin/recommend/strategy')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @ApiBearerAuth()
  @RequirePermission('recommend:view')
  @ApiOperation({ summary: '获取推荐策略' })
  getStrategy(@Query() query: any) {
    return this.recommendService.getStrategy(query);
  }

  @Get('admin/recommend/dashboard')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @ApiBearerAuth()
  @RequirePermission('recommend:view')
  @ApiOperation({ summary: '推荐中心运营总览' })
  getDashboard(@Query() query: any) {
    return this.recommendService.getDashboard(query);
  }

  @Put('admin/recommend/strategy')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @ApiBearerAuth()
  @RequirePermission('recommend:edit')
  @ApiOperation({ summary: '更新推荐策略' })
  updateStrategy(@Body() body: any, @CurrentUser('sub') operatorId: string) {
    return this.recommendService.updateStrategy(body, operatorId);
  }

  @Get('admin/recommend/debug/:userId')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @ApiBearerAuth()
  @RequirePermission('recommend:view')
  @ApiOperation({ summary: '调试推荐结果' })
  debugRecommend(@Param('userId') userId: string, @Query() query: any) {
    return this.recommendService.debugRecommend(userId, query);
  }

  @Post('admin/recommend/rebuild')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @ApiBearerAuth()
  @RequirePermission('recommend:edit')
  @ApiOperation({ summary: '重建推荐池' })
  rebuildPool(@Body() body: any, @CurrentUser('sub') operatorId: string) {
    return this.recommendService.rebuildPool(body, operatorId);
  }

  @Get('admin/recommend/pool')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @ApiBearerAuth()
  @RequirePermission('recommend:view')
  @ApiOperation({ summary: '查看推荐池' })
  getPool(@Query() query: any) {
    return this.recommendService.getPool(query);
  }

  @Post('admin/recommend/control')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @ApiBearerAuth()
  @RequirePermission('recommend:edit')
  @ApiOperation({ summary: '人工干预推荐' })
  controlRecommend(@Body() body: any, @CurrentUser('sub') operatorId: string) {
    return this.recommendService.controlRecommend(body, operatorId);
  }

  @Get('admin/recommend/slots')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @ApiBearerAuth()
  @RequirePermission('recommend:view')
  @ApiOperation({ summary: '推荐位配置列表' })
  getSlots() {
    return this.recommendService.getSlots();
  }

  @Post('admin/recommend/slots')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @ApiBearerAuth()
  @RequirePermission('recommend:edit')
  @ApiOperation({ summary: '创建推荐位配置' })
  createSlot(@Body() body: any, @CurrentUser('sub') operatorId: string) {
    return this.recommendService.createSlot(body, operatorId);
  }

  @Put('admin/recommend/slots/:id')
  @Put('admin/ranking/slots/:id')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @ApiBearerAuth()
  @RequirePermission('recommend:edit')
  @ApiOperation({ summary: '更新推荐位配置' })
  updateSlot(
    @Param('id') id: string,
    @Body() body: any,
    @CurrentUser('sub') operatorId: string,
  ) {
    return this.recommendService.updateSlot(id, body, operatorId);
  }
}
