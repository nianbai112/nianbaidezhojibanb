import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { RequirePermission } from '../../decorators/require-permission.decorator';
import { AdminGuard, AdminPermissionGuard } from '../../guards/admin.guard';
import { JwtGuard } from '../../guards/jwt.guard';
import { UpdateAssistantTicketDto } from './dto/assistant-ticket.dto';
import { AssistantTicketService } from './assistant-ticket.service';
@Controller('admin/assistant-tickets') @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
export class AssistantTicketAdminController { constructor(private readonly service: AssistantTicketService) {} @Get('conversations') @RequirePermission('marketing:view') conversations(@CurrentUser('sub') id: string, @Query() query: any) { return this.service.listOfficialConversations(id, query); } @Get() @RequirePermission('marketing:view') list(@CurrentUser('sub') id: string, @Query() query: any) { return this.service.listAdminTickets(id, query); } @Patch(':id') @RequirePermission('marketing:view') update(@CurrentUser('sub') adminId: string, @Param('id') id: string, @Body() dto: UpdateAssistantTicketDto) { return this.service.updateTicket(adminId, id, dto); } }
