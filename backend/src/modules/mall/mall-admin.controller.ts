import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { Request } from "express";
import { MallAdminService } from "./mall-admin.service";
import { JwtGuard } from "../../guards/jwt.guard";
import { AdminGuard, AdminPermissionGuard } from "../../guards/admin.guard";
import { RequirePermission } from "../../decorators/require-permission.decorator";
import { CurrentUser } from "../../decorators/current-user.decorator";

@ApiTags("商城管理")
@Controller("mall")
@UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
@ApiBearerAuth()
export class MallAdminController {
  constructor(private readonly mallAdminService: MallAdminService) {}

  // ==================== 分类管理 ====================

  @Get("admin/categories")
  @RequirePermission("mall:view")
  @ApiOperation({ summary: "商城分类列表" })
  getCategories(@Query() query: any) {
    return this.mallAdminService.getCategories(query);
  }

  @Post("admin/categories/create")
  @RequirePermission("mall:edit")
  @ApiOperation({ summary: "创建分类" })
  createCategory(
    @Body() dto: any,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.mallAdminService.createCategory(dto, operatorId, req.ip);
  }

  @Put("admin/categories/sort")
  @RequirePermission("mall:edit")
  @ApiOperation({ summary: "分类排序" })
  sortCategories(
    @Body() dto: { ids: string[] },
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.mallAdminService.sortCategories(dto.ids, operatorId, req.ip);
  }

  @Put("admin/categories/:id")
  @Patch("admin/categories/:id")
  @RequirePermission("mall:edit")
  @ApiOperation({ summary: "更新分类" })
  updateCategory(
    @Param("id") id: string,
    @Body() dto: any,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.mallAdminService.updateCategory(id, dto, operatorId, req.ip);
  }

  @Patch("admin/categories/:id")
  @RequirePermission("mall:edit")
  @ApiOperation({ summary: "更新分类" })
  patchCategory(
    @Param("id") id: string,
    @Body() dto: any,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.updateCategory(id, dto, operatorId, req);
  }

  @Delete("admin/categories/:id")
  @RequirePermission("mall:edit")
  @ApiOperation({ summary: "删除分类" })
  deleteCategory(
    @Param("id") id: string,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.mallAdminService.deleteCategory(id, operatorId, req.ip);
  }

  // ==================== 商品管理 ====================

  @Get("products/admin/list")
  @RequirePermission("mall:view")
  @ApiOperation({ summary: "商城商品列表" })
  getProducts(@Query() query: any) {
    return this.mallAdminService.getProducts(query);
  }

  @Get("products/admin/low-stock")
  @RequirePermission("mall:view")
  @ApiOperation({ summary: "库存预警商品" })
  getLowStockProducts(@Query() query: any) {
    return this.mallAdminService.getLowStockProducts(query);
  }

  @Post("products/admin/create")
  @RequirePermission("mall:edit")
  @ApiOperation({ summary: "创建商品" })
  createProduct(
    @Body() dto: any,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.mallAdminService.createProduct(dto, operatorId, req.ip);
  }

  @Put("products/admin/:id")
  @Patch("products/admin/:id")
  @RequirePermission("mall:edit")
  @ApiOperation({ summary: "更新商品" })
  updateProduct(
    @Param("id") id: string,
    @Body() dto: any,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.mallAdminService.updateProduct(id, dto, operatorId, req.ip);
  }

  @Patch("products/admin/:id")
  @RequirePermission("mall:edit")
  @ApiOperation({ summary: "更新商品" })
  patchProduct(
    @Param("id") id: string,
    @Body() dto: any,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.updateProduct(id, dto, operatorId, req);
  }

  @Delete("products/admin/:id")
  @RequirePermission("mall:edit")
  @ApiOperation({ summary: "删除商品" })
  deleteProduct(
    @Param("id") id: string,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.mallAdminService.deleteProduct(id, operatorId, req.ip);
  }

  @Put("products/admin/:id/status")
  @Patch("products/admin/:id/status")
  @RequirePermission("mall:edit")
  @ApiOperation({ summary: "更新商品状态" })
  updateProductStatus(
    @Param("id") id: string,
    @Body() dto: { status: string },
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.mallAdminService.updateProductStatus(
      id,
      dto.status,
      operatorId,
      req.ip,
    );
  }

  @Patch("products/admin/:id/status")
  @RequirePermission("mall:edit")
  @ApiOperation({ summary: "更新商品状态" })
  patchProductStatus(
    @Param("id") id: string,
    @Body() dto: { status: string },
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.updateProductStatus(id, dto, operatorId, req);
  }

  // ==================== SKU 管理 ====================

  @Get("products/admin/:productId/skus")
  @RequirePermission("mall:view")
  @ApiOperation({ summary: "商品SKU列表" })
  getProductSkus(@Param("productId") productId: string) {
    return this.mallAdminService.getProductSkus(productId);
  }

  @Post("products/admin/:productId/skus")
  @RequirePermission("mall:edit")
  @ApiOperation({ summary: "创建SKU" })
  createSku(
    @Param("productId") productId: string,
    @Body() dto: any,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.mallAdminService.createSku(productId, dto, operatorId, req.ip);
  }

  @Put("products/admin/skus/:skuId")
  @Patch("products/admin/skus/:skuId")
  @Put("products/admin/sku/:skuId")
  @Patch("products/admin/sku/:skuId")
  @RequirePermission("mall:edit")
  @ApiOperation({ summary: "更新SKU" })
  updateSku(
    @Param("skuId") skuId: string,
    @Body() dto: any,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.mallAdminService.updateSku(skuId, dto, operatorId, req.ip);
  }

  @Patch("products/admin/skus/:skuId")
  @Patch("products/admin/sku/:skuId")
  @RequirePermission("mall:edit")
  @ApiOperation({ summary: "更新SKU" })
  patchSku(
    @Param("skuId") skuId: string,
    @Body() dto: any,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.updateSku(skuId, dto, operatorId, req);
  }

  @Patch("products/admin/sku/:skuId")
  @RequirePermission("mall:edit")
  @ApiOperation({ summary: "更新SKU" })
  patchSkuAlias(
    @Param("skuId") skuId: string,
    @Body() dto: any,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.updateSku(skuId, dto, operatorId, req);
  }

  @Delete("products/admin/skus/:skuId")
  @Delete("products/admin/sku/:skuId")
  @RequirePermission("mall:edit")
  @ApiOperation({ summary: "删除SKU" })
  deleteSku(
    @Param("skuId") skuId: string,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.mallAdminService.deleteSku(skuId, operatorId, req.ip);
  }

  @Delete("products/admin/sku/:skuId")
  @RequirePermission("mall:edit")
  @ApiOperation({ summary: "删除SKU" })
  deleteSkuAlias(
    @Param("skuId") skuId: string,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.deleteSku(skuId, operatorId, req);
  }

  // ==================== 订单管理 ====================

  @Get("orders/admin/list")
  @RequirePermission("mall:view")
  @ApiOperation({ summary: "商城订单列表" })
  getOrders(@Query() query: any) {
    return this.mallAdminService.getOrders(query);
  }

  @Get("orders/admin/export")
  @RequirePermission("mall:export")
  @ApiOperation({ summary: "导出订单" })
  exportOrders(@Query() query: any) {
    return this.mallAdminService.exportOrders(query);
  }

  @Get("orders/admin/:id")
  @RequirePermission("mall:view")
  @ApiOperation({ summary: "商城订单详情" })
  getOrderDetail(@Param("id") id: string) {
    return this.mallAdminService.getOrderDetail(id);
  }

  @Put("orders/admin/:id/status")
  @Patch("orders/admin/:id/status")
  @RequirePermission("mall:edit")
  @ApiOperation({ summary: "更新订单状态" })
  updateOrderStatus(
    @Param("id") id: string,
    @Body() dto: { status: string; reason?: string },
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.mallAdminService.updateOrderStatus(
      id,
      dto,
      operatorId,
      req.ip,
    );
  }

  @Put("orders/admin/:id/delivery")
  @Patch("orders/admin/:id/delivery")
  @RequirePermission("mall:edit")
  @ApiOperation({ summary: "订单发货" })
  deliverOrder(
    @Param("id") id: string,
    @Body() dto: { trackingNo?: string; trackingCompany?: string; express_no?: string; express_company?: string },
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.mallAdminService.deliverOrder(id, dto as any, operatorId, req.ip);
  }

  @Patch("orders/admin/:id/delivery")
  @RequirePermission("mall:edit")
  @ApiOperation({ summary: "订单发货" })
  patchDeliverOrder(
    @Param("id") id: string,
    @Body() dto: { trackingNo?: string; trackingCompany?: string; express_no?: string; express_company?: string },
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.deliverOrder(id, dto, operatorId, req);
  }

  // ==================== 退款管理 ====================

  @Get("refunds/admin/list")
  @RequirePermission("mall:view")
  @ApiOperation({ summary: "退款列表" })
  getRefunds(@Query() query: any) {
    return this.mallAdminService.getRefunds(query);
  }

  @Get("refunds/admin/:id")
  @RequirePermission("mall:view")
  @ApiOperation({ summary: "退款详情" })
  getRefundDetail(@Param("id") id: string) {
    return this.mallAdminService.getRefundDetail(id);
  }

  @Put("refunds/admin/:id/review")
  @Patch("refunds/admin/:id/review")
  @RequirePermission("mall:refund")
  @ApiOperation({ summary: "审核退款" })
  reviewRefund(
    @Param("id") id: string,
    @Body() dto: { approved?: boolean; status?: string; reason?: string; reject_reason?: string },
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.mallAdminService.reviewRefund(id, dto, operatorId, req.ip);
  }

  @Patch("refunds/admin/:id/review")
  @RequirePermission("mall:refund")
  @ApiOperation({ summary: "审核退款" })
  patchReviewRefund(
    @Param("id") id: string,
    @Body() dto: { approved?: boolean; status?: string; reason?: string; reject_reason?: string },
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.reviewRefund(id, dto, operatorId, req);
  }

  @Put("refunds/admin/:id/finish")
  @Patch("refunds/admin/:id/finish")
  @RequirePermission("mall:refund")
  @ApiOperation({ summary: "完成退款" })
  finishRefund(
    @Param("id") id: string,
    @Body() dto: { transferNo?: string },
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.mallAdminService.finishRefund(id, dto, operatorId, req.ip);
  }

  @Patch("refunds/admin/:id/finish")
  @RequirePermission("mall:refund")
  @ApiOperation({ summary: "完成退款" })
  patchFinishRefund(
    @Param("id") id: string,
    @Body() dto: { transferNo?: string },
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.finishRefund(id, dto, operatorId, req);
  }

  @Put("refunds/admin/:id/reject")
  @Patch("refunds/admin/:id/reject")
  @RequirePermission("mall:refund")
  @ApiOperation({ summary: "拒绝退款" })
  rejectRefund(
    @Param("id") id: string,
    @Body() dto: { reason: string },
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.mallAdminService.rejectRefund(id, dto, operatorId, req.ip);
  }

  @Patch("refunds/admin/:id/reject")
  @RequirePermission("mall:refund")
  @ApiOperation({ summary: "拒绝退款" })
  patchRejectRefund(
    @Param("id") id: string,
    @Body() dto: { reason: string },
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.rejectRefund(id, dto, operatorId, req);
  }

  // ==================== 评价管理 ====================

  @Get("reviews/admin/list")
  @RequirePermission("mall:view")
  @ApiOperation({ summary: "评价列表" })
  getReviews(@Query() query: any) {
    return this.mallAdminService.getReviews(query);
  }

  @Put("reviews/admin/:id/reply")
  @Patch("reviews/admin/:id/reply")
  @RequirePermission("mall:edit")
  @ApiOperation({ summary: "回复评价" })
  replyReview(
    @Param("id") id: string,
    @Body() dto: { reply: string },
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.mallAdminService.replyReview(id, dto, operatorId, req.ip);
  }

  @Patch("reviews/admin/:id/reply")
  @RequirePermission("mall:edit")
  @ApiOperation({ summary: "回复评价" })
  patchReplyReview(
    @Param("id") id: string,
    @Body() dto: { reply: string },
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.replyReview(id, dto, operatorId, req);
  }

  @Put("reviews/admin/:id/visible")
  @Patch("reviews/admin/:id/visible")
  @Patch("reviews/admin/:id/status")
  @RequirePermission("mall:edit")
  @ApiOperation({ summary: "设置评价可见性" })
  setReviewVisibility(
    @Param("id") id: string,
    @Body() dto: { visible?: boolean; status?: string },
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    const visible = dto.visible !== undefined
      ? dto.visible
      : dto.status !== undefined
        ? dto.status !== "hidden"
        : true;
    return this.mallAdminService.setReviewVisibility(
      id,
      visible,
      operatorId,
      req.ip,
    );
  }

  @Patch("reviews/admin/:id/visible")
  @Patch("reviews/admin/:id/status")
  @RequirePermission("mall:edit")
  @ApiOperation({ summary: "设置评价可见性" })
  patchReviewVisibility(
    @Param("id") id: string,
    @Body() dto: { visible?: boolean; status?: string },
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.setReviewVisibility(id, dto, operatorId, req);
  }

  @Patch("reviews/admin/:id/status")
  @RequirePermission("mall:edit")
  @ApiOperation({ summary: "设置评价状态" })
  patchReviewStatus(
    @Param("id") id: string,
    @Body() dto: { visible?: boolean; status?: string },
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.setReviewVisibility(id, dto, operatorId, req);
  }

  // ==================== 分销管理 ====================

  @Get("distributor/admin/list")
  @RequirePermission("mall:view")
  @ApiOperation({ summary: "分销员列表" })
  getDistributors(@Query() query: any) {
    return this.mallAdminService.getDistributors(query);
  }

  @Get("distributor/admin/commission-records")
  @RequirePermission("mall:view")
  @ApiOperation({ summary: "佣金记录" })
  getCommissionRecords(@Query() query: any) {
    return this.mallAdminService.getCommissionRecords(query);
  }

  @Get("distributor/admin/:id")
  @RequirePermission("mall:view")
  @ApiOperation({ summary: "分销员详情" })
  getDistributorDetail(@Param("id") id: string) {
    return this.mallAdminService.getDistributorDetail(id);
  }

  @Put("distributor/admin/:id/review")
  @Patch("distributor/admin/:id/review")
  @RequirePermission("mall:edit")
  @ApiOperation({ summary: "审核分销员" })
  reviewDistributor(
    @Param("id") id: string,
    @Body() dto: { approved?: boolean; status?: string; reason?: string; remark?: string },
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.mallAdminService.reviewDistributor(
      id,
      dto,
      operatorId,
      req.ip,
    );
  }

  @Patch("distributor/admin/:id/review")
  @RequirePermission("mall:edit")
  @ApiOperation({ summary: "审核分销员" })
  patchReviewDistributor(
    @Param("id") id: string,
    @Body() dto: { approved?: boolean; status?: string; reason?: string; remark?: string },
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.reviewDistributor(id, dto, operatorId, req);
  }

  @Put("distributor/admin/:id/status")
  @Patch("distributor/admin/:id/status")
  @RequirePermission("mall:edit")
  @ApiOperation({ summary: "更新分销员状态" })
  updateDistributorStatus(
    @Param("id") id: string,
    @Body() dto: { status: string },
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.mallAdminService.updateDistributorStatus(
      id,
      dto.status,
      operatorId,
      req.ip,
    );
  }

  @Patch("distributor/admin/:id/status")
  @RequirePermission("mall:edit")
  @ApiOperation({ summary: "更新分销员状态" })
  patchDistributorStatus(
    @Param("id") id: string,
    @Body() dto: { status: string },
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.updateDistributorStatus(id, dto, operatorId, req);
  }

  // ==================== 促销管理 ====================

  @Get("promotions/admin/list")
  @RequirePermission("mall:view")
  @ApiOperation({ summary: "促销活动列表" })
  getPromotions(@Query() query: any) {
    return this.mallAdminService.getPromotions(query);
  }

  @Get("promotions/admin/:id")
  @RequirePermission("mall:view")
  @ApiOperation({ summary: "促销活动详情" })
  getPromotionDetail(@Param("id") id: string) {
    return this.mallAdminService.getPromotionDetail(id);
  }

  @Post("promotions/admin/create")
  @RequirePermission("mall:edit")
  @ApiOperation({ summary: "创建促销活动" })
  createPromotion(
    @Body() dto: any,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.mallAdminService.createPromotion(dto, operatorId, req.ip);
  }

  @Put("promotions/admin/:id")
  @Patch("promotions/admin/:id")
  @RequirePermission("mall:edit")
  @ApiOperation({ summary: "更新促销活动" })
  updatePromotion(
    @Param("id") id: string,
    @Body() dto: any,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.mallAdminService.updatePromotion(id, dto, operatorId, req.ip);
  }

  @Patch("promotions/admin/:id")
  @RequirePermission("mall:edit")
  @ApiOperation({ summary: "更新促销活动" })
  patchPromotion(
    @Param("id") id: string,
    @Body() dto: any,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.updatePromotion(id, dto, operatorId, req);
  }

  @Delete("promotions/admin/:id")
  @RequirePermission("mall:edit")
  @ApiOperation({ summary: "删除促销活动" })
  deletePromotion(
    @Param("id") id: string,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.mallAdminService.deletePromotion(id, operatorId, req.ip);
  }

  // ==================== 商户审核 ====================

  @Put("merchants/admin/:id/review")
  @Patch("merchants/admin/:id/review")
  @RequirePermission("mall:edit")
  @ApiOperation({ summary: "审核商户" })
  reviewMerchant(
    @Param("id") id: string,
    @Body() dto: { status: string; rejectReason?: string },
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.mallAdminService.reviewMerchant(id, dto, operatorId, req.ip);
  }

  @Patch("merchants/admin/:id/review")
  @RequirePermission("mall:edit")
  @ApiOperation({ summary: "审核商户" })
  patchReviewMerchant(
    @Param("id") id: string,
    @Body() dto: { status: string; rejectReason?: string },
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.reviewMerchant(id, dto, operatorId, req);
  }

  @Post("merchants/admin/:id/circle/create")
  @RequirePermission("mall:edit")
  @ApiOperation({ summary: "创建商户圈子" })
  createMerchantCircle(
    @Param("id") id: string,
    @Body() dto: any,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.mallAdminService.createMerchantCircle(id, dto, operatorId, req.ip);
  }

  // ==================== 商城概览 ====================

  @Get("admin/overview")
  @RequirePermission("mall:view")
  @ApiOperation({ summary: "商城概览统计" })
  getOverview() {
    return this.mallAdminService.getOverview();
  }

  // ==================== 运费模板 ====================

  @Get("freight/admin/template/list")
  @RequirePermission("mall:view")
  @ApiOperation({ summary: "运费模板列表" })
  getFreightTemplates(@Query() query: any) {
    return this.mallAdminService.getFreightTemplates(query);
  }

  @Post("freight/admin/template/create")
  @RequirePermission("mall:edit")
  @ApiOperation({ summary: "创建运费模板" })
  createFreightTemplate(
    @Body() dto: any,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.mallAdminService.createFreightTemplate(
      dto,
      operatorId,
      req.ip,
    );
  }

  @Put("freight/admin/template/:id")
  @Patch("freight/admin/template/:id")
  @RequirePermission("mall:edit")
  @ApiOperation({ summary: "更新运费模板" })
  updateFreightTemplate(
    @Param("id") id: string,
    @Body() dto: any,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.mallAdminService.updateFreightTemplate(
      id,
      dto,
      operatorId,
      req.ip,
    );
  }

  @Patch("freight/admin/template/:id")
  @RequirePermission("mall:edit")
  @ApiOperation({ summary: "更新运费模板" })
  patchFreightTemplate(
    @Param("id") id: string,
    @Body() dto: any,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.updateFreightTemplate(id, dto, operatorId, req);
  }

  @Delete("freight/admin/template/:id")
  @RequirePermission("mall:edit")
  @ApiOperation({ summary: "删除运费模板" })
  deleteFreightTemplate(
    @Param("id") id: string,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.mallAdminService.deleteFreightTemplate(
      id,
      operatorId,
      req.ip,
    );
  }

  // ==================== 商户统计 ====================

  @Get("merchants/admin/list")
  @RequirePermission("mall:view")
  @ApiOperation({ summary: "商户列表" })
  getMerchants(@Query() query: any) {
    return this.mallAdminService.getMerchants(query);
  }

  @Get("merchants/admin/:id")
  @RequirePermission("mall:view")
  @ApiOperation({ summary: "商户详情" })
  getMerchantDetail(@Param("id") id: string) {
    return this.mallAdminService.getMerchantDetail(id);
  }

  @Put("merchants/admin/:id")
  @Patch("merchants/admin/:id")
  @RequirePermission("mall:edit")
  @ApiOperation({ summary: "更新商户" })
  updateMerchant(
    @Param("id") id: string,
    @Body() dto: any,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.mallAdminService.updateMerchant(id, dto, operatorId, req.ip);
  }

  @Patch("merchants/admin/:id")
  @RequirePermission("mall:edit")
  @ApiOperation({ summary: "更新商户" })
  patchMerchant(
    @Param("id") id: string,
    @Body() dto: any,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.updateMerchant(id, dto, operatorId, req);
  }

  @Get("merchants/admin/:id/stats")
  @RequirePermission("mall:view")
  @ApiOperation({ summary: "商户统计" })
  getMerchantStats(@Param("id") id: string) {
    return this.mallAdminService.getMerchantStats(id);
  }

  @Get("merchants/admin/:id/circles-and-locations")
  @RequirePermission("mall:view")
  @ApiOperation({ summary: "商户圈子和位置" })
  getMerchantCirclesAndLocations(@Param("id") id: string) {
    return this.mallAdminService.getMerchantCirclesAndLocations(id);
  }

  // ==================== 客服管理 ====================

  @Get("admin/service-staff")
  @RequirePermission("mall:view")
  @ApiOperation({ summary: "客服列表" })
  getServiceStaffList(@Query() query: any) {
    return this.mallAdminService.getServiceStaffList(query);
  }

  @Post("admin/service-staff")
  @RequirePermission("mall:edit")
  @ApiOperation({ summary: "创建客服" })
  createServiceStaff(
    @Body() dto: any,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.mallAdminService.createServiceStaff(dto, operatorId, req.ip);
  }

  @Put("admin/service-staff/:id")
  @Patch("admin/service-staff/:id")
  @RequirePermission("mall:edit")
  @ApiOperation({ summary: "更新客服" })
  updateServiceStaff(
    @Param("id") id: string,
    @Body() dto: any,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.mallAdminService.updateServiceStaff(id, dto, operatorId, req.ip);
  }

  @Patch("admin/service-staff/:id")
  @RequirePermission("mall:edit")
  @ApiOperation({ summary: "更新客服" })
  patchServiceStaff(
    @Param("id") id: string,
    @Body() dto: any,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.updateServiceStaff(id, dto, operatorId, req);
  }

  @Delete("admin/service-staff/:id")
  @RequirePermission("mall:edit")
  @ApiOperation({ summary: "删除客服" })
  deleteServiceStaff(
    @Param("id") id: string,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.mallAdminService.deleteServiceStaff(id, operatorId, req.ip);
  }

  @Put("admin/service-staff/:id/status")
  @RequirePermission("mall:edit")
  @ApiOperation({ summary: "更新客服状态" })
  updateServiceStaffStatus(
    @Param("id") id: string,
    @Body() dto: { status: string },
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.mallAdminService.updateServiceStaffStatus(id, dto.status, operatorId, req.ip);
  }

  @Patch("admin/service-staff/:id/status")
  @RequirePermission("mall:edit")
  @ApiOperation({ summary: "更新客服状态" })
  patchServiceStaffStatus(
    @Param("id") id: string,
    @Body() dto: { status: string },
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.updateServiceStaffStatus(id, dto, operatorId, req);
  }
}
