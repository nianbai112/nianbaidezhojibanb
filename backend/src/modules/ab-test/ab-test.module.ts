import { Module } from '@nestjs/common';
import { ABTestController } from './ab-test.controller';
import { ABTestService } from './ab-test.service';
import { PrismaModule } from '../../common/modules/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ABTestController],
  providers: [ABTestService],
  exports: [ABTestService],
})
export class ABTestModule {}
