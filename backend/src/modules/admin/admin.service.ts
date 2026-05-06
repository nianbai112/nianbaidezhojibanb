import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  NotImplementedException,
  Inject,
  forwardRef,
} from "@nestjs/common";
import { PrismaService } from "../../common/services/prisma.service";
import { RedisService } from "../../common/services/redis.service";
import { PaymentService } from "../payment/payment.service";
import * as bcrypt from "bcrypt";
import * as crypto from "crypto";

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    @Inject(forwardRef(() => PaymentService))
    private readonly paymentService?: PaymentService,
  ) {}

  // ==================== 操作日志 ====================
  private async logOperation(
    accountId: string,
    action: string,
    module: string,
    targetId?: string,
    targetType?: string,
    detail?: any,
    ip?: string,
  ) {
    try {
      await this.prisma.adminOperationLog.create({
        data: {
          accountId,
          action,
          module,
          targetId: targetId || null,
          targetType: targetType || null,
          detail: detail
            ? typeof detail === "string"
              ? { message: detail }
              : detail
            : null,
          ip: ip || null,
        },
      });
    } catch (e: any) {
      // 日志写入失败不影响主流程
    }
  }

  // ==================== 仪表盘 ====================
  async dashboard() {
    const today = this.getTodayStart();
    const yesterday = this.getYesterdayStart();
    const weekAgo = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000);

    const [
      userCount,
      todayUsers,
      yesterdayUsers,
      postCount,
      commentCount,
      pendingPosts,
      merchantCount,
      activeMerchantCount,
      pendingMerchants,
      pendingWithdraws,
      pendingReports,
      pendingRefunds,
      pendingCerts,
      todayOrders,
      yesterdayOrders,
      totalOrders,
      todayPaidAmount,
      yesterdayPaidAmount,
      totalGmv,
      regionCount,
      dauEstimate,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { createdAt: { gte: today } } }),
      this.prisma.user.count({
        where: { createdAt: { gte: yesterday, lt: today } },
      }),
      this.prisma.post.count(),
      this.prisma.comment.count({ where: { deletedAt: null } }),
      this.prisma.post.count({ where: { auditStatus: "pending" } }),
      this.prisma.merchant.count(),
      this.prisma.merchant.count({ where: { status: "approved" } }),
      this.prisma.merchant.count({ where: { status: "pending" } }),
      this.prisma.withdraw.count({ where: { status: "PENDING" } }),
      this.prisma.report.count({ where: { status: "pending" } }),
      this.prisma.refund.count({
        where: { status: "pending" },
      }),
      this.prisma.studentVerify.count({ where: { status: "PENDING" } }),
      this.prisma.order.count({ where: { createdAt: { gte: today } } }),
      this.prisma.order.count({
        where: { createdAt: { gte: yesterday, lt: today } },
      }),
      this.prisma.order.count(),
      this.prisma.paymentOrder.aggregate({
        where: { createdAt: { gte: today }, status: "paid" },
        _sum: { amount: true },
      }),
      this.prisma.paymentOrder.aggregate({
        where: { createdAt: { gte: yesterday, lt: today }, status: "paid" },
        _sum: { amount: true },
      }),
      this.prisma.paymentOrder.aggregate({
        where: { status: "paid" },
        _sum: { amount: true },
      }),
      this.prisma.region.count(),
      // DAU 估算：近7天有登录行为的用户（无精确登录表时用创建/活跃替代）
      this.prisma.user.count({
        where: { lastLoginAt: { gte: weekAgo } },
      }),
    ]);

    const todayGmv = Number(todayPaidAmount._sum.amount || 0);
    const yesterdayGmv = Number(yesterdayPaidAmount._sum.amount || 0);
    const gmvGrowth =
      yesterdayGmv > 0
        ? Math.round(((todayGmv - yesterdayGmv) / yesterdayGmv) * 10000) / 100
        : 0;
    const totalGmvVal = Number(totalGmv._sum.amount || 0);

    return {
      todayGmv: Math.round(todayGmv * 100),
      yesterdayGmv: Math.round(yesterdayGmv * 100),
      gmvGrowth,
      totalGmv: Math.round(totalGmvVal * 100),
      todayOrders,
      yesterdayOrders,
      totalOrders,
      orderGrowth:
        yesterdayOrders > 0
          ? Math.round(
              ((todayOrders - yesterdayOrders) / yesterdayOrders) * 100,
            )
          : 0,
      totalUsers: userCount,
      todayNewUsers: todayUsers,
      userGrowth:
        yesterdayUsers > 0
          ? Math.round(((todayUsers - yesterdayUsers) / yesterdayUsers) * 100)
          : 0,
      dauEstimate,
      postCount,
      commentCount,
      merchantCount,
      activeMerchantCount,
      regionCount,
      pendingPosts,
      pendingMerchants,
      pendingWithdraws,
      pendingReports,
      pendingRefunds,
      pendingCerts,
    };
  }

  /** 平台仪表盘近7天趋势 */
  async dashboardTrends() {
    const days = 7;
    const result = [] as Array<{
      date: string;
      users: number;
      orders: number;
      gmv: number;
      posts: number;
    }>;

    for (let i = days - 1; i >= 0; i--) {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() - i);
      const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
      const dateLabel = `${String(start.getMonth() + 1).padStart(2, '0')}/${String(start.getDate()).padStart(2, '0')}`;

      const [
        users,
        orders,
        gmvAgg,
        posts,
      ] = await Promise.all([
        this.prisma.user.count({ where: { createdAt: { gte: start, lt: end } } }),
        this.prisma.order.count({ where: { createdAt: { gte: start, lt: end } } }),
        this.prisma.paymentOrder.aggregate({
          where: { createdAt: { gte: start, lt: end }, status: "paid" },
          _sum: { amount: true },
        }),
        this.prisma.post.count({ where: { createdAt: { gte: start, lt: end } } }),
      ]);

      result.push({
        date: dateLabel,
        users,
        orders,
        gmv: Math.round(Number(gmvAgg._sum.amount || 0) * 100),
        posts,
      });
    }

    return result;
  }

  /** 平台各区域/学校数据概览 */
  async dashboardRegions() {
    const regions = await this.prisma.region.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    const list = await Promise.all(
      regions.map(async (r) => {
        const [
          userCount,
          postCount,
          merchantCount,
          orderCount,
        ] = await Promise.all([
          this.prisma.user.count({ where: { addresses: { some: { regionId: r.id } } } }),
          this.prisma.post.count({ where: { regionId: r.id } }),
          this.prisma.merchant.count({ where: { regionId: r.id } }),
          this.prisma.order.count({ where: { merchant: { regionId: r.id } } }),
        ]);
        return {
          id: r.id,
          name: r.name,
          code: r.code,
          isOpen: r.isOpen,
          userCount,
          postCount,
          merchantCount,
          orderCount,
          createdAt: r.createdAt,
        };
      }),
    );

    return { list };
  }

  // ==================== 用户管理 ====================
  async users(query: any) {
    const {
      keyword,
      status,
      studentCertStatus,
      regionId,
      page = 1,
      pageSize = 20,
    } = query;
    const where: any = {};
    if (keyword)
      where.OR = [
        { nickname: { contains: keyword } },
        { phone: { contains: keyword } },
      ];
    if (status)
      where.status =
        status === "active"
          ? "ACTIVE"
          : status === "banned"
            ? "BANNED"
            : status.toUpperCase();
    if (studentCertStatus) {
      where.studentVerify =
        studentCertStatus === "none"
          ? null
          : { status: studentCertStatus.toUpperCase() };
    }

    const [list, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: {
          profile: true,
          studentVerify: true,
          wallet: true,
          _count: { select: { posts: true, follows: true, followers: true } },
        },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      list: list.map((u) => ({
        id: u.id,
        nickname: u.nickname,
        avatar: u.avatar,
        phone: u.phone,
        gender: u.profile?.gender,
        birthday: u.profile?.birthday,
        school: u.studentVerify?.schoolName || u.profile?.school,
        realName: u.studentVerify?.realName,
        studentId: u.studentVerify?.studentId,
        major: u.studentVerify?.major || u.profile?.major,
        grade: u.studentVerify?.grade || u.profile?.grade,
        studentCertStatus: u.studentVerify?.status?.toLowerCase() || "none",
        studentCardImage: u.studentVerify?.cardImage,
        balance: Math.round(Number(u.wallet?.balance || 0) * 100),
        points: 0,
        status:
          u.status === "ACTIVE"
            ? "active"
            : u.status === "BANNED"
              ? "banned"
              : "disabled",
        postCount: u._count.posts,
        followCount: u._count.follows,
        fansCount: u._count.followers,
        createdAt: u.createdAt,
        lastLoginAt: u.lastLoginAt,
      })),
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  async userDetail(id: string) {
    const u = await this.prisma.user.findUnique({
      where: { id },
      include: {
        profile: true,
        studentVerify: true,
        wallet: true,
        _count: { select: { posts: true, follows: true, followers: true } },
      },
    });
    if (!u) throw new NotFoundException("用户不存在");
    return {
      id: u.id,
      nickname: u.nickname,
      avatar: u.avatar,
      phone: u.phone,
      gender: u.profile?.gender,
      birthday: u.profile?.birthday,
      school: u.studentVerify?.schoolName || u.profile?.school,
      realName: u.studentVerify?.realName,
      studentId: u.studentVerify?.studentId,
      major: u.studentVerify?.major || u.profile?.major,
      grade: u.studentVerify?.grade || u.profile?.grade,
      studentCertStatus: u.studentVerify?.status?.toLowerCase() || "none",
      studentCardImage: u.studentVerify?.cardImage,
      balance: Math.round(Number(u.wallet?.balance || 0) * 100),
      points: 0,
      status:
        u.status === "ACTIVE"
          ? "active"
          : u.status === "BANNED"
            ? "banned"
            : "disabled",
      postCount: u._count.posts,
      followCount: u._count.follows,
      fansCount: u._count.followers,
      bio: u.profile?.bio,
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt,
    };
  }

  async banUser(
    id: string,
    dto: { banned: boolean; reason?: string },
    operatorId?: string,
    ip?: string,
  ) {
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u) throw new NotFoundException("用户不存在");
    await this.prisma.user.update({
      where: { id },
      data: { status: dto.banned ? "BANNED" : "ACTIVE" },
    });
    await this.logOperation(
      operatorId || "",
      dto.banned ? "ban" : "unban",
      "user",
      id,
      "user",
      { reason: dto.reason },
      ip,
    );
    await this.prisma.auditLog.create({
      data: {
        userId: id,
        action: dto.banned ? "BAN" : "UNBAN",
        module: "user",
        targetId: id,
        detail: { reason: dto.reason, operatorId },
      },
    });
    return { success: true };
  }

  async auditCert(
    userId: string,
    dto: { status: string; reason?: string },
    operatorId?: string,
    ip?: string,
  ) {
    const status = dto.status === "approved" ? "APPROVED" : "REJECTED";
    await this.prisma.studentVerify.upsert({
      where: { userId },
      update: {
        status,
        remark: dto.reason,
        verifiedAt: status === "APPROVED" ? new Date() : null,
      },
      create: {
        userId,
        realName: "",
        studentId: "",
        schoolName: "",
        status,
        remark: dto.reason,
      },
    });
    await this.logOperation(
      operatorId || "",
      "audit_cert",
      "user",
      userId,
      "student_verify",
      { status: dto.status, reason: dto.reason },
      ip,
    );
    return { success: true };
  }

  // ==================== 区域管理 ====================
  async regions(query: any) {
    const { keyword, status, page = 1, pageSize = 20 } = query;
    const where: any = {};
    if (keyword)
      where.OR = [
        { name: { contains: keyword } },
        { code: { contains: keyword } },
      ];
    if (status !== undefined && status !== "")
      where.isOpen = status === "1" || status === 1 || status === true;

    const [list, total] = await Promise.all([
      this.prisma.region.findMany({
        where,
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { sortOrder: "asc" },
      }),
      this.prisma.region.count({ where }),
    ]);
    return {
      list: list.map((r) => this.toAdminRegion(r)),
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  async regionDetail(id: string) {
    const r = await this.prisma.region.findUnique({
      where: { id },
      include: { banners: true, notices: true, navs: true, tabBar: true },
    });
    if (!r) throw new NotFoundException("区域不存在");
    return this.toAdminRegion(r);
  }

  async createRegion(dto: any) {
    const name = String(dto.name || "").trim();
    if (!name) throw new BadRequestException("区域名称不能为空");

    const code = this.normalizeRegionCode(
      dto.code || this.generateRegionCode(name),
    );
    const exists = await this.prisma.region.findUnique({ where: { code } });
    if (exists) {
      throw new ConflictException(`区域编码「${code}」已存在，请换一个编码`);
    }
    try {
      const region = await this.prisma.region.create({
        data: {
          name,
          code,
          description: this.nullableString(dto.description),
          cover: this.nullableString(dto.coverImage),
          address: this.buildRegionAddress(dto),
          latitude: this.toFloatOrNull(dto.latitude),
          longitude: this.toFloatOrNull(dto.longitude),
          radius: this.toPositiveInt(dto.serviceRadius, 5000),
          studentOnly: Boolean(dto.studentOnly),
          sortOrder: this.toInt(dto.sort, 0),
          // 新增字段
          logo: this.nullableString(dto.logo),
          distanceLimit: this.toPositiveInt(dto.distanceLimit, 0),
          regionType: this.nullableString(dto.regionType) || 'other',
          isHot: Boolean(dto.isHot),
          regionCoverMode: this.nullableString(dto.regionCoverMode) || 'cover',
          balance: this.toDecimalOrNull(dto.balance),
          minWithdraw: this.toDecimalOrNull(dto.minWithdraw),
          maxWithdraw: this.toDecimalOrNull(dto.maxWithdraw),
          withdrawFee: this.toDecimalOrNull(dto.withdrawFee),
          withdrawRate: this.toDecimalOrNull(dto.withdrawRate),
          commissionRate: this.toDecimalOrNull(dto.commissionRate),
          selfUnbanFee: this.toDecimalOrNull(dto.selfUnbanFee),
          showHotList: Boolean(dto.showHotList),
          hotFeaturedDisplay: this.nullableString(dto.hotFeaturedDisplay) || 'none',
          isForceGuidance: Boolean(dto.isForceGuidance),
          privateMessageEnabled: dto.privateMessageEnabled !== undefined ? Boolean(dto.privateMessageEnabled) : true,
          contactsRequireStudentAuth: Boolean(dto.contactsRequireStudentAuth),
          onlyStudentAuthUsers: Boolean(dto.onlyStudentAuthUsers),
          groupChatEnabled: Boolean(dto.groupChatEnabled),
          enableQrcodeFilter: Boolean(dto.enableQrcodeFilter),
          homeNavLayout: this.toPositiveInt(dto.homeNavLayout, 1),
          messagePageLayout: this.nullableString(dto.messagePageLayout) || 'default',
          profilePageLayout: this.nullableString(dto.profilePageLayout) || 'default',
          carouselImages: dto.carouselImages ?? undefined,
          regionTabs: dto.regionTabs ?? undefined,
          homeLeaderboard: dto.homeLeaderboard ?? undefined,
          messageIcons: dto.messageIcons ?? undefined,
          messageNavigation: dto.messageNavigation ?? undefined,
          profileLayoutItems: dto.profileLayoutItems ?? undefined,
          homeNavLayoutConfig: dto.homeNavLayoutConfig ?? undefined,
        },
      });
      return this.toAdminRegion(region);
    } catch (error: any) {
      if (error?.code === "P2002") {
        throw new ConflictException("区域编码已存在，请换一个编码后再保存");
      }
      throw error;
    }
  }

  async updateRegion(id: string, dto: any) {
    const exists = await this.prisma.region.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException("区域不存在");

    const data: any = {};
    if (dto.name !== undefined) {
      const name = String(dto.name || "").trim();
      if (!name) throw new BadRequestException("区域名称不能为空");
      data.name = name;
    }
    if (dto.code !== undefined && String(dto.code || "").trim()) {
      const code = this.normalizeRegionCode(dto.code);
      const sameCode = await this.prisma.region.findUnique({ where: { code } });
      if (sameCode && sameCode.id !== id) {
        throw new ConflictException(`区域编码「${code}」已存在，请换一个编码`);
      }
      data.code = code;
    }
    if (dto.description !== undefined)
      data.description = this.nullableString(dto.description);
    if (dto.coverImage !== undefined)
      data.cover = this.nullableString(dto.coverImage);
    if (
      dto.province !== undefined ||
      dto.city !== undefined ||
      dto.district !== undefined ||
      dto.address !== undefined
    ) {
      data.address = this.buildRegionAddress(dto);
    }
    if (dto.serviceRadius !== undefined)
      data.radius = this.toPositiveInt(dto.serviceRadius, 5000);
    if (dto.isOpen !== undefined) data.isOpen = Boolean(dto.isOpen);
    if (dto.studentOnly !== undefined)
      data.studentOnly = Boolean(dto.studentOnly);
    if (dto.sort !== undefined) data.sortOrder = this.toInt(dto.sort, 0);
    if (dto.settings !== undefined) data.settings = dto.settings;
    if (dto.latitude !== undefined) data.latitude = this.toFloatOrNull(dto.latitude);
    if (dto.longitude !== undefined) data.longitude = this.toFloatOrNull(dto.longitude);
    // 新增字段
    if (dto.logo !== undefined) data.logo = this.nullableString(dto.logo);
    if (dto.distanceLimit !== undefined) data.distanceLimit = this.toPositiveInt(dto.distanceLimit, 0);
    if (dto.regionType !== undefined) data.regionType = this.nullableString(dto.regionType) || 'other';
    if (dto.isHot !== undefined) data.isHot = Boolean(dto.isHot);
    if (dto.regionCoverMode !== undefined) data.regionCoverMode = this.nullableString(dto.regionCoverMode) || 'cover';
    if (dto.balance !== undefined) data.balance = this.toDecimalOrNull(dto.balance);
    if (dto.minWithdraw !== undefined) data.minWithdraw = this.toDecimalOrNull(dto.minWithdraw);
    if (dto.maxWithdraw !== undefined) data.maxWithdraw = this.toDecimalOrNull(dto.maxWithdraw);
    if (dto.withdrawFee !== undefined) data.withdrawFee = this.toDecimalOrNull(dto.withdrawFee);
    if (dto.withdrawRate !== undefined) data.withdrawRate = this.toDecimalOrNull(dto.withdrawRate);
    if (dto.commissionRate !== undefined) data.commissionRate = this.toDecimalOrNull(dto.commissionRate);
    if (dto.selfUnbanFee !== undefined) data.selfUnbanFee = this.toDecimalOrNull(dto.selfUnbanFee);
    if (dto.showHotList !== undefined) data.showHotList = Boolean(dto.showHotList);
    if (dto.hotFeaturedDisplay !== undefined) data.hotFeaturedDisplay = this.nullableString(dto.hotFeaturedDisplay) || 'none';
    if (dto.isForceGuidance !== undefined) data.isForceGuidance = Boolean(dto.isForceGuidance);
    if (dto.privateMessageEnabled !== undefined) data.privateMessageEnabled = Boolean(dto.privateMessageEnabled);
    if (dto.contactsRequireStudentAuth !== undefined) data.contactsRequireStudentAuth = Boolean(dto.contactsRequireStudentAuth);
    if (dto.onlyStudentAuthUsers !== undefined) data.onlyStudentAuthUsers = Boolean(dto.onlyStudentAuthUsers);
    if (dto.groupChatEnabled !== undefined) data.groupChatEnabled = Boolean(dto.groupChatEnabled);
    if (dto.enableQrcodeFilter !== undefined) data.enableQrcodeFilter = Boolean(dto.enableQrcodeFilter);
    if (dto.homeNavLayout !== undefined) data.homeNavLayout = this.toPositiveInt(dto.homeNavLayout, 1);
    if (dto.messagePageLayout !== undefined) data.messagePageLayout = this.nullableString(dto.messagePageLayout) || 'default';
    if (dto.profilePageLayout !== undefined) data.profilePageLayout = this.nullableString(dto.profilePageLayout) || 'default';
    if (dto.carouselImages !== undefined) data.carouselImages = dto.carouselImages ?? null;
    if (dto.regionTabs !== undefined) data.regionTabs = dto.regionTabs ?? null;
    if (dto.homeLeaderboard !== undefined) data.homeLeaderboard = dto.homeLeaderboard ?? null;
    if (dto.messageIcons !== undefined) data.messageIcons = dto.messageIcons ?? null;
    if (dto.messageNavigation !== undefined) data.messageNavigation = dto.messageNavigation ?? null;
    if (dto.profileLayoutItems !== undefined) data.profileLayoutItems = dto.profileLayoutItems ?? null;
    if (dto.homeNavLayoutConfig !== undefined) data.homeNavLayoutConfig = dto.homeNavLayoutConfig ?? null;

    const region = await this.prisma.region.update({ where: { id }, data });
    return this.toAdminRegion(region);
  }

  private toAdminRegion(r: any) {
    const { province, city, district } = this.parseRegionAddress(r.address);
    return {
      id: r.id,
      name: r.name,
      code: r.code,
      description: r.description || "",
      coverImage: r.cover || "",
      province,
      city,
      district,
      address: r.address || "",
      latitude: r.latitude,
      longitude: r.longitude,
      serviceRadius: r.radius,
      studentOnly: r.studentOnly,
      status: r.isOpen ? 1 : 0,
      sort: r.sortOrder,
      settings: r.settings || {},
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      // 新增字段
      logo: r.logo || r.cover || "",
      distanceLimit: r.distanceLimit ?? 0,
      regionType: r.regionType || "other",
      isHot: r.isHot ?? false,
      regionCoverMode: r.regionCoverMode || "cover",
      balance: r.balance ? Number(r.balance) : 0,
      minWithdraw: r.minWithdraw ? Number(r.minWithdraw) : 0,
      maxWithdraw: r.maxWithdraw ? Number(r.maxWithdraw) : 0,
      withdrawFee: r.withdrawFee ? Number(r.withdrawFee) : 0,
      withdrawRate: r.withdrawRate ? Number(r.withdrawRate) : 0,
      commissionRate: r.commissionRate ? Number(r.commissionRate) : 0,
      selfUnbanFee: r.selfUnbanFee ? Number(r.selfUnbanFee) : 0,
      showHotList: r.showHotList ?? false,
      hotFeaturedDisplay: r.hotFeaturedDisplay || "none",
      isForceGuidance: r.isForceGuidance ?? false,
      privateMessageEnabled: r.privateMessageEnabled ?? true,
      contactsRequireStudentAuth: r.contactsRequireStudentAuth ?? false,
      onlyStudentAuthUsers: r.onlyStudentAuthUsers ?? false,
      groupChatEnabled: r.groupChatEnabled ?? false,
      enableQrcodeFilter: r.enableQrcodeFilter ?? false,
      homeNavLayout: r.homeNavLayout ?? 1,
      messagePageLayout: r.messagePageLayout || "default",
      profilePageLayout: r.profilePageLayout || "default",
      carouselImages: r.carouselImages ?? [],
      regionTabs: r.regionTabs ?? [],
      homeLeaderboard: r.homeLeaderboard ?? { enabled: false, items: [] },
      messageIcons: r.messageIcons ?? {},
      messageNavigation: r.messageNavigation ?? { cards: [] },
      profileLayoutItems: r.profileLayoutItems ?? [],
      homeNavLayoutConfig: r.homeNavLayoutConfig ?? { title: { show: false, text: "", color: "#333333", fontSize: 16, fontWeight: "bold" }, showLayoutSwitch: false },
    };
  }

  private normalizeRegionCode(value: any) {
    const code = String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9_-]/g, "")
      .replace(/^[-_]+|[-_]+$/g, "");
    if (!code)
      return `region_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    if (code.length > 48) return code.slice(0, 48);
    return code;
  }

  private generateRegionCode(name: string) {
    const ascii = name
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9_-]/g, "")
      .replace(/^[-_]+|[-_]+$/g, "");
    return (
      ascii || `region_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    );
  }

  private nullableString(value: any) {
    const text = String(value ?? "").trim();
    return text || null;
  }

  private toInt(value: any, fallback: number) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.trunc(n) : fallback;
  }

  private toPositiveInt(value: any, fallback: number) {
    const n = this.toInt(value, fallback);
    return n > 0 ? n : fallback;
  }

  private toFloatOrNull(value: any) {
    if (value === undefined || value === null || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  private toDecimalOrNull(value: any) {
    if (value === undefined || value === null || value === "") return undefined;
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }

  private buildRegionAddress(dto: any) {
    const parts = [dto.province, dto.city, dto.district]
      .map((item) => String(item ?? "").trim())
      .filter(Boolean);
    return this.nullableString(dto.address) || parts.join(" ") || null;
  }

  private parseRegionAddress(address?: string | null) {
    const parts = String(address || "")
      .split(/\s+/)
      .filter(Boolean);
    return {
      province: parts[0] || "",
      city: parts[1] || "",
      district: parts.slice(2).join(" ") || "",
    };
  }

  // ==================== 内容管理 ====================
  async posts(query: any) {
    const {
      keyword,
      auditStatus,
      type,
      isTop,
      regionId,
      status,
      startDate,
      endDate,
      page = 1,
      pageSize = 20,
    } = query;
    const where: any = {};
    if (keyword)
      where.OR = [
        { title: { contains: keyword } },
        { content: { contains: keyword } },
      ];
    if (auditStatus) where.auditStatus = auditStatus;
    if (type) where.type = type.toUpperCase();
    if (isTop === "true") where.isTop = true;
    if (regionId) where.regionId = regionId;
    if (status) {
      if (status.includes(",")) {
        where.status = { in: status.split(",") };
      } else {
        where.status = status;
      }
    }
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate + "T23:59:59.999Z");
    }

    const [list, total] = await Promise.all([
      this.prisma.post.findMany({
        where,
        include: {
          user: { select: { id: true, nickname: true, avatar: true } },
          media: true,
          region: { select: { id: true, name: true } },
          _count: { select: { comments: true, likes: true, reports: true } },
        },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.post.count({ where }),
    ]);
    return {
      list: list.map((p) => ({
        id: p.id,
        userId: p.userId,
        userNickname: p.user.nickname,
        userAvatar: p.user.avatar,
        type: p.type?.toLowerCase(),
        title: p.title,
        content: p.content?.slice(0, 200),
        images: p.media?.map((m) => m.url) || [],
        isTop: p.isTop,
        isHot: false,
        isEssence: p.isEssence,
        auditStatus: p.auditStatus,
        status: p.status,
        regionId: p.regionId,
        regionName: p.region?.name || null,
        viewCount: p.viewCount,
        likeCount: p.likeCount,
        commentCount: p._count.comments,
        reportCount: p._count.reports,
        shareCount: p.shareCount,
        createdAt: p.createdAt,
      })),
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  async postDetail(id: string) {
    const p = await this.prisma.post.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, nickname: true, avatar: true } },
        media: true,
        votes: true,
        topics: { include: { topic: true } },
        _count: {
          select: {
            comments: true,
            likes: true,
            favorites: true,
            reports: true,
          },
        },
      },
    });
    if (!p) throw new NotFoundException("帖子不存在");
    return {
      ...p,
      images: p.media?.map((m) => m.url) || [],
      commentCount: p._count.comments,
      likeCount: p._count.likes,
      favoriteCount: p._count.favorites,
      reportCount: p._count.reports,
      topics: p.topics?.map((t) => t.topic.name) || [],
    };
  }

  async auditPost(
    id: string,
    dto: { status: string; reason?: string },
    operatorId?: string,
    ip?: string,
  ) {
    const newStatus = dto.status === "approved" ? "approved" : "rejected";
    const postStatus = dto.status === "approved" ? "PUBLISHED" : "REJECTED";
    await this.prisma.post.update({
      where: { id },
      data: {
        auditStatus: newStatus,
        auditReason: dto.reason,
        status: postStatus,
      },
    });
    await this.logOperation(
      operatorId || "",
      dto.status === "approved" ? "approve_post" : "reject_post",
      "post",
      id,
      "post",
      { reason: dto.reason },
      ip,
    );
    await this.prisma.auditLog.create({
      data: {
        action: dto.status === "approved" ? "APPROVE" : "REJECT",
        module: "post",
        targetId: id,
        detail: { reason: dto.reason, operatorId },
      },
    });
    return { success: true };
  }

  async deletePost(id: string, operatorId?: string, ip?: string) {
    await this.prisma.post.update({
      where: { id },
      data: { status: "DELETED", deletedAt: new Date() },
    });
    await this.logOperation(
      operatorId || "",
      "delete",
      "post",
      id,
      "post",
      null,
      ip,
    );
    return { success: true };
  }

  async toggleTop(id: string) {
    const p = await this.prisma.post.findUnique({ where: { id } });
    if (!p) throw new NotFoundException("帖子不存在");
    await this.prisma.post.update({ where: { id }, data: { isTop: !p.isTop } });
    return { success: true };
  }

  async comments(query: any) {
    const {
      postId,
      keyword,
      auditStatus,
      regionId,
      status,
      startDate,
      endDate,
      page = 1,
      pageSize = 20,
    } = query;
    const where: any = {};
    if (postId) where.postId = postId;
    if (keyword)
      where.OR = [
        { content: { contains: keyword } },
        { user: { nickname: { contains: keyword } } },
      ];
    if (auditStatus) where.auditStatus = auditStatus;
    if (status !== undefined && status !== "") {
      where.status = String(status) === "0" ? "NORMAL" : "DELETED";
    }
    if (regionId) {
      where.post = { regionId };
    }
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate + "T23:59:59.999Z");
    }
    const [list, total] = await Promise.all([
      this.prisma.comment.findMany({
        where,
        include: {
          user: { select: { id: true, nickname: true, avatar: true } },
          post: { select: { id: true, title: true, regionId: true, region: { select: { name: true } } } },
          _count: { select: { replies: true } },
        },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.comment.count({ where }),
    ]);
    return {
      list: list.map((c) => ({
        id: c.id,
        postId: c.postId,
        postTitle: c.post?.title,
        regionId: c.post?.regionId,
        regionName: c.post?.region?.name || null,
        userId: c.userId,
        userNickname: c.user.nickname,
        userAvatar: c.user.avatar,
        parentId: c.parentId,
        content: c.content,
        likeCount: c.likeCount,
        replyCount: c._count.replies,
        auditStatus: c.auditStatus,
        status: c.status,
        createdAt: c.createdAt,
      })),
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  async deleteComment(id: string, operatorId?: string, ip?: string) {
    const comment = await this.prisma.comment.findUnique({ where: { id } });
    if (!comment) throw new NotFoundException("评论不存在");
    await this.prisma.comment.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.logOperation(
      operatorId || "",
      "delete",
      "comment",
      id,
      "comment",
      null,
      ip,
    );
    return { success: true };
  }

  async auditComment(id: string, dto: { status: string; reason?: string }) {
    const comment = await this.prisma.comment.findUnique({ where: { id } });
    if (!comment) throw new NotFoundException("评论不存在");
    if (dto.status === "rejected") {
      await this.prisma.comment.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
    }
    return { success: true };
  }

  async circles(query: any) {
    const { keyword, page = 1, pageSize = 20 } = query;
    const where: any = {};
    if (keyword) where.name = { contains: keyword };
    const [list, total] = await Promise.all([
      this.prisma.circle.findMany({
        where,
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.circle.count({ where }),
    ]);
    return {
      list: list.map((c) => ({
        id: c.id,
        name: c.name,
        cover: c.cover,
        description: c.description,
        postCount: c.postCount,
        memberCount: c.memberCount,
        isOfficial: c.isOfficial,
        status: c.status === "active" ? 1 : 0,
        createdAt: c.createdAt,
      })),
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  async circleDetail(id: string) {
    const circle = await this.prisma.circle.findUnique({ where: { id } });
    if (!circle) throw new NotFoundException("圈子不存在");
    return {
      success: true,
      data: {
        id: circle.id,
        name: circle.name,
        icon: circle.icon,
        cover: circle.cover,
        description: circle.description,
        regionId: circle.regionId,
        joinType: circle.joinType,
        maxMembers: circle.maxMembers,
        tags: circle.tags,
        postCount: circle.postCount,
        memberCount: circle.memberCount,
        isOfficial: circle.isOfficial,
        status: circle.status,
        createdAt: circle.createdAt,
      },
    };
  }

  async reports(query: any) {
    const { status, targetType, page = 1, pageSize = 20 } = query;
    const where: any = {};
    if (status) where.status = status;
    if (targetType) where.targetType = targetType;
    const [list, total] = await Promise.all([
      this.prisma.report.findMany({
        where,
        include: {
          reporter: { select: { id: true, nickname: true } },
          reported: { select: { id: true, nickname: true } },
        },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.report.count({ where }),
    ]);
    return {
      list: list.map((r) => ({
        id: r.id,
        reporterId: r.reporterId,
        reporterName: r.reporter?.nickname,
        reportedName: r.reported?.nickname,
        targetType: r.targetType,
        targetId: r.targetId,
        reason: r.reason,
        description: r.detail,
        status: r.status,
        result: r.result,
        createdAt: r.createdAt,
      })),
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  async handleReport(
    id: string,
    dto: { status: string; result?: string },
    handlerId?: string,
    ip?: string,
  ) {
    await this.prisma.report.update({
      where: { id },
      data: {
        status: dto.status,
        result: dto.result,
        handlerId,
        handledAt: new Date(),
      },
    });
    await this.logOperation(
      handlerId || "",
      "handle_report",
      "report",
      id,
      "report",
      { status: dto.status, result: dto.result },
      ip,
    );
    return { success: true };
  }

  // ==================== 商城：商家 ====================
  async merchants(query: any) {
    const { keyword, auditStatus, regionId, categoryId, page = 1, pageSize = 20 } = query;
    const where: any = {};
    if (keyword) where.name = { contains: keyword, mode: 'insensitive' };
    if (auditStatus) where.status = auditStatus;
    if (regionId) where.regionId = regionId;
    if (categoryId) where.categoryId = categoryId;
    const [list, total] = await Promise.all([
      this.prisma.merchant.findMany({
        where,
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: "desc" },
        include: {
          region: { select: { name: true } },
          category: { select: { name: true } },
        },
      }),
      this.prisma.merchant.count({ where }),
    ]);
    return {
      list: list.map((m) => ({
        id: m.id,
        name: m.name,
        logo: m.logo,
        cover: m.cover,
        phone: m.phone,
        contactPerson: m.contactPerson || m.name,
        address: m.address,
        regionId: m.regionId,
        regionName: (m as any).region?.name || '',
        categoryId: m.categoryId,
        categoryName: (m as any).category?.name || '',
        auditStatus: m.status,
        status: m.status === "approved" ? 1 : 0,
        score: m.rating,
        orderCount: m.saleCount,
        createdAt: m.createdAt,
        businessHours: m.businessHours,
        description: m.description,
      })),
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  async merchantDetail(id: string) {
    const m = await this.prisma.merchant.findUnique({
      where: { id },
      include: {
        products: true,
        region: { select: { name: true } },
        category: { select: { name: true } },
      },
    });
    if (!m) throw new NotFoundException("商家不存在");
    return m;
  }

  async auditMerchant(
    id: string,
    dto: { status: string; remark?: string },
    operatorId?: string,
    ip?: string,
  ) {
    await this.prisma.merchant.update({
      where: { id },
      data: { status: dto.status, rejectReason: dto.remark },
    });
    await this.logOperation(
      operatorId || "",
      "audit_merchant",
      "merchant",
      id,
      "merchant",
      { status: dto.status, remark: dto.remark },
      ip,
    );
    return { success: true };
  }

  async updateMerchantStatus(id: string, status: string) {
    const merchant = await this.prisma.merchant.findUnique({ where: { id } });
    if (!merchant) throw new NotFoundException("商家不存在");
    await this.prisma.merchant.update({ where: { id }, data: { status } });
    return { success: true };
  }

  async batchMerchants(
    dto: { ids: string[]; action: string; value?: any },
    operatorId?: string,
    ip?: string,
  ) {
    if (!dto.ids?.length) throw new BadRequestException("请选择商家");
    switch (dto.action) {
      case "approve":
        await this.prisma.merchant.updateMany({
          where: { id: { in: dto.ids } },
          data: { status: "approved" },
        });
        break;
      case "reject":
        await this.prisma.merchant.updateMany({
          where: { id: { in: dto.ids } },
          data: { status: "rejected", rejectReason: dto.value },
        });
        break;
      case "close":
        await this.prisma.merchant.updateMany({
          where: { id: { in: dto.ids } },
          data: { status: "closed" },
        });
        break;
      default:
        throw new BadRequestException("不支持的操作类型");
    }
    await this.logOperation(
      operatorId || "",
      `batch_${dto.action}`,
      "merchant",
      dto.ids.join(","),
      "merchant",
      { count: dto.ids.length },
      ip,
    );
    return { success: true, count: dto.ids.length };
  }

  // ==================== 商城：分类/商品 ====================
  async categories(_query: any) {
    const list = await this.prisma.category.findMany({
      include: { children: true },
      where: { parentId: null },
      orderBy: { sortOrder: "asc" },
    });
    return { list };
  }

  async products(query: any) {
    const { keyword, status, merchantId, page = 1, pageSize = 20 } = query;
    const where: any = {};
    if (keyword) where.name = { contains: keyword };
    if (status) where.status = status === "on" ? "on_sale" : status;
    if (merchantId) where.merchantId = merchantId;
    const [list, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: {
          merchant: { select: { name: true } },
          category: { select: { name: true } },
          skus: true,
        },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.product.count({ where }),
    ]);
    return {
      list: list.map((p) => ({
        id: p.id,
        merchantId: p.merchantId,
        merchantName: p.merchant?.name,
        categoryId: p.categoryId,
        categoryName: p.category?.name,
        name: p.name,
        coverImage: (p.images as any)?.[0] || "",
        images: p.images,
        minPrice: Math.round(Number(p.price) * 100),
        maxPrice: Math.round(Number(p.price) * 100),
        totalStock: p.stock,
        totalSales: p.saleCount,
        skus: p.skus,
        status: p.status === "on_sale" ? "on" : "off",
        createdAt: p.createdAt,
      })),
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  async productDetail(id: string) {
    const p = await this.prisma.product.findUnique({
      where: { id },
      include: {
        skus: true,
        merchant: { select: { name: true } },
        category: { select: { name: true } },
      },
    });
    if (!p) throw new NotFoundException("商品不存在");
    return {
      ...p,
      merchantName: p.merchant?.name,
      categoryName: p.category?.name,
      coverImage: (p.images as any)?.[0],
      minPrice: Math.round(Number(p.price) * 100),
      maxPrice: Math.round(Number(p.price) * 100),
    };
  }

  async batchProducts(
    dto: { ids: string[]; action: string; value?: any },
    operatorId?: string,
    ip?: string,
  ) {
    if (!dto.ids?.length) throw new BadRequestException("请选择商品");
    switch (dto.action) {
      case "on":
        await this.prisma.product.updateMany({
          where: { id: { in: dto.ids } },
          data: { status: "on_sale" },
        });
        break;
      case "off":
        await this.prisma.product.updateMany({
          where: { id: { in: dto.ids } },
          data: { status: "off_sale" },
        });
        break;
      case "delete":
        await this.prisma.product.updateMany({
          where: { id: { in: dto.ids } },
          data: { status: "deleted" },
        });
        break;
      default:
        throw new BadRequestException("不支持的操作类型");
    }
    await this.logOperation(
      operatorId || "",
      `batch_${dto.action}`,
      "product",
      dto.ids.join(","),
      "product",
      { count: dto.ids.length },
      ip,
    );
    return { success: true, count: dto.ids.length };
  }

  // ==================== 评价管理 ====================
  async reviews(query: any) {
    const {
      keyword,
      rating,
      productId,
      orderId,
      merchantId,
      page = 1,
      pageSize = 20,
    } = query;
    const where: any = {};
    if (keyword) where.content = { contains: keyword };
    if (rating) where.rating = +rating;
    if (productId) where.productId = productId;
    if (orderId) where.orderId = orderId;
    if (merchantId) where.merchantId = merchantId;

    const [list, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        include: {
          user: { select: { id: true, nickname: true, avatar: true } },
          product: { select: { name: true } },
          order: { select: { orderNo: true } },
        },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.review.count({ where }),
    ]);
    return {
      list: list.map((r) => ({
        id: r.id,
        userId: r.userId,
        userNickname: r.user?.nickname,
        userAvatar: r.user?.avatar,
        productId: r.productId,
        productName: r.product?.name,
        orderId: r.orderId,
        orderNo: r.order?.orderNo,
        rating: r.rating,
        content: r.content,
        images: r.images,
        isAnonymous: r.isAnonymous,
        reply: r.reply,
        replyAt: r.replyAt,
        createdAt: r.createdAt,
      })),
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  async deleteReview(id: string, operatorId?: string, ip?: string) {
    const r = await this.prisma.review.findUnique({ where: { id } });
    if (!r) throw new NotFoundException("评价不存在");
    await this.prisma.review.delete({ where: { id } });
    await this.logOperation(
      operatorId || "",
      "delete",
      "review",
      id,
      "review",
      null,
      ip,
    );
    return { success: true };
  }

  async replyReview(
    id: string,
    reply: string,
    operatorId?: string,
    ip?: string,
  ) {
    const r = await this.prisma.review.findUnique({ where: { id } });
    if (!r) throw new NotFoundException("评价不存在");
    await this.prisma.review.update({
      where: { id },
      data: { reply, replyAt: new Date() },
    });
    await this.logOperation(
      operatorId || "",
      "reply",
      "review",
      id,
      "review",
      { reply },
      ip,
    );
    return { success: true };
  }

  // ==================== 促销管理 ====================
  async promotions(query: any) {
    const { status, type, page = 1, pageSize = 20 } = query;
    const where: any = {};
    if (status) where.status = status;
    if (type) where.type = type;
    const [list, total] = await Promise.all([
      this.prisma.promotion.findMany({
        where,
        include: {
          products: {
            include: { product: { select: { id: true, name: true } } },
          },
        },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.promotion.count({ where }),
    ]);
    return {
      list: list.map((p) => ({
        id: p.id,
        name: p.name,
        type: p.type,
        rules: p.rules,
        isGlobal: p.isGlobal,
        startAt: p.startAt,
        endAt: p.endAt,
        status: p.status,
        productCount: p.products?.length || 0,
        products: p.products?.map((pp) => ({
          id: pp.product.id,
          name: pp.product.name,
        })),
        createdAt: p.createdAt,
      })),
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  async createPromotion(dto: any, operatorId?: string, ip?: string) {
    const promotion = await this.prisma.promotion.create({
      data: {
        name: dto.name,
        type: dto.type,
        rules: dto.rules,
        startAt: new Date(dto.startAt),
        endAt: new Date(dto.endAt),
        isGlobal: dto.isGlobal || false,
        status: dto.status || "active",
      },
    });
    if (dto.productIds?.length) {
      await this.prisma.promotionProduct.createMany({
        data: dto.productIds.map((pid: string) => ({
          promotionId: promotion.id,
          productId: pid,
        })),
      });
    }
    await this.logOperation(
      operatorId || "",
      "create",
      "promotion",
      promotion.id,
      "promotion",
      dto,
      ip,
    );
    return { success: true, id: promotion.id };
  }

  async updatePromotion(id: string, dto: any) {
    await this.prisma.promotion.update({
      where: { id },
      data: {
        name: dto.name,
        type: dto.type,
        rules: dto.rules,
        startAt: dto.startAt ? new Date(dto.startAt) : undefined,
        endAt: dto.endAt ? new Date(dto.endAt) : undefined,
        isGlobal: dto.isGlobal,
        status: dto.status,
      },
    });
    if (dto.productIds) {
      await this.prisma.promotionProduct.deleteMany({
        where: { promotionId: id },
      });
      if (dto.productIds.length) {
        await this.prisma.promotionProduct.createMany({
          data: dto.productIds.map((pid: string) => ({
            promotionId: id,
            productId: pid,
          })),
        });
      }
    }
    return { success: true };
  }

  async promotionDetail(id: string) {
    const p = await this.prisma.promotion.findUnique({
      where: { id },
      include: {
        products: {
          include: { product: { select: { id: true, name: true } } },
        },
      },
    });
    if (!p) throw new NotFoundException("促销活动不存在");
    return p;
  }

  // ==================== 运费模板 ====================
  async freightTemplates(query: any) {
    const { merchantId, page = 1, pageSize = 20 } = query;
    const where: any = {};
    if (merchantId) where.merchantId = merchantId;
    const [list, total] = await Promise.all([
      this.prisma.freightTemplate.findMany({
        where,
        include: { merchant: { select: { name: true } } },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.freightTemplate.count({ where }),
    ]);
    return {
      list: list.map((t) => ({
        id: t.id,
        merchantId: t.merchantId,
        merchantName: t.merchant?.name,
        name: t.name,
        rules: t.rules,
        isDefault: t.isDefault,
        createdAt: t.createdAt,
      })),
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  async createFreightTemplate(dto: any) {
    return this.prisma.freightTemplate.create({
      data: {
        merchantId: dto.merchantId,
        name: dto.name,
        rules: dto.rules,
        isDefault: dto.isDefault || false,
      },
    });
  }

  async updateFreightTemplate(id: string, dto: any) {
    return this.prisma.freightTemplate.update({
      where: { id },
      data: { name: dto.name, rules: dto.rules, isDefault: dto.isDefault },
    });
  }

  async deleteFreightTemplate(id: string) {
    const tpl = await this.prisma.freightTemplate.findUnique({ where: { id } });
    if (!tpl) throw new NotFoundException("运费模板不存在");
    await this.prisma.freightTemplate.delete({ where: { id } });
    return { success: true };
  }

  // ==================== 订单/退款 ====================
  async orders(query: any) {
    const {
      status,
      orderNo,
      merchantId,
      regionId,
      keyword,
      payStatus,
      startAt,
      endAt,
      page = 1,
      pageSize = 20,
    } = query;

    const where: any = {};
    const AND: any[] = [];

    if (status) {
      const statuses = (status as string).split(",").map((s) => s.trim().toUpperCase());
      where.status = { in: statuses as any };
    }
    if (orderNo) where.orderNo = { contains: orderNo };
    if (merchantId) where.merchantId = merchantId;
    if (regionId) {
      // 通过 merchant 关联过滤区域
      AND.push({ merchant: { regionId } });
    }

    if (keyword) {
      const trimmed = keyword.trim();
      if (/^[a-f0-9-]{20,}$/.test(trimmed)) {
        AND.push({
          OR: [
            { orderNo: { contains: trimmed } },
            { id: trimmed },
          ],
        });
      } else {
        AND.push({
          OR: [
            { orderNo: { contains: trimmed } },
            { user: { nickname: { contains: trimmed } } },
            { user: { phone: { contains: trimmed } } },
            { receiverName: { contains: trimmed } },
            { receiverPhone: { contains: trimmed } },
          ],
        });
      }
    }

    if (startAt || endAt) {
      const createdAt: any = {};
      if (startAt) createdAt.gte = new Date(startAt);
      if (endAt) createdAt.lte = new Date(endAt + "T23:59:59.999Z");
      AND.push({ createdAt });
    }

    // 支付状态过滤：通过 PaymentOrder 的 bizType+bizId 关联
    if (payStatus) {
      const paymentOrders = await this.prisma.paymentOrder.findMany({
        where: { bizType: "order", status: payStatus },
        select: { bizId: true },
      });
      const bizIds = paymentOrders.map((p) => p.bizId);
      if (bizIds.length === 0) {
        return { list: [], total: 0, page: +page, pageSize: +pageSize };
      }
      AND.push({ id: { in: bizIds } });
    }

    if (AND.length > 0) where.AND = AND;

    const [list, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: {
          user: { select: { id: true, nickname: true, phone: true, avatar: true } },
          merchant: { select: { id: true, name: true, regionId: true, region: { select: { name: true } } } },
          items: { take: 3 },
          orderLogs: { take: 5, orderBy: { createdAt: "desc" } },
        },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.order.count({ where }),
    ]);

    // 批量获取支付信息
    const orderIds = list.map((o) => o.id);
    const payments =
      orderIds.length > 0
        ? await this.prisma.paymentOrder.findMany({
            where: { bizType: "order", bizId: { in: orderIds } },
            select: { bizId: true, status: true, channel: true, payTime: true },
          })
        : [];
    const payMap = new Map(payments.map((p) => [p.bizId, p]));

    return {
      list: list.map((o) => {
        const pay = payMap.get(o.id);
        return {
          id: o.id,
          orderNo: o.orderNo,
          userId: o.userId,
          userNickname: o.user?.nickname || "",
          userPhone: o.user?.phone || "",
          userAvatar: o.user?.avatar || "",
          merchantId: o.merchantId,
          merchantName: o.merchant?.name || "",
          regionId: o.merchant?.regionId || "",
          regionName: o.merchant?.region?.name || "",
          productName: o.items?.[0]?.productName || "",
          productImage: o.items?.[0]?.productImage || "",
          skuName: o.items?.[0]?.skuSpecs
            ? String((o.items[0].skuSpecs as any).specs || "")
            : "",
          quantity: o.items?.reduce((s: number, i: any) => s + i.quantity, 0) || 0,
          totalAmount: Number(o.totalAmount || 0),
          discountAmount: Number(o.discountAmount || 0),
          freightAmount: Number(o.freightAmount || 0),
          payAmount: Number(o.payAmount || 0),
          status: o.status?.toLowerCase(),
          refundStatus: o.refundStatus || "none",
          payStatus: pay?.status || "pending",
          payChannel: pay?.channel || "",
          payTime: pay?.payTime || null,
          receiverName: o.receiverName,
          receiverPhone: o.receiverPhone,
          receiverAddress: o.receiverAddress,
          trackingNo: o.trackingNo,
          trackingCompany: o.trackingCompany,
          remark: o.remark,
          createdAt: o.createdAt,
          updatedAt: o.updatedAt,
          logs: o.orderLogs?.map((l) => ({
            action: l.action,
            remark: l.remark,
            operatorType: l.operatorType,
            createdAt: l.createdAt,
          })),
        };
      }),
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  async orderDetail(id: string) {
    const o = await this.prisma.order.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            nickname: true,
            phone: true,
            avatar: true,
            openid: true,
            profile: { select: { realName: true, school: true } },
          },
        },
        merchant: {
          select: {
            id: true,
            name: true,
            phone: true,
            address: true,
            logo: true,
            region: { select: { id: true, name: true } },
          },
        },
        items: {
          include: {
            product: { select: { id: true, name: true, images: true } },
            sku: { select: { id: true, specs: true, price: true } },
          },
        },
        orderLogs: { orderBy: { createdAt: "asc" } },
        refunds: true,
      },
    });
    if (!o) throw new NotFoundException("订单不存在");

    // 通过 PaymentOrder 查询支付信息
    const payments = await this.prisma.paymentOrder.findMany({
      where: { bizType: "order", bizId: id },
      select: {
        id: true,
        paymentNo: true,
        channel: true,
        status: true,
        amount: true,
        wxTransId: true,
        payTime: true,
        createdAt: true,
        refundedAmount: true,
      },
      orderBy: { createdAt: "desc" },
    });

    // 构建操作日志
    const opLogs = [
      ...(o.orderLogs || []).map((l) => ({
        action: l.action,
        fromStatus: l.fromStatus,
        toStatus: l.toStatus,
        remark: l.remark,
        operatorType: l.operatorType || "system",
        createdAt: l.createdAt,
      })),
    ];

    return {
      id: o.id,
      orderNo: o.orderNo,
      status: o.status?.toLowerCase(),
      refundStatus: o.refundStatus || "none",
      remark: o.remark,
      cancelReason: o.cancelReason,
      totalAmount: Number(o.totalAmount || 0),
      discountAmount: Number(o.discountAmount || 0),
      freightAmount: Number(o.freightAmount || 0),
      payAmount: Number(o.payAmount || 0),
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
      payTime: o.payTime,
      deliverTime: o.deliverTime,
      receiveTime: o.receiveTime,
      completeTime: o.completeTime,
      cancelTime: o.cancelTime,
      user: {
        id: o.user?.id,
        nickname: o.user?.nickname || "",
        phone: o.user?.phone || "",
        avatar: o.user?.avatar || "",
        openid: o.user?.openid || "",
        realName: o.user?.profile?.realName || "",
        school: o.user?.profile?.school || "",
      },
      merchant: {
        id: o.merchant?.id,
        name: o.merchant?.name || "",
        phone: o.merchant?.phone || "",
        address: o.merchant?.address || "",
        logo: o.merchant?.logo || "",
        regionId: o.merchant?.region?.id || "",
        regionName: o.merchant?.region?.name || "",
      },
      receiver: {
        name: o.receiverName,
        phone: o.receiverPhone,
        address: o.receiverAddress,
      },
      tracking: {
        no: o.trackingNo || "",
        company: o.trackingCompany || "",
      },
      items: o.items?.map((i) => ({
        id: i.id,
        productId: i.productId,
        productName: i.productName,
        productImage: i.productImage,
        skuSpecs: i.skuSpecs,
        price: Number(i.price || 0),
        quantity: i.quantity,
        totalPrice: Number(i.totalPrice || 0),
      })),
      refunds: o.refunds?.map((r) => ({
        id: r.id,
        refundNo: r.refundNo,
        amount: Number(r.amount || 0),
        reason: r.reason,
        status: r.status,
        rejectReason: r.rejectReason,
        createdAt: r.createdAt,
        refundTime: r.refundTime,
      })),
      payments: payments.map((p) => ({
        id: p.id,
        paymentNo: p.paymentNo,
        channel: p.channel,
        status: p.status,
        amount: Number(p.amount || 0),
        wxTransId: p.wxTransId,
        payTime: p.payTime,
        createdAt: p.createdAt,
        refundedAmount: Number(p.refundedAmount || 0),
      })),
      logs: opLogs,
    };
  }

  async refunds(query: any) {
    const { status, page = 1, pageSize = 20 } = query;
    const where: any = {};
    if (status) where.status = status;
    const [list, total] = await Promise.all([
      this.prisma.paymentRefund.findMany({
        where,
        include: {
          payment: {
            select: { orderNo: true, bizType: true, bizId: true, userId: true },
          },
        },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.paymentRefund.count({ where }),
    ]);
    return {
      list: list.map((r) => ({
        id: r.id,
        refundNo: r.refundNo,
        paymentNo: r.payment?.orderNo,
        bizType: r.payment?.bizType,
        bizId: r.payment?.bizId,
        amount: Math.round(Number(r.amount) * 100),
        reason: r.reason,
        status: r.status,
        wxRefundId: r.wxRefundId,
        failReason: r.failReason,
        createdAt: r.createdAt,
      })),
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  async auditRefund(
    id: string,
    dto: { status: string; remark?: string },
    operatorId?: string,
    ip?: string,
  ) {
    const refund = await this.prisma.paymentRefund.findUnique({
      where: { id },
      include: { payment: true },
    });
    if (!refund) throw new NotFoundException("退款申请不存在");

    if (dto.status === "approved" && this.paymentService) {
      // 调用真实退款（微信支付 V3）
      try {
        await this.paymentService.refund({
          bizType: refund.payment.bizType,
          bizId: refund.payment.bizId,
          amount: Number(refund.amount),
          reason: dto.remark || "管理员审核退款",
          operatorId,
        });
      } catch (e: any) {
        throw new BadRequestException(`退款失败: ${e.message}`);
      }
    } else if (dto.status === "rejected") {
      await this.prisma.paymentRefund.update({
        where: { id },
        data: { status: "failed", failReason: dto.remark },
      });
    }

    await this.logOperation(
      operatorId || "",
      "audit_refund",
      "refund",
      id,
      "refund",
      { status: dto.status, remark: dto.remark },
      ip,
    );
    return { success: true };
  }

  async refundsFinance(query: any) {
    const { startAt, endAt, page = 1, pageSize = 20 } = query;
    const where: any = { status: { in: ["success", "processing"] } };
    if (startAt) where.createdAt = { gte: new Date(startAt) };
    if (endAt) where.createdAt = { ...where.createdAt, lt: new Date(endAt) };

    const [list, total, aggregate] = await Promise.all([
      this.prisma.paymentRefund.findMany({
        where,
        include: {
          payment: { select: { orderNo: true, bizType: true, userId: true } },
        },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.paymentRefund.count({ where }),
      this.prisma.paymentRefund.aggregate({ where, _sum: { amount: true } }),
    ]);

    return {
      list: list.map((r) => ({
        id: r.id,
        refundNo: r.refundNo,
        paymentNo: r.payment?.orderNo,
        bizType: r.payment?.bizType,
        userId: r.payment?.userId,
        amount: Math.round(Number(r.amount) * 100),
        reason: r.reason,
        status: r.status,
        createdAt: r.createdAt,
      })),
      total,
      totalAmount: Math.round(Number(aggregate._sum.amount || 0) * 100),
      page: +page,
      pageSize: +pageSize,
    };
  }

  // ==================== 财务 ====================
  async withdraws(query: any) {
    const { status, page = 1, pageSize = 20 } = query;
    const where: any = {};
    if (status) where.status = status.toUpperCase();
    const [list, total] = await Promise.all([
      this.prisma.withdraw.findMany({
        where,
        include: { user: { select: { id: true, nickname: true } } },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.withdraw.count({ where }),
    ]);
    return {
      list: list.map((w) => ({
        id: w.id,
        userId: w.userId,
        userNickname: w.user?.nickname,
        userType: "user",
        amount: Math.round(Number(w.amount) * 100),
        fee: 0,
        actualAmount: Math.round(Number(w.amount) * 100),
        accountType: w.channel?.toLowerCase() || "wechat",
        accountInfo: w.account,
        status: w.status?.toLowerCase(),
        createdAt: w.createdAt,
        realName: w.realName,
        transferNo: w.transferNo,
      })),
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  async withdrawDetail(id: string) {
    const w = await this.prisma.withdraw.findUnique({
      where: { id },
      include: { user: { select: { nickname: true, wallet: true } } },
    });
    if (!w) throw new NotFoundException("提现申请不存在");
    return {
      ...w,
      userNickname: w.user?.nickname,
      balance: Number(w.user?.wallet?.balance || 0),
    };
  }

  async auditWithdraw(
    id: string,
    dto: { status: string; remark?: string },
    operatorId?: string,
    ip?: string,
  ) {
    const w = await this.prisma.withdraw.findUnique({ where: { id } });
    if (!w) throw new NotFoundException("提现申请不存在");
    if (w.status !== "PENDING")
      throw new BadRequestException("该提现申请已处理");

    if (dto.status === "approved") {
      // 审核通过 → 转为处理中（不退回冻结金额）
      await this.prisma.withdraw.update({
        where: { id },
        data: { status: "PROCESSING", processedAt: new Date() },
      });
    } else {
      // 审核拒绝 → 在事务中拒绝并退回冻结金额
      await this.prisma.$transaction(async (tx) => {
        await tx.withdraw.update({
          where: { id },
          data: {
            status: "REJECTED",
            failReason: dto.remark,
            processedAt: new Date(),
          },
        });
        await tx.wallet.update({
          where: { userId: w.userId },
          data: {
            balance: { increment: w.amount },
            freeze: { decrement: w.amount },
          },
        });
        // 记录退回流水
        await tx.walletTransaction.create({
          data: {
            userId: w.userId,
            type: "WITHDRAW",
            amount: w.amount,
            balance: 0,
            channel: w.channel,
            orderNo: `WD_RETURN_${w.id}`,
            description: `提现被拒退回: ${dto.remark || ""}`,
            status: "SUCCESS",
          },
        });
      });
    }

    await this.logOperation(
      operatorId || "",
      "audit_withdraw",
      "finance",
      id,
      "withdraw",
      { status: dto.status, remark: dto.remark },
      ip,
    );
    return { success: true };
  }

  async completeWithdraw(
    id: string,
    dto: { transferNo?: string },
    operatorId?: string,
    ip?: string,
  ) {
    const w = await this.prisma.withdraw.findUnique({ where: { id } });
    if (!w) throw new NotFoundException("提现申请不存在");
    if (w.status !== "PROCESSING")
      throw new BadRequestException("该提现申请不在处理中状态");

    await this.prisma.$transaction(async (tx) => {
      await tx.withdraw.update({
        where: { id },
        data: {
          status: "SUCCESS",
          transferNo: dto.transferNo,
          processedAt: new Date(),
        },
      });
      await tx.wallet.update({
        where: { userId: w.userId },
        data: {
          freeze: { decrement: w.amount },
          totalOut: { increment: w.amount },
        },
      });
      await tx.walletTransaction.create({
        data: {
          userId: w.userId,
          type: "WITHDRAW",
          amount: w.amount,
          balance: 0,
          channel: w.channel,
          orderNo: w.id,
          description: "提现打款完成",
          status: "SUCCESS",
        },
      });
    });

    await this.logOperation(
      operatorId || "",
      "complete_withdraw",
      "finance",
      id,
      "withdraw",
      { transferNo: dto.transferNo },
      ip,
    );
    return { success: true };
  }

  async payments(query: any) {
    const { page = 1, pageSize = 20, status } = query;
    const where: any = {};
    if (status) where.status = status;
    const [list, total] = await Promise.all([
      this.prisma.paymentOrder.findMany({
        where: { ...where, status: "paid" },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { payTime: "desc" },
      }),
      this.prisma.paymentOrder.count({ where: { ...where, status: "paid" } }),
    ]);
    return {
      list: list.map((p) => ({
        id: p.id,
        paymentNo: p.paymentNo,
        bizType: p.bizType,
        bizId: p.bizId,
        orderNo: p.orderNo,
        userId: p.userId,
        amount: Math.round(Number(p.amount) * 100),
        payMethod: p.channel,
        payStatus: "paid",
        payTime: p.payTime,
      })),
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  async transactions(query: any) {
    const { type, userId, page = 1, pageSize = 20 } = query;
    const where: any = {};
    if (type) where.type = type;
    if (userId) where.userId = String(userId);
    const [list, total] = await Promise.all([
      this.prisma.walletTransaction.findMany({
        where,
        include: { user: { select: { id: true, nickname: true } } },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.walletTransaction.count({ where }),
    ]);
    return {
      list: list.map((t) => ({
        id: t.id,
        userId: t.userId,
        userNickname: t.user?.nickname,
        type: t.type,
        amount: Number(t.amount),
        balance: Number(t.balance),
        channel: t.channel,
        orderNo: t.orderNo,
        description: t.description,
        status: t.status,
        createdAt: t.createdAt,
      })),
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  async merchantSettlements(query: any) {
    const { merchantName, status, page = 1, pageSize = 20 } = query;
    const where: any = {};
    if (status) where.status = status;
    if (merchantName) {
      where.merchant = { name: { contains: merchantName } };
    }
    const [list, total] = await Promise.all([
      this.prisma.merchantSettlement.findMany({
        where,
        include: { merchant: { select: { name: true } } },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.merchantSettlement.count({ where }),
    ]);
    return {
      list: list.map((s) => ({
        id: s.id,
        settlementNo: s.settlementNo,
        merchantName: s.merchant?.name,
        period: s.startAt ? `${s.startAt.toISOString().slice(0, 10)} ~ ${s.endAt.toISOString().slice(0, 10)}` : "",
        orderCount: s.orderCount,
        totalAmount: Math.round(Number(s.amount) * 100),
        fee: Math.round(Number(s.platformFee) * 100),
        netAmount: Math.round((Number(s.amount) - Number(s.platformFee)) * 100),
        status: s.status,
        remark: s.remark,
        createdAt: s.createdAt,
      })),
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  async generateMerchantSettlement(
    dto: {
      merchantName?: string;
      merchantId?: string;
      period?: string;
      startAt?: string;
      endAt?: string;
      remark?: string;
    },
    operatorId?: string,
    ip?: string,
  ) {
    let merchantId = dto.merchantId;
    if (!merchantId && dto.merchantName) {
      const merchant = await this.prisma.merchant.findFirst({
        where: { name: dto.merchantName },
        select: { id: true },
      });
      if (!merchant) throw new NotFoundException("商家不存在");
      merchantId = merchant.id;
    }
    if (!merchantId) throw new BadRequestException("商家ID或名称必填");

    let startAt: Date, endAt: Date;
    if (dto.period) {
      const [y, m] = dto.period.split("-").map(Number);
      startAt = new Date(y, m - 1, 1);
      endAt = new Date(y, m, 0, 23, 59, 59);
    } else if (dto.startAt && dto.endAt) {
      startAt = new Date(dto.startAt);
      endAt = new Date(dto.endAt);
    } else {
      throw new BadRequestException("结算周期或起止日期必填");
    }

    const settlementNo = `MST${Date.now()}`;
    await this.prisma.merchantSettlement.create({
      data: {
        merchantId,
        settlementNo,
        amount: 0,
        platformFee: 0,
        startAt,
        endAt,
        status: "pending",
        remark: dto.remark,
      },
    });
    await this.logOperation(
      operatorId || "",
      "generate_settlement",
      "merchant",
      merchantId,
      "settlement",
      dto,
      ip,
    );
    return { success: true, settlementNo };
  }

  // ==================== 对账 ====================
  async reconciliations(query: any) {
    const { status, type, page = 1, pageSize = 20 } = query;
    const where: any = {};
    if (status) where.status = status;
    if (type) where.type = type;
    const [list, total] = await Promise.all([
      this.prisma.reconciliation.findMany({
        where,
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.reconciliation.count({ where }),
    ]);
    return {
      list: list.map((r) => ({
        id: r.id,
        reconciliationNo: r.reconciliationNo,
        type: r.type,
        startAt: r.startAt,
        endAt: r.endAt,
        totalAmount: Math.round(Number(r.totalAmount) * 100),
        platformFee: Math.round(Number(r.platformFee) * 100),
        netAmount: Math.round(Number(r.netAmount) * 100),
        orderCount: r.orderCount,
        status: r.status,
        remark: r.remark,
        createdAt: r.createdAt,
      })),
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  async createReconciliation(dto: any, operatorId?: string, ip?: string) {
    const reconNo = `REC${Date.now()}`;
    const recon = await this.prisma.reconciliation.create({
      data: {
        reconciliationNo: reconNo,
        type: dto.type,
        startAt: new Date(dto.startAt),
        endAt: new Date(dto.endAt),
        totalAmount: dto.totalAmount || 0,
        platformFee: dto.platformFee || 0,
        netAmount: (dto.totalAmount || 0) - (dto.platformFee || 0),
        orderCount: dto.orderCount || 0,
        status: "pending",
        detail: dto.detail,
        remark: dto.remark,
      },
    });
    await this.logOperation(
      operatorId || "",
      "create",
      "reconciliation",
      recon.id,
      "reconciliation",
      dto,
      ip,
    );
    return { success: true, reconciliationNo: reconNo, id: recon.id };
  }

  // ==================== 运营 ====================
  async notifications(query: any) {
    const { page = 1, pageSize = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.notification.findMany({
        include: { user: { select: { nickname: true } } },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.notification.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  // ==================== 消息 ====================
  async conversationDetail(id: string) {
    return this.prisma.conversation.findUnique({
      where: { id },
      include: { members: true },
    });
  }

  async violations(_query: any) {
    const reports = await this.prisma.report.findMany({
      where: { targetType: "message", status: "pending" },
      include: { reporter: { select: { id: true, nickname: true } } },
      take: 100,
      orderBy: { createdAt: "desc" },
    });
    return {
      list: reports.map((r) => ({
        id: r.id,
        reporterId: r.reporterId,
        reporterName: r.reporter?.nickname,
        targetId: r.targetId,
        reason: r.reason,
        detail: r.detail,
        status: r.status,
        createdAt: r.createdAt,
      })),
      total: reports.length,
    };
  }

  async unreadStats() {
    const [reportsCount, withdrawsCount, pendingPosts, pendingMerchants] =
      await Promise.all([
        this.prisma.report.count({ where: { status: "pending" } }),
        this.prisma.withdraw.count({ where: { status: "PENDING" } }),
        this.prisma.post.count({ where: { auditStatus: "pending" } }),
        this.prisma.merchant.count({ where: { status: "pending" } }),
      ]);
    return {
      privateUnread: 0,
      groupUnread: 0,
      systemUnread:
        reportsCount + withdrawsCount + pendingPosts + pendingMerchants,
      totalUnread:
        reportsCount + withdrawsCount + pendingPosts + pendingMerchants,
    };
  }

  // ==================== 系统：管理员管理 ====================
  async admins(query: any) {
    const { page = 1, pageSize = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.adminAccount.findMany({
        include: { roles: { include: { role: true } } },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.adminAccount.count(),
    ]);
    return {
      list: list.map((a) => ({
        id: a.id,
        username: a.username,
        realName: a.realName,
        avatar: a.avatar,
        phone: a.phone,
        email: a.email,
        roles: a.roles.map((r) => ({
          id: r.role.id,
          name: r.role.name,
          code: r.role.code,
        })),
        status: a.status === "active" ? 1 : 0,
        lastLoginAt: a.lastLoginAt,
        createdAt: a.createdAt,
      })),
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  async createAdmin(dto: any, operatorId?: string, ip?: string) {
    const existing = await this.prisma.adminAccount.findUnique({
      where: { username: dto.username },
    });
    if (existing) throw new ConflictException("用户名已存在");

    const hash = await bcrypt.hash(dto.password || "Admin@123456", 10);
    const account = await this.prisma.adminAccount.create({
      data: {
        username: dto.username,
        passwordHash: hash,
        realName: dto.realName || dto.username,
        phone: dto.phone,
        email: dto.email,
        avatar: dto.avatar,
        status: "active",
      },
    });

    // 支持多角色分配（roles为角色ID数组，优先于roleCode）
    const roleIds = dto.roles && Array.isArray(dto.roles) && dto.roles.length > 0
      ? dto.roles
      : [dto.roleCode || "admin"];
    for (const roleRef of roleIds) {
      const role = typeof roleRef === 'string' && roleRef.length > 10
        ? await this.prisma.adminRole.findUnique({ where: { id: roleRef } })
        : await this.prisma.adminRole.findFirst({ where: { OR: [{ code: roleRef }, { id: roleRef }] } });
      if (role) {
        await this.prisma.adminAccountRole.create({
          data: {
            accountId: account.id,
            roleId: role.id,
            regionId: dto.regionId || null,
          },
        });
      }
    }

    await this.logOperation(
      operatorId || "",
      "create_admin",
      "admin",
      account.id,
      "admin_account",
      { username: dto.username, roleCode: dto.roleCode || "admin" },
      ip,
    );
    return { success: true, id: account.id };
  }

  async updateAdmin(id: string, dto: any, operatorId?: string, ip?: string) {
    const data: any = {};
    if (dto.realName) data.realName = dto.realName;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.status)
      data.status =
        dto.status === 1 || dto.status === "active" ? "active" : "disabled";
    if (dto.password) data.passwordHash = await bcrypt.hash(dto.password, 10);

    await this.prisma.adminAccount.update({ where: { id }, data });
    await this.logOperation(
      operatorId || "",
      "update_admin",
      "admin",
      id,
      "admin_account",
      dto,
      ip,
    );

    if (dto.roleIds) {
      await this.prisma.adminAccountRole.deleteMany({
        where: { accountId: id },
      });
      await this.prisma.adminAccountRole.createMany({
        data: dto.roleIds.map((rid: string) => ({
          accountId: id,
          roleId: rid,
        })),
      });
    }
    return { success: true };
  }

  async deleteAdmin(id: string, operatorId?: string, ip?: string) {
    await this.prisma.adminAccount.update({
      where: { id },
      data: { status: "deleted" },
    });
    await this.logOperation(
      operatorId || "",
      "delete_admin",
      "admin",
      id,
      "admin_account",
      null,
      ip,
    );
    return { success: true };
  }

  async adminRoles() {
    const list = await this.prisma.adminRole.findMany({
      include: {
        permissions: { include: { permission: true } },
        menus: { include: { menu: true } },
      },
    });
    return {
      list: list.map((r) => ({
        id: r.id,
        name: r.name,
        code: r.code,
        description: r.description,
        isSystem: r.isSystem,
        sortOrder: r.sortOrder,
        permissions: r.permissions.map((p) => ({
          id: p.permission.id,
          code: p.permission.code,
          name: p.permission.name,
        })),
        menus: r.menus.map((m) => ({
          id: m.menu.id,
          name: m.menu.name,
          path: m.menu.path,
        })),
      })),
    };
  }

  async adminPermissions() {
    const list = await this.prisma.adminPermission.findMany({
      orderBy: { module: "asc" },
    });
    return { list };
  }

  async menuTree() {
    const menus = await this.prisma.adminMenu.findMany({
      orderBy: { sortOrder: "asc" },
      include: { children: { orderBy: { sortOrder: "asc" } } },
      where: { parentId: null },
    });
    return menus;
  }

  async auditLogs(query: any) {
    const { page = 1, pageSize = 20, accountId, module, action } = query;
    const where: any = {};
    if (accountId) where.accountId = accountId;
    if (module) where.module = module;
    if (action) where.action = action;

    const [list, total] = await Promise.all([
      this.prisma.adminOperationLog.findMany({
        where,
        include: {
          account: { select: { id: true, username: true, realName: true } },
        },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.adminOperationLog.count({ where }),
    ]);
    return {
      list: list.map((l) => ({
        id: l.id,
        accountId: l.accountId,
        username: l.account?.realName || l.account?.username,
        action: l.action,
        module: l.module,
        targetId: l.targetId,
        targetType: l.targetType,
        detail: l.detail,
        ip: l.ip,
        createdAt: l.createdAt,
      })),
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  async legacyAuditLogs(query: any) {
    const { page = 1, pageSize = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        include: { user: { select: { id: true, nickname: true } } },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.auditLog.count(),
    ]);
    return {
      list: list.map((l) => ({
        id: l.id,
        userId: l.userId,
        username: l.user?.nickname,
        module: l.module,
        action: l.action,
        targetId: l.targetId,
        detail: l.detail,
        ip: l.ip,
        createdAt: l.createdAt,
      })),
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  async getConfig(key: string) {
    const c = await this.prisma.config.findUnique({ where: { key } });
    return c?.value || {};
  }

  async setConfig(key: string, value: any, operatorId?: string, ip?: string) {
    await this.prisma.config.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
    await this.logOperation(
      operatorId || "",
      "update_config",
      "config",
      key,
      "config",
      { key },
      ip,
    );
    return { success: true };
  }

  async testStorageConfig(dto: any) {
    const saved = (await this.getConfig("storage")) as Record<string, any>;
    const config = { ...(saved || {}), ...(dto || {}) };
    const secretId = String(
      config.secretId || config.accessKey || config.COS_SECRET_ID || "",
    ).trim();
    const secretKey = String(
      config.secretKey || config.COS_SECRET_KEY || "",
    ).trim();
    const bucket = String(config.bucket || config.COS_BUCKET || "").trim();
    const region = String(
      config.region || config.endpoint || config.COS_REGION || "",
    ).trim();

    const missing: string[] = [];
    if (!secretId) missing.push("SecretId");
    if (!secretKey) missing.push("SecretKey");
    if (!bucket) missing.push("存储桶 Bucket");
    if (!region) missing.push("所属地域 Region");
    if (missing.length) {
      throw new BadRequestException(
        `COS 配置不完整，缺少：${missing.join("、")}`,
      );
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const COS = require("cos-nodejs-sdk-v5");
      const cos = new COS({ SecretId: secretId, SecretKey: secretKey });
      await new Promise((resolve, reject) => {
        cos.headBucket(
          { Bucket: bucket, Region: region },
          (err: any, data: any) => {
            if (err) reject(err);
            else resolve(data);
          },
        );
      });
      return { success: true, message: "腾讯云 COS 连接成功，存储桶可访问" };
    } catch (err: any) {
      const code = err?.code || err?.name || "";
      const message = err?.message || err?.error || "未知错误";
      const hints: Record<string, string> = {
        NoSuchBucket: "存储桶不存在或 Bucket 名称填写错误",
        AccessDenied:
          "SecretId/SecretKey 权限不足，请确认 CAM 授权包含 COS 访问权限",
        InvalidAccessKeyId: "SecretId 错误或密钥已被禁用",
        SignatureDoesNotMatch: "SecretKey 错误，签名校验失败",
        InvalidRegion: "所属地域 Region 填写错误",
      };
      throw new BadRequestException(
        `COS 测试失败：${hints[code] || message}${code ? `（${code}）` : ""}`,
      );
    }
  }

  // ==================== 城市代理管理 ====================
  async cityAgentApplications(query: any) {
    const { status, page = 1, pageSize = 20 } = query;
    const where: any = {};
    if (status) where.status = status;
    const [list, total] = await Promise.all([
      this.prisma.cityAgentApplication.findMany({
        where,
        include: {
          user: { select: { nickname: true, phone: true } },
          region: { select: { name: true } },
        },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.cityAgentApplication.count({ where }),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  async auditCityAgentApplication(
    id: string,
    dto: { status: string; reason?: string },
    operatorId?: string,
    ip?: string,
  ) {
    const app = await this.prisma.cityAgentApplication.findUnique({
      where: { id },
    });
    if (!app) throw new NotFoundException("申请不存在");

    const newStatus = dto.status === "approved" ? "approved" : "rejected";
    await this.prisma.cityAgentApplication.update({
      where: { id },
      data: {
        status: newStatus,
        rejectReason: dto.reason,
        approvedAt: newStatus === "approved" ? new Date() : null,
      },
    });

    if (newStatus === "approved") {
      const existing = await this.prisma.cityAgent.findUnique({
        where: { userId: app.userId },
      });
      if (!existing) {
        await this.prisma.cityAgent.create({
          data: {
            userId: app.userId,
            regionId: app.regionId,
            realName: app.realName,
            phone: app.phone,
            status: "active",
          },
        });
      }
    }

    await this.logOperation(
      operatorId || "",
      "audit_city_agent",
      "city_agent",
      id,
      "city_agent_application",
      { status: dto.status, reason: dto.reason },
      ip,
    );
    return { success: true };
  }

  async cityAgents(query: any) {
    const { status, regionId, page = 1, pageSize = 20 } = query;
    const where: any = {};
    if (status) where.status = status;
    if (regionId) where.regionId = regionId;
    const [list, total] = await Promise.all([
      this.prisma.cityAgent.findMany({
        where,
        include: {
          user: { select: { nickname: true } },
          region: { select: { name: true } },
          settlements: { take: 5, orderBy: { createdAt: "desc" } },
        },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.cityAgent.count({ where }),
    ]);
    return {
      list: list.map((a) => ({
        id: a.id,
        userId: a.userId,
        userNickname: a.user?.nickname,
        regionId: a.regionId,
        regionName: a.region?.name,
        realName: a.realName,
        phone: a.phone,
        commissionRate: Number(a.commissionRate),
        totalCommission: Number(a.totalCommission),
        settledAmount: Number(a.settledAmount),
        pendingAmount: Number(a.pendingAmount),
        status: a.status,
        createdAt: a.createdAt,
      })),
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  async cityAgentDetail(id: string) {
    const a = await this.prisma.cityAgent.findUnique({
      where: { id },
      include: {
        user: { select: { nickname: true } },
        region: { select: { name: true } },
        settlements: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!a) throw new NotFoundException("代理不存在");
    return a;
  }

  async getCityAgentSettlements(query: any) {
    const { agentId, status, page = 1, pageSize = 20 } = query;
    const where: any = {};
    if (agentId) where.agentId = agentId;
    if (status) where.status = status;
    const [list, total] = await Promise.all([
      this.prisma.cityAgentSettlement.findMany({
        where,
        include: { agent: { select: { realName: true } } },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.cityAgentSettlement.count({ where }),
    ]);
    return {
      list: list.map((s) => ({
        id: s.id,
        settlementNo: s.settlementNo,
        agentName: s.agent?.realName,
        settlementMonth: s.startAt
          ? s.startAt.toISOString().slice(0, 7)
          : "",
        amount: Number(s.amount),
        status: s.status,
        remark: s.remark,
        createdAt: s.createdAt,
      })),
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  async createCityAgentSettlement(
    dto: {
      agentId?: string;
      agentName?: string;
      amount: number;
      startAt?: string;
      endAt?: string;
      settlementMonth?: string;
      remark?: string;
    },
    operatorId?: string,
    ip?: string,
  ) {
    let agentId = dto.agentId;
    if (!agentId && dto.agentName) {
      const agent = await this.prisma.cityAgent.findFirst({
        where: { realName: dto.agentName },
        select: { id: true },
      });
      if (!agent) throw new NotFoundException("代理人不存在");
      agentId = agent.id;
    }
    if (!agentId) throw new BadRequestException("代理人ID或名称必填");

    let startAt: Date, endAt: Date;
    if (dto.settlementMonth) {
      const [y, m] = dto.settlementMonth.split("-").map(Number);
      startAt = new Date(y, m - 1, 1);
      endAt = new Date(y, m, 0, 23, 59, 59);
    } else if (dto.startAt && dto.endAt) {
      startAt = new Date(dto.startAt);
      endAt = new Date(dto.endAt);
    } else {
      throw new BadRequestException("结算月份或起止日期必填");
    }

    const settlementNo = `STL${Date.now()}`;
    await this.prisma.cityAgentSettlement.create({
      data: {
        agentId,
        settlementNo,
        amount: dto.amount,
        startAt,
        endAt,
        status: "pending",
        remark: dto.remark,
      },
    });
    await this.logOperation(
      operatorId || "",
      "create_settlement",
      "city_agent",
      agentId,
      "settlement",
      dto,
      ip,
    );
    return { success: true, settlementNo };
  }

  async cityAgentLedger(query: any) {
    const { agentId, page = 1, pageSize = 20 } = query;
    const where: any = {};
    if (agentId) where.agentId = agentId;
    const [list, total] = await Promise.all([
      this.prisma.cityAgentSettlement.findMany({
        where,
        include: { agent: { select: { realName: true } } },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.cityAgentSettlement.count({ where }),
    ]);
    return {
      list: list.map((s) => ({
        id: s.id,
        settlementNo: s.settlementNo,
        agentName: s.agent?.realName,
        amount: Math.round(Number(s.amount) * 100),
        status: s.status,
        startAt: s.startAt,
        endAt: s.endAt,
        orderCount: s.orderCount,
        transferNo: s.transferNo,
        remark: s.remark,
        createdAt: s.createdAt,
      })),
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  async cityAgentOperations(query: any) {
    const { page = 1, pageSize = 20 } = query;
    const where: any = { module: "city_agent" };
    const [list, total] = await Promise.all([
      this.prisma.adminOperationLog.findMany({
        where,
        include: { account: { select: { realName: true, username: true } } },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.adminOperationLog.count({ where }),
    ]);
    return {
      list: list.map((l) => ({
        id: l.id,
        operator: l.account?.realName || l.account?.username,
        action: l.action,
        targetId: l.targetId,
        targetType: l.targetType,
        detail: l.detail,
        createdAt: l.createdAt,
      })),
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  // ==================== 分类管理 ====================
  async createCategory(dto: any) {
    const {
      parentId,
      name,
      icon,
      sortOrder,
      type = "product",
      status = "active",
    } = dto;
    const data: any = { name, icon, sortOrder: sortOrder ?? 0, type, status };
    if (parentId) data.parentId = parentId;
    const item = await this.prisma.category.create({ data });
    return { success: true, data: item };
  }

  async updateCategory(id: string, dto: any) {
    const { parentId, name, icon, sortOrder, type, status } = dto;
    const data: any = {};
    if (name !== undefined) data.name = name;
    if (icon !== undefined) data.icon = icon;
    if (sortOrder !== undefined) data.sortOrder = sortOrder;
    if (type !== undefined) data.type = type;
    if (status !== undefined) data.status = status;
    if (parentId !== undefined) data.parentId = parentId;
    const item = await this.prisma.category.update({ where: { id }, data });
    return { success: true, data: item };
  }

  async deleteCategory(id: string) {
    const children = await this.prisma.category.count({
      where: { parentId: id },
    });
    const products = await this.prisma.product.count({
      where: { categoryId: id },
    });
    if (children > 0 || products > 0) {
      await this.prisma.category.update({
        where: { id },
        data: { status: "deleted" },
      });
      return { success: true, message: "分类已软删除（存在子分类或关联商品）" };
    }
    await this.prisma.category.delete({ where: { id } });
    return { success: true, message: "分类已删除" };
  }

  // ==================== 商品管理 ====================
  async createProduct(dto: any, operatorId?: string, ip?: string) {
    const {
      merchantId,
      categoryId,
      name,
      images,
      detail,
      price,
      originPrice,
      stock,
      unit,
      weight,
      status = "on_sale",
      skus = [],
    } = dto;
    const product = await this.prisma.product.create({
      data: {
        merchantId,
        categoryId,
        name,
        images,
        detail,
        price,
        originPrice,
        stock,
        unit,
        weight,
        status,
        skus:
          skus.length > 0
            ? {
                create: skus.map((s: any) => ({
                  specs: s.specs,
                  price: s.price,
                  originPrice: s.originPrice,
                  stock: s.stock,
                  image: s.image,
                  status: s.status || "on_sale",
                })),
              }
            : undefined,
      },
      include: { skus: true },
    });
    if (operatorId)
      await this.logOperation(
        operatorId,
        "CREATE",
        "product",
        product.id,
        "product",
        { name },
        ip,
      );
    return { success: true, data: product };
  }

  async updateProduct(id: string, dto: any) {
    const {
      categoryId,
      name,
      images,
      detail,
      price,
      originPrice,
      stock,
      unit,
      weight,
      status,
      skus,
    } = dto;
    const data: any = {};
    if (categoryId !== undefined) data.categoryId = categoryId;
    if (name !== undefined) data.name = name;
    if (images !== undefined) data.images = images;
    if (detail !== undefined) data.detail = detail;
    if (price !== undefined) data.price = price;
    if (originPrice !== undefined) data.originPrice = originPrice;
    if (stock !== undefined) data.stock = stock;
    if (unit !== undefined) data.unit = unit;
    if (weight !== undefined) data.weight = weight;
    if (status !== undefined) data.status = status;
    const product = await this.prisma.product.update({
      where: { id },
      data,
      include: { skus: true },
    });
    if (skus && Array.isArray(skus)) {
      for (const s of skus) {
        if (s.id) {
          await this.prisma.sKU.update({
            where: { id: s.id },
            data: {
              specs: s.specs,
              price: s.price,
              originPrice: s.originPrice,
              stock: s.stock,
              image: s.image,
              status: s.status,
            },
          });
        }
      }
    }
    return { success: true, data: product };
  }

  async updateProductStatus(id: string, status: number | string) {
    const product = await this.prisma.product.update({
      where: { id },
      data: { status: String(status) },
    });
    return { success: true, data: product };
  }

  async auditProduct(id: string, dto: any, operatorId?: string, ip?: string) {
    const { status, reason } = dto;
    const product = await this.prisma.product.update({
      where: { id },
      data: { status: status === "approved" ? "on_sale" : "off_sale" },
    });
    if (operatorId)
      await this.logOperation(
        operatorId,
        status === "approved" ? "APPROVE" : "REJECT",
        "product",
        id,
        "product",
        { reason },
        ip,
      );
    return { success: true, data: product };
  }

  async productStockAlerts(q: any) {
    const { page = 1, pageSize = 20, alertStock = 10 } = q;
    const where = { stock: { lt: +alertStock }, status: { not: "deleted" } };
    const [list, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        include: { merchant: true, category: true },
      }),
      this.prisma.product.count({ where }),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  // ==================== 订单管理 ====================
  async cancelOrder(id: string, dto: any, operatorId?: string, ip?: string) {
    const { reason } = dto || {};
    const order = await this.prisma.order.update({
      where: { id },
      data: {
        status: "CANCELLED",
        cancelTime: new Date(),
        cancelReason: reason || "管理员取消",
      },
    });
    await this.prisma.orderLog.create({
      data: {
        orderId: id,
        action: "CANCELLED",
        fromStatus: order.status,
        toStatus: "CANCELLED",
        operatorId: operatorId || "system",
        operatorType: "admin",
        remark: reason,
      },
    });
    if (operatorId)
      await this.logOperation(
        operatorId,
        "CANCEL",
        "order",
        id,
        "order",
        { reason },
        ip,
      );
    return { success: true, data: order };
  }

  async updateOrderStatus(id: string, status: string) {
    const validTransitions: Record<string, string[]> = {
      PENDING_PAY: ["PAID", "CANCELLED"],
      PAID: ["SHIPPED", "REFUNDING", "CANCELLED"],
      SHIPPED: ["DELIVERED", "REFUNDING"],
      DELIVERED: ["RECEIVED", "COMPLETED"],
      RECEIVED: ["COMPLETED"],
      REFUNDING: ["REFUNDED"],
    };
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new Error("订单不存在");
    const allowed = validTransitions[order.status] || [];
    if (!allowed.includes(status))
      throw new Error(`非法状态流转: ${order.status} -> ${status}`);
    const updated = await this.prisma.order.update({
      where: { id },
      data: { status: status as any },
    });
    await this.prisma.orderLog.create({
      data: {
        orderId: id,
        action: status,
        fromStatus: order.status,
        toStatus: status,
        operatorType: "admin",
      },
    });
    return { success: true, data: updated };
  }

  // ==================== 退款管理 ====================
  async completeRefund(id: string, dto: any, operatorId?: string, ip?: string) {
    const { transferNo } = dto || {};
    const refund = await this.prisma.refund.update({
      where: { id },
      data: { status: "completed", refundTime: new Date() },
    });
    if (operatorId)
      await this.logOperation(
        operatorId,
        "COMPLETE",
        "refund",
        id,
        "refund",
        { transferNo },
        ip,
      );
    return { success: true, data: refund };
  }

  // ==================== 签到配置 ====================
  async signConfigs(q: any) {
    const { page = 1, pageSize = 20 } = q;
    const [list, total] = await Promise.all([
      this.prisma.punchInConfig.findMany({
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
      }),
      this.prisma.punchInConfig.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  async createSignConfig(dto: any) {
    const item = await this.prisma.punchInConfig.create({ data: dto });
    return { success: true, data: item };
  }

  async updateSignConfig(id: string, dto: any) {
    const item = await this.prisma.punchInConfig.update({
      where: { id },
      data: dto,
    });
    return { success: true, data: item };
  }

  async deleteSignConfig(id: string) {
    await this.prisma.punchInConfig.delete({ where: { id } });
    return { success: true };
  }

  // ==================== 徽章管理 ====================
  async badges(q: any) {
    const { page = 1, pageSize = 20 } = q;
    const [list, total] = await Promise.all([
      this.prisma.badge.findMany({
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
      }),
      this.prisma.badge.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  async createBadge(dto: any) {
    const item = await this.prisma.badge.create({ data: dto });
    return { success: true, data: item };
  }

  async updateBadge(id: string, dto: any) {
    const item = await this.prisma.badge.update({ where: { id }, data: dto });
    return { success: true, data: item };
  }

  async deleteBadge(id: string) {
    await this.prisma.badge.delete({ where: { id } });
    return { success: true };
  }

  // ==================== 团购管理 ====================
  async groupBuys(q: any) {
    const { page = 1, pageSize = 20, status } = q;
    const where: any = {};
    if (status !== undefined) where.status = status;
    const [list, total] = await Promise.all([
      this.prisma.groupBuyPackage.findMany({
        where,
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
      }),
      this.prisma.groupBuyPackage.count({ where }),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  async createGroupBuy(dto: any) {
    const item = await this.prisma.groupBuyPackage.create({ data: dto });
    return { success: true, data: item };
  }

  async updateGroupBuy(id: string, dto: any) {
    const item = await this.prisma.groupBuyPackage.update({
      where: { id },
      data: dto,
    });
    return { success: true, data: item };
  }

  // ==================== 分享邀请 ====================
  async shareInvites(q: any) {
    const { page = 1, pageSize = 20 } = q;
    const [list, total] = await Promise.all([
      this.prisma.shareSettings.findMany({
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
      }),
      this.prisma.shareSettings.count(),
    ]);
    return {
      list: list.length ? list : [],
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  async createShareInvite(dto: any) {
    const item = await this.prisma.shareSettings.create({ data: dto });
    return { success: true, data: item };
  }

  async updateShareInvite(id: string, dto: any) {
    const item = await this.prisma.shareSettings.update({
      where: { id },
      data: dto,
    });
    return { success: true, data: item };
  }

  // ==================== 通知管理 ====================
  async createNotification(dto: any) {
    const { userId, type, title, content, data } = dto;
    const item = await this.prisma.notification.create({
      data: { userId, type, title, content, data },
    });
    return { success: true, data: item };
  }

  async updateNotification(id: string, dto: any) {
    const item = await this.prisma.notification.update({
      where: { id },
      data: dto,
    });
    return { success: true, data: item };
  }

  async sendNotification(id: string) {
    return {
      code: 501,
      message: "系统通知广播需通过消息推送服务实现，当前仅支持单用户通知创建",
    };
  }

  async deleteNotification(id: string) {
    await this.prisma.notification.delete({ where: { id } });
    return { success: true };
  }

  // ==================== 会话管理 ====================
  async conversationList(q: any) {
    const { page = 1, pageSize = 20, keyword } = q;
    const where: any = {};
    if (keyword) {
      where.OR = [
        { title: { contains: keyword } },
        { lastMessage: { contains: keyword } },
      ];
    }
    const [list, total] = await Promise.all([
      this.prisma.conversation.findMany({
        where,
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        include: {
          members: {
            include: {
              user: { select: { id: true, nickname: true, avatar: true } },
            },
          },
        },
      }),
      this.prisma.conversation.count({ where }),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  async blockConversation(id: string) {
    await this.prisma.conversation.update({
      where: { id },
      data: { isBlocked: true },
    });
    return { success: true };
  }

  async unblockConversation(id: string) {
    await this.prisma.conversation.update({
      where: { id },
      data: { isBlocked: false },
    });
    return { success: true };
  }

  // ==================== 消息管理 ====================
  async messageHistory(q: any) {
    const { page = 1, pageSize = 20, conversationId, keyword } = q;
    const where: any = {};
    if (conversationId) where.conversationId = conversationId;
    if (keyword) where.content = { contains: keyword };
    const [list, total] = await Promise.all([
      this.prisma.message.findMany({
        where,
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        include: {
          sender: { select: { id: true, nickname: true, avatar: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.message.count({ where }),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  async recallMessage(dto: any) {
    const { conversationId, messageId } = dto;
    await this.prisma.message.updateMany({
      where: { id: messageId, conversationId },
      data: { isRecalled: true, recalledAt: new Date() },
    });
    return { success: true };
  }

  // ==================== 违规处理 ====================
  async handleViolation(id: string, dto: any) {
    const { status, result } = dto;
    // 违规记录暂无独立表，暂时记录到 AuditRecord
    await this.prisma.auditRecord.create({
      data: { targetType: "report", targetId: id, status, reason: result },
    });
    return { success: true };
  }

  // ==================== 管理员管理 ====================
  async resetAdminPassword(
    id: string,
    dto: any,
    operatorId?: string,
    ip?: string,
  ) {
    const { password } = dto;
    const bcrypt = await import("bcrypt");
    const passwordHash = await bcrypt.hash(password, 10);
    await this.prisma.adminAccount.update({
      where: { id },
      data: { passwordHash },
    });
    if (operatorId)
      await this.logOperation(
        operatorId,
        "RESET_PASSWORD",
        "admin",
        id,
        "admin_account",
        {},
        ip,
      );
    return { success: true };
  }

  async adminStatus(id: string, status: string | number) {
    const statusStr = status === 1 || status === '1' ? 'active' : 'disabled';
    await this.prisma.adminAccount.update({ where: { id }, data: { status: statusStr } });
    return { success: true };
  }

  async batchAdmins(dto: any, operatorId?: string, ip?: string) {
    const { ids, action, value } = dto;
    if (!ids || !Array.isArray(ids))
      return { code: 400, message: "缺少 ids 参数" };
    if (action === "delete") {
      await this.prisma.adminAccount.deleteMany({ where: { id: { in: ids } } });
    } else if (action === "status") {
      await this.prisma.adminAccount.updateMany({
        where: { id: { in: ids } },
        data: { status: value },
      });
    }
    if (operatorId)
      await this.logOperation(
        operatorId,
        "BATCH",
        "admin",
        ids.join(","),
        "admin_account",
        { action, value },
        ip,
      );
    return { success: true };
  }

  // ==================== 角色/菜单管理 ====================
  async createRole(dto: any) {
    const { name, code, description, permissions = [] } = dto;
    const role = await this.prisma.adminRole.create({
      data: { name, code, description },
    });
    if (permissions.length > 0) {
      await this.prisma.adminRolePermission.createMany({
        data: permissions.map((pid: string) => ({
          roleId: role.id,
          permissionId: pid,
        })),
      });
    }
    return { success: true, data: role };
  }

  async updateRole(id: string, dto: any) {
    const { name, code, description, permissions } = dto;
    const data: any = {};
    if (name !== undefined) data.name = name;
    if (code !== undefined) data.code = code;
    if (description !== undefined) data.description = description;
    const role = await this.prisma.adminRole.update({ where: { id }, data });
    if (permissions && Array.isArray(permissions)) {
      await this.prisma.adminRolePermission.deleteMany({
        where: { roleId: id },
      });
      if (permissions.length > 0) {
        await this.prisma.adminRolePermission.createMany({
          data: permissions.map((pid: string) => ({
            roleId: id,
            permissionId: pid,
          })),
        });
      }
    }
    return { success: true, data: role };
  }

  async deleteRole(id: string) {
    await this.prisma.adminRole.delete({ where: { id } });
    return { success: true };
  }

  async createMenu(dto: any) {
    const item = await this.prisma.adminMenu.create({ data: dto });
    return { success: true, data: item };
  }

  async updateMenu(id: string, dto: any) {
    const item = await this.prisma.adminMenu.update({
      where: { id },
      data: dto,
    });
    return { success: true, data: item };
  }

  async deleteMenu(id: string) {
    await this.prisma.adminMenu.delete({ where: { id } });
    return { success: true };
  }

  // ==================== 用户扩展 ====================
  async batchUsers(dto: any, operatorId?: string, ip?: string) {
    const { ids, action, value } = dto;
    if (!ids || !Array.isArray(ids))
      return { code: 400, message: "缺少 ids 参数" };
    if (action === "ban") {
      await this.prisma.user.updateMany({
        where: { id: { in: ids } },
        data: { status: "BANNED" },
      });
    } else if (action === "unban") {
      await this.prisma.user.updateMany({
        where: { id: { in: ids } },
        data: { status: "ACTIVE" },
      });
    } else if (action === "mute") {
      await this.prisma.user.updateMany({
        where: { id: { in: ids } },
        data: {
          muteEndAt: new Date(Date.now() + (value?.hours || 24) * 3600000),
          muteReason: value?.reason || "批量禁言",
        },
      });
    } else if (action === "tag") {
      for (const uid of ids) {
        await this.prisma.userTag.upsert({
          where: {
            userId_name: { userId: uid, name: value?.name || "批量标签" },
          },
          update: {},
          create: {
            userId: uid,
            name: value?.name || "批量标签",
            color: value?.color,
          },
        });
      }
    }
    if (operatorId)
      await this.logOperation(
        operatorId,
        "BATCH",
        "user",
        ids.join(","),
        "user",
        { action, value },
        ip,
      );
    return { success: true };
  }

  async userBalanceLogs(id: string, q: any) {
    const { page = 1, pageSize = 20, type } = q;
    const where: any = { userId: id };
    if (type) where.type = type;
    const [list, total] = await Promise.all([
      this.prisma.walletTransaction.findMany({
        where,
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.walletTransaction.count({ where }),
    ]);
    return {
      list: list.map((t: any) => ({
        ...t,
        amount: Number(t.amount),
        balance: Number(t.balance),
      })),
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  async userBalanceAdjust(dto: any, operatorId?: string, ip?: string) {
    const { userId, amount, remark } = dto;
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) return { code: 404, message: "用户钱包不存在" };
    const newBalance = Number(wallet.balance) + Number(amount);
    if (newBalance < 0) return { code: 400, message: "余额不能为负数" };
    await this.prisma.$transaction(async (tx) => {
      await tx.wallet.update({
        where: { userId },
        data: {
          balance: newBalance,
          totalIn: amount > 0 ? { increment: amount } : undefined,
          totalOut: amount < 0 ? { increment: Math.abs(amount) } : undefined,
        },
      });
      await tx.walletTransaction.create({
        data: {
          userId,
          type: amount > 0 ? "RECHARGE" : "PENALTY",
          amount: Math.abs(amount),
          balance: newBalance,
          description: remark || "管理员调整余额",
        },
      });
    });
    if (operatorId)
      await this.logOperation(
        operatorId,
        "BALANCE_ADJUST",
        "user",
        userId,
        "user",
        { amount, remark },
        ip,
      );
    return { success: true, newBalance };
  }

  async userFollows(id: string, q: any) {
    const { page = 1, pageSize = 20 } = q;
    const [list, total] = await Promise.all([
      this.prisma.follow.findMany({
        where: { followerId: id },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        include: {
          following: { select: { id: true, nickname: true, avatar: true } },
        },
      }),
      this.prisma.follow.count({ where: { followerId: id } }),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  async userFans(id: string, q: any) {
    const { page = 1, pageSize = 20 } = q;
    const [list, total] = await Promise.all([
      this.prisma.follow.findMany({
        where: { followingId: id },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        include: {
          follower: { select: { id: true, nickname: true, avatar: true } },
        },
      }),
      this.prisma.follow.count({ where: { followingId: id } }),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  async userBrowseHistory(id: string, q: any) {
    const { page = 1, pageSize = 20 } = q;
    const [list, total] = await Promise.all([
      this.prisma.browseHistory.findMany({
        where: { userId: id },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.browseHistory.count({ where: { userId: id } }),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  // ==================== 帖子扩展 ====================
  async toggleEssence(id: string) {
    const post = await this.prisma.post.findUnique({ where: { id } });
    if (!post) return { code: 404, message: "帖子不存在" };
    const updated = await this.prisma.post.update({
      where: { id },
      data: { isEssence: !post.isEssence },
    });
    return { success: true, data: updated };
  }

  async batchPosts(dto: any, operatorId?: string, ip?: string) {
    const { ids, action, value } = dto;
    if (!ids || !Array.isArray(ids))
      return { code: 400, message: "缺少 ids 参数" };
    if (action === "delete") {
      await this.prisma.post.updateMany({
        where: { id: { in: ids } },
        data: { status: "DELETED", deletedAt: new Date() },
      });
    } else if (action === "audit") {
      await this.prisma.post.updateMany({
        where: { id: { in: ids } },
        data: {
          status: value === "approved" ? "PUBLISHED" : "REJECTED",
          auditStatus: value,
        },
      });
    } else if (action === "top") {
      await this.prisma.post.updateMany({
        where: { id: { in: ids } },
        data: { isTop: value === true || value === "true" || value === 1 },
      });
    }
    if (operatorId)
      await this.logOperation(
        operatorId,
        "BATCH",
        "post",
        ids.join(","),
        "post",
        { action, value },
        ip,
      );
    return { success: true };
  }

  async getHotPosts(q?: any) {
    const { page = 1, pageSize = 20 } = q || {};
    const [list, total] = await Promise.all([
      this.prisma.post.findMany({
        where: { status: "PUBLISHED", deletedAt: null },
        orderBy: [{ viewCount: "desc" }, { likeCount: "desc" }],
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        include: {
          user: { select: { id: true, nickname: true, avatar: true } },
          media: true,
        },
      }),
      this.prisma.post.count({
        where: { status: "PUBLISHED", deletedAt: null },
      }),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  async updateHot(dto: any) {
    const { postIds } = dto;
    if (!Array.isArray(postIds))
      return { code: 400, message: "postIds 必须是数组" };
    await this.prisma.post.updateMany({
      where: { id: { in: postIds } },
      data: { isEssence: true },
    });
    return { success: true };
  }

  // ==================== 圈子管理 ====================
  async createCircle(dto: any) {
    const {
      name,
      icon,
      cover,
      description,
      regionId,
      joinType,
      maxMembers,
      tags,
    } = dto;
    const circle = await this.prisma.circle.create({
      data: {
        name,
        icon,
        cover,
        description,
        regionId,
        joinType,
        maxMembers,
        tags,
      },
    });
    return { success: true, data: circle };
  }

  async updateCircle(id: string, dto: any) {
    const {
      name,
      icon,
      cover,
      description,
      regionId,
      joinType,
      maxMembers,
      tags,
    } = dto;
    const data: any = {};
    if (name !== undefined) data.name = name;
    if (icon !== undefined) data.icon = icon;
    if (cover !== undefined) data.cover = cover;
    if (description !== undefined) data.description = description;
    if (regionId !== undefined) data.regionId = regionId;
    if (joinType !== undefined) data.joinType = joinType;
    if (maxMembers !== undefined) data.maxMembers = maxMembers;
    if (tags !== undefined) data.tags = tags;
    const circle = await this.prisma.circle.update({ where: { id }, data });
    return { success: true, data: circle };
  }

  async updateCircleStatus(id: string, status: number | string) {
    const circle = await this.prisma.circle.update({
      where: { id },
      data: { status: String(status) },
    });
    return { success: true, data: circle };
  }

  // ==================== 配置管理 ====================
  async getConfigs(key?: string) {
    return this.getConfig(key || "default");
  }
  async updateConfigs(dto: any, operatorId?: string, ip?: string) {
    return this.setConfig(dto.key || "default", dto, operatorId, ip);
  }

  // ==================== 区域扩展 ====================
  async batchRegions(dto: any, operatorId?: string, ip?: string) {
    const { ids, action } = dto;
    if (!ids || !Array.isArray(ids))
      throw new BadRequestException("缺少 ids 参数");
    const regionIds = ids.map((id: unknown) => String(id)).filter(Boolean);
    if (regionIds.length === 0) throw new BadRequestException("请选择区域");

    const value = dto.value ?? dto.data?.status;
    if (action === "delete") {
      // 检查默认区域
      const defaultRegions = await this.prisma.region.findMany({
        where: { id: { in: regionIds }, code: 'default' },
        select: { id: true, name: true },
      });
      if (defaultRegions.length > 0) {
        throw new BadRequestException(
          `默认区域不允许删除: ${defaultRegions.map((r) => r.name).join('、')}`,
        );
      }
      // 检查关联数据
      const relatedPosts = await this.prisma.post.count({
        where: { regionId: { in: regionIds } },
      });
      if (relatedPosts > 0) {
        throw new BadRequestException(
          `选中区域共有 ${relatedPosts} 个关联帖子，请先清理后再删除`,
        );
      }
      await this.prisma.region.deleteMany({ where: { id: { in: regionIds } } });
    } else if (action === "status" || action === "enable" || action === "disable") {
      const isOpen =
        action === "enable"
          ? true
          : action === "disable"
            ? false
            : value === true || value === "true" || value === 1 || value === "1";
      await this.prisma.region.updateMany({
        where: { id: { in: regionIds } },
        data: { isOpen },
      });
    } else {
      throw new BadRequestException(`不支持的批量操作: ${action}`);
    }
    if (operatorId)
      await this.logOperation(
        operatorId,
        "BATCH",
        "region",
        regionIds.join(","),
        "region",
        { action, value },
        ip,
      );
    return { success: true };
  }

  async deleteRegion(id: string, operatorId?: string, ip?: string) {
    const region = await this.prisma.region.findUnique({
      where: { id },
      select: { id: true, name: true, code: true },
    });
    if (!region) throw new NotFoundException("区域不存在");
    if (region.code === 'default') {
      throw new BadRequestException("默认区域不允许删除");
    }

    // 检查关联数据
    const [
      postCount,
      circleCount,
      merchantCount,
      activityCount,
      secondHandCount,
    ] = await Promise.all([
      this.prisma.post.count({ where: { regionId: id } }),
      this.prisma.circle.count({ where: { regionId: id } }),
      this.prisma.merchant.count({ where: { regionId: id } }),
      this.prisma.activity.count({ where: { regionId: id } }),
      this.prisma.secondHand.count({ where: { regionId: id } }),
    ]);

    const relatedCounts = [
      { name: '帖子', count: postCount },
      { name: '圈子', count: circleCount },
      { name: '商家', count: merchantCount },
      { name: '活动', count: activityCount },
      { name: '二手商品', count: secondHandCount },
    ].filter((c) => c.count > 0);

    if (relatedCounts.length > 0) {
      const detail = relatedCounts.map((c) => `${c.name} ${c.count} 个`).join('、');
      throw new BadRequestException(
        `该区域存在关联数据，禁止删除（${detail}）。请先清理关联数据后再删除。`,
      );
    }

    await this.prisma.region.delete({ where: { id } });
    if (operatorId) {
      await this.logOperation(
        operatorId,
        "DELETE",
        "region",
        id,
        "region",
        { name: region.name, code: region.code },
        ip,
      );
    }
    return { success: true };
  }

  async regionContentItems(regionId: string) {
    const items = await this.prisma.regionContentItem.findMany({
      where: { regionId },
      orderBy: { sortOrder: "asc" },
    });
    return { success: true, data: items };
  }

  async saveRegionContentItem(dto: any, operatorId?: string, ip?: string) {
    const item = await this.prisma.regionContentItem.create({ data: dto });
    if (operatorId)
      await this.logOperation(
        operatorId,
        "CREATE",
        "region_content",
        item.id,
        "region_content_item",
        dto,
        ip,
      );
    return { success: true, data: item };
  }

  async updateRegionContentItem(
    id: string,
    dto: any,
    operatorId?: string,
    ip?: string,
  ) {
    const item = await this.prisma.regionContentItem.update({
      where: { id },
      data: dto,
    });
    if (operatorId)
      await this.logOperation(
        operatorId,
        "UPDATE",
        "region_content",
        id,
        "region_content_item",
        dto,
        ip,
      );
    return { success: true, data: item };
  }

  async deleteRegionContentItem(id: string, operatorId?: string, ip?: string) {
    await this.prisma.regionContentItem.delete({ where: { id } });
    if (operatorId)
      await this.logOperation(
        operatorId,
        "DELETE",
        "region_content",
        id,
        "region_content_item",
        {},
        ip,
      );
    return { success: true };
  }

  async regionBanners(regionId: string) {
    const items = await this.prisma.regionBanner.findMany({
      where: { regionId },
      orderBy: { sortOrder: "asc" },
    });
    return { success: true, data: items };
  }

  async saveRegionBanner(dto: any, operatorId?: string, ip?: string) {
    const item = await this.prisma.regionBanner.create({ data: dto });
    if (operatorId)
      await this.logOperation(
        operatorId,
        "CREATE",
        "region_banner",
        item.id,
        "region_banner",
        dto,
        ip,
      );
    return { success: true, data: item };
  }

  async updateRegionBanner(
    id: string,
    dto: any,
    operatorId?: string,
    ip?: string,
  ) {
    const item = await this.prisma.regionBanner.update({
      where: { id },
      data: dto,
    });
    if (operatorId)
      await this.logOperation(
        operatorId,
        "UPDATE",
        "region_banner",
        id,
        "region_banner",
        dto,
        ip,
      );
    return { success: true, data: item };
  }

  async deleteRegionBanner(id: string, operatorId?: string, ip?: string) {
    await this.prisma.regionBanner.delete({ where: { id } });
    if (operatorId)
      await this.logOperation(
        operatorId,
        "DELETE",
        "region_banner",
        id,
        "region_banner",
        {},
        ip,
      );
    return { success: true };
  }

  async regionAnnouncements(regionId: string) {
    const items = await this.prisma.regionNotice.findMany({
      where: { regionId },
      orderBy: { createdAt: "desc" },
    });
    return { success: true, data: items };
  }

  async saveRegionAnnouncement(dto: any, operatorId?: string, ip?: string) {
    const item = await this.prisma.regionNotice.create({ data: dto });
    if (operatorId)
      await this.logOperation(
        operatorId,
        "CREATE",
        "region_notice",
        item.id,
        "region_notice",
        dto,
        ip,
      );
    return { success: true, data: item };
  }

  async updateRegionAnnouncement(
    id: string,
    dto: any,
    operatorId?: string,
    ip?: string,
  ) {
    const item = await this.prisma.regionNotice.update({
      where: { id },
      data: dto,
    });
    if (operatorId)
      await this.logOperation(
        operatorId,
        "UPDATE",
        "region_notice",
        id,
        "region_notice",
        dto,
        ip,
      );
    return { success: true, data: item };
  }

  async deleteRegionAnnouncement(id: string, operatorId?: string, ip?: string) {
    await this.prisma.regionNotice.delete({ where: { id } });
    if (operatorId)
      await this.logOperation(
        operatorId,
        "DELETE",
        "region_notice",
        id,
        "region_notice",
        {},
        ip,
      );
    return { success: true };
  }

  async regionNav(regionId: string) {
    const items = await this.prisma.regionNav.findMany({
      where: { regionId },
      orderBy: { sortOrder: "asc" },
    });
    return { success: true, data: items };
  }

  async saveRegionNav(dto: any, operatorId?: string, ip?: string) {
    const { regionId, items } = dto;
    if (items && Array.isArray(items)) {
      await this.prisma.regionNav.deleteMany({ where: { regionId } });
      await this.prisma.regionNav.createMany({
        data: items.map((it: any, idx: number) => ({
          ...it,
          regionId,
          sortOrder: idx,
        })),
      });
    }
    if (operatorId)
      await this.logOperation(
        operatorId,
        "UPDATE",
        "region_nav",
        regionId,
        "region",
        { count: items?.length },
        ip,
      );
    return { success: true };
  }

  async regionTabBar(regionId: string) {
    const config = await this.prisma.regionTabBar.findFirst({
      where: { regionId },
    });
    return { success: true, data: config };
  }

  async saveRegionTabBar(dto: any, operatorId?: string, ip?: string) {
    const { regionId, config } = dto;
    const item = await this.prisma.regionTabBar.upsert({
      where: { regionId },
      update: { ...config },
      create: { regionId, ...config },
    });
    if (operatorId)
      await this.logOperation(
        operatorId,
        "UPDATE",
        "region_tabbar",
        regionId,
        "region",
        config,
        ip,
      );
    return { success: true, data: item };
  }

  // ==================== 区域自定义页面 ====================
  async regionCustomPages(regionId: string) {
    const items = await this.prisma.regionCustomPage.findMany({
      where: { regionId },
      orderBy: { sortOrder: 'asc' },
    });
    return { success: true, data: items };
  }

  async saveRegionCustomPage(dto: any, operatorId?: string, ip?: string) {
    const item = await this.prisma.regionCustomPage.create({ data: dto });
    if (operatorId)
      await this.logOperation(
        operatorId,
        'CREATE',
        'region_custom_page',
        item.id,
        'region_custom_page',
        dto,
        ip,
      );
    return { success: true, data: item };
  }

  async updateRegionCustomPage(
    id: string,
    dto: any,
    operatorId?: string,
    ip?: string,
  ) {
    const item = await this.prisma.regionCustomPage.update({
      where: { id },
      data: dto,
    });
    if (operatorId)
      await this.logOperation(
        operatorId,
        'UPDATE',
        'region_custom_page',
        id,
        'region_custom_page',
        dto,
        ip,
      );
    return { success: true, data: item };
  }

  async deleteRegionCustomPage(
    id: string,
    operatorId?: string,
    ip?: string,
  ) {
    await this.prisma.regionCustomPage.delete({ where: { id } });
    if (operatorId)
      await this.logOperation(
        operatorId,
        'DELETE',
        'region_custom_page',
        id,
        'region_custom_page',
        {},
        ip,
      );
    return { success: true };
  }

  // ==================== 区域富文本内容 ====================
  async regionRichTexts(regionId: string) {
    const items = await this.prisma.richTextContent.findMany({
      where: { regionId },
      orderBy: { sortOrder: 'asc' },
    });
    return { success: true, data: items };
  }

  async saveRegionRichText(dto: any, operatorId?: string, ip?: string) {
    const item = await this.prisma.richTextContent.create({ data: dto });
    if (operatorId)
      await this.logOperation(
        operatorId,
        'CREATE',
        'rich_text',
        item.id,
        'rich_text_content',
        dto,
        ip,
      );
    return { success: true, data: item };
  }

  async updateRegionRichText(
    id: string,
    dto: any,
    operatorId?: string,
    ip?: string,
  ) {
    const item = await this.prisma.richTextContent.update({
      where: { id },
      data: dto,
    });
    if (operatorId)
      await this.logOperation(
        operatorId,
        'UPDATE',
        'rich_text',
        id,
        'rich_text_content',
        dto,
        ip,
      );
    return { success: true, data: item };
  }

  async deleteRegionRichText(
    id: string,
    operatorId?: string,
    ip?: string,
  ) {
    await this.prisma.richTextContent.delete({ where: { id } });
    if (operatorId)
      await this.logOperation(
        operatorId,
        'DELETE',
        'rich_text',
        id,
        'rich_text_content',
        {},
        ip,
      );
    return { success: true };
  }

  // ==================== 用户扩展 ====================
  async updateUser(id: string, dto: any, operatorId?: string, ip?: string) {
    const { nickname, avatar, phone, status, muteEndAt, muteReason } = dto;
    const data: any = {};
    if (nickname !== undefined) data.nickname = nickname;
    if (avatar !== undefined) data.avatar = avatar;
    if (phone !== undefined) data.phone = phone;
    if (status !== undefined) data.status = status;
    if (muteEndAt !== undefined)
      data.muteEndAt = muteEndAt ? new Date(muteEndAt) : null;
    if (muteReason !== undefined) data.muteReason = muteReason;
    const user = await this.prisma.user.update({ where: { id }, data });
    if (operatorId)
      await this.logOperation(
        operatorId,
        "UPDATE",
        "user",
        id,
        "user",
        dto,
        ip,
      );
    return { success: true, data: user };
  }

  async userTags() {
    const definitions = await this.getUserTagDefinitions();
    const counts = await this.prisma.userTag.groupBy({
      by: ["name"],
      _count: { name: true },
    });
    const countMap = new Map(counts.map((t: any) => [t.name, t._count.name]));
    return {
      success: true,
      data: definitions.map((t: any) => ({
        ...t,
        count: countMap.get(t.name) || 0,
      })),
    };
  }

  async createUserTag(dto: any, operatorId?: string, ip?: string) {
    const { name, color } = dto;
    const definitions = await this.getUserTagDefinitions();
    const existing = definitions.find((t: any) => t.name === name);
    if (existing) return { code: 400, message: "标签已存在" };
    const tag = {
      id: `tag_${Date.now()}`,
      name,
      color: color || "#1677ff",
      createdAt: new Date().toISOString(),
    };
    await this.saveUserTagDefinitions([...definitions, tag], operatorId);
    if (operatorId)
      await this.logOperation(
        operatorId,
        "CREATE",
        "user_tag",
        tag.id,
        "user_tag",
        tag,
        ip,
      );
    return { success: true, data: tag };
  }

  async updateUserTag(_id: string, dto: any, operatorId?: string, ip?: string) {
    const definitions = await this.getUserTagDefinitions();
    const index = definitions.findIndex(
      (t: any) => String(t.id) === String(_id) || t.name === dto.oldName,
    );
    if (index < 0) return { code: 404, message: "标签不存在" };
    const oldName = definitions[index].name;
    const nextName = dto.name || dto.newName || oldName;
    definitions[index] = {
      ...definitions[index],
      ...dto,
      id: definitions[index].id,
      name: nextName,
    };
    await this.saveUserTagDefinitions(definitions, operatorId);
    if (nextName !== oldName || dto.color !== undefined) {
      await this.prisma.userTag.updateMany({
        where: { name: oldName },
        data: { name: nextName, color: dto.color },
      });
    }
    if (operatorId)
      await this.logOperation(
        operatorId,
        "UPDATE",
        "user_tag",
        _id,
        "user_tag",
        dto,
        ip,
      );
    return { success: true, data: definitions[index] };
  }

  async deleteUserTag(_id: string, operatorId?: string, ip?: string) {
    const definitions = await this.getUserTagDefinitions();
    const tag = definitions.find(
      (t: any) => String(t.id) === String(_id) || t.name === _id,
    );
    if (!tag) return { code: 404, message: "标签不存在" };
    await this.saveUserTagDefinitions(
      definitions.filter((t: any) => String(t.id) !== String(tag.id)),
      operatorId,
    );
    await this.prisma.userTag.deleteMany({ where: { name: tag.name } });
    if (operatorId)
      await this.logOperation(
        operatorId,
        "DELETE",
        "user_tag",
        _id,
        "user_tag",
        {},
        ip,
      );
    return { success: true };
  }

  async setUserTags(
    userId: string,
    tagIds: string[],
    operatorId?: string,
    ip?: string,
  ) {
    const definitions = await this.getUserTagDefinitions();
    const tagNames = (tagIds || [])
      .map(
        (id: string) =>
          definitions.find((t: any) => String(t.id) === String(id))?.name || id,
      )
      .filter(Boolean);
    await this.prisma.userTag.deleteMany({ where: { userId } });
    if (tagNames.length > 0) {
      await this.prisma.userTag.createMany({
        data: tagNames.map((name: string) => ({ userId, name })),
        skipDuplicates: true,
      });
    }
    if (operatorId)
      await this.logOperation(
        operatorId,
        "SET_TAGS",
        "user",
        userId,
        "user",
        { tags: tagNames },
        ip,
      );
    return { success: true };
  }

  // ==================== 商品扩展 ====================
  async updateSku(id: string, dto: any, operatorId?: string, ip?: string) {
    const { specs, price, originPrice, stock, image, status } = dto;
    const data: any = {};
    if (specs !== undefined) data.specs = specs;
    if (price !== undefined) data.price = price;
    if (originPrice !== undefined) data.originPrice = originPrice;
    if (stock !== undefined) data.stock = stock;
    if (image !== undefined) data.image = image;
    if (status !== undefined) data.status = status;
    const sku = await this.prisma.sKU.update({ where: { id }, data });
    if (operatorId)
      await this.logOperation(operatorId, "UPDATE", "sku", id, "sku", dto, ip);
    return { success: true, data: sku };
  }

  // ==================== 促销扩展 ====================
  async togglePromotionStatus(id: string, status: number) {
    const promotion = await this.prisma.promotion.update({
      where: { id },
      data: { status: status === 1 ? "active" : "inactive" },
    });
    return { success: true, data: promotion };
  }

  // ==================== 团购扩展 ====================
  async toggleGroupBuyStatus(id: string, status: number) {
    const item = await this.prisma.groupBuyPackage.update({
      where: { id },
      data: { status: status === 1 ? "active" : "inactive" },
    });
    return { success: true, data: item };
  }

  // ==================== 对账扩展 ====================
  async generateReconciliation(dto: any, operatorId?: string, ip?: string) {
    const { date, type } = dto;
    const startAt = new Date(date);
    const endAt = new Date(date);
    if (type === "monthly") {
      endAt.setMonth(endAt.getMonth() + 1);
    } else {
      endAt.setDate(endAt.getDate() + 1);
    }
    const payments = await this.prisma.paymentOrder.findMany({
      where: { payTime: { gte: startAt, lt: endAt }, status: "paid" },
    });
    const totalAmount = payments.reduce(
      (sum: number, p: any) => sum + Number(p.amount),
      0,
    );
    const reconciliationNo = `REC-${Date.now()}`;
    const item = await this.prisma.reconciliation.create({
      data: {
        reconciliationNo,
        type,
        startAt,
        endAt,
        totalAmount,
        platformFee: 0,
        netAmount: totalAmount,
        orderCount: payments.length,
        status: "generated",
        detail: { paymentIds: payments.map((p: any) => p.id) },
      },
    });
    if (operatorId)
      await this.logOperation(
        operatorId,
        "GENERATE",
        "reconciliation",
        item.id,
        "reconciliation",
        dto,
        ip,
      );
    return { success: true, data: item };
  }

  async exportReconciliation(id: string) {
    const recon = await this.prisma.reconciliation.findUnique({ where: { id } });
    if (!recon) throw new NotFoundException('对账单不存在');
    return {
      success: true,
      data: recon,
      message: '对账数据已导出（JSON格式）',
    };
  }

  // ==================== 工具方法 ====================
  private async getUserTagDefinitions() {
    const config = await this.prisma.config.findUnique({
      where: { key: "user_tag_definitions" },
    });
    return Array.isArray(config?.value) ? (config.value as any[]) : [];
  }

  private async saveUserTagDefinitions(tags: any[], operatorId?: string) {
    await this.prisma.config.upsert({
      where: { key: "user_tag_definitions" },
      update: { value: tags, group: "user", updatedBy: operatorId },
      create: {
        key: "user_tag_definitions",
        value: tags,
        group: "user",
        desc: "后台用户标签定义",
        createdBy: operatorId,
        updatedBy: operatorId,
      },
    });
  }

  private getTodayStart() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }
  private getYesterdayStart() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  // ==================== 笔记配置 ====================
  async getNoteSettings(query: any) {
    const { regionId, page = 1, pageSize = 20 } = query;
    const where: any = {};
    if (regionId) where.regionId = regionId;

    const [list, total] = await Promise.all([
      this.prisma.noteSettings.findMany({
        where,
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.noteSettings.count({ where }),
    ]);

    // Batch-fetch region names
    const regionIds = [...new Set(list.map((s) => s.regionId).filter(Boolean))];
    const regionMap: Record<string, string> = {};
    if (regionIds.length > 0) {
      const regions = await this.prisma.region.findMany({
        where: { id: { in: regionIds } },
        select: { id: true, name: true },
      });
      for (const r of regions) regionMap[r.id] = r.name;
    }

    return {
      list: list.map((s) => ({
        id: s.id,
        regionId: s.regionId,
        regionName: regionMap[s.regionId] || null,
        allowVideoNote: s.allowVideoNote,
        allowImageNote: s.allowImageNote,
        allowTextNote: s.allowTextNote,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      })),
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  async getNoteSettingByRegion(regionId: string) {
    const settings = await this.prisma.noteSettings.findUnique({
      where: { regionId },
    });
    return settings || { regionId, allowVideoNote: true, allowImageNote: true, allowTextNote: true };
  }

  async updateNoteSetting(regionId: string, dto: any) {
    const data: any = {};
    if (dto.allowVideoNote !== undefined) data.allowVideoNote = dto.allowVideoNote;
    if (dto.allowImageNote !== undefined) data.allowImageNote = dto.allowImageNote;
    if (dto.allowTextNote !== undefined) data.allowTextNote = dto.allowTextNote;

    const settings = await this.prisma.noteSettings.upsert({
      where: { regionId },
      update: data,
      create: { regionId, ...data },
    });
    return { success: true, data: settings };
  }
}
