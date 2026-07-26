import { Module } from '@nestjs/common';
import { CampusMapController } from './campus-map.controller';
import { CampusMapImportService } from './campus-map-import.service';
import { CampusMapService } from './campus-map.service';

@Module({
  controllers: [CampusMapController],
  providers: [CampusMapService, CampusMapImportService],
  exports: [CampusMapService, CampusMapImportService],
})
export class CampusMapModule {}
