import {
  Controller, Get, Post, Put, Delete, Body, Query, Param, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserService } from './user.service';
import { JwtGuard } from '../../guards/jwt.guard';
import { CurrentUser } from '../../decorators/current-user.decorator';
import {
  UpdateProfileDto, UpdateSettingsDto, StudentVerifyDto, ListQueryDto,
} from './dto/user.dto';

@ApiTags('用户')
@Controller()
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('auth/me')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取当前用户信息' })
  getMe(@CurrentUser('sub') userId: string, @Query('user_id') targetId?: string) {
    return this.userService.getProfile(targetId || userId);
  }

  @Get('auth/user/nickname-avatar')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取昵称头像' })
  getNicknameAvatar(@CurrentUser('sub') userId: string) {
    return this.userService.getNicknameAvatar(userId);
  }

  @Put('auth/user/update-profile')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新用户资料' })
  updateProfile(@CurrentUser('sub') userId: string, @Body() dto: UpdateProfileDto) {
    return this.userService.updateProfile(userId, dto);
  }

  @Get('auth/user/privacy-settings')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取隐私设置' })
  getPrivacySettings(@CurrentUser('sub') userId: string) {
    return this.userService.getPrivacySettings(userId);
  }

  @Put('auth/user/privacy-settings')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新隐私设置' })
  updatePrivacySettings(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.userService.updatePrivacySettings(userId, dto);
  }

  @Get('auth/user/balance-details')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '余额明细' })
  getBalanceDetails(@CurrentUser('sub') userId: string, @Query() query: ListQueryDto) {
    return this.userService.getBalanceDetails(userId, query);
  }

  @Post('auth/user/withdraw')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '申请提现' })
  applyWithdraw(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.userService.applyWithdraw(userId, dto);
  }

  @Get('auth/user/withdrawals/pending-total')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '待提现总额' })
  getPendingWithdrawTotal(@CurrentUser('sub') userId: string) {
    return this.userService.getPendingWithdrawTotal(userId);
  }

  @Get('auth/user/current-ban-status')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '当前封禁状态' })
  getBanStatus(@CurrentUser('sub') userId: string) {
    return this.userService.getBanStatus(userId);
  }

  @Post('auth/user/pay-unban')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '付费解封' })
  payUnban(@CurrentUser('sub') userId: string) {
    return this.userService.payUnban(userId);
  }

  @Get('auth/user/self-unban-config')
  @ApiOperation({ summary: '自助解封配置' })
  getSelfUnbanConfig() {
    return this.userService.getSelfUnbanConfig();
  }

  @Post('circle/student-verification/api/verification')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '学生认证' })
  studentVerify(@CurrentUser('sub') userId: string, @Body() dto: StudentVerifyDto) {
    return this.userService.studentVerify(userId, dto);
  }

  @Get('circle/student-verification/api/verification/me/my')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '我的学生认证信息' })
  getStudentVerifyInfo(@CurrentUser('sub') userId: string) {
    return this.userService.getStudentVerifyInfo(userId);
  }

  @Get('circle/student-verification/api/universities')
  @ApiOperation({ summary: '大学列表' })
  getUniversities(@Query('name') name: string, @Query('page') page: number, @Query('size') size: number) {
    return this.userService.getUniversities(name, page, size);
  }

  @Post('user-followers/:userId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '关注用户' })
  followUser(@Param('userId') targetId: string, @CurrentUser('sub') userId: string) {
    return this.userService.followUser(userId, targetId);
  }

  @Delete('user-followers/:userId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '取消关注' })
  unfollowUser(@Param('userId') targetId: string, @CurrentUser('sub') userId: string) {
    return this.userService.unfollowUser(userId, targetId);
  }

  @Get('user-followers/followers')
  @ApiOperation({ summary: '粉丝列表' })
  getFollowers(@Query() query: any, @CurrentUser('sub') userId?: string) {
    return this.userService.getFollowers(query, userId);
  }

  @Get('user-followers/followings')
  @ApiOperation({ summary: '关注列表' })
  getFollowings(@Query() query: any, @CurrentUser('sub') userId?: string) {
    return this.userService.getFollowings(query, userId);
  }

  @Get('likes/user-views')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '浏览记录' })
  getUserViews(@CurrentUser('sub') userId: string, @Query() query: ListQueryDto) {
    return this.userService.getUserViews(userId, query);
  }

  @Delete('likes/user-views')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '清空浏览记录' })
  clearUserViews(@CurrentUser('sub') userId: string) {
    return this.userService.clearUserViews(userId);
  }

  @Get('auth/users/region/testimonials/region')
  @ApiOperation({ summary: '区域用户评价' })
  getRegionTestimonials(@Query('region_id') regionId: string) {
    return this.userService.getRegionTestimonials(regionId);
  }
}
