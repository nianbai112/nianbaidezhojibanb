import { Module } from '@nestjs/common';
import { ContentExtModule } from '../content-ext/content-ext.module';
import { PostModule } from '../post/post.module';
import { UploadModule } from '../upload/upload.module';
import { PostShareController } from './post-share.controller';
import { PostShareService } from './post-share.service';

@Module({
  imports: [PostModule, UploadModule, ContentExtModule],
  controllers: [PostShareController],
  providers: [PostShareService],
  exports: [PostShareService],
})
export class PostShareModule {}
