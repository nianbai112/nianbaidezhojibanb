import { Module } from '@nestjs/common';
import { CommentController } from './comment.controller';
import { CommentService } from './comment.service';
import { NotifyModule } from '../notify/notify.module';

@Module({
  imports: [NotifyModule],
  controllers: [CommentController],
  providers: [CommentService],
})
export class CommentModule {}
