import { Module } from '@nestjs/common';
import { IpGeoService } from './ip-geo.service';

@Module({
  providers: [IpGeoService],
  exports: [IpGeoService],
})
export class IpGeoModule {}
