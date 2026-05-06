import { Injectable, NotFoundException, BadRequestException, NotImplementedException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { RedisService } from '../../common/services/redis.service';
import {
  UpdateProfileDto, UpdateSettingsDto, StudentVerifyDto, ListQueryDto,
} from './dto/user.dto';

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true, settings: true, studentVerify: true, wallet: true },
    });
    if (!user) throw new NotFoundException('用户不存在');
    return user;
  }

  async getNicknameAvatar(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, nickname: true, avatar: true },
    });
    return user;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.nickname && { nickname: dto.nickname }),
        ...(dto.avatar && { avatar: dto.avatar }),
      },
    });
    await this.prisma.userProfile.update({
      where: { userId },
      data: {
        ...(dto.gender && { gender: dto.gender }),
        ...(dto.bio !== undefined && { bio: dto.bio }),
        ...(dto.school !== undefined && { school: dto.school }),
        ...(dto.major !== undefined && { major: dto.major }),
        ...(dto.grade !== undefined && { grade: dto.grade }),
        ...(dto.dormitory !== undefined && { dormitory: dto.dormitory }),
      },
    });
    return this.getProfile(userId);
  }

  async getPrivacySettings(userId: string) {
    return this.prisma.userSettings.findUnique({ where: { userId } });
  }

  async updatePrivacySettings(userId: string, dto: any) {
    return this.prisma.userSettings.update({ where: { userId }, data: dto });
  }

  async getBalanceDetails(userId: string, query: ListQueryDto) {
    const { page = 1, pageSize = 20 } = query;
    return this.prisma.walletTransaction.findMany({
      where: { userId },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    });
  }

  async applyWithdraw(userId: string, dto: any) {
    return this.prisma.withdraw.create({ data: { userId, ...dto } });
  }

  async getPendingWithdrawTotal(userId: string) {
    const result = await this.prisma.withdraw.aggregate({
      where: { userId, status: { in: ['PENDING', 'PROCESSING'] } },
      _sum: { amount: true },
    });
    return { pendingTotal: result._sum.amount || 0 };
  }

  async getBanStatus(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { status: true } });
    return { isBanned: user?.status === 'BANNED', status: user?.status };
  }

  async payUnban(userId: string) {
    return this.prisma.user.update({ where: { id: userId }, data: { status: 'ACTIVE' } });
  }

  async getSelfUnbanConfig() {
    return { enabled: true, price: 0 };
  }

  async studentVerify(userId: string, dto: StudentVerifyDto) {
    const data = this.normalizeStudentVerifyDto(dto);
    const exists = await this.prisma.studentVerify.findUnique({ where: { userId } });
    if (exists && exists.status === 'APPROVED') throw new BadRequestException('已认证');
    const record = exists
      ? await this.prisma.studentVerify.update({ where: { userId }, data: { ...data, status: 'PENDING' } })
      : await this.prisma.studentVerify.create({ data: { userId, ...data } });

    await this.prisma.userProfile.upsert({
      where: { userId },
      update: {
        school: data.schoolName,
        ...(data.major && { major: data.major }),
        ...(data.grade && { grade: data.grade }),
      },
      create: {
        userId,
        school: data.schoolName,
        major: data.major,
        grade: data.grade,
      },
    });

    return { success: true, data: this.toMiniStudentVerify(record) };
  }

  async getStudentVerifyInfo(userId: string) {
    const record = await this.prisma.studentVerify.findUnique({ where: { userId } });
    return { data: record ? this.toMiniStudentVerify(record) : null };
  }

  async getUniversities(name: string, page: number, size: number) {
    const currentPage = Math.max(Number(page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(size) || 20, 1), 100);
    const keyword = String(name || '').trim().toLowerCase();
    const filtered = this.universities.filter((school) => {
      if (!keyword) return true;
      return [
        school.学校名称,
        school.所在地,
        school.主管部门,
        school.办学层次,
      ].some((value) => String(value || '').toLowerCase().includes(keyword));
    });
    const start = (currentPage - 1) * pageSize;
    return {
      data: filtered.slice(start, start + pageSize),
      total: filtered.length,
      page: currentPage,
      size: pageSize,
    };
  }

  private normalizeStudentVerifyDto(dto: StudentVerifyDto) {
    const realName = String(dto.realName || dto.name || '').trim();
    const studentId = String(dto.studentId || dto.student_id || '').trim();
    const schoolName = String(dto.schoolName || dto.university || '').trim();
    const cardImage = String(dto.cardImage || dto.photo_url || '').trim();
    const major = dto.major?.trim();
    const grade = dto.grade?.trim();

    if (!realName) throw new BadRequestException('请输入姓名');
    if (!studentId) throw new BadRequestException('请输入学号');
    if (!schoolName) throw new BadRequestException('请选择学校');
    if (!cardImage) throw new BadRequestException('请上传学生证照片');

    return { realName, studentId, schoolName, major, grade, cardImage };
  }

  private toMiniStudentVerify(record: any) {
    return {
      id: record.id,
      student_id: record.studentId,
      name: record.realName,
      university: record.schoolName,
      major: record.major || '',
      grade: record.grade || '',
      photo_url: record.cardImage || '',
      verification_status: record.status?.toLowerCase() || 'none',
      rejection_reason: record.remark || '',
      created_at: record.createdAt,
      updated_at: record.updatedAt,
      verified_at: record.verifiedAt,
    };
  }

  private readonly universities = [
    { 序号: 1, 学校名称: '清华大学', 学校标识码: '4111010003', 主管部门: '教育部', 所在地: '北京市', 办学层次: '本科' },
    { 序号: 2, 学校名称: '北京大学', 学校标识码: '4111010001', 主管部门: '教育部', 所在地: '北京市', 办学层次: '本科' },
    { 序号: 3, 学校名称: '中国人民大学', 学校标识码: '4111010002', 主管部门: '教育部', 所在地: '北京市', 办学层次: '本科' },
    { 序号: 4, 学校名称: '北京航空航天大学', 学校标识码: '4111010006', 主管部门: '工业和信息化部', 所在地: '北京市', 办学层次: '本科' },
    { 序号: 5, 学校名称: '北京理工大学', 学校标识码: '4111010007', 主管部门: '工业和信息化部', 所在地: '北京市', 办学层次: '本科' },
    { 序号: 6, 学校名称: '中国农业大学', 学校标识码: '4111010019', 主管部门: '教育部', 所在地: '北京市', 办学层次: '本科' },
    { 序号: 7, 学校名称: '北京师范大学', 学校标识码: '4111010027', 主管部门: '教育部', 所在地: '北京市', 办学层次: '本科' },
    { 序号: 8, 学校名称: '中央民族大学', 学校标识码: '4111010052', 主管部门: '国家民委', 所在地: '北京市', 办学层次: '本科' },
    { 序号: 9, 学校名称: '南开大学', 学校标识码: '4112010055', 主管部门: '教育部', 所在地: '天津市', 办学层次: '本科' },
    { 序号: 10, 学校名称: '天津大学', 学校标识码: '4112010056', 主管部门: '教育部', 所在地: '天津市', 办学层次: '本科' },
    { 序号: 11, 学校名称: '复旦大学', 学校标识码: '4131010246', 主管部门: '教育部', 所在地: '上海市', 办学层次: '本科' },
    { 序号: 12, 学校名称: '同济大学', 学校标识码: '4131010247', 主管部门: '教育部', 所在地: '上海市', 办学层次: '本科' },
    { 序号: 13, 学校名称: '上海交通大学', 学校标识码: '4131010248', 主管部门: '教育部', 所在地: '上海市', 办学层次: '本科' },
    { 序号: 14, 学校名称: '华东师范大学', 学校标识码: '4131010269', 主管部门: '教育部', 所在地: '上海市', 办学层次: '本科' },
    { 序号: 15, 学校名称: '南京大学', 学校标识码: '4132010284', 主管部门: '教育部', 所在地: '南京市', 办学层次: '本科' },
    { 序号: 16, 学校名称: '东南大学', 学校标识码: '4132010286', 主管部门: '教育部', 所在地: '南京市', 办学层次: '本科' },
    { 序号: 17, 学校名称: '浙江大学', 学校标识码: '4133010335', 主管部门: '教育部', 所在地: '杭州市', 办学层次: '本科' },
    { 序号: 18, 学校名称: '中国科学技术大学', 学校标识码: '4134010358', 主管部门: '中国科学院', 所在地: '合肥市', 办学层次: '本科' },
    { 序号: 19, 学校名称: '厦门大学', 学校标识码: '4135010384', 主管部门: '教育部', 所在地: '厦门市', 办学层次: '本科' },
    { 序号: 20, 学校名称: '山东大学', 学校标识码: '4137010422', 主管部门: '教育部', 所在地: '济南市', 办学层次: '本科' },
    { 序号: 21, 学校名称: '中国海洋大学', 学校标识码: '4137010423', 主管部门: '教育部', 所在地: '青岛市', 办学层次: '本科' },
    { 序号: 22, 学校名称: '武汉大学', 学校标识码: '4142010486', 主管部门: '教育部', 所在地: '武汉市', 办学层次: '本科' },
    { 序号: 23, 学校名称: '华中科技大学', 学校标识码: '4142010487', 主管部门: '教育部', 所在地: '武汉市', 办学层次: '本科' },
    { 序号: 24, 学校名称: '中南大学', 学校标识码: '4143010533', 主管部门: '教育部', 所在地: '长沙市', 办学层次: '本科' },
    { 序号: 25, 学校名称: '中山大学', 学校标识码: '4144010558', 主管部门: '教育部', 所在地: '广州市', 办学层次: '本科' },
    { 序号: 26, 学校名称: '华南理工大学', 学校标识码: '4144010561', 主管部门: '教育部', 所在地: '广州市', 办学层次: '本科' },
    { 序号: 27, 学校名称: '四川大学', 学校标识码: '4151010610', 主管部门: '教育部', 所在地: '成都市', 办学层次: '本科' },
    { 序号: 28, 学校名称: '电子科技大学', 学校标识码: '4151010614', 主管部门: '教育部', 所在地: '成都市', 办学层次: '本科' },
    { 序号: 29, 学校名称: '重庆大学', 学校标识码: '4150010611', 主管部门: '教育部', 所在地: '重庆市', 办学层次: '本科' },
    { 序号: 30, 学校名称: '西南大学', 学校标识码: '4150010635', 主管部门: '教育部', 所在地: '重庆市', 办学层次: '本科' },
    { 序号: 31, 学校名称: '重庆邮电大学', 学校标识码: '4150010617', 主管部门: '重庆市', 所在地: '重庆市', 办学层次: '本科' },
    { 序号: 32, 学校名称: '重庆交通大学', 学校标识码: '4150010618', 主管部门: '重庆市', 所在地: '重庆市', 办学层次: '本科' },
    { 序号: 33, 学校名称: '重庆医科大学', 学校标识码: '4150010631', 主管部门: '重庆市', 所在地: '重庆市', 办学层次: '本科' },
    { 序号: 34, 学校名称: '重庆师范大学', 学校标识码: '4150010637', 主管部门: '重庆市', 所在地: '重庆市', 办学层次: '本科' },
    { 序号: 35, 学校名称: '重庆工商大学', 学校标识码: '4150011799', 主管部门: '重庆市', 所在地: '重庆市', 办学层次: '本科' },
    { 序号: 36, 学校名称: '西南政法大学', 学校标识码: '4150010652', 主管部门: '重庆市', 所在地: '重庆市', 办学层次: '本科' },
    { 序号: 37, 学校名称: '西安交通大学', 学校标识码: '4161010698', 主管部门: '教育部', 所在地: '西安市', 办学层次: '本科' },
    { 序号: 38, 学校名称: '西北工业大学', 学校标识码: '4161010699', 主管部门: '工业和信息化部', 所在地: '西安市', 办学层次: '本科' },
    { 序号: 39, 学校名称: '兰州大学', 学校标识码: '4162010730', 主管部门: '教育部', 所在地: '兰州市', 办学层次: '本科' },
    { 序号: 40, 学校名称: '哈尔滨工业大学', 学校标识码: '4123010213', 主管部门: '工业和信息化部', 所在地: '哈尔滨市', 办学层次: '本科' },
  ];

  async followUser(userId: string, targetId: string) {
    if (userId === targetId) throw new BadRequestException('不能关注自己');
    await this.prisma.follow.upsert({
      where: { followerId_followingId: { followerId: userId, followingId: targetId } },
      create: { followerId: userId, followingId: targetId },
      update: {},
    });
    return { success: true };
  }

  async unfollowUser(userId: string, targetId: string) {
    await this.prisma.follow.deleteMany({ where: { followerId: userId, followingId: targetId } });
    return { success: true };
  }

  async getFollowers(query: any, userId?: string) {
    const { page = 1, limit = 20, user_id } = query;
    const targetId = user_id || userId;
    const [list, total] = await Promise.all([
      this.prisma.follow.findMany({
        where: { followingId: targetId },
        include: { follower: { select: { id: true, nickname: true, avatar: true } } },
        skip: (page - 1) * limit,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.follow.count({ where: { followingId: targetId } }),
    ]);
    return { list, total, page, limit };
  }

  async getFollowings(query: any, userId?: string) {
    const { page = 1, limit = 20, user_id } = query;
    const targetId = user_id || userId;
    const [list, total] = await Promise.all([
      this.prisma.follow.findMany({
        where: { followerId: targetId },
        include: { following: { select: { id: true, nickname: true, avatar: true } } },
        skip: (page - 1) * limit,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.follow.count({ where: { followerId: targetId } }),
    ]);
    return { list, total, page, limit };
  }

  async getUserViews(userId: string, query: ListQueryDto) {
    const { page = 1, pageSize = 20 } = query;
    return this.prisma.browseHistory.findMany({
      where: { userId },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    });
  }

  async clearUserViews(userId: string) {
    await this.prisma.browseHistory.deleteMany({ where: { userId } });
    return { success: true };
  }

  async getRegionTestimonials(regionId: string) {
    return this.prisma.user.findMany({
      where: { status: 'ACTIVE' },
      take: 10,
      orderBy: { createdAt: 'desc' },
      select: { id: true, nickname: true, avatar: true },
    });
  }
}
