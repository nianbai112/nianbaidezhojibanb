import { Module } from '@nestjs/common';
import { DecorVersionController } from './decor-version.controller';
import { DecorVersionService } from './decor-version.service';
import { PrismaModule } from '../../common/modules/prisma.module';
import { AdminModule } from '../admin/admin.module';

@Module({
  imports: [PrismaModule, AdminModule],
  controllers: [DecorVersionController],
  providers: [DecorVersionService],
  exports: [DecorVersionService],
})
export class DecorVersionModule {}
