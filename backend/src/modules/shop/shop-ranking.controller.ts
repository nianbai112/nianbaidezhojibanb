import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ShopRankingService } from './shop-ranking.service';

@ApiTags('校园商家榜单')
@Controller('merchants')
export class ShopRankingController {
  constructor(private readonly ranking: ShopRankingService) {}
  @Get('rankings')
  list(@Query() query: any) { return this.ranking.list(query); }
}
