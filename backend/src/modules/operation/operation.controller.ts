import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
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
  claimCoupon(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.operationService.claimCoupon(id, userId);
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
  redeemCoupon(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.operationService.redeemCoupon(userId, dto);
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

  @Get('second-hand/:id')
  getSecondHandDetail(@Param('id') id: string) {
    return this.operationService.getSecondHandDetail(id);
  }

  @Post('second-hand/order/create')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  createSecondHandOrder(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.operationService.createSecondHandOrder(userId, dto);
  }

  @Get('api/drift-bottle/regions/:regionId/config')
  getDriftBottleConfig(@Param('regionId') regionId: string) {
    return this.operationService.getDriftBottleConfig(regionId);
  }

  @Post('api/drift-bottle/bottles')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  createDriftBottle(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.operationService.createDriftBottle(userId, dto);
  }

  @Post('api/drift-bottle/bottles/pick')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  pickDriftBottle(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.operationService.pickDriftBottle(userId, dto);
  }

  @Get('api/drift-bottle/bottles/mine')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getMyBottles(@CurrentUser('sub') userId: string, @Query() query: any) {
    return this.operationService.getMyBottles(userId, query);
  }

  @Get('api/drift-bottle/bottles/pickups')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getMyPickups(@CurrentUser('sub') userId: string, @Query() query: any) {
    return this.operationService.getMyPickups(userId, query);
  }

  @Patch('api/drift-bottle/bottles/:bottleId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  updateDriftBottle(@Param('bottleId') bottleId: string, @CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.operationService.updateDriftBottle(bottleId, userId, dto);
  }

  @Get('api/drift-bottle/bottles/posters')
  getDriftBottlePosters(@Query('limit') limit: number) {
    return this.operationService.getDriftBottlePosters(limit);
  }

  @Get('api/region-signin/:regionId/config')
  getSigninConfig(@Param('regionId') regionId: string) {
    return this.operationService.getSigninConfig(regionId);
  }

  @Get('api/region-signin/:regionId/signin/status')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getSigninStatus(@Param('regionId') regionId: string, @CurrentUser('sub') userId: string) {
    return this.operationService.getSigninStatus(regionId, userId);
  }

  @Post('api/region-signin/:regionId/signin')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  signin(@Param('regionId') regionId: string, @CurrentUser('sub') userId: string) {
    return this.operationService.signin(regionId, userId);
  }

  @Post('api/region-signin/:regionId/signin/makeup')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  makeupSignin(@Param('regionId') regionId: string, @CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.operationService.makeupSignin(regionId, userId, dto);
  }

  @Get('api/region-signin/:regionId/signin/rewards')
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

  @Get('api/rating/replies')
  getRatingReplies(@Query() query: any) {
    return this.operationService.getRatingReplies(query);
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
  beInvited(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.operationService.beInvited(userId, dto);
  }

  @Get('api/share/invites')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getInviteRecords(@CurrentUser('sub') userId: string) {
    return this.operationService.getInviteRecords(userId);
  }

  @Get('AnonymousIdentity/random')
  getRandomAnonymous() {
    return this.operationService.getRandomAnonymous();
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

  @Get('api/contacts/my')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getMyContacts(@CurrentUser('sub') userId: string, @Query() query: any) {
    return this.operationService.getMyContacts(userId, query);
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

  @Get('api/user-management/tags')
  getUserTags(@Query('region_id') regionId: string) {
    return this.operationService.getUserTags(regionId);
  }

  @Post('api/user-management/tag-relations')
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

  @Get('api/dating/profile/list')
  getDatingProfileList(@Query() query: any) {
    return this.operationService.getDatingProfileList(query);
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

  @Post('circle/user-titles/claim/:titleId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  claimTitle(@Param('titleId') titleId: string, @CurrentUser('sub') userId: string) {
    return this.operationService.claimTitle(titleId, userId);
  }

  @Post('circle/user-titles/wear/:titleId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  wearTitle(@Param('titleId') titleId: string, @CurrentUser('sub') userId: string) {
    return this.operationService.wearTitle(titleId, userId);
  }

  @Post('circle/user-titles/unwear')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  unwearTitle(@CurrentUser('sub') userId: string) {
    return this.operationService.unwearTitle(userId);
  }

  @Get('circle/user-titles/user/:userId')
  getUserTitlesById(@Param('userId') userId: string) {
    return this.operationService.getUserTitlesById(userId);
  }

  @Get('circle/user-titles/current')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getCurrentTitle(@CurrentUser('sub') userId: string) {
    return this.operationService.getCurrentTitle(userId);
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
  generateAIComments(@Body() dto: any) {
    return this.operationService.generateAIComments(dto);
  }
}
