import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PostService } from './post.service';
import { JwtGuard } from '../../guards/jwt.guard';
import { OptionalAuthGuard } from '../../guards/optional-auth.guard';
import { CurrentUser } from '../../decorators/current-user.decorator';

@ApiTags('内容社区')
@Controller()
export class PostController {
  constructor(private readonly postService: PostService) {}

  @Get('posts/region-posts/:regionId')
  @ApiOperation({ summary: '区域帖子列表' })
  listByRegion(@Param('regionId') regionId: string, @Query() query: any) {
    return this.postService.listByRegion(regionId, query);
  }

  @Get('posts/region-posts/:regionId/nearby-followed-posts')
  @UseGuards(OptionalAuthGuard)
  @ApiOperation({ summary: '附近关注帖子' })
  nearbyFollowed(@Param('regionId') regionId: string, @Query() query: any, @CurrentUser('sub') userId?: string) {
    return this.postService.nearbyFollowed(regionId, query, userId);
  }

  @Get('posts/hot-posts/:regionId')
  @ApiOperation({ summary: '热门帖子' })
  hotPosts(@Param('regionId') regionId: string, @Query() query: any) {
    return this.postService.hotPosts(regionId, query);
  }

  @Get('posts/featured-hot-posts/:regionId')
  @ApiOperation({ summary: '精选热门帖子' })
  featuredHot(@Param('regionId') regionId: string, @Query() query: any) {
    return this.postService.hotPosts(regionId, query);
  }

  @Get('posts/my-posts')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '我的帖子' })
  myPosts(@CurrentUser('sub') userId: string, @Query() query: any) {
    return this.postService.myPosts(userId, query);
  }

  @Get('posts/:id')
  @UseGuards(OptionalAuthGuard)
  @ApiOperation({ summary: '帖子详情' })
  detail(@Param('id') id: string, @CurrentUser('sub') userId?: string) {
    return this.postService.detail(id, userId);
  }

  @Post('posts')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '发布帖子' })
  create(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.postService.create(userId, dto);
  }

  @Put('posts/:postId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新帖子' })
  update(@Param('postId') postId: string, @CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.postService.update(postId, userId, dto);
  }

  @Delete('posts/:postId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '删除帖子' })
  remove(@Param('postId') postId: string, @CurrentUser('sub') userId: string) {
    return this.postService.remove(postId, userId);
  }

  @Post('likes/view/:postId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '浏览帖子' })
  incrementView(@Param('postId') postId: string, @CurrentUser('sub') userId: string) {
    return this.postService.incrementView(postId, userId);
  }

  @Post('likes/:postId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '点赞' })
  like(@Param('postId') postId: string, @CurrentUser('sub') userId: string) {
    return this.postService.like(postId, userId);
  }

  @Delete('likes/:postId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '取消点赞' })
  unlike(@Param('postId') postId: string, @CurrentUser('sub') userId: string) {
    return this.postService.unlike(postId, userId);
  }

  @Post('post-management/dislike')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '不喜欢帖子' })
  dislikePost(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.postService.dislikePost(userId, dto);
  }

  @Post('post-management/block-author')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '拉黑作者' })
  blockAuthor(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.postService.blockAuthor(userId, dto);
  }

  @Post('post-management/report')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '举报帖子' })
  reportPost(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.postService.reportPost(userId, dto);
  }

  @Get('posts/:postId/co-creators')
  @ApiOperation({ summary: '共创者列表' })
  getCoCreators(@Param('postId') postId: string) {
    return this.postService.getCoCreators(postId);
  }

  @Post('posts/:postId/co-creators/invite')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '邀请共创者' })
  inviteCoCreators(@Param('postId') postId: string, @CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.postService.inviteCoCreators(postId, userId, dto);
  }

  @Post('posts/:postId/co-creators/respond')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '响应共创邀请' })
  respondCoCreatorInvite(@Param('postId') postId: string, @CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.postService.respondCoCreatorInvite(postId, userId, dto);
  }

  @Delete('posts/:postId/co-creators/:userId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '移除共创者' })
  removeCoCreator(@Param('postId') postId: string, @Param('userId') coCreatorId: string, @CurrentUser('sub') userId: string) {
    return this.postService.removeCoCreator(postId, userId, coCreatorId);
  }

  @Get('posts/co-creators/invites')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '我的共创邀请' })
  myCoCreatorInvites(@CurrentUser('sub') userId: string, @Query() query: any) {
    return this.postService.myCoCreatorInvites(userId, query);
  }

  @Post('squats/:postId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '蹲守帖子' })
  squatPost(@Param('postId') postId: string, @CurrentUser('sub') userId: string) {
    return this.postService.squatPost(postId, userId);
  }

  @Get('squats/check/:postId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '检查蹲守状态' })
  checkSquat(@Param('postId') postId: string, @CurrentUser('sub') userId: string) {
    return this.postService.checkSquat(postId, userId);
  }

  @Get('squats/user')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '我的蹲守列表' })
  mySquats(@CurrentUser('sub') userId: string, @Query() query: any) {
    return this.postService.mySquats(userId, query);
  }

  @Get('api/post-votes/meta')
  @ApiOperation({ summary: '投票元信息' })
  getVoteMeta(@Query('post_id') postId: string) {
    return this.postService.getVoteMeta(postId);
  }

  @Get('api/post-votes/stats')
  @ApiOperation({ summary: '投票统计' })
  getVoteStats(@Query('post_id') postId: string) {
    return this.postService.getVoteStats(postId);
  }

  @Post('api/post-votes/vote')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '投票' })
  vote(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.postService.vote(userId, dto);
  }

  @Post('api/post-votes/unvote')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '取消投票' })
  unvote(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.postService.unvote(userId, dto);
  }

  @Post('api/post-votes/create-options')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建投票选项' })
  createVoteOptions(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.postService.createVoteOptions(userId, dto);
  }

  @Post('api/post-votes/settings/upsert')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '投票设置' })
  upsertVoteSettings(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.postService.upsertVoteSettings(userId, dto);
  }

  @Get('api/simulate-post-actions/status/:postId')
  @ApiOperation({ summary: '模拟操作状态' })
  getPostProgress(@Param('postId') postId: string) {
    return this.postService.getPostProgress(postId);
  }

  @Post('api/simulate-post-actions')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '模拟帖子操作' })
  simulateActions(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.postService.simulateActions(userId, dto);
  }
}
