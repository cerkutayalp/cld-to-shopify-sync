// shipment-status.service.ts
import { Injectable } from "@nestjs/common";
import axios from "axios";
import { ConfigService } from "@nestjs/config";
import { LoggerService } from "../../logger/logger.service";

export interface ShipmentStatusPayload {
  orderStatus: string;
  orderID: string;
  shipmentID: string;
  trackUrl: string;
  shaSign: string;
}

@Injectable()
export class ShipmentStatusService {
  private readonly shopifyApiUrl: string;
  private readonly shopifyToken: string;

  constructor(
    private configService: ConfigService,
    private loggerService: LoggerService
  ) {
    this.shopifyApiUrl = configService.get<string>("SHOPIFY_API_URL")!;
    this.shopifyToken = configService.get<string>("SHOPIFY_ACCESS_TOKEN")!;
  }

  async updateTrackingUrl(orderId: string, trackUrl: string, shipmentId?: string) {
    try {
      console.log(`🔍 Fetching fulfillments for order: ${orderId}`);

      // 1. Get fulfillments for this Shopify order
      const fulfillmentsResp = await axios.get(
        `${this.shopifyApiUrl}/admin/api/2023-10/orders/${orderId}/fulfillments.json`,
        {
          headers: { "X-Shopify-Access-Token": this.shopifyToken }
        }
      );

      console.log("📦 Fulfillments response:", JSON.stringify(fulfillmentsResp.data, null, 2));

      const fulfillments = fulfillmentsResp.data.fulfillments;
      if (!fulfillments?.length) {
        console.log(`⚠️ No fulfillments found for order ${orderId}`);
        this.loggerService.logOrderAction(
          "ERROR",
          { orderId },
          "No fulfillments found to update"
        );
        return { error: true, message: `No fulfillments found for ${orderId}` };
      }

      const fulfillmentId = fulfillments[0].id; // use the first fulfillment
      console.log(`✅ Using fulfillmentId: ${fulfillmentId}`);

      // 2. Build payload for update (must use tracking_info)
      const updatePayload = {
        fulfillment: {
          tracking_info: {
            // number: shipmentId || `CLD-${orderId}`,
            url: trackUrl,
            company: "Other"
          },
          notify_customer: false
        }
      };

      console.log("📤 Sending update payload:", JSON.stringify(updatePayload, null, 2));

      // 3. Call the correct update endpoint
      const updateResp = await axios.post(
        `${this.shopifyApiUrl}/admin/api/2023-10/fulfillments/${fulfillmentId}/update_tracking.json`,
        updatePayload,
        {
          headers: {
            "X-Shopify-Access-Token": this.shopifyToken,
            "Content-Type": "application/json"
          }
        }
      );

      console.log("✅ Shopify update response:", JSON.stringify(updateResp.data, null, 2));

      return updateResp.data;
    } catch (err: any) {
      console.error("❌ Error updating fulfillment:", err.response?.data || err.message);
      this.loggerService.logOrderAction(
        "ERROR",
        { orderId, error: err.response?.data || err.message },
        "Failed to update fulfillment tracking"
      );
      throw err;
    }
  }

  async handleCldWebhook(payload: ShipmentStatusPayload) {
    console.log("📦 Received CLD Payload:", JSON.stringify(payload, null, 2));

    if (!payload.trackUrl) {
      console.log("⚠️ No tracking URL provided, skipping");
      throw new Error("⚠️ No tracking URL provided");
    }

    const result = await this.updateTrackingUrl(
      payload.orderID,
      payload.trackUrl,
      payload.shipmentID
    );

    console.log("🎯 Final result:", JSON.stringify(result, null, 2));
    return result;
  }
}