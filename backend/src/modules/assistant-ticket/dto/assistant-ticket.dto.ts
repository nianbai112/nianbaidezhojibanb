import { IsIn, IsOptional, IsString, Length } from 'class-validator';

export class CreateAssistantTicketDto {
  @IsString() regionId: string;
  @IsString() @Length(1, 500) content: string;
  @IsOptional() @IsIn(['order', 'account', 'feedback', 'other']) category?: string;
  @IsOptional() @IsString() @Length(1, 100) clientMessageId?: string;
  @IsOptional() @IsString() @Length(1, 100) client_message_id?: string;
}

export class ReplyAssistantTicketDto {
  @IsString() @Length(1, 500) content: string;
  @IsOptional() @IsString() @Length(1, 100) clientMessageId?: string;
  @IsOptional() @IsString() @Length(1, 100) client_message_id?: string;
}

export class UpdateAssistantTicketDto {
  @IsOptional() @IsIn(['pending', 'processing', 'waiting_user', 'resolved', 'closed']) status?: string;
  @IsOptional() @IsString() @Length(1, 500) reply?: string;
}
