import { Injectable, NotFoundException, BadRequestException, NotImplementedException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';

@Injectable()
export class OperationService {
  constructor(private readonly prisma: PrismaService) {}

  // ========== 优惠券 ==========
  async getAvailableCoupons(userId: string, query: any) {
    const { region_id, module: moduleType, page = 1, limit = 10 } = query;
    return this.prisma.coupon.findMany({ where: { status: 'active' }, skip: (page - 1) * limit, take: Number(limit) });
  }

  async claimCoupon(id: string, userId: string) {
    return this.prisma.couponReceive.create({ data: { couponId: id, userId } });
  }

  async getMyCoupons(userId: string, query: any) {
    const { status = 'unused', page = 1, limit = 10 } = query;
    return this.prisma.couponReceive.findMany({ where: { userId, status }, include: { coupon: true }, skip: (page - 1) * limit, take: Number(limit) });
  }

  async redeemCoupon(userId: string, dto: any) {
    const { code } = dto;
    const coupon = await this.prisma.coupon.findFirst({ where: { name: code, status: 'active' } });
    if (!coupon) throw new BadRequestException('优惠券不存在或已失效');
    const received = await this.prisma.couponReceive.findFirst({ where: { couponId: coupon.id, userId } });
    if (received) throw new BadRequestException('已领取过该优惠券');
    return this.prisma.couponReceive.create({ data: { couponId: coupon.id, userId } });
  }

  // ========== 二手 ==========
  async getSecondHandByArea(areaId: string, query: any) {
    const { page = 1, pageSize = 10 } = query;
    return this.prisma.secondHand.findMany({ where: { regionId: areaId, status: 'ON_SALE' }, skip: (page - 1) * pageSize, take: Number(pageSize), orderBy: { createdAt: 'desc' } });
  }

  async createSecondHand(userId: string, dto: any) {
    return this.prisma.secondHand.create({ data: { userId, ...dto } });
  }

  async getSecondHandDetail(id: string) {
    return this.prisma.secondHand.findUnique({ where: { id } });
  }

  async createSecondHandOrder(userId: string, dto: any) {
    return this.prisma.secondHandOrder.create({ data: { buyerId: userId, ...dto, orderNo: `SH${Date.now()}` } });
  }

  // ========== 漂流瓶 ==========
  async getDriftBottleConfig(regionId: string) {
    return { enabled: true, maxDailyThrows: 10, maxDailyPicks: 10 };
  }

  async createDriftBottle(userId: string, dto: any) {
    return this.prisma.driftBottle.create({ data: { userId, ...dto } });
  }

  async pickDriftBottle(userId: string, dto: any) {
    const count = await this.prisma.driftBottle.count({ where: { userId: { not: userId } } });
    if (count === 0) throw new NotFoundException('暂时没有漂流瓶');
    const skip = Math.floor(Math.random() * count);
    const bottle = await this.prisma.driftBottle.findFirst({ where: { userId: { not: userId } }, skip });
    if (!bottle) throw new NotFoundException('暂时没有漂流瓶');
    await this.prisma.driftBottle.update({ where: { id: bottle.id }, data: { pickCount: { increment: 1 } } });
    return bottle;
  }

  async getMyBottles(userId: string, query: any) {
    const { page = 1, page_size = 10 } = query;
    return this.prisma.driftBottle.findMany({ where: { userId }, skip: (page - 1) * page_size, take: Number(page_size), orderBy: { createdAt: 'desc' } });
  }

  async getMyPickups(userId: string, query: any) {
    const { page = 1, page_size = 10 } = query;
    return this.prisma.driftBottle.findMany({
      where: { pickCount: { gt: 0 } },
      skip: (page - 1) * page_size,
      take: Number(page_size),
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateDriftBottle(bottleId: string, userId: string, dto: any) {
    return this.prisma.driftBottle.update({ where: { id: bottleId }, data: dto });
  }

  async getDriftBottlePosters(limit: number) {
    return this.prisma.driftBottle.findMany({ take: Number(limit), orderBy: { pickCount: 'desc' } });
  }

  // ========== 签到 ==========
  async getSigninConfig(regionId: string) {
    return this.prisma.punchInConfig.findUnique({ where: { regionId } });
  }

  async getSigninStatus(regionId: string, userId: string) {
    const today = new Date().toISOString().split('T')[0];
    const record = await this.prisma.punchInRecord.findUnique({ where: { userId_regionId_date: { userId, regionId, date: today } } });
    return { isSigned: !!record, continuousDays: record ? 1 : 0 };
  }

  async signin(regionId: string, userId: string) {
    const today = new Date().toISOString().split('T')[0];
    const exists = await this.prisma.punchInRecord.findUnique({ where: { userId_regionId_date: { userId, regionId, date: today } } });
    if (exists) throw new BadRequestException('今日已签到');
    return this.prisma.punchInRecord.create({ data: { userId, regionId, date: today, rewardValue: 1 } });
  }

  async makeupSignin(regionId: string, userId: string, dto: any) {
    return this.prisma.punchInRecord.create({ data: { userId, regionId, date: dto.date, isMakeup: true } });
  }

  async getSigninRewards(regionId: string, userId: string, query: any) {
    return this.prisma.punchInRecord.findMany({ where: { userId, regionId }, orderBy: { createdAt: 'desc' } });
  }

  // ========== 打卡 ==========
  async getPunchInConfig(regionId: string) {
    return this.prisma.punchInConfig.findUnique({ where: { regionId } });
  }

  async getPunchInStatus(regionId: string, userId: string) {
    return this.getSigninStatus(regionId, userId);
  }

  async punchInCheckIn(userId: string, dto: any) {
    return this.signin(dto.region_id, userId);
  }

  async getPunchInLocations(query: any) {
    const { region_id } = query;
    return this.prisma.punchInLocation.findMany({ where: { regionId: region_id, status: 'PUBLISHED' } });
  }

  async getPunchInLocationDetail(locationId: string) {
    return this.prisma.punchInLocation.findUnique({ where: { id: locationId } });
  }

  async getPunchInComments(locationId: string, query: any) {
    const { page = 1, limit = 10 } = query;
    return this.prisma.comment.findMany({
      where: { postId: locationId },
      skip: (page - 1) * limit,
      take: Number(limit),
      orderBy: { createdAt: 'desc' },
    });
  }

  async createPunchInComment(userId: string, dto: any) {
    return this.prisma.comment.create({
      data: {
        userId,
        postId: dto.location_id,
        content: dto.content,
      },
    });
  }

  async getWishlist(userId: string) {
    return this.prisma.punchInWishlist.findMany({ where: { userId } });
  }

  async addWishlist(locationId: string, userId: string, dto: any) {
    return this.prisma.punchInWishlist.create({ data: { userId, locationId, content: dto.content } });
  }

  // ========== 评分 ==========
  async getRatingCategories(regionId: string, query: any) {
    const { page = 1, limit = 10 } = query;
    return this.prisma.ratingCategory.findMany({ where: { regionId }, skip: (page - 1) * limit, take: Number(limit) });
  }

  async getRatingCategoryDetail(categoryId: string) {
    return this.prisma.ratingCategory.findUnique({ where: { id: categoryId } });
  }

  async getRatingItems(categoryId: string, query: any) {
    const { page = 1, limit = 10, search, sort = 'hot' } = query;
    return this.prisma.ratingItem.findMany({ where: { categoryId }, skip: (page - 1) * limit, take: Number(limit), orderBy: { avgScore: 'desc' } });
  }

  async getRatingItemDetail(itemId: string) {
    return this.prisma.ratingItem.findUnique({ where: { id: itemId }, include: { ratings: true } });
  }

  async getRatingItemDynamics(itemId: string, query: any) {
    const { page = 1, limit = 10 } = query;
    return this.prisma.userRating.findMany({ where: { itemId }, skip: (page - 1) * limit, take: Number(limit), orderBy: { createdAt: 'desc' } });
  }

  async submitRating(userId: string, dto: any) {
    return this.prisma.userRating.create({ data: { userId, itemId: dto.item_id, score: dto.score, content: dto.content, images: dto.images } });
  }

  async getRatingReplies(query: any) {
    const { rating_id, page = 1, limit = 10 } = query;
    return this.prisma.userRating.findMany({
      where: { itemId: rating_id },
      skip: (page - 1) * limit,
      take: Number(limit),
      orderBy: { createdAt: 'desc' },
    });
  }

  // ========== 网盘 ==========
  async getNetDiskCategories(query: any) {
    return this.prisma.netDiskCategory.findMany();
  }

  async getNetDiskResources(query: any) {
    return this.prisma.netDiskResource.findMany();
  }

  async getNetDiskResourceDetail(id: string) {
    return this.prisma.netDiskResource.findUnique({ where: { id } });
  }

  async getNetDiskComments(query: any) {
    return this.prisma.netDiskComment.findMany();
  }

  async createNetDiskComment(userId: string, dto: any) {
    return this.prisma.netDiskComment.create({ data: { userId, resourceId: dto.resource_id, content: dto.content } });
  }

  async favoriteNetDisk(resourceId: string, userId: string) {
    return this.prisma.netDiskFavorite.upsert({ where: { userId_resourceId: { userId, resourceId } }, create: { userId, resourceId }, update: {} });
  }

  async getNetDiskFavorites(userId: string, query: any) {
    return this.prisma.netDiskFavorite.findMany({ where: { userId } });
  }

  async reportNetDisk(userId: string, dto: any) {
    return this.prisma.report.create({
      data: {
        reporterId: userId,
        targetType: 'netdisk',
        targetId: dto.resource_id,
        reason: dto.reason,
        status: 'pending',
      },
    });
  }

  // ========== 贴纸 ==========
  async getStickerCategories() {
    return this.prisma.stickerCategory.findMany();
  }

  async getMyStickers(userId: string, query: any) {
    return this.prisma.sticker.findMany({ where: { userId } });
  }

  async getSharedStickers(query: any) {
    return this.prisma.sticker.findMany({ where: { isShared: true } });
  }

  async uploadSticker(userId: string, dto: any) {
    return this.prisma.sticker.create({ data: { userId, ...dto } });
  }

  // ========== 分享 ==========
  async getShareSettings(regionId: string) {
    return this.prisma.shareSettings.findUnique({ where: { regionId } });
  }

  async beInvited(userId: string, dto: any) {
    return this.prisma.shareInvite.create({ data: { inviterId: dto.inviter_id, inviteeId: userId } });
  }

  async getInviteRecords(userId: string) {
    return this.prisma.shareInvite.findMany({ where: { inviterId: userId } });
  }

  // ========== 匿名身份 ==========
  async getRandomAnonymous() {
    const count = await this.prisma.anonymousIdentity.count();
    const skip = Math.floor(Math.random() * count);
    return this.prisma.anonymousIdentity.findFirst({ skip });
  }

  // ========== 排行榜 ==========
  async getRankings(query: any) {
    const { type = 'user', page = 1, limit = 20 } = query;
    if (type === 'user') {
      const users = await this.prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: Number(limit),
        select: { id: true, nickname: true, avatar: true },
      });
      return { list: users, total: await this.prisma.user.count() };
    }
    if (type === 'post') {
      const posts = await this.prisma.post.findMany({
        where: { status: 'PUBLISHED' },
        orderBy: { likeCount: 'desc' },
        skip: (page - 1) * limit,
        take: Number(limit),
        select: { id: true, title: true, content: true, likeCount: true, userId: true },
      });
      return { list: posts, total: await this.prisma.post.count({ where: { status: 'PUBLISHED' } }) };
    }
    return { list: [], total: 0 };
  }

  // ========== 微信文章 ==========
  async getWechatArticleImages(url: string) {
    const article = await this.prisma.wechatArticle.findFirst({ where: { url } });
    if (article?.images && Array.isArray(article.images)) {
      return { images: article.images };
    }
    return { images: [] };
  }

  // ========== 通讯录 ==========
  async getContacts(query: any) {
    return this.prisma.contact.findMany({ where: { isPublic: true } });
  }

  async getContactCategories(regionId: string) {
    return this.prisma.contactCategory.findMany({ where: { regionId } });
  }

  async getContactDetail(id: string) {
    return this.prisma.contact.findUnique({ where: { id } });
  }

  async createContact(userId: string, dto: any) {
    return this.prisma.contact.create({ data: dto });
  }

  async getMyContacts(userId: string, query: any) {
    return this.prisma.contact.findMany();
  }

  // ========== 富文本内容 ==========
  async getRichTextContents(query: any) {
    const { region_id, page = 1, limit = 10 } = query;
    return this.prisma.richTextContent.findMany({ where: { regionId: region_id, isShow: true }, skip: (page - 1) * limit, take: Number(limit) });
  }

  async getRichTextContent(id: string) {
    return this.prisma.richTextContent.findUnique({ where: { id } });
  }

  async getRegionContentTypes(regionId: string) {
    return this.prisma.richTextContent.groupBy({ by: ['type'], where: { regionId } });
  }

  // ========== 用户引导 ==========
  async getUserGuidancePages(regionId: string) {
    return this.prisma.userGuidancePage.findMany({ where: { regionId, isShow: true } });
  }

  async saveUserGuidanceInfo(userId: string, dto: any) {
    return this.prisma.userSettings.upsert({
      where: { userId },
      update: { privacyLevel: dto.step || 0 },
      create: { userId, privacyLevel: dto.step || 0 },
    });
  }

  // ========== 笔记设置 ==========
  async getNoteSettings(regionId: string) {
    return this.prisma.noteSettings.findUnique({ where: { regionId } });
  }

  // ========== 用户标签 ==========
  async getUserTags(regionId: string) {
    return this.prisma.userTag.findMany({ where: { userId: regionId } });
  }

  async updateUserTagRelation(userId: string, dto: any) {
    const { tagIds } = dto;
    if (Array.isArray(tagIds)) {
      await this.prisma.userTag.deleteMany({ where: { userId } });
      for (const tagId of tagIds) {
        const tag = await this.prisma.userTag.findUnique({ where: { id: tagId } });
        if (tag) {
          await this.prisma.userTag.create({
            data: { userId, name: tag.name, color: tag.color },
          });
        }
      }
    }
    return { success: true };
  }

  // ========== 区域自定义页面 ==========
  async getRegionCustomPages(regionId: string, query: any) {
    return this.prisma.regionCustomPage.findMany({ where: { regionId, isShow: true } });
  }

  // ========== 交友 ==========
  async getDatingConfig(regionId: string) {
    return this.prisma.datingConfig.findUnique({ where: { regionId } });
  }

  async getDatingProfile(userId: string) {
    return this.prisma.datingProfile.findUnique({ where: { userId } });
  }

  async getDatingProfileList(query: any) {
    return this.prisma.datingProfile.findMany();
  }

  async datingMatchAction(userId: string, dto: any) {
    const { targetId, action } = dto;
    return this.prisma.match.create({
      data: { userId, targetId, status: action === 'like' ? 'MATCHED' : 'REJECTED', matchType: 'interest' },
    });
  }

  async getDatingPackages(query: any) {
    return this.prisma.datingPackage.findMany();
  }

  async createDatingOrder(userId: string, dto: any) {
    return this.prisma.datingOrder.create({ data: { userId, packageId: dto.package_id, amount: dto.amount, orderNo: `DAT${Date.now()}` } });
  }

  // ========== 团购 ==========
  async getGroupBuyPackages(query: any) {
    return this.prisma.groupBuyPackage.findMany({ where: { status: 'active' } });
  }

  async createGroupBuyOrder(userId: string, dto: any) {
    return this.prisma.groupBuyOrder.create({ data: { userId, packageId: dto.package_id, amount: dto.amount, orderNo: `GB${Date.now()}` } });
  }

  async getGroupBuyOrder(orderSn: string) {
    return this.prisma.groupBuyOrder.findUnique({ where: { orderNo: orderSn } });
  }

  // ========== 社区 ==========
  async getCommunityDetail(communityId: string) {
    return this.prisma.community.findUnique({ where: { id: communityId } });
  }

  async createCommunityPayment(userId: string, dto: any) {
    return this.prisma.communityPayment.create({ data: { userId, communityId: dto.community_id, amount: dto.amount } });
  }

  // ========== 用户头衔 ==========
  async getUserTitles(query: any) {
    return this.prisma.userTitle.findMany();
  }

  async claimTitle(titleId: string, userId: string) {
    return this.prisma.userTitleRecord.upsert({ where: { userId_titleId: { userId, titleId } }, create: { userId, titleId }, update: {} });
  }

  async wearTitle(titleId: string, userId: string) {
    await this.prisma.userTitleRecord.updateMany({ where: { userId }, data: { isWearing: false } });
    return this.prisma.userTitleRecord.update({ where: { userId_titleId: { userId, titleId } }, data: { isWearing: true } });
  }

  async unwearTitle(userId: string) {
    await this.prisma.userTitleRecord.updateMany({ where: { userId }, data: { isWearing: false } });
    return { success: true };
  }

  async getUserTitlesById(userId: string) {
    return this.prisma.userTitleRecord.findMany({ where: { userId }, include: { title: true } });
  }

  async getCurrentTitle(userId: string) {
    return this.prisma.userTitleRecord.findFirst({ where: { userId, isWearing: true }, include: { title: true } });
  }

  async useRedeemCode(userId: string, dto: any) {
    const { code } = dto;
    const redeemCode = await this.prisma.userTitleRedeemCode.findUnique({ where: { code } });
    if (!redeemCode) throw new BadRequestException('兑换码不存在');
    if (redeemCode.usedBy) throw new BadRequestException('兑换码已被使用');
    if (redeemCode.expireAt && new Date(redeemCode.expireAt) < new Date()) throw new BadRequestException('兑换码已过期');
    await this.prisma.userTitleRedeemCode.update({
      where: { id: redeemCode.id },
      data: { usedBy: userId, usedAt: new Date() },
    });
    await this.prisma.userTitleRecord.create({
      data: { userId, titleId: redeemCode.titleId },
    });
    return { success: true };
  }

  async getRedeemCodeInfo(code: string) {
    return this.prisma.userTitleRedeemCode.findUnique({ where: { code } });
  }

  // ========== AI ==========
  async getAIConfig() {
    const config = await this.prisma.config.findUnique({ where: { key: 'ai_config' } });
    return config?.value || { enabled: false, model: '', apiKey: '', prompt: '' };
  }

  async generateAIComments(dto: any) {
    return { comments: [], message: 'AI评论生成功能尚未接入真实模型' };
  }
}
