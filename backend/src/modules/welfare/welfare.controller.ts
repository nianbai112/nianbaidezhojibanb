import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../../guards/jwt.guard';
import { AdminGuard, AdminPermissionGuard } from '../../guards/admin.guard';
import { RequirePermission } from '../../decorators/require-permission.decorator';
import { WelfareService } from './welfare.service';

@Controller('miniapp/welfare')
export class WelfareController {
  constructor(private readonly service: WelfareService) {}
  @Get('campaigns') list(@Query() query: any) { return this.service.listPublic(query); }
  @Get('campaigns/:id') detail(@Param('id') id: string) { return this.service.publicDetail(id); }
  @Get('campaigns/:id/winners') winners(@Param('id') id: string, @Query() query: any) { return this.service.winners(id, query); }
  @Get('mine') @UseGuards(JwtGuard)
  mine(@Req() req: any, @Query() query: any) { return this.service.mine(req.user, query); }
  @Get('campaigns/:id/me') @UseGuards(JwtGuard)
  state(@Req() req: any, @Param('id') id: string) { return this.service.myState(id, req.user); }
  @Get('entries/:id') @UseGuards(JwtGuard)
  entry(@Req() req: any, @Param('id') id: string) { return this.service.myEntry(id, req.user); }
  @Post('campaigns/:id/participate') @UseGuards(JwtGuard)
  participate(@Req() req: any, @Param('id') id: string, @Body() body: any) { return this.service.participate(id, req.user, body?.requestKey); }
}

@Controller('admin/welfare')
@UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
export class WelfareAdminController {
  constructor(private readonly service: WelfareService) {}
  @Get('options') @RequirePermission('activity:view')
  options(@Req() req: any) { return this.service.adminOptions(req.user.sub); }
  @Get('capabilities') @RequirePermission('activity:view')
  capabilities(@Req() req: any) { return this.service.adminCapabilities(req.user.sub); }
  @Get('campaigns') @RequirePermission('activity:view')
  list(@Req() req: any, @Query() query: any) { return this.service.adminList(req.user.sub, query); }
  @Get('users') @RequirePermission('activity:edit')
  users(@Req() req: any, @Query('keyword') keyword: string) { return this.service.searchGiftUsers(req.user.sub, keyword); }
  @Get('campaigns/:id') @RequirePermission('activity:view')
  detail(@Req() req: any, @Param('id') id: string) { return this.service.adminDetail(id, req.user.sub); }
  @Get('campaigns/:id/entries') @RequirePermission('activity:view')
  entries(@Req() req: any, @Param('id') id: string, @Query() query: any) { return this.service.adminEntries(id, req.user.sub, query); }
  @Get('campaigns/:id/logs') @RequirePermission('activity:view')
  logs(@Req() req: any, @Param('id') id: string) { return this.service.adminLogs(id, req.user.sub); }
  @Post('campaigns') @RequirePermission('activity:edit')
  create(@Req() req: any, @Body() body: any) { return this.service.save(null, body, req.user.sub); }
  @Put('campaigns/:id') @RequirePermission('activity:edit')
  update(@Req() req: any, @Param('id') id: string, @Body() body: any) { return this.service.save(id, body, req.user.sub); }
  @Put('campaigns/:id/gifts') @RequirePermission('activity:edit')
  gifts(@Req() req: any, @Param('id') id: string, @Body() body: any) { return this.service.setGifts(id, body?.gifts, req.user.sub); }
  @Post('campaigns/:id/:action') @RequirePermission('activity:edit')
  action(@Req() req: any, @Param('id') id: string, @Param('action') action: string) { return this.service.transition(id, action, req.user.sub); }
  @Post('redeem') @RequirePermission('activity:edit')
  redeem(@Req() req: any, @Body() body: any) { return this.service.redeem(body?.code, req.user.sub); }
}
