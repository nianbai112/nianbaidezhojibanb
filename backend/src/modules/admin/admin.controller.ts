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
import { JwtGuard } from "../../guards/jwt.guard";
import { AdminGuard, AdminPermissionGuard } from "../../guards/admin.guard";
import { RequirePermission } from "../../decorators/require-permission.decorator";
import { CurrentUser } from "../../decorators/current-user.decorator";

@ApiTags("后台管理")
@Controller()
@UseGuards(JwtGuard, AdminGuard)
@ApiBearerAuth()
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ============ 仪表盘 ============
  @Get("admin/dashboard")
  @ApiOperation({ summary: "数据仪表盘" })
  dashboard() {
    return this.adminService.dashboard();
  }

  @Get("dashboard/stats")
  @ApiOperation({ summary: "仪表盘统计" })
  dashboardStats() {
    return this.adminService.dashboard();
  }

  @Get("admin/dashboard/trends")
  @ApiOperation({ summary: "仪表盘近7天趋势" })
  dashboardTrends() {
    return this.adminService.dashboardTrends();
  }

  @Get("admin/dashboard/regions")
  @ApiOperation({ summary: "仪表盘区域数据概览" })
  dashboardRegions() {
    return this.adminService.dashboardRegions();
  }

  // ============ 用户管理 ============
  @Get("admin/users")
  @RequirePermission("user:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "用户列表" })
  users(@Query() query: any) {
    return this.adminService.users(query);
  }

  @Get("admin/users/:id")
  @RequirePermission("user:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "用户详情" })
  userDetail(@Param("id") id: string) {
    return this.adminService.userDetail(id);
  }

  @Put("admin/users/:id/ban")
  @RequirePermission("user:ban")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "封禁/解封用户" })
  banUser(
    @Param("id") id: string,
    @Body() dto: { banned: boolean; reason?: string },
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.adminService.banUser(id, dto, operatorId, req.ip);
  }

  @Put("admin/users/:id/status")
  @RequirePermission("user:ban")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "更改用户状态" })
  userStatus(
    @Param("id") id: string,
    @Body() dto: { status: string },
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.adminService.banUser(
      id,
      { banned: dto.status === "banned" || dto.status === "BANNED" },
      operatorId,
      req.ip,
    );
  }

  @Put("admin/users/:id/cert")
  @RequirePermission("user:cert")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "学生认证审核" })
  certUser(
    @Param("id") id: string,
    @Body() dto: { status: string; reason?: string },
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.adminService.auditCert(id, dto, operatorId, req.ip);
  }

  @Post("admin/users/batch")
  @RequirePermission("user:edit")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "批量操作用户" })
  batchUsers(
    @Body() dto: { ids: string[]; action: string; value?: any },
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.adminService.batchUsers(dto, operatorId, req.ip);
  }

  @Get("admin/users/:id/balance-logs")
  @RequirePermission("finance:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "用户余额变动记录" })
  balanceLogs(@Param("id") id: string, @Query() q: any) {
    return this.adminService.userBalanceLogs(id, q);
  }

  @Post("admin/users/balance-adjust")
  @RequirePermission("finance:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "调整用户余额" })
  balanceAdjust(
    @Body() dto: any,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.adminService.userBalanceAdjust(dto, operatorId, req.ip);
  }

  @Get("admin/users/:id/follows")
  @RequirePermission("user:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "用户关注列表" })
  userFollows(@Param("id") id: string, @Query() q: any) {
    return this.adminService.userFollows(id, q);
  }

  @Get("admin/users/:id/fans")
  @RequirePermission("user:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "用户粉丝列表" })
  userFans(@Param("id") id: string, @Query() q: any) {
    return this.adminService.userFans(id, q);
  }

  @Get("admin/users/:id/browse")
  @RequirePermission("user:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "用户浏览记录" })
  userBrowse(@Param("id") id: string, @Query() q: any) {
    return this.adminService.userBrowseHistory(id, q);
  }

  // ============ 区域管理 ============
  @Get("admin/regions")
  @RequirePermission("region:view")
  @UseGuards(AdminPermissionGuard)
  regions(@Query() query: any) {
    return this.adminService.regions(query);
  }

  @Post("admin/regions")
  @RequirePermission("region:edit")
  @UseGuards(AdminPermissionGuard)
  createRegion(@Body() dto: any) {
    return this.adminService.createRegion(dto);
  }

  @Put("admin/regions/:id")
  @RequirePermission("region:edit")
  @UseGuards(AdminPermissionGuard)
  updateRegion(@Param("id") id: string, @Body() dto: any) {
    return this.adminService.updateRegion(id, dto);
  }

  @Put("admin/regions/:id/status")
  @RequirePermission("region:edit")
  @UseGuards(AdminPermissionGuard)
  regionStatus(@Param("id") id: string, @Body() dto: { status: number }) {
    return this.adminService.updateRegion(id, { isOpen: dto.status === 1 });
  }

  @Delete("admin/regions/:id")
  @RequirePermission("region:edit")
  @UseGuards(AdminPermissionGuard)
  deleteRegion(
    @Param("id") id: string,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.adminService.deleteRegion(id, operatorId, req.ip);
  }

  // ============ 内容管理 ============
  @Get("admin/posts")
  @RequirePermission("post:audit")
  @UseGuards(AdminPermissionGuard)
  posts(@Query() query: any) {
    return this.adminService.posts(query);
  }

  @Get("admin/posts/:id")
  @RequirePermission("post:audit")
  @UseGuards(AdminPermissionGuard)
  postDetail(@Param("id") id: string) {
    return this.adminService.postDetail(id);
  }

  @Put("admin/posts/:id/audit")
  @RequirePermission("post:audit")
  @UseGuards(AdminPermissionGuard)
  auditPost(
    @Param("id") id: string,
    @Body() dto: { status: string; reason?: string },
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.adminService.auditPost(id, dto, operatorId, req.ip);
  }

  @Delete("admin/posts/:id")
  @RequirePermission("post:delete")
  @UseGuards(AdminPermissionGuard)
  deletePost(
    @Param("id") id: string,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.adminService.deletePost(id, operatorId, req.ip);
  }

  @Put("admin/posts/:id/top")
  @RequirePermission("post:top")
  @UseGuards(AdminPermissionGuard)
  toggleTop(@Param("id") id: string) {
    return this.adminService.toggleTop(id);
  }

  @Put("admin/posts/:id/essence")
  @RequirePermission("post:top")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "设置/取消精华" })
  toggleEssence(@Param("id") id: string) {
    return this.adminService.toggleEssence(id);
  }

  @Post("admin/posts/batch")
  @RequirePermission("post:audit")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "批量操作帖子" })
  batchPosts(
    @Body() dto: { ids: string[]; action: string; value?: any },
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.adminService.batchPosts(dto, operatorId, req.ip);
  }

  @Get("admin/posts/hot")
  @RequirePermission("post:top")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "热门帖子配置列表" })
  hotPosts() {
    return this.adminService.getHotPosts();
  }

  @Put("admin/posts/hot")
  @RequirePermission("post:top")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "更新热门帖子配置" })
  updateHot(@Body() dto: any) {
    return this.adminService.updateHot(dto);
  }

  @Get("admin/comments")
  @RequirePermission("comment:audit")
  @UseGuards(AdminPermissionGuard)
  comments(@Query() query: any) {
    return this.adminService.comments(query);
  }

  @Delete("admin/comments/:id")
  @RequirePermission("comment:delete")
  @UseGuards(AdminPermissionGuard)
  deleteComment(
    @Param("id") id: string,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.adminService.deleteComment(id, operatorId, req.ip);
  }

  @Put("admin/comments/:id/audit")
  @RequirePermission("comment:audit")
  @UseGuards(AdminPermissionGuard)
  auditComment(
    @Param("id") id: string,
    @Body() dto: { status: string; reason?: string },
  ) {
    return this.adminService.auditComment(id, dto);
  }

  @Get("admin/circles")
  circles(@Query() query: any) {
    return this.adminService.circles(query);
  }

  @Get("admin/circles/:id")
  circleDetail(@Param("id") id: string) {
    return this.adminService.circleDetail(id);
  }

  @Post("admin/circles")
  @RequirePermission("post:audit")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "创建圈子" })
  createCircle(@Body() dto: any) {
    return this.adminService.createCircle(dto);
  }

  @Put("admin/circles/:id")
  @RequirePermission("post:audit")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "更新圈子" })
  updateCircle(@Param("id") id: string, @Body() dto: any) {
    return this.adminService.updateCircle(id, dto);
  }

  @Put("admin/circles/:id/status")
  @RequirePermission("post:audit")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "更改圈子状态" })
  circleStatus(@Param("id") id: string, @Body() dto: { status: number }) {
    return this.adminService.updateCircleStatus(id, dto.status);
  }

  @Get("admin/reports")
  @RequirePermission("report:handle")
  @UseGuards(AdminPermissionGuard)
  reports(@Query() query: any) {
    return this.adminService.reports(query);
  }

  @Put("admin/reports/:id/handle")
  @RequirePermission("report:handle")
  @UseGuards(AdminPermissionGuard)
  handleReport(
    @Param("id") id: string,
    @Body() dto: { status: string; result?: string },
    @CurrentUser("sub") handlerId: string,
    @Req() req: Request,
  ) {
    return this.adminService.handleReport(id, dto, handlerId, req.ip);
  }

  // ============ 商城：商家 ============
  @Get("admin/merchants")
  merchants(@Query() q: any) {
    return this.adminService.merchants(q);
  }

  @Get("admin/merchants/:id")
  merchantDetail(@Param("id") id: string) {
    return this.adminService.merchantDetail(id);
  }

  @Put("admin/merchants/:id/audit")
  @RequirePermission("merchant:audit")
  @UseGuards(AdminPermissionGuard)
  auditMerchant(
    @Param("id") id: string,
    @Body() dto: { status: string; remark?: string },
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.adminService.auditMerchant(id, dto, operatorId, req.ip);
  }

  @Put("admin/merchants/:id/status")
  @RequirePermission("merchant:audit")
  @UseGuards(AdminPermissionGuard)
  merchantStatus(@Param("id") id: string, @Body() dto: { status: number }) {
    return this.adminService.updateMerchantStatus(
      id,
      dto.status === 1 ? "approved" : "closed",
    );
  }

  @Post("admin/merchants/batch")
  @RequirePermission("merchant:batch")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "批量操作商家" })
  batchMerchants(
    @Body() dto: { ids: string[]; action: string; value?: any },
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.adminService.batchMerchants(dto, operatorId, req.ip);
  }

  // ============ 商城：分类/商品 ============
  @Get("admin/categories")
  categories(@Query() q: any) {
    return this.adminService.categories(q);
  }

  @Post("admin/categories")
  @RequirePermission("product:edit")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "创建分类" })
  createCategory(@Body() dto: any) {
    return this.adminService.createCategory(dto);
  }

  @Put("admin/categories/:id")
  @RequirePermission("product:edit")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "更新分类" })
  updateCategory(@Param("id") id: string, @Body() dto: any) {
    return this.adminService.updateCategory(id, dto);
  }

  @Delete("admin/categories/:id")
  @RequirePermission("product:edit")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "删除分类" })
  deleteCategory(@Param("id") id: string) {
    return this.adminService.deleteCategory(id);
  }

  @Get("admin/products")
  products(@Query() q: any) {
    return this.adminService.products(q);
  }

  @Get("admin/products/:id")
  productDetail(@Param("id") id: string) {
    return this.adminService.productDetail(id);
  }

  @Post("admin/products/batch")
  @RequirePermission("product:batch")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "批量操作商品" })
  batchProducts(
    @Body() dto: { ids: string[]; action: string; value?: any },
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.adminService.batchProducts(dto, operatorId, req.ip);
  }

  @Post("admin/products")
  @RequirePermission("product:edit")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "创建商品" })
  createProduct(@Body() dto: any) {
    return this.adminService.createProduct(dto);
  }

  @Put("admin/products/:id")
  @RequirePermission("product:edit")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "更新商品" })
  updateProduct(@Param("id") id: string, @Body() dto: any) {
    return this.adminService.updateProduct(id, dto);
  }

  @Put("admin/products/:id/status")
  @RequirePermission("product:edit")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "更改商品上下架状态" })
  productStatus(@Param("id") id: string, @Body() dto: { status: number }) {
    return this.adminService.updateProductStatus(id, dto.status);
  }

  @Put("admin/products/:id/audit")
  @RequirePermission("product:edit")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "审核商品" })
  auditProduct(
    @Param("id") id: string,
    @Body() dto: { status: string; reason?: string },
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.adminService.auditProduct(id, dto, operatorId, req.ip);
  }

  @Get("admin/products/stock-alerts")
  @RequirePermission("product:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "库存预警列表" })
  stockAlerts(@Query() q: any) {
    return this.adminService.productStockAlerts(q);
  }

  // ============ 评价管理 ============
  @Get("admin/reviews")
  @RequirePermission("review:manage")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "评价列表" })
  reviews(@Query() q: any) {
    return this.adminService.reviews(q);
  }

  @Delete("admin/reviews/:id")
  @RequirePermission("review:manage")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "删除评价" })
  deleteReview(
    @Param("id") id: string,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.adminService.deleteReview(id, operatorId, req.ip);
  }

  @Put("admin/reviews/:id/reply")
  @RequirePermission("review:manage")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "回复评价" })
  replyReview(
    @Param("id") id: string,
    @Body() dto: { reply: string },
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.adminService.replyReview(id, dto.reply, operatorId, req.ip);
  }

  // ============ 促销管理 ============
  @Get("admin/promotions")
  @RequirePermission("promotion:manage")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "促销列表" })
  promotions(@Query() q: any) {
    return this.adminService.promotions(q);
  }

  @Post("admin/promotions")
  @RequirePermission("promotion:manage")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "创建促销" })
  createPromotion(
    @Body() dto: any,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.adminService.createPromotion(dto, operatorId, req.ip);
  }

  @Put("admin/promotions/:id")
  @RequirePermission("promotion:manage")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "更新促销" })
  updatePromotion(@Param("id") id: string, @Body() dto: any) {
    return this.adminService.updatePromotion(id, dto);
  }

  @Get("admin/promotions/:id")
  @RequirePermission("promotion:manage")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "促销详情" })
  promotionDetail(@Param("id") id: string) {
    return this.adminService.promotionDetail(id);
  }

  // ============ 运费模板 ============
  @Get("admin/freight-templates")
  @RequirePermission("freight:manage")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "运费模板列表" })
  freightTemplates(@Query() q: any) {
    return this.adminService.freightTemplates(q);
  }

  @Post("admin/freight-templates")
  @RequirePermission("freight:manage")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "创建运费模板" })
  createFreightTemplate(@Body() dto: any) {
    return this.adminService.createFreightTemplate(dto);
  }

  @Put("admin/freight-templates/:id")
  @RequirePermission("freight:manage")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "更新运费模板" })
  updateFreightTemplate(@Param("id") id: string, @Body() dto: any) {
    return this.adminService.updateFreightTemplate(id, dto);
  }

  @Delete("admin/freight-templates/:id")
  @RequirePermission("freight:manage")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "删除运费模板" })
  deleteFreightTemplate(@Param("id") id: string) {
    return this.adminService.deleteFreightTemplate(id);
  }

  // ============ 订单/退款 ============
  @Get("admin/orders")
  @RequirePermission("order:view")
  @UseGuards(AdminPermissionGuard)
  orders(@Query() q: any) {
    return this.adminService.orders(q);
  }

  @Get("admin/orders/:id")
  @RequirePermission("order:view")
  @UseGuards(AdminPermissionGuard)
  orderDetail(@Param("id") id: string) {
    return this.adminService.orderDetail(id);
  }

  @Put("admin/orders/:id/cancel")
  @RequirePermission("order:refund")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "取消订单" })
  cancelOrder(
    @Param("id") id: string,
    @Body() dto: { reason?: string },
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.adminService.cancelOrder(id, dto, operatorId, req.ip);
  }

  @Put("admin/orders/:id/status")
  @RequirePermission("order:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "更改订单状态" })
  orderStatus(@Param("id") id: string, @Body() dto: { status: string }) {
    return this.adminService.updateOrderStatus(id, dto.status);
  }

  @Get("admin/refunds")
  @RequirePermission("order:view")
  @UseGuards(AdminPermissionGuard)
  refunds(@Query() q: any) {
    return this.adminService.refunds(q);
  }

  @Put("admin/refunds/:id/audit")
  @RequirePermission("order:refund")
  @UseGuards(AdminPermissionGuard)
  auditRefund(
    @Param("id") id: string,
    @Body() dto: { status: string; remark?: string },
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.adminService.auditRefund(id, dto, operatorId, req.ip);
  }

  @Put("admin/refunds/:id/complete")
  @RequirePermission("order:refund")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "完成退款打款" })
  completeRefund(
    @Param("id") id: string,
    @Body() dto: { transferNo?: string },
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.adminService.completeRefund(id, dto, operatorId, req.ip);
  }

  @Get("admin/refunds/finance")
  @RequirePermission("finance:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "财务退款汇总" })
  refundsFinance(@Query() q: any) {
    return this.adminService.refundsFinance(q);
  }

  // ============ 财务 ============
  @Get("admin/withdraws")
  @RequirePermission("finance:view")
  @UseGuards(AdminPermissionGuard)
  withdraws(@Query() q: any) {
    return this.adminService.withdraws(q);
  }

  @Get("admin/withdraws/:id")
  @RequirePermission("finance:view")
  @UseGuards(AdminPermissionGuard)
  withdrawDetail(@Param("id") id: string) {
    return this.adminService.withdrawDetail(id);
  }

  @Put("admin/withdraws/:id/audit")
  @RequirePermission("withdraw:audit")
  @UseGuards(AdminPermissionGuard)
  auditWithdraw(
    @Param("id") id: string,
    @Body() dto: { status: string; remark?: string },
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.adminService.auditWithdraw(id, dto, operatorId, req.ip);
  }

  @Put("admin/withdraws/:id/complete")
  @RequirePermission("withdraw:audit")
  @UseGuards(AdminPermissionGuard)
  completeWithdraw(
    @Param("id") id: string,
    @Body() dto: { transferNo?: string },
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.adminService.completeWithdraw(id, dto, operatorId, req.ip);
  }

  @Get("admin/payments")
  @RequirePermission("finance:view")
  @UseGuards(AdminPermissionGuard)
  payments(@Query() q: any) {
    return this.adminService.payments(q);
  }

  @Get("admin/transactions")
  @RequirePermission("finance:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "交易流水列表（充值/余额）" })
  transactions(@Query() q: any) {
    return this.adminService.transactions(q);
  }

  // ============ 商家结算 ============
  @Get("admin/settlements")
  @RequirePermission("finance:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "商家结算单列表" })
  merchantSettlements(@Query() q: any) {
    return this.adminService.merchantSettlements(q);
  }

  @Post("admin/settlements/generate")
  @RequirePermission("finance:reconciliation")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "生成商家结算单" })
  generateMerchantSettlement(
    @Body() dto: any,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.adminService.generateMerchantSettlement(dto, operatorId, req.ip);
  }

  // ============ 对账 ============
  @Get("admin/reconciliations")
  @RequirePermission("finance:reconciliation")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "对账记录列表" })
  reconciliations(@Query() q: any) {
    return this.adminService.reconciliations(q);
  }

  @Post("admin/reconciliations")
  @RequirePermission("finance:reconciliation")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "创建对账记录" })
  createReconciliation(
    @Body() dto: any,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.adminService.createReconciliation(dto, operatorId, req.ip);
  }

  // ============ 运营工具 ============
  @Get("admin/notifications")
  notifications(@Query() q: any) {
    return this.adminService.notifications(q);
  }

  @Post("admin/notifications")
  @RequirePermission("activity:edit")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "创建通知" })
  createNotification(@Body() dto: any) {
    return this.adminService.createNotification(dto);
  }

  @Put("admin/notifications/:id")
  @RequirePermission("activity:edit")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "更新通知" })
  updateNotification(@Param("id") id: string, @Body() dto: any) {
    return this.adminService.updateNotification(id, dto);
  }

  @Put("admin/notifications/:id/send")
  @RequirePermission("activity:edit")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "发送通知" })
  sendNotification(@Param("id") id: string) {
    return this.adminService.sendNotification(id);
  }

  @Delete("admin/notifications/:id")
  @RequirePermission("activity:edit")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "删除通知" })
  deleteNotification(@Param("id") id: string) {
    return this.adminService.deleteNotification(id);
  }

  // ============ 运营工具：签到/徽章/团购/分享 ============
  @Get("admin/sign-configs")
  @RequirePermission("activity:edit")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "签到配置列表" })
  signConfigs(@Query() q: any) {
    return this.adminService.signConfigs(q);
  }

  @Post("admin/sign-configs")
  @RequirePermission("activity:edit")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "创建签到配置" })
  createSignConfig(@Body() dto: any) {
    return this.adminService.createSignConfig(dto);
  }

  @Put("admin/sign-configs/:id")
  @RequirePermission("activity:edit")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "更新签到配置" })
  updateSignConfig(@Param("id") id: string, @Body() dto: any) {
    return this.adminService.updateSignConfig(id, dto);
  }

  @Delete("admin/sign-configs/:id")
  @RequirePermission("activity:edit")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "删除签到配置" })
  deleteSignConfig(@Param("id") id: string) {
    return this.adminService.deleteSignConfig(id);
  }

  @Get("admin/badges")
  @RequirePermission("activity:edit")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "徽章列表" })
  badges(@Query() q: any) {
    return this.adminService.badges(q);
  }

  @Post("admin/badges")
  @RequirePermission("activity:edit")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "创建徽章" })
  createBadge(@Body() dto: any) {
    return this.adminService.createBadge(dto);
  }

  @Put("admin/badges/:id")
  @RequirePermission("activity:edit")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "更新徽章" })
  updateBadge(@Param("id") id: string, @Body() dto: any) {
    return this.adminService.updateBadge(id, dto);
  }

  @Delete("admin/badges/:id")
  @RequirePermission("activity:edit")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "删除徽章" })
  deleteBadge(@Param("id") id: string) {
    return this.adminService.deleteBadge(id);
  }

  @Get("admin/group-buys")
  @RequirePermission("promotion:manage")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "团购列表" })
  groupBuys(@Query() q: any) {
    return this.adminService.groupBuys(q);
  }

  @Post("admin/group-buys")
  @RequirePermission("promotion:manage")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "创建团购" })
  createGroupBuy(@Body() dto: any) {
    return this.adminService.createGroupBuy(dto);
  }

  @Put("admin/group-buys/:id")
  @RequirePermission("promotion:manage")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "更新团购" })
  updateGroupBuy(@Param("id") id: string, @Body() dto: any) {
    return this.adminService.updateGroupBuy(id, dto);
  }

  @Get("admin/share-invites")
  @RequirePermission("promotion:manage")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "分享邀请配置列表" })
  shareInvites(@Query() q: any) {
    return this.adminService.shareInvites(q);
  }

  @Post("admin/share-invites")
  @RequirePermission("promotion:manage")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "创建分享邀请配置" })
  createShareInvite(@Body() dto: any) {
    return this.adminService.createShareInvite(dto);
  }

  @Put("admin/share-invites/:id")
  @RequirePermission("promotion:manage")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "更新分享邀请配置" })
  updateShareInvite(@Param("id") id: string, @Body() dto: any) {
    return this.adminService.updateShareInvite(id, dto);
  }

  // ============ 消息 ============
  @Get("admin/conversations")
  @RequirePermission("content:manage")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "会话列表" })
  conversations(@Query() q: any) {
    return this.adminService.conversationList(q);
  }

  @Get("admin/conversations/:id")
  conversation(@Param("id") id: string) {
    return this.adminService.conversationDetail(id);
  }

  @Put("admin/conversations/:id/block")
  @RequirePermission("content:manage")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "屏蔽会话" })
  blockConversation(@Param("id") id: string) {
    return this.adminService.blockConversation(id);
  }

  @Put("admin/conversations/:id/unblock")
  @RequirePermission("content:manage")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "解除屏蔽会话" })
  unblockConversation(@Param("id") id: string) {
    return this.adminService.unblockConversation(id);
  }

  @Get("admin/messages/history")
  @RequirePermission("content:manage")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "消息历史" })
  messageHistory(@Query() q: any) {
    return this.adminService.messageHistory(q);
  }

  @Post("admin/messages/recall")
  @RequirePermission("content:manage")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "撤回消息" })
  recallMessage(@Body() dto: { conversationId: string; messageId: string }) {
    return this.adminService.recallMessage(dto);
  }

  @Get("admin/messages/violations")
  @RequirePermission("content:manage")
  @UseGuards(AdminPermissionGuard)
  violations(@Query() query: any) {
    return this.adminService.violations(query);
  }

  @Put("admin/messages/violations/:id")
  @RequirePermission("content:manage")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "处理违规消息" })
  handleViolation(
    @Param("id") id: string,
    @Body() dto: { status: string; result?: string },
  ) {
    return this.adminService.handleViolation(id, dto);
  }

  @Get("admin/messages/unread-stats")
  unreadStats() {
    return this.adminService.unreadStats();
  }

  // ============ 系统：管理员管理 ============
  @Get("admin/admins")
  @RequirePermission("admin:view")
  @UseGuards(AdminPermissionGuard)
  admins(@Query() q: any) {
    return this.adminService.admins(q);
  }

  @Post("admin/admins")
  @RequirePermission("admin:create")
  @UseGuards(AdminPermissionGuard)
  createAdmin(
    @Body() dto: any,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.adminService.createAdmin(dto, operatorId, req.ip);
  }

  @Put("admin/admins/:id")
  @RequirePermission("admin:edit")
  @UseGuards(AdminPermissionGuard)
  updateAdmin(
    @Param("id") id: string,
    @Body() dto: any,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.adminService.updateAdmin(id, dto, operatorId, req.ip);
  }

  @Delete("admin/admins/:id")
  @RequirePermission("admin:delete")
  @UseGuards(AdminPermissionGuard)
  deleteAdmin(
    @Param("id") id: string,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.adminService.deleteAdmin(id, operatorId, req.ip);
  }

  @Put("admin/admins/:id/reset-password")
  @RequirePermission("admin:edit")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "重置管理员密码" })
  resetAdminPassword(
    @Param("id") id: string,
    @Body() dto: { password: string },
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.adminService.resetAdminPassword(id, dto, operatorId, req.ip);
  }

  @Put("admin/admins/:id/status")
  @RequirePermission("admin:edit")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "更改管理员状态" })
  adminStatus(@Param("id") id: string, @Body() dto: { status: string }) {
    return this.adminService.adminStatus(id, dto.status);
  }

  @Post("admin/admins/batch")
  @RequirePermission("admin:create")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "批量操作管理员" })
  batchAdmins(
    @Body() dto: { ids: string[]; action: string; value?: any },
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.adminService.batchAdmins(dto, operatorId, req.ip);
  }

  @Get("admin/roles")
  @RequirePermission("admin:view")
  @UseGuards(AdminPermissionGuard)
  roles() {
    return this.adminService.adminRoles();
  }

  @Get("admin/permissions")
  @RequirePermission("admin:view")
  @UseGuards(AdminPermissionGuard)
  adminPermissions() {
    return this.adminService.adminPermissions();
  }

  @Post("admin/roles")
  @RequirePermission("admin:edit")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "创建角色" })
  createRole(@Body() dto: any) {
    return this.adminService.createRole(dto);
  }

  @Put("admin/roles/:id")
  @RequirePermission("admin:edit")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "更新角色" })
  updateRole(@Param("id") id: string, @Body() dto: any) {
    return this.adminService.updateRole(id, dto);
  }

  @Delete("admin/roles/:id")
  @RequirePermission("admin:delete")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "删除角色" })
  deleteRole(@Param("id") id: string) {
    return this.adminService.deleteRole(id);
  }

  @Get("admin/menus/tree")
  menuTree() {
    return this.adminService.menuTree();
  }

  @Post("admin/menus")
  @RequirePermission("admin:edit")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "创建菜单" })
  createMenu(@Body() dto: any) {
    return this.adminService.createMenu(dto);
  }

  @Put("admin/menus/:id")
  @RequirePermission("admin:edit")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "更新菜单" })
  updateMenu(@Param("id") id: string, @Body() dto: any) {
    return this.adminService.updateMenu(id, dto);
  }

  @Delete("admin/menus/:id")
  @RequirePermission("admin:delete")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "删除菜单" })
  deleteMenu(@Param("id") id: string) {
    return this.adminService.deleteMenu(id);
  }

  @Get("admin/audit-logs")
  @RequirePermission("admin:view")
  @UseGuards(AdminPermissionGuard)
  auditLogs(@Query() q: any) {
    return this.adminService.legacyAuditLogs(q);
  }

  @Get("admin/operation-logs")
  @RequirePermission("admin:view")
  @UseGuards(AdminPermissionGuard)
  operationLogs(@Query() q: any) {
    return this.adminService.auditLogs(q);
  }

  @Get("admin/config/storage")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  storageConfig() {
    return this.adminService.getConfig("storage");
  }

  @Put("admin/config/storage")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  updateStorageConfig(
    @Body() dto: any,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.adminService.setConfig("storage", dto, operatorId, req.ip);
  }

  @Post("admin/config/storage/test")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "测试腾讯云 COS 存储桶连接" })
  testStorageConfig(@Body() dto: any) {
    return this.adminService.testStorageConfig(dto);
  }

  @Get("admin/config/wechat-pay")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  wechatPayConfig() {
    return this.adminService.getConfig("wechat_pay");
  }

  @Put("admin/config/wechat-pay")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  updateWechatPayConfig(
    @Body() dto: any,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.adminService.setConfig("wechat_pay", dto, operatorId, req.ip);
  }

  // ============ 城市代理 ============
  @Get("admin/city-agent/applications")
  @RequirePermission("city:view")
  @UseGuards(AdminPermissionGuard)
  cityAgentApplications(@Query() q: any) {
    return this.adminService.cityAgentApplications(q);
  }

  @Put("admin/city-agent/applications/:id/audit")
  @RequirePermission("city:audit")
  @UseGuards(AdminPermissionGuard)
  auditCityAgentApp(
    @Param("id") id: string,
    @Body() dto: { status: string; reason?: string },
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.adminService.auditCityAgentApplication(
      id,
      dto,
      operatorId,
      req.ip,
    );
  }

  @Get("admin/city-agent/agents")
  @RequirePermission("city:view")
  @UseGuards(AdminPermissionGuard)
  cityAgents(@Query() q: any) {
    return this.adminService.cityAgents(q);
  }

  @Get("admin/city-agent/agents/:id")
  @RequirePermission("city:view")
  @UseGuards(AdminPermissionGuard)
  cityAgentDetail(@Param("id") id: string) {
    return this.adminService.cityAgentDetail(id);
  }

  @Get("admin/city-agent/settlements")
  @RequirePermission("city:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "代理结算单列表" })
  getCityAgentSettlements(@Query() q: any) {
    return this.adminService.getCityAgentSettlements(q);
  }

  @Post("admin/city-agent/settlements")
  @RequirePermission("city:settlement")
  @UseGuards(AdminPermissionGuard)
  createCityAgentSettlement(
    @Body() dto: any,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.adminService.createCityAgentSettlement(dto, operatorId, req.ip);
  }

  @Get("admin/city-agent/ledger")
  @RequirePermission("city:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "代理结算流水" })
  cityAgentLedger(@Query() q: any) {
    return this.adminService.cityAgentLedger(q);
  }

  @Get("admin/city-agent/operations")
  @RequirePermission("city:view")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "代理操作日志" })
  cityAgentOperations(@Query() q: any) {
    return this.adminService.cityAgentOperations(q);
  }

  // ============ 区域扩展 ============
  @Post("admin/regions/batch")
  @RequirePermission("region:edit")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "区域批量操作" })
  batchRegions(
    @Body() dto: { ids: string[]; action: string; value?: any },
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.adminService.batchRegions(dto, operatorId, req.ip);
  }

  @Get("admin/regions/content-items")
  regionContentItems(@Query("regionId") regionId: string) {
    return this.adminService.regionContentItems(regionId);
  }

  @Post("admin/regions/content-items")
  @RequirePermission("region:edit")
  @UseGuards(AdminPermissionGuard)
  saveRegionContentItem(
    @Body() dto: any,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.adminService.saveRegionContentItem(dto, operatorId, req.ip);
  }

  @Put("admin/regions/content-items/:id")
  @RequirePermission("region:edit")
  @UseGuards(AdminPermissionGuard)
  updateRegionContentItem(
    @Param("id") id: string,
    @Body() dto: any,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.adminService.updateRegionContentItem(
      id,
      dto,
      operatorId,
      req.ip,
    );
  }

  @Delete("admin/regions/content-items/:id")
  @RequirePermission("region:edit")
  @UseGuards(AdminPermissionGuard)
  deleteRegionContentItem(
    @Param("id") id: string,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.adminService.deleteRegionContentItem(id, operatorId, req.ip);
  }

  @Get("admin/regions/banners")
  regionBanners(@Query("regionId") regionId: string) {
    return this.adminService.regionBanners(regionId);
  }

  @Post("admin/regions/banners")
  @RequirePermission("region:edit")
  @UseGuards(AdminPermissionGuard)
  saveRegionBanner(
    @Body() dto: any,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.adminService.saveRegionBanner(dto, operatorId, req.ip);
  }

  @Put("admin/regions/banners/:id")
  @RequirePermission("region:edit")
  @UseGuards(AdminPermissionGuard)
  updateRegionBanner(
    @Param("id") id: string,
    @Body() dto: any,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.adminService.updateRegionBanner(id, dto, operatorId, req.ip);
  }

  @Delete("admin/regions/banners/:id")
  @RequirePermission("region:edit")
  @UseGuards(AdminPermissionGuard)
  deleteRegionBanner(
    @Param("id") id: string,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.adminService.deleteRegionBanner(id, operatorId, req.ip);
  }

  @Get("admin/regions/announcements")
  regionAnnouncements(@Query("regionId") regionId: string) {
    return this.adminService.regionAnnouncements(regionId);
  }

  @Post("admin/regions/announcements")
  @RequirePermission("region:edit")
  @UseGuards(AdminPermissionGuard)
  saveRegionAnnouncement(
    @Body() dto: any,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.adminService.saveRegionAnnouncement(dto, operatorId, req.ip);
  }

  @Put("admin/regions/announcements/:id")
  @RequirePermission("region:edit")
  @UseGuards(AdminPermissionGuard)
  updateRegionAnnouncement(
    @Param("id") id: string,
    @Body() dto: any,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.adminService.updateRegionAnnouncement(
      id,
      dto,
      operatorId,
      req.ip,
    );
  }

  @Delete("admin/regions/announcements/:id")
  @RequirePermission("region:edit")
  @UseGuards(AdminPermissionGuard)
  deleteRegionAnnouncement(
    @Param("id") id: string,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.adminService.deleteRegionAnnouncement(id, operatorId, req.ip);
  }

  @Get("admin/regions/nav")
  regionNav(@Query("regionId") regionId: string) {
    return this.adminService.regionNav(regionId);
  }

  @Put("admin/regions/nav")
  @RequirePermission("region:edit")
  @UseGuards(AdminPermissionGuard)
  saveRegionNav(
    @Body() dto: any,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.adminService.saveRegionNav(dto, operatorId, req.ip);
  }

  @Get("admin/regions/tabbar")
  regionTabBar(@Query("regionId") regionId: string) {
    return this.adminService.regionTabBar(regionId);
  }

  @Put("admin/regions/tabbar")
  @RequirePermission("region:edit")
  @UseGuards(AdminPermissionGuard)
  saveRegionTabBar(
    @Body() dto: any,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.adminService.saveRegionTabBar(dto, operatorId, req.ip);
  }

  // ============ 区域自定义页面 ============
  @Get("admin/regions/custom-pages")
  @RequirePermission("region:view")
  @UseGuards(AdminPermissionGuard)
  regionCustomPages(@Query("regionId") regionId: string) {
    return this.adminService.regionCustomPages(regionId);
  }

  @Post("admin/regions/custom-pages")
  @RequirePermission("region:edit")
  @UseGuards(AdminPermissionGuard)
  saveRegionCustomPage(
    @Body() dto: any,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.adminService.saveRegionCustomPage(dto, operatorId, req.ip);
  }

  @Put("admin/regions/custom-pages/:id")
  @RequirePermission("region:edit")
  @UseGuards(AdminPermissionGuard)
  updateRegionCustomPage(
    @Param("id") id: string,
    @Body() dto: any,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.adminService.updateRegionCustomPage(id, dto, operatorId, req.ip);
  }

  @Delete("admin/regions/custom-pages/:id")
  @RequirePermission("region:edit")
  @UseGuards(AdminPermissionGuard)
  deleteRegionCustomPage(
    @Param("id") id: string,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.adminService.deleteRegionCustomPage(id, operatorId, req.ip);
  }

  // ============ 区域富文本内容 ============
  @Get("admin/regions/rich-texts")
  @RequirePermission("region:view")
  @UseGuards(AdminPermissionGuard)
  regionRichTexts(@Query("regionId") regionId: string) {
    return this.adminService.regionRichTexts(regionId);
  }

  @Post("admin/regions/rich-texts")
  @RequirePermission("region:edit")
  @UseGuards(AdminPermissionGuard)
  saveRegionRichText(
    @Body() dto: any,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.adminService.saveRegionRichText(dto, operatorId, req.ip);
  }

  @Put("admin/regions/rich-texts/:id")
  @RequirePermission("region:edit")
  @UseGuards(AdminPermissionGuard)
  updateRegionRichText(
    @Param("id") id: string,
    @Body() dto: any,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.adminService.updateRegionRichText(id, dto, operatorId, req.ip);
  }

  @Delete("admin/regions/rich-texts/:id")
  @RequirePermission("region:edit")
  @UseGuards(AdminPermissionGuard)
  deleteRegionRichText(
    @Param("id") id: string,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.adminService.deleteRegionRichText(id, operatorId, req.ip);
  }

  @Get("admin/regions/:id")
  @RequirePermission("region:view")
  @UseGuards(AdminPermissionGuard)
  regionDetail(@Param("id") id: string) {
    return this.adminService.regionDetail(id);
  }

  // ============ 用户扩展 ============
  @Put("admin/users/:id")
  @RequirePermission("user:edit")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "编辑用户资料" })
  updateUser(
    @Param("id") id: string,
    @Body() dto: any,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.adminService.updateUser(id, dto, operatorId, req.ip);
  }

  @Get("admin/user-tags")
  @RequirePermission("user:view")
  @UseGuards(AdminPermissionGuard)
  userTags() {
    return this.adminService.userTags();
  }

  @Post("admin/user-tags")
  @RequirePermission("user:edit")
  @UseGuards(AdminPermissionGuard)
  createUserTag(
    @Body() dto: any,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.adminService.createUserTag(dto, operatorId, req.ip);
  }

  @Put("admin/user-tags/:id")
  @RequirePermission("user:edit")
  @UseGuards(AdminPermissionGuard)
  updateUserTag(
    @Param("id") id: string,
    @Body() dto: any,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.adminService.updateUserTag(id, dto, operatorId, req.ip);
  }

  @Delete("admin/user-tags/:id")
  @RequirePermission("user:edit")
  @UseGuards(AdminPermissionGuard)
  deleteUserTag(
    @Param("id") id: string,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.adminService.deleteUserTag(id, operatorId, req.ip);
  }

  @Post("admin/users/:id/tags")
  @RequirePermission("user:edit")
  @UseGuards(AdminPermissionGuard)
  setUserTags(
    @Param("id") id: string,
    @Body() dto: { tagIds: string[] },
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.adminService.setUserTags(id, dto.tagIds, operatorId, req.ip);
  }

  // ============ 商品扩展 ============
  @Put("admin/skus/:id")
  @RequirePermission("product:edit")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "更新SKU" })
  updateSku(
    @Param("id") id: string,
    @Body() dto: any,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.adminService.updateSku(id, dto, operatorId, req.ip);
  }

  // ============ 促销扩展 ============
  @Put("admin/promotions/:id/status")
  @RequirePermission("promotion:manage")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "切换促销状态" })
  togglePromotionStatus(
    @Param("id") id: string,
    @Body() dto: { status: number },
  ) {
    return this.adminService.togglePromotionStatus(id, dto.status);
  }

  // ============ 团购扩展 ============
  @Put("admin/group-buys/:id/status")
  @RequirePermission("promotion:manage")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "切换团购状态" })
  toggleGroupBuyStatus(
    @Param("id") id: string,
    @Body() dto: { status: number },
  ) {
    return this.adminService.toggleGroupBuyStatus(id, dto.status);
  }

  // ============ 退款扩展 ============
  @Put("admin/refunds/:id/approve")
  @RequirePermission("order:refund")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "批准退款" })
  approveRefund(
    @Param("id") id: string,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.adminService.auditRefund(
      id,
      { status: "approved" },
      operatorId,
      req.ip,
    );
  }

  @Put("admin/refunds/:id/reject")
  @RequirePermission("order:refund")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "拒绝退款" })
  rejectRefund(
    @Param("id") id: string,
    @Body() dto: { reason: string },
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.adminService.auditRefund(
      id,
      { status: "rejected", remark: dto.reason },
      operatorId,
      req.ip,
    );
  }

  // ============ 对账扩展 ============
  @Post("admin/reconciliations/generate")
  @RequirePermission("finance:reconciliation")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "生成对账单" })
  generateReconciliation(
    @Body() dto: { date: string; type: string },
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.adminService.generateReconciliation(dto, operatorId, req.ip);
  }

  @Get("admin/reconciliations/:id/export")
  @RequirePermission("finance:reconciliation")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "导出对账单" })
  exportReconciliation(@Param("id") id: string) {
    return this.adminService.exportReconciliation(id);
  }

  // ============ 笔记配置 ============
  @Get("admin/note-settings")
  @RequirePermission("post:audit")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "笔记配置列表" })
  getNoteSettings(@Query() query: any) {
    return this.adminService.getNoteSettings(query);
  }

  @Get("admin/note-settings/:regionId")
  @RequirePermission("post:audit")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "获取区域笔记配置" })
  getNoteSettingByRegion(@Param("regionId") regionId: string) {
    return this.adminService.getNoteSettingByRegion(regionId);
  }

  @Put("admin/note-settings/:regionId")
  @RequirePermission("post:audit")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "更新区域笔记配置" })
  updateNoteSetting(
    @Param("regionId") regionId: string,
    @Body() dto: any,
  ) {
    return this.adminService.updateNoteSetting(regionId, dto);
  }
}
