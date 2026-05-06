import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MiniappAdminController } from './miniapp.admin.controller';
import { MiniappService } from './miniapp.service';

@Module({
  imports: [ConfigModule],
  controllers: [MiniappAdminController],
  providers: [MiniappService],
  exports: [MiniappService],
})
export class MiniappModule {}
