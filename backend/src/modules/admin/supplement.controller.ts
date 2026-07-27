import {
  BadRequestException,
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
import { PaymentService } from '../payment/payment.service';
import { NotifyService } from '../notify/notify.service';
import { JwtGuard } from '../../guards/jwt.guard';
import { AdminGuard, AdminPermissionGuard } from '../../guards/admin.guard';
import { RequirePermission } from '../../decorators/require-permission.decorator';
import { CurrentUser } from '../../decorators/current-user.decorator';

@ApiTags('管理端补充模块')
@Controller('admin')
@UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
@ApiBearerAuth()
export class SupplementController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentService: PaymentService,
    private readonly notifyService: NotifyService,
  ) {}

  private normalizeNullableString(value: unknown) {
    if (value === undefined || value === null || value === '') return undefined;
    return String(value);
  }

  private normalizeNumber(value: unknown) {
    if (value === undefined || value === null || value === '') return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private normalizeTopupPackagePayload(input: any, isCreate = false) {
    const payload: any = {};
    const regionId = this.normalizeNullableString(input?.regionId ?? input?.region_id);
    const name = this.normalizeNullableString(input?.name ?? input?.packageName ?? input?.package_name);
    const amount = this.normalizeNumber(input?.amount ?? input?.currentPrice ?? input?.current_price);
    const originalPrice = this.normalizeNumber(input?.originalPrice ?? input?.original_price);
    const duration = this.normalizeNumber(input?.duration);
    const durationUnit = this.normalizeNullableString(input?.durationUnit ?? input?.duration_unit);
    const description = this.normalizeNullableString(input?.description);
    const sortOrder = this.normalizeNumber(input?.sortOrder ?? input?.sort_order);

    if (regionId !== undefined) payload.regionId = regionId;
    if (name !== undefined) payload.name = name;
    if (amount !== undefined) payload.amount = amount;
    if (originalPrice !== undefined) payload.originalPrice = originalPrice;
    if (duration !== undefined) payload.duration = Math.max(1, Math.floor(duration));
    if (durationUnit !== undefined) payload.durationUnit = durationUnit;
    if (description !== undefined) payload.description = description;
    if (sortOrder !== undefined) payload.sortOrder = Math.floor(sortOrder);
    if (input?.isShow !== undefined || input?.is_show !== undefined) {
      payload.isShow = input?.isShow === true || input?.isShow === 1 || input?.isShow === '1' || input?.is_show === true || input?.is_show === 1 || input?.is_show === '1';
    }

    if (isCreate && !payload.regionId) throw new BadRequestException('请选择区域');
    if (isCreate && !payload.name) throw new BadRequestException('套餐名称不能为空');
    if (isCreate && (!payload.amount || payload.amount <= 0)) throw new BadRequestException('套餐价格必须大于0');
    if (isCreate && !payload.duration) payload.duration = 24;
    if (isCreate && !payload.durationUnit) payload.durationUnit = 'hours';
    if (isCreate && payload.originalPrice === undefined) payload.originalPrice = payload.amount;
    return payload;
  }

  private mapTopupPackage(item: any) {
    const currentPrice = Number(item.amount || 0);
    return {
      ...item,
      package_id: item.id,
      package_name: item.name,
      region_id: item.regionId,
      current_price: currentPrice,
      original_price: Number(item.originalPrice || currentPrice),
      duration_unit: item.durationUnit,
      sort_order: item.sortOrder,
      is_show: item.isShow ? 1 : 0,
    };
  }

  private mapTopupOrder(item: any, postMap: Map<string, any>) {
    const post = item.postId ? postMap.get(item.postId) : null;
    return {
      ...item,
      order_id: item.id,
      order_no: item.orderNo,
      payment_no: item.paymentNo,
      user_id: item.userId,
      post_id: item.postId,
      region_id: item.regionId,
      package_id: item.packageId,
      package_name: item.packageName,
      amount: Number(item.amount || 0),
      duration_unit: item.durationUnit,
      order_status: item.status,
      top_expire_at: item.topExpireAt,
      pay_time: item.payTime,
      created_at: item.createdAt,
      user: item.User,
      post,
      postTitle: post?.title || post?.content?.slice?.(0, 30) || '',
    };
  }

  private toBoolFlag(value: any, fallback = false) {
    if (value === undefined || value === null || value === '') return fallback;
    return value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true';
  }

  private normalizeStickerCategoryPayload(input: any) {
    const payload: any = {};
    const name = this.normalizeNullableString(input?.name);
    const icon = this.normalizeNullableString(input?.icon);
    const description = this.normalizeNullableString(input?.description);
    const sortOrder = this.normalizeNumber(input?.sortOrder ?? input?.sort_order);
    if (name !== undefined) payload.name = name;
    if (icon !== undefined) payload.icon = icon;
    if (description !== undefined) payload.description = description;
    if (sortOrder !== undefined) payload.sortOrder = Math.floor(sortOrder);
    if (input?.isActive !== undefined || input?.is_active !== undefined) {
      payload.isActive = this.toBoolFlag(input?.isActive ?? input?.is_active, true);
    }
    return payload;
  }

  private normalizeStickerPayload(input: any, isCreate = false) {
    const payload: any = {};
    const url = this.normalizeNullableString(input?.url ?? input?.sticker_url ?? input?.stickerUrl);
    const thumbnail = this.normalizeNullableString(input?.thumbnail ?? input?.thumbnail_url ?? input?.thumbnailUrl);
    const name = this.normalizeNullableString(input?.name ?? input?.title);
    const description = this.normalizeNullableString(input?.description);
    const categoryId = this.normalizeNullableString(input?.categoryId ?? input?.category_id);
    const packId = this.normalizeNullableString(input?.packId ?? input?.pack_id);
    const mimeType = this.normalizeNullableString(input?.mimeType ?? input?.mime_type);
    const fileSize = this.normalizeNumber(input?.fileSize ?? input?.file_size);

    if (url !== undefined) payload.url = url;
    if (thumbnail !== undefined) payload.thumbnail = thumbnail;
    if (name !== undefined) payload.name = name;
    if (description !== undefined) payload.description = description;
    if (categoryId !== undefined) payload.categoryId = categoryId;
    if (packId !== undefined) payload.packId = packId;
    if (mimeType !== undefined) payload.mimeType = mimeType;
    if (fileSize !== undefined) payload.fileSize = Math.floor(fileSize);
    if (input?.isShared !== undefined || input?.is_shared !== undefined) {
      payload.isShared = this.toBoolFlag(input?.isShared ?? input?.is_shared);
    }
    if (input?.isOfficial !== undefined || input?.is_official !== undefined) {
      payload.isOfficial = this.toBoolFlag(input?.isOfficial ?? input?.is_official);
      payload.source = payload.isOfficial ? 'system' : 'user';
    }
    if (isCreate) {
      if (!payload.url) throw new BadRequestException('请先上传表情图片');
      if (!payload.name) payload.name = '官方表情';
      if (payload.thumbnail === undefined) payload.thumbnail = payload.url;
      if (payload.isOfficial === undefined) payload.isOfficial = true;
      if (payload.source === undefined) payload.source = payload.isOfficial ? 'system' : 'user';
      if (!payload.status) payload.status = payload.isOfficial ? 'active' : 'pending';
    }
    return payload;
  }

  private mapStickerCategory(item: any) {
    return {
      ...item,
      sort_order: item.sortOrder ?? 0,
      is_active: item.isActive ? 1 : 0,
    };
  }

  private mapSticker(item: any, category?: any) {
    return {
      ...item,
      user: item.User || item.user || null,
      category,
      user_id: item.userId || '',
      category_id: item.categoryId || '',
      pack_id: item.packId || '',
      sticker_url: item.url,
      thumbnail_url: item.thumbnail || item.url,
      title: item.name,
      is_shared: item.isShared ? 1 : 0,
      is_official: item.isOfficial ? 1 : 0,
      source_label: item.isOfficial ? '官方基础表情' : '用户上传表情',
    };
  }

  private normalizeClubPayload(input: any, adminId: string, isCreate = false) {
    const payload: any = {};
    const stringFields = ['regionId', 'name', 'logo', 'background', 'description', 'location', 'phone', 'status'];

    for (const field of stringFields) {
      const value = this.normalizeNullableString(input?.[field]);
      if (value !== undefined) payload[field] = value;
    }

    const cover = this.normalizeNullableString(input?.cover ?? input?.coverImage);
    if (cover !== undefined) payload.cover = cover;

    const lat = this.normalizeNumber(input?.lat);
    if (lat !== undefined) payload.lat = lat;

    const lng = this.normalizeNumber(input?.lng);
    if (lng !== undefined) payload.lng = lng;

    const sortOrder = this.normalizeNumber(input?.sortOrder);
    if (sortOrder !== undefined) payload.sortOrder = sortOrder;

    if (input?.isOfficial !== undefined) payload.isOfficial = Boolean(input.isOfficial);

    const leaderId = this.normalizeNullableString(input?.leaderId);
    if (leaderId) payload.leaderId = leaderId;
    else if (isCreate) payload.leaderId = adminId;

    if (adminId) payload.adminUserId = adminId;

    if (isCreate && !payload.name) throw new BadRequestException('社团名称不能为空');
    if (isCreate && !payload.leaderId) throw new BadRequestException('社长用户ID不能为空');

    return payload;
  }

  private normalizeRankingJson(value: any) {
    if (value === undefined) return undefined;
    if (value === null || value === '') return [];
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return parsed;
      } catch {
        throw new BadRequestException('榜单数据必须是合法 JSON');
      }
    }
    return value;
  }

  private normalizeRankingPayload(input: any, isCreate = false) {
    const payload: any = {};
    const title = this.normalizeNullableString(input?.title ?? input?.name);
    const type = this.normalizeNullableString(input?.type);
    const period = this.normalizeNullableString(input?.period);
    const regionId = this.normalizeNullableString(input?.regionId);
    const data = this.normalizeRankingJson(input?.data);

    if (title !== undefined) payload.title = title;
    if (type !== undefined) payload.type = type;
    if (period !== undefined) payload.period = period;
    if (input?.regionId !== undefined) payload.regionId = regionId || null;
    if (data !== undefined) payload.data = data;
    if (input?.status !== undefined) {
      const meta = typeof payload.data === 'object' && !Array.isArray(payload.data) && payload.data !== null
        ? payload.data
        : payload.data !== undefined
          ? { items: payload.data }
          : {};
      payload.data = { ...meta, status: input.status };
    }

    if (isCreate) {
      if (!payload.title) throw new BadRequestException('榜单名称不能为空');
      payload.type = payload.type || 'post';
      payload.period = payload.period || 'week';
      payload.data = payload.data ?? [];
    }

    return payload;
  }

  private toBoundedInt(value: unknown, fallback: number, min = 0, max = 9999) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, Math.floor(parsed)));
  }

  private toMoney(value: unknown, fallback = 0) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(0, Number(parsed.toFixed(2)));
  }

  private boolValue(value: unknown, fallback = false) {
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value === 1;
    return ['1', 'true', 'yes', 'on', '启用'].includes(String(value).toLowerCase());
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
    if (keyword) where.name = { contains: keyword };

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

  // ==================== 笔记付费置顶 ====================

  @Get('topup/packages')
  @RequirePermission('topup:package:list')
  @ApiOperation({ summary: '笔记置顶套餐列表' })
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
    return { code: 0, data: { list: list.map((item) => this.mapTopupPackage(item)), total, page: +page, pageSize: +pageSize } };
  }

  @Post('topup/packages')
  @RequirePermission('topup:package:create')
  @ApiOperation({ summary: '创建笔记置顶套餐' })
  async createTopupPackage(@Body() data: any, @CurrentUser('sub') adminId: string) {
    const item = await this.prisma.topupPackage.create({ data: this.normalizeTopupPackagePayload(data, true) });
    await this.logOperation(adminId, 'topup', 'create_pin_package', item.id);
    return { code: 0, data: this.mapTopupPackage(item) };
  }

  @Put('topup/packages/:id')
  @RequirePermission('topup:package:update')
  @ApiOperation({ summary: '更新笔记置顶套餐' })
  async updateTopupPackage(@Param('id') id: string, @Body() data: any, @CurrentUser('sub') adminId: string) {
    const item = await this.prisma.topupPackage.update({ where: { id }, data: this.normalizeTopupPackagePayload(data) });
    await this.logOperation(adminId, 'topup', 'update_pin_package', id);
    return { code: 0, data: this.mapTopupPackage(item) };
  }

  @Delete('topup/packages/:id')
  @RequirePermission('topup:package:delete')
  @ApiOperation({ summary: '删除笔记置顶套餐' })
  async deleteTopupPackage(@Param('id') id: string, @CurrentUser('sub') adminId: string) {
    await this.prisma.topupPackage.delete({ where: { id } });
    await this.logOperation(adminId, 'topup', 'delete_pin_package', id);
    return { code: 0, message: '已删除' };
  }

  @Get('topup/orders')
  @RequirePermission('topup:order:list')
  @ApiOperation({ summary: '笔记置顶订单列表' })
  async getTopupOrderList(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
    @Query('orderNo') orderNo?: string,
    @Query('status') status?: string,
    @Query('userId') userId?: string,
    @Query('regionId') regionId?: string,
  ) {
    const where: any = {};
    if (orderNo) where.orderNo = { contains: orderNo };
    if (status) where.status = status;
    if (userId) where.userId = userId;
    if (regionId) where.regionId = regionId;

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
    const postIds = list.map((item) => item.postId).filter(Boolean) as string[];
    const posts = postIds.length
      ? await this.prisma.post.findMany({
          where: { id: { in: postIds } },
          select: { id: true, title: true, content: true, isTop: true, topExpireAt: true },
        })
      : [];
    const postMap = new Map(posts.map((post) => [post.id, post]));
    return { code: 0, data: { list: list.map((item) => this.mapTopupOrder(item, postMap)), total, page: +page, pageSize: +pageSize } };
  }

  @Post('topup/orders/:id/sync-payment')
  @RequirePermission('topup:order:list')
  @ApiOperation({ summary: '同步笔记置顶订单支付状态' })
  async syncTopupOrderPayment(@Param('id') id: string) {
    const order = await this.prisma.topupOrder.findUnique({ where: { id } });
    if (!order) throw new BadRequestException('置顶订单不存在');
    if (!order.paymentNo) throw new BadRequestException('该订单暂无支付单号');

    await this.paymentService.queryPayment(order.paymentNo);

    const updated = await this.prisma.topupOrder.findUnique({ where: { id } });
    if (!updated) throw new BadRequestException('置顶订单不存在');
    const post = updated.postId
      ? await this.prisma.post.findUnique({
          where: { id: updated.postId },
          select: { id: true, title: true, content: true, isTop: true, topExpireAt: true },
        })
      : null;
    return { code: 0, data: this.mapTopupOrder(updated, post ? new Map([[post.id, post]]) : new Map()) };
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
    if (keyword) where.name = { contains: keyword };
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
    const regionIds = Array.from(new Set(list.map((item) => item.regionId).filter(Boolean))) as string[];
    const regions = regionIds.length
      ? await this.prisma.region.findMany({
          where: { id: { in: regionIds } },
          select: { id: true, name: true },
        })
      : [];
    const regionMap = new Map(regions.map((region) => [region.id, region]));
    const withRegions = list.map((item) => ({
      ...item,
      region: item.regionId ? regionMap.get(item.regionId) || null : null,
    }));
    return { code: 0, data: { list: withRegions, total, page: +page, pageSize: +pageSize } };
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
    const region = item?.regionId
      ? await this.prisma.region.findUnique({
          where: { id: item.regionId },
          select: { id: true, name: true },
        })
      : null;
    return { code: 0, data: item ? { ...item, region } : null };
  }

  @Post('clubs')
  @RequirePermission('club:create')
  @ApiOperation({ summary: '创建社团' })
  async createClub(@Body() data: any, @CurrentUser('sub') adminId: string) {
    const item = await this.prisma.activityClub.create({
      data: this.normalizeClubPayload(data, adminId, true),
    });
    await this.logOperation(adminId, 'club', 'create', item.id);
    return { code: 0, data: item };
  }

  @Put('clubs/:id')
  @RequirePermission('club:update')
  @ApiOperation({ summary: '更新社团' })
  async updateClub(@Param('id') id: string, @Body() data: any, @CurrentUser('sub') adminId: string) {
    const item = await this.prisma.activityClub.update({
      where: { id },
      data: this.normalizeClubPayload(data, adminId, false),
    });
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
  @Post('ranking/rules')
  @RequirePermission('ranking:create')
  @ApiOperation({ summary: '创建排行榜' })
  async createRanking(@Body() data: any, @CurrentUser('sub') adminId: string) {
    const item = await this.prisma.ranking.create({ data: this.normalizeRankingPayload(data, true) });
    await this.logOperation(adminId, 'ranking', 'create', item.id);
    return { code: 0, data: item };
  }

  @Put('rankings/:id')
  @Put('ranking/rules/:id')
  @RequirePermission('ranking:update')
  @ApiOperation({ summary: '更新排行榜' })
  async updateRanking(@Param('id') id: string, @Body() data: any, @CurrentUser('sub') adminId: string) {
    const item = await this.prisma.ranking.update({ where: { id }, data: this.normalizeRankingPayload(data) });
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
    if (keyword) where.name = { contains: keyword };

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
    if (keyword) where.title = { contains: keyword };

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
    return { code: 0, data: { list: list.map(({ key, credentialCiphertext, ...printer }) => ({ ...printer, keyConfigured: Boolean(key), credentialConfigured: Boolean(credentialCiphertext) })), total, page: +page, pageSize: +pageSize } };
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
    return { code: 0, data: { list: list.map((item) => this.mapStickerCategory(item)), total, page: +page, pageSize: +pageSize } };
  }

  @Post('sticker-categories')
  @RequirePermission('sticker:category:create')
  @ApiOperation({ summary: '创建贴纸分类' })
  async createStickerCategory(@Body() data: any, @CurrentUser('sub') adminId: string) {
    const item = await this.prisma.stickerCategory.create({ data: this.normalizeStickerCategoryPayload(data) });
    await this.logOperation(adminId, 'sticker', 'create_category', item.id);
    return { code: 0, data: this.mapStickerCategory(item) };
  }

  @Put('sticker-categories/:id')
  @RequirePermission('sticker:category:update')
  @ApiOperation({ summary: '更新贴纸分类' })
  async updateStickerCategory(@Param('id') id: string, @Body() data: any, @CurrentUser('sub') adminId: string) {
    const item = await this.prisma.stickerCategory.update({ where: { id }, data: this.normalizeStickerCategoryPayload(data) });
    await this.logOperation(adminId, 'sticker', 'update_category', id);
    return { code: 0, data: this.mapStickerCategory(item) };
  }

  @Delete('sticker-categories/:id')
  @RequirePermission('sticker:category:delete')
  @ApiOperation({ summary: '删除贴纸分类' })
  async deleteStickerCategory(@Param('id') id: string, @CurrentUser('sub') adminId: string) {
    await this.prisma.stickerCategory.delete({ where: { id } });
    await this.logOperation(adminId, 'sticker', 'delete_category', id);
    return { code: 0, message: '已删除' };
  }

  @Post('stickers')
  @RequirePermission('sticker:update')
  @ApiOperation({ summary: '管理员上传官方表情' })
  async createSticker(@Body() data: any, @CurrentUser('sub') adminId: string) {
    const payload = this.normalizeStickerPayload({ ...data, isOfficial: true }, true);
    const item = await this.prisma.sticker.create({
      data: {
        ...payload,
        userId: null,
        isOfficial: true,
        isShared: true,
        source: 'system',
        status: 'active',
        reviewedBy: adminId || null,
        reviewedAt: new Date(),
        auditReason: '管理员上传官方基础表情',
      },
      include: { User: { select: { id: true, nickname: true } } },
    });
    await this.logOperation(adminId, 'sticker', 'create_official', item.id);
    return { code: 0, data: this.mapSticker(item) };
  }

  @Get('stickers')
  @RequirePermission('sticker:list')
  @ApiOperation({ summary: '贴纸列表' })
  async getStickerList(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
    @Query('categoryId') categoryId?: string,
    @Query('status') status?: string,
    @Query('source') source?: string,
    @Query('keyword') keyword?: string,
    @Query('isShared') isShared?: string,
  ) {
    const where: any = { status: { not: 'deleted' } };
    if (categoryId) where.categoryId = categoryId;
    if (status) where.status = status;
    if (source === 'official') where.isOfficial = true;
    if (source === 'user') where.isOfficial = false;
    if (isShared !== undefined && isShared !== '') where.isShared = this.toBoolFlag(isShared);
    if (keyword) {
      where.OR = [
        { name: { contains: keyword } },
        { description: { contains: keyword } },
      ];
    }

    const [list, total, stats, categories] = await Promise.all([
      this.prisma.sticker.findMany({
        where,
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: 'desc' },
        include: { User: { select: { id: true, nickname: true } } },
      }),
      this.prisma.sticker.count({ where }),
      this.prisma.sticker.groupBy({
        by: ['status'],
        where: { status: { not: 'deleted' } },
        _count: { _all: true },
      }).catch(() => []),
      this.prisma.stickerCategory.findMany(),
    ]);
    const stickerStats = stats as any[];
    const categoryMap = new Map(categories.map((item) => [item.id, this.mapStickerCategory(item)]));
    return {
      code: 0,
      data: {
        list: list.map((item) => this.mapSticker(item, item.categoryId ? categoryMap.get(item.categoryId) : undefined)),
        total,
        page: +page,
        pageSize: +pageSize,
        stats: {
          total: stickerStats.reduce((sum: number, item: any) => sum + item._count._all, 0),
          pending: stickerStats.find((item: any) => item.status === 'pending')?._count?._all || 0,
          active: stickerStats.find((item: any) => item.status === 'active')?._count?._all || 0,
          rejected: stickerStats.find((item: any) => item.status === 'rejected')?._count?._all || 0,
          banned: stickerStats.find((item: any) => item.status === 'banned')?._count?._all || 0,
        },
      },
    };
  }

  @Put('stickers/:id')
  @RequirePermission('sticker:update')
  @ApiOperation({ summary: '更新贴纸信息' })
  async updateSticker(@Param('id') id: string, @Body() data: any, @CurrentUser('sub') adminId: string) {
    const item = await this.prisma.sticker.update({
      where: { id },
      data: this.normalizeStickerPayload(data),
      include: { User: { select: { id: true, nickname: true } } },
    });
    await this.logOperation(adminId, 'sticker', 'update', id);
    return { code: 0, data: this.mapSticker(item) };
  }

  @Put('stickers/:id/status')
  @RequirePermission('sticker:update')
  @ApiOperation({ summary: '更新贴纸状态' })
  async updateStickerStatus(@Param('id') id: string, @Body('status') status: string, @Body('reason') reason: string, @CurrentUser('sub') adminId: string) {
    const allowed = ['pending', 'active', 'rejected', 'banned', 'deleted'];
    if (!allowed.includes(status)) throw new BadRequestException('表情状态不正确');
    const item = await this.prisma.sticker.update({
      where: { id },
      data: {
        status,
        auditReason: reason || (status === 'active' ? '审核通过' : status === 'rejected' ? '审核不通过' : status === 'banned' ? '已禁用' : undefined),
        reviewedBy: ['active', 'rejected', 'banned'].includes(status) ? adminId || null : undefined,
        reviewedAt: ['active', 'rejected', 'banned'].includes(status) ? new Date() : undefined,
      },
    });
    if (item.userId && ['active', 'rejected', 'banned'].includes(status)) {
      const statusText = status === 'active' ? '已通过' : status === 'rejected' ? '未通过' : '已禁用';
      const defaultReason = status === 'active' ? '你的表情包已通过审核，可以在我的表情中使用。' : `你的表情包审核${statusText}，请在我的表情中查看。`;
      await this.notifyService.createAndDispatch({
        userId: item.userId,
        type: 'system',
        scene: 'sticker_review',
        title: '表情包审核结果',
        content: reason || defaultReason,
        data: {
          stickerId: item.id,
          status,
          statusText,
          reason: reason || item.auditReason || '',
        },
        linkType: 'sticker',
        linkValue: item.id,
      }).catch((error) => {
        console.error('表情包审核通知发送失败:', error);
      });
    }
    await this.logOperation(adminId, 'sticker', 'update_status', id);
    return { code: 0, message: '已更新' };
  }

  @Delete('stickers/:id')
  @RequirePermission('sticker:delete')
  @ApiOperation({ summary: '删除贴纸' })
  async deleteSticker(@Param('id') id: string, @CurrentUser('sub') adminId: string) {
    await this.prisma.sticker.update({ where: { id }, data: { status: 'deleted', auditReason: '管理员删除' } });
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
