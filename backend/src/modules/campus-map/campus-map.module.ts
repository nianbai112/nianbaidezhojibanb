import { Module } from '@nestjs/common';
import { UploadModule } from '../upload/upload.module';
import { CampusMapController } from './campus-map.controller';
import { CampusMapCollectionController } from './campus-map-collection.controller';
import { CampusMapCollectionService } from './campus-map-collection.service';
import { CampusMapImportService } from './campus-map-import.service';
import { CampusMapService } from './campus-map.service';

@Module({
  imports: [UploadModule],
  controllers: [CampusMapController, CampusMapCollectionController],
  providers: [CampusMapService, CampusMapImportService, CampusMapCollectionService],
  exports: [CampusMapService, CampusMapImportService, CampusMapCollectionService],
})
export class CampusMapModule {}
