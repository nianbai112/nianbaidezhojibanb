import { Module } from '@nestjs/common';
import { MembershipController } from './membership.controller';
import { MembershipAdminController } from './membership.admin.controller';
import { MembershipService } from './membership.service';

@Module({
  controllers: [MembershipController, MembershipAdminController],
  providers: [MembershipService],
  exports: [MembershipService],
})
export class MembershipModule {}
