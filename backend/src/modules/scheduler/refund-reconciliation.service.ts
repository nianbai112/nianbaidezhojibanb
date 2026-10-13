import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { RedisService } from '../../common/services/redis.service';
import { PaymentService } from '../payment/payment.service';

@Injectable()
export class RefundReconciliationService {
  private readonly logger = new Logger(RefundReconciliationService.name);
  private running = false;

  constructor(private readonly payment: PaymentService, private readonly redis: RedisService) {}

  @Interval(60_000)
  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.redis.withRenewingLock('scheduler:refund-reconciliation', 60, async () => {
        const result = await this.payment.reconcileProcessingRefunds();
        if (result.checked) this.logger.log(`退款自动核对: ${JSON.stringify(result)}`);
      });
    } catch {
      this.logger.warn('退款自动核对任务暂未完成，等待下次重试');
    } finally {
      this.running = false;
    }
  }
}
