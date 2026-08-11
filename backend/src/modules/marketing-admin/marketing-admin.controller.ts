import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { MarketingAdminService } from './marketing-admin.service';
import { JwtGuard } from '../../guards/jwt.guard';
import { AdminGuard, AdminPermissionGuard } from '../../guards/admin.guard';
import { RequirePermission } from '../../decorators/require-permission.decorator';
import { CurrentUser } from '../../decorators/current-user.decorator';

@ApiTags('营销中心')
@Controller('admin/marketing')
@UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
@ApiBearerAuth()
export class MarketingAdminController {
  constructor(private readonly marketingAdminService: MarketingAdminService) {}

  // ==================== 优惠券 ====================

  @Get('coupons')
  @RequirePermission('marketing:view')
  @ApiOperation({ summary: '优惠券列表' })
  getCoupons(@Query() query: any) {
    return this.marketingAdminService.getCoupons(query);
  }

  @Post('coupons')
  @RequirePermission('marketing:edit')
  @ApiOperation({ summary: '创建优惠券' })
  createCoupon(
    @Body() body: any,
    @CurrentUser('sub') operatorId: string,
    @Req() req: Request,
  ) {
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip || '';
    return this.marketingAdminService.createCoupon(body, operatorId, ip);
  }

  @Put('coupons/:id')
  @RequirePermission('marketing:edit')
  @ApiOperation({ summary: '更新优惠券' })
  updateCoupon(
    @Param('id') id: string,
    @Body() body: any,
    @CurrentUser('sub') operatorId: string,
    @Req() req: Request,
  ) {
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip || '';
    return this.marketingAdminService.updateCoupon(id, body, operatorId, ip);
  }

  @Put('coupons/:id/status')
  @RequirePermission('marketing:edit')
  @ApiOperation({ summary: '更新优惠券状态' })
  updateCouponStatus(
    @Param('id') id: string,
    @Body() body: { status: string },
    @CurrentUser('sub') operatorId: string,
  ) {
    return this.marketingAdminService.updateCouponStatus(id, body.status, operatorId);
  }

  @Get('coupon-records')
  @RequirePermission('marketing:view')
  @ApiOperation({ summary: '优惠券发放记录' })
  getCouponRecords(@Query() query: any) {
    return this.marketingAdminService.getCouponRecords(query);
  }

  @Get('coupon-redeem-codes')
  @RequirePermission('coupon:redeem-code:view')
  @ApiOperation({ summary: '优惠券兑换码列表' })
  getCouponRedeemCodes(@Query() query: any) {
    return this.marketingAdminService.getCouponRedeemCodes(query);
  }

  @Post('coupon-redeem-codes')
  @RequirePermission('coupon:redeem-code:create')
  @ApiOperation({ summary: '生成优惠券兑换码' })
  createCouponRedeemCodes(
    @Body() body: any,
    @CurrentUser('sub') operatorId: string,
    @Req() req: Request,
  ) {
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip || '';
    return this.marketingAdminService.createCouponRedeemCodes(body, operatorId, ip);
  }

  @Put('coupon-redeem-codes/:id/status')
  @RequirePermission('coupon:redeem-code:edit')
  @ApiOperation({ summary: '更新优惠券兑换码状态' })
  updateCouponRedeemCodeStatus(
    @Param('id') id: string,
    @Body() body: { status: string },
    @CurrentUser('sub') operatorId: string,
    @Req() req: Request,
  ) {
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip || '';
    return this.marketingAdminService.updateCouponRedeemCodeStatus(id, body.status, operatorId, ip);
  }

  @Get('coupon-redeem-records')
  @RequirePermission('coupon:redeem-code:view')
  @ApiOperation({ summary: '优惠券兑换记录' })
  getCouponRedeemRecords(@Query() query: any) {
    return this.marketingAdminService.getCouponRedeemRecords(query);
  }

  // ==================== 运营活动 ====================

  @Get('campaigns')
  @RequirePermission('marketing:view')
  @ApiOperation({ summary: '运营活动列表' })
  getCampaigns(@Query() query: any) {
    return this.marketingAdminService.getCampaigns(query);
  }

  @Post('campaigns')
  @RequirePermission('marketing:edit')
  @ApiOperation({ summary: '创建运营活动' })
  createCampaign(
    @Body() body: any,
    @CurrentUser('sub') operatorId: string,
    @Req() req: Request,
  ) {
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip || '';
    return this.marketingAdminService.createCampaign(body, operatorId, ip);
  }

  @Put('campaigns/:id')
  @RequirePermission('marketing:edit')
  @ApiOperation({ summary: '更新运营活动' })
  updateCampaign(
    @Param('id') id: string,
    @Body() body: any,
    @CurrentUser('sub') operatorId: string,
    @Req() req: Request,
  ) {
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip || '';
    return this.marketingAdminService.updateCampaign(id, body, operatorId, ip);
  }

  @Put('campaigns/:id/status')
  @RequirePermission('marketing:edit')
  @ApiOperation({ summary: '更新运营活动状态' })
  updateCampaignStatus(
    @Param('id') id: string,
    @Body() body: { status: string },
    @CurrentUser('sub') operatorId: string,
    @Req() req: Request,
  ) {
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip || '';
    return this.marketingAdminService.updateCampaignStatus(id, body.status, operatorId, ip);
  }

  // ==================== 签到配置 ====================

  @Get('sign/config')
  @RequirePermission('marketing:view')
  @ApiOperation({ summary: '获取签到配置' })
  getSignConfig(@Query('regionId') regionId?: string) {
    return this.marketingAdminService.getSignConfig(regionId);
  }

  @Put('sign/config')
  @RequirePermission('marketing:edit')
  @ApiOperation({ summary: '保存签到配置' })
  saveSignConfig(
    @Body() body: any,
    @CurrentUser('sub') operatorId: string,
    @Req() req: Request,
  ) {
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip || '';
    return this.marketingAdminService.saveSignConfig(body, operatorId, ip);
  }

  @Get('sign/records')
  @RequirePermission('marketing:view')
  @ApiOperation({ summary: '签到记录' })
  getSignRecords(@Query() query: any) {
    return this.marketingAdminService.getSignRecords(query);
  }

  // ==================== 徽章配置 ====================

  @Get('badges')
  @RequirePermission('marketing:view')
  @ApiOperation({ summary: '徽章列表' })
  getBadges(@Query() query: any) {
    return this.marketingAdminService.getBadges(query);
  }

  @Post('badges')
  @RequirePermission('marketing:edit')
  @ApiOperation({ summary: '创建徽章' })
  createBadge(
    @Body() body: any,
    @CurrentUser('sub') operatorId: string,
    @Req() req: Request,
  ) {
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip || '';
    return this.marketingAdminService.createBadge(body, operatorId, ip);
  }

  @Put('badges/:id')
  @RequirePermission('marketing:edit')
  @ApiOperation({ summary: '更新徽章' })
  updateBadge(
    @Param('id') id: string,
    @Body() body: any,
    @CurrentUser('sub') operatorId: string,
    @Req() req: Request,
  ) {
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip || '';
    return this.marketingAdminService.updateBadge(id, body, operatorId, ip);
  }

  @Delete('badges/:id')
  @RequirePermission('marketing:edit')
  @ApiOperation({ summary: '删除徽章' })
  deleteBadge(
    @Param('id') id: string,
    @CurrentUser('sub') operatorId: string,
    @Req() req: Request,
  ) {
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip || '';
    return this.marketingAdminService.deleteBadge(id, operatorId, ip);
  }

  @Get('users/:userId/badges')
  @RequirePermission('marketing:view')
  @ApiOperation({ summary: '用户已获得徽章' })
  getUserBadges(@Param('userId') userId: string) {
    return this.marketingAdminService.getUserBadges(userId);
  }

  @Post('badges/:id/grant')
  @RequirePermission('marketing:edit')
  @ApiOperation({ summary: '给用户发放徽章' })
  grantBadgeToUser(
    @Param('id') id: string,
    @Body() body: any,
    @CurrentUser('sub') operatorId: string,
    @Req() req: Request,
  ) {
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip || '';
    return this.marketingAdminService.grantBadgeToUser(id, body, operatorId, ip);
  }

  @Delete('badges/:id/users/:userId')
  @RequirePermission('marketing:edit')
  @ApiOperation({ summary: '撤销用户徽章' })
  revokeBadgeFromUser(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @CurrentUser('sub') operatorId: string,
    @Req() req: Request,
  ) {
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip || '';
    return this.marketingAdminService.revokeBadgeFromUser(id, userId, operatorId, ip);
  }

  // ==================== 称号配置 ====================

  @Get('titles')
  @RequirePermission('marketing:view')
  @ApiOperation({ summary: '称号列表' })
  getTitles(@Query() query: any) {
    return this.marketingAdminService.getTitles(query);
  }

  @Post('titles')
  @RequirePermission('marketing:edit')
  @ApiOperation({ summary: '创建称号' })
  createTitle(
    @Body() body: any,
    @CurrentUser('sub') operatorId: string,
    @Req() req: Request,
  ) {
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip || '';
    return this.marketingAdminService.createTitle(body, operatorId, ip);
  }

  @Put('titles/:id')
  @RequirePermission('marketing:edit')
  @ApiOperation({ summary: '更新称号' })
  updateTitle(
    @Param('id') id: string,
    @Body() body: any,
    @CurrentUser('sub') operatorId: string,
    @Req() req: Request,
  ) {
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip || '';
    return this.marketingAdminService.updateTitle(id, body, operatorId, ip);
  }

  @Delete('titles/:id')
  @RequirePermission('marketing:edit')
  @ApiOperation({ summary: '删除称号' })
  deleteTitle(
    @Param('id') id: string,
    @CurrentUser('sub') operatorId: string,
    @Req() req: Request,
  ) {
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip || '';
    return this.marketingAdminService.deleteTitle(id, operatorId, ip);
  }

  // ==================== 分享有礼 ====================

  @Get('share-invite/config')
  @RequirePermission('marketing:view')
  @ApiOperation({ summary: '获取分享有礼配置' })
  getShareInviteConfig(@Query('regionId') regionId?: string) {
    return this.marketingAdminService.getShareInviteConfig(regionId);
  }

  @Put('share-invite/config')
  @RequirePermission('marketing:edit')
  @ApiOperation({ summary: '保存分享有礼配置' })
  saveShareInviteConfig(
    @Body() body: any,
    @CurrentUser('sub') operatorId: string,
    @Req() req: Request,
  ) {
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip || '';
    return this.marketingAdminService.saveShareInviteConfig(body, operatorId, ip);
  }

  @Get('share-invite/records')
  @RequirePermission('marketing:view')
  @ApiOperation({ summary: '分享邀请记录' })
  getShareInviteRecords(@Query() query: any) {
    return this.marketingAdminService.getShareInviteRecords(query);
  }

  // ==================== 活动管理 ====================

  @Get('activities')
  @RequirePermission('marketing:view')
  @ApiOperation({ summary: '活动列表' })
  getActivities(@Query() query: any) {
    return this.marketingAdminService.getActivities(query);
  }

  @Post('activities')
  @RequirePermission('marketing:edit')
  @ApiOperation({ summary: '创建活动' })
  createActivity(
    @Body() body: any,
    @CurrentUser('sub') operatorId: string,
    @Req() req: Request,
  ) {
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip || '';
    return this.marketingAdminService.createActivity(body, operatorId, ip);
  }

  @Put('activities/:id')
  @RequirePermission('marketing:edit')
  @ApiOperation({ summary: '更新活动' })
  updateActivity(
    @Param('id') id: string,
    @Body() body: any,
    @CurrentUser('sub') operatorId: string,
    @Req() req: Request,
  ) {
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip || '';
    return this.marketingAdminService.updateActivity(id, body, operatorId, ip);
  }

  @Get('activities/:id/orders')
  @RequirePermission('marketing:view')
  @ApiOperation({ summary: '活动订单' })
  getActivityOrders(@Param('id') id: string, @Query() query: any) {
    return this.marketingAdminService.getActivityOrders(id, query);
  }

  @Get('activities/:id/users')
  @RequirePermission('marketing:view')
  @ApiOperation({ summary: '活动参与者' })
  getActivityUsers(@Param('id') id: string, @Query() query: any) {
    return this.marketingAdminService.getActivityUsers(id, query);
  }

  // ==================== 团购管理 ====================

  @Get('group-buys')
  @RequirePermission('marketing:view')
  @ApiOperation({ summary: '团购列表' })
  getGroupBuys(@Query() query: any) {
    return this.marketingAdminService.getGroupBuys(query);
  }

  @Post('group-buys')
  @RequirePermission('marketing:edit')
  @ApiOperation({ summary: '创建团购' })
  createGroupBuy(
    @Body() body: any,
    @CurrentUser('sub') operatorId: string,
    @Req() req: Request,
  ) {
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip || '';
    return this.marketingAdminService.createGroupBuy(body, operatorId, ip);
  }

  @Put('group-buys/:id')
  @RequirePermission('marketing:edit')
  @ApiOperation({ summary: '更新团购' })
  updateGroupBuy(
    @Param('id') id: string,
    @Body() body: any,
    @CurrentUser('sub') operatorId: string,
    @Req() req: Request,
  ) {
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip || '';
    return this.marketingAdminService.updateGroupBuy(id, body, operatorId, ip);
  }

  @Get('group-buys/:id/orders')
  @RequirePermission('marketing:view')
  @ApiOperation({ summary: '团购订单' })
  getGroupBuyOrders(@Param('id') id: string, @Query() query: any) {
    return this.marketingAdminService.getGroupBuyOrders(id, query);
  }

  // ==================== 首页权益卡片 ====================

  @Get('popups')
  @RequirePermission('marketing:view')
  @ApiOperation({ summary: '首页权益卡片列表' })
  getPopups(@Query() query: any) {
    return this.marketingAdminService.getPopups(query);
  }

  @Post('popups')
  @RequirePermission('marketing:edit')
  @ApiOperation({ summary: '创建首页权益卡片' })
  createPopup(
    @Body() body: any,
    @CurrentUser('sub') operatorId: string,
    @Req() req: Request,
  ) {
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip || '';
    return this.marketingAdminService.createPopup(body, operatorId, ip);
  }

  @Put('popups/:id')
  @RequirePermission('marketing:edit')
  @ApiOperation({ summary: '更新首页权益卡片' })
  updatePopup(
    @Param('id') id: string,
    @Body() body: any,
    @CurrentUser('sub') operatorId: string,
    @Req() req: Request,
  ) {
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip || '';
    return this.marketingAdminService.updatePopup(id, body, operatorId, ip);
  }

  @Delete('popups/:id')
  @RequirePermission('marketing:edit')
  @ApiOperation({ summary: '删除首页权益卡片' })
  deletePopup(
    @Param('id') id: string,
    @CurrentUser('sub') operatorId: string,
    @Req() req: Request,
  ) {
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip || '';
    return this.marketingAdminService.deletePopup(id, operatorId, ip);
  }
}
