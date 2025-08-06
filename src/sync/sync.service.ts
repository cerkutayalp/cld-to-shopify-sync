import { Injectable } from "@nestjs/common";
import axios from "axios";
import { CldService } from "../cld/cld.service";
import { ConfigService } from "@nestjs/config";
import { Product } from "../cld/Dto/CldProductResponse";

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
    product?: Product;
  }[];
};

@Injectable()
export class ShopifyStockSyncService {
  private readonly shopifyApiUrl: string;
  private readonly shopifyToken: string;

  constructor(
    private configService: ConfigService,
    private cldService: CldService
  ) {
    this.shopifyApiUrl = configService.get<string>("SHOPIFY_API_URL")!;
    this.shopifyToken = configService.get<string>("SHOPIFY_ACCESS_TOKEN")!;
  }
  // TODO MOVE TO SHOPIFY_SERVICE
  async *getShopifyProductsPaginated() {
    const shopifyVariantsMap = new Map<string, any>();
    let pageInfo = "";
    do {
      console.log("📦 Fetching Shopify products... for pageInfo= ", pageInfo);
      const res = await axios.get(
        `${this.shopifyApiUrl}/admin/api/2023-10/products.json?limit=250${pageInfo}`,
        { headers: { "X-Shopify-Access-Token": this.shopifyToken } }
      );

      const linkHeader = res.headers["link"];
      const nextPageMatch = linkHeader?.match(/<([^>]+)>;\s*rel="next"/);
      pageInfo = nextPageMatch
        ? `&page_info=${new URL(nextPageMatch[1]).searchParams.get(
            "page_info"
          )}`
        : "";
      yield res.data.products;
    } while (pageInfo);

    console.log(
      `📦 Loaded ${shopifyVariantsMap.size} Shopify variants with SKUs.`
    );
    return shopifyVariantsMap;
  }
  // TODO MOVE TO SHOPIFY_SERVICE

  async enableInventoryManagement(
    sku: string,
    variantId: number
  ): Promise<void> {
    const response = await axios.put(
      `${this.shopifyApiUrl}/admin/api/2023-10/variants/${variantId}.json`,
      { variant: { id: variantId, inventory_management: "shopify" } },
      {
        headers: {
          "X-Shopify-Access-Token": this.shopifyToken,
          "Content-Type": "application/json",
        },
      }
    );
    // console.log(
    //   `🛠️ Enabled inventory_management for SKU ${sku} Response `,
    //   response.data?.inventory_management
    // );
    return response.data?.inventory_management;
  }

  // TODO MOVE TO SHOPIFY_SERVICE
  //TODO Use Bulk stock request
  async updateShopifyVariantStockHandler({
    shopifyProducts,
    locationId,
    cldStocks,
  }: {
    shopifyProducts: any;
    locationId: string;
    cldStocks: Product[];
  }) {
    console.log(
      `📦 Executing updateShopifyVariantStockHandler for location ${locationId}`
    );
    for (const shopifyProduct of shopifyProducts) {
      //  product variants
      for (const variant of shopifyProduct.variants) {
        const { sku, inventory_item_id, id } = variant;
        const cldStock = cldStocks.find((x) => x.identifier === sku);
        console.log(
          `🔄 Processing SKU ${sku} → inventory_item_id ${inventory_item_id} with stock ${cldStock?.stock}`
        );

        const resp = await this.updateShopifyVariantStock({
          inventoryItemId: inventory_item_id,
          locationId,
          cldStock: cldStock?.stock || 0,
          sku: sku,
        });
        console.log(
          `✅ Updated SKU ${sku} → inventory_item_id ${inventory_item_id} with stock ${cldStock?.stock}`,
          resp
        );
        process.exit(0);
      }
    }
  }
  // TODO MOVE TO SHOPIFY_SERVICE

  async updateShopifyVariantStock({
    sku,
    locationId,
    inventoryItemId,
    cldStock,
  }: {
    sku: string;
    locationId: string;
    inventoryItemId: number;
    cldStock: number;
  }) {
    console.log(
      `updateShopifyVariantStock: inventoryItemId:${inventoryItemId} SKU:${sku} stock ${cldStock}`
    );

    const response = await axios.post(
      `${this.shopifyApiUrl}/admin/api/2023-10/inventory_levels/set.json`,
      {
        location_id: locationId,
        inventory_item_id: inventoryItemId,
        available: cldStock,
      },
      {
        headers: {
          "X-Shopify-Access-Token": this.shopifyToken,
          "Content-Type": "application/json",
        },
      }
    );
    if (response.data?.errors) {
      console.error(`updateShopifyVariantStock ❌ Error updating stock for SKU ${sku}: Error`, response.data.errors);
    }
    else{

    }
    // TODO WRITE LOGS FS
    console.log(`updateShopifyVariantStock SKU:${sku} `, response.data);
    return response.data;
  }

  async syncAllStockFromCLD(): Promise<StockSyncResult> {
    const updated: StockSyncResult["updated"] = [];
    const skipped: StockSyncResult["skipped"] = [];

    try {
      // Step 1: Get Shopify location
      const locationRes = await axios.get(
        `${this.shopifyApiUrl}/admin/api/2023-10/locations.json`,
        { headers: { "X-Shopify-Access-Token": this.shopifyToken } }
      );
      const locationId = locationRes.data.locations[0]?.id;
      if (!locationId) throw new Error("No Shopify location found");

      // Step 2: Load all Shopify variants with SKUs
      for await (const shopifyProducts of this.getShopifyProductsPaginated()) {
        console.log(
          ` Processing ${shopifyProducts.length} Shopify products\n`,
          JSON.stringify(shopifyProducts)
        );
        let ids: string[] = [];
        // multiple shopifyProducts
        for (const shopifyProduct of shopifyProducts) {
          //  product variants
          for (const variant of shopifyProduct.variants) {
            const { inventory_management, sku, id } = variant;
            if (sku) {
              ids.push(sku);
              if (!inventory_management) {
                const enabledInventoryResp =
                  await this.enableInventoryManagement(sku, id);
                console.log(
                  `🛠️ Enable=${enabledInventoryResp} inventory_management for SKU ${sku}`
                );
              }
            } else {
              console.warn(
                `⚠️ Missing SKU for variant ${id} in product ${shopifyProduct.id}. Skipping.`
              );
              skipped.push({
                sku: sku,
                reason:
                  "Sku is missing in Shopify product variant, check below shopify 'product' for details",
                product: shopifyProduct,
              });
            }
          }
        } //end for shopify products loop

        const cldStocks = await this.cldService.getStockListByIds(ids);
        console.log(
          `📥Stocks Found ${cldStocks.length} matching CLD products.`,
          cldStocks
        );
        // TODO MUST REPLACE WITH BULK UPDATE
        this.updateShopifyVariantStockHandler({
          shopifyProducts,
          locationId,
          cldStocks,
        });
      }

      console.log(
        `🔁 Sync complete  → ✅ ${updated.length} updated, ⏭️ ${skipped.length} skipped`
      );

      return { updated, skipped };
    } catch (err: any) {
      console.error("💥 Sync failed:", err.message);
      throw new Error(err.message || "Unknown error during stock sync");
    }
  }
}
