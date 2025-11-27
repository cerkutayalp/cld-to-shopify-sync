import { Injectable } from "@nestjs/common";
import axios from "axios";
import { ConfigService } from "@nestjs/config";
import { ShopifyOrderResponse } from "./Dto/ShopifyOrderResponse";
import { CldService } from "src/cld/cld.service";
import { LoggerService } from "src/logger/logger.service";


@Injectable()
export class ShopifyService {
  private readonly store: string;
  private readonly token: string;
  private readonly headers: any

  constructor(private configService: ConfigService, 
    private readonly cldService: CldService,
    private readonly loggerService: LoggerService) 
    {
    this.store = this.configService.get<string>("SHOPIFY_STORE")!;
    this.token = this.configService.get<string>("SHOPIFY_ACCESS_TOKEN")!;
    this.headers = {
      "X-Shopify-Access-Token": this.token,
      "Content-Type": "application/json",
    };
    
  }

  //#region FETCH Product / Order

  async getProducts() {
    const url = `https://${this.store}/admin/api/2024-04/products.json`;
    const response = await axios.get(url, {
      headers: {
        "X-Shopify-Access-Token": this.token,
        "Content-Type": "application/json",
      },
      params: {
        published_status: "any",
        limit: 250,
      },
    });
    return response.data.products;
  }

  // async getOrders() {
  //   const url = `https://${this.store}/admin/api/2024-04/orders.json?status=any`;
  //   const response = await axios.get(url, {
  //     headers: {
  //       'X-Shopify-Access-Token': this.token,
  //       'Content-Type': 'application/json'
  //     }
  //   });
  //   return response.data.orders;
  // }

  async *getOrdersPaginated(limit = 50): AsyncGenerator<ShopifyOrderResponse> {
    let pageInfo = "";
    const baseUrl = `https://${this.store}/admin/api/2024-04/orders.json`;

    do {
      const url = `${baseUrl}?status=open&financial_status=paid&fulfillment_status=unfulfilled&limit=${limit}${pageInfo}`;
      const response = await axios.get(url, {
        headers: {
          "X-Shopify-Access-Token": this.token,
          "Content-Type": "application/json",
        },
      });

      const orders: ShopifyOrderResponse = response.data;


       // High-level log for Fulfillment batch
      console.log(`Fetched ${orders.orders.length} unfulfilled orders in this batch.`);
      orders.orders.forEach((order) => {
        if (!order.fulfillments || order.fulfillments.length === 0) {
          console.log(`Order ${order.id}: NO FULFILLMENT`);
        } else {
          console.log(`Order ${order.id}: HAS FULFILLMENT`);
        }
      });


      yield orders;

      const linkHeader = response.headers["link"];
      const nextPageMatch = linkHeader?.match(/<([^>]+)>;\s*rel="next"/);
      pageInfo = nextPageMatch
        ? `&page_info=${new URL(nextPageMatch[1]).searchParams.get(
            "page_info"
          )}`
        : "";
    } while (pageInfo);
  }

  async *getAllOrders(limit = 50): AsyncGenerator<any> {
    console.log(`Fetching Shopify orders with limit = ${limit}...`);
    for await (const batch of this.getOrdersPaginated(limit)) {
      console.log(`Received a batch of ${batch.orders.length} orders`);
      for (const order of batch.orders) {
         // Explicit fulfillment check for each order
        if (!order.fulfillments || order.fulfillments.length === 0) {
          console.log(`Order ${order.id}: NO FULFILLMENT`);
        } else {
          console.log(`Order ${order.id}: HAS FULFILLMENT`);
          // Optional: uncomment to inspect full fulfillment object
          // console.log(JSON.stringify(order.fulfillments, null, 2));
        }
        console.log("--- Shopify Order ---");
        console.log(JSON.stringify(order, null, 2));
        yield order;
      }
    }
    console.log("Finished fetching all orders.");
  }

    mapCldToShopifyProduct(cldProduct: any) {
    const category =
      cldProduct.categories?.en_GB || cldProduct.categories?.fr_BE || "";
    return {
      title: cldProduct.name?.en_GB || cldProduct.name?.fr_BE,
      vendor: cldProduct.brand || "",
      product_type: category,
      tags: [category],
      variants: [
        {
          price: cldProduct.price?.toFixed(2) || "0.00",
          sku: cldProduct.identifier, // Use identifier as SKU
          barcode: cldProduct.ean || "",
          inventory_quantity: cldProduct.stock ?? 0,
          weight: cldProduct.weightGram ? cldProduct.weightGram / 1000 : 0,
          weight_unit: "kg",
        },
      ],
      images: cldProduct.image ? [{ src: cldProduct.image }] : [],
    };
  }

  //verify sku for dont duplicate product
  async isProductInShopify(sku: string): Promise<boolean> {
    const shopifyApiUrl = this.configService.get<string>("SHOPIFY_API_URL")!;
    const shopifyAccessToken = this.configService.get<string>(
      "SHOPIFY_ACCESS_TOKEN"
    )!;

    const response = await axios.get(
      `${shopifyApiUrl}/admin/api/2023-10/products.json?fields=id,variants&limit=250`,
      {
        headers: {
          "X-Shopify-Access-Token": shopifyAccessToken,
          "Content-Type": "application/json",
        },
      }
    );

    const products = response.data.products;

    for (const product of products) {
      for (const variant of product.variants) {
        if (variant.sku === sku) {
          return true;
        }
      }
    }

    return false;
  }

  async sendProductToShopify(shopifyProduct: any) {
  const sku = shopifyProduct.variants?.[0]?.sku;
  if (!sku) {
    console.warn("⚠️ No SKU provided. Skipping product.");
    return;
  }

  const exists = await this.isProductInShopify(sku);
  if (exists) {
    console.log(`🔁 Product with SKU ${sku} already exists in Shopify. Skipping.`);
    this.loggerService.logProductAction("SKIPPED", shopifyProduct, "Duplicate SKU");
    return;
  }

  const shopifyApiUrl = this.configService.get<string>("SHOPIFY_API_URL")!;
  const shopifyAccessToken = this.configService.get<string>("SHOPIFY_ACCESS_TOKEN")!;

  const payload = {
    product: {
      ...shopifyProduct,
      status: "draft",
    },
  };

  try {
    const response = await axios.post(
      `${shopifyApiUrl}/admin/api/2023-10/products.json`,
      payload,
      {
        headers: {
          "X-Shopify-Access-Token": shopifyAccessToken,
          "Content-Type": "application/json",
        },
      }
    );

    this.loggerService.logProductAction("CREATE", payload.product);

    console.log("📦 Shopify response status:", response.status);

    return response.data;
  } catch (error: any) {
    console.error("❌ Shopify error response:", error.response?.data || error.message);
    this.loggerService.error(
      `❌ Failed to send product SKU ${sku} to Shopify: ${JSON.stringify(
        error.response?.data || error.message
      )}`
    );
    return null;
  }
}

//send specific product by sku

async sendProductByIdToShopify(productId: string) {
    console.log(`🚀 Sending CLD product ${productId} to Shopify...`);
    const products = await this.cldService.getStockListByIds([productId]);
    if (!products?.length) {
      console.warn(`⚠️ No CLD product found with ID: ${productId}`);
      return;
    }

    const cldProduct = products[0];
    console.log(`📦 Found CLD product: ${cldProduct.name?.en_GB || cldProduct.identifier}`);

    const shopifyProduct = this.mapCldToShopifyProduct(cldProduct);
    const response = await this.sendProductToShopify(shopifyProduct);

    if (response) {
      console.log(`✅ Sent CLD product ${productId} to Shopify (ID: ${response.product?.id})`);
    } else {
      console.error(`❌ Failed to send CLD product ${productId} to Shopify`);
    }

    return response;
  }


async sendAllProductsToShopify() {
    let sentCount = 0;

    for await (const products of this.cldService.getStockList()) {
      for (const cldProduct of products) {
        const shopifyProduct = this.mapCldToShopifyProduct(cldProduct);
        const response = await this.sendProductToShopify(shopifyProduct);
        if (response) {
          sentCount++;
          console.log(`✅ Sent product #${sentCount}: ${response.product?.id}`);
        }
      }
    }

    console.log(`🎉 Finished sending ${sentCount} new products to Shopify.`);
  }
}
