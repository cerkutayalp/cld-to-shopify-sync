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

  /**
   * Retry helper method with exponential backoff
   * @param fn - Async function to retry
   * @param maxRetries - Max number of retry attempts
   * @param delayMs - Initial delay in milliseconds
   */
  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries = 3,
    delayMs = 1000
  ): Promise<T> {
    let lastError: any;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;
        const isNetworkError = !error.response || (error.code && error.code !== 'ERR_BAD_REQUEST');
        if (attempt < maxRetries && isNetworkError) {
          const delay = delayMs * attempt; // exponential backoff
          console.log(`🔁 Retry attempt ${attempt}/${maxRetries} after ${delay}ms due to: ${error.message}`);
          await new Promise(r => setTimeout(r, delay));
        } else if (attempt === maxRetries) {
          throw error;
        }
      }
    }
    throw lastError;
  }

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
    // Log full CLD product data
    console.log("📦 Full CLD Product Data:", JSON.stringify(cldProduct, null, 2));
    
    const category =
      cldProduct.categories?.en_GB || cldProduct.categories?.fr_BE || "";
    return {
      title: cldProduct.name?.en_GB || cldProduct.name?.fr_BE,
      vendor: cldProduct.brand || "",
      product_type: category,
      tags: [category],
      family: cldProduct.family,
      price: cldProduct.price,
      suggestedRetailPrice: cldProduct.suggestedRetailPrice,
      endOfLife: cldProduct.endOfLife || false,
      stock: cldProduct.stock ?? 0,
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

  //verify sku for dont duplicate product and return product/variant IDs for update
  async getShopifyProductBySku(sku: string): Promise<{ productId: string; variantId: string } | null> {
    const shopifyApiUrl = this.configService.get<string>("SHOPIFY_API_URL")!;
    const shopifyAccessToken = this.configService.get<string>(
      "SHOPIFY_ACCESS_TOKEN"
    )!;

    try {
      const response = await this.retryWithBackoff(
        () => axios.get(
          `${shopifyApiUrl}/admin/api/2023-10/products.json?fields=id,variants&limit=250`,
          {
            headers: {
              "X-Shopify-Access-Token": shopifyAccessToken,
              "Content-Type": "application/json",
            },
          }
        ),
        3, // max retries
        1000 // initial delay in ms
      );

      const products = response.data.products;

      for (const product of products) {
        for (const variant of product.variants) {
          if (variant.sku === sku) {
            console.log(`✅ SKU ${sku} already exists in Shopify (productId: ${product.id}, variantId: ${variant.id}).`);
            return { productId: product.id, variantId: variant.id };
          }
        }
      }

      return null;
    } catch (error: any) {
      console.error(`❌ Failed to check if SKU ${sku} exists in Shopify after retries: ${error.message}`);
      throw error;
    }
  }

  /**
   * Fetch all existing products and create a SKU -> {productId, variantId} map
   * This is useful for bulk operations to avoid querying for each product
   */
  async getShopifySkuMap(): Promise<Map<string, { productId: string; variantId: string }>> {
    const shopifyApiUrl = this.configService.get<string>("SHOPIFY_API_URL")!;
    const shopifyAccessToken = this.configService.get<string>(
      "SHOPIFY_ACCESS_TOKEN"
    )!;
    const skuMap = new Map<string, { productId: string; variantId: string }>();

    try {
      const response = await this.retryWithBackoff(
        () => axios.get(
          `${shopifyApiUrl}/admin/api/2023-10/products.json?fields=id,variants&limit=250`,
          {
            headers: {
              "X-Shopify-Access-Token": shopifyAccessToken,
              "Content-Type": "application/json",
            },
          }
        ),
        3, // max retries
        1000 // initial delay in ms
      );

      const products = response.data.products;
      for (const product of products) {
        for (const variant of product.variants) {
          if (variant.sku) {
            skuMap.set(variant.sku, { productId: product.id, variantId: variant.id });
          }
        }
      }

      console.log(`📊 Loaded ${skuMap.size} existing SKUs from Shopify`);
      return skuMap;
    } catch (error: any) {
      console.error(`❌ Failed to fetch SKU map from Shopify: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update an existing product variant in Shopify
   */
  async updateProductVariantInShopify(productId: string, variantId: string, variantData: any): Promise<any> {
    const shopifyApiUrl = this.configService.get<string>("SHOPIFY_API_URL")!;
    const shopifyAccessToken = this.configService.get<string>("SHOPIFY_ACCESS_TOKEN")!;

    const payload = {
      variant: variantData,
    };

    try {
      const response = await this.retryWithBackoff(
        () => axios.put(
          `${shopifyApiUrl}/admin/api/2023-10/products/${productId}/variants/${variantId}.json`,
          payload,
          {
            headers: {
              "X-Shopify-Access-Token": shopifyAccessToken,
              "Content-Type": "application/json",
            },
          }
        ),
        3, // max retries
        1000 // initial delay in ms
      );

      this.loggerService.logProductAction("UPDATE", variantData);
      console.log(`✅ Updated variant ${variantId} in Shopify`);

      return response.data;
    } catch (error: any) {
      console.error(`❌ Failed to update product variant: ${error.message}`);
      this.loggerService.error(
        `❌ Failed to update product variant ${variantId}: ${JSON.stringify(
          error.response?.data || error.message
        )}`
      );
      return null;
    }
  }

  async sendProductToShopify(shopifyProduct: any, skuMap?: Map<string, { productId: string; variantId: string }>) {
  const sku = shopifyProduct.variants?.[0]?.sku;
  if (!sku) {
    console.warn("⚠️ No SKU provided. Skipping product.");
    return;
  }

  // Skip products with stock less than 5
  const stock = shopifyProduct.stock ?? 0;
  if (stock < 5) {
    console.log(` Skipping product ${sku}: Stock (${stock}) is less than 5.`);
    this.loggerService.logProductAction("SKIPPED", shopifyProduct, `Insufficient stock (${stock} < 5)`);
    return;
  }

  // Skip products with undefined/null family (ERP Undefined)
  if (shopifyProduct.family === null || shopifyProduct.family === undefined) {
    console.log(`Skipping product ${sku}: Family is undefined (ERP Undefined).`);
    this.loggerService.logProductAction("SKIPPED", shopifyProduct, "ERP Undefined (family is null)");
    return;
  }

  // Skip products in "Marketing & consommables" category
  if (shopifyProduct.product_type === "Marketing & consommables") {
    console.log(`Skipping product ${sku}: Category is Marketing & consommables.`);
    this.loggerService.logProductAction("SKIPPED", shopifyProduct, "Marketing & consommables category excluded");
    return;
  }

  // Skip products where price > suggestedRetailPrice
  if (shopifyProduct.suggestedRetailPrice && shopifyProduct.price && shopifyProduct.price > shopifyProduct.suggestedRetailPrice) {
    console.log(`Skipping product ${sku}: Price (${shopifyProduct.price}) is greater than Suggested Retail Price (${shopifyProduct.suggestedRetailPrice}).`);
    this.loggerService.logProductAction("SKIPPED", shopifyProduct, "Price exceeds Suggested Retail Price");
    return;
  }

  // Use provided skuMap or fetch from API
  let existingProduct = skuMap?.get(sku) || null;
  if (!skuMap) {
    existingProduct = await this.getShopifyProductBySku(sku);
  }
  
  if (existingProduct) {
    // Product with this SKU already exists - update it
    this.loggerService.logProductAction("SKIPPED", shopifyProduct, "Duplicate SKU");
    console.log(`🔄 Updating existing product with SKU ${sku}...`);
    const variantData = shopifyProduct.variants?.[0];
    if (!variantData) {
      console.error(`❌ No variant data available for update`);
      return null;
    }

    // Log stock update info
    console.log(`📦 Updating stock: ${variantData.inventory_quantity} units for SKU ${sku}`);

    const response = await this.updateProductVariantInShopify(
      existingProduct.productId,
      existingProduct.variantId,
      variantData
    );
    return response;
  }

  // Create new product
  const shopifyApiUrl = this.configService.get<string>("SHOPIFY_API_URL")!;
  const shopifyAccessToken = this.configService.get<string>("SHOPIFY_ACCESS_TOKEN")!;

  const { endOfLife, family, price, suggestedRetailPrice, ...productData } = shopifyProduct;
  const status = endOfLife ? "archived" : "draft";
  const payload = {
    product: {
      ...productData,
      status,
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


  /**
   * Send all CLD products to Shopify (update if exists, create if new)
   * @param batchSize - Number of products to process before logging batch progress (default: 50)
   */
  async sendAllProductsToShopify(batchSize = 50) {
    console.log(`🚀 Starting bulk product sync with batch size: ${batchSize}...`);
    
    // Fetch all existing Shopify SKUs once for bulk operation
    console.log("📥 Fetching existing products from Shopify...");
    const skuMap = await this.getShopifySkuMap();

    let totalCount = 0;
    let createCount = 0;
    let updateCount = 0;
    let skipCount = 0;

    for await (const products of this.cldService.getStockList()) {
      for (const cldProduct of products) {
        const shopifyProduct = this.mapCldToShopifyProduct(cldProduct);
        const sku = shopifyProduct.variants?.[0]?.sku;
        
        const response = await this.sendProductToShopify(shopifyProduct, skuMap);
        
        if (response) {
          totalCount++;
          // Determine if it was a create or update based on response structure
          if (response.variant?.id) {
            updateCount++;
          } else if (response.product?.id) {
            createCount++;
          }
          
          if (totalCount % batchSize === 0) {
            console.log(`📊 Processed ${totalCount} products (Created: ${createCount}, Updated: ${updateCount}, Skipped: ${skipCount})`);
          }
        } else if (sku) {
          skipCount++;
        }
      }
    }

    console.log(`
✅ Bulk sync completed!
📊 Summary:
   ✨ Created: ${createCount}
   🔄 Updated: ${updateCount}
   ⏭️  Skipped: ${skipCount}
   📈 Total Processed: ${totalCount}`);
  }

  /**
   * Send multiple products to Shopify in a batch
   * @param cldProducts - Array of CLD products to sync
   * @param batchSize - Number of products to process before logging batch progress
   */
  async sendProductsInBatch(cldProducts: any[], batchSize = 50) {
    console.log(`🚀 Starting batch sync for ${cldProducts.length} products...`);
    
    // Fetch all existing Shopify SKUs once for bulk operation
    console.log("📥 Fetching existing products from Shopify...");
    const skuMap = await this.getShopifySkuMap();

    let createCount = 0;
    let updateCount = 0;
    let skipCount = 0;

    for (let i = 0; i < cldProducts.length; i++) {
      const cldProduct = cldProducts[i];
      const shopifyProduct = this.mapCldToShopifyProduct(cldProduct);
      const sku = shopifyProduct.variants?.[0]?.sku;
      
      const response = await this.sendProductToShopify(shopifyProduct, skuMap);
      
      if (response) {
        if (response.variant?.id) {
          updateCount++;
        } else if (response.product?.id) {
          createCount++;
        }
      } else if (sku) {
        skipCount++;
      }

      if ((i + 1) % batchSize === 0) {
        console.log(`📊 Processed ${i + 1}/${cldProducts.length} products (Created: ${createCount}, Updated: ${updateCount}, Skipped: ${skipCount})`);
      }
    }

    console.log(`
✅ Batch sync completed!
📊 Summary:
   ✨ Created: ${createCount}
   🔄 Updated: ${updateCount}
   ⏭️  Skipped: ${skipCount}
   📈 Total Processed: ${cldProducts.length}`);
  }
}
