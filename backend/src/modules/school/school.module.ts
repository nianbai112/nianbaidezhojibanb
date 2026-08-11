import { Module } from '@nestjs/common';
import { SchoolController } from './school.controller';
import { SchoolAdminController } from './school.admin.controller';
import { SchoolService } from './school.service';

@Module({
  controllers: [SchoolController, SchoolAdminController],
  providers: [SchoolService],
  exports: [SchoolService],
})
export class SchoolModule {}
