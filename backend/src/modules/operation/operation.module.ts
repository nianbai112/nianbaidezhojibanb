import { Module } from '@nestjs/common';
import { OperationController } from './operation.controller';
import { OperationService } from './operation.service';
import { AiRuntimeModule } from '../ai-runtime/ai-runtime.module';

@Module({
  imports: [AiRuntimeModule],
  controllers: [OperationController],
  providers: [OperationService],
  exports: [OperationService],
})
export class OperationModule {}
