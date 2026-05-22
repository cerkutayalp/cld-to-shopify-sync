import { Injectable } from "@nestjs/common";
import axios from "axios";
import { CldService } from "../cld/cld.service";
import { ConfigService } from "@nestjs/config";
import { Product } from "../cld/Dto/CldProductResponse";
import { LoggerService } from "../logger/logger.service";
import { ShopifyService } from "../../src/shopify/shopify.service";
import { OrderPayload } from "../cld/Dto/OrderPayload";
import { ShopifyOrder } from "../shopify/Dto/ShopifyOrderResponse";
import { mapShopifyOrderToCldOrderPayload } from "./mapper/shopify.to.cld.order.mapper";

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
  private readonly cldWarehouseId: string;
  private readonly shopifyChannel: string;
  private readonly channel: string;

  constructor(
    private configService: ConfigService,
    private cldService: CldService,
    private loggerService: LoggerService,
    private shopifyService: ShopifyService,
  ) {
    this.shopifyApiUrl = configService.get<string>("SHOPIFY_API_URL")!;
    this.shopifyToken = configService.get<string>("SHOPIFY_ACCESS_TOKEN")!;
    this.cldWarehouseId = configService.get<string>("SHOPIFY_LOCATION_ID")!;
    this.channel = this.configService.get<string>("SHOPIFY_STORE") || "";
    this.shopifyChannel = configService.get<string>("SHOPIFY_WEB_ADDRESS") || this.shopifyApiUrl;

  }


  // TODO MOVE TO SHOPIFY_SERVICE
  async *getShopifyProductsPaginated() {
    const shopifyVariantsMap = new Map<string, any>();
    let pageInfo = "";
    do {
      console.log("📦 Fetching Shopify products... for pageInfo= ", pageInfo);
      const res = await axios.get(
        `${this.shopifyApiUrl}/admin/api/2023-10/products.json?limit=250${pageInfo}`,
        { headers: { "X-Shopify-Access-Token": this.shopifyToken } },
      );

      const linkHeader = res.headers["link"];
      const nextPageMatch = linkHeader?.match(/<([^>]+)>;\s*rel="next"/);
      pageInfo = nextPageMatch
        ? `&page_info=${new URL(nextPageMatch[1]).searchParams.get(
            "page_info",
          )}`
        : "";
      yield res.data.products;
    } while (pageInfo);

    console.log(
      `📦 Loaded ${shopifyVariantsMap.size} Shopify variants with SKUs.`,
    );
    return shopifyVariantsMap;
  }

  async enableInventoryManagement(
    sku: string,
    variantId: number,
  ): Promise<void> {
    const response = await axios.put(
      `${this.shopifyApiUrl}/admin/api/2023-10/variants/${variantId}.json`,
      { variant: { id: variantId, inventory_management: "shopify" } },
      {
        headers: {
          "X-Shopify-Access-Token": this.shopifyToken,
          "Content-Type": "application/json",
        },
      },
    );
    // console.log(
    //   `🛠️ Enabled inventory_management for SKU ${sku} Response `,
    //   response.data?.inventory_management
    // );
    return response.data?.inventory_management;
  }

  async getInventoryLevels(inventoryItemId: number): Promise<any[]> {
    const res = await axios.get(
      `${this.shopifyApiUrl}/admin/api/2023-10/inventory_levels.json?inventory_item_ids=${inventoryItemId}`,
      {
        headers: {
          "X-Shopify-Access-Token": this.shopifyToken,
        },
      },
    );
    return res.data.inventory_levels || [];
  }

  async getAllShopifyLocations(): Promise<
    { id: number; name: string; legacy: boolean; location_type: string }[]
  > {
    const res = await axios.get(
      `${this.shopifyApiUrl}/admin/api/2023-10/locations.json`,
      {
        headers: {
          "X-Shopify-Access-Token": this.shopifyToken,
        },
      },
    );
    return res.data.locations;
  }

  /**
   * Bulk activate inventory items at a location using GraphQL
   * This connects items to the location so stock can be set
   */
  async bulkActivateInventoryAtLocation(
    inventoryItemIds: number[],
    locationId: number,
  ): Promise<{ success: boolean; errors: any[] }> {
    if (inventoryItemIds.length === 0) {
      return { success: true, errors: [] };
    }

    const BATCH_SIZE = 100;
    const allErrors: any[] = [];

    for (let i = 0; i < inventoryItemIds.length; i += BATCH_SIZE) {
      const batch = inventoryItemIds.slice(i, i + BATCH_SIZE);
      console.log(
        `📦 Activating inventory batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} items) at location ${locationId}`,
      );

      const inventoryItemUpdates = batch.map((id) => ({
        inventoryItemId: `gid://shopify/InventoryItem/${id}`,
        activate: true,
      }));

      const mutation = `
        mutation inventoryBulkToggleActivation($inventoryItemUpdates: [InventoryBulkToggleActivationInput!]!, $locationId: ID!) {
          inventoryBulkToggleActivation(inventoryItemUpdates: $inventoryItemUpdates, locationId: $locationId) {
            inventoryLevels {
              id
              quantities(names: ["available"]) {
                name
                quantity
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const variables = {
        locationId: `gid://shopify/Location/${locationId}`,
        inventoryItemUpdates,
      };

      try {
        const response = await axios.post(
          `${this.shopifyApiUrl}/admin/api/2023-10/graphql.json`,
          { query: mutation, variables },
          {
            headers: {
              "X-Shopify-Access-Token": this.shopifyToken,
              "Content-Type": "application/json",
            },
          },
        );

        const result = response.data?.data?.inventoryBulkToggleActivation;
        const userErrors = result?.userErrors || [];

        if (userErrors.length > 0) {
          console.warn(`⚠️ Activation userErrors (may be already active):`, userErrors);
          // Don't treat "already active" as fatal errors
          const fatalErrors = userErrors.filter(
            (err: any) => !err.message?.includes("already stocked"),
          );
          if (fatalErrors.length > 0) {
            allErrors.push(...fatalErrors);
          }
        } else {
          console.log(
            `✅ Activation batch ${Math.floor(i / BATCH_SIZE) + 1} completed`,
          );
        }

        if (i + BATCH_SIZE < inventoryItemIds.length) {
          await this.delay(500);
        }
      } catch (error: any) {
        console.error(`❌ Activation failed for batch:`, error.message);
        allErrors.push({ message: error.message, batch: i / BATCH_SIZE + 1 });
      }
    }

    return { success: allErrors.length === 0, errors: allErrors };
  }

  /**
   * Bulk update inventory quantities using Shopify GraphQL API
   * Updates up to 100 items per batch
   */
  async bulkSetInventoryQuantities(
    items: { inventoryItemId: number; quantity: number; sku: string }[],
    locationId: number,
  ): Promise<{ success: boolean; errors: any[] }> {
    if (items.length === 0) {
      return { success: true, errors: [] };
    }

    const BATCH_SIZE = 100;
    const allErrors: any[] = [];

    // Process in batches of 100
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE);
      console.log(
        `📦 Bulk updating inventory batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} items)`,
      );

      const quantities = batch.map((item) => ({
        inventoryItemId: `gid://shopify/InventoryItem/${item.inventoryItemId}`,
        locationId: `gid://shopify/Location/${locationId}`,
        quantity: item.quantity,
      }));

      const mutation = `
        mutation inventorySetQuantities($input: InventorySetQuantitiesInput!) {
          inventorySetQuantities(input: $input) {
            inventoryAdjustmentGroup {
              createdAt
              reason
              changes {
                name
                delta
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const variables = {
        input: {
          name: "available",
          reason: "correction",
          ignoreCompareQuantity: true,
          quantities,
        },
      };

      try {
        const response = await axios.post(
          `${this.shopifyApiUrl}/admin/api/2023-10/graphql.json`,
          { query: mutation, variables },
          {
            headers: {
              "X-Shopify-Access-Token": this.shopifyToken,
              "Content-Type": "application/json",
            },
          },
        );

        const result = response.data?.data?.inventorySetQuantities;
        const userErrors = result?.userErrors || [];

        if (userErrors.length > 0) {
          console.error(`⚠️ GraphQL userErrors:`, userErrors);
          allErrors.push(...userErrors);

          // Log each error
          userErrors.forEach((err: any) => {
            this.loggerService.logStockSync(
              "ERROR",
              { batch: i / BATCH_SIZE + 1, field: err.field },
              err.message,
            );
          });
        } else {
          console.log(
            `✅ Batch ${Math.floor(i / BATCH_SIZE) + 1} updated successfully`,
          );

          // Log success for each item in batch
          batch.forEach((item) => {
            this.loggerService.logStockSync(
              "UPDATE",
              {
                sku: item.sku,
                inventoryItemId: item.inventoryItemId,
                stock: item.quantity,
                locationId,
              },
              `Bulk updated stock to ${item.quantity}`,
            );
          });
        }

        // Small delay between batches to respect rate limits
        if (i + BATCH_SIZE < items.length) {
          await this.delay(500);
        }
      } catch (error: any) {
        console.error(`❌ Bulk update failed for batch:`, error.message);
        allErrors.push({ message: error.message, batch: i / BATCH_SIZE + 1 });

        this.loggerService.logStockSync(
          "ERROR",
          { batch: i / BATCH_SIZE + 1 },
          `Bulk update failed: ${error.message}`,
        );
      }
    }

    return { success: allErrors.length === 0, errors: allErrors };
  }

  /**
   * Collect matching variants and update stock in bulk via GraphQL
   */
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
      `📦 Executing updateShopifyVariantStockHandler (BULK) for location ${locationId}`,
    );

    // Collect all items to update
    const itemsToUpdate: { inventoryItemId: number; quantity: number; sku: string }[] = [];

    for (const shopifyProduct of shopifyProducts) {
      for (const variant of shopifyProduct.variants) {
        const { sku, inventory_item_id, id } = variant;

        const cldProduct = cldStocks.find((x) => x.identifier === `${sku}`);
        if (cldProduct) {
          console.log(
            ` SKU: ${sku} | Variant ID: ${id} | CLD Stock: ${cldProduct?.stock}`,
          );

          itemsToUpdate.push({
            inventoryItemId: inventory_item_id,
            quantity: cldProduct?.stock || 0,
            sku: sku,
          });
        } else {
          console.log(
            ` SKU: ${sku} | Variant ID: ${id} | CLD Stock: Not found`,
          );

          this.loggerService.logStockSync(
            "SKIP",
            {
              sku,
              inventory_item_id,
            },
            "CLD Product not found for SKU",
          );
        }
      }
    }

    // Bulk update all collected items
    if (itemsToUpdate.length > 0) {
      const locationIdNum = parseInt(locationId, 10);

      // Step 1: Activate inventory items at location (connect them if not already)
      console.log(`📦 Activating ${itemsToUpdate.length} inventory items at location...`);
      const inventoryItemIds = itemsToUpdate.map((item) => item.inventoryItemId);
      await this.bulkActivateInventoryAtLocation(inventoryItemIds, locationIdNum);

      // Step 2: Set quantities
      console.log(`📦 Bulk updating ${itemsToUpdate.length} inventory items...`);
      const result = await this.bulkSetInventoryQuantities(
        itemsToUpdate,
        locationIdNum,
      );
      console.log(
        `📦 Bulk update complete: ${result.success ? "SUCCESS" : "PARTIAL FAILURE"}, ${result.errors.length} errors`,
      );
      return result;
    }

    return { success: true, errors: [] };
  }
// For individual updates (not used in bulk flow)
  async updateShopifyVariantStock({
    sku,
    // locationId,
    inventoryItemId,
    cldStock,
  }: {
    sku: string;
    // locationId: string;
    inventoryItemId: number;
    cldStock: number;
  }) {
    console.log(
      `update-shopify-variant-stock: inventoryItemId:${inventoryItemId} SKU:${sku} stock ${cldStock}`,
    );

    // Fetch all inventory levels for this item
    const levels = await this.getInventoryLevels(inventoryItemId);

    if (levels.length === 0) {
      // console.warn(`⚠️ No inventory levels found for SKU ${sku}. Skipping.`);
      this.loggerService.logStockSync(
        "SKIP",
        {
          sku,
          inventoryItemId,
        },
        "No inventory levels found",
      );

      return { error: "No inventory levels", sku };
    }

    const allLocations = await this.getAllShopifyLocations();

    const results = [];

    for (const level of levels) {
      const location = allLocations.find((loc) => loc.id === level.location_id);
      if (!location) {
        console.warn(
          `⚠️ Location not found for ID ${level.location_id}. Skipping.`,
        );
        continue;
      }

      try {
        const response = await axios.post(
          `${this.shopifyApiUrl}/admin/api/2023-10/inventory_levels/set.json`,
          {
            location_id: location.id,
            inventory_item_id: inventoryItemId,
            available: cldStock,
          },
          {
            headers: {
              "X-Shopify-Access-Token": this.shopifyToken,
              "Content-Type": "application/json",
            },
          },
        );

        // console.log(`✅ Updated SKU ${sku} to ${cldStock} at ${location.name} (ID: ${location.id})`, response.data);
        this.loggerService.logStockSync(
          "UPDATE",
          {
            sku,
            inventoryItemId,
            stock: cldStock,
            location: location.name,
          },
          `Updated stock to ${cldStock} at ${location.name}`,
        );

        results.push({ location: location.name, success: true });
      } catch (error: any) {
        this.loggerService.logStockSync(
          "ERROR",
          {
            sku,
            inventoryItemId,
            stock: cldStock,
            location: location.name,
            error: error.message,
          },
          `Failed to update stock at ${location.name}`,
        );
        results.push({
          location: location.name,
          success: false,
          error: error.message,
        });
      }
    }

    return { sku, updates: results };
  }

  async syncAllStockFromCLD(): Promise<StockSyncResult> {
    const updated: StockSyncResult["updated"] = [];
    const skipped: StockSyncResult["skipped"] = [];

    try {
      // Step 1: Get Shopify location
      const locationRes = await axios.get(
        `${this.shopifyApiUrl}/admin/api/2023-10/locations.json`,
        { headers: { "X-Shopify-Access-Token": this.shopifyToken } },
      );
      const locationId = locationRes.data.locations[0]?.id;
      if (!locationId) throw new Error("No Shopify location found");

      // Step 2: Load all Shopify variants with SKUs
      for await (const shopifyProducts of this.getShopifyProductsPaginated()) {
        // console.log(
        //   ` Processing ${shopifyProducts.length} Shopify products\n`,
        //   JSON.stringify(shopifyProducts)
        // );
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
                  `🛠️ Enable=${enabledInventoryResp} inventory_management for SKU ${sku}`,
                );
              }
            } else {
              // console.warn(
              //   `⚠️ Missing SKU for variant ${id} in product ${shopifyProduct.id}. Skipping.`
              // );
              this.loggerService.logStockSync(
                "SKIP",
                {
                  sku,
                  product: shopifyProduct,
                },
                "Missing SKU in Shopify product variant",
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
        // console.log(
        //   `📥 Fetching CLD stocks for ${ids.length} SKUs from Shopify products.`,
        //   ids
        // );

        const cldStocks = await this.cldService.getStocksByIds(ids);
        console.log(
          `📥Stocks Found ${cldStocks.length} matching CLD products.`,
          cldStocks,
        );
        await this.delay(3000); // wait 3s between requests
        // TODO MUST REPLACE WITH BULK UPDATE
        await this.updateShopifyVariantStockHandler({
          shopifyProducts,
          locationId,
          cldStocks,
        });
      }

      console.log(
        `🔁 Sync complete  → ✅ ${updated.length} updated, ⏭️ ${skipped.length} skipped`,
      );

      return { updated, skipped };
    } catch (err: any) {
      console.error("💥 Sync failed:", err.message);
      throw new Error(err.message || "Unknown error during stock sync");
    }
  }

  //fulfillment service
  async createShopifyFulfillment(order: ShopifyOrder) {
    console.log("🚀 Starting fulfillment for order:", order.id);

    // 1. Get fulfillment orders
    const fOrdersResp = await axios.get(
      `${this.shopifyApiUrl}/admin/api/2023-10/orders/${order.id}/fulfillment_orders.json`,
      { headers: { "X-Shopify-Access-Token": this.shopifyToken } },
    );
    const fOrders = fOrdersResp.data.fulfillment_orders;
    console.log("📦 Fulfillment orders:", JSON.stringify(fOrders, null, 2));

    if (!fOrders.length) {
      console.log("⚠️ No fulfillment orders found, cannot fulfill.");
      return;
    }

    // 2. Prepare payload
    const fulfillmentPayload = {
      fulfillment: {
        line_items_by_fulfillment_order: fOrders.map((fo: any) => ({
          fulfillment_order_id: fo.id,
          fulfillment_order_line_items: fo.line_items.map((li: any) => ({
            id: li.id,
            quantity: li.quantity,
          })),
        })),
      },
    };
    console.log(
      "📝 Fulfillment payload prepared:",
      JSON.stringify(fulfillmentPayload, null, 2),
    );

    // 3. Send fulfillment request
    try {
      const resp = await axios.post(
        `${this.shopifyApiUrl}/admin/api/2023-10/fulfillments.json`,
        fulfillmentPayload,
        {
          headers: {
            "X-Shopify-Access-Token": this.shopifyToken,
            "Content-Type": "application/json",
          },
        },
      );
      console.log("✅ Fulfillment created:", resp.data);
      return resp.data;
    } catch (err: any) {
      console.error("❌ Fulfillment request failed:", err.message);
      if (err.response) {
        console.error("❌ Shopify API error response:", err.response.data);
      }
      throw err;
    }
  }
  async delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  // send order to cld
  async syncAllOrderToCLD(page_size = 50) {
    for await (const batch of this.shopifyService.getOrdersPaginated(
      page_size,
    )) {
      for (const order of batch.orders) {
        // console.log(`\n📦 Processing Shopify order ${order.id}`);
        // console.log("🧾 Full Shopify order data:", JSON.stringify(order, null, 2));

        try {
          // ------------------------
          // 1. SKIP CANCELLED ORDERS
          // ------------------------
          if (order.cancel_reason !== null || order.cancelled_at !== null) {
            console.log(
              `Its a canceled shopify order is skipping order ${order.id} (cancelled in Shopify).`,
            );
            this.loggerService.logOrderAction(
              "SKIPPED",
              order,
              "Order cancelled in Shopify",
            );

            continue;
          }

          // ------------------------
          // 2. CHECK EXISTING CLD ORDER
          // ------------------------
          const alreadyInCld = await this.cldService.findOrderByShopifyId(
            order.id.toString(),
          );

          if (alreadyInCld) {
            console.log(
              `Order EXIST IN CLD  Skipping order ${order.id} (already in CLD).`,
            );
            this.loggerService.logOrderAction(
              "SKIPPED",
              order,
              `Order EXIST IN CLD  Skipping order ${order.id} (already in CLD).`,
            );
            const fulfillExistingOrders =
              this.configService.get<string>("FULFILL_EXISTING_ORDERS") ==
              "true";
            console.log(
              "ttttttttttttttttttttttttttttttt FULFILL_EXISTING_ORDERS:",
              fulfillExistingOrders,
            );

            // fullfill here as order already in cld but unfulfilled in shopify
            if (fulfillExistingOrders) {
              const isPaid = order.financial_status === "paid";
              const isFulfilled = order.fulfillment_status === "fulfilled";

              if (isPaid && !isFulfilled) {
                console.log(
                  `🚀 Fulfilling order on shopify ${order.id} AS ORDER in CLD Already Exist`,
                );
                try {
                  await this.createShopifyFulfillment(order);
                } catch (error) {
                  console.error(
                    `❌ Failed to fulfill existing order ${order.id}`,
                  );
                }
              }
            }
            continue;
          }

          // ------------------------
          // 3. CREATE CLD CART
          // ------------------------
          const { cartId } = await this.cldService.createCldCart();
          console.log(`SyncAll-Order-To-CLD: Created CLD cart: ${cartId}`);

          // Only include manual fulfillment items
          const cldItems = order.line_items
            .filter((item: any) => item.fulfillment_service === "manual")
            .filter((item: any) => {
              const sku = (item?.sku ?? "").trim();
              if (!sku) {
                this.loggerService.logOrderAction(
                  "SKIPPED",
                  item,
                  "Item has no SKU; cannot send to CLD",
                );
                return false;
              }
              return true;
            })
            .map((item: any) => ({
              sku: (item.sku ?? "").trim(),
              qty: item.quantity,
            }));

          // Log skipped non-manual items
          order.line_items.forEach((item: any) => {
            if (item.fulfillment_service !== "manual") {
              this.loggerService.logOrderAction(
                "SKIPPED",
                item,
                `Item with SKU ${item.sku} uses ${item.fulfillment_service}, not sending to CLD`,
              );
            }
          });

          // ------------------------
          // 4. ADD ITEMS TO CART
          // ------------------------
          const cart = await this.cldService.addItemsToCldCart(
            cartId,
            cldItems,
            this.shopifyChannel
          );
          // console.log("➕ Added items to CLD cart.", cart);

          // ------------------------
          // 5. GET CLD CART (VERIFY)
          // ------------------------
          const cldCart = await this.cldService.getCldCart(cartId);
          console.log("🛍️ CLD Cart Content:", cldCart);

          // ------------------------
          // 6. PREPARE ORDER PAYLOAD
          // ------------------------
          const orderPayload = mapShopifyOrderToCldOrderPayload(
            order,
            cartId,
            this.channel,
          );
          console.log("📤 Placing CLD order payload:", orderPayload);

          // ------------------------
          // 7. PLACE ORDER IN CLD
          // ------------------------
          const placedOrder = await this.cldService.placeOrder(orderPayload);
          let x = { ...placedOrder, pdfFile: "PDF_TRIMMED..." };
          console.log("Placing order in CLD Response:", x);

          // Log PLACED
          await this.loggerService.logOrderAction(
            "PLACED",
            order,
            placedOrder,
            placedOrder.message,
          );

          // ------------------------
          // 8. FULFILL IN SHOPIFY (ONLY AFTER CLD SUCCESS)
          // ------------------------
          const isPaid = order.financial_status === "paid";
          const isFulfilled = order.fulfillment_status === "fulfilled";

          if (isPaid && !isFulfilled && placedOrder.status) {
            console.log(
              `🚀 Fulfilling order ${order.id} AFTER CLD placement...`,
            );
            await this.createShopifyFulfillment(order);
          }
        } catch (err: any) {
          console.error(
            `❌ Failed to sync order ${order.id} to CLD:`,
            err.message,
          );

          this.loggerService.logOrderAction("ERROR", order, err.message);
        }
      }
    }
  }
}
