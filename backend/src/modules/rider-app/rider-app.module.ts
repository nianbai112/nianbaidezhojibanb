import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../../common/modules/prisma.module';
import { RiderAppController } from './rider-app.controller';
import { RiderAppService } from './rider-app.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [RiderAppController],
  providers: [RiderAppService],
})
export class RiderAppModule {}
