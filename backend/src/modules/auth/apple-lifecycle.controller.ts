import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AppleLifecycleService } from './apple-lifecycle.service';

@Controller('wx-auth/apple')
export class AppleLifecycleController {
  constructor(private readonly lifecycle: AppleLifecycleService) {}
  @Post('notifications')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60000, limit: 120 } })
  receive(@Body() body: any) { return this.lifecycle.handleNotification(body?.payload); }
}
