import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { RegionService } from './region.service';
import { JwtGuard } from '../../guards/jwt.guard';
import { Roles } from '../../decorators/roles.decorator';
import { RolesGuard } from '../../guards/roles.guard';
import { RoleType } from '@prisma/client';
import { Request } from 'express';

@ApiTags('区域')
@Controller()
export class RegionController {
  constructor(private readonly regionService: RegionService) {}

  @Get('regions')
  list() {
    return this.regionService.list();
  }

  @Get('regions/search-config')
  getSearchConfig(@Query('region_id') regionId: string) {
    return this.regionService.getSearchConfig(regionId);
  }

  @Get('regions/share-settings/:regionId')
  getShareSettings(@Param('regionId') regionId: string) {
    return this.regionService.getShareSettings(regionId);
  }

  @Get('region/home-page-content')
  getHomePageContent(@Query() query: any) {
    return this.regionService.getHomePageContent(query);
  }

  @Get('regions/:id/content-items')
  getContentItems(@Param('id') id: string) {
    return this.regionService.getContentItems(id);
  }

  @Post('regions/:id/content-item')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles(RoleType.ADMIN, RoleType.SUPER_ADMIN)
  @ApiBearerAuth()
  addContentItem(@Param('id') id: string, @Body() dto: any) {
    return this.regionService.addContentItem(id, dto);
  }

  @Put('regions/:id/content-item/:itemId')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles(RoleType.ADMIN, RoleType.SUPER_ADMIN)
  @ApiBearerAuth()
  updateContentItem(@Param('id') id: string, @Param('itemId') itemId: string, @Body() dto: any) {
    return this.regionService.updateContentItem(id, itemId, dto);
  }

  @Delete('regions/:id/content-item/:itemId')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles(RoleType.ADMIN, RoleType.SUPER_ADMIN)
  @ApiBearerAuth()
  deleteContentItem(@Param('id') id: string, @Param('itemId') itemId: string) {
    return this.regionService.deleteContentItem(id, itemId);
  }

  @Get('regions/:id/tabbar')
  getTabbar(@Param('id') id: string) {
    return this.regionService.getTabbar(id);
  }

  @Get('regions/:id')
  detail(@Param('id') id: string) {
    return this.regionService.detail(id);
  }

  @Get('status/location')
  getUserLocation(@Req() req: Request) {
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip || '';
    const forwarded = req.headers['x-forwarded-for'];
    const clientIp = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : ip;
    return {
      status: 0,
      message: 'Success',
      province: '',
      city: '',
      district: '',
      latitude: null,
      longitude: null,
      _provider: 'default',
      system_location: {
        success: true,
        province: '',
        city: '',
        formatted: clientIp || 'unknown',
        method: 'ip',
        precision: 'low',
      },
    };
  }
}
