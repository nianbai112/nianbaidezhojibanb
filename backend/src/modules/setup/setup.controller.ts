import { Controller, Get, Post, Body, Headers } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SetupService } from './setup.service';
import { SetupInitDto } from './dto/setup-init.dto';

@ApiTags('安装向导')
@Controller('setup')
export class SetupController {
  constructor(private readonly setupService: SetupService) {}

  @Get('status')
  @ApiOperation({ summary: '获取初始化状态（公开）' })
  async status() {
    return this.setupService.getStatus();
  }

  @Post('check')
  @ApiOperation({ summary: '部署环境检查（未初始化时公开；已初始化后仅超级管理员可访问）' })
  async check(@Headers('x-setup-token') setupToken: string) {
    return this.setupService.checkEnvironment(setupToken);
  }

  @Post('init')
  @ApiOperation({ summary: '执行系统初始化（已初始化后 403）' })
  async init(@Body() dto: SetupInitDto, @Headers('x-setup-token') setupToken: string) {
    return this.setupService.init(dto, setupToken);
  }
}
