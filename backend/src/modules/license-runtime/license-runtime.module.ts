import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { LicenseRuntimeController } from "./license-runtime.controller";
import { LicenseRuntimeGuard } from "./license-runtime.guard";
import { LicenseRuntimeService } from "./license-runtime.service";

@Module({
  controllers: [LicenseRuntimeController],
  providers: [
    LicenseRuntimeService,
    {
      provide: APP_GUARD,
      useClass: LicenseRuntimeGuard,
    },
  ],
  exports: [LicenseRuntimeService],
})
export class LicenseRuntimeModule {}
