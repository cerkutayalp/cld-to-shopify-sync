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
//#region cld shopify service using dropshiping api
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
    console.log(" CLD Auth Token: ");
    const loginResponse = response.data as CldLoginResponse;

    console.log("✅ CLD login success. Token received.");

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

  //#region Get Stock list from cld
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

  // Only log the first page
  async logFirstStockPage() {
    for await (const products of this.getStockList()) {
      console.log("First page of products:", products);
      break;
    }
  }

  //#region Create Cart in CLD.

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

  //#region Add item to the cart.
  async addItemsToCldCart(
    cartId: string,
    items: { sku: string; qty: number }[]
  ) {
    if (!this.token) {
      this.token = await this.getAuthToken();
    }
    console.log("Adding items to CLD cart:", { cartId, items });
    const url = `${this.apiUrl}/Dropshiping/cart/add`;

    const payload = {
      items,
      cartId,
    };
    try {
      const response = await axios.post(url, payload, {
        headers: {
          accept: "text/plain",
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json-patch+json",
        },
        maxBodyLength: Infinity,
      });
      console.log("add cart rsponse ", response.data);
      return response.data;
    } catch (error) {
      console.error("❌ Error adding items to CLD cart:", error);
      throw error;
    }
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

  //#region order placement in CLD
  async placeOrder(order: OrderPayload): Promise<PlaceOrderResponse> {
    if (!this.token) {
      this.token = await this.getAuthToken();
    }

    const url = `${this.apiUrl}/Dropshiping/order/place`;

    try {
      console.log(order, "\nPLACE_ORDER: Sending order payload to CLD");
      const response = await axios.post<PlaceOrderResponse>(url, order, {
        headers: {
          accept: "*/*",
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json-patch+json",
        },
        maxBodyLength: Infinity,
      });

      if (!response.data?.status) {
        //Failed ...
        console.log("PLACE_ORDER: ERROR CLD order placement:", response.data);
        throw new Error(
          `CLD order placement failed: ${
            response.data?.message || "Unknown error"
          }`
        );
      } else {
        // Success
        console.log("PLACE_ORDER: Raw response from CLD:", response.data);
      }

      return response.data;
    } catch (error: any) {
      //4 print
      console.log("PLACE_ORDER: ERROR [4] CLD order with status:", error);
      this.loggerService.error(
        `❌ Failed to place order in CLD: ${error.message}`
      );
      throw error;
    }
  }

  async findOrderByShopifyId(shopifyOrderId: string): Promise<any | null> {
    try {
      if (!this.token) {
        this.token = await this.getAuthToken();
      }
      const url = `${this.apiUrl}/Dropshiping/order/exist?orderId=${shopifyOrderId}`;
      const response = await axios.get(url, {
        headers: {
          accept: "application/json",
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
      });
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

  //#region get Tracking url from cld
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
