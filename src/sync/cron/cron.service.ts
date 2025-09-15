import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CldService } from '../../cld/cld.service';
import { ShopifyStockSyncService } from '../sync.service';

@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);

  constructor(private readonly cldService: CldService, private readonly syncService: ShopifyStockSyncService) {}

  @Cron('35 19 * * *') // Every day at 20:00 (8:00 PM)
  async handleProductSync() {
    this.logger.log(`⏰ Running CLD to Shopify sync at ${new Date().toLocaleTimeString()} `);
    try {
      await this.cldService.sendAllProductsToShopify();
      this.logger.log('✅ Daily product sync completed successfully.');
    } catch (error: any) {
      this.logger.error('❌ Error during product sync:', error?.message || error);
    }
  }

    @Cron('35 19 * * *') // Every day at 20:00 (8:00 PM)
  async handleOrdersSync() {
    this.logger.log(`⏰ Running daily CLD to Shopify sync at ${new Date().toLocaleTimeString()} `);
    try {
      await this.syncService.syncAllOrderToCLD(50);
      this.logger.log('✅ Daily product sync completed successfully.');
    } catch (error: any) {
      this.logger.error('❌ Error during product sync:', error?.message || error);
    }
  }
}
