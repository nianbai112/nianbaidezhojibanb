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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PrismaService } from '../../common/services/prisma.service';
import { JwtGuard } from '../../guards/jwt.guard';
import { AdminGuard, AdminPermissionGuard } from '../../guards/admin.guard';
import { RequirePermission } from '../../decorators/require-permission.decorator';
import { CurrentUser } from '../../decorators/current-user.decorator';

@ApiTags('管理端补充模块')
@Controller('admin')
@UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
@ApiBearerAuth()
export class SupplementController {
  constructor(private readonly prisma: PrismaService) {}

  // ==================== 漂流瓶 ====================

  @Get('drift-bottles')
  @RequirePermission('driftBottle:list')
  @ApiOperation({ summary: '漂流瓶列表' })
  async getDriftBottleList(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
    @Query('keyword') keyword?: string,
  ) {
    const where: any = {};
    if (keyword) where.content = { contains: keyword, mode: 'insensitive' };

    const [list, total] = await Promise.all([
      this.prisma.driftBottle.findMany({
        where,
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, nickname: true, avatar: true } } },
      }),
      this.prisma.driftBottle.count({ where }),
    ]);
    return {
      code: 0,
      data: {
        list: list.map((item) => ({
          ...item,
          type: item.images ? 'image' : item.voice ? 'voice' : 'text',
          status: 'active',
        })),
        total,
        page: +page,
        pageSize: +pageSize,
      },
    };
  }

  @Put('drift-bottles/:id/status')
  @RequirePermission('driftBottle:delete')
  @ApiOperation({ summary: '更新漂流瓶状态' })
  async updateDriftBottleStatus(
    @Param('id') id: string,
    @Body('status') status: string,
    @CurrentUser('sub') adminId: string,
  ) {
    if (status === 'deleted') {
      await this.prisma.driftBottle.delete({ where: { id } });
      await this.logOperation(adminId, 'driftBottle', 'delete', id);
      return { code: 0, message: '已删除' };
    }

    await this.prisma.driftBottle.findUniqueOrThrow({ where: { id } });
    await this.logOperation(adminId, 'driftBottle', 'update_status', id);
    return { code: 0, message: '状态已记录' };
  }

  @Delete('drift-bottles/:id')
  @RequirePermission('driftBottle:delete')
  @ApiOperation({ summary: '删除漂流瓶' })
  async deleteDriftBottle(@Param('id') id: string, @CurrentUser('sub') adminId: string) {
    await this.prisma.driftBottle.delete({ where: { id } });
    await this.logOperation(adminId, 'driftBottle', 'delete', id);
    return { code: 0, message: '已删除' };
  }

  @Get('drift-bottles/reports')
  @RequirePermission('driftBottle:list')
  @ApiOperation({ summary: '漂流瓶举报列表' })
  async getDriftBottleReports(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
    @Query('status') status?: string,
  ) {
    const where: any = {
      targetType: { in: ['drift_bottle', 'driftBottle', 'drift-bottle'] },
    };
    if (status) where.status = status;

    const [list, total] = await Promise.all([
      this.prisma.report.findMany({
        where,
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: 'desc' },
        include: { reporter: { select: { id: true, nickname: true, avatar: true } } },
      }),
      this.prisma.report.count({ where }),
    ]);

    const targetIds = list.map((item) => item.targetId).filter(Boolean);
    const bottles = targetIds.length
      ? await this.prisma.driftBottle.findMany({
          where: { id: { in: targetIds } },
          select: { id: true, content: true },
        })
      : [];
    const bottleMap = new Map(bottles.map((item) => [item.id, item.content]));

    return {
      code: 0,
      data: {
        list: list.map((item) => ({
          ...item,
          targetContent: bottleMap.get(item.targetId) || item.detail || '-',
        })),
        total,
        page: +page,
        pageSize: +pageSize,
      },
    };
  }

  @Post('drift-bottles/reports/:id/handle')
  @RequirePermission('driftBottle:delete')
  @ApiOperation({ summary: '处理漂流瓶举报' })
  async handleDriftBottleReport(
    @Param('id') id: string,
    @Body('action') action: string,
    @CurrentUser('sub') adminId: string,
  ) {
    const status = action === 'ignored' ? 'rejected' : 'resolved';
    await this.prisma.report.update({
      where: { id },
      data: {
        status,
        result: action || status,
        handlerId: adminId,
        handledAt: new Date(),
      },
    });
    await this.logOperation(adminId, 'driftBottle', 'handle_report', id);
    return { code: 0, message: '已处理' };
  }

  // ==================== 打卡点管理 ====================

  @Get('punch-in-locations')
  @RequirePermission('punchIn:location:list')
  @ApiOperation({ summary: '打卡点列表' })
  async getPunchInLocationList(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
    @Query('regionId') regionId?: string,
    @Query('keyword') keyword?: string,
  ) {
    const where: any = {};
    if (regionId) where.regionId = regionId;
    if (keyword) where.name = { contains: keyword, mode: 'insensitive' };

    const [list, total] = await Promise.all([
      this.prisma.punchInLocation.findMany({
        where,
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.punchInLocation.count({ where }),
    ]);
    return { code: 0, data: { list, total, page: +page, pageSize: +pageSize } };
  }

  @Post('punch-in-locations')
  @RequirePermission('punchIn:location:create')
  @ApiOperation({ summary: '创建打卡点' })
  async createPunchInLocation(@Body() data: any, @CurrentUser('sub') adminId: string) {
    const item = await this.prisma.punchInLocation.create({ data });
    await this.logOperation(adminId, 'punchIn', 'create_location', item.id);
    return { code: 0, data: item };
  }

  @Put('punch-in-locations/:id')
  @RequirePermission('punchIn:location:update')
  @ApiOperation({ summary: '更新打卡点' })
  async updatePunchInLocation(@Param('id') id: string, @Body() data: any, @CurrentUser('sub') adminId: string) {
    const item = await this.prisma.punchInLocation.update({ where: { id }, data });
    await this.logOperation(adminId, 'punchIn', 'update_location', id);
    return { code: 0, data: item };
  }

  @Delete('punch-in-locations/:id')
  @RequirePermission('punchIn:location:delete')
  @ApiOperation({ summary: '删除打卡点' })
  async deletePunchInLocation(@Param('id') id: string, @CurrentUser('sub') adminId: string) {
    await this.prisma.punchInLocation.delete({ where: { id } });
    await this.logOperation(adminId, 'punchIn', 'delete_location', id);
    return { code: 0, message: '已删除' };
  }

  @Get('punch-in-records')
  @RequirePermission('punchIn:record:list')
  @ApiOperation({ summary: '打卡记录列表' })
  async getPunchInRecordList(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
    @Query('userId') userId?: string,
    @Query('regionId') regionId?: string,
  ) {
    const where: any = {};
    if (userId) where.userId = userId;
    if (regionId) where.regionId = regionId;

    const [list, total] = await Promise.all([
      this.prisma.punchInRecord.findMany({
        where,
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: 'desc' },
        include: { User: { select: { id: true, nickname: true, avatar: true } } },
      }),
      this.prisma.punchInRecord.count({ where }),
    ]);
    return { code: 0, data: { list, total, page: +page, pageSize: +pageSize } };
  }

  // ==================== 充值套餐 ====================

  @Get('topup/packages')
  @RequirePermission('topup:package:list')
  @ApiOperation({ summary: '充值套餐列表' })
  async getTopupPackageList(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
    @Query('regionId') regionId?: string,
  ) {
    const where: any = {};
    if (regionId) where.regionId = regionId;

    const [list, total] = await Promise.all([
      this.prisma.topupPackage.findMany({
        where,
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { sortOrder: 'asc' },
      }),
      this.prisma.topupPackage.count({ where }),
    ]);
    return { code: 0, data: { list, total, page: +page, pageSize: +pageSize } };
  }

  @Post('topup/packages')
  @RequirePermission('topup:package:create')
  @ApiOperation({ summary: '创建充值套餐' })
  async createTopupPackage(@Body() data: any, @CurrentUser('sub') adminId: string) {
    const item = await this.prisma.topupPackage.create({ data });
    await this.logOperation(adminId, 'topup', 'create_package', item.id);
    return { code: 0, data: item };
  }

  @Put('topup/packages/:id')
  @RequirePermission('topup:package:update')
  @ApiOperation({ summary: '更新充值套餐' })
  async updateTopupPackage(@Param('id') id: string, @Body() data: any, @CurrentUser('sub') adminId: string) {
    const item = await this.prisma.topupPackage.update({ where: { id }, data });
    await this.logOperation(adminId, 'topup', 'update_package', id);
    return { code: 0, data: item };
  }

  @Delete('topup/packages/:id')
  @RequirePermission('topup:package:delete')
  @ApiOperation({ summary: '删除充值套餐' })
  async deleteTopupPackage(@Param('id') id: string, @CurrentUser('sub') adminId: string) {
    await this.prisma.topupPackage.delete({ where: { id } });
    await this.logOperation(adminId, 'topup', 'delete_package', id);
    return { code: 0, message: '已删除' };
  }

  @Get('topup/orders')
  @RequirePermission('topup:order:list')
  @ApiOperation({ summary: '充值订单列表' })
  async getTopupOrderList(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
    @Query('orderNo') orderNo?: string,
    @Query('status') status?: string,
    @Query('userId') userId?: string,
  ) {
    const where: any = {};
    if (orderNo) where.orderNo = { contains: orderNo };
    if (status) where.status = status;
    if (userId) where.userId = userId;

    const [list, total] = await Promise.all([
      this.prisma.topupOrder.findMany({
        where,
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: 'desc' },
        include: { User: { select: { id: true, nickname: true } } },
      }),
      this.prisma.topupOrder.count({ where }),
    ]);
    return { code: 0, data: { list, total, page: +page, pageSize: +pageSize } };
  }

  // ==================== 社团管理 ====================

  @Get('clubs')
  @RequirePermission('club:list')
  @ApiOperation({ summary: '社团列表' })
  async getClubList(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
    @Query('keyword') keyword?: string,
    @Query('status') status?: string,
    @Query('regionId') regionId?: string,
  ) {
    const where: any = {};
    if (keyword) where.name = { contains: keyword, mode: 'insensitive' };
    if (status) where.status = status;
    if (regionId) where.regionId = regionId;

    const [list, total] = await Promise.all([
      this.prisma.activityClub.findMany({
        where,
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          members: { select: { id: true, role: true, userId: true } },
          _count: { select: { members: true } },
        },
      }),
      this.prisma.activityClub.count({ where }),
    ]);
    return { code: 0, data: { list, total, page: +page, pageSize: +pageSize } };
  }

  @Get('clubs/:id')
  @RequirePermission('club:detail')
  @ApiOperation({ summary: '社团详情' })
  async getClubDetail(@Param('id') id: string) {
    const item = await this.prisma.activityClub.findUnique({
      where: { id },
      include: {
        members: {
          include: { user: { select: { id: true, nickname: true, avatar: true } } },
        },
      },
    });
    return { code: 0, data: item };
  }

  @Post('clubs')
  @RequirePermission('club:create')
  @ApiOperation({ summary: '创建社团' })
  async createClub(@Body() data: any, @CurrentUser('sub') adminId: string) {
    const item = await this.prisma.activityClub.create({ data });
    await this.logOperation(adminId, 'club', 'create', item.id);
    return { code: 0, data: item };
  }

  @Put('clubs/:id')
  @RequirePermission('club:update')
  @ApiOperation({ summary: '更新社团' })
  async updateClub(@Param('id') id: string, @Body() data: any, @CurrentUser('sub') adminId: string) {
    const item = await this.prisma.activityClub.update({ where: { id }, data });
    await this.logOperation(adminId, 'club', 'update', id);
    return { code: 0, data: item };
  }

  @Put('clubs/:id/status')
  @RequirePermission('club:audit')
  @ApiOperation({ summary: '更新社团状态' })
  async updateClubStatus(@Param('id') id: string, @Body('status') status: string, @CurrentUser('sub') adminId: string) {
    await this.prisma.activityClub.update({ where: { id }, data: { status } });
    await this.logOperation(adminId, 'club', 'update_status', id);
    return { code: 0, message: '已更新' };
  }

  @Delete('clubs/:id')
  @RequirePermission('club:delete')
  @ApiOperation({ summary: '删除社团' })
  async deleteClub(@Param('id') id: string, @CurrentUser('sub') adminId: string) {
    await this.prisma.activityClub.delete({ where: { id } });
    await this.logOperation(adminId, 'club', 'delete', id);
    return { code: 0, message: '已删除' };
  }

  @Get('clubs/:id/members')
  @RequirePermission('club:member:list')
  @ApiOperation({ summary: '社团成员列表' })
  async getClubMemberList(
    @Param('id') clubId: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    const [list, total] = await Promise.all([
      this.prisma.activityClubMember.findMany({
        where: { clubId },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, nickname: true, avatar: true } } },
      }),
      this.prisma.activityClubMember.count({ where: { clubId } }),
    ]);
    return { code: 0, data: { list, total, page: +page, pageSize: +pageSize } };
  }

  @Delete('club-members/:id')
  @RequirePermission('club:member:delete')
  @ApiOperation({ summary: '移除社团成员' })
  async deleteClubMember(@Param('id') id: string, @CurrentUser('sub') adminId: string) {
    await this.prisma.activityClubMember.delete({ where: { id } });
    await this.logOperation(adminId, 'club', 'delete_member', id);
    return { code: 0, message: '已移除' };
  }

  // ==================== 评论抽奖 ====================

  @Get('lotteries')
  @RequirePermission('lottery:list')
  @ApiOperation({ summary: '抽奖列表' })
  async getLotteryList(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
    @Query('status') status?: string,
  ) {
    const where: any = {};
    if (status) where.status = status;

    const [list, total] = await Promise.all([
      this.prisma.commentLottery.findMany({
        where,
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          prizes: true,
          _count: { select: { winners: true } },
        },
      }),
      this.prisma.commentLottery.count({ where }),
    ]);
    return { code: 0, data: { list, total, page: +page, pageSize: +pageSize } };
  }

  @Get('lotteries/:id')
  @RequirePermission('lottery:detail')
  @ApiOperation({ summary: '抽奖详情' })
  async getLotteryDetail(@Param('id') id: string) {
    const item = await this.prisma.commentLottery.findUnique({
      where: { id },
      include: { prizes: true, winners: true },
    });
    return { code: 0, data: item };
  }

  @Delete('lotteries/:id')
  @RequirePermission('lottery:delete')
  @ApiOperation({ summary: '删除抽奖' })
  async deleteLottery(@Param('id') id: string, @CurrentUser('sub') adminId: string) {
    await this.prisma.commentLottery.delete({ where: { id } });
    await this.logOperation(adminId, 'lottery', 'delete', id);
    return { code: 0, message: '已删除' };
  }

  @Get('lotteries/:id/winners')
  @RequirePermission('lottery:record:list')
  @ApiOperation({ summary: '中奖记录列表' })
  async getLotteryWinnerList(
    @Param('id') lotteryId: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    const [list, total] = await Promise.all([
      this.prisma.commentLotteryWinner.findMany({
        where: { lotteryId },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: 'desc' },
        include: { lottery: true },
      }),
      this.prisma.commentLotteryWinner.count({ where: { lotteryId } }),
    ]);
    return { code: 0, data: { list, total, page: +page, pageSize: +pageSize } };
  }

  // ==================== 排行榜 ====================

  @Get('rankings')
  @Get('ranking/rules')
  @RequirePermission('ranking:list')
  @ApiOperation({ summary: '排行榜列表' })
  async getRankingList(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
    @Query('type') type?: string,
    @Query('regionId') regionId?: string,
  ) {
    const where: any = {};
    if (type) where.type = type;
    if (regionId) where.regionId = regionId;

    const [list, total] = await Promise.all([
      this.prisma.ranking.findMany({
        where,
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.ranking.count({ where }),
    ]);
    return { code: 0, data: { list, total, page: +page, pageSize: +pageSize } };
  }

  @Post('rankings')
  @RequirePermission('ranking:create')
  @ApiOperation({ summary: '创建排行榜' })
  async createRanking(@Body() data: any, @CurrentUser('sub') adminId: string) {
    const item = await this.prisma.ranking.create({ data });
    await this.logOperation(adminId, 'ranking', 'create', item.id);
    return { code: 0, data: item };
  }

  @Put('rankings/:id')
  @Put('ranking/rules/:id')
  @RequirePermission('ranking:update')
  @ApiOperation({ summary: '更新排行榜' })
  async updateRanking(@Param('id') id: string, @Body() data: any, @CurrentUser('sub') adminId: string) {
    const item = await this.prisma.ranking.update({ where: { id }, data });
    await this.logOperation(adminId, 'ranking', 'update', id);
    return { code: 0, data: item };
  }

  @Delete('rankings/:id')
  @Delete('ranking/rules/:id')
  @RequirePermission('ranking:delete')
  @ApiOperation({ summary: '删除排行榜' })
  async deleteRanking(@Param('id') id: string, @CurrentUser('sub') adminId: string) {
    await this.prisma.ranking.delete({ where: { id } });
    await this.logOperation(adminId, 'ranking', 'delete', id);
    return { code: 0, message: '已删除' };
  }

  // ==================== 用户引导页 ====================

  @Get('user-guidance/pages')
  @RequirePermission('userGuidance:list')
  @ApiOperation({ summary: '用户引导页列表' })
  async getUserGuidancePageList(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
    @Query('regionId') regionId?: string,
  ) {
    const where: any = {};
    if (regionId) where.regionId = regionId;

    const [list, total] = await Promise.all([
      this.prisma.userGuidancePage.findMany({
        where,
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { sortOrder: 'asc' },
      }),
      this.prisma.userGuidancePage.count({ where }),
    ]);
    return { code: 0, data: { list, total, page: +page, pageSize: +pageSize } };
  }

  @Post('user-guidance/pages')
  @RequirePermission('userGuidance:create')
  @ApiOperation({ summary: '创建用户引导页' })
  async createUserGuidancePage(@Body() data: any, @CurrentUser('sub') adminId: string) {
    const item = await this.prisma.userGuidancePage.create({ data });
    await this.logOperation(adminId, 'userGuidance', 'create', item.id);
    return { code: 0, data: item };
  }

  @Put('user-guidance/pages/:id')
  @RequirePermission('userGuidance:update')
  @ApiOperation({ summary: '更新用户引导页' })
  async updateUserGuidancePage(@Param('id') id: string, @Body() data: any, @CurrentUser('sub') adminId: string) {
    const item = await this.prisma.userGuidancePage.update({ where: { id }, data });
    await this.logOperation(adminId, 'userGuidance', 'update', id);
    return { code: 0, data: item };
  }

  @Delete('user-guidance/pages/:id')
  @RequirePermission('userGuidance:delete')
  @ApiOperation({ summary: '删除用户引导页' })
  async deleteUserGuidancePage(@Param('id') id: string, @CurrentUser('sub') adminId: string) {
    await this.prisma.userGuidancePage.delete({ where: { id } });
    await this.logOperation(adminId, 'userGuidance', 'delete', id);
    return { code: 0, message: '已删除' };
  }

  // ==================== 通讯录/黄页 ====================

  @Get('contact-categories')
  @RequirePermission('contacts:category:list')
  @ApiOperation({ summary: '通讯录分类列表' })
  async getContactCategoryList(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
    @Query('regionId') regionId?: string,
  ) {
    const where: any = {};
    if (regionId) where.regionId = regionId;

    const [list, total] = await Promise.all([
      this.prisma.contactCategory.findMany({
        where,
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { sortOrder: 'asc' },
      }),
      this.prisma.contactCategory.count({ where }),
    ]);
    return { code: 0, data: { list, total, page: +page, pageSize: +pageSize } };
  }

  @Post('contact-categories')
  @RequirePermission('contacts:category:create')
  @ApiOperation({ summary: '创建通讯录分类' })
  async createContactCategory(@Body() data: any, @CurrentUser('sub') adminId: string) {
    const item = await this.prisma.contactCategory.create({ data });
    await this.logOperation(adminId, 'contacts', 'create_category', item.id);
    return { code: 0, data: item };
  }

  @Put('contact-categories/:id')
  @RequirePermission('contacts:category:update')
  @ApiOperation({ summary: '更新通讯录分类' })
  async updateContactCategory(@Param('id') id: string, @Body() data: any, @CurrentUser('sub') adminId: string) {
    const item = await this.prisma.contactCategory.update({ where: { id }, data });
    await this.logOperation(adminId, 'contacts', 'update_category', id);
    return { code: 0, data: item };
  }

  @Delete('contact-categories/:id')
  @RequirePermission('contacts:category:delete')
  @ApiOperation({ summary: '删除通讯录分类' })
  async deleteContactCategory(@Param('id') id: string, @CurrentUser('sub') adminId: string) {
    await this.prisma.contactCategory.delete({ where: { id } });
    await this.logOperation(adminId, 'contacts', 'delete_category', id);
    return { code: 0, message: '已删除' };
  }

  @Get('contacts')
  @RequirePermission('contacts:list')
  @ApiOperation({ summary: '通讯录列表' })
  async getContactList(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
    @Query('categoryId') categoryId?: string,
    @Query('keyword') keyword?: string,
  ) {
    const where: any = {};
    if (categoryId) where.categoryId = categoryId;
    if (keyword) where.name = { contains: keyword, mode: 'insensitive' };

    const [list, total] = await Promise.all([
      this.prisma.contact.findMany({
        where,
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: 'desc' },
        include: { category: { select: { id: true, name: true } } },
      }),
      this.prisma.contact.count({ where }),
    ]);
    return { code: 0, data: { list, total, page: +page, pageSize: +pageSize } };
  }

  @Post('contacts')
  @RequirePermission('contacts:create')
  @ApiOperation({ summary: '创建通讯录联系人' })
  async createContact(@Body() data: any, @CurrentUser('sub') adminId: string) {
    const item = await this.prisma.contact.create({ data });
    await this.logOperation(adminId, 'contacts', 'create', item.id);
    return { code: 0, data: item };
  }

  @Put('contacts/:id')
  @RequirePermission('contacts:update')
  @ApiOperation({ summary: '更新通讯录联系人' })
  async updateContact(@Param('id') id: string, @Body() data: any, @CurrentUser('sub') adminId: string) {
    const item = await this.prisma.contact.update({ where: { id }, data });
    await this.logOperation(adminId, 'contacts', 'update', id);
    return { code: 0, data: item };
  }

  @Delete('contacts/:id')
  @RequirePermission('contacts:delete')
  @ApiOperation({ summary: '删除通讯录联系人' })
  async deleteContact(@Param('id') id: string, @CurrentUser('sub') adminId: string) {
    await this.prisma.contact.delete({ where: { id } });
    await this.logOperation(adminId, 'contacts', 'delete', id);
    return { code: 0, message: '已删除' };
  }

  // ==================== 微信文章 ====================

  @Get('wechat-articles')
  @RequirePermission('wechatArticle:list')
  @ApiOperation({ summary: '微信文章列表' })
  async getWechatArticleList(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
    @Query('keyword') keyword?: string,
  ) {
    const where: any = {};
    if (keyword) where.title = { contains: keyword, mode: 'insensitive' };

    const [list, total] = await Promise.all([
      this.prisma.wechatArticle.findMany({
        where,
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.wechatArticle.count({ where }),
    ]);
    return { code: 0, data: { list, total, page: +page, pageSize: +pageSize } };
  }

  @Delete('wechat-articles/:id')
  @RequirePermission('wechatArticle:delete')
  @ApiOperation({ summary: '删除微信文章' })
  async deleteWechatArticle(@Param('id') id: string, @CurrentUser('sub') adminId: string) {
    await this.prisma.wechatArticle.delete({ where: { id } });
    await this.logOperation(adminId, 'wechatArticle', 'delete', id);
    return { code: 0, message: '已删除' };
  }

  // ==================== 打印机配置 ====================

  @Get('printers')
  @RequirePermission('printer:list')
  @ApiOperation({ summary: '打印机列表' })
  async getPrinterList(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
    @Query('merchantId') merchantId?: string,
    @Query('status') status?: string,
  ) {
    const where: any = {};
    if (merchantId) where.merchantId = merchantId;
    if (status) where.status = status;

    const [list, total] = await Promise.all([
      this.prisma.printerConfig.findMany({
        where,
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.printerConfig.count({ where }),
    ]);
    return { code: 0, data: { list, total, page: +page, pageSize: +pageSize } };
  }

  @Put('printers/:id/status')
  @RequirePermission('printer:update')
  @ApiOperation({ summary: '更新打印机状态' })
  async updatePrinterStatus(@Param('id') id: string, @Body('status') status: string, @CurrentUser('sub') adminId: string) {
    await this.prisma.printerConfig.update({ where: { id }, data: { status } });
    await this.logOperation(adminId, 'printer', 'update_status', id);
    return { code: 0, message: '已更新' };
  }

  @Delete('printers/:id')
  @RequirePermission('printer:delete')
  @ApiOperation({ summary: '删除打印机' })
  async deletePrinter(@Param('id') id: string, @CurrentUser('sub') adminId: string) {
    await this.prisma.printerConfig.delete({ where: { id } });
    await this.logOperation(adminId, 'printer', 'delete', id);
    return { code: 0, message: '已删除' };
  }

  // ==================== 用户头衔/称号 ====================

  @Get('user-titles')
  @RequirePermission('userTitle:list')
  @ApiOperation({ summary: '用户头衔列表' })
  async getUserTitleList(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
    @Query('regionId') regionId?: string,
    @Query('type') type?: string,
  ) {
    const where: any = {};
    if (regionId) where.regionId = regionId;
    if (type) where.type = type;

    const [list, total] = await Promise.all([
      this.prisma.userTitle.findMany({
        where,
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { sortOrder: 'asc' },
        include: { _count: { select: { records: true } } },
      }),
      this.prisma.userTitle.count({ where }),
    ]);
    return { code: 0, data: { list, total, page: +page, pageSize: +pageSize } };
  }

  @Post('user-titles')
  @RequirePermission('userTitle:create')
  @ApiOperation({ summary: '创建用户头衔' })
  async createUserTitle(@Body() data: any, @CurrentUser('sub') adminId: string) {
    const item = await this.prisma.userTitle.create({ data });
    await this.logOperation(adminId, 'userTitle', 'create', item.id);
    return { code: 0, data: item };
  }

  @Put('user-titles/:id')
  @RequirePermission('userTitle:update')
  @ApiOperation({ summary: '更新用户头衔' })
  async updateUserTitle(@Param('id') id: string, @Body() data: any, @CurrentUser('sub') adminId: string) {
    const item = await this.prisma.userTitle.update({ where: { id }, data });
    await this.logOperation(adminId, 'userTitle', 'update', id);
    return { code: 0, data: item };
  }

  @Delete('user-titles/:id')
  @RequirePermission('userTitle:delete')
  @ApiOperation({ summary: '删除用户头衔' })
  async deleteUserTitle(@Param('id') id: string, @CurrentUser('sub') adminId: string) {
    await this.prisma.userTitle.delete({ where: { id } });
    await this.logOperation(adminId, 'userTitle', 'delete', id);
    return { code: 0, message: '已删除' };
  }

  @Get('user-titles/:id/redeem-codes')
  @RequirePermission('userTitle:code:list')
  @ApiOperation({ summary: '头衔兑换码列表' })
  async getUserTitleRedeemCodeList(
    @Param('id') titleId: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    const [list, total] = await Promise.all([
      this.prisma.userTitleRedeemCode.findMany({
        where: { titleId },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.userTitleRedeemCode.count({ where: { titleId } }),
    ]);
    return { code: 0, data: { list, total, page: +page, pageSize: +pageSize } };
  }

  @Post('user-titles/:id/redeem-codes')
  @RequirePermission('userTitle:code:create')
  @ApiOperation({ summary: '批量生成兑换码' })
  async createUserTitleRedeemCodes(@Param('id') titleId: string, @Body('count') count: number, @CurrentUser('sub') adminId: string) {
    const codes = Array.from({ length: count || 10 }).map(() => ({
      titleId,
      code: Math.random().toString(36).substring(2, 10).toUpperCase(),
    }));
    await this.prisma.userTitleRedeemCode.createMany({ data: codes });
    await this.logOperation(adminId, 'userTitle', 'generate_codes', titleId);
    return { code: 0, message: `已生成 ${codes.length} 个兑换码` };
  }

  // ==================== 贴纸/表情包 ====================

  @Get('sticker-categories')
  @RequirePermission('sticker:category:list')
  @ApiOperation({ summary: '贴纸分类列表' })
  async getStickerCategoryList(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    const [list, total] = await Promise.all([
      this.prisma.stickerCategory.findMany({
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { sortOrder: 'asc' },
      }),
      this.prisma.stickerCategory.count(),
    ]);
    return { code: 0, data: { list, total, page: +page, pageSize: +pageSize } };
  }

  @Post('sticker-categories')
  @RequirePermission('sticker:category:create')
  @ApiOperation({ summary: '创建贴纸分类' })
  async createStickerCategory(@Body() data: any, @CurrentUser('sub') adminId: string) {
    const item = await this.prisma.stickerCategory.create({ data });
    await this.logOperation(adminId, 'sticker', 'create_category', item.id);
    return { code: 0, data: item };
  }

  @Put('sticker-categories/:id')
  @RequirePermission('sticker:category:update')
  @ApiOperation({ summary: '更新贴纸分类' })
  async updateStickerCategory(@Param('id') id: string, @Body() data: any, @CurrentUser('sub') adminId: string) {
    const item = await this.prisma.stickerCategory.update({ where: { id }, data });
    await this.logOperation(adminId, 'sticker', 'update_category', id);
    return { code: 0, data: item };
  }

  @Delete('sticker-categories/:id')
  @RequirePermission('sticker:category:delete')
  @ApiOperation({ summary: '删除贴纸分类' })
  async deleteStickerCategory(@Param('id') id: string, @CurrentUser('sub') adminId: string) {
    await this.prisma.stickerCategory.delete({ where: { id } });
    await this.logOperation(adminId, 'sticker', 'delete_category', id);
    return { code: 0, message: '已删除' };
  }

  @Get('stickers')
  @RequirePermission('sticker:list')
  @ApiOperation({ summary: '贴纸列表' })
  async getStickerList(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
    @Query('categoryId') categoryId?: string,
    @Query('status') status?: string,
  ) {
    const where: any = {};
    if (categoryId) where.categoryId = categoryId;
    if (status) where.status = status;

    const [list, total] = await Promise.all([
      this.prisma.sticker.findMany({
        where,
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: 'desc' },
        include: { User: { select: { id: true, nickname: true } } },
      }),
      this.prisma.sticker.count({ where }),
    ]);
    return { code: 0, data: { list, total, page: +page, pageSize: +pageSize } };
  }

  @Put('stickers/:id/status')
  @RequirePermission('sticker:update')
  @ApiOperation({ summary: '更新贴纸状态' })
  async updateStickerStatus(@Param('id') id: string, @Body('status') status: string, @CurrentUser('sub') adminId: string) {
    await this.prisma.sticker.update({ where: { id }, data: { status } });
    await this.logOperation(adminId, 'sticker', 'update_status', id);
    return { code: 0, message: '已更新' };
  }

  @Delete('stickers/:id')
  @RequirePermission('sticker:delete')
  @ApiOperation({ summary: '删除贴纸' })
  async deleteSticker(@Param('id') id: string, @CurrentUser('sub') adminId: string) {
    await this.prisma.sticker.delete({ where: { id } });
    await this.logOperation(adminId, 'sticker', 'delete', id);
    return { code: 0, message: '已删除' };
  }

  // ==================== 激励记录 ====================

  @Get('incentive-records')
  @RequirePermission('dashboard:view')
  @ApiOperation({ summary: '激励记录列表' })
  async getIncentiveRecordList(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
    @Query('userId') userId?: string,
    @Query('type') type?: string,
  ) {
    const where: any = {};
    if (userId) where.userId = userId;
    if (type) where.type = type;

    const [list, total] = await Promise.all([
      this.prisma.incentiveRecord.findMany({
        where,
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: 'desc' },
        include: { User: { select: { id: true, nickname: true } } },
      }),
      this.prisma.incentiveRecord.count({ where }),
    ]);
    return { code: 0, data: { list, total, page: +page, pageSize: +pageSize } };
  }

  private async logOperation(adminId: string, module: string, action: string, targetId?: string) {
    try {
      await this.prisma.adminOperationLog.create({
        data: {
          accountId: adminId,
          action,
          module,
          targetId: targetId || '',
          detail: {},
          ip: '',
        },
      });
    } catch {
      // 日志记录失败不影响主操作
    }
  }
}
