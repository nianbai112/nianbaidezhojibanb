import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/modules/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { ErrandModule } from '../errand/errand.module';
import { RiderAppController } from './rider-app.controller';
import { RiderAppService } from './rider-app.service';

@Module({
  imports: [AuthModule, PrismaModule, ErrandModule],
  controllers: [RiderAppController],
  providers: [RiderAppService],
})
export class RiderAppModule {}
