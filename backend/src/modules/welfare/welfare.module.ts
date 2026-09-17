import { Module } from '@nestjs/common';
import { MembershipModule } from '../membership/membership.module';
import { WelfareController, WelfareAdminController } from './welfare.controller';
import { WelfareService } from './welfare.service';

@Module({ imports: [MembershipModule], controllers: [WelfareController, WelfareAdminController], providers: [WelfareService], exports: [WelfareService] })
export class WelfareModule {}
