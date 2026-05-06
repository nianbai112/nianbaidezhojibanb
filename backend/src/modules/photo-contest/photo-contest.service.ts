import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';

@Injectable()
export class PhotoContestService {
  constructor(private readonly prisma: PrismaService) {}

  // ==================== Contest CRUD ====================

  async getContests(query: any) {
    const { page = 1, limit = 20, regionId, status, keyword } = query;
    const where: any = {};
    if (regionId) where.regionId = regionId;
    if (status) where.status = status;
    if (keyword) where.title = { contains: keyword };

    const [list, total] = await Promise.all([
      this.prisma.photoContest.findMany({
        where,
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { entries: true } } },
      }),
      this.prisma.photoContest.count({ where }),
    ]);
    return { list, total, page: Number(page), pageSize: Number(limit) };
  }

  async getContestDetail(id: string) {
    const contest = await this.prisma.photoContest.findUnique({
      where: { id },
      include: {
        _count: { select: { entries: true, winners: true, votes: true } },
      },
    });
    if (!contest) throw new NotFoundException('评选项目不存在');
    return contest;
  }

  async createContest(dto: any) {
    if (dto.endAt && dto.startAt && new Date(dto.endAt) <= new Date(dto.startAt)) {
      throw new BadRequestException('征集截止时间必须晚于开始时间');
    }
    return this.prisma.photoContest.create({ data: dto });
  }

  async updateContest(id: string, dto: any) {
    const existing = await this.prisma.photoContest.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('评选项目不存在');
    return this.prisma.photoContest.update({ where: { id }, data: dto });
  }

  async deleteContest(id: string) {
    const count = await this.prisma.photoContestEntry.count({ where: { contestId: id } });
    if (count > 0) throw new BadRequestException('该评选下存在参赛作品，无法删除');
    return this.prisma.photoContest.delete({ where: { id } });
  }

  // ==================== Entry Management ====================

  async getEntries(query: any) {
    const { page = 1, limit = 20, contestId, status, keyword, userId } = query;
    const where: any = {};
    if (contestId) where.contestId = contestId;
    if (status) where.status = status;
    if (userId) where.userId = userId;
    if (keyword) {
      where.OR = [
        { title: { contains: keyword } },
        { description: { contains: keyword } },
        { user: { nickname: { contains: keyword } } },
      ];
    }

    const [list, total] = await Promise.all([
      this.prisma.photoContestEntry.findMany({
        where,
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, nickname: true, avatar: true } },
          contest: { select: { id: true, title: true } },
          _count: { select: { votes: true } },
        },
      }),
      this.prisma.photoContestEntry.count({ where }),
    ]);
    return { list, total, page: Number(page), pageSize: Number(limit) };
  }

  async getPendingEntries(query: any) {
    return this.getEntries({ ...query, status: 'pending' });
  }

  async auditEntry(id: string, dto: { status: string; rejectReason?: string }) {
    if (!['approved', 'rejected'].includes(dto.status)) {
      throw new BadRequestException('status 只能为 approved 或 rejected');
    }
    const data: any = { status: dto.status };
    if (dto.status === 'approved') {
      data.approvedAt = new Date();
    }
    if (dto.status === 'rejected') {
      data.rejectReason = dto.rejectReason || '';
    }
    return this.prisma.photoContestEntry.update({ where: { id }, data });
  }

  async batchAuditEntries(dto: { ids: string[]; status: string; rejectReason?: string }) {
    if (!['approved', 'rejected'].includes(dto.status)) {
      throw new BadRequestException('status 只能为 approved 或 rejected');
    }
    const data: any = { status: dto.status };
    if (dto.status === 'approved') data.approvedAt = new Date();
    if (dto.status === 'rejected') data.rejectReason = dto.rejectReason || '';

    let success = 0;
    let failed = 0;
    for (const id of dto.ids) {
      try {
        await this.prisma.photoContestEntry.update({ where: { id }, data });
        success++;
      } catch {
        failed++;
      }
    }
    return { success, failed };
  }

  async deleteEntry(id: string) {
    return this.prisma.photoContestEntry.delete({ where: { id } });
  }

  // ==================== Vote Statistics ====================

  async getVoteStats(contestId: string) {
    const contest = await this.prisma.photoContest.findUnique({ where: { id: contestId } });
    if (!contest) throw new NotFoundException('评选项目不存在');

    const entries = await this.prisma.photoContestEntry.findMany({
      where: { contestId, status: 'approved' },
      orderBy: { voteCount: 'desc' },
      include: {
        user: { select: { id: true, nickname: true, avatar: true } },
        ratings: { select: { rating: true } },
      },
    });

    const totalVotes = entries.reduce((sum, e) => sum + e.voteCount, 0);
    const entriesWithAvg = entries.map((e) => ({
      ...e,
      ratingsAvg: e.ratings.length ? e.ratings.reduce((s, r) => s + r.rating, 0) / e.ratings.length : 0,
    }));

    return { contest, entries: entriesWithAvg, totalVotes };
  }

  // ==================== Rating Management ====================

  async getRatings(query: any) {
    const { page = 1, limit = 20, contestId, entryId } = query;
    const where: any = {};
    if (entryId) {
      where.entryId = entryId;
    } else if (contestId) {
      where.entry = { contestId };
    }

    const [list, total] = await Promise.all([
      this.prisma.photoContestRating.findMany({
        where,
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, nickname: true, avatar: true } },
          entry: { select: { id: true, title: true, imageUrl: true } },
        },
      }),
      this.prisma.photoContestRating.count({ where }),
    ]);
    return { list, total, page: Number(page), pageSize: Number(limit) };
  }

  async auditRating(id: string, dto: { status: string }) {
    if (!['approved', 'hidden'].includes(dto.status)) {
      throw new BadRequestException('status 只能为 approved 或 hidden');
    }
    return this.prisma.photoContestRating.update({ where: { id }, data: { status: dto.status } });
  }

  // ==================== Winners Management ====================

  async getWinners(contestId: string) {
    return this.prisma.photoContestWinner.findMany({
      where: { competitionId: contestId },
      orderBy: { winnerRank: 'asc' },
      include: {
        entry: { select: { id: true, title: true, imageUrl: true, voteCount: true } },
      },
    });
  }

  async createWinner(dto: any) {
    const entry = await this.prisma.photoContestEntry.findUnique({
      where: { id: dto.entryId },
    });
    if (!entry) throw new BadRequestException('参赛作品不存在');
    if (entry.contestId !== dto.competitionId) {
      throw new BadRequestException('作品不属于该评选');
    }
    return this.prisma.photoContestWinner.create({ data: dto });
  }

  async updateWinner(id: string, dto: any) {
    return this.prisma.photoContestWinner.update({ where: { id }, data: dto });
  }

  async deleteWinner(id: string) {
    return this.prisma.photoContestWinner.delete({ where: { id } });
  }

  // ==================== Region Settings ====================

  async getRegionSetting(regionId: string) {
    if (!regionId) {
      return {
        enableContest: true,
        maxCompetitionsPerMonth: null,
        maxPhotosPerUser: 3,
        requirePhotoApproval: true,
        photoAutoApproval: false,
        maxVotesPerUserDaily: 10,
        maxVotesPerCompetition: null,
        maxVotesPerPhoto: 1,
        allowSelfVoting: false,
        votingIntervalHours: null,
        watermarkEnabled: false,
        watermarkText: null,
        watermarkPosition: 'bottom-right',
        enableRating: true,
        enableCommenting: true,
        adminNotificationEmail: null,
        isDefault: true,
      };
    }

    let setting = await this.prisma.photoContestRegionSetting.findUnique({
      where: { regionId },
    });
    if (!setting) {
      setting = await this.prisma.photoContestRegionSetting.create({
        data: { regionId },
      });
    }
    return setting;
  }

  async updateRegionSetting(regionId: string, dto: any) {
    if (!regionId) throw new BadRequestException('regionId 不能为空');
    return this.prisma.photoContestRegionSetting.upsert({
      where: { regionId },
      update: dto,
      create: { regionId, ...dto },
    });
  }

  // ==================== Dashboard Stats ====================

  async getDashboardStats(regionId?: string) {
    const where = regionId ? { regionId } : {};
    const [totalContests, activeContests, pendingEntries, totalVotes] = await Promise.all([
      this.prisma.photoContest.count({ where }),
      this.prisma.photoContest.count({ where: { ...where, status: 'active' } }),
      this.prisma.photoContestEntry.count({ where: { contest: where, status: 'pending' } }),
      this.prisma.photoContestVote.count({
        where: { competition: where },
      }),
    ]);
    return { totalContests, activeContests, pendingEntries, totalVotes };
  }
}
