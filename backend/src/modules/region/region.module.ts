import { Module } from '@nestjs/common';
import { RegionController } from './region.controller';
import { RegionService } from './region.service';
import { IpGeoModule } from '../ip-geo/ip-geo.module';

@Module({
  controllers: [RegionController],
  imports: [IpGeoModule],
  providers: [RegionService],
  exports: [RegionService],
})
export class RegionModule {}
