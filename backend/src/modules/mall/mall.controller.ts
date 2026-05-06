import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { MallService } from './mall.service';
import { JwtGuard } from '../../guards/jwt.guard';
import { CurrentUser } from '../../decorators/current-user.decorator';

@ApiTags('商城')
@Controller()
export class MallController {
  constructor(private readonly mallService: MallService) {}

  @Get('api/mall/home/banners')
  getBanners(@Query() query: any) {
    return this.mallService.getBanners(query);
  }

  @Get('api/mall/categories/list')
  getCategories(@Query() query: any) {
    return this.mallService.getCategories(query);
  }

  @Get('api/mall/products/list')
  getProducts(@Query() query: any) {
    return this.mallService.getProducts(query);
  }

  @Get('api/mall/products/detail/:id')
  getProductDetail(@Param('id') id: string) {
    return this.mallService.getProductDetail(id);
  }

  @Get('api/mall/merchants/list')
  getMerchants(@Query() query: any) {
    return this.mallService.getMerchants(query);
  }

  @Get('api/mall/merchants/:id')
  getMerchantDetail(@Param('id') id: string) {
    return this.mallService.getMerchantDetail(id);
  }

  @Post('api/mall/cart/add')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  addToCart(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.mallService.addToCart(userId, dto);
  }

  @Get('api/mall/cart')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getCart(@CurrentUser('sub') userId: string) {
    return this.mallService.getCart(userId);
  }

  @Delete('api/mall/cart/item/:id')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  removeCartItem(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.mallService.removeCartItem(id, userId);
  }

  @Post('api/mall/orders/submit')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  submitOrder(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.mallService.submitOrder(userId, dto);
  }

  @Get('api/mall/orders/my')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getMyOrders(@CurrentUser('sub') userId: string, @Query() query: any) {
    return this.mallService.getMyOrders(userId, query);
  }

  @Get('api/mall/orders/:id')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getOrderDetail(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.mallService.getOrderDetail(id, userId);
  }

  @Post('api/mall/orders/:id/pay')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  payOrder(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.mallService.payOrder(id, userId);
  }

  @Post('api/mall/orders/:id/cancel')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  cancelOrder(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.mallService.cancelOrder(id, userId);
  }

  @Post('api/mall/favorites/add')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  addFavorite(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.mallService.addFavorite(userId, dto);
  }

  @Get('api/mall/favorites/list')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getFavorites(@CurrentUser('sub') userId: string, @Query() query: any) {
    return this.mallService.getFavorites(userId, query);
  }

  @Delete('api/mall/favorites/:productId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  removeFavorite(@Param('productId') productId: string, @CurrentUser('sub') userId: string) {
    return this.mallService.removeFavorite(productId, userId);
  }

  @Get('api/mall/promotions/available')
  getAvailablePromotions(@Query() query: any) {
    return this.mallService.getAvailablePromotions(query);
  }

  @Get('api/mall/reviews/product/:productId')
  getProductReviews(@Param('productId') productId: string, @Query() query: any) {
    return this.mallService.getProductReviews(productId, query);
  }

  @Post('api/mall/reviews/create')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  createReview(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.mallService.createReview(userId, dto);
  }

  @Post('api/mall/refunds/apply')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  applyRefund(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.mallService.applyRefund(userId, dto);
  }

  @Get('api/mall/refunds/my')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getMyRefunds(@CurrentUser('sub') userId: string, @Query() query: any) {
    return this.mallService.getMyRefunds(userId, query);
  }

  @Post('api/mall/distributor/apply')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  applyDistributor(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.mallService.applyDistributor(userId, dto);
  }

  @Get('api/mall/distributor/me')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getMyDistributor(@CurrentUser('sub') userId: string) {
    return this.mallService.getMyDistributor(userId);
  }

  @Get('api/mall/merchants/my-application')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getMyMerchantApplication(@CurrentUser('sub') userId: string) {
    return this.mallService.getMyMerchantApplication(userId);
  }

  @Post('api/mall/merchants/apply')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  applyMerchant(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.mallService.applyMerchant(userId, dto);
  }
}
