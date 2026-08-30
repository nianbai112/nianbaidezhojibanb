import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { RegionService } from './region.service';
import { JwtGuard } from '../../guards/jwt.guard';
import { Roles } from '../../decorators/roles.decorator';
import { RolesGuard } from '../../guards/roles.guard';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { RoleType } from '@prisma/client';
import { Request } from 'express';
import { IpGeoService } from '../ip-geo/ip-geo.service';
import { Throttle } from '@nestjs/throttler';

@ApiTags('区域')
@Controller()
export class RegionController {
  constructor(
    private readonly regionService: RegionService,
    private readonly ipGeo: IpGeoService,
  ) {}

  private getClientIp(req: Request) {
    const forwarded = req.headers['x-forwarded-for'];
    return typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : req.ip || '';
  }

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

  @Post('regions/:id/select')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  selectRegion(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.regionService.selectRegion(userId, id);
  }

  @Get('regions/:id')
  detail(@Param('id') id: string) {
    return this.regionService.detail(id);
  }

  @Put('regions/:id')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  updateManagerSettings(@Param('id') id: string, @CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.regionService.updateManagerSettings(id, userId, dto);
  }

  @Get('status/location')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  async getUserLocation(@CurrentUser('sub') userId: string, @Req() req: Request) {
    const clientIp = this.getClientIp(req);
    const location = await this.ipGeo.resolve(clientIp);
    const visibleLocation = await this.ipGeo.visibleLocation(location);
    if (!visibleLocation) {
      return { status: 382, message: 'IP归属地暂不可用', _provider: 'disabled' };
    }
    await this.ipGeo.recordForUser(userId, location!);
    return {
      status: 0,
      message: 'Success',
      country: visibleLocation.country,
      province: visibleLocation.province,
      city: visibleLocation.city,
      district: visibleLocation.district,
      latitude: visibleLocation.latitude,
      longitude: visibleLocation.longitude,
      _provider: visibleLocation.provider,
      system_location: {
        success: true,
        country: visibleLocation.country,
        province: visibleLocation.province,
        city: visibleLocation.city,
        district: visibleLocation.district,
        formatted: [visibleLocation.district, visibleLocation.city, visibleLocation.province, visibleLocation.country].filter(Boolean).join(' '),
        method: 'ip',
        precision: 'low',
      },
    };
  }

  @Get('status/location/recommendation')
  @Throttle({ auth: { ttl: 60000, limit: 5 } })
  async getLocationRecommendation(@Req() req: Request) {
    const location = await this.ipGeo.resolve(this.getClientIp(req));
    const visibleLocation = await this.ipGeo.visibleLocation(location);
    if (!visibleLocation) {
      return { status: 382, message: 'IP归属地暂不可用', _provider: 'disabled' };
    }
    return {
      status: 0,
      message: 'Success',
      country: visibleLocation.country,
      province: visibleLocation.province,
      city: visibleLocation.city,
      district: visibleLocation.district,
      latitude: visibleLocation.latitude,
      longitude: visibleLocation.longitude,
      _provider: visibleLocation.provider,
    };
  }
}
