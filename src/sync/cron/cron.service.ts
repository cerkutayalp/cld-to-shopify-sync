import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CldService } from '../../cld/cld.service';

@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);

  constructor(private readonly cldService: CldService) {}

  @Cron('35 19 * * *') // Every day at 20:00 (8:00 PM)
  async handleDailyProductSync() {
    this.logger.log('⏰ Running daily CLD to Shopify sync at 8:00 PM...');
    try {
      await this.cldService.sendAllProductsToShopify();
      this.logger.log('✅ Daily product sync completed successfully.');
    } catch (error: any) {
      this.logger.error('❌ Error during product sync:', error?.message || error);
    }
  }
}
