import { Module } from '@nestjs/common';
import { UploadModule } from '../upload/upload.module';
import { UploadService } from '../upload/upload.service';
import { CampusMapController } from './campus-map.controller';
import { CampusMapCollectionController } from './campus-map-collection.controller';
import { CampusMapCollectionService } from './campus-map-collection.service';
import { CampusMapService } from './campus-map.service';
import { CampusMapReadGuard } from './campus-map-read.guard';

@Module({
  imports: [UploadModule],
  controllers: [CampusMapController, CampusMapCollectionController],
  providers: [CampusMapService, CampusMapCollectionService, UploadService, CampusMapReadGuard],
  exports: [CampusMapService, CampusMapCollectionService],
})
export class CampusMapModule {}
