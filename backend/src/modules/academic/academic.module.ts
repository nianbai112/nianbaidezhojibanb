import { Module } from "@nestjs/common";
import { WechatModule } from "../wechat/wechat.module";
import { AcademicService } from "./academic.service";
import {
  AcademicController,
  AcademicAdminController,
} from "./academic.controller";
@Module({
  imports: [WechatModule],
  controllers: [AcademicController, AcademicAdminController],
  providers: [AcademicService],
  exports: [AcademicService],
})
export class AcademicModule {}
