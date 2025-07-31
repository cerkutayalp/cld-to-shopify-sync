import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { CldService } from '../cld/cld.service';
import { ConfigService } from '@nestjs/config';
import { Product } from '../cld/Dto/CldProductResponse';

type StockSyncResult = {
  updated: {
    sku: string;
    stock: number;
    shopifyProductId: number;
    shopifyVariantId: number;
  }[];
  skipped: {
    sku: string;
    reason: string;
    error?: string;
  }[];
};

@Injectable()
export class ShopifyStockSyncService {
  private readonly shopifyApiUrl: string;
  private readonly shopifyToken: string;

  constructor(
    private configService: ConfigService,
    private cldService: CldService,
  ) {
    this.shopifyApiUrl = configService.get<string>('SHOPIFY_API_URL')!;
    this.shopifyToken = configService.get<string>('SHOPIFY_ACCESS_TOKEN')!;
  }

  async syncAllStockFromCLD(): Promise<StockSyncResult> {
    const updated: StockSyncResult['updated'] = [];
    const skipped: StockSyncResult['skipped'] = [];

    try {
      // 1️⃣ Get Shopify location
      const locationsRes = await axios.get(
        `${this.shopifyApiUrl}/admin/api/2023-10/locations.json`,
        {
          headers: { 'X-Shopify-Access-Token': this.shopifyToken },
        }
      );
      const locationId = locationsRes.data.locations[0]?.id;
      if (!locationId) throw new Error('No Shopify location found');

      // 2️⃣ Collect CLD product map
      const cldProductMap = new Map<string, Product>();
      for await (const page of this.cldService.getStockList()) {
        for (const cldProduct of page) {
          cldProductMap.set(cldProduct.identifier, cldProduct);
        }
      }

      console.log(`🔄 Syncing stock for ${cldProductMap.size} CLD products.`);

      // 3️⃣ Get Shopify products
      const shopifyProductsRes = await axios.get(
        `${this.shopifyApiUrl}/admin/api/2023-10/products.json?limit=250`,
        {
          headers: { 'X-Shopify-Access-Token': this.shopifyToken },
        }
      );
      const shopifyProducts = shopifyProductsRes.data.products;

      for (const product of shopifyProducts) {
        for (const variant of product.variants) {
          const cldProduct = cldProductMap.get(variant.sku);
          if (!cldProduct) continue;

          const variantId = variant.id;
          const inventoryItemId = variant.inventory_item_id;

          // 🔁 Check if fulfillment service is allowed
          if (variant.fulfillment_service !== 'manual') {
            skipped.push({
              sku: variant.sku,
              reason: `Fulfillment service '${variant.fulfillment_service}'`,
            });
            continue;
          }

          // 🔁 If not inventory-managed → enable it
          if (!variant.inventory_management) {
            try {
              await axios.put(
                `${this.shopifyApiUrl}/admin/api/2023-10/variants/${variantId}.json`,
                {
                  variant: {
                    id: variantId,
                    inventory_management: 'shopify',
                  },
                },
                {
                  headers: {
                    'X-Shopify-Access-Token': this.shopifyToken,
                    'Content-Type': 'application/json',
                  },
                }
              );
              console.log(`🛠️ Enabled inventory_management for SKU ${variant.sku}`);
            } catch (err: any) {
              skipped.push({
                sku: variant.sku,
                reason: 'Failed to enable inventory_management',
                error: err.message,
              });
              continue;
            }
          }

          // 🔁 Check if assigned to multiple locations
          try {
            const inventoryLevelsRes = await axios.get(
              `${this.shopifyApiUrl}/admin/api/2023-10/inventory_levels.json`,
              {
                headers: {
                  'X-Shopify-Access-Token': this.shopifyToken,
                },
                params: {
                  inventory_item_ids: inventoryItemId,
                },
              }
            );

            if (inventoryLevelsRes.data.inventory_levels.length > 1) {
              skipped.push({
                sku: variant.sku,
                reason: 'Assigned to multiple locations',
              });
              continue;
            }
          } catch (err: any) {
            skipped.push({
              sku: variant.sku,
              reason: 'Failed to fetch inventory_levels',
              error: err.message,
            });
            continue;
          }

          // ✅ Set stock
          try {
            await axios.post(
              `${this.shopifyApiUrl}/admin/api/2023-10/inventory_levels/set.json`,
              {
                location_id: locationId,
                inventory_item_id: inventoryItemId,
                available: cldProduct.stock,
              },
              {
                headers: {
                  'X-Shopify-Access-Token': this.shopifyToken,
                  'Content-Type': 'application/json',
                },
              }
            );

            updated.push({
              sku: variant.sku,
              stock: cldProduct.stock,
              shopifyProductId: product.id,
              shopifyVariantId: variant.id,
            });

            console.log(`✅ Updated SKU ${variant.sku} → stock ${cldProduct.stock}`);
          } catch (err: any) {
            skipped.push({
              sku: variant.sku,
              reason: 'Stock update failed',
              error: err.message,
            });
            continue;
          }
        }
      }

      console.log(`🔁 Sync complete → ✅ ${updated.length} updated, ⏭️ ${skipped.length} skipped`);
      return { updated, skipped };
    } catch (err: any) {
      console.error('💥 Critical sync failure:', err.message);
      throw new Error(err.message || 'Unknown error during stock sync');
    }
  }
}
