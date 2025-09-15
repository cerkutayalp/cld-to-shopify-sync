import { Injectable } from "@nestjs/common";
import axios from "axios";
import { ConfigService } from "@nestjs/config";
import { ShopifyOrderResponse } from "./Dto/ShopifyOrderResponse";

@Injectable()
export class ShopifyService {
  private readonly store: string;
  private readonly token: string;
    private readonly headers: any

  constructor(private configService: ConfigService) {
    this.store = this.configService.get<string>("SHOPIFY_STORE")!;
    this.token = this.configService.get<string>("SHOPIFY_ACCESS_TOKEN")!;
    this.headers = {
      "X-Shopify-Access-Token": this.token,
      "Content-Type": "application/json",
    };
    
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
      const url = `${baseUrl}?status=any&financial_status=paid&limit=${limit}${pageInfo}`;
      const response = await axios.get(url, {
        headers: {
          "X-Shopify-Access-Token": this.token,
          "Content-Type": "application/json",
        },
      });

      const orders: ShopifyOrderResponse = response.data;


       // High-level log for Fulfillment batch
      console.log(`Fetched ${orders.orders.length} orders in this batch`);
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

//fulfillment status

// async getFulfillmentOrders(orderId: number) {
//   const url = `https://${this.store}/admin/api/2024-04/orders/${orderId}/fulfillment_orders.json`;
//   const response = await axios.get(url, { headers: this.headers });
//   return response.data.fulfillment_orders;
// }
// async createFulfillment(orderId: number) {
//   // 1. Get fulfillment orders for this order
//   const fulfillmentOrders = await this.getFulfillmentOrders(orderId);

//   if (!fulfillmentOrders.length) {
//     throw new Error(`No fulfillment orders found for Shopify order ${orderId}`);
//   }

//   // 2. Build payload for all fulfillment orders
//   const lineItemsByFulfillmentOrder = fulfillmentOrders.map((fo: any) => ({
//     fulfillment_order_id: fo.id,
//     fulfillment_order_line_items: fo.line_items.map((li: any) => ({
//       id: li.id,
//       quantity: li.quantity,
//     }))
//   }));

//   const url = `https://${this.store}/admin/api/2024-04/fulfillments.json`;
//   const payload = {
//     fulfillment: {
//       line_items_by_fulfillment_order: lineItemsByFulfillmentOrder,
//       notify_customer: false // optional
//     }
//   };

//   const response = await axios.post(url, payload, { headers: this.headers });
//   console.log(`🚚 Fulfillment created for order ${orderId}`, response.data.fulfillment);
//   return response.data.fulfillment;
// }



  
}
