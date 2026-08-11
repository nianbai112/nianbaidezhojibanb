import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SearchService } from './search.service';

@ApiTags('搜索')
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get('global')
  globalSearch(@Query() query: any) {
    return this.searchService.globalSearch(query);
  }

  @Get('hot-keywords')
  hotKeywords(@Query() query: any) {
    return this.searchService.hotKeywords(query);
  }
}
