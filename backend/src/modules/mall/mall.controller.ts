import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { MallService } from './mall.service';
import { JwtGuard } from '../../guards/jwt.guard';
import { AdminGuard, AdminPermissionGuard } from '../../guards/admin.guard';
import { RequirePermission } from '../../decorators/require-permission.decorator';
import { CurrentUser } from '../../decorators/current-user.decorator';

@ApiTags('商城')
@Controller()
export class MallController {
  constructor(private readonly mallService: MallService) {}

  @Get('api/mall/home/banners')
  @ApiOperation({ summary: '首页轮播图' })
  getBanners(@Query() query: any) {
    return this.mallService.getBanners(query);
  }

  @Get('api/mall/categories/list')
  @ApiOperation({ summary: '分类列表' })
  getCategories(@Query() query: any) {
    return this.mallService.getCategories(query);
  }

  @Get('api/mall/categories/:id')
  @ApiOperation({ summary: '分类详情' })
  getCategoryDetail(@Param('id') id: string) {
    return this.mallService.getCategoryDetail(id);
  }

  @Get('api/mall/products/list')
  @ApiOperation({ summary: '商品列表' })
  getProducts(@Query() query: any) {
    return this.mallService.getProducts(query);
  }

  @Get('api/mall/products/detail/:id')
  @ApiOperation({ summary: '商品详情' })
  getProductDetail(@Param('id') id: string) {
    return this.mallService.getProductDetail(id);
  }

  @Get('api/mall/merchants/list')
  @ApiOperation({ summary: '商户列表' })
  getMerchants(@Query() query: any) {
    return this.mallService.getMerchants(query);
  }

  @Post('api/mall/cart/add')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '添加购物车' })
  addToCart(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.mallService.addToCart(userId, dto);
  }

  @Get('api/mall/cart')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '购物车列表' })
  getCart(@CurrentUser('sub') userId: string) {
    return this.mallService.getCart(userId);
  }

  @Patch('api/mall/cart/item/:id')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新购物车项' })
  updateCartItem(@Param('id') id: string, @CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.mallService.updateCartItem(id, userId, dto);
  }

  @Delete('api/mall/cart/item/:id')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '删除购物车项' })
  removeCartItem(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.mallService.removeCartItem(id, userId);
  }

  @Post('api/mall/orders/submit')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '提交订单' })
  submitOrder(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.mallService.submitOrder(userId, dto);
  }

  @Get('api/mall/orders/my')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '我的订单列表' })
  getMyOrders(@CurrentUser('sub') userId: string, @Query() query: any) {
    return this.mallService.getMyOrders(userId, query);
  }

  @Get('api/mall/orders/:id')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '订单详情' })
  getOrderDetail(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.mallService.getOrderDetail(id, userId);
  }

  @Post('api/mall/orders/:id/pay')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '支付订单' })
  payOrder(@Param('id') id: string, @CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.mallService.payOrder(id, userId, dto);
  }

  @Post('api/mall/orders/:id/ship')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '商户发货' })
  shipOrder(@Param('id') id: string, @CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.mallService.shipOrder(id, userId, dto);
  }

  @Patch('api/mall/orders/:id/status')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新订单状态' })
  updateOrderStatus(@Param('id') id: string, @CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.mallService.updateOrderStatus(id, userId, dto);
  }

  @Post('api/mall/orders/:id/cancel')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '取消订单' })
  cancelOrder(@Param('id') id: string, @CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.mallService.cancelOrder(id, userId, dto);
  }

  @Post('api/mall/orders/:id/receive')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '确认收货' })
  receiveOrder(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.mallService.receiveOrder(id, userId);
  }

  @Post('api/mall/favorites/add')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '添加收藏' })
  addFavorite(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.mallService.addFavorite(userId, dto);
  }

  @Get('api/mall/favorites/list')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '收藏列表' })
  getFavorites(@CurrentUser('sub') userId: string, @Query() query: any) {
    return this.mallService.getFavorites(userId, query);
  }

  @Delete('api/mall/favorites/:productId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '取消收藏' })
  removeFavorite(@Param('productId') productId: string, @CurrentUser('sub') userId: string) {
    return this.mallService.removeFavorite(productId, userId);
  }

  @Get('api/mall/favorites/:productId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '检查收藏状态' })
  checkFavorite(@Param('productId') productId: string, @CurrentUser('sub') userId: string) {
    return this.mallService.checkFavorite(productId, userId);
  }

  @Delete('api/mall/favorites')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '批量取消收藏' })
  batchRemoveFavorites(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.mallService.batchRemoveFavorites(userId, dto);
  }

  @Get('api/mall/promotions/available')
  @ApiOperation({ summary: '可用促销列表' })
  getAvailablePromotions(@Query() query: any) {
    return this.mallService.getAvailablePromotions(query);
  }

  @Get('api/mall/promotions/list')
  @ApiOperation({ summary: '促销列表' })
  getPromotions(@Query() query: any) {
    return this.mallService.getAvailablePromotions(query);
  }

  @Get('api/mall/promotions/merchant/my-list')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '商户促销列表' })
  getMerchantPromotions(@CurrentUser('sub') userId: string, @Query() query: any) {
    return this.mallService.getMerchantPromotions(userId, query);
  }

  @Get('api/mall/promotions/:id')
  @ApiOperation({ summary: '促销详情' })
  getPromotionDetail(@Param('id') id: string) {
    return this.mallService.getPromotionDetail(id);
  }

  @Get('api/mall/freight/templates')
  @ApiOperation({ summary: '运费模板列表' })
  getFreightTemplates(@Query() query: any) {
    return this.mallService.getFreightTemplates(query);
  }

  @Get('api/mall/freight/template/:id')
  @ApiOperation({ summary: '运费模板详情' })
  getFreightTemplateDetail(@Param('id') id: string) {
    return this.mallService.getFreightTemplateDetail(id);
  }

  @Get('api/mall/reviews/product/:productId')
  @ApiOperation({ summary: '商品评价列表' })
  getProductReviews(@Param('productId') productId: string, @Query() query: any) {
    return this.mallService.getProductReviews(productId, query);
  }

  @Post('api/mall/reviews/create')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建评价' })
  createReview(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.mallService.createReview(userId, dto);
  }

  @Post('api/mall/refunds/apply')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '申请退款' })
  applyRefund(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.mallService.applyRefund(userId, dto);
  }

  @Get('api/mall/refunds/my')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '我的退款列表' })
  getMyRefunds(@CurrentUser('sub') userId: string, @Query() query: any) {
    return this.mallService.getMyRefunds(userId, query);
  }

  @Get('api/mall/refunds/detail/:id')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '退款详情' })
  getRefundDetail(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.mallService.getRefundDetail(id, userId);
  }

  @Post('api/mall/refunds/:id/cancel')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '取消退款' })
  cancelRefund(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.mallService.cancelRefund(id, userId);
  }

  @Post('api/mall/distributor/apply')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '申请分销员' })
  applyDistributor(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.mallService.applyDistributor(userId, dto);
  }

  @Get('api/mall/distributor/me')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '我的分销信息' })
  getMyDistributor(@CurrentUser('sub') userId: string) {
    return this.mallService.getMyDistributor(userId);
  }

  @Get('api/mall/merchants/my-application')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '我的商户申请' })
  getMyMerchantApplication(@CurrentUser('sub') userId: string) {
    return this.mallService.getMyMerchantApplication(userId);
  }

  @Get('api/mall/merchants/merchant/my-orders')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '商户订单列表' })
  getMerchantOrders(@CurrentUser('sub') userId: string, @Query() query: any) {
    return this.mallService.getMerchantOrders(userId, query);
  }

  @Post('api/mall/merchants/apply')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '申请商户' })
  applyMerchant(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.mallService.applyMerchant(userId, dto);
  }

  @Get('api/mall/merchants/:id')
  @ApiOperation({ summary: '商户详情' })
  getMerchantDetail(@Param('id') id: string) {
    return this.mallService.getMerchantDetail(id);
  }

  // ==================== 客服管理 ====================

  @Get('api/mall/service/admin/staff/list')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @ApiBearerAuth()
  @RequirePermission('mall:view')
  @ApiOperation({ summary: '客服列表' })
  getServiceStaffList(@Query() query: any) {
    return this.mallService.getServiceStaffList(query);
  }

  @Post('api/mall/service/admin/staff/create')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @ApiBearerAuth()
  @RequirePermission('mall:edit')
  @ApiOperation({ summary: '创建客服' })
  createServiceStaff(@Body() dto: any) {
    return this.mallService.createServiceStaff(dto);
  }

  @Patch('api/mall/service/admin/staff/:id')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @ApiBearerAuth()
  @RequirePermission('mall:edit')
  @ApiOperation({ summary: '更新客服' })
  updateServiceStaff(@Param('id') id: string, @Body() dto: any) {
    return this.mallService.updateServiceStaff(id, dto);
  }

  @Delete('api/mall/service/admin/staff/:id')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @ApiBearerAuth()
  @RequirePermission('mall:edit')
  @ApiOperation({ summary: '删除客服' })
  deleteServiceStaff(@Param('id') id: string) {
    return this.mallService.deleteServiceStaff(id);
  }
}
