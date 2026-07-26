import { Module } from '@nestjs/common';
import { CommentController } from './comment.controller';
import { CommentService } from './comment.service';
import { NotifyModule } from '../notify/notify.module';
import { AiRuntimeModule } from '../ai-runtime/ai-runtime.module';

@Module({
  imports: [NotifyModule, AiRuntimeModule],
  controllers: [CommentController],
  providers: [CommentService],
})
export class CommentModule {}
