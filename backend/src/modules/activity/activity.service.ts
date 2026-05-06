import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';

@Injectable()
export class ActivityService {
  constructor(private readonly prisma: PrismaService) {}

  async getActivities(query: any) {
    const { region_id, page = 1, size = 10, my_participation, club_id } = query;
    const where: any = {};
    if (region_id) where.regionId = region_id;
    if (club_id) where.clubId = club_id;
    return this.prisma.activity.findMany({ where, skip: (page - 1) * size, take: Number(size), orderBy: { startAt: 'asc' } });
  }

  async getActivityDetail(activityId: string) {
    const activity = await this.prisma.activity.findUnique({ where: { id: activityId } });
    if (!activity) throw new NotFoundException('活动不存在');
    return activity;
  }

  async getParticipants(activityId: string, query: any) {
    const { page = 1, size = 20 } = query;
    return this.prisma.activityJoin.findMany({ where: { activityId }, include: { user: { select: { id: true, nickname: true, avatar: true } } }, skip: (page - 1) * size, take: Number(size) });
  }

  async createOrderWithPayment(userId: string, dto: any) {
    return this.prisma.activityOrder.create({ data: { userId, activityId: dto.activity_id, amount: dto.amount, orderNo: `ACT${Date.now()}` } });
  }

  async getClubDetail(clubId: string) {
    const club = await this.prisma.activityClub.findUnique({ where: { id: clubId }, include: { members: { include: { user: { select: { id: true, nickname: true, avatar: true } } } } } });
    if (!club) throw new NotFoundException('社团不存在');
    return club;
  }

  async getClubMembers(clubId: string, query: any) {
    const { page = 1, size = 10 } = query;
    return this.prisma.activityClubMember.findMany({ where: { clubId }, include: { user: { select: { id: true, nickname: true, avatar: true } } }, skip: (page - 1) * size, take: Number(size) });
  }

  async getClubOrders(clubId: string, query: any) {
    const { page = 1, size = 10, status, user_id } = query;
    return this.prisma.activityOrder.findMany({ where: { activityId: clubId, ...(status && { status }), ...(user_id && { userId: user_id }) }, skip: (page - 1) * size, take: Number(size), orderBy: { createdAt: 'desc' } });
  }

  async getCompetitions(query: any) {
    const { page = 1, limit = 10, pageSize, region_id, status, keyword, sort_order } = query;
    const take = Number(pageSize || limit);
    const where: any = {};
    if (region_id) where.regionId = region_id;
    if (status) where.status = status;
    if (keyword) where.title = { contains: keyword };
    const orderBy = sort_order === 'hot' ? { photos: { _count: 'desc' as const } } : { sortOrder: 'asc' as const };
    const [list, total] = await Promise.all([
      this.prisma.activityCompetition.findMany({
        where,
        skip: (Number(page) - 1) * take,
        take,
        orderBy,
        include: { _count: { select: { photos: true } } },
      }),
      this.prisma.activityCompetition.count({ where }),
    ]);
    return { list: list.map((c) => ({ ...c, photos_count: c._count.photos })), total, page: Number(page), limit: take };
  }

  async createCompetition(userId: string, dto: any) {
    const item = await this.prisma.activityCompetition.create({
      data: {
        regionId: dto.region_id || dto.regionId,
        title: dto.title || dto.name,
        cover: dto.cover || dto.cover_url,
        description: dto.description,
        rules: dto.rules || {},
        startAt: dto.start_at || dto.startAt ? new Date(dto.start_at || dto.startAt) : undefined,
        endAt: dto.end_at || dto.endAt ? new Date(dto.end_at || dto.endAt) : undefined,
        status: dto.status || 'active',
        sortOrder: Number(dto.sort_order || dto.sortOrder || 0),
        createdBy: userId,
      },
    });
    return { success: true, data: item, ...item };
  }

  async getCompetitionInfo(competitionId: string) {
    const item = await this.prisma.activityCompetition.findUnique({
      where: { id: competitionId },
      include: { _count: { select: { photos: true } } },
    });
    if (!item) throw new NotFoundException('比赛不存在');
    return { ...item, photos_count: item._count.photos };
  }

  async submitPhoto(userId: string, dto: any) {
    const competitionId = dto.competition_id || dto.competitionId;
    const imageUrl = dto.image_url || dto.imageUrl || dto.url;
    if (!competitionId || !imageUrl) throw new BadRequestException('缺少 competitionId 或 imageUrl');
    const photo = await this.prisma.competitionPhoto.create({
      data: {
        competitionId,
        userId,
        title: dto.title,
        description: dto.description,
        imageUrl,
        thumbUrl: dto.thumb_url || dto.thumbUrl,
        status: dto.status || 'approved',
      },
      include: { user: { select: { id: true, nickname: true, avatar: true } } },
    });
    return { success: true, data: this.formatPhoto(photo), ...this.formatPhoto(photo) };
  }

  async getCompetitionPhotos(competitionId: string) {
    const list = await this.prisma.competitionPhoto.findMany({
      where: { competitionId, status: { not: 'deleted' } },
      include: { user: { select: { id: true, nickname: true, avatar: true } } },
      orderBy: [{ votesCount: 'desc' }, { createdAt: 'desc' }],
    });
    return { list: list.map((p) => this.formatPhoto(p)) };
  }

  async getPhotoDetail(photoId: string) {
    const photo = await this.prisma.competitionPhoto.findUnique({
      where: { id: photoId },
      include: { competition: true, user: { select: { id: true, nickname: true, avatar: true } } },
    });
    if (!photo) throw new NotFoundException('照片不存在');
    return this.formatPhoto(photo);
  }

  async voteForPhoto(photoId: string, userId: string) {
    const photo = await this.prisma.competitionPhoto.findUnique({ where: { id: photoId } });
    if (!photo) throw new NotFoundException('照片不存在');
    const existing = await this.prisma.competitionPhotoVote.findUnique({
      where: { photoId_userId: { photoId, userId } },
    });
    if (existing) {
      return { message: '你已经投过票了', success: false, votes_count: photo.votesCount };
    }
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const userVotesToday = await this.prisma.competitionPhotoVote.count({
      where: { userId, createdAt: { gte: today } },
    });
    const dailyLimit = 10;
    if (userVotesToday >= dailyLimit) {
      return { message: '今日投票次数已用完', success: false, votes_count: photo.votesCount, remaining_votes: 0 };
    }
    await this.prisma.$transaction([
      this.prisma.competitionPhotoVote.create({ data: { photoId, userId } }),
      this.prisma.competitionPhoto.update({ where: { id: photoId }, data: { votesCount: { increment: 1 } } }),
    ]);
    const userTotalVotes = await this.prisma.competitionPhotoVote.count({ where: { userId } });
    return {
      message: '投票成功',
      success: true,
      votes_count: photo.votesCount + 1,
      user_votes_today: userVotesToday + 1,
      user_total_votes: userTotalVotes,
      remaining_votes: Math.max(0, dailyLimit - userVotesToday - 1),
    };
  }

  async ratePhoto(photoId: string, userId: string, dto: any) {
    const rating = Number(dto.rating || dto.score);
    if (!rating || rating < 1 || rating > 5) throw new BadRequestException('评分必须在 1-5 之间');
    const existing = await this.prisma.competitionPhotoRating.findUnique({
      where: { photoId_userId: { photoId, userId } },
    });
    const result = await this.prisma.$transaction(async (tx) => {
      const item = existing
        ? await tx.competitionPhotoRating.update({ where: { id: existing.id }, data: { rating, content: dto.content } })
        : await tx.competitionPhotoRating.create({ data: { photoId, userId, rating, content: dto.content } });
      await tx.competitionPhoto.update({
        where: { id: photoId },
        data: {
          ratingTotal: { increment: existing ? rating - existing.rating : rating },
          ratingsCount: existing ? undefined : { increment: 1 },
        },
      });
      return item;
    });
    return { success: true, data: result };
  }

  async deleteRating(ratingId: string, userId: string) {
    const rating = await this.prisma.competitionPhotoRating.findUnique({ where: { id: ratingId } });
    if (!rating || rating.userId !== userId) throw new NotFoundException('评分不存在');
    await this.prisma.$transaction([
      this.prisma.competitionPhotoRating.delete({ where: { id: ratingId } }),
      this.prisma.competitionPhoto.update({
        where: { id: rating.photoId },
        data: { ratingTotal: { decrement: rating.rating }, ratingsCount: { decrement: 1 } },
      }),
    ]);
    return { success: true };
  }

  async getPhotoRatings(photoId: string, query: any) {
    const { page = 1, pageSize = 10 } = query;
    const [list, total] = await Promise.all([
      this.prisma.competitionPhotoRating.findMany({
        where: { photoId },
        include: { user: { select: { id: true, nickname: true, avatar: true } } },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.competitionPhotoRating.count({ where: { photoId } }),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  private formatPhoto(photo: any) {
    const avgRating = photo.ratingsCount > 0 ? Number((photo.ratingTotal / photo.ratingsCount).toFixed(1)) : 0;
    return {
      ...photo,
      image_url: photo.imageUrl,
      thumb_url: photo.thumbUrl,
      votes_count: photo.votesCount,
      ratings_count: photo.ratingsCount,
      avg_rating: avgRating,
      user: photo.user,
    };
  }
}
