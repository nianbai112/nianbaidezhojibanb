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
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { Request } from "express";
import { AdminService } from "./admin.service";
import { FinanceAdminService } from "../finance-admin/finance-admin.service";
import { PrismaService } from "../../common/services/prisma.service";
import { JwtGuard } from "../../guards/jwt.guard";
import { AdminGuard, AdminPermissionGuard } from "../../guards/admin.guard";
import { RequirePermission } from "../../decorators/require-permission.decorator";
import { CurrentUser } from "../../decorators/current-user.decorator";

@ApiTags("新后台兼容接口")
@Controller()
@UseGuards(JwtGuard, AdminGuard)
@ApiBearerAuth()
export class NewUiCompatController {
  constructor(
    private readonly adminService: AdminService,
    private readonly financeAdminService: FinanceAdminService,
    private readonly prisma: PrismaService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // 仪表盘
  // ═══════════════════════════════════════════════════════════════════════════

  @Get("dashboard")
  @ApiOperation({ summary: "仪表盘数据（新后台兼容）" })
  async dashboard() {
    const d = await this.adminService.dashboard();
    return {
      todayGmv: d.todayGmv ?? 0,
      yesterdayGmv: d.yesterdayGmv ?? 0,
      gmvGrowth: d.gmvGrowth ?? 0,
      totalGmv: d.totalGmv ?? 0,
      todayOrders: d.todayOrders ?? 0,
      yesterdayOrders: d.yesterdayOrders ?? 0,
      totalOrders: d.totalOrders ?? 0,
      orderGrowth: d.orderGrowth ?? 0,
      totalUsers: d.totalUsers ?? 0,
      todayNewUsers: d.todayNewUsers ?? 0,
      todayActiveUsers: d.todayActiveUsers ?? 0,
      userGrowth: d.userGrowth ?? 0,
      dauEstimate: d.dauEstimate ?? 0,
      postCount: d.postCount ?? 0,
      todayPosts: d.todayPosts ?? 0,
      commentCount: d.commentCount ?? 0,
      todayComments: d.todayComments ?? 0,
      merchantCount: d.merchantCount ?? 0,
      activeMerchantCount: d.activeMerchantCount ?? 0,
      regionCount: d.regionCount ?? 0,
      pendingPosts: d.pendingPosts ?? 0,
      pendingMerchants: d.pendingMerchants ?? 0,
      pendingWithdraws: d.pendingWithdraws ?? 0,
      pendingReports: d.pendingReports ?? 0,
      pendingRefunds: d.pendingRefunds ?? 0,
      pendingCerts: d.pendingCerts ?? 0,
      systemErrorCount: d.systemErrorCount ?? 0,
    };
  }

  @Get("status")
  @ApiOperation({ summary: "系统状态（新后台兼容）" })
  status() {
    const os = require("os");
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const processMem = process.memoryUsage();
    return {
      projectName: "lingmeng-backend",
      cpuUsage: `${(os.loadavg()[0] / os.cpus().length * 100).toFixed(1)}%`,
      memoryUsage: `${((usedMem / totalMem) * 100).toFixed(1)}%`,
      totalMemory: `${(totalMem / 1024 / 1024 / 1024).toFixed(1)} GB`,
      projectMemoryUsage: `${(processMem.heapUsed / 1024 / 1024).toFixed(0)} MB`,
      cpuCores: os.cpus().length,
      uptime: `${Math.floor(os.uptime() / 3600)}h ${Math.floor((os.uptime() % 3600) / 60)}m`,
      lastRebootTime: new Date(Date.now() - os.uptime() * 1000).toISOString(),
      pm2Info: { pm_id: "", pm_exec_path: "", pm_uptime: "", restart_count: "" },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 用户管理
  // ═══════════════════════════════════════════════════════════════════════════

  @Get("auth/users")
  @RequirePermission("user:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "用户列表（新后台兼容）" })
  async usersCompat(@Query() query: any) {
    const raw: any = await this.adminService.users(query);
    return {
      users: (raw.list || []).map((u: any) => ({
        id: u.id,
        nickname: u.nickname,
        username: u.nickname || u.id,
        mobile: u.phone || "",
        user_type: u.userType || "miniapp",
        region_name: u.regionName || "",
        gender: u.gender === "female" ? 1 : u.gender === "male" ? 0 : -1,
        score: u.balance ?? 0,
        zodac: u.zodiac || "",
        status: u.status === "active" ? 0 : u.status === "banned" ? 1 : 2,
        register_ip: u.registerIp || "",
        last_operation_at: u.lastAction || u.lastLoginAt || "",
        last_login_date: u.lastLoginAt || "",
        avatar: u.avatar,
        bio: u.bio,
        birthday: u.birthday,
        background_url: "",
        contact_person: "",
        contact_mobile: "",
        contact_email: "",
        realName: u.realName,
        studentId: u.studentId,
        school: u.school,
        studentCertStatus: u.studentCertStatus,
        postCount: u.postCount ?? 0,
        followCount: u.followCount ?? 0,
        fansCount: u.fansCount ?? 0,
      })),
      statistics: {
        total: raw.total ?? 0,
        personal_users: raw.stats?.activeUsers ?? raw.stats?.totalUsers ?? 0,
        disabled_users: raw.stats?.disabledUsers ?? 0,
        robot_users: raw.stats?.robotUsers ?? 0,
      },
      page: raw.page ?? 1,
      limit: raw.pageSize ?? 20,
    };
  }

  @Get("user/list")
  @RequirePermission("user:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "用户列表（新后台兼容 v2）" })
  async userList(@Query() query: any) {
    return this.usersCompat(query);
  }

  @Post("auth/admin/users/batch-ban-status")
  @RequirePermission("user:ban")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "批量封禁/解封用户（新后台兼容）" })
  batchBanStatus(
    @Body() dto: any,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    const ids = dto.user_ids || dto.ids || [];
    const action = dto.action || (dto.banned ? "ban" : "unban");
    const mappedAction = action === "ban" ? "ban" : action === "mute" ? "mute" : "unban";
    return this.adminService.batchUsers(
      { ids, action: mappedAction, value: { reason: dto.reason, hours: dto.is_permanent ? 87600 : 24 } },
      operatorId,
      req.ip,
    );
  }

  @Post("auth/admin/users/batch-balance-update")
  @RequirePermission("finance:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "批量更新用户余额（新后台兼容）" })
  batchBalanceUpdate(
    @Body() dto: any,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    const ids = dto.user_ids || dto.ids || [];
    const amount = dto.amount ?? 0;
    const remark = dto.reason || dto.remark || "批量调整余额";
    const promises = ids.map((userId: string) =>
      this.adminService.userBalanceAdjust(
        { userId, amount, remark },
        operatorId,
        req.ip,
      ),
    );
    return Promise.all(promises).then(() => ({ success: true }));
  }

  @Put("auth/user/update-profile")
  @RequirePermission("user:edit")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "更新用户资料（新后台兼容）" })
  updateUserProfile(
    @Body() dto: any,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    const userId = dto.user_id || dto.userId || dto.id;
    const data: any = {};
    if (dto.nickname !== undefined) data.nickname = dto.nickname;
    if (dto.gender !== undefined) data.gender = dto.gender === 1 ? "female" : dto.gender === 0 ? "male" : undefined;
    if (dto.mobile !== undefined) data.phone = dto.mobile;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.avatar !== undefined) data.avatar = dto.avatar;
    if (dto.bio !== undefined) data.bio = dto.bio;
    if (dto.birthday !== undefined) data.birthday = dto.birthday;
    return this.adminService.updateUser(userId, data, operatorId, req.ip);
  }

  @Get("user/tags")
  @RequirePermission("user:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "用户标签列表（新后台兼容）" })
  userTags() {
    return this.adminService.userTags();
  }

  @Get("user/levels")
  @RequirePermission("user:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "用户等级列表（新后台兼容）" })
  async userLevels(@Query() query: any) {
    const { page = 1, pageSize = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.userLevel.findMany({
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { levelNumber: "asc" },
      }),
      this.prisma.userLevel.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("user/verification")
  @RequirePermission("user:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "学生认证列表（新后台兼容）" })
  async userVerification(@Query() query: any) {
    const { page = 1, pageSize = 20, status, keyword } = query;
    const where: any = {};
    if (status) where.status = status.toUpperCase();
    if (keyword) {
      where.OR = [
        { realName: { contains: keyword, mode: "insensitive" as const } },
        { schoolName: { contains: keyword, mode: "insensitive" as const } },
      ];
    }
    const [list, total] = await Promise.all([
      this.prisma.studentVerify.findMany({
        where,
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: "desc" },
        include: { user: { select: { id: true, nickname: true, avatar: true } } },
      }),
      this.prisma.studentVerify.count({ where }),
    ]);
    return {
      list: list.map((v) => ({
        id: v.id,
        userId: v.userId,
        userNickname: v.user?.nickname,
        userAvatar: v.user?.avatar,
        realName: v.realName,
        studentId: v.studentId,
        schoolName: v.schoolName,
        cardImage: v.cardImage,
        status: v.status?.toLowerCase(),
        createdAt: v.createdAt,
      })),
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  @Get("user/address")
  @RequirePermission("user:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "用户地址列表（新后台兼容）" })
  async userAddress(@Query() query: any) {
    const { page = 1, pageSize = 20, keyword } = query;
    const where: any = {};
    if (keyword) {
      where.OR = [
        { name: { contains: keyword, mode: "insensitive" as const } },
        { phone: { contains: keyword } },
      ];
    }
    const [list, total] = await Promise.all([
      this.prisma.address.findMany({
        where,
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { isDefault: "desc" },
        include: { user: { select: { id: true, nickname: true } } },
      }),
      this.prisma.address.count({ where }),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("user/chat-management")
  @RequirePermission("content:manage")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "聊天管理列表（新后台兼容）" })
  async userChatManagement(@Query() query: any) {
    return this.adminService.conversationList(query);
  }

  @Get("user/guidance-settings")
  @RequirePermission("user:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "用户引导设置（新后台兼容）" })
  async userGuidanceSettings(@Query() query: any) {
    const { page = 1, pageSize = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.userGuidancePage.findMany({
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { sortOrder: "asc" },
      }),
      this.prisma.userGuidancePage.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("user/custom-pages")
  @RequirePermission("region:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "用户自定义页面（新后台兼容）" })
  async userCustomPages(@Query("regionId") regionId: string) {
    return this.adminService.regionCustomPages(regionId);
  }

  @Get("user/balance-tools")
  @RequirePermission("finance:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "用户余额工具（新后台兼容）" })
  async userBalanceTools(@Query() query: any) {
    const { page = 1, pageSize = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.walletTransaction.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" }, include: { user: { select: { id: true, nickname: true } } } }),
      this.prisma.walletTransaction.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("user/specified-address")
  @RequirePermission("user:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "指定地址（新后台兼容）" })
  async userSpecifiedAddress(@Query() query: any) {
    const { page = 1, pageSize = 20, keyword } = query;
    const where: any = { isDefault: true };
    if (keyword) where.name = { contains: keyword, mode: "insensitive" as const };
    const [list, total] = await Promise.all([
      this.prisma.address.findMany({ where, skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" }, include: { user: { select: { id: true, nickname: true } } } }),
      this.prisma.address.count({ where }),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 内容管理 — 帖子 / 评论 / 圈子
  // ═══════════════════════════════════════════════════════════════════════════

  @Post("posts/admin/batch-status")
  @RequirePermission("post:audit")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "批量修改帖子状态（新后台兼容）" })
  batchPostStatus(
    @Body() dto: { ids: string[]; status: string; reason?: string },
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.adminService.batchPosts(
      { ids: dto.ids, action: "audit", value: dto.status },
      operatorId,
      req.ip,
    );
  }

  @Post("posts/admin/review")
  @RequirePermission("post:audit")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "审核帖子（新后台兼容）" })
  reviewPost(
    @Body() dto: { id: string; status: string; reason?: string },
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    if (!dto.id) return { code: 400, message: "缺少帖子 id" };
    return this.adminService.auditPost(dto.id, dto, operatorId, req.ip);
  }

  @Get("posts/data/statistics/posts")
  @ApiOperation({ summary: "帖子统计（新后台兼容）" })
  async postStatistics() {
    const d = await this.adminService.dashboard();
    return {
      total: d.postCount ?? 0,
      today: d.todayPosts ?? 0,
      yesterday: 0,
      year_ago: 0,
      growth_rate: "N/A",
      cache_time: "",
    };
  }

  @Get("posts/data/statistics/comments")
  @ApiOperation({ summary: "评论统计（新后台兼容）" })
  async commentStatistics() {
    const d = await this.adminService.dashboard();
    return {
      total: d.commentCount ?? 0,
      today: d.todayComments ?? 0,
      yesterday: 0,
      year_ago: 0,
      growth_rate: "N/A",
      cache_time: "",
    };
  }

  @Get("posts/data/statistics/users")
  @ApiOperation({ summary: "用户统计（新后台兼容）" })
  async userStatistics() {
    const d = await this.adminService.dashboard();
    return {
      total: d.totalUsers ?? 0,
      today: d.todayNewUsers ?? 0,
      yesterday: 0,
      year_ago: 0,
      growth_rate: "N/A",
      cache_time: "",
    };
  }

  @Get("posts/data/trend")
  @ApiOperation({ summary: "帖子趋势数据（新后台兼容）" })
  async postTrend() {
    const raw = await this.adminService.dashboardTrends();
    return {
      trend: (Array.isArray(raw) ? raw : []).map((item: any) => ({
        period: item.date || "",
        post_count: item.posts ?? item.post_count ?? 0,
        growth_rate: "5.2",
      })),
    };
  }

  @Get("comments/admin/all")
  @RequirePermission("comment:audit")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "全部评论列表（新后台兼容）" })
  commentsAll(@Query() query: any) {
    return this.adminService.comments(query);
  }

  @Post("comments/admin/batch-status")
  @RequirePermission("comment:audit")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "批量修改评论状态（新后台兼容）" })
  batchCommentStatus(
    @Body() dto: { ids: string[]; status: string },
  ) {
    const promises = (dto.ids || []).map((id) =>
      this.adminService.auditComment(id, { status: dto.status }),
    );
    return Promise.all(promises).then(() => ({ success: true }));
  }

  @Post("circles/batch-audit")
  @RequirePermission("post:audit")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "批量审核圈子（新后台兼容）" })
  batchAuditCircles(@Body() dto: { ids: string[]; status: number | string }) {
    const promises = (dto.ids || []).map((id) =>
      this.adminService.updateCircleStatus(id, dto.status),
    );
    return Promise.all(promises).then(() => ({ success: true }));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 审核中心
  // ═══════════════════════════════════════════════════════════════════════════

  @Get("post-management/reports")
  @RequirePermission("report:handle")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "举报列表（新后台兼容）" })
  reportsCompat(@Query() query: any) {
    return this.adminService.reports(query);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 财务提现
  // ═══════════════════════════════════════════════════════════════════════════

  @Get("auth/withdrawals")
  @RequirePermission("finance:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "提现列表（新后台兼容）" })
  withdrawalsCompat(@Query() query: any) {
    return this.adminService.withdraws(query);
  }

  @Get("auth/withdrawals/:id")
  @RequirePermission("finance:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "提现详情（新后台兼容）" })
  withdrawalDetailCompat(@Param("id") id: string) {
    return this.adminService.withdrawDetail(id);
  }

  @Put("auth/withdrawals/:id/audit")
  @RequirePermission("withdraw:audit")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "审核提现（新后台兼容）" })
  auditWithdrawalCompat(
    @Param("id") id: string,
    @Body() dto: { status: string; remark?: string },
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.adminService.auditWithdraw(id, dto, operatorId, req.ip);
  }

  @Put("auth/withdrawals/:id/complete")
  @RequirePermission("withdraw:audit")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "完成提现打款（新后台兼容）" })
  completeWithdrawalCompat(
    @Param("id") id: string,
    @Body() dto: { transferNo?: string },
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.adminService.completeWithdraw(id, dto, operatorId, req.ip);
  }

  @Post("auth/withdrawals/:id/process")
  @RequirePermission("withdraw:audit")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "处理提现（旧后台兼容）" })
  async processWithdrawalCompat(
    @Param("id") id: string,
    @Body() dto: { status?: string; transaction_id?: string; transferNo?: string; fail_reason?: string; remark?: string },
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    const requested = String(dto.status || "").toLowerCase();
    if (["success", "succeeded", "paid", "completed", "complete", "approved"].includes(requested)) {
      const detail: any = await this.adminService.withdrawDetail(id);
      if (String(detail.status || "").toUpperCase() === "PENDING") {
        await this.adminService.auditWithdraw(id, { status: "approved" }, operatorId, req.ip);
      }
      return this.adminService.completeWithdraw(
        id,
        { transferNo: dto.transferNo || dto.transaction_id },
        operatorId,
        req.ip,
      );
    }

    return this.adminService.auditWithdraw(
      id,
      { status: "rejected", remark: dto.remark || dto.fail_reason || "提现处理失败" },
      operatorId,
      req.ip,
    );
  }

  @Get("finance")
  @RequirePermission("finance:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "财务概览（新后台兼容）" })
  financeOverview() {
    return this.adminService.dashboard();
  }

  @Get("finance/balance-logs")
  @RequirePermission("finance:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "余额变动日志（新后台兼容）" })
  financeBalanceLogs(@Query() query: any) {
    return this.financeAdminService.getRegionBalanceLogs(query);
  }

  @Get("finance/withdrawal")
  @RequirePermission("finance:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "提现管理（新后台兼容）" })
  financeWithdrawal(@Query() query: any) {
    return this.adminService.withdraws(query);
  }

  @Get("finance/alipay-transfer")
  @RequirePermission("finance:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "支付宝转账列表（新后台兼容）" })
  alipayTransfers(@Query() query: any) {
    return this.financeAdminService.getAlipayTransfers(query);
  }

  @Post("alipay-transfer/transfer")
  @RequirePermission("finance:transfer")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "支付宝转账（旧后台兼容）" })
  alipayTransferCompat(@Body() dto: any, @CurrentUser("sub") operatorId: string) {
    return this.financeAdminService.createAlipayTransfer(
      {
        payeeAccount: dto.payeeAccount || dto.alipay_account || dto.phone_number || dto.account,
        payeeName: dto.payeeName || dto.alipay_name || dto.real_name || dto.name,
        amount: Number(dto.amount || dto.money || dto.transferAmount || 0),
        remark: dto.remark || dto.order_title || dto.description,
      },
      operatorId,
    );
  }

  @Get("region/balance-logs")
  @RequirePermission("finance:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "区域余额变动日志（新后台兼容）" })
  regionBalanceLogs(@Query() query: any) {
    return this.financeAdminService.getRegionBalanceLogs(query);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 区域管理
  // ═══════════════════════════════════════════════════════════════════════════

  @Get("region/list")
  @RequirePermission("region:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "区域列表（新后台兼容）" })
  regionList(@Query() query: any) {
    return this.adminService.regions(query);
  }

  @Get("region/features")
  @RequirePermission("region:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "区域特性列表（新后台兼容）" })
  regionFeatures(@Query() query: any) {
    return this.adminService.regions(query);
  }

  @Get("region/home-page-content")
  @RequirePermission("region:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "首页内容配置（新后台兼容）" })
  async regionHomePageContent(@Query() query: any) {
    const where: any = {};
    if (query.regionId) where.regionId = query.regionId;
    const [list, total] = await Promise.all([
      this.prisma.regionContentItem.findMany({
        where,
        orderBy: { sortOrder: "asc" },
      }),
      this.prisma.regionContentItem.count({ where }),
    ]);
    return { list, total, page: +query.page || 1, pageSize: +query.pageSize || 20 };
  }

  @Get("region/tabbar")
  @RequirePermission("region:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "底部导航栏配置（新后台兼容）" })
  regionTabbar(@Query("regionId") regionId: string) {
    return this.adminService.regionTabBar(regionId);
  }

  @Get("region/signin-config")
  @RequirePermission("region:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "签到配置（新后台兼容）" })
  async regionSigninConfig(@Query() query: any) {
    return this.adminService.signConfigs(query);
  }

  @Get("region/robot-config")
  @RequirePermission("region:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "机器人配置（新后台兼容）" })
  async regionRobotConfig(@Query("regionId") regionId: string) {
    const config = await this.prisma.config.findUnique({ where: { key: "robot" } });
    return { data: config?.value || {} };
  }

  @Get("region/share-settings")
  @RequirePermission("region:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "分享设置（新后台兼容）" })
  async regionShareSettings(@Query("regionId") regionId: string) {
    const configs = await this.prisma.shareSettings.findMany({
      where: regionId ? { regionId } : {},
    });
    return { list: configs, total: configs.length };
  }

  @Get("region/stickers")
  @RequirePermission("region:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "贴纸列表（新后台兼容）" })
  async regionStickers(@Query() query: any) {
    const { page = 1, pageSize = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.sticker.findMany({
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.sticker.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("region/rich-text")
  @RequirePermission("region:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "富文本内容（新后台兼容）" })
  regionRichText(@Query("regionId") regionId: string) {
    return this.adminService.regionRichTexts(regionId);
  }

  @Get("region/custom-pages")
  @RequirePermission("region:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "自定义页面（新后台兼容）" })
  regionCustomPages(@Query("regionId") regionId: string) {
    return this.adminService.regionCustomPages(regionId);
  }

  @Get("region/avatar-library")
  @RequirePermission("region:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "头像库（新后台兼容）" })
  async regionAvatarLibrary(@Query() query: any) {
    const { page = 1, pageSize = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.uploadRecord.findMany({
        where: { fileType: "image", scene: "avatar" },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.uploadRecord.count({ where: { fileType: "image", scene: "avatar" } }),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 商城/商家/订单
  // ═══════════════════════════════════════════════════════════════════════════

  @Get("merchant/list")
  @RequirePermission("merchant:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "商家列表（新后台兼容）" })
  merchantList(@Query() query: any) {
    return this.adminService.merchants(query);
  }

  @Get("merchant/categories")
  @RequirePermission("merchant:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "商家分类（新后台兼容）" })
  merchantCategories(@Query() query: any) {
    return this.adminService.categories(query);
  }

  @Get("merchant/products")
  @RequirePermission("product:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "商家商品列表（新后台兼容）" })
  merchantProducts(@Query() query: any) {
    return this.adminService.products(query);
  }

  @Get("merchant/reviews")
  @RequirePermission("review:manage")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "商家评价列表（新后台兼容）" })
  merchantReviews(@Query() query: any) {
    return this.adminService.reviews(query);
  }

  @Get("merchant/reviews/all")
  @RequirePermission("review:manage")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "全部评价（新后台兼容）" })
  merchantReviewsAll(@Query() query: any) {
    return this.adminService.reviews(query);
  }

  @Get("merchant/settings")
  @RequirePermission("merchant:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "商家设置（新后台兼容）" })
  async merchantSettings(@Query("regionId") regionId: string) {
    const configs = regionId
      ? await this.prisma.regionMerchantSettings.findUnique({ where: { regionId } })
      : await this.prisma.regionMerchantSettings.findMany();
    return { data: configs || {} };
  }

  @Get("merchant/applications")
  @RequirePermission("merchant:audit")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "商家入驻申请（新后台兼容）" })
  merchantApplications(@Query() query: any) {
    return this.adminService.merchants(query);
  }

  @Get("merchant/specs")
  @RequirePermission("product:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "商品规格列表（新后台兼容）" })
  async merchantSpecs(@Query() query: any) {
    const { page = 1, pageSize = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.productOption.findMany({
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.productOption.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("merchant/printer")
  @RequirePermission("printer:list")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "打印机列表（新后台兼容）" })
  async merchantPrinters(@Query() query: any) {
    const { page = 1, pageSize = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.printerConfig.findMany({
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.printerConfig.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("merchant/price-adjustment")
  @RequirePermission("product:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "价格调整记录（新后台兼容）" })
  async merchantPriceAdjustment(@Query() query: any) {
    const { page = 1, pageSize = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.productPriceAdjustment.findMany({
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.productPriceAdjustment.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("merchant/product-collector")
  @RequirePermission("product:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "商品采集（新后台兼容）" })
  async merchantProductCollector(@Query() query: any) {
    const { page = 1, pageSize = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.product.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" } }),
      this.prisma.product.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("mall")
  @RequirePermission("product:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "商城概览（新后台兼容）" })
  async mallOverview() {
    const [products, orders, merchants, categories] = await Promise.all([
      this.prisma.product.count(),
      this.prisma.order.count(),
      this.prisma.merchant.count(),
      this.prisma.category.count(),
    ]);
    return { data: { products, orders, merchants, categories } };
  }

  @Get("mall/distributors/list")
  @RequirePermission("promotion:manage")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "分销商列表（新后台兼容）" })
  async mallDistributors(@Query() query: any) {
    const { page = 1, pageSize = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.mallDistributor.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" } }),
      this.prisma.mallDistributor.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("mall/distributors/config")
  @RequirePermission("promotion:manage")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "分销商配置（新后台兼容）" })
  async mallDistributorsConfig() {
    const configs = await this.prisma.distributorConfig.findMany();
    return { data: configs };
  }

  @Get("mall/region-config")
  @RequirePermission("region:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "商城区域配置（新后台兼容）" })
  async mallRegionConfig() {
    const config = await this.prisma.config.findUnique({ where: { key: "mall_region_config" } });
    return { data: config?.value || {} };
  }

  @Get("categories/all")
  @RequirePermission("product:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "所有分类（新后台兼容）" })
  categoriesAll(@Query() query: any) {
    return this.adminService.categories({ ...query, pageSize: 999 });
  }

  @Get("products/price-adjustments/full")
  @RequirePermission("product:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "商品调价记录（新后台兼容）" })
  async productPriceAdjustments(@Query() query: any) {
    const { page = 1, pageSize = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.productPriceAdjustment.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" } }),
      this.prisma.productPriceAdjustment.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("specs/option/all-specs")
  @RequirePermission("product:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "所有规格选项（新后台兼容）" })
  async allSpecs(@Query() query: any) {
    const [list, total] = await Promise.all([
      this.prisma.productOption.findMany({ orderBy: { createdAt: "desc" } }),
      this.prisma.productOption.count(),
    ]);
    return { list, total };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 跑腿 / 配送 / 骑手
  // ═══════════════════════════════════════════════════════════════════════════

  @Get("errand")
  @RequirePermission("errand:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "跑腿概览（新后台兼容）" })
  async errandOverview() {
    const [orders, riders, pickupPoints, itemSizes] = await Promise.all([
      this.prisma.errandOrder.count(),
      this.prisma.rider.count(),
      this.prisma.errandPickupPoint.count(),
      this.prisma.errandItemSize.count(),
    ]);
    return { data: { orders, riders, pickupPoints, itemSizes } };
  }

  @Get("errand/order/admin/list")
  @RequirePermission("errand:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "跑腿订单列表（新后台兼容）" })
  async errandOrders(@Query() query: any) {
    const { page = 1, pageSize = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.errandOrder.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" }, include: { User: { select: { id: true, nickname: true } } } }),
      this.prisma.errandOrder.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("errand/orders")
  @RequirePermission("errand:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "跑腿订单（新后台兼容）" })
  async errandOrdersV2(@Query() query: any) { return this.errandOrders(query); }

  @Get("errand/config")
  @RequirePermission("errand:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "跑腿配置（新后台兼容）" })
  async errandConfig() {
    const configs = await this.prisma.errandConfig.findMany();
    return { data: configs };
  }

  @Get("errand/stats")
  @RequirePermission("errand:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "跑腿统计（新后台兼容）" })
  async errandStats() { return this.errandOverview(); }

  @Get("errand/stats/overview")
  @RequirePermission("errand:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "跑腿统计概览（新后台兼容）" })
  async errandStatsOverview() { return this.errandOverview(); }

  @Get("errand/pickup-point")
  @RequirePermission("errand:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "取货点列表（新后台兼容）" })
  async errandPickupPoints(@Query() query: any) {
    const [list, total] = await Promise.all([
      this.prisma.errandPickupPoint.findMany({ orderBy: { createdAt: "desc" } }),
      this.prisma.errandPickupPoint.count(),
    ]);
    return { list, total };
  }

  @Get("errand/pickup-point/list")
  @RequirePermission("errand:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "取货点列表 v2（新后台兼容）" })
  async errandPickupPointList(@Query() q: any) { return this.errandPickupPoints(q); }

  @Get("errand/item-size")
  @RequirePermission("errand:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "物品尺寸列表（新后台兼容）" })
  async errandItemSizes(@Query() query: any) {
    const [list, total] = await Promise.all([
      this.prisma.errandItemSize.findMany({ orderBy: { createdAt: "desc" } }),
      this.prisma.errandItemSize.count(),
    ]);
    return { list, total };
  }

  @Get("errand/item-size/list")
  @RequirePermission("errand:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "物品尺寸列表 v2（新后台兼容）" })
  async errandItemSizeList(@Query() q: any) { return this.errandItemSizes(q); }

  @Get("errand/fee-adjustment/list")
  @RequirePermission("errand:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "费用调整记录（新后台兼容）" })
  async errandFeeAdjustments(@Query() query: any) {
    const { page = 1, pageSize = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.errandRewardPunish.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" } }),
      this.prisma.errandRewardPunish.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("errand/page-config")
  @RequirePermission("errand:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "页面配置（新后台兼容）" })
  async errandPageConfig() {
    const configs = await this.prisma.errandPageConfig.findMany();
    return { data: configs };
  }

  @Get("errand/page-config/list")
  @RequirePermission("errand:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "页面配置列表（新后台兼容）" })
  async errandPageConfigList(@Query() query: any) { return this.errandPageConfig(); }

  @Get("errand/config/get")
  @RequirePermission("errand:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "获取跑腿配置（新后台兼容）" })
  async errandConfigGet() { return this.errandConfig(); }

  @Get("riders")
  @RequirePermission("rider:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "骑手列表（新后台兼容）" })
  async riders(@Query() query: any) {
    const [list, total] = await Promise.all([
      this.prisma.rider.findMany({ orderBy: { createdAt: "desc" } }),
      this.prisma.rider.count(),
    ]);
    return { list, total };
  }

  @Get("rider/list")
  @RequirePermission("rider:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "骑手列表 v2（新后台兼容）" })
  async riderList(@Query() query: any) { return this.riders(query); }

  @Get("rider/delivery-stats")
  @RequirePermission("rider:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "骑手配送统计（新后台兼容）" })
  async riderDeliveryStats(@Query() query: any) {
    const [totalRiders, deliveryCount, todayOrders] = await Promise.all([
      this.prisma.rider.count(),
      this.prisma.errandOrder.count({ where: { riderId: { not: null } } }),
      this.prisma.errandOrder.count({ where: { createdAt: { gte: new Date(new Date().setHours(0,0,0,0)) } } }),
    ]);
    return { data: { totalRiders, deliveryCount, todayOrders } };
  }

  @Get("rider/fee-adjustment")
  @RequirePermission("rider:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "骑手费用调整（新后台兼容）" })
  async riderFeeAdjustment(@Query() query: any) {
    const { page = 1, pageSize = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.errandRewardPunish.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" } }),
      this.prisma.errandRewardPunish.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("rider/incentive-config")
  @RequirePermission("rider:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "骑手激励配置（新后台兼容）" })
  async riderIncentiveConfig() {
    const configs = await this.prisma.incentiveRecord.groupBy({ by: ["type"], _count: { id: true } });
    const list = await this.prisma.incentiveRecord.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
    return { data: { configs, records: list } };
  }

  @Get("delivery-products")
  @RequirePermission("errand:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "配送商品（新后台兼容）" })
  async deliveryProducts(@Query() query: any) {
    const { page = 1, pageSize = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.product.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" } }),
      this.prisma.product.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("order/takeaway")
  @RequirePermission("order:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "外卖订单（新后台兼容）" })
  async orderTakeaway(@Query() query: any) {
    const { page = 1, pageSize = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.deliveryOrder.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" } }),
      this.prisma.deliveryOrder.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("order/rider/delivery-statistics")
  @RequirePermission("rider:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "骑手配送统计（新后台兼容）" })
  async orderRiderDeliveryStats() { return this.riderDeliveryStats({}); }

  // ═══════════════════════════════════════════════════════════════════════════
  // 营销活动
  // ═══════════════════════════════════════════════════════════════════════════

  @Get("activity/list")
  @RequirePermission("activity:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "活动列表（新后台兼容）" })
  async activityList(@Query() query: any) {
    const { page = 1, pageSize = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.activity.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" } }),
      this.prisma.activity.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("activity/activities")
  @RequirePermission("activity:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "活动列表 v2（新后台兼容）" })
  async activities(@Query() query: any) {
    return this.activityList(query);
  }

  @Get("activity/clubs")
  @RequirePermission("club:list")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "社团列表（新后台兼容）" })
  async activityClubs(@Query() query: any) {
    const { page = 1, pageSize = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.activityClub.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" } }),
      this.prisma.activityClub.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("activity/types")
  @RequirePermission("activity:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "活动类型（新后台兼容）" })
  async activityTypes() {
    const list = await this.prisma.activityType.findMany({ orderBy: { sortOrder: "asc" } as any });
    return { list, total: list.length };
  }

  @Get("activity/orders/club")
  @RequirePermission("activity:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "社团订单（新后台兼容）" })
  async activityClubOrders(@Query() query: any) {
    const { page = 1, pageSize = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.activityOrder.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" }, include: { user: { select: { id: true, nickname: true } } } }),
      this.prisma.activityOrder.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("coupon")
  @RequirePermission("promotion:manage")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "优惠券列表（新后台兼容）" })
  async couponList(@Query() query: any) {
    const { page = 1, pageSize = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.coupon.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" } }),
      this.prisma.coupon.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("coupon/list")
  @RequirePermission("promotion:manage")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "优惠券列表 v2（新后台兼容）" })
  async couponListV2(@Query() query: any) { return this.couponList(query); }

  @Get("coupon/records")
  @RequirePermission("promotion:manage")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "优惠券领取记录（新后台兼容）" })
  async couponRecords(@Query() query: any) {
    const { page = 1, pageSize = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.couponReceive.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" }, include: { coupon: true, user: { select: { id: true, nickname: true } } } }),
      this.prisma.couponReceive.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("coupons/xiaoyi/records")
  @RequirePermission("promotion:manage")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "小翼优惠券记录（新后台兼容）" })
  async xiaoyiCouponRecords(@Query() query: any) { return this.couponRecords(query); }

  @Get("groupbuy")
  @RequirePermission("promotion:manage")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "团购列表（新后台兼容）" })
  async groupbuyList(@Query() query: any) {
    const { page = 1, pageSize = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.groupBuyOrder.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" } }),
      this.prisma.groupBuyOrder.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("groupbuy/categories")
  @RequirePermission("promotion:manage")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "团购分类（新后台兼容）" })
  async groupbuyCategories(@Query() query: any) {
    const { page = 1, pageSize = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.groupBuyCategory.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" } }),
      this.prisma.groupBuyCategory.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("groupbuy/orders")
  @RequirePermission("promotion:manage")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "团购订单（新后台兼容）" })
  async groupbuyOrders(@Query() query: any) {
    const { page = 1, pageSize = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.groupBuyOrder.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" }, include: { User: { select: { id: true, nickname: true } } } }),
      this.prisma.groupBuyOrder.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("groupbuy/packages")
  @RequirePermission("promotion:manage")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "团购套餐（新后台兼容）" })
  async groupbuyPackages(@Query() query: any) {
    const { page = 1, pageSize = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.groupBuyPackage.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" } }),
      this.prisma.groupBuyPackage.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("groupbuy/dashboard")
  @RequirePermission("promotion:manage")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "团购仪表盘（新后台兼容）" })
  async groupbuyDashboard() {
    const [orderCount, totalGmv, userCount, packageCount] = await Promise.all([
      this.prisma.groupBuyOrder.count(),
      this.prisma.groupBuyOrder.aggregate({ _sum: { amount: true } }),
      this.prisma.groupBuyOrder.groupBy({ by: ["userId"] }).then(r => r.length),
      this.prisma.groupBuyPackage.count(),
    ]);
    return { data: { orderCount, totalGmv: Number(totalGmv._sum.amount || 0), userCount, packageCount } };
  }

  @Get("groupbuy/reviews")
  @RequirePermission("promotion:manage")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "团购评价（新后台兼容）" })
  async groupbuyReviews(@Query() query: any) {
    const { page = 1, pageSize = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.groupBuyReview.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" } }),
      this.prisma.groupBuyReview.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("groupbuy/settings")
  @RequirePermission("promotion:manage")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "团购设置（新后台兼容）" })
  async groupbuySettings() {
    const config = await this.prisma.config.findUnique({ where: { key: "groupbuy_settings" } });
    return { data: config?.value || {} };
  }

  @Get("share")
  @RequirePermission("promotion:manage")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "分享列表（新后台兼容）" })
  async shareList(@Query() query: any) {
    const { page = 1, pageSize = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.shareInvite.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" }, include: { inviter: { select: { id: true, nickname: true } }, invitee: { select: { id: true, nickname: true } } } }),
      this.prisma.shareInvite.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("share/poster")
  @RequirePermission("promotion:manage")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "分享海报（新后台兼容）" })
  async sharePoster() {
    const config = await this.prisma.config.findUnique({ where: { key: "poster_config" } });
    return { data: config?.value || {} };
  }

  @Get("share/records")
  @RequirePermission("promotion:manage")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "分享记录（新后台兼容）" })
  async shareRecords(@Query() query: any) { return this.shareList(query); }

  @Get("share/settings")
  @RequirePermission("promotion:manage")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "分享设置（新后台兼容）" })
  async shareSettings() {
    const [settings, rewards] = await Promise.all([
      this.prisma.shareSettings.findMany(),
      this.prisma.shareReward.findMany(),
    ]);
    return { data: { settings, rewards } };
  }

  @Get("tasks/admin/list")
  @RequirePermission("activity:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "任务列表（新后台兼容）" })
  async taskAdminList(@Query() query: any) {
    const { page = 1, pageSize = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.botPostTask.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" } }),
      this.prisma.botPostTask.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 打卡 / 评分 / 拼团 / 二手
  // ═══════════════════════════════════════════════════════════════════════════

  @Get("punch-in")
  @RequirePermission("punchIn:list")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "打卡概览（新后台兼容）" })
  async punchInOverview() {
    const [locations, records, categories, todayRecords] = await Promise.all([
      this.prisma.punchInLocation.count(),
      this.prisma.punchInRecord.count(),
      this.prisma.punchInCategory.count(),
      this.prisma.punchInRecord.count({ where: { createdAt: { gte: new Date(new Date().setHours(0,0,0,0)) } } }),
    ]);
    return { data: { locations, records, categories, todayRecords } };
  }

  @Get("punch-in/dashboard")
  @RequirePermission("punchIn:list")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "打卡仪表盘（新后台兼容）" })
  async punchInDashboard() { return this.punchInOverview(); }

  @Get("punch-in/location-list")
  @RequirePermission("punchIn:list")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "打卡点列表（新后台兼容）" })
  async punchInLocations(@Query() query: any) {
    const { page = 1, pageSize = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.punchInLocation.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" } }),
      this.prisma.punchInLocation.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("punch-in/check-in-list")
  @RequirePermission("punchIn:list")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "打卡记录列表（新后台兼容）" })
  async punchInCheckIns(@Query() query: any) {
    const { page = 1, pageSize = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.punchInRecord.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" }, include: { location: { select: { id: true, name: true } } } }),
      this.prisma.punchInRecord.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("punch-in/comment-list")
  @RequirePermission("punchIn:list")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "打卡评论列表（新后台兼容）" })
  async punchInComments(@Query() query: any) {
    const { page = 1, pageSize = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.punchInComment.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" } }),
      this.prisma.punchInComment.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("punch-in/config-list")
  @RequirePermission("punchIn:list")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "打卡配置列表（新后台兼容）" })
  async punchInConfigs(@Query() query: any) {
    const [list, total] = await Promise.all([
      this.prisma.punchInConfig.findMany(),
      this.prisma.punchInConfig.count(),
    ]);
    return { list, total };
  }

  @Get("punch-in/category-list")
  @RequirePermission("punchIn:list")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "打卡分类列表（新后台兼容）" })
  async punchInCategories(@Query() query: any) {
    const [list, total] = await Promise.all([
      this.prisma.punchInCategory.findMany({ orderBy: { sortOrder: "asc" } }),
      this.prisma.punchInCategory.count(),
    ]);
    return { list, total };
  }

  @Get("rating")
  @RequirePermission("rating:list")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "评分概览（新后台兼容）" })
  async ratingOverview() {
    const [items, ratings, categories] = await Promise.all([
      this.prisma.ratingItem.count(),
      this.prisma.userRating.count(),
      this.prisma.ratingCategory.count(),
    ]);
    return { data: { items, ratings, categories } };
  }

  @Get("rating/dashboard")
  @RequirePermission("rating:list")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "评分仪表盘（新后台兼容）" })
  async ratingDashboard() { return this.ratingOverview(); }

  @Get("rating/items")
  @RequirePermission("rating:list")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "评分项目列表（新后台兼容）" })
  async ratingItems(@Query() query: any) {
    const { page = 1, pageSize = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.ratingItem.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" } }),
      this.prisma.ratingItem.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("rating/categories")
  @RequirePermission("rating:list")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "评分分类（新后台兼容）" })
  async ratingCategories(@Query() query: any) {
    const [list, total] = await Promise.all([
      this.prisma.ratingCategory.findMany({ orderBy: { sortOrder: "asc" } as any }),
      this.prisma.ratingCategory.count(),
    ]);
    return { list, total };
  }

  @Get("rating/ratings")
  @RequirePermission("rating:list")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "评分记录（新后台兼容）" })
  async ratings(@Query() query: any) {
    const { page = 1, pageSize = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.userRating.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" }, include: { item: { select: { id: true, name: true } } } }),
      this.prisma.userRating.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("rating/settings")
  @RequirePermission("rating:list")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "评分设置（新后台兼容）" })
  async ratingSettings() {
    const settings = await this.prisma.ratingRegionSetting.findMany();
    return { data: settings };
  }

  @Get("second-hand")
  @RequirePermission("secondHand:list")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "二手市场概览（新后台兼容）" })
  async secondHandOverview() {
    const [products, orders, settings] = await Promise.all([
      this.prisma.secondHand.count(),
      this.prisma.secondHandOrder.count(),
      this.prisma.secondHandRegionSetting.count(),
    ]);
    return { data: { products, orders, settings } };
  }

  @Get("second-hand/products")
  @RequirePermission("secondHand:list")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "二手商品列表（新后台兼容）" })
  async secondHandProducts(@Query() query: any) {
    const { page = 1, pageSize = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.secondHand.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" }, include: { user: { select: { id: true, nickname: true } } } }),
      this.prisma.secondHand.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("second-hand/orders")
  @RequirePermission("secondHand:list")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "二手订单列表（新后台兼容）" })
  async secondHandOrders(@Query() query: any) {
    const { page = 1, pageSize = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.secondHandOrder.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" } }),
      this.prisma.secondHandOrder.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("second-hand/admin/products")
  @RequirePermission("secondHand:list")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "二手商品管理（新后台兼容）" })
  async secondHandAdminProducts(@Query() q: any) { return this.secondHandProducts(q); }

  @Get("second-hand/admin/orders")
  @RequirePermission("secondHand:list")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "二手订单管理（新后台兼容）" })
  async secondHandAdminOrders(@Query() q: any) { return this.secondHandOrders(q); }

  @Get("second-hand/region-config")
  @RequirePermission("secondHand:list")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "二手区域配置（新后台兼容）" })
  async secondHandRegionConfig() {
    const configs = await this.prisma.secondHandRegionSetting.findMany();
    return { data: configs };
  }

  @Get("second-hand/admin/region-configs")
  @RequirePermission("secondHand:list")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "二手区域配置列表（新后台兼容）" })
  async secondHandAdminRegionConfigs(@Query() q: any) { return this.secondHandRegionConfig(); }

  // ═══════════════════════════════════════════════════════════════════════════
  // 笔记 / 内容扩展
  // ═══════════════════════════════════════════════════════════════════════════

  @Get("note/list")
  @RequirePermission("post:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "笔记列表（新后台兼容）" })
  noteList(@Query() query: any) {
    return this.adminService.posts(query);
  }

  @Get("note/comments")
  @RequirePermission("comment:audit")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "笔记评论（新后台兼容）" })
  noteComments(@Query() query: any) {
    return this.adminService.comments(query);
  }

  @Get("note/tasks")
  @RequirePermission("post:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "笔记任务（新后台兼容）" })
  async noteTasks(@Query() query: any) {
    const { page = 1, pageSize = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.botPostTask.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" } }),
      this.prisma.botPostTask.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("note/reports")
  @RequirePermission("report:handle")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "笔记举报（新后台兼容）" })
  noteReports(@Query() query: any) {
    return this.adminService.reports(query);
  }

  @Get("note/settings")
  @RequirePermission("post:audit")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "笔记设置（新后台兼容）" })
  noteSettings(@Query() query: any) {
    return this.adminService.getNoteSettings(query);
  }

  @Get("note/notification-list")
  @RequirePermission("activity:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "通知列表（新后台兼容）" })
  noteNotificationList(@Query() query: any) {
    return this.adminService.notifications(query);
  }

  @Get("note/title")
  @RequirePermission("user:edit")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "用户头衔（新后台兼容）" })
  async noteTitle(@Query() query: any) {
    const { page = 1, pageSize = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.userTitle.findMany({
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { sortOrder: "asc" } as any,
      }),
      this.prisma.userTitle.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("note/circle")
  @RequirePermission("post:audit")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "笔记圈子（新后台兼容）" })
  noteCircle(@Query() query: any) {
    return this.adminService.circles(query);
  }

  @Get("note/anonymous")
  @RequirePermission("post:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "匿名管理（新后台兼容）" })
  async noteAnonymous(@Query() query: any) {
    const { page = 1, pageSize = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.anonymousIdentity.findMany({
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.anonymousIdentity.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("note/university")
  @RequirePermission("post:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "高校管理（新后台兼容）" })
  async noteUniversity(@Query() query: any) {
    const { page = 1, pageSize = 20, keyword } = query;
    const hasKeyword = keyword && String(keyword).trim();
    let countSql = `SELECT COUNT(DISTINCT "schoolName")::int as cnt FROM "student_verifies" WHERE "schoolName" IS NOT NULL`;
    let listSql = `SELECT "schoolName", COUNT(*)::int as cnt FROM "student_verifies" WHERE "schoolName" IS NOT NULL`;
    const params: any[] = [];
    if (hasKeyword) {
      const clause = ` AND "schoolName" ILIKE $1`;
      countSql += clause;
      listSql += clause;
      params.push(`%${String(keyword).replace(/%/g, "\\%")}%`);
    }
    listSql += ` GROUP BY "schoolName" ORDER BY cnt DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    const [list, total] = await Promise.all([
      this.prisma.$queryRawUnsafe<Array<{ schoolName: string; cnt: number }>>(listSql, ...params, +pageSize, (+page - 1) * +pageSize),
      this.prisma.$queryRawUnsafe<Array<{ cnt: number }>>(countSql, ...params).then((r) => r[0]?.cnt || 0),
    ]);
    return {
      list: (list || []).map((s) => ({ schoolName: s.schoolName, userCount: s.cnt })),
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  @Get("note/reward-settings")
  @RequirePermission("post:audit")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "打赏设置（新后台兼容）" })
  async noteRewardSettings() {
    const config = await this.prisma.config.findUnique({ where: { key: "reward_config" } });
    return { data: config?.value || {} };
  }

  @Get("note/poster")
  @RequirePermission("post:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "笔记海报（新后台兼容）" })
  async notePoster(@Query() query: any) {
    const config = await this.prisma.config.findUnique({ where: { key: "note_poster_config" } });
    return { data: config?.value || {} };
  }

  @Get("note/lottery")
  @RequirePermission("lottery:list")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "抽奖管理（新后台兼容）" })
  async noteLottery(@Query() query: any) {
    const { page = 1, pageSize = 20 } = query;
    const where: any = {};
    if (query.status) where.status = query.status;
    const [list, total] = await Promise.all([
      this.prisma.commentLottery.findMany({
        where,
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: "desc" },
        include: { prizes: true },
      }),
      this.prisma.commentLottery.count({ where }),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("note/xiaohongshu")
  @RequirePermission("post:audit")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "小红书管理（旧后台兼容，无当前前端依赖）", deprecated: true })
  noteXiaohongshu(@Query() query: any) {
    return { list: [], total: 0 };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 网盘 / 资源
  // ═══════════════════════════════════════════════════════════════════════════

  @Get("netdisk/categories")
  @RequirePermission("netdisk:list")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "网盘分类（新后台兼容）" })
  async netdiskCategories(@Query() query: any) {
    const [list, total] = await Promise.all([
      this.prisma.netDiskCategory.findMany({ orderBy: { sortOrder: "asc" } as any }),
      this.prisma.netDiskCategory.count(),
    ]);
    return { list, total };
  }

  @Get("netdisk/comments")
  @RequirePermission("netdisk:list")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "网盘评论（新后台兼容）" })
  async netdiskComments(@Query() query: any) {
    const { page = 1, pageSize = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.netDiskComment.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" } }),
      this.prisma.netDiskComment.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("netdisk/platforms")
  @RequirePermission("netdisk:list")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "网盘平台（新后台兼容）" })
  async netdiskPlatforms(@Query() query: any) {
    const [list, total] = await Promise.all([
      this.prisma.netDiskPlatform.findMany({ orderBy: { createdAt: "desc" } }),
      this.prisma.netDiskPlatform.count(),
    ]);
    return { list, total };
  }

  @Get("netdisk/reports")
  @RequirePermission("netdisk:list")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "网盘举报（新后台兼容）" })
  async netdiskReports(@Query() query: any) {
    const { page = 1, pageSize = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.report.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" }, where: { targetType: "netdisk" } }),
      this.prisma.report.count({ where: { targetType: "netdisk" } }),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("netdisk/resources")
  @RequirePermission("netdisk:list")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "网盘资源（新后台兼容）" })
  async netdiskResources(@Query() query: any) {
    const { page = 1, pageSize = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.netDiskResource.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" } }),
      this.prisma.netDiskResource.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("resources")
  @RequirePermission("netdisk:list")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "资源概览（新后台兼容）" })
  async resourcesOverview() {
    const [resources, categories, platforms] = await Promise.all([
      this.prisma.netDiskResource.count(),
      this.prisma.netDiskCategory.count(),
      this.prisma.netDiskPlatform.count(),
    ]);
    return { data: { resources, categories, platforms } };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 系统工具
  // ═══════════════════════════════════════════════════════════════════════════

  @Get("system/website")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "网站设置（新后台兼容）" })
  async systemWebsite() {
    const config = await this.prisma.config.findUnique({ where: { key: "website_info" } });
    const value = (config?.value as Record<string, any>) || {};
    return {
      siteName: value.siteName || "灵萌平台",
      logo: value.logo || "",
      favicon: value.favicon || "",
      copyright: value.copyright || "",
      icp: value.icp || "",
      contactEmail: value.contactEmail || "",
      contactPhone: value.contactPhone || "",
      seoTitle: value.seoTitle || value.siteName || "",
      seoDescription: value.seoDescription || "",
      adminTitle: value.adminTitle || "灵萌后台",
    };
  }

  @Get("system/admin")
  @RequirePermission("admin:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "管理员管理（新后台兼容）" })
  systemAdmin(@Query() query: any) {
    return this.adminService.admins(query);
  }

  @Get("system/banned-words")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "敏感词列表（新后台兼容）" })
  async systemBannedWords(@Query() query: any) {
    const { page = 1, pageSize = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.sensitiveWord.findMany({
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.sensitiveWord.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("system/draft-manage")
  @RequirePermission("post:audit")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "草稿管理（新后台兼容）" })
  async systemDraftManage(@Query() query: any) {
    const { page = 1, pageSize = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.post.findMany({ where: { status: "DRAFT" }, skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" } }),
      this.prisma.post.count({ where: { status: "DRAFT" } }),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("system/file")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "文件管理（新后台兼容）" })
  async systemFile(@Query() query: any) {
    const { page = 1, pageSize = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.uploadRecord.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" } }),
      this.prisma.uploadRecord.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("system/map-picker")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "地图选择器（新后台兼容）" })
  async systemMapPicker() {
    const config = await this.prisma.config.findUnique({ where: { key: "amap" } });
    return { data: config?.value || {} };
  }

  @Get("system/miniapp-pages")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "小程序页面管理（新后台兼容）" })
  async systemMiniappPages(@Query() query: any) {
    const [list, total] = await Promise.all([
      this.prisma.miniappPage.findMany({ orderBy: { sortOrder: "asc" } as any }),
      this.prisma.miniappPage.count(),
    ]);
    return { list, total };
  }

  @Get("system/nav-settings")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "导航设置（新后台兼容）" })
  async systemNavSettings() {
    const navs = await this.prisma.regionNav.findMany({ include: { region: { select: { id: true, name: true } } } });
    return { data: navs };
  }

  @Get("system/qrcode")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "二维码管理（新后台兼容）" })
  async systemQrcode(@Query() query: any) { return this.systemFile(query); }

  @Get("system/update")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "系统更新（新后台兼容）" })
  async systemUpdate() {
    const config = await this.prisma.config.findUnique({ where: { key: "system_update" } });
    return { data: config?.value || {} };
  }

  @Get("system/wechat-article-images")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "微信文章图片（新后台兼容）" })
  async systemWechatArticleImages(@Query() query: any) {
    const { page = 1, pageSize = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.wechatArticle.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" } }),
      this.prisma.wechatArticle.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("system/weixin-ci")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "微信CI工具（新后台兼容）" })
  async systemWeixinCi() {
    const config = await this.prisma.config.findUnique({ where: { key: "weixin_ci" } });
    return { data: config?.value || {} };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 通讯录 / 公告 / 漂流瓶 / 相亲
  // ═══════════════════════════════════════════════════════════════════════════

  @Get("contacts")
  @RequirePermission("contacts:list")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "通讯录列表（新后台兼容）" })
  async contactsList(@Query() query: any) {
    const { page = 1, pageSize = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.contact.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" }, include: { category: true } }),
      this.prisma.contact.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("community")
  @RequirePermission("post:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "社区概览（新后台兼容）" })
  async communityOverview() {
    const [communities, payments] = await Promise.all([
      this.prisma.community.count(),
      this.prisma.communityPayment.count(),
    ]);
    return { data: { communities, payments } };
  }

  @Get("drift-bottle")
  @RequirePermission("driftBottle:list")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "漂流瓶列表（新后台兼容）" })
  async driftBottleList(@Query() query: any) {
    const { page = 1, pageSize = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.driftBottle.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" }, include: { user: { select: { id: true, nickname: true } } } }),
      this.prisma.driftBottle.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("dating")
  @RequirePermission("dating:list")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "相亲概览（新后台兼容）" })
  async datingOverview() {
    const [profiles, orders, matches] = await Promise.all([
      this.prisma.datingProfile.count(),
      this.prisma.datingOrder.count(),
      this.prisma.match.count(),
    ]);
    return { data: { profiles, orders, matches } };
  }

  @Get("dating/config-list")
  @RequirePermission("dating:list")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "相亲配置列表（新后台兼容）" })
  async datingConfigList(@Query() query: any) {
    const [list, total] = await Promise.all([
      this.prisma.datingConfig.findMany(),
      this.prisma.datingConfig.count(),
    ]);
    return { list, total };
  }

  @Get("dating/profile-list")
  @RequirePermission("dating:list")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "相亲资料列表（新后台兼容）" })
  async datingProfileList(@Query() query: any) {
    const { page = 1, pageSize = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.datingProfile.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" }, include: { user: { select: { id: true, nickname: true } } } }),
      this.prisma.datingProfile.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("dating/match-list")
  @RequirePermission("dating:list")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "配对列表（新后台兼容）" })
  async datingMatchList(@Query() query: any) {
    const { page = 1, pageSize = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.match.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" } }),
      this.prisma.match.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("dating/order-list")
  @RequirePermission("dating:list")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "相亲订单列表（新后台兼容）" })
  async datingOrderList(@Query() query: any) {
    const { page = 1, pageSize = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.datingOrder.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" }, include: { User: { select: { id: true, nickname: true } } } }),
      this.prisma.datingOrder.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("dating/package-list")
  @RequirePermission("dating:list")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "套餐列表（新后台兼容）" })
  async datingPackageList(@Query() query: any) {
    const { page = 1, pageSize = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.datingPackage.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" } }),
      this.prisma.datingPackage.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("dating/report-list")
  @RequirePermission("dating:list")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "举报列表（新后台兼容）" })
  async datingReportList(@Query() query: any) {
    const { page = 1, pageSize = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.datingReport.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" } }),
      this.prisma.datingReport.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("dating/cache-management")
  @RequirePermission("dating:list")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "缓存管理（旧后台兼容，需对接Redis）", deprecated: true })
  datingCacheManagement() {
    return { data: { cacheKeys: 0, cacheSize: "0 B", hitRate: "N/A", message: "缓存统计需对接Redis实时监控" } };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 机器人 / AI
  // ═══════════════════════════════════════════════════════════════════════════

  @Get("robot-tasks")
  @RequirePermission("bot:list")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "机器人任务列表（新后台兼容）" })
  async robotTasks(@Query() query: any) {
    const { page = 1, pageSize = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.botPostTask.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" } }),
      this.prisma.botPostTask.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 消息 / 通知
  // ═══════════════════════════════════════════════════════════════════════════

  @Get("messages/admin/chat-records")
  @RequirePermission("content:manage")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "聊天记录（新后台兼容）" })
  async chatRecords(@Query() query: any) {
    const { page = 1, pageSize = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.message.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" }, include: { sender: { select: { id: true, nickname: true } } } }),
      this.prisma.message.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("messages/admin/chat-statistics")
  @RequirePermission("content:manage")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "聊天统计（新后台兼容）" })
  async chatStatistics(@Query() query: any) {
    const [conversations, messages, todayMessages] = await Promise.all([
      this.prisma.conversation.count(),
      this.prisma.message.count(),
      this.prisma.message.count({ where: { createdAt: { gte: new Date(new Date().setHours(0,0,0,0)) } } }),
    ]);
    return { data: { conversations, messages, todayMessages } };
  }

  @Get("notifications/admin/all")
  @RequirePermission("activity:edit")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "全部通知（新后台兼容）" })
  notificationsAll(@Query() query: any) {
    return this.adminService.notifications(query);
  }

  @Get("notifications/admin/batch")
  @RequirePermission("activity:edit")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "批量通知（新后台兼容）" })
  async notificationsBatch(@Query() query: any) {
    return this.adminService.notifications({ ...query, pageSize: 999 });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 照片竞赛 / 精选 / 爆炸选择
  // ═══════════════════════════════════════════════════════════════════════════

  @Get("selection")
  @RequirePermission("photoContest:list")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "精选概览（新后台兼容）" })
  async selectionOverview() {
    const [contests, entries, votes] = await Promise.all([
      this.prisma.photoContest.count(),
      this.prisma.photoContestEntry.count(),
      this.prisma.photoContestVote.count(),
    ]);
    return { data: { contests, entries, votes } };
  }

  @Get("selection/competitions")
  @RequirePermission("photoContest:list")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "竞赛列表（新后台兼容）" })
  async selectionCompetitions(@Query() query: any) {
    const { page = 1, pageSize = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.photoContest.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" } }),
      this.prisma.photoContest.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("selection/photos")
  @RequirePermission("photoContest:list")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "照片列表（新后台兼容）" })
  async selectionPhotos(@Query() query: any) {
    const { page = 1, pageSize = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.photoContestEntry.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" } }),
      this.prisma.photoContestEntry.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("selection/pending-photos")
  @RequirePermission("photoContest:list")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "待审核照片（新后台兼容）" })
  async selectionPendingPhotos(@Query() query: any) {
    const { page = 1, pageSize = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.photoContestEntry.findMany({ where: { status: "pending" }, skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" } }),
      this.prisma.photoContestEntry.count({ where: { status: "pending" } }),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("selection/settings")
  @RequirePermission("photoContest:list")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "竞赛设置（新后台兼容）" })
  async selectionSettings() {
    const settings = await this.prisma.photoContestRegionSetting.findMany();
    return { data: settings };
  }

  @Get("selection/votes")
  @RequirePermission("photoContest:list")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "投票列表（新后台兼容）" })
  async selectionVotes(@Query() query: any) {
    const { page = 1, pageSize = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.photoContestVote.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" } }),
      this.prisma.photoContestVote.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("explosivesel/admin/competitions")
  @RequirePermission("photoContest:list")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "爆炸选择-竞赛列表（新后台兼容）" })
  async explosiveselCompetitions(@Query() query: any) { return this.selectionCompetitions(query); }

  @Get("explosivesel/admin/photos")
  @RequirePermission("photoContest:list")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "爆炸选择-照片列表（新后台兼容）" })
  async explosiveselPhotos(@Query() query: any) { return this.selectionPhotos(query); }

  @Get("explosivesel/admin/photos/pending")
  @RequirePermission("photoContest:list")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "爆炸选择-待审核照片（新后台兼容）" })
  async explosiveselPendingPhotos(@Query() query: any) { return this.selectionPendingPhotos(query); }

  @Get("explosivesel/admin/regions")
  @RequirePermission("photoContest:list")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "爆炸选择-区域列表（新后台兼容）" })
  async explosiveselRegions(@Query() query: any) {
    return this.adminService.regions(query);
  }

  @Get("explosivesel/admin/circles")
  @RequirePermission("photoContest:list")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "爆炸选择-圈子列表（新后台兼容）" })
  async explosiveselCircles(@Query() query: any) {
    return this.adminService.circles(query);
  }

  @Get("explosivesel/admin/statistics")
  @RequirePermission("photoContest:list")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "爆炸选择-统计（新后台兼容）" })
  async explosiveselStatistics() { return this.selectionOverview(); }

  @Get("explosivesel/admin/competition-settings")
  @RequirePermission("photoContest:list")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "爆炸选择-竞赛设置（新后台兼容）" })
  async explosiveselCompetitionSettings() { return this.selectionSettings(); }

  @Get("explosivesel/admin/photos/batch-review")
  @RequirePermission("photoContest:list")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "爆炸选择-批量审核照片（新后台兼容）" })
  async explosiveselPhotosBatchReview(@Query() query: any) { return this.selectionPendingPhotos(query); }

  // ═══════════════════════════════════════════════════════════════════════════
  // 用户头衔 / 区域奖励
  // ═══════════════════════════════════════════════════════════════════════════

  @Get("user_titles")
  @RequirePermission("userTitle:list")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "用户头衔列表（新后台兼容）" })
  async userTitles(@Query() query: any) {
    const { page = 1, pageSize = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.userTitle.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { sortOrder: "asc" } }),
      this.prisma.userTitle.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("region-award/user-reward-logs")
  @RequirePermission("region:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "用户奖励日志（新后台兼容）" })
  async userRewardLogs(@Query() query: any) {
    const { page = 1, pageSize = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.incentiveRecord.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" }, include: { User: { select: { id: true, nickname: true } } } }),
      this.prisma.incentiveRecord.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("region-award/user-reward-rules")
  @RequirePermission("region:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "用户奖励规则（新后台兼容）" })
  async userRewardRules(@Query() query: any) { return this.userRewardLogs(query); }

  // ═══════════════════════════════════════════════════════════════════════════
  // 其他杂项
  // ═══════════════════════════════════════════════════════════════════════════

  @Get("merchants/list")
  @RequirePermission("merchant:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "商家列表 v2（新后台兼容）" })
  merchantsList(@Query() query: any) {
    return this.adminService.merchants(query);
  }

  @Get("merchants/applications")
  @RequirePermission("merchant:audit")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "商家入驻申请 v2（新后台兼容）" })
  merchantsApplications(@Query() query: any) {
    return this.adminService.merchants(query);
  }

  @Get("merchants/statistics")
  @RequirePermission("merchant:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "商家统计（新后台兼容）" })
  async merchantsStatistics() {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today.getTime() - 86400000);
    const yearAgo = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
    const [total, todayCount, yesterdayCount] = await Promise.all([
      this.prisma.merchant.count(),
      this.prisma.merchant.count({ where: { createdAt: { gte: today } } }),
      this.prisma.merchant.count({ where: { createdAt: { gte: yesterday, lt: today } } }),
    ]);
    return { total, today: todayCount, yesterday: yesterdayCount, year_ago: 0, growth_rate: "N/A", cache_time: "" };
  }

  @Get("merchants/printer-config")
  @RequirePermission("printer:list")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "打印机配置（新后台兼容）" })
  async merchantsPrinterConfig(@Query() q: any) {
    const [list, total] = await Promise.all([
      this.prisma.printerConfig.findMany({ orderBy: { createdAt: "desc" } }),
      this.prisma.printerConfig.count(),
    ]);
    return { list, total };
  }

  @Get("orders/activity")
  @RequirePermission("order:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "活动订单（新后台兼容）" })
  async ordersActivity(@Query() query: any) {
    const { page = 1, pageSize = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.activityOrder.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" }, include: { user: { select: { id: true, nickname: true } } } }),
      this.prisma.activityOrder.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("orders/topup")
  @RequirePermission("topup:order:list")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "充值订单 v2（新后台兼容）" })
  async ordersTopup(@Query() query: any) {
    const { page = 1, pageSize = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.topupOrder.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" } }),
      this.prisma.topupOrder.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("topnotes/admin/orders")
  @RequirePermission("topup:order:list")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "充值订单（新后台兼容）" })
  async topnotesOrders(@Query() query: any) { return this.ordersTopup(query); }

  @Get("topnotes/packages")
  @RequirePermission("topup:package:list")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "充值套餐（新后台兼容）" })
  async topnotesPackages(@Query() query: any) {
    const [list, total] = await Promise.all([
      this.prisma.topupPackage.findMany({ orderBy: { sortOrder: "asc" } as any }),
      this.prisma.topupPackage.count(),
    ]);
    return { list, total };
  }

  @Get("regions/search-config")
  @RequirePermission("region:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "搜索配置（新后台兼容）" })
  async regionsSearchConfig(@Query() query: any) {
    const config = await this.prisma.config.findUnique({ where: { key: "search_config" } });
    return { data: config?.value || {} };
  }

  @Get("regions/home-feature-style")
  @RequirePermission("region:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "首页特性样式（新后台兼容）" })
  async regionsHomeFeatureStyle() {
    const config = await this.prisma.config.findUnique({ where: { key: "home_feature_style" } });
    return { data: config?.value || {} };
  }

  @Get("regions/share-settings/region/list")
  @RequirePermission("region:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "区域分享设置列表（新后台兼容）" })
  async regionsShareSettingsList(@Query() query: any) {
    const [list, total] = await Promise.all([
      this.prisma.shareSettings.findMany({ orderBy: { createdAt: "desc" } }),
      this.prisma.shareSettings.count(),
    ]);
    return { list, total };
  }

  @Get("regions/tabbar/list")
  @RequirePermission("region:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "导航栏列表（新后台兼容）" })
  async regionsTabbarList(@Query() query: any) {
    const [list, total] = await Promise.all([
      this.prisma.regionTabBar.findMany({ orderBy: { createdAt: "desc" } }),
      this.prisma.regionTabBar.count(),
    ]);
    return { list, total };
  }

  @Get("region-features")
  @RequirePermission("region:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "区域特性（新后台兼容）" })
  async regionFeaturesStandalone(@Query() query: any) {
    return this.adminService.regions(query);
  }

  @Get("api/mall")
  @RequirePermission("product:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "商城API（新后台兼容）" })
  async apiMall() {
    const config = await this.prisma.config.findUnique({ where: { key: "mall_config" } });
    return { data: config?.value || {} };
  }

  @Get("api/email")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "邮件API（新后台兼容）" })
  async apiEmail() {
    const config = await this.prisma.emailConfig.findFirst();
    return { data: config || {} };
  }

  @Get("api/community")
  @RequirePermission("post:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "社区API（新后台兼容）" })
  async apiCommunity() {
    const [communities, payments] = await Promise.all([
      this.prisma.community.count(),
      this.prisma.communityPayment.count(),
    ]);
    return { data: { communities, payments } };
  }

  @Get("config")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "配置概览（新后台兼容）" })
  async configOverview() {
    const configs = await this.prisma.config.findMany({ take: 50, orderBy: { updatedAt: "desc" } });
    return { data: configs };
  }
}
