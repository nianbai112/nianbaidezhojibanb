import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../../guards/jwt.guard';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { GroupBuyConsumerService } from './group-buy.consumer.service';
@Controller('api/groupbuy')
export class GroupBuyConsumerController {
 constructor(private readonly service:GroupBuyConsumerService){}
 @Get('packages/:id') package(@Param('id') id:string,@Query() q:any){return this.service.package(id,q)}
 @Get('orders') @UseGuards(JwtGuard) orders(@CurrentUser('sub') u:string,@Query() q:any){return this.service.orders(u,q)}
 @Get('orders/request/:requestId') @UseGuards(JwtGuard) request(@CurrentUser('sub') u:string,@Param('requestId') id:string){return this.service.byRequest(u,id)}
 @Get('orders/:id') @UseGuards(JwtGuard) order(@CurrentUser('sub') u:string,@Param('id') id:string){return this.service.order(u,id)}
 @Post('orders/:id/pay') @UseGuards(JwtGuard) pay(@CurrentUser('sub') u:string,@Param('id') id:string,@Body() d:any){return this.service.pay(u,id,d)}
 @Post('orders/:id/cancel') @UseGuards(JwtGuard) cancel(@CurrentUser('sub') u:string,@Param('id') id:string){return this.service.cancel(u,id)}
 @Post('orders/:id/refund') @UseGuards(JwtGuard) refund(@CurrentUser('sub') u:string,@Param('id') id:string,@Body() d:any){return this.service.refund(u,id,d)}
}
