import { Injectable } from "@nestjs/common";
import axios from "axios";
import { CldService } from "../cld/cld.service";
import { ConfigService } from "@nestjs/config";
import { Product } from "../cld/Dto/CldProductResponse";
import { LoggerService } from "../logger/logger.service";
import { ShopifyService } from "src/shopify/shopify.service";
import { OrderPayload } from "../cld/Dto/OrderPayload";
import { ShopifyOrder } from "../shopify/Dto/ShopifyOrderResponse";

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
  private mapShopifyOrderToCldOrderPayload(
    order: ShopifyOrder,
    cartId: string
  ): OrderPayload {
    // ensure we only pass the first segment of the cartId
    const cleanCartId = cartId.split(";")[0];

    return {
      orderId: String(order.id),
      customerId: String(order.customer?.id || ""), // or 'guest'
      shippingAddress: {
        address: order.shipping_address?.address1 || "UNKNOWN",
        houseNumber: order.shipping_address?.address2 || "",
        postCode: order.shipping_address?.zip || "0000",
        city: order.shipping_address?.city || "UNKNOWN",
        countryIso2: (
          order.shipping_address?.country_code || "XX"
        ).toUpperCase(),
      },
      clientInfo: {
        firstName: order.customer?.first_name || "N/A",
        lastName: order.customer?.last_name || "N/A",
        email: order.customer?.email || "noemail@example.com",
        phone: order.customer?.phone || "0000000000", // fallback
        fax: "",
      },
      cartId: cleanCartId,
    };
  }

  constructor(
    private configService: ConfigService,
    private cldService: CldService,
    private loggerService: LoggerService,
    private shopifyService: ShopifyService
  ) {
    this.shopifyApiUrl = configService.get<string>("SHOPIFY_API_URL")!;
    this.shopifyToken = configService.get<string>("SHOPIFY_ACCESS_TOKEN")!;
    this.cldWarehouseId = configService.get<string>("CLD_WAREHOUSE_ID")!;
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

  async getInventoryLevels(inventoryItemId: number): Promise<any[]> {
    const res = await axios.get(
      `${this.shopifyApiUrl}/admin/api/2023-10/inventory_levels.json?inventory_item_ids=${inventoryItemId}`,
      {
        headers: {
          "X-Shopify-Access-Token": this.shopifyToken,
        },
      }
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
      }
    );
    return res.data.locations;
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
        this.loggerService.logStockSync(
          "UPDATE",
          {
            sku,
            inventoryItemId: inventory_item_id,
            stock: cldStock?.stock,
          },
          "Processing stock update"
        );

        const resp = await this.updateShopifyVariantStock({
          inventoryItemId: inventory_item_id,
          // locationId,
          cldStock: cldStock?.stock || 0,
          sku: sku,
        });
        this.loggerService.logStockSync(
          "UPDATE",
          {
            sku,
            inventoryItemId: inventory_item_id,
            stock: cldStock?.stock,
          },
          "Processing stock update"
        );
        // process.exit(0);
      }
    }
  }
  // TODO MOVE TO SHOPIFY_SERVICE

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
      `updateShopifyVariantStock: inventoryItemId:${inventoryItemId} SKU:${sku} stock ${cldStock}`
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
        "No inventory levels found"
      );

      return { error: "No inventory levels", sku };
    }

    const allLocations = await this.getAllShopifyLocations();

    const results = [];

    for (const level of levels) {
      const location = allLocations.find((loc) => loc.id === level.location_id);
      if (!location) {
        console.warn(
          `⚠️ Location not found for ID ${level.location_id}. Skipping.`
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
          }
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
          `Updated stock to ${cldStock} at ${location.name}`
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
          `Failed to update stock at ${location.name}`
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
              // console.warn(
              //   `⚠️ Missing SKU for variant ${id} in product ${shopifyProduct.id}. Skipping.`
              // );
              this.loggerService.logStockSync(
                "SKIP",
                {
                  sku,
                  product: shopifyProduct,
                },
                "Missing SKU in Shopify product variant"
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

  //fulfillment service
  async createShopifyFulfillment(
    order: ShopifyOrder,
    tracking?: { url: string; number?: string; company?: string }
  ) {
    console.log("🚀 Starting fulfillment for order:", order.id);

    // 1. Get fulfillment orders
    const fOrdersResp = await axios.get(
      `${this.shopifyApiUrl}/admin/api/2023-10/orders/${order.id}/fulfillment_orders.json`,
      { headers: { "X-Shopify-Access-Token": this.shopifyToken } }
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
        tracking_info: {
          company: tracking?.company || "Other",
          number: tracking?.number || "",
          url: tracking?.url || "",
        },
        notify_customer: false,
      },
    };
    console.log(
      "📝 Fulfillment payload prepared:",
      JSON.stringify(fulfillmentPayload, null, 2)
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
        }
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

  // send order to cld
  async syncAllOrderToCLD(page_size = 50) {
    
    for await (const batch of this.shopifyService.getOrdersPaginated(
      page_size
    )) {
      for (const order of batch.orders) {
        try {
          console.log(`\n📦 Processing Shopify order ${order.id}`);
          // Log RECEIVED
          this.loggerService.logOrderAction("RECEIVED", order);

          // --- SKIP CANCELLED ORDERS ---
          if (order.cancel_reason !== null || order.cancelled_at !== null) {
            console.log(`⏭ Skipping order ${order.id} (cancelled in Shopify).`);
            this.loggerService.logOrderAction(
              "SKIPPED",
              order,
              "Order cancelled in Shopify"
            );
            continue; // Go to next order
          }
          this.loggerService.logOrderAction(
            "SKIPPED" as any,
            order,
            "Order cancelled in Shopify"
          );

          // 2. Skip if not paid ,  Not needed now implement from the order Api only fetch paid order.
          // if (order.financial_status !== 'paid') {
          //   console.log(`⏭ Skipping order ${order.id} (financial_status = ${order.financial_status}).`);
          //   this.loggerService.logOrderAction('SKIPPED', order, 'Order not paid');
          //   continue;
          // }

          // 3. Check if order already exists in CLD (persistent check)
          // const alreadyInCld = await this.cldService.findOrderByShopifyId(order.id);
          // if (alreadyInCld) {
          //   console.log(`⏭ Skipping order ${order.id} (already in CLD).`);
          //   this.loggerService.logOrderAction('SKIPPED', order, 'Order already placed in CLD');
          //   continue;
          // }

          // 1. Create a CLD cart
          const { cartId } = await this.cldService.createCldCart();
          console.log(`🛒 Created CLD cart: ${cartId}`);

          // Only include manual fulfillment items
          const cldItems = order.line_items
            .filter((item: any) => item.fulfillment_service === "manual")
            .map((item: any) => ({
              sku: item.sku,
              qty: item.quantity,
            }));

          // Log skipped items
          order.line_items.forEach((item: any) => {
            if (item.fulfillment_service !== "manual") {
              this.loggerService.logOrderAction(
                "SKIPPED" as any,
                item,
                `Item with SKU ${item.sku} uses ${item.fulfillment_service}, not sending to CLD`
              );
            }
          });

          // Log MAPPED
          this.loggerService.logOrderAction("MAPPED", { ...order, cldItems });

          // 3. Add items to CLD cart
          await this.cldService.addItemsToCldCart(cartId, cldItems);
          console.log("➕ Added items to CLD cart.");

          // 4. Optionally verify cart content
          const cldCart = await this.cldService.getCldCart(cartId);
          console.log("🛍️ CLD Cart Content:", cldCart);

          // 5. Build CLD order payload
          const orderPayload = this.mapShopifyOrderToCldOrderPayload(
            order,
            cartId
          );
          console.log("📤 Placing order payload:", orderPayload);

          // 6. Place order in CLD
          const placedOrder = await this.cldService.placeOrder(orderPayload);
          console.log(`✅ Placed order in CLD:`, placedOrder);

          // Log PLACED
          this.loggerService.logOrderAction("PLACED", placedOrder);

          // 🔍 Fetch tracking URL
          const tracking = await this.cldService.getTrackingUrl(
            placedOrder.orderId,
            placedOrder.docType,
            placedOrder.docNumber
          );

          this.loggerService.logOrderAction(
            "TRACKING_FETCHED",
            { orderId: order.id, tracking },
            "Tracking data received from CLD"
          );

          console.log("🚚 Tracking response:", JSON.stringify(tracking));
          const trackingUrl = tracking?.trackingUrl || tracking?.trackingUrlExt;
          if (trackingUrl) {
            this.loggerService.logOrderAction(
              "TRACKING_FOUND",
              { orderId: order.id, trackingUrl },
              "Valid tracking URL found"
            );
            console.log("✅ Tracking URL found:", trackingUrl);
            // Create fulfillment in Shopify with tracking
            await this.createShopifyFulfillment(order, {
              url: trackingUrl, // use CLD tracking URL
              // number: tracking?.trackingNumber || "", // if CLD provides tracking number
              company: "Other", // default "Other" if none
            });
            this.loggerService.logOrderAction(
              "FULFILLMENT_CREATED",
              { orderId: order.id, trackingUrl },
              "Shopify fulfillment created with tracking"
            );
          } else {
            console.log(
              "❌ No tracking URL found for order:",
              order?.id,
              "Tracking data:",
              tracking
            );
            this.loggerService.logOrderAction(
              "TRACKING_MISSING",
              { orderId: order.id, tracking },
              "No tracking URL found for this order"
            );
          }
        } catch (err: any) {
          console.error(
            `❌ Failed to sync order ${order.id} to CLD:`,
            err.message
          );

          // Log ERROR
          this.loggerService.logOrderAction("ERROR", order, err.message);

          // yield { shopifyOrderId: order.id, error: err.message };
        }
      }
    }
  }
}
