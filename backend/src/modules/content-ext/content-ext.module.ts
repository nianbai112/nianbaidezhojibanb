import { Module } from '@nestjs/common';
import { ContentExtAdminController } from './content-ext.admin.controller';
import { ContentExtService } from './content-ext.service';

@Module({
  controllers: [ContentExtAdminController],
  providers: [ContentExtService],
  exports: [ContentExtService],
})
export class ContentExtModule {}
