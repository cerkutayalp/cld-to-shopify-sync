import { Injectable } from "@nestjs/common";
import axios from "axios";
import axiosRetry from "axios-retry";
import { ConfigService } from "@nestjs/config";
import { PaginationPayload, Product } from "./Dto/CldProductResponse";
import { CldLoginResponse } from "./Dto/CldLoginResponse";
import { OrderPayload, PlaceOrderResponse } from "./Dto/OrderPayload";
import { LoggerService } from "../logger/logger.service";

// Enable retry logic globally
axiosRetry(axios, {
  retries: 3,
  retryDelay: (retryCount, error) => {
    console.log(
      `🔁 Retry attempt ${retryCount} due to ${error.code || error.message}`
    );
    return retryCount * 1000;
  },
  retryCondition: (error) => {
    return (
      axiosRetry.isNetworkError(error) || axiosRetry.isRetryableError(error)
    );
  },
});

@Injectable()
export class CldService {
  private token: string = "";
  private readonly apiUrl: string;
  private readonly apiKey: string;


  constructor(
    private configService: ConfigService,
    private readonly loggerService: LoggerService
  ) {
    this.apiUrl = this.configService.get<string>("CLD_API_URL")!;
    this.apiKey = this.configService.get<string>("CLD_API_KEY")!;
    
    
    console.log("🧪 LoggerService injected?", !!this.loggerService);
  }

  public async getAuthToken(): Promise<string> {
    console.log("🔑 Authenticating with CLD...");
    const username = this.configService.get<string>("CLD_USERNAME")!;
    const password = this.configService.get<string>("CLD_PASSWORD")!;

    const response = await axios.post<CldLoginResponse>(
      `${this.apiUrl}/auth/login`,
      {
        username,
        password,
      },
      {
        headers: {
          accept: "application/json",
          Authorization: `ApiKey ${this.apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );
    // console.log(" CLD Auth Token: ", response.data);
    const loginResponse = response.data as CldLoginResponse;

    return response.data.access_token;
  }

  private async getCldProductsPaginated(
    url: string,
    payload: PaginationPayload
  ): Promise<any> {
    console.log("📦 Fetching CLD products with payload ", payload);
    return axios.post(url, payload, {
      headers: {
        accept: "text/plain",
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json-patch+json",
      },
      maxBodyLength: Infinity,
    });
  }

  async *getStockList() {
    const url = `${this.apiUrl}/Product/get-stock-list`;
    const payload: PaginationPayload = {
      pageSize: 100,
      pageNumber: 1,
    };

    if (!this.token) {
      this.token = await this.getAuthToken();
    }

    let havePage = true;

    while (havePage) {
      try {
        const response = await this.getCldProductsPaginated(url, payload);
        // const response = await axios.post(url, payload, {
        //   headers: {
        //     accept: "text/plain",
        //     Authorization: `Bearer ${this.token}`,
        //     "Content-Type": "application/json-patch+json",
        //   },
        //   maxBodyLength: Infinity,
        // });

        if (!response.data || response.data.products.length === 0) {
          havePage = false;
        } else {
          yield response.data.products;
          payload.pageNumber++;
        }
      } catch (error: any) {
        if (error.response?.status === 403) {
          // Token expired → re-generate
          this.token = await this.getAuthToken();
        } else {
          throw error;
        }
      }
    }
  }
  async getStockListByIds(ids: string[]): Promise<Product[]> {
    const url = `${this.apiUrl}/Product/get-stock-list`;
    const payload: PaginationPayload = {
      ids: ids, // You can specify specific product IDs here if needed
      pageNumber: 1,
      pageSize: 10000,
    };

    if (!this.token) {
      this.token = await this.getAuthToken();
    }
    const response = await this.getCldProductsPaginated(url, payload);

    if (!response.data || response.data.products.length === 0) {
      return [];
    } else {
      return response.data.products;
    }
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

  // Only log the first page
  async logFirstStockPage() {
    for await (const products of this.getStockList()) {
      console.log("First page of products:", products);
      break;
    }
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

  async sendAllProductsToShopify() {
    let sentCount = 0;

    for await (const products of this.getStockList()) {
      for (const cldProduct of products) {
        const shopifyProduct = this.mapCldToShopifyProduct(cldProduct);
        const response = await this.sendProductToShopify(shopifyProduct);

        if (response) {
          sentCount++;
          console.log(
            `✅ Sent product #${sentCount}:`,
            response.product?.id || response
          );
        }
      }
    }

    console.log(`🎉 Finished sending ${sentCount} new products to Shopify.`);
  }

  //Create CLD Cart for the product.

  async createCldCart(): Promise<{ cartId: string }> {
    if (!this.token) {
      this.token = await this.getAuthToken();
    }

    const url = `${this.apiUrl}/Dropshiping/cart/create`;

    const response = await axios.get(url, {
      headers: {
        accept: "text/plain",
        Authorization: `Bearer ${this.token}`,
      },
    });

    if (!response.data?.cartId) {
      throw new Error("❌ Failed to create CLD cart");
    }

    return { cartId: response.data.cartId };
  }

  // Add item to the cart.
  async addItemsToCldCart(
    cartId: string,
    items: { sku: string; qty: number }[]
  ) {
    if (!this.token) {
      this.token = await this.getAuthToken();
    }

    const url = `${this.apiUrl}/Dropshiping/cart/add`;

    const payload = {
      items,
      cartId,
    };

    const response = await axios.post(url, payload, {
      headers: {
        accept: "text/plain",
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json-patch+json",
      },
      maxBodyLength: Infinity,
    });
    console.log("add cartt rsponse ", response.data);
    return response.data;
  }

  async getCldCart(cartId: string) {
    if (!this.token) {
      this.token = await this.getAuthToken();
    }

    const url = `${this.apiUrl}/Dropshiping/cart/get`;
    const payload = { cartId };

    const response = await axios.post(url, payload, {
      headers: {
        accept: "text/plain",
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json-patch+json",
      },
      maxBodyLength: Infinity,
    });

    return response.data;
    // returns: { items, id, docType, docNumber, amountExcludingVat, ... }
  }

  ///working
  async placeOrder(order: OrderPayload): Promise<PlaceOrderResponse> {
    if (!this.token) {
      this.token = await this.getAuthToken();
    }

    const url = `${this.apiUrl}/Dropshiping/order/place`;

    try {
      console.log(
        "📤 [1] Sending order payload to CLD:",
        (order)
      );
      const response = await axios.post<PlaceOrderResponse>(url, order, {
        headers: {
          accept: "*/*",
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json-patch+json",
        },
        maxBodyLength: Infinity,
      });
      //1 print
      console.log(
        "📥 [2] Raw response from CLD:",
        (response.data)
      );

      if (!response.data?.status) {
        //2 print
        console.log(
          "✅ [4] CLD order placed successfully with status:",
          response.data
        );  
        throw new Error(
          `CLD order placement failed: ${
            response.data?.message || "Unknown error"
          }`
        );
      }
      //3 print
      console.log("✅ [4] CLD order message :", response.data.message);

      return response.data;
    } catch (error: any) {
      //4 print
      console.log("✅ [4] CLD order placed successfully with status:", error);
      this.loggerService.error(
        `❌ Failed to place order in CLD: ${error.message}`
      );
      throw error;
    }
  }

  async findOrderByShopifyId(shopifyOrderId: string): Promise<any | null> {
    try {
      const response = await axios.get(
        `${this.apiUrl}/orders/${shopifyOrderId}`,
        {
          headers: { Authorization: `Bearer ${this.token}` },
        }
      );
      return response.data; // return CLD order if found
    } catch (e: unknown) {
      // If CLD returns 404, it means not found → safe to place
      if (axios.isAxiosError(e) && e.response?.status === 404) {
        return null;
      }
      console.error(`CLD lookup failed:`, e);
      throw e; // only throw if it's not "not found"
    }
  }

  async getTrackingUrl(orderId: string, docType: string, docNumber: string) {
    try {
      const res = await axios.get(`${this.apiUrl}/Account/shipment-link`, {
        params: {
          id: orderId,
          docType,
          docNumber,
        },
        headers: {
          Accept: "text/plain",
          Authorization: `Bearer ${this.token}`,
        },
      });

      return res.data; // { trackingUrl, trackingUrlExt }
    } catch (err: any) {
      console.error("❌ Failed to fetch tracking URL:", err.message);
      if (err.response) {
        console.error("❌ CLD API error:", err.response.data);
      }
      throw err;
    }
  }
}
