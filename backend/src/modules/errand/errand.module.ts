import { Module } from '@nestjs/common';
import { ErrandController } from './errand.controller';
import { ErrandAdminController } from './errand.admin.controller';
import { ErrandService } from './errand.service';

@Module({
  controllers: [ErrandController, ErrandAdminController],
  providers: [ErrandService],
})
export class ErrandModule {}
