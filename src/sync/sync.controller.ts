import { Controller, Get, Post, Body, Query, Param  } from "@nestjs/common";
import { ShopifyStockSyncService } from "./sync.service";
import { CldService } from '../cld/cld.service';
import { ShopifyService } from "src/shopify/shopify.service";
import { ShipmentStatusService, ShipmentStatusPayload } from "../cld/Dto/shipment-status.service";

@Controller("shopify")
export class SyncController {
  constructor(private readonly syncService: ShopifyStockSyncService, 
  private readonly CldService: CldService ,
  private readonly ShopifyService: ShopifyService ,
  private readonly shipmentStatusService: ShipmentStatusService,
  ){}


  // Send all CLD product to Shopify 
  @Post('send-all-products')
  async sendAllProducts() {
    try {
      await this.ShopifyService.sendAllProductsToShopify();
      return { status: 'success', message: 'All products sent to Shopify (excluding existing ones).' };
    } catch (error: any) {
      console.error('💥 Error in sendAllProducts:', error);
      return {
        status: 'error',
        message: error?.message || 'Unknown error while sending all products',
      };
    }
  }

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


// send all shopify Order to Cld
  @Get('orders-to-cld')
async syncOrdersToCLD(@Query('limit') limit = 50) {
  const orders = await this.syncService.syncAllOrderToCLD(+limit);
  return { orders };
}

  // ✅ Test endpoint for shipment status payload
 @Post("shipment-status")
async ShipmentStatus(@Body() payload: ShipmentStatusPayload) {
  console.log(payload, "pppp")
  const data = await this.shipmentStatusService.handleCldWebhook(payload);
  console.log("DDD", data)
  return data
}

@Post("send-to-shopify/:id")
  async sendProductToShopifyById(@Param("id") id: string) {
    console.log(`🧩 Request received to send CLD product ${id} to Shopify`);

    const result = await this.ShopifyService.sendProductByIdToShopify(id);

    if (!result) {
      return {
        success: false,
        message: `Failed to send product ${id} to Shopify.`,
      };
    }

    return {
      success: true,
      message: `✅ Product ${id} successfully sent to Shopify.`,
      data: result,
    };
  }

}
