import { Module } from '@nestjs/common';
import { CampusMapController } from './campus-map.controller';
import { CampusMapCollectionController } from './campus-map-collection.controller';
import { CampusMapCollectionService } from './campus-map-collection.service';
import { CampusMapImportService } from './campus-map-import.service';
import { CampusMapService } from './campus-map.service';

@Module({
  controllers: [CampusMapController, CampusMapCollectionController],
  providers: [CampusMapService, CampusMapImportService, CampusMapCollectionService],
  exports: [CampusMapService, CampusMapImportService, CampusMapCollectionService],
})
export class CampusMapModule {}
