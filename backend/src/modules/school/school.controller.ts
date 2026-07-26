import { Controller, Get, Query, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SchoolService } from './school.service';
import { SchoolQueryDto } from './dto/school.dto';

@ApiTags('学校')
@Controller()
export class SchoolController {
  constructor(private readonly schoolService: SchoolService) {}

  @Get('schools')
  @ApiOperation({ summary: '学校列表（小程序选择学校用）' })
  list(@Query() query: SchoolQueryDto) {
    return this.schoolService.list(query);
  }

  @Get('schools/:id')
  @ApiOperation({ summary: '学校详情' })
  detail(@Param('id') id: string) {
    return this.schoolService.detail(id);
  }
}
