import { Body, Controller, Get, Headers, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { JwtGuard } from '../../guards/jwt.guard';
import { PostShareService } from './post-share.service';

@ApiTags('笔记分享')
@Controller('api/post-shares')
export class PostShareController {
  constructor(private readonly postShareService: PostShareService) {}

  @Post()
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建笔记分享短码和小程序码' })
  create(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.postShareService.createLink(userId, String(dto?.postId || dto?.post_id || ''), {
      channel: String(dto?.channel || ''),
    });
  }

  @Get(':code')
  @ApiOperation({ summary: '解析笔记分享短码并记录匿名访问' })
  resolve(@Param('code') code: string, @Req() req: Request, @Headers('x-device-id') visitorId = '') {
    return this.postShareService.resolve(code, {
      visitorId,
      ip: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || '',
      userAgent: String(req.headers['user-agent'] || ''),
    });
  }
}
