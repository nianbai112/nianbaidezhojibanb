import { BadRequestException, Body, Controller, Post, UseGuards } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { JwtGuard } from '../../guards/jwt.guard';
import { CurrentUser } from '../../decorators/current-user.decorator';

// 普通校园用户也可接收通知；身份只取 JWT，不能复用骑手/商家专用入口。
@Controller('push/devices')
@UseGuards(JwtGuard)
export class PushDeviceController {
  constructor(private readonly prisma: PrismaService) {}
  private client(dto: any): string {
    const id = typeof dto?.clientId === 'string' ? dto.clientId.trim() : '';
    if (!/^[A-Za-z0-9_-]{8,200}$/.test(id)) throw new BadRequestException('推送标识无效');
    return id;
  }
  @Post('register')
  async register(@CurrentUser('sub') userId: string, @Body() dto: any) {
    const clientId = this.client(dto);
    if (!['android', 'ios'].includes(dto?.platform)) throw new BadRequestException('推送平台无效');
    const data = { userId, platform: dto.platform, appVersion: String(dto.appVersion || '').slice(0, 50), lastSeenAt: new Date() };
    await this.prisma.userPushDevice.upsert({ where: { clientId }, update: data, create: { clientId, ...data } });
    return { success: true };
  }
  @Post('unregister')
  async unregister(@CurrentUser('sub') userId: string, @Body() dto: any) {
    const result = await this.prisma.userPushDevice.deleteMany({ where: { userId, clientId: this.client(dto) } });
    return { success: true, removed: result.count };
  }
}
