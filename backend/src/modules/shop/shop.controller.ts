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
  GoneException,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { ShopService } from "./shop.service";
import { JwtGuard } from "../../guards/jwt.guard";
import { CurrentUser } from "../../decorators/current-user.decorator";

@ApiTags("商家/外卖")
@Controller()
export class ShopController {
  constructor(private readonly shopService: ShopService) {}

  @Get("merchants/region/:regionId")
  getByRegion(@Param("regionId") regionId: string, @Query() query: any) {
    return this.shopService.getByRegion(regionId, query);
  }

  @Get("dorm-shops/region/:regionId")
  getDormShopsByRegion(
    @Param("regionId") regionId: string,
    @Query() query: any,
  ) {
    return this.shopService.getDormShopsByRegion(regionId, query);
  }

  @Get("merchants/view/:merchantId")
  getDetail(@Param("merchantId") merchantId: string) {
    return this.shopService.getDetail(merchantId);
  }

  @Get("dorm-shops/view/:merchantId")
  getDormShopDetail(@Param("merchantId") merchantId: string) {
    return this.shopService.getDormShopDetail(merchantId);
  }

  @Get("merchants/categories_and_products/:merchantId")
  getCategoriesAndProducts(@Param("merchantId") merchantId: string) {
    return this.shopService.getCategoriesAndProducts(merchantId);
  }

  @Get("dorm-shops/categories_and_products/:merchantId")
  getDormShopCategoriesAndProducts(@Param("merchantId") merchantId: string) {
    return this.shopService.getCategoriesAndProducts(merchantId);
  }

  @Get("merchants/manage/categories_and_products/:merchantId")
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getManageCategoriesAndProducts(
    @Param("merchantId") merchantId: string,
    @CurrentUser("sub") userId: string,
  ) {
    return this.shopService.getManageCategoriesAndProducts(merchantId, userId);
  }

  @Get("merchants/list")
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getList(@Query() query: any, @CurrentUser("sub") userId: string) {
    return this.shopService.getList(query, userId);
  }

  @Get("merchants/orders/:merchantId")
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getMerchantOrders(
    @Param("merchantId") merchantId: string,
    @Query() query: any,
    @CurrentUser("sub") userId: string,
  ) {
    return this.shopService.getMerchantOrders(merchantId, query, userId);
  }

  @Get("merchants/:merchantId/staff")
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getMerchantStaff(
    @Param("merchantId") merchantId: string,
    @CurrentUser("sub") userId: string,
  ) {
    return this.shopService.getMerchantStaff(merchantId, userId);
  }

  @Post("merchants/:merchantId/staff/invite")
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  inviteMerchantStaff(
    @Param("merchantId") merchantId: string,
    @CurrentUser("sub") userId: string,
    @Body() dto: any,
  ) {
    return this.shopService.inviteMerchantStaff(merchantId, userId, dto);
  }

  @Patch("merchants/:merchantId/staff/:staffId")
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  updateMerchantStaff(
    @Param("merchantId") merchantId: string,
    @Param("staffId") staffId: string,
    @CurrentUser("sub") userId: string,
    @Body() dto: any,
  ) {
    return this.shopService.updateMerchantStaff(
      merchantId,
      staffId,
      userId,
      dto,
    );
  }

  @Get("merchants/:merchantId/dispatch-policy")
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getMerchantDispatchPolicy(
    @Param("merchantId") merchantId: string,
    @CurrentUser("sub") userId: string,
  ) {
    return this.shopService.getMerchantDispatchPolicy(merchantId, userId);
  }

  @Patch("merchants/:merchantId/dispatch-policy")
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  updateMerchantDispatchPolicy(
    @Param("merchantId") merchantId: string,
    @CurrentUser("sub") userId: string,
    @Body() dto: any,
  ) {
    return this.shopService.updateMerchantDispatchPolicy(
      merchantId,
      userId,
      dto,
    );
  }

  @Get("partner-app/shop-staff/invitations")
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getShopStaffInvitations(@CurrentUser("sub") userId: string) {
    return this.shopService.getShopStaffInvitations(userId);
  }

  @Post("partner-app/shop-staff/invitations/:staffId/accept")
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  acceptShopStaffInvitation(
    @Param("staffId") staffId: string,
    @CurrentUser("sub") userId: string,
  ) {
    return this.shopService.acceptShopStaffInvitation(staffId, userId);
  }

  @Patch("partner-app/shop-staff/duty")
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  updateShopStaffDuty(@CurrentUser("sub") userId: string, @Body() dto: any) {
    return this.shopService.updateShopStaffDuty(userId, dto);
  }

  @Get("partner-app/shop-staff/assignments")
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getShopStaffAssignments(
    @CurrentUser("sub") userId: string,
    @Query() query: any,
  ) {
    return this.shopService.getShopStaffAssignments(userId, query);
  }

  @Post("partner-app/shop-staff/assignments/:assignmentId/accept")
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  acceptShopStaffAssignment(
    @Param("assignmentId") assignmentId: string,
    @CurrentUser("sub") userId: string,
  ) {
    return this.shopService.acceptShopStaffAssignment(assignmentId, userId);
  }

  @Post("partner-app/shop-staff/assignments/:assignmentId/pickup")
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  pickupShopStaffAssignment(
    @Param("assignmentId") assignmentId: string,
    @CurrentUser("sub") userId: string,
  ) {
    return this.shopService.pickupShopStaffAssignment(assignmentId, userId);
  }

  @Post("partner-app/shop-staff/assignments/:assignmentId/complete")
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  completeShopStaffAssignment(
    @Param("assignmentId") assignmentId: string,
    @CurrentUser("sub") userId: string,
    @Body() dto: any,
  ) {
    return this.shopService.completeShopStaffAssignment(
      assignmentId,
      userId,
      dto,
    );
  }

  @Post("merchants/apply")
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  applyMerchant(@CurrentUser("sub") userId: string, @Body() dto: any) {
    return this.shopService.applyMerchant(userId, dto);
  }

  @Get("merchants/my-application")
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getMyApplication(@CurrentUser("sub") userId: string, @Query() query: any) {
    return this.shopService.getMyApplication(userId, query);
  }

  @Put("merchants/update/:merchantId")
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  updateMerchant(
    @Param("merchantId") merchantId: string,
    @CurrentUser("sub") userId: string,
    @Body() dto: any,
  ) {
    return this.shopService.updateMerchant(merchantId, userId, dto);
  }

  @Post("merchants/sync/region/:regionId")
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  syncToRegion(
    @Param("regionId") regionId: string,
    @CurrentUser("sub") userId: string,
    @Body() dto: any,
  ) {
    return this.shopService.syncToRegion(regionId, userId, dto);
  }

  @Get("merchants/printer-config")
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getPrinters(
    @Query("merchant_id") merchantId: string,
    @CurrentUser("sub") userId: string,
  ) {
    return this.shopService.getPrinters(merchantId, userId);
  }

  @Post("merchants/printer-config")
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  addPrinter(@CurrentUser("sub") userId: string, @Body() dto: any) {
    return this.shopService.addPrinter(userId, dto);
  }

  @Put("merchants/printer-config/:printerId")
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  updatePrinter(
    @Param("printerId") printerId: string,
    @CurrentUser("sub") userId: string,
    @Body() dto: any,
  ) {
    return this.shopService.updatePrinter(printerId, userId, dto);
  }

  @Delete("merchants/printer-config/:printerId")
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  deletePrinter(
    @Param("printerId") printerId: string,
    @CurrentUser("sub") userId: string,
  ) {
    return this.shopService.deletePrinter(printerId, userId);
  }

  @Get("order/merchant/:merchantId/dashboard")
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getMerchantDashboard(
    @Param("merchantId") merchantId: string,
    @Query() query: any,
    @CurrentUser("sub") userId: string,
  ) {
    return this.shopService.getMerchantDashboard(merchantId, query, userId);
  }

  @Get("order/merchant/:merchantId/settlements")
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getMerchantSettlements(
    @Param("merchantId") merchantId: string,
    @Query() query: any,
    @CurrentUser("sub") userId: string,
  ) {
    return this.shopService.getMerchantSettlements(merchantId, query, userId);
  }

  @Get("categories")
  getCategories(@Query() query: any) {
    return this.shopService.getCategories(query);
  }

  @Post("categories")
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  createCategory(@CurrentUser("sub") userId: string, @Body() dto: any) {
    return this.shopService.createCategory(userId, dto);
  }

  @Put("categories/:categoryId")
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  updateCategory(
    @Param("categoryId") categoryId: string,
    @CurrentUser("sub") userId: string,
    @Body() dto: any,
  ) {
    return this.shopService.updateCategory(categoryId, userId, dto);
  }

  @Delete("categories/:categoryId")
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  deleteCategory(
    @Param("categoryId") categoryId: string,
    @CurrentUser("sub") userId: string,
  ) {
    return this.shopService.deleteCategory(categoryId, userId);
  }

  @Post("products")
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  createProduct(@CurrentUser("sub") userId: string, @Body() dto: any) {
    return this.shopService.createProduct(userId, dto);
  }

  @Post("products/with-options")
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  createProductWithOptions(
    @CurrentUser("sub") userId: string,
    @Body() dto: any,
  ) {
    return this.shopService.saveProductWithOptions(null, userId, dto);
  }

  @Put("delivery-products/:productId")
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  updateProduct(
    @Param("productId") productId: string,
    @CurrentUser("sub") userId: string,
    @Body() dto: any,
  ) {
    return this.shopService.updateProduct(productId, userId, dto);
  }

  @Put("delivery-products/:productId/with-options")
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  updateProductWithOptions(
    @Param("productId") productId: string,
    @CurrentUser("sub") userId: string,
    @Body() dto: any,
  ) {
    return this.shopService.saveProductWithOptions(productId, userId, dto);
  }

  @Delete("delivery-products/:productId")
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  deleteProduct(
    @Param("productId") productId: string,
    @CurrentUser("sub") userId: string,
  ) {
    return this.shopService.deleteProduct(productId, userId);
  }

  @Delete("specs/option/:optionId")
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  deleteSpecOption(
    @Param("optionId") optionId: string,
    @CurrentUser("sub") userId: string,
  ) {
    return this.shopService.deleteSpecOption(optionId, userId);
  }

  @Post("product-options/:productId/batch")
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  batchCreateOptions(
    @Param("productId") productId: string,
    @CurrentUser("sub") userId: string,
    @Body() dto: any,
  ) {
    return this.shopService.batchCreateOptions(productId, userId, dto);
  }

  @Put("product-options/:productId/batch")
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  batchUpdateOptions(
    @Param("productId") productId: string,
    @CurrentUser("sub") userId: string,
    @Body() dto: any,
  ) {
    return this.shopService.batchUpdateOptions(productId, userId, dto);
  }

  @Delete("product-options/:productId/batch")
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  batchDeleteOptions(
    @Param("productId") productId: string,
    @CurrentUser("sub") userId: string,
    @Body() dto: any,
  ) {
    return this.shopService.batchDeleteOptions(productId, userId, dto);
  }

  @Get("product-options/:productId/all")
  getAllOptions(@Param("productId") productId: string) {
    return this.shopService.getAllOptions(productId);
  }

  @Post("shopping-cart")
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  addToCart(@CurrentUser("sub") userId: string, @Body() dto: any) {
    return this.shopService.addToCart(userId, dto);
  }

  @Delete("shopping-cart/delete")
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  removeFromCart(@CurrentUser("sub") userId: string, @Body() dto: any) {
    return this.shopService.removeFromCart(userId, dto);
  }

  @Delete("shopping-cart/clear")
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  clearCart(@CurrentUser("sub") userId: string, @Body() dto: any = {}) {
    return this.shopService.clearCart(userId, dto);
  }

  @Get("shopping-cart/merchant/:merchantId")
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getCart(
    @Param("merchantId") merchantId: string,
    @CurrentUser("sub") userId: string,
  ) {
    return this.shopService.getCart(merchantId, userId);
  }

  @Post("order/:merchantId")
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  createOrder(
    @Param("merchantId") merchantId: string,
    @CurrentUser("sub") userId: string,
    @Body() dto: any,
  ) {
    return this.shopService.createOrder(merchantId, userId, dto);
  }

  @Post("delivery-distance/:merchantId")
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getDeliveryDistance(
    @Param("merchantId") merchantId: string,
    @CurrentUser("sub") userId: string,
    @Body() dto: any,
  ) {
    return this.shopService.getDeliveryDistance(merchantId, userId, dto);
  }

  @Get("order/:orderId")
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getOrderDetail(
    @Param("orderId") orderId: string,
    @CurrentUser("sub") userId: string,
  ) {
    return this.shopService.getOrderDetail(orderId, userId);
  }

  @Get("order")
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getOrders(@CurrentUser("sub") userId: string, @Query() query: any) {
    return this.shopService.getOrders(userId, query);
  }

  @Patch("order/:orderId/status")
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  updateOrderStatus(
    @Param("orderId") orderId: string,
    @CurrentUser("sub") userId: string,
    @Body() dto: any,
  ) {
    return this.shopService.updateOrderStatus(orderId, userId, dto);
  }

  @Post("order/:orderId/merchant/accept")
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  acceptMerchantOrder(
    @Param("orderId") orderId: string,
    @CurrentUser("sub") userId: string,
  ) {
    return this.shopService.acceptMerchantOrder(orderId, userId);
  }

  @Post("order/:orderId/merchant/ready")
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  readyMerchantOrder(
    @Param("orderId") orderId: string,
    @CurrentUser("sub") userId: string,
  ) {
    return this.shopService.readyMerchantOrder(orderId, userId);
  }

  @Post("order/:orderId/merchant/complete")
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  completeMerchantOrder(
    @Param("orderId") orderId: string,
    @CurrentUser("sub") userId: string,
    @Body() dto: any,
  ) {
    return this.shopService.completeMerchantOrder(orderId, userId, dto);
  }

  @Post("order/:orderId/shop-delivery/assign")
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  assignDormShopOrder(
    @Param("orderId") orderId: string,
    @CurrentUser("sub") userId: string,
    @Body() dto: any,
  ) {
    return this.shopService.assignDormShopOrder(orderId, userId, dto);
  }

  @Post("order/wx/notify")
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  sendOrderNotification(@CurrentUser("sub") userId: string, @Body() dto: any) {
    return this.shopService.sendOrderNotification(userId, dto);
  }

  @Post("wxpay/legacy-createOrder")
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  legacyCreatePayment() {
    throw new GoneException(
      "该支付接口已下线，请使用 /wxpay/createOrder (PaymentController)。小程序端请更新到最新版本。",
    );
  }

  @Post("wxpay/printOrder")
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  printOrder(@CurrentUser("sub") userId: string, @Body() dto: any) {
    return this.shopService.printOrder(userId, dto);
  }

  @Get("merchant/reviews/stats/:merchantId")
  getReviewStats(
    @Param("merchantId") merchantId: string,
    @Query("regionId") regionId: string,
  ) {
    return this.shopService.getReviewStats(merchantId, regionId);
  }

  @Get("merchant/reviews/merchant/:merchantId")
  getReviews(@Param("merchantId") merchantId: string, @Query() query: any) {
    return this.shopService.getReviews(merchantId, query);
  }

  @Post("merchant/reviews")
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  submitReview(@CurrentUser("sub") userId: string, @Body() dto: any) {
    return this.shopService.submitReview(userId, dto);
  }

  @Put("merchant/reviews/:id/reply")
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  replyToReview(
    @Param("id") id: string,
    @CurrentUser("sub") userId: string,
    @Body() dto: any,
  ) {
    return this.shopService.replyToReview(id, userId, dto);
  }

  @Get("merchant/reviews/tags/popular")
  getPopularTags(@Query("regionId") regionId: string) {
    return this.shopService.getPopularTags(regionId);
  }
}
