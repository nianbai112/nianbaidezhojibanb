import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, UseGuards, GoneException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ShopService } from './shop.service';
import { JwtGuard } from '../../guards/jwt.guard';
import { CurrentUser } from '../../decorators/current-user.decorator';

@ApiTags('商家/外卖')
@Controller()
export class ShopController {
  constructor(private readonly shopService: ShopService) {}

  @Get('merchants/region/:regionId')
  getByRegion(@Param('regionId') regionId: string, @Query() query: any) {
    return this.shopService.getByRegion(regionId, query);
  }

  @Get('merchants/view/:merchantId')
  getDetail(@Param('merchantId') merchantId: string) {
    return this.shopService.getDetail(merchantId);
  }

  @Get('merchants/categories_and_products/:merchantId')
  getCategoriesAndProducts(@Param('merchantId') merchantId: string) {
    return this.shopService.getCategoriesAndProducts(merchantId);
  }

  @Get('merchants/list')
  getList(@Query() query: any) {
    return this.shopService.getList(query);
  }

  @Get('merchants/orders/:merchantId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getMerchantOrders(@Param('merchantId') merchantId: string, @Query() query: any, @CurrentUser('sub') userId: string) {
    return this.shopService.getMerchantOrders(merchantId, query, userId);
  }

  @Post('merchants/apply')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  applyMerchant(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.shopService.applyMerchant(userId, dto);
  }

  @Get('merchants/my-application')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getMyApplication(@CurrentUser('sub') userId: string) {
    return this.shopService.getMyApplication(userId);
  }

  @Put('merchants/update/:merchantId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  updateMerchant(@Param('merchantId') merchantId: string, @CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.shopService.updateMerchant(merchantId, userId, dto);
  }

  @Post('merchants/sync/region/:regionId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  syncToRegion(@Param('regionId') regionId: string, @CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.shopService.syncToRegion(regionId, userId, dto);
  }

  @Get('merchants/printer-config')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getPrinters(@Query('merchant_id') merchantId: string) {
    return this.shopService.getPrinters(merchantId);
  }

  @Post('merchants/printer-config')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  addPrinter(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.shopService.addPrinter(userId, dto);
  }

  @Put('merchants/printer-config/:printerId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  updatePrinter(@Param('printerId') printerId: string, @CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.shopService.updatePrinter(printerId, userId, dto);
  }

  @Delete('merchants/printer-config/:printerId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  deletePrinter(@Param('printerId') printerId: string, @CurrentUser('sub') userId: string) {
    return this.shopService.deletePrinter(printerId, userId);
  }

  @Get('order/merchant/:merchantId/dashboard')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getMerchantDashboard(@Param('merchantId') merchantId: string, @Query() query: any) {
    return this.shopService.getMerchantDashboard(merchantId, query);
  }

  @Get('categories')
  getCategories() {
    return this.shopService.getCategories();
  }

  @Post('categories')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  createCategory(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.shopService.createCategory(userId, dto);
  }

  @Put('categories/:categoryId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  updateCategory(@Param('categoryId') categoryId: string, @CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.shopService.updateCategory(categoryId, userId, dto);
  }

  @Delete('categories/:categoryId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  deleteCategory(@Param('categoryId') categoryId: string, @CurrentUser('sub') userId: string) {
    return this.shopService.deleteCategory(categoryId, userId);
  }

  @Post('products')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  createProduct(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.shopService.createProduct(userId, dto);
  }

  @Put('delivery-products/:productId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  updateProduct(@Param('productId') productId: string, @CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.shopService.updateProduct(productId, userId, dto);
  }

  @Delete('delivery-products/:productId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  deleteProduct(@Param('productId') productId: string, @CurrentUser('sub') userId: string) {
    return this.shopService.deleteProduct(productId, userId);
  }

  @Delete('specs/option/:optionId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  deleteSpecOption(@Param('optionId') optionId: string, @CurrentUser('sub') userId: string) {
    return this.shopService.deleteSpecOption(optionId, userId);
  }

  @Post('product-options/:productId/batch')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  batchCreateOptions(@Param('productId') productId: string, @CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.shopService.batchCreateOptions(productId, userId, dto);
  }

  @Put('product-options/:productId/batch')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  batchUpdateOptions(@Param('productId') productId: string, @CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.shopService.batchUpdateOptions(productId, userId, dto);
  }

  @Delete('product-options/:productId/batch')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  batchDeleteOptions(@Param('productId') productId: string, @CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.shopService.batchDeleteOptions(productId, userId, dto);
  }

  @Get('product-options/:productId/all')
  getAllOptions(@Param('productId') productId: string) {
    return this.shopService.getAllOptions(productId);
  }

  @Post('shopping-cart')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  addToCart(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.shopService.addToCart(userId, dto);
  }

  @Delete('shopping-cart/delete')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  removeFromCart(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.shopService.removeFromCart(userId, dto);
  }

  @Delete('shopping-cart/clear')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  clearCart(@CurrentUser('sub') userId: string) {
    return this.shopService.clearCart(userId);
  }

  @Get('shopping-cart/merchant/:merchantId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getCart(@Param('merchantId') merchantId: string, @CurrentUser('sub') userId: string) {
    return this.shopService.getCart(merchantId, userId);
  }

  @Post('order/:merchantId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  createOrder(@Param('merchantId') merchantId: string, @CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.shopService.createOrder(merchantId, userId, dto);
  }

  @Get('order/:orderId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getOrderDetail(@Param('orderId') orderId: string, @CurrentUser('sub') userId: string) {
    return this.shopService.getOrderDetail(orderId, userId);
  }

  @Get('order')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getOrders(@CurrentUser('sub') userId: string, @Query() query: any) {
    return this.shopService.getOrders(userId, query);
  }

  @Patch('order/:orderId/status')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  updateOrderStatus(@Param('orderId') orderId: string, @CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.shopService.updateOrderStatus(orderId, userId, dto);
  }

  @Post('order/wx/notify')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  sendOrderNotification(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.shopService.sendOrderNotification(userId, dto);
  }

  @Post('wxpay/legacy-createOrder')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  legacyCreatePayment() {
    throw new GoneException(
      '该支付接口已下线，请使用 /wxpay/createOrder (PaymentController)。小程序端请更新到最新版本。'
    );
  }

  @Post('wxpay/printOrder')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  printOrder(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.shopService.printOrder(userId, dto);
  }

  @Get('merchant/reviews/stats/:merchantId')
  getReviewStats(@Param('merchantId') merchantId: string, @Query('regionId') regionId: string) {
    return this.shopService.getReviewStats(merchantId, regionId);
  }

  @Get('merchant/reviews/merchant/:merchantId')
  getReviews(@Param('merchantId') merchantId: string, @Query() query: any) {
    return this.shopService.getReviews(merchantId, query);
  }

  @Post('merchant/reviews')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  submitReview(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.shopService.submitReview(userId, dto);
  }

  @Get('merchant/reviews/tags/popular')
  getPopularTags(@Query('regionId') regionId: string) {
    return this.shopService.getPopularTags(regionId);
  }
}
