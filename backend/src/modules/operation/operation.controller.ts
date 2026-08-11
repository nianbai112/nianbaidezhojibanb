import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, UseGuards, Req, GoneException } from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { OperationService } from './operation.service';
import { JwtGuard } from '../../guards/jwt.guard';
import { CurrentUser } from '../../decorators/current-user.decorator';

@ApiTags('运营功能')
@Controller()
export class OperationController {
  constructor(private readonly operationService: OperationService) {}

  @Get('coupons/user/available')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getAvailableCoupons(@CurrentUser('sub') userId: string, @Query() query: any) {
    return this.operationService.getAvailableCoupons(userId, query);
  }

  @Post('coupons/user/:id/claim')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  claimCoupon(@Param('id') id: string, @CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.operationService.claimCoupon(id, userId, dto);
  }

  @Get('coupons/user/my')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getMyCoupons(@CurrentUser('sub') userId: string, @Query() query: any) {
    return this.operationService.getMyCoupons(userId, query);
  }

  @Post('coupons/user/redeem')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  redeemCoupon(@CurrentUser('sub') userId: string, @Body() dto: any, @Req() req: Request) {
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip || '';
    return this.operationService.redeemCoupon(userId, dto, ip);
  }

  @Get(['marketing/popups/runtime', 'api/marketing/popups/runtime'])
  getRuntimePopups(@Query() query: any) {
    return this.operationService.getRuntimePopups(query);
  }

  @Post(['marketing/popups/:id/track', 'api/marketing/popups/:id/track'])
  trackRuntimePopup(@Param('id') id: string, @Body() dto: any) {
    return this.operationService.trackRuntimePopup(id, dto);
  }

  @Get('second-hand/by-area/:areaId')
  getSecondHandByArea(@Param('areaId') areaId: string, @Query() query: any) {
    return this.operationService.getSecondHandByArea(areaId, query);
  }

  @Post('second-hand/create')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  createSecondHand(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.operationService.createSecondHand(userId, dto);
  }

  @Get('second-hand/my/products')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getMySecondHandProducts(@CurrentUser('sub') userId: string, @Query() query: any) {
    return this.operationService.getMySecondHandProducts(userId, query);
  }

  @Get('second-hand/my/orders')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getMySecondHandOrders(@CurrentUser('sub') userId: string, @Query() query: any) {
    return this.operationService.getMySecondHandOrders(userId, query);
  }

  @Get('second-hand/:id')
  getSecondHandDetail(@Param('id') id: string, @Query('userId') userId?: string, @CurrentUser('sub') currentUserId?: string) {
    return this.operationService.getSecondHandDetail(id, userId || currentUserId);
  }

  @Put('second-hand/:id')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  updateSecondHand(@Param('id') id: string, @CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.operationService.updateMySecondHandProduct(id, userId, dto);
  }

  @Post('second-hand/:id/status')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  updateSecondHandStatus(@Param('id') id: string, @CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.operationService.updateMySecondHandProductStatus(id, userId, dto);
  }

  @Post('second-hand/:id/report')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  reportSecondHand(@Param('id') id: string, @CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.operationService.reportSecondHandProduct(id, userId, dto);
  }

  @Post('second-hand/order/create')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  createSecondHandOrder(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.operationService.createSecondHandOrder(userId, dto);
  }

  @Put('second-hand/orders/:id/status')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  updateSecondHandOrderStatus(@Param('id') id: string, @CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.operationService.updateSecondHandOrderStatus(id, userId, dto);
  }

  @Get(['api/region-signin/:regionId/config', 'region-signin/:regionId/config'])
  getSigninConfig(@Param('regionId') regionId: string) {
    return this.operationService.getSigninConfig(regionId);
  }

  @Get(['api/region-signin/:regionId/signin/status', 'region-signin/:regionId/signin/status'])
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getSigninStatus(@Param('regionId') regionId: string, @CurrentUser('sub') userId: string) {
    return this.operationService.getSigninStatus(regionId, userId);
  }

  @Post(['api/region-signin/:regionId/online-heartbeat', 'region-signin/:regionId/online-heartbeat'])
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  onlineSigninHeartbeat(@Param('regionId') regionId: string, @CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.operationService.onlineSigninHeartbeat(regionId, userId, dto);
  }

  @Post(['api/region-signin/:regionId/signin', 'region-signin/:regionId/signin'])
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  signin(@Param('regionId') regionId: string, @CurrentUser('sub') userId: string) {
    return this.operationService.signin(regionId, userId);
  }

  @Post(['api/region-signin/:regionId/signin/makeup', 'region-signin/:regionId/signin/makeup'])
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  makeupSignin(@Param('regionId') regionId: string, @CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.operationService.makeupSignin(regionId, userId, dto);
  }

  @Get(['api/region-signin/:regionId/signin/rewards', 'region-signin/:regionId/signin/rewards'])
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getSigninRewards(@Param('regionId') regionId: string, @CurrentUser('sub') userId: string, @Query() query: any) {
    return this.operationService.getSigninRewards(regionId, userId, query);
  }

  @Get('api/punchIn/config/:regionId')
  getPunchInConfig(@Param('regionId') regionId: string) {
    return this.operationService.getPunchInConfig(regionId);
  }

  @Get('api/punchIn/check-in/status/:regionId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getPunchInStatus(@Param('regionId') regionId: string, @CurrentUser('sub') userId: string) {
    return this.operationService.getPunchInStatus(regionId, userId);
  }

  @Post('api/punchIn/check-in')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  punchInCheckIn(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.operationService.punchInCheckIn(userId, dto);
  }

  @Get('api/punchIn/location')
  getPunchInLocations(@Query() query: any) {
    return this.operationService.getPunchInLocations(query);
  }

  @Get('api/punchIn/location/:locationId')
  getPunchInLocationDetail(@Param('locationId') locationId: string) {
    return this.operationService.getPunchInLocationDetail(locationId);
  }

  @Put('api/punchIn/location/:locationId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  updatePunchInLocation(@Param('locationId') locationId: string, @Body() dto: any) {
    return this.operationService.updatePunchInLocation(locationId, dto);
  }

  @Get('api/punchIn/comment/location/:locationId')
  getPunchInComments(@Param('locationId') locationId: string, @Query() query: any) {
    return this.operationService.getPunchInComments(locationId, query);
  }

  @Post('api/punchIn/comment')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  createPunchInComment(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.operationService.createPunchInComment(userId, dto);
  }

  @Get('api/punchIn/wishlist')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getWishlist(@CurrentUser('sub') userId: string) {
    return this.operationService.getWishlist(userId);
  }

  @Post('api/punchIn/wishlist/:locationId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  addWishlist(@Param('locationId') locationId: string, @CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.operationService.addWishlist(locationId, userId, dto);
  }

  @Post('api/punchIn/wishlist')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  addWishlistFromBody(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.operationService.addWishlistFromBody(userId, dto);
  }

  @Delete('api/punchIn/wishlist/:locationId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  removeWishlist(@Param('locationId') locationId: string, @CurrentUser('sub') userId: string) {
    return this.operationService.removeWishlist(locationId, userId);
  }

  @Get('api/rating/categories/:regionId')
  getRatingCategories(@Param('regionId') regionId: string, @Query() query: any) {
    return this.operationService.getRatingCategories(regionId, query);
  }

  @Get('api/rating/categories/detail/:categoryId')
  getRatingCategoryDetail(@Param('categoryId') categoryId: string) {
    return this.operationService.getRatingCategoryDetail(categoryId);
  }

  @Get('api/rating/items/category/:categoryId')
  getRatingItems(@Param('categoryId') categoryId: string, @Query() query: any) {
    return this.operationService.getRatingItems(categoryId, query);
  }

  @Get('api/rating/items/detail/:itemId')
  getRatingItemDetail(@Param('itemId') itemId: string) {
    return this.operationService.getRatingItemDetail(itemId);
  }

  @Get('api/rating/items/dynamics/:itemId')
  getRatingItemDynamics(@Param('itemId') itemId: string, @Query() query: any) {
    return this.operationService.getRatingItemDynamics(itemId, query);
  }

  @Post('api/rating/ratings')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  submitRating(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.operationService.submitRating(userId, dto);
  }

  @Post('api/rating/items')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  createRatingItem(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.operationService.createRatingItem(userId, dto);
  }

  @Get('api/rating/replies')
  getRatingReplies(@Query() query: any) {
    return this.operationService.getRatingReplies(query);
  }

  @Post('api/rating/replies')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  createRatingReply(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.operationService.createRatingReply(userId, dto);
  }

  @Get('api/netdisk/categories')
  getNetDiskCategories(@Query() query: any) {
    return this.operationService.getNetDiskCategories(query);
  }

  @Get('api/netdisk/resources')
  getNetDiskResources(@Query() query: any) {
    return this.operationService.getNetDiskResources(query);
  }

  @Get('api/netdisk/resources/:id')
  getNetDiskResourceDetail(@Param('id') id: string) {
    return this.operationService.getNetDiskResourceDetail(id);
  }

  @Get('api/netdisk/comments')
  getNetDiskComments(@Query() query: any) {
    return this.operationService.getNetDiskComments(query);
  }

  @Post('api/netdisk/comments')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  createNetDiskComment(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.operationService.createNetDiskComment(userId, dto);
  }

  @Post('api/netdisk/favorites/:resourceId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  favoriteNetDisk(@Param('resourceId') resourceId: string, @CurrentUser('sub') userId: string) {
    return this.operationService.favoriteNetDisk(resourceId, userId);
  }

  @Delete('api/netdisk/favorites/:resourceId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  unfavoriteNetDisk(@Param('resourceId') resourceId: string, @CurrentUser('sub') userId: string) {
    return this.operationService.unfavoriteNetDisk(resourceId, userId);
  }

  @Get('api/netdisk/my-favorites')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getNetDiskFavorites(@CurrentUser('sub') userId: string, @Query() query: any) {
    return this.operationService.getNetDiskFavorites(userId, query);
  }

  @Post('api/netdisk/reports')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  reportNetDisk(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.operationService.reportNetDisk(userId, dto);
  }

  @Get('api/sticker-categories')
  getStickerCategories() {
    return this.operationService.getStickerCategories();
  }

  @Get('api/stickers/my')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getMyStickers(@CurrentUser('sub') userId: string, @Query() query: any) {
    return this.operationService.getMyStickers(userId, query);
  }

  @Post('api/stickers/my')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  addStickerToMine(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.operationService.addStickerToMine(userId, dto);
  }

  @Get('api/stickers/shared')
  getSharedStickers(@Query() query: any) {
    return this.operationService.getSharedStickers(query);
  }

  @Post('api/stickers/upload')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  uploadSticker(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.operationService.uploadSticker(userId, dto);
  }

  @Get('api/share/settings/:regionId')
  getShareSettings(@Param('regionId') regionId: string) {
    return this.operationService.getShareSettings(regionId);
  }

  @Post('api/share/be-invited')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  beInvited(@CurrentUser('sub') userId: string, @Body() dto: any, @Req() req: Request) {
    return this.operationService.beInvited(userId, dto, {
      ip: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || '',
      userAgent: (req.headers['user-agent'] as string) || '',
      deviceId: (req.headers['x-device-id'] as string) || '',
    });
  }

  @Post('api/share/claim-post-share')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '认领笔记分享带来的新用户奖励' })
  claimPostShare(@CurrentUser('sub') userId: string, @Body() dto: any, @Req() req: Request) {
    return this.operationService.claimPostShare(userId, String(dto?.code || dto?.share_code || ''), {
      ip: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || '',
      userAgent: (req.headers['user-agent'] as string) || '',
      deviceId: (req.headers['x-device-id'] as string) || dto?.device_id || dto?.deviceId || '',
    });
  }

  @Get('api/share/invites')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getInviteRecords(@CurrentUser('sub') userId: string) {
    return this.operationService.getInviteRecords(userId);
  }

  @Get('AnonymousIdentity/random')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getRandomAnonymous(@Query() query: any) {
    return this.operationService.getRandomAnonymous(
      String(query.region_id || query.regionId || '').trim(),
      String(query.post_id || query.postId || '').trim(),
    );
  }

  @Get('api/rankings')
  getRankings(@Query() query: any) {
    return this.operationService.getRankings(query);
  }

  @Get('api/wechat-article/images')
  getWechatArticleImages(@Query('url') url: string) {
    return this.operationService.getWechatArticleImages(url);
  }

  @Get('api/contacts')
  getContacts(@Query() query: any) {
    return this.operationService.getContacts(query);
  }

  @Get('api/contacts/categories/region/:regionId')
  getContactCategories(@Param('regionId') regionId: string) {
    return this.operationService.getContactCategories(regionId);
  }

  @Get('api/contacts/my')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getMyContacts(@CurrentUser('sub') userId: string, @Query() query: any) {
    return this.operationService.getMyContacts(userId, query);
  }

  @Get('api/contacts/:id')
  getContactDetail(@Param('id') id: string) {
    return this.operationService.getContactDetail(id);
  }

  @Post('api/contacts')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  createContact(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.operationService.createContact(userId, dto);
  }

  @Put('api/contacts/:id')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  updateContact(@Param('id') id: string, @CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.operationService.updateContact(id, userId, dto);
  }

  @Delete('api/contacts/:id')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  deleteContact(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.operationService.deleteContact(id, userId);
  }

  @Get('api/agreements/:type')
  getAgreementDocument(@Param('type') type: string, @Query() query: any) {
    return this.operationService.getAgreementDocument(type, query);
  }

  @Post('api/agreements/consent')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  acceptAgreement(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.operationService.acceptAgreement(userId, dto);
  }

  @Get('api/rich-text-content')
  getRichTextContents(@Query() query: any) {
    return this.operationService.getRichTextContents(query);
  }

  @Get('api/rich-text-content/:id')
  getRichTextContent(@Param('id') id: string) {
    return this.operationService.getRichTextContent(id);
  }

  @Get('api/rich-text-content/config/region/:regionId/all-types')
  getRegionContentTypes(@Param('regionId') regionId: string) {
    return this.operationService.getRegionContentTypes(regionId);
  }

  @Get('api/user-guidance/pages/:regionId')
  getUserGuidancePages(@Param('regionId') regionId: string) {
    return this.operationService.getUserGuidancePages(regionId);
  }

  @Get('api/user-guidance/settings')
  getUserGuidanceSettings() {
    return this.operationService.getUserGuidanceSettings();
  }

  @Post('api/user-guidance/save-user-info')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  saveUserGuidanceInfo(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.operationService.saveUserGuidanceInfo(userId, dto);
  }

  @Get('api/note-settings/region/:regionId')
  getNoteSettings(@Param('regionId') regionId: string) {
    return this.operationService.getNoteSettings(regionId);
  }

  @Get(['api/user-management/tags', 'user-management/tags'])
  getUserTags(@Query('region_id') regionId: string) {
    return this.operationService.getUserTags(regionId);
  }

  @Post(['api/user-management/tag-relations', 'user-management/tag-relations'])
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  updateUserTagRelation(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.operationService.updateUserTagRelation(userId, dto);
  }

  @Get('api/region-custom-pages/regions/:regionId/pages')
  getRegionCustomPages(@Param('regionId') regionId: string, @Query() query: any) {
    return this.operationService.getRegionCustomPages(regionId, query);
  }

  @Get('api/dating/config/region/:regionId')
  getDatingConfig(@Param('regionId') regionId: string) {
    return this.operationService.getDatingConfig(regionId);
  }

  @Get('api/dating/profile')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getDatingProfile(@CurrentUser('sub') userId: string) {
    return this.operationService.getDatingProfile(userId);
  }

  @Post('api/dating/profile')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  createOrUpdateDatingProfile(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.operationService.createOrUpdateDatingProfile(userId, dto);
  }

  @Get('api/dating/profile/list')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getDatingProfileList(@CurrentUser('sub') userId: string, @Query() query: any) {
    return this.operationService.getDatingProfileList(userId, query);
  }

  @Post('api/dating/matches/action')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  datingMatchAction(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.operationService.datingMatchAction(userId, dto);
  }

  @Get('api/dating/packages')
  getDatingPackages(@Query() query: any) {
    return this.operationService.getDatingPackages(query);
  }

  @Post('api/dating/orders/payment/pay')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  createDatingOrder(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.operationService.createDatingOrder(userId, dto);
  }

  @Get('api/dating/matches/me')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getMyDatingMatches(@CurrentUser('sub') userId: string, @Query() query: any) {
    return this.operationService.getMyDatingMatches(userId, query);
  }

  @Post('api/dating/reports')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  reportDatingUser(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.operationService.reportDatingUser(userId, dto);
  }

  @Post('api/dating/block')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  blockDatingUser(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.operationService.blockDatingUser(userId, dto);
  }

  @Get('api/groupbuy/packages')
  getGroupBuyPackages(@Query() query: any) {
    return this.operationService.getGroupBuyPackages(query);
  }

  @Post('api/groupbuy/payment/create')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  createGroupBuyOrder(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.operationService.createGroupBuyOrder(userId, dto);
  }

  @Get('api/groupbuy/payment/query/:orderSn')
  getGroupBuyOrder(@Param('orderSn') orderSn: string) {
    return this.operationService.getGroupBuyOrder(orderSn);
  }

  @Get('api/community/:communityId')
  getCommunityDetail(@Param('communityId') communityId: string) {
    return this.operationService.getCommunityDetail(communityId);
  }

  @Post('api/community/payment/create')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  createCommunityPayment(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.operationService.createCommunityPayment(userId, dto);
  }

  @Get('circle/user-titles')
  getUserTitles(@Query() query: any) {
    return this.operationService.getUserTitles(query);
  }

  // AUD-P1-048（2026-07-10）：用户端自助领取与购买入口已彻底关闭。
  // 产品当前没有 UserTitle.price、订单或支付模型，付费称号支付系统尚未建设；
  // 称号仅允许后台人工发放（supplement 后台 userTitle:create）与现有兑换码发放（redeem-codes/use）。
  // 下方 claim 路由固定返回 410，绝不调用 operationService.claimTitle 写入 userTitleRecord；
  // 历史 purchase 别名路由已删除（见下方注释）。结构化获取条件校验为独立更大项，本轮未做。
  @Post('circle/user-titles/claim/:titleId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'AUD-P1-048：普通用户自助领取已关闭' })
  async claimTitle(@Param('titleId') titleId: string, @CurrentUser('sub') userId: string) {
    // 固定拒绝：不调用 operationService.claimTitle，绝不写入 userTitleRecord。
    throw new GoneException('称号自助领取已关闭，请通过运营发放或兑换码获取');
  }

  // AUD-P1-048：已移除用户端 `POST circle/user-titles/purchase/:titleId` 直领路由（原 alias 直领 claimTitle）。
  // 付费称号支付系统未建设，后续若上线应改为先创建价格订单并接入支付中心，仅在支付回调成功后写 `userTitleRecord`。

  @Post('circle/user-titles/wear/:titleId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  wearTitle(@Param('titleId') titleId: string, @CurrentUser('sub') userId: string) {
    return this.operationService.wearTitle(titleId, userId);
  }

  @Post('circle/user-titles/unwear')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  unwearTitle(@CurrentUser('sub') userId: string, @Query() query: any) {
    return this.operationService.unwearTitle(userId, query?.regionId || query?.region_id);
  }

  @Get('circle/user-titles/user/:userId')
  getUserTitlesById(@Param('userId') userId: string, @Query() query: any) {
    return this.operationService.getUserTitlesById(userId, query);
  }

  @Get('circle/user-titles/current')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getCurrentTitle(@CurrentUser('sub') userId: string, @Query() query: any) {
    return this.operationService.getCurrentTitle(userId, query?.regionId || query?.region_id);
  }

  @Post('circle/user-titles/redeem-codes/use')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  useRedeemCode(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.operationService.useRedeemCode(userId, dto);
  }

  @Get('circle/user-titles/redeem-codes')
  getRedeemCodeInfo(@Query('code') code: string) {
    return this.operationService.getRedeemCodeInfo(code);
  }

  @Get('config/ai')
  getAIConfig() {
    return this.operationService.getAIConfig();
  }

  @Post('config/ai')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  generateAIComments(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.operationService.generateAIComments(userId, dto);
  }
}
