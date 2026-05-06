import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CommentService } from './comment.service';
import { JwtGuard } from '../../guards/jwt.guard';
import { CurrentUser } from '../../decorators/current-user.decorator';

@ApiTags('评论')
@Controller()
export class CommentController {
  constructor(private readonly commentService: CommentService) {}

  @Get('comments/v2/post/:postId/comments')
  getCommentsV2(@Param('postId') postId: string, @Query() query: any) {
    return this.commentService.getCommentsV2(postId, query);
  }

  @Get('comments/my')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getMyComments(@CurrentUser('sub') userId: string, @Query() query: any) {
    return this.commentService.getMyComments(userId, query);
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

  @Put('comments/pin/:commentId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  pinComment(@Param('commentId') commentId: string, @Body() dto: any) {
    return this.commentService.pinComment(commentId, dto);
  }

  @Post('comments/lottery')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  createLottery(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.commentService.createLottery(userId, dto);
  }

  @Get('comments/lottery/:postId')
  getLotteryDetail(@Param('postId') postId: string) {
    return this.commentService.getLotteryDetail(postId);
  }

  @Post('comments/lottery/:lotteryId/cancel')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  cancelLottery(@Param('lotteryId') lotteryId: string, @Body() dto: any) {
    return this.commentService.cancelLottery(lotteryId, dto);
  }

  @Post('comments/lottery/:lotteryId/draw')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  drawLottery(@Param('lotteryId') lotteryId: string) {
    return this.commentService.drawLottery(lotteryId);
  }
}
