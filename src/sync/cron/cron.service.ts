import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { CldService } from '../../cld/cld.service';
import { ShopifyService } from '../../shopify/shopify.service';
import { ShopifyStockSyncService } from '../sync.service';


@Injectable()
export class CronService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CronService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly cldService: CldService,
    private readonly ShopifyService: ShopifyService,
    private readonly syncService: ShopifyStockSyncService,
  ) {}
  
  private isEnabled(key: string): boolean {
  return this.configService.get<string>(key) === 'true';}

 async onApplicationBootstrap() {
    // ✅ Control bootstrap sync execution via env
    const runOnBootstrap = this.isEnabled('RUN_BOOTSTRAP_SYNC');
     console.log('RUN_BOOTSTRAP_SYNC:', runOnBootstrap);
    if (runOnBootstrap ) {
      this.logger.log('🚀 Bootstrap sync enabled — executing startup syncs...');
      await this.handleOrdersSync();
      await this.handleStockSync();
    } else {
      this.logger.log('⏸ Bootstrap sync disabled — skipping startup syncs.');
    }
  }


  // 🟢 Send all products
  @Cron('0 0 */4 * * *')// runs at minute 0, every 4th hour
  async handleProductSync() {
    if (!this.isEnabled('CRON_SEND_ALL_PRODUCTS')) return;

    this.logger.log(`⏰ Running product sync at ${new Date().toLocaleTimeString()}`);
    try {
      await this.ShopifyService.sendAllProductsToShopify();
      this.logger.log('✅ Daily product sync completed successfully.');
    } catch (error: any) {
      this.logger.error('❌ Error during product sync:', error?.message || error);
    }
  }

  // 🟢 Sync stock
  @Cron('0 0 */4 * * *')// runs at minute 0, every 4th hour
  async handleStockSync() {
    if (!this.isEnabled('CRON_SYNC_STOCK')) return;

    this.logger.log(`⏰ Running stock sync at ${new Date().toLocaleTimeString()}`);
    try {
      const result = await this.syncService.syncAllStockFromCLD();
      this.logger.log(`✅ Stock sync updated ${result.updated.length}, skipped ${result.skipped.length}`);
    } catch (error: any) {
      this.logger.error('❌ Error during stock sync:', error?.message || error);
    }
  }

  // 🟢 Sync orders to CLD
  @Cron('0 0 */4 * * *') // runs at minute 0, every 4th hour
  async handleOrdersSync() {
    if (!this.isEnabled('CRON_ORDERS_TO_CLD')) return;

    this.logger.log(`⏰ Running orders-to-cld sync at ${new Date().toLocaleTimeString()}`);
    try {
      await this.syncService.syncAllOrderToCLD(50);
      this.logger.log('✅ Orders-to-CLD sync completed successfully.');
    } catch (error: any) {
      this.logger.error('❌ Error during orders sync:', error?.message || error);
    }
  }

}
