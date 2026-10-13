import { Module } from '@nestjs/common';
import { StudentIdentityService } from './student-identity.service';
import {
  StudentIdentityAdminController,
  StudentIdentityMaterialController,
} from './student-identity.controller';

@Module({
  controllers: [
    StudentIdentityAdminController,
    StudentIdentityMaterialController,
  ],
  providers: [StudentIdentityService],
  exports: [StudentIdentityService],
})
export class StudentIdentityModule {}
