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
    
    const category = cldProduct.categories?.en_GB || cldProduct.categories?.fr_BE || "";
    const isEndOfLife = cldProduct.readOnly || false;
    
    // Prepare metafields for product level
    const productMetafields: any[] = [];

    // Suggested Price (Money type - requires JSON stringified object with amount and currency_code)
    if (cldProduct.suggestedRetailPrice) {
      const currencyCode = this.configService.get<string>("SHOPIFY_CURRENCY_CODE") || "EUR";
      productMetafields.push({
        namespace: "custom",
        key: "cld_suggested_price",
        value: JSON.stringify({
          amount: cldProduct.suggestedRetailPrice.toString(),
          currency_code: currencyCode
        }),
        type: "money"
      });
    }

    // License (Single line text)
    if (cldProduct.license) {
      productMetafields.push({
        namespace: "custom",
        key: "cld_license",
        value: cldProduct.license,
        type: "single_line_text_field"
      });
    }

    // Release Date (Date type)
    if (cldProduct.releaseDate) {
      productMetafields.push({
        namespace: "custom",
        key: "cld_release_date",
        value: cldProduct.releaseDate,
        type: "date"
      });
    }

    // Platforms (Join array as JSON-stringified array for list type metafield)
    if (cldProduct.platforms && Array.isArray(cldProduct.platforms) && cldProduct.platforms.length > 0) {
      productMetafields.push({
        namespace: "custom",
        key: "cld_platforms",
        value: JSON.stringify(cldProduct.platforms),
        type: "list.single_line_text_field"
      });
    }

    // Web Promo (Boolean type - convert to "true" or "false")
    productMetafields.push({
      namespace: "custom",
      key: "cld_web_promo",
      value: (cldProduct.isPromo === true) ? "true" : "false",
      type: "boolean"
    });

    // Box Languages (JSON-stringified array for list type metafield)
    if (cldProduct.vgMenuLanguages && Array.isArray(cldProduct.vgMenuLanguages) && cldProduct.vgMenuLanguages.length > 0) {
      productMetafields.push({
        namespace: "custom",
        key: "cld_box_languages",
        value: JSON.stringify(cldProduct.vgMenuLanguages),
        type: "list.single_line_text_field"
      });
    }

    // End of Life (Boolean type - convert to "true" or "false")
    productMetafields.push({
      namespace: "custom",
      key: "cld_end_of_life",
      value: isEndOfLife ? "true" : "false",
      type: "boolean"
    });

    // Description (Multi-line text field) - Convert to string if it's an object
    if (cldProduct.description) {
      let descriptionValue = cldProduct.description;
      
      // If description is an object (multilingual), pick English or stringify
      if (typeof descriptionValue === 'object') {
        descriptionValue = descriptionValue.en_GB || descriptionValue.fr_BE || JSON.stringify(descriptionValue);
        console.log(`📝 Converted multilingual description to string (${(String(descriptionValue)).length} chars)`);
      }
      
      productMetafields.push({
        namespace: "custom",
        key: "cld_description",
        value: String(descriptionValue),
        type: "multi_line_text_field"
      });
      console.log(`📋 Added cld_description metafield (${(String(descriptionValue)).length} chars)`);
    }

    // Country of Origin (Single line text) - Ensure it's a string
    if (cldProduct.countryOfOrigin) {
      productMetafields.push({
        namespace: "custom",
        key: "cld_country_of_origin",
        value: String(cldProduct.countryOfOrigin),
        type: "single_line_text_field"
      });
      console.log(`📋 Added cld_country_of_origin: ${cldProduct.countryOfOrigin}`);
    } else {
      console.log(`⏭️  No countryOfOrigin in CLD product (value: ${cldProduct.countryOfOrigin})`);
    }

    // Product Family (Single line text) - NOT internal, should be sent as metafield
    const productFamily = cldProduct.family || category || "";
    if (productFamily) {
      productMetafields.push({
        namespace: "custom",
        key: "cld_product_family",
        value: String(productFamily),
        type: "single_line_text_field"
      });
      console.log(`📋 Added cld_product_family metafield: ${productFamily}`);
    }

    // Prepare variant data with dimensions
    const variantData: any = {
      price: cldProduct.price?.toFixed(2) || "0.00",
      sku: cldProduct.identifier,
      barcode: cldProduct.ean || "",
      inventory_quantity: cldProduct.stock ?? 0,
      weight: cldProduct.weightGram ? cldProduct.weightGram / 1000 : 0,
      weight_unit: "kg",
    };

    // Variant metafields for dimensions
    const variantMetafields: any[] = [];

    if (cldProduct.widthMillimeter) {
      variantMetafields.push({
        namespace: "custom",
        key: "cld_box_width_mm",
        value: cldProduct.widthMillimeter.toString(),
        type: "number_decimal"
      });
      console.log(`📋 Added cld_box_width_mm: ${cldProduct.widthMillimeter}`);
    } else {
      console.log(`⏭️  No widthMillimeter in CLD product (value: ${cldProduct.widthMillimeter})`);
    }

    if (cldProduct.heightMillimeter) {
      variantMetafields.push({
        namespace: "custom",
        key: "cld_box_height_mm",
        value: cldProduct.heightMillimeter.toString(),
        type: "number_decimal"
      });
      console.log(`📋 Added cld_box_height_mm: ${cldProduct.heightMillimeter}`);
    } else {
      console.log(`⏭️  No heightMillimeter in CLD product (value: ${cldProduct.heightMillimeter})`);
    }

    if (cldProduct.lengthMillimeter) {
      variantMetafields.push({
        namespace: "custom",
        key: "cld_box_length_mm",
        value: cldProduct.lengthMillimeter.toString(),
        type: "number_decimal"
      });
      console.log(`📋 Added cld_box_length_mm: ${cldProduct.lengthMillimeter}`);
    } else {
      console.log(`⏭️  No lengthMillimeter in CLD product (value: ${cldProduct.lengthMillimeter})`);
    }

    // Add metafields to variant if any exist
    if (variantMetafields.length > 0) {
      variantData.metafields = variantMetafields;
      console.log(`📋 Created ${variantMetafields.length} variant metafields:`, variantMetafields.map(m => `${m.key}`).join(", "));
    } else {
      console.log(`⏭️  No variant metafields created (no dimensions found in CLD product)`);
    }

    // Collect ALL images CLD provides (images[] array + single image), deduped, order preserved
    const imageSrcs = [
      ...(Array.isArray(cldProduct.images) ? cldProduct.images : []),
      ...(cldProduct.image ? [cldProduct.image] : []),
    ]
      .filter((src) => typeof src === "string" && src.trim().length > 0)
      // Skip CLD's bare transform base (no actual image file, ends with "/") — Shopify rejects it
      .filter((src) => !src.trim().endsWith("/"))
      .filter((src, index, arr) => arr.indexOf(src) === index);
    const shopifyImages = imageSrcs.map((src) => ({ src }));

    const shopifyProduct: any = {
      title: cldProduct.name?.en_GB || cldProduct.name?.fr_BE,
      vendor: cldProduct.brand || "",
      product_type: category,
      tags: [category],
      variants: [variantData],
      images: shopifyImages,
      // Store internal fields (not sent to Shopify)
      _family: productFamily,
      _price: cldProduct.price,
      _suggestedRetailPrice: cldProduct.suggestedRetailPrice,
      _endOfLife: isEndOfLife,
      _stock: cldProduct.stock ?? 0,
    };

    // Add product-level metafields if any exist
    if (productMetafields.length > 0) {
      shopifyProduct.metafields = productMetafields;
      console.log(`📋 Created ${productMetafields.length} product metafields:`, productMetafields.map(m => `${m.key} (${m.type})`).join(", "));
    } else {
      console.log(`⚠️ No product metafields created for this product`);
    }

    // Log variant metafields
    if (variantMetafields.length > 0) {
      console.log(`📋 Created ${variantMetafields.length} variant metafields:`, variantMetafields.map(m => `${m.key} (${m.type})`).join(", "));
    } else {
      console.log(`⚠️ No variant metafields created for this product`);
    }

    return shopifyProduct;
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
   * Set product metafields using GraphQL mutation (metafieldsSet)
   */
  private async setProductMetafields(productId: string, metafields: any[]): Promise<boolean> {
    const shopifyApiUrl = this.configService.get<string>("SHOPIFY_API_URL")!;
    const shopifyAccessToken = this.configService.get<string>("SHOPIFY_ACCESS_TOKEN")!;

    if (!metafields || metafields.length === 0) {
      console.log(`⏭️  No product metafields to set`);
      return true;
    }

    console.log(`🔗 Calling GraphQL for product metafields (endpoint: ${shopifyApiUrl}/admin/api/2023-10/graphql.json)`);

    const query = `
      mutation SetProductMetafields($input: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $input) {
          metafields {
            id
            namespace
            key
            value
            type
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    // Transform metafields to include the ownerId (product ID in gid format)
    const productIdStr = String(productId).split('/').pop() || productId; // Handle both numeric and gid formats
    const gid = `gid://shopify/Product/${productIdStr}`;
    const transformedMetafields = metafields.map(mf => ({
      ownerId: gid,
      namespace: mf.namespace,
      key: mf.key,
      value: String(mf.value), // Ensure value is always a string
      type: mf.type
    }));

    const variables = {
      input: transformedMetafields
    };

    console.log(`📤 GraphQL variables:`, JSON.stringify(variables, null, 2));

    try {
      const response = await this.retryWithBackoff(
        () => axios.post(
          `${shopifyApiUrl}/admin/api/2023-10/graphql.json`,
          { query, variables },
          {
            headers: {
              "X-Shopify-Access-Token": shopifyAccessToken,
              "Content-Type": "application/json",
            },
          }
        ),
        3,
        1000
      );

      console.log(`📥 GraphQL response:`, JSON.stringify(response.data, null, 2));

      const result = response.data.data?.metafieldsSet;
      
      if (!result) {
        console.error(`❌ No metafieldsSet response. Full response:`, response.data);
        return false;
      }

      if (response.data.errors && response.data.errors.length > 0) {
        console.error(`❌ GraphQL errors in response:`, response.data.errors);
        return false;
      }

      if (result?.userErrors && result.userErrors.length > 0) {
        console.error(`❌ GraphQL user errors: ${JSON.stringify(result.userErrors)}`);
        return false;
      }

      if (!result?.metafields || result.metafields.length === 0) {
        console.error(`❌ No metafields returned in response`);
        return false;
      }

      console.log(`✅ Set ${metafields.length} product metafields for product ${productId}`);
      return true;
    } catch (error: any) {
      console.error(`❌ Failed to set product metafields: ${error.message}`);
      console.error(`   Response data:`, error.response?.data);
      return false;
    }
  }

  /**
   * Set variant metafields using GraphQL mutation (metafieldsSet)
   */
  private async setVariantMetafields(variantId: string, metafields: any[]): Promise<boolean> {
    const shopifyApiUrl = this.configService.get<string>("SHOPIFY_API_URL")!;
    const shopifyAccessToken = this.configService.get<string>("SHOPIFY_ACCESS_TOKEN")!;

    if (!metafields || metafields.length === 0) {
      console.log(`⏭️  No variant metafields to set`);
      return true;
    }

    console.log(`🔗 Calling GraphQL for variant metafields (endpoint: ${shopifyApiUrl}/admin/api/2023-10/graphql.json)`);

    const query = `
      mutation SetVariantMetafields($input: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $input) {
          metafields {
            id
            namespace
            key
            value
            type
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    // Transform metafields to include the ownerId (variant ID in gid format)
    const variantIdStr = String(variantId).split('/').pop() || variantId; // Handle both numeric and gid formats
    const gid = `gid://shopify/ProductVariant/${variantIdStr}`;
    const transformedMetafields = metafields.map(mf => ({
      ownerId: gid,
      namespace: mf.namespace,
      key: mf.key,
      value: String(mf.value), // Ensure value is always a string
      type: mf.type
    }));

    const variables = {
      input: transformedMetafields
    };

    console.log(`📤 GraphQL variables:`, JSON.stringify(variables, null, 2));

    try {
      const response = await this.retryWithBackoff(
        () => axios.post(
          `${shopifyApiUrl}/admin/api/2023-10/graphql.json`,
          { query, variables },
          {
            headers: {
              "X-Shopify-Access-Token": shopifyAccessToken,
              "Content-Type": "application/json",
            },
          }
        ),
        3,
        1000
      );

      console.log(`📥 GraphQL response:`, JSON.stringify(response.data, null, 2));

      const result = response.data.data?.metafieldsSet;
      
      if (!result) {
        console.error(`❌ No metafieldsSet response. Full response:`, response.data);
        return false;
      }

      if (response.data.errors && response.data.errors.length > 0) {
        console.error(`❌ GraphQL errors in response:`, response.data.errors);
        return false;
      }

      if (result?.userErrors && result.userErrors.length > 0) {
        console.error(`❌ GraphQL user errors: ${JSON.stringify(result.userErrors)}`);
        return false;
      }

      if (!result?.metafields || result.metafields.length === 0) {
        console.error(`❌ No metafields returned in response`);
        return false;
      }

      console.log(`✅ Set ${metafields.length} variant metafields for variant ${variantId}`);
      return true;
    } catch (error: any) {
      console.error(`❌ Failed to set variant metafields: ${error.message}`);
      console.error(`   Response data:`, error.response?.data);
      return false;
    }
  }

  /**
   * Update an existing product variant in Shopify
   */
  async updateProductVariantInShopify(productId: string, variantId: string, variantData: any): Promise<any> {
    const shopifyApiUrl = this.configService.get<string>("SHOPIFY_API_URL")!;
    const shopifyAccessToken = this.configService.get<string>("SHOPIFY_ACCESS_TOKEN")!;

    // Extract metafields if present
    const { metafields, ...updateData } = variantData;
    const variantMetafields = metafields || [];

    const payload = {
      variant: updateData,
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

      this.loggerService.logProductAction("UPDATE", updateData);
      console.log(`✅ Updated variant ${variantId} in Shopify`);

      // Set variant metafields via GraphQL if any exist
      if (variantMetafields.length > 0) {
        console.log(`📝 Setting metafields for variant ${variantId}...`);
        await this.setVariantMetafields(variantId, variantMetafields);
      }

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

  // Use internal fields (prefixed with _) for business logic
  const stock = shopifyProduct._stock ?? 0;
  const family = shopifyProduct._family;
  const price = shopifyProduct._price;
  const suggestedRetailPrice = shopifyProduct._suggestedRetailPrice;
  const endOfLife = shopifyProduct._endOfLife || false;

  // Skip products with stock less than 5
  if (stock < 5) {
    console.log(` Skipping product ${sku}: Stock (${stock}) is less than 5.`);
    this.loggerService.logProductAction("SKIPPED", shopifyProduct, `Insufficient stock (${stock} < 5)`);
    return;
  }

  // Skip products with undefined/null family (ERP Undefined)
  if (family === null || family === undefined || family === "") {
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
  if (suggestedRetailPrice && price && price > suggestedRetailPrice) {
    console.log(`Skipping product ${sku}: Price (${price}) is greater than Suggested Retail Price (${suggestedRetailPrice}).`);
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

  // Extract product-level metafields
  const { _family, _price, _suggestedRetailPrice, _endOfLife, _stock, metafields, ...productData } = shopifyProduct;
  const productMetafields = metafields || [];
  
  console.log(`🔍 Extracted product metafields:`, productMetafields.length, productMetafields);

  // Extract variant-level metafields BEFORE creating payload (REST API doesn't support metafields in payload)
  let variantMetafields: any[] = [];
  if (productData.variants && productData.variants.length > 0) {
    const { metafields: varMf, ...variantWithoutMf } = productData.variants[0];
    variantMetafields = varMf || [];
    productData.variants[0] = variantWithoutMf;  // Remove metafields from variant
    
    console.log(`🔍 Extracted variant metafields:`, variantMetafields.length, variantMetafields);
  }

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

    const createdProduct = response.data.product;
    const productId = createdProduct.id;
    const createdVariant = createdProduct.variants?.[0];
    const variantId = createdVariant?.id;

    console.log(`✅ Created product ${productId} with variant ${variantId}`);

    // Now set product-level metafields via GraphQL
    if (productMetafields.length > 0 && productId) {
      console.log(`📝 Setting ${productMetafields.length} product metafields for product ${productId}...`);
      console.log(`   Metafields:`, productMetafields);
      const result = await this.setProductMetafields(productId, productMetafields);
      console.log(`   Result:`, result ? "✅ Success" : "❌ Failed");
    } else {
      console.log(`⏭️  No product metafields to set`);
    }

    // Set variant-level metafields via GraphQL (use the extracted variantMetafields from before)
    if (variantMetafields.length > 0 && variantId) {
      console.log(`📝 Setting ${variantMetafields.length} variant metafields for variant ${variantId}...`);
      console.log(`   Metafields:`, variantMetafields);
      const result = await this.setVariantMetafields(variantId, variantMetafields);
      console.log(`   Result:`, result ? "✅ Success" : "❌ Failed");
    } else {
      console.log(`⏭️  No variant metafields to set`);
    }

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
