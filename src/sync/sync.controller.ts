import { Controller, Get } from '@nestjs/common';
import { ShopifyStockSyncService } from './sync.service';

@Controller('shopify')
export class SyncController {
  constructor(private readonly syncService: ShopifyStockSyncService) {}

  @Get('sync-stock')
  async syncStock() {
    const result = await this.syncService.syncAllStockFromCLD();
    return {
       dryRun: true,
    updatedCount: result.updated.length,
    skippedCount: result.skipped.length,
      message: `✅ Synced ${result.updated.length} products.`,
      updated: result.updated,
      skipped: result.skipped,
    };
  }
}
