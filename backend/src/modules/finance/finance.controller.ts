import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { FinanceService } from './finance.service';
import { JwtGuard } from '../../guards/jwt.guard';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { RechargeDto, WithdrawDto, QueryDto } from './dto/finance.dto';

@ApiTags('财务')
@Controller('finance')
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  @Get('wallet')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '我的钱包' })
  wallet(@CurrentUser('sub') userId: string) {
    return this.financeService.getWallet(userId);
  }

  @Get('transactions')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '交易流水' })
  transactions(@CurrentUser('sub') userId: string, @Query() query: QueryDto) {
    return this.financeService.transactions(userId, query);
  }

  @Post('recharge')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '充值' })
  recharge(@CurrentUser('sub') userId: string, @Body() dto: RechargeDto) {
    return this.financeService.recharge(userId, dto);
  }

  @Post('withdraw')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '提现' })
  withdraw(@CurrentUser('sub') userId: string, @Body() dto: WithdrawDto) {
    return this.financeService.withdraw(userId, dto);
  }
}
