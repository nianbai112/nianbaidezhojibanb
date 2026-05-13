import { Module } from '@nestjs/common';
import { AiAdminController } from './ai-admin.controller';
import { AiAdminService } from './ai-admin.service';
import { PrismaModule } from '../../common/modules/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AiAdminController],
  providers: [AiAdminService],
  exports: [AiAdminService],
})
export class AiAdminModule {}
