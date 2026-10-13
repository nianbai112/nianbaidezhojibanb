import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../../guards/jwt.guard';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { MallOwnerService } from './mall-owner.service';

/** Consumer JWT + DB owner scope. Existing platform AdminGuard endpoints are not relaxed. */
@Controller('api/mall/owner')
@UseGuards(JwtGuard)
export class MallOwnerController {
  constructor(private readonly service: MallOwnerService) {}
  @Get('merchants') merchants(@CurrentUser('sub') u: string, @Query() q: any) { return this.service.merchants(u, q); }
  @Get('merchants/:merchantId') dashboard(@CurrentUser('sub') u: string, @Param('merchantId') m: string, @Query() q: any) { return this.service.dashboard(u, m, q); }
  @Post('merchants/:merchantId/profile') profile(@CurrentUser('sub') u: string, @Param('merchantId') m: string, @Body() d: any) { return this.service.updateMerchant(u, m, d); }
  @Get('merchants/:merchantId/products') products(@CurrentUser('sub') u: string, @Param('merchantId') m: string, @Query() q: any) { return this.service.products(u, m, q); }
  @Get('merchants/:merchantId/products/:id') product(@CurrentUser('sub') u: string, @Param('merchantId') m: string, @Param('id') id: string, @Query() q: any) { return this.service.product(u, m, id, q); }
  @Post('merchants/:merchantId/products') createProduct(@CurrentUser('sub') u: string, @Param('merchantId') m: string, @Body() d: any) { return this.service.saveProduct(u, m, null, d); }
  @Post('merchants/:merchantId/products/:id') editProduct(@CurrentUser('sub') u: string, @Param('merchantId') m: string, @Param('id') id: string, @Body() d: any) { return this.service.saveProduct(u, m, id, d); }
  @Post('merchants/:merchantId/products/:id/skus') createSku(@CurrentUser('sub') u: string, @Param('merchantId') m: string, @Param('id') id: string, @Body() d: any) { return this.service.saveSku(u, m, id, null, d); }
  @Post('merchants/:merchantId/products/:id/skus/:skuId') editSku(@CurrentUser('sub') u: string, @Param('merchantId') m: string, @Param('id') id: string, @Param('skuId') sku: string, @Body() d: any) { return this.service.saveSku(u, m, id, sku, d); }
  @Post('merchants/:merchantId/products/:id/skus/:skuId/remove') removeSku(@CurrentUser('sub') u: string, @Param('merchantId') m: string, @Param('id') id: string, @Param('skuId') sku: string, @Body() d: any) { return this.service.deleteSku(u, m, id, sku, d); }
  @Get('merchants/:merchantId/orders') orders(@CurrentUser('sub') u: string, @Param('merchantId') m: string, @Query() q: any) { return this.service.orders(u, m, q); }
  @Post('merchants/:merchantId/orders/:id/ship') ship(@CurrentUser('sub') u: string, @Param('merchantId') m: string, @Param('id') id: string, @Body() d: any) { return this.service.ship(u, m, id, d); }
  @Get('merchants/:merchantId/refunds') refunds(@CurrentUser('sub') u: string, @Param('merchantId') m: string, @Query() q: any) { return this.service.refunds(u, m, q); }
  @Post('merchants/:merchantId/refunds/:id/review') reviewRefund(@CurrentUser('sub') u: string, @Param('merchantId') m: string, @Param('id') id: string, @Body() d: any) { return this.service.reviewRefund(u, m, id, d); }
  @Get('merchants/:merchantId/records/:kind') records(@CurrentUser('sub') u: string, @Param('merchantId') m: string, @Param('kind') k: string, @Query() q: any) { return this.service.records(u, m, k, q); }
  @Get('merchants/:merchantId/records/:kind/:id')
  record(@CurrentUser('sub') u: string, @Param('merchantId') m: string, @Param('kind') k: string, @Param('id') id: string, @Query() q: any) { return this.service.record(u,m,k,id,q); }
  @Post('merchants/:merchantId/reviews/:id/reply') reply(@CurrentUser('sub') u: string, @Param('merchantId') m: string, @Param('id') id: string, @Body() d: any) { return this.service.replyReview(u, m, id, d); }
  @Post('merchants/:merchantId/distributors/:id/review') distributor(@CurrentUser('sub') u: string, @Param('merchantId') m: string, @Param('id') id: string, @Body() d: any) { return this.service.reviewDistributor(u, m, id, d); }
  @Post('merchants/:merchantId/promotions') promotionCreate(@CurrentUser('sub') u: string, @Param('merchantId') m: string, @Body() d: any) { return this.service.savePromotion(u, m, null, d); }
  @Post('merchants/:merchantId/promotions/:id') promotionEdit(@CurrentUser('sub') u: string, @Param('merchantId') m: string, @Param('id') id: string, @Body() d: any) { return this.service.savePromotion(u, m, id, d); }
  @Post('merchants/:merchantId/freight') freightCreate(@CurrentUser('sub') u: string, @Param('merchantId') m: string, @Body() d: any) { return this.service.saveFreight(u, m, null, d); }
  @Post('merchants/:merchantId/freight/:id') freightEdit(@CurrentUser('sub') u: string, @Param('merchantId') m: string, @Param('id') id: string, @Body() d: any) { return this.service.saveFreight(u, m, id, d); }
  @Post('merchants/:merchantId/service') staffCreate(@CurrentUser('sub') u: string, @Param('merchantId') m: string, @Body() d: any) { return this.service.saveServiceStaff(u, m, null, d); }
  @Post('merchants/:merchantId/service/:id') staffEdit(@CurrentUser('sub') u: string, @Param('merchantId') m: string, @Param('id') id: string, @Body() d: any) { return this.service.saveServiceStaff(u, m, id, d); }
  @Post('merchants/:merchantId/records/:kind/:id/remove') remove(@CurrentUser('sub') u: string, @Param('merchantId') m: string, @Param('kind') k: string, @Param('id') id: string, @Body() d: any) { return this.service.removeRecord(u, m, k, id, d); }
}
