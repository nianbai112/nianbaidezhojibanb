import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { RequirePermission } from '../../decorators/require-permission.decorator';
import { AdminGuard, AdminPermissionGuard } from '../../guards/admin.guard';
import { JwtGuard } from '../../guards/jwt.guard';
import { UpdateOrderAppealDto } from './dto/order-appeal.dto';
import { OrderAppealService } from './order-appeal.service';

@ApiTags('后台管理-订单申诉')
@Controller('admin/order-appeals')
@UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
@ApiBearerAuth()
export class OrderAppealAdminController {
  constructor(private readonly service: OrderAppealService) {}

  @Get() @RequirePermission('order:view') @ApiOperation({ summary: '订单申诉处理列表' })
  list(@CurrentUser('sub') adminId: string, @Query() query: any) { return this.service.listAdminAppeals(adminId, query); }

  @Patch(':id') @RequirePermission('order:refund') @ApiOperation({ summary: '回复或更新订单申诉' })
  update(@CurrentUser('sub') adminId: string, @Param('id') id: string, @Body() dto: UpdateOrderAppealDto) { return this.service.updateAppeal(adminId, id, dto); }
}
