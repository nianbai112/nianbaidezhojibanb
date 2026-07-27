import { Module } from '@nestjs/common';
import { NotifyModule } from '../notify/notify.module';
import { AssistantTicketAdminController } from './assistant-ticket.admin.controller';
import { AssistantTicketController } from './assistant-ticket.controller';
import { AssistantTicketService } from './assistant-ticket.service';
@Module({ imports: [NotifyModule], controllers: [AssistantTicketController, AssistantTicketAdminController], providers: [AssistantTicketService] })
export class AssistantTicketModule {}
