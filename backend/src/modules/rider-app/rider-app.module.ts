import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/modules/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { ErrandModule } from '../errand/errand.module';
import { SystemConfigModule } from '../system-config/system-config.module';
import { RiderAppController } from './rider-app.controller';
import { RiderAppService } from './rider-app.service';
import { RiderPasswordCredentialService } from './rider-password-credential.service';

@Module({
  imports: [AuthModule, PrismaModule, ErrandModule, SystemConfigModule],
  controllers: [RiderAppController],
  providers: [RiderAppService, RiderPasswordCredentialService],
})
export class RiderAppModule {}
