import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CommentService } from './comment.service';
import { JwtGuard } from '../../guards/jwt.guard';
import { CurrentUser } from '../../decorators/current-user.decorator';

@ApiTags('评论')
@Controller()
export class CommentController {
  constructor(private readonly commentService: CommentService) {}

  @Get('comments/v2/post/:postId/comments')
  getCommentsV2(@Param('postId') postId: string, @Query() query: any, @Req() req: any) {
    return this.commentService.getCommentsV2(postId, query, req?.user?.sub || req?.user?.id);
  }

  @Get('comments/my')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getMyComments(@CurrentUser('sub') userId: string, @Query() query: any) {
    return this.commentService.getMyComments(userId, query);
  }

  @Post('comments/lottery')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  createLottery(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.commentService.createLottery(userId, dto);
  }

  @Post('comments/report/:commentId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  reportComment(@Param('commentId') commentId: string, @CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.commentService.reportComment(commentId, userId, dto);
  }

  @Post('comments/:postId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  createComment(@Param('postId') postId: string, @CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.commentService.createComment(postId, userId, dto);
  }

  @Delete('comments/:commentId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  deleteComment(@Param('commentId') commentId: string, @CurrentUser('sub') userId: string) {
    return this.commentService.deleteComment(commentId, userId);
  }

  @Post('comments/:commentId/like')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  likeComment(@Param('commentId') commentId: string, @CurrentUser('sub') userId: string) {
    return this.commentService.likeComment(commentId, userId);
  }

  @Delete('comments/:commentId/like')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  unlikeComment(@Param('commentId') commentId: string, @CurrentUser('sub') userId: string) {
    return this.commentService.unlikeComment(commentId, userId);
  }

  @Put('comments/pin/:commentId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  pinComment(@Param('commentId') commentId: string, @CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.commentService.pinComment(commentId, userId, dto);
  }

  @Get('comments/lottery/:postId')
  getLotteryDetail(@Param('postId') postId: string) {
    return this.commentService.getLotteryDetail(postId);
  }

  @Post('comments/lottery/:lotteryId/cancel')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  cancelLottery(@Param('lotteryId') lotteryId: string, @CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.commentService.cancelLottery(lotteryId, userId, dto);
  }

  @Post('comments/lottery/:lotteryId/draw')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  drawLottery(@Param('lotteryId') lotteryId: string, @CurrentUser('sub') userId: string) {
    return this.commentService.drawLottery(lotteryId, userId);
  }
}
