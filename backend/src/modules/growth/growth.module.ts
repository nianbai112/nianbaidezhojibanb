import { Module } from '@nestjs/common';
import { GrowthService } from './growth.service';

@Module({
  providers: [GrowthService],
  exports: [GrowthService],
})
export class GrowthModule {}
