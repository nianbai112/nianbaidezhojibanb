import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { JwtGuard } from '../../guards/jwt.guard';
import { CreateAssistantTicketDto, ReplyAssistantTicketDto } from './dto/assistant-ticket.dto';
import { AssistantTicketService } from './assistant-ticket.service';
@Controller('assistant-tickets') @UseGuards(JwtGuard)
export class AssistantTicketController { constructor(private readonly service: AssistantTicketService) {} @Post() create(@CurrentUser('sub') userId: string, @Body() dto: CreateAssistantTicketDto) { return this.service.createTicket(userId, dto); } @Get('my') list(@CurrentUser('sub') userId: string) { return this.service.listMyTickets(userId); } @Post(':id/replies') reply(@CurrentUser('sub') userId: string, @Param('id') id: string, @Body() dto: ReplyAssistantTicketDto) { return this.service.replyToTicket(userId, id, dto.content, dto.clientMessageId || dto.client_message_id); } @Get(':id') detail(@CurrentUser('sub') userId: string, @Param('id') id: string) { return this.service.getMyTicket(userId, id); } }
