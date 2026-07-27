import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { RequirePermission } from '../../decorators/require-permission.decorator';
import { AdminGuard, AdminPermissionGuard } from '../../guards/admin.guard';
import { JwtGuard } from '../../guards/jwt.guard';
import { MembershipService } from './membership.service';

@ApiTags('后台会员运营')
@Controller('admin/membership')
@UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
export class MembershipAdminController {
  constructor(private readonly service: MembershipService) {}

  @Get('overview')
  @RequirePermission('membership:list')
  overview(@Query() query: any) {
    return this.service.adminOverview(query);
  }

  @Get('plans')
  @RequirePermission('membership:plan:list')
  plans() {
    return this.service.adminPlans();
  }

  @Get('benefit-catalog')
  @RequirePermission('membership:plan:list')
  benefitCatalog() {
    return this.service.adminBenefitCatalog();
  }

  @Get('display-items')
  @RequirePermission('membership:plan:list')
  displayItems(@Query() query: any) {
    return this.service.adminDisplayItems(query);
  }

  @Post('display-items')
  @RequirePermission('membership:plan:update')
  createDisplayItem(@Body() dto: any) {
    return this.service.saveDisplayItem(dto);
  }

  @Patch('display-items/:id')
  @RequirePermission('membership:plan:update')
  updateDisplayItem(@Param('id') id: string, @Body() dto: any) {
    return this.service.saveDisplayItem({ ...dto, id });
  }

  @Delete('display-items/:id')
  @RequirePermission('membership:plan:update')
  deleteDisplayItem(@Param('id') id: string) {
    return this.service.deleteDisplayItem(id);
  }

  @Get('faqs')
  @RequirePermission('membership:plan:list')
  faqs(@Query() query: any) {
    return this.service.adminFaqs(query);
  }

  @Post('faqs')
  @RequirePermission('membership:plan:update')
  createFaq(@Body() dto: any) {
    return this.service.saveFaq(dto);
  }

  @Patch('faqs/:id')
  @RequirePermission('membership:plan:update')
  updateFaq(@Param('id') id: string, @Body() dto: any) {
    return this.service.saveFaq({ ...dto, id });
  }

  @Delete('faqs/:id')
  @RequirePermission('membership:plan:update')
  deleteFaq(@Param('id') id: string) {
    return this.service.deleteFaq(id);
  }

  @Post('plans')
  @RequirePermission('membership:plan:create')
  createPlan(@Body() dto: any) {
    return this.service.savePlan(dto);
  }

  @Patch('plans/:id')
  @RequirePermission('membership:plan:update')
  updatePlan(@Param('id') id: string, @Body() dto: any) {
    return this.service.savePlan({ ...dto, id });
  }

  @Delete('plans/:id')
  @RequirePermission('membership:plan:delete')
  deletePlan(@Param('id') id: string) {
    return this.service.deletePlan(id);
  }

  @Get('orders')
  @RequirePermission('membership:order:list')
  orders(@Query() query: any) {
    return this.service.adminOrders(query);
  }

  @Get('users')
  @RequirePermission('membership:user:list')
  users(@Query() query: any) {
    return this.service.adminUsers(query);
  }

  @Post('users/:id/revoke')
  @RequirePermission('membership:grant')
  revokeUserMembership(
    @Param('id') id: string,
    @Body() dto: any,
    @CurrentUser('sub') operatorId: string,
  ) {
    return this.service.adminRevokeMembership(id, dto?.reason, operatorId);
  }

  @Post('users/:id/adjust-expiry')
  @RequirePermission('membership:grant')
  adjustUserMembershipExpiry(@Param('id') id: string, @Body() dto: any, @CurrentUser('sub') operatorId: string) {
    return this.service.adminAdjustMembershipExpiry(id, dto?.adjustmentDays, dto?.reason, operatorId);
  }

  @Post('orders/:id/link-membership')
  @RequirePermission('membership:grant')
  linkHistoricalOrderMembership(@Param('id') id: string, @Body() dto: any, @CurrentUser('sub') operatorId: string) {
    return this.service.adminLinkHistoricalOrderMembership(id, dto?.membershipId, dto?.reason, operatorId);
  }

  @Get('usage')
  @RequirePermission('membership:usage:list')
  usage(@Query() query: any) {
    return this.service.adminUsage(query);
  }

  @Post('grant')
  @RequirePermission('membership:grant')
  grant(@Body() dto: any, @CurrentUser('sub') operatorId: string) {
    return this.service.adminGrant(dto, operatorId);
  }
}
