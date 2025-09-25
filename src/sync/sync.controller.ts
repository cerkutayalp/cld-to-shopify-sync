import { Controller, Get, Post, Body } from "@nestjs/common";
import { ShopifyStockSyncService } from "./sync.service";
import { CldService } from '../cld/cld.service';
import { ShipmentStatusService, ShipmentStatusPayload } from "../cld/Dto/shipment-status.service";

@Controller("shopify")
export class SyncController {
  constructor(private readonly syncService: ShopifyStockSyncService, private readonly CldService: CldService , private readonly shipmentStatusService: ShipmentStatusService,) {}

  @Get("sync-stock")
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

  // Send all CLD product to Shopify 
  @Post('send-all-products')
  async sendAllProducts() {
    try {
      await this.CldService.sendAllProductsToShopify();
      return { status: 'success', message: 'All products sent to Shopify (excluding existing ones).' };
    } catch (error: any) {
      console.error('💥 Error in sendAllProducts:', error);
      return {
        status: 'error',
        message: error?.message || 'Unknown error while sending all products',
      };
    }
  }

  // ✅ Test endpoint for shipment status payload
 @Post("shipment-status")
async ShipmentStatus(@Body() payload: ShipmentStatusPayload) {
  console.log(payload, "pppp")
  const data = await this.shipmentStatusService.handleCldWebhook(payload);
  console.log("DDD", data)
  return data
}

}
