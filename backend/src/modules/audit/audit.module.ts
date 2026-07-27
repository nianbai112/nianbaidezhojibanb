import { Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';
import { PrismaModule } from '../../common/modules/prisma.module';
import { RedisModule } from '../../common/modules/redis.module';
import { AiRuntimeModule } from '../ai-runtime/ai-runtime.module';
import { NotifyModule } from '../notify/notify.module';

@Module({
  imports: [PrismaModule, RedisModule, AiRuntimeModule, NotifyModule],
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
