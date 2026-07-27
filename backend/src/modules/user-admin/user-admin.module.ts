import { Module } from '@nestjs/common';
import { UserAdminController } from './user-admin.controller';
import { UserAdminService } from './user-admin.service';
import { GrowthModule } from '../growth/growth.module';

@Module({
  imports: [GrowthModule],
  controllers: [UserAdminController],
  providers: [UserAdminService],
  exports: [UserAdminService],
})
export class UserAdminModule {}
