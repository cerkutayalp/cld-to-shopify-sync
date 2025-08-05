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

//   async syncAllStockFromCLD(dryRun = false): Promise<StockSyncResult> {
//     const updated: StockSyncResult['updated'] = [];
//     const skipped: StockSyncResult['skipped'] = [];

//     try {
//       const locationsRes = await axios.get(
//         `${this.shopifyApiUrl}/admin/api/2023-10/locations.json`,
//         { headers: { 'X-Shopify-Access-Token': this.shopifyToken } }
//       );
//       const locationId = locationsRes.data.locations[0]?.id;
//       if (!locationId) throw new Error('No Shopify location found');

//       // Fetch all Shopify products with pagination
//       const shopifyVariantsMap = new Map<string, any>();
//       let pageInfo = '';
//       do {
//         const res = await axios.get(
//           `${this.shopifyApiUrl}/admin/api/2023-10/products.json?limit=250${pageInfo}`,
//           { headers: { 'X-Shopify-Access-Token': this.shopifyToken } }
//         );

//         const linkHeader = res.headers['link'];
//         const nextPageMatch = linkHeader?.match(/<([^>]+)>;\s*rel="next"/);
//         pageInfo = nextPageMatch ? `&page_info=${new URL(nextPageMatch[1]).searchParams.get('page_info')}` : '';

//         for (const product of res.data.products) {
//           for (const variant of product.variants) {
//             if (variant.sku) {
//               shopifyVariantsMap.set(variant.sku.trim().toLowerCase(), {
//                 productId: product.id,
//                 variantId: variant.id,
//                 inventoryItemId: variant.inventory_item_id,
//                 fulfillmentService: variant.fulfillment_service,
//                 inventoryManagement: variant.inventory_management,
//               });
//             }
//           }
//         }
//       } while (pageInfo);

//       console.log(`📦 Fetched ${shopifyVariantsMap.size} Shopify variants.`);
      

//       // Fetch CLD stock
//       const cldProductMap = new Map<string, Product>();
//       for await (const page of this.cldService.getStockList()) {
//         for (const cldProduct of page) {
//           cldProductMap.set(cldProduct.identifier.trim().toLowerCase(), cldProduct);
//         }
//       }

//       console.log(`🔄 Syncing stock for ${cldProductMap.size} CLD products.`);
//       console.log('🛠 Sample Shopify SKUs:', Array.from(shopifyVariantsMap.keys()).slice(0, 5));
// console.log('📦 Sample CLD SKUs:', Array.from(cldProductMap.keys()).slice(0, 5));

// // TEMP TEST OVERRIDE — inject Shopify SKU manually
// cldProductMap.set('70463', {
//   identifier: '70463',
//   stock: 99,
// } as Product);

      

//       for (const [sku, cldProduct] of cldProductMap) {
//         const normalizedSku = sku.trim().toLowerCase();
//         const variantData = shopifyVariantsMap.get(normalizedSku);
//         if (!variantData) {
//           skipped.push({ sku, reason: 'No matching Shopify variant' });
//           continue;
//         }

//         const {
//           variantId,
//           inventoryItemId,
//           fulfillmentService,
//           inventoryManagement,
//           productId,
//         } = variantData;

//         if (fulfillmentService !== 'manual') {
//           skipped.push({ sku, reason: `Fulfillment service '${fulfillmentService}'` });
//           continue;
//         }

//         if (!inventoryManagement) {
//           try {
//             await axios.put(
//               `${this.shopifyApiUrl}/admin/api/2023-10/variants/${variantId}.json`,
//               {
//                 variant: {
//                   id: variantId,
//                   inventory_management: 'shopify',
//                 },
//               },
//               {
//                 headers: {
//                   'X-Shopify-Access-Token': this.shopifyToken,
//                   'Content-Type': 'application/json',
//                 },
//               }
//             );
//             console.log(`🛠️ Enabled inventory_management for SKU ${sku}`);
//           } catch (err: any) {
//             skipped.push({ sku, reason: 'Failed to enable inventory_management', error: err.message });
//             continue;
//           }
//         }

//         try {
//           const levelsRes = await axios.get(
//             `${this.shopifyApiUrl}/admin/api/2023-10/inventory_levels.json`,
//             {
//               headers: { 'X-Shopify-Access-Token': this.shopifyToken },
//               params: { inventory_item_ids: inventoryItemId },
//             }
//           );
//           if (levelsRes.data.inventory_levels.length > 1) {
//             skipped.push({ sku, reason: 'Assigned to multiple locations' });
//             continue;
//           }
//         } catch (err: any) {
//           skipped.push({ sku, reason: 'Failed to check inventory levels', error: err.message });
//           continue;
//         }

//         try {
//           await axios.post(
//             `${this.shopifyApiUrl}/admin/api/2023-10/inventory_levels/set.json`,
//             {
//               location_id: locationId,
//               inventory_item_id: inventoryItemId,
//               available: cldProduct.stock,
//             },
//             {
//               headers: {
//                 'X-Shopify-Access-Token': this.shopifyToken,
//                 'Content-Type': 'application/json',
//               },
//             }
//           );

//           updated.push({
//             sku,
//             stock: cldProduct.stock,
//             shopifyProductId: productId,
//             shopifyVariantId: variantId,
//           });

//           console.log(`✅ Updated SKU ${sku} → stock ${cldProduct.stock}`);
//         } catch (err: any) {
//           skipped.push({ sku, reason: 'Stock update failed', error: err.message });
//         }
//       }

//       console.log(`🔁 Sync complete → ✅ ${updated.length} updated, ⏭️ ${skipped.length} skipped`);
//       return { updated, skipped };
//     } catch (err: any) {
//       console.error('💥 Critical sync failure:', err.message);
//       throw new Error(err.message || 'Unknown error during stock sync');
//     }
//   }

async syncAllStockFromCLD(dryRun = false): Promise<StockSyncResult> {
  const updated: StockSyncResult['updated'] = [];
  const skipped: StockSyncResult['skipped'] = [];

  try {
    // Step 1: Get Shopify location
    const locationRes = await axios.get(
      `${this.shopifyApiUrl}/admin/api/2023-10/locations.json`,
      { headers: { 'X-Shopify-Access-Token': this.shopifyToken } }
    );
    const locationId = locationRes.data.locations[0]?.id;
    if (!locationId) throw new Error('No Shopify location found');

    // Step 2: Load all Shopify variants with SKUs
    const shopifyVariantsMap = new Map<string, any>();
    let pageInfo = '';

    do {
      const res = await axios.get(
        `${this.shopifyApiUrl}/admin/api/2023-10/products.json?limit=250${pageInfo}`,
        { headers: { 'X-Shopify-Access-Token': this.shopifyToken } }
      );

      const linkHeader = res.headers['link'];
      const nextPageMatch = linkHeader?.match(/<([^>]+)>;\s*rel="next"/);
      pageInfo = nextPageMatch
        ? `&page_info=${new URL(nextPageMatch[1]).searchParams.get('page_info')}`
        : '';

      for (const product of res.data.products) {
        for (const variant of product.variants) {
          const sku = variant.sku?.trim().toLowerCase();
          if (!sku) {
            skipped.push({ sku: '', reason: 'Missing SKU' });
            continue;
          }

          shopifyVariantsMap.set(sku, {
            sku,
            productId: product.id,
            variantId: variant.id,
            inventoryItemId: variant.inventory_item_id,
            inventoryManagement: variant.inventory_management,
            fulfillmentService: variant.fulfillment_service,
          });
        }
      }
    } while (pageInfo);

    console.log(`📦 Loaded ${shopifyVariantsMap.size} Shopify variants with SKUs.`);

    // Step 3: Get CLD stock only for SKUs found in Shopify
    const cldProductMap = new Map<string, Product>();
    const cldStockStream = this.cldService.getStockList();
    for await (const page of cldStockStream) {
      for (const cldProduct of page) {
        const sku = cldProduct.identifier?.trim().toLowerCase();
        if (sku && shopifyVariantsMap.has(sku)) {
          cldProductMap.set(sku, cldProduct);
        }
      }
    }

    console.log(`📥 Found ${cldProductMap.size} matching CLD products.`);

    // Step 4: Perform stock sync or dry run
    for (const [sku, variantData] of shopifyVariantsMap) {
      const cldProduct = cldProductMap.get(sku);
      if (!cldProduct) {
        skipped.push({ sku, reason: 'Not found in CLD' });
        continue;
      }

      const {
        productId,
        variantId,
        inventoryItemId,
        fulfillmentService,
        inventoryManagement,
      } = variantData;

      if (fulfillmentService !== 'manual') {
        skipped.push({ sku, reason: `Fulfillment service: ${fulfillmentService}` });
        continue;
      }

      if (!inventoryManagement && !dryRun) {
        try {
          await axios.put(
            `${this.shopifyApiUrl}/admin/api/2023-10/variants/${variantId}.json`,
            { variant: { id: variantId, inventory_management: 'shopify' } },
            {
              headers: {
                'X-Shopify-Access-Token': this.shopifyToken,
                'Content-Type': 'application/json',
              },
            }
          );
          console.log(`🛠️ Enabled inventory_management for SKU ${sku}`);
        } catch (err: any) {
          skipped.push({ sku, reason: 'Enable inventory_management failed', error: err.message });
          continue;
        }
      }

      if (dryRun) {
        let currentStock: number | string = 'unknown';
        try {
          const inventoryLevelRes = await axios.get(
            `${this.shopifyApiUrl}/admin/api/2023-10/inventory_levels.json`,
            {
              headers: { 'X-Shopify-Access-Token': this.shopifyToken },
              params: { inventory_item_ids: inventoryItemId },
            }
          );

          const level = inventoryLevelRes.data.inventory_levels?.[0];
          if (level) currentStock = level.available;
        } catch (err: any) {
          console.warn(`⚠️ Failed to fetch current stock for SKU ${sku}: ${err.message}`);
        }

        console.log(`🔎 [Dry Run] SKU ${sku} → current: ${currentStock}, new: ${cldProduct.stock}`);
      } else {
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
          console.log(`✅ Updated SKU ${sku} → stock ${cldProduct.stock}`);
        } catch (err: any) {
          skipped.push({ sku, reason: 'Stock update failed', error: err.message });
          continue;
        }
      }

      updated.push({
        sku,
        stock: cldProduct.stock,
        shopifyProductId: productId,
        shopifyVariantId: variantId,
      });
    }

    console.log(
      `🔁 Sync complete (${dryRun ? 'Dry Run' : 'Live'}) → ✅ ${updated.length} updated, ⏭️ ${skipped.length} skipped`
    );

    return { updated, skipped };
  } catch (err: any) {
    console.error('💥 Sync failed:', err.message);
    throw new Error(err.message || 'Unknown error during stock sync');
  }
}


}
