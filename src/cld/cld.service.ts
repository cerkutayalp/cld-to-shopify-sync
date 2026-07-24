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
      `🔁 Retry attempt ${retryCount} due to ${error.code || error.message}`,
    );
    return retryCount * 5000;
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
  private tokenExpiresAt: number | null = null;
  private refreshToken: string | null = null;
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly channel: string;

  private normalizeCartItems(items: { sku: string; qty: number }[]) {
    const merged = new Map<string, number>();

    for (const item of items ?? []) {
      const sku = (item?.sku ?? "").trim();
      const qty = Number(item?.qty);

      if (!sku) continue;
      if (!Number.isFinite(qty) || qty <= 0) continue;

      merged.set(sku, (merged.get(sku) ?? 0) + Math.trunc(qty));
    }

    return Array.from(merged.entries()).map(([sku, qty]) => ({ sku, qty }));
  }

  constructor(
    private configService: ConfigService,
    private readonly loggerService: LoggerService,
  ) {
    this.apiUrl = this.configService.get<string>("CLD_API_URL")!;
    this.apiKey = this.configService.get<string>("CLD_API_KEY")!;
    this.channel = this.configService.get<string>("SHOPIFY_STORE") || "";

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
      },
    );
    const loginResponse = response.data;

    // Store token and calculate expiry (exp is duration in seconds)
    this.token = loginResponse.access_token;
    this.tokenExpiresAt = loginResponse.exp
      ? Date.now() + loginResponse.exp * 1000
      : null;
    this.refreshToken = loginResponse.refresh_token ?? null;

    console.log("✅ CLD login success. Token received.");

    return this.token;
  }

  /**
   * Refresh the access token using the refresh token.
   * Throws if refresh token limit exceeded or refresh fails.
   */
  private async refreshAuthToken(): Promise<string> {
    if (!this.refreshToken) {
      throw new Error("No refresh token available");
    }

    console.log("🔄 Refreshing CLD token...");
    const response = await axios.post<CldLoginResponse>(
      `${this.apiUrl}/auth/refresh-token`,
      { refreshToken: this.refreshToken },
      {
        headers: {
          accept: "application/json",
          Authorization: `ApiKey ${this.apiKey}`,
          "Content-Type": "application/json",
        },
      },
    );

    const loginResponse = response.data;

    // Check for refresh token limit exceeded
    if (
      loginResponse.success === false &&
      loginResponse.label === "REFRESH_TOKEN_LOGIN_ATTEMPT_EXCEED_LIMIT"
    ) {
      console.log("⚠️ Refresh token limit exceeded, clearing refresh token");
      this.refreshToken = null;
      throw new Error("Refresh token limit exceeded");
    }

    // Store new token and calculate expiry
    this.token = loginResponse.access_token;
    this.tokenExpiresAt = loginResponse.exp
      ? Date.now() + loginResponse.exp * 1000
      : null;
    this.refreshToken = loginResponse.refresh_token ?? this.refreshToken;

    console.log("✅ CLD token refreshed successfully.");

    return this.token;
  }

  /**
   * Ensure we have a valid token before making API calls.
   * Handles token expiry with 60-second buffer and refresh token logic.
   */
  private async ensureAuthenticated(): Promise<void> {
    const bufferMs = 60 * 1000; // 1 minute buffer before expiry
    console.log("🔄 Ensuring CLD token is valid...");

    // Check if token exists and is not expired (with buffer)
    if (
      this.token &&
      this.tokenExpiresAt &&
      Date.now() < this.tokenExpiresAt - bufferMs
    ) {
      console.log("🔄 CLD token is still valid.");

      return; // Token is still valid
    }

    // Token is missing or expired
    if (this.refreshToken) {
      // Try to refresh first
      console.log("🔄 CLD token expired or missing, attempting refresh...");
      try {
        await this.refreshAuthToken();
        return;
      } catch (error) {
        console.log("⚠️ Token refresh failed, falling back to full login");
        // Fall through to full login
      }
    }

    // No refresh token or refresh failed - do full login
    console.log("🔄 Performing full login to CLD...");
    await this.getAuthToken();
  }

  /**
   * Clear cached token (forces re-authentication on next request)
   */
  public clearToken(): void {
    this.token = "";
    this.tokenExpiresAt = null;
    this.refreshToken = null;
  }

  private async getCldProductsPaginated(
    url: string,
    payload: PaginationPayload,
  ): Promise<any> {
    console.log("📦 Fetching CLD products with payload ", payload);
    return axios.post(url, payload, {
      headers: {
        accept: "application/json",
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

    await this.ensureAuthenticated();

    // Offset paging has no stable-sort guarantee: if CLD reorders between page fetches (stock
    // changes mid-run), an item can appear on two pages. Deduping by identifier stops that from
    // becoming a duplicate product in Shopify.
    const seen = new Set<string>();
    const MAX_PAGES = 2000; // backstop against a never-ending loop
    let totalRepeats = 0;

    while (payload.pageNumber <= MAX_PAGES) {
      const response = await this.getCldProductsPaginated(url, payload);
      const products = response.data?.products ?? [];

      if (products.length === 0) break;

      const fresh = products.filter((p: any) => {
        const id = String(p?.identifier ?? "").trim().toUpperCase();
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
      });

      if (fresh.length !== products.length) {
        const repeats = products.length - fresh.length;
        totalRepeats += repeats;
        console.warn(`⚠️ CLD page ${payload.pageNumber}: dropped ${repeats} repeated identifier(s)`);
      }

      if (fresh.length > 0) yield fresh;

      // A short page means we've reached the end; don't wait for an empty one.
      if (products.length < (payload.pageSize ?? 100)) break;

      payload.pageNumber++;
    }

    console.log(`📦 CLD stock list: ${seen.size} unique product(s)${totalRepeats ? `, ${totalRepeats} repeat(s) dropped` : ""}`);
  }

  async getStockListByIds(ids: string[]): Promise<Product[]> {
    const url = `${this.apiUrl}/Product/get-stock-list`;
    const payload: PaginationPayload = {
      ids: ids, // You can specify specific product IDs here if needed
      pageNumber: 1,
      pageSize: 10000,
    };

    await this.ensureAuthenticated();
    const response = await this.getCldProductsPaginated(url, payload);

    if (!response.data || response.data.products.length === 0) {
      return [];
    } else {
      return response.data.products;
    }
  }

  async getStocksByIds(ids: string[]): Promise<Product[]> {
    const url = `${this.apiUrl}/Product/get-stock`;
    const payload: PaginationPayload = {
      ids: ids, // You can specify specific product IDs here if needed
      pageNumber: 1,
      pageSize: 1000,
    };

    await this.ensureAuthenticated();
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
    await this.ensureAuthenticated();

    const url = `${this.apiUrl}/Dropshiping/cart/create`;

    const response = await axios.get(url, {
      headers: {
        accept: "application/json",
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
    items: { sku: string; qty: number }[],
    channel?: string,
  ) {
    await this.ensureAuthenticated();
    const normalizedItems = this.normalizeCartItems(items);

    if (!cartId?.trim()) {
      throw new Error("❌ Missing cartId for CLD cart add");
    }
    if (!this.channel) {
      throw new Error(
        "❌ Missing CLD channel (set CLD_CHANNEL or SHOPIFY_STORE in env)",
      );
    }
    if (normalizedItems.length === 0) {
      throw new Error(
        "❌ No valid items to add to CLD cart (missing SKU or qty <= 0)",
      );
    }

    console.log("Adding items to CLD cart:", {
      cartId,
      items: normalizedItems,
      droppedCount: (items?.length ?? 0) - normalizedItems.length,
    });
    const url = `${this.apiUrl}/Dropshiping/cart/add`;

    const payload = {
      items: normalizedItems,
      cartId: cartId.trim(),
      channel: this.channel,
    };
    try {
      const response = await axios.post(url, payload, {
        headers: {
          accept: "application/json",
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        maxBodyLength: Infinity,
      });
      console.log("add cart rsponse ", response.data);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error("❌ Error adding items to CLD cart:", {
          status: error.response?.status,
          statusText: error.response?.statusText,
          url,
          response: error.response?.data,
        });
      } else {
        console.error("❌ Error adding items to CLD cart:", error);
      }
      throw error;
    }
  }

  async getCldCart(cartId: string) {
    await this.ensureAuthenticated();

    if (!cartId?.trim()) {
      throw new Error("❌ Missing cartId for CLD cart get");
    }
    if (!this.channel) {
      throw new Error(
        "❌ Missing CLD channel (set CLD_CHANNEL or SHOPIFY_STORE in env)",
      );
    }

    const url = `${this.apiUrl}/Dropshiping/cart/get`;
    const payload = { cartId: cartId.trim(), channel: this.channel };

    try {
      const response = await axios.post(url, payload, {
        headers: {
          accept: "application/json",
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        maxBodyLength: Infinity,
      });

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error("❌ Error getting CLD cart:", {
          status: error.response?.status,
          statusText: error.response?.statusText,
          url,
          response: error.response?.data,
        });
      } else {
        console.error("❌ Error getting CLD cart:", error);
      }
      throw error;
    }
    // returns: { items, id, docType, docNumber, amountExcludingVat, ... }
  }

  //#region order placement in CLD
  async placeOrder(order: OrderPayload): Promise<PlaceOrderResponse> {
    await this.ensureAuthenticated();

    if (!this.channel) {
      throw new Error(
        "❌ Missing CLD channel (set CLD_CHANNEL or SHOPIFY_STORE in env)",
      );
    }

    const url = `${this.apiUrl}/Dropshiping/order/place`;

    try {
      const shippingNote = this.configService.get<string>("SHIPPING_NOTE");
      // Send all required fields including cartId and channel
      const payload = {
        orderId: order.orderId,
        customerId: order.customerId,
        shippingAddress: order.shippingAddress,
        clientInfo: order.clientInfo,
        cartId: order.cartId,
        channel: this.channel,
        ...(shippingNote && { shippingNote: shippingNote }),
      };
      console.log(payload, "\nPLACE_ORDER: Sending order payload to CLD");
      const response = await axios.post<PlaceOrderResponse>(url, payload, {
        headers: {
          accept: "*/*",
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        maxBodyLength: Infinity,
      });
      console.log("PLACE_ORDER: Raw response from CLD:", response.data);

      if (!response.data?.status) {
        //Failed ...
        console.log("PLACE_ORDER: ERROR CLD order placement:", response.data);
        throw new Error(
          `CLD order placement failed: ${
            response.data?.message || "Unknown error"
          }`,
        );
      } else {
        // Success
        console.log("PLACE_ORDER: Raw response from CLD:", response.data);
      }

      return response.data;
    } catch (error: any) {
      //4 print
      // console.log("PLACE_ORDER: ERROR [4] CLD order with status:", JSON.stringify(error.response?.data));
      this.loggerService.error(
        `❌ Failed to place order in CLD: ${error.message}`,
      );
      throw error;
    }
  }

  async findOrderByShopifyId(shopifyOrderId: string): Promise<any | null> {
    try {
      await this.ensureAuthenticated();
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
    await this.ensureAuthenticated();

    try {
      const res = await axios.get(`${this.apiUrl}/Account/shipment-link`, {
        params: {
          id: orderId,
          docType,
          docNumber,
        },
        headers: {
          accept: "application/json",
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
