import { Module } from '@nestjs/common';
import { FinanceAdminController } from './finance-admin.controller';
import { FinanceAdminService } from './finance-admin.service';

@Module({
  controllers: [FinanceAdminController],
  providers: [FinanceAdminService],
  exports: [FinanceAdminService]
})
export class FinanceAdminModule {}
