import { ShopifyOrder } from "../../shopify/Dto/ShopifyOrderResponse";
import { OrderPayload } from "../../cld/Dto/OrderPayload";

export function mapShopifyOrderToCldOrderPayload(
  order: ShopifyOrder,
  cartId: string,
  channel: string,
): OrderPayload {
  // ensure we only pass the first segment of the cartId
  const cleanCartId = cartId.split(";")[0];

  return {
    orderId: String(order.id),
    customerId: String(order.customer?.id || ""), // or 'guest'
    shippingAddress: {
      address: order.shipping_address?.address1,
      houseNumber: order.shipping_address?.address2 || "",
      postCode: order.shipping_address?.zip,
      city: order.shipping_address?.city,
      countryIso2: (order.shipping_address?.country_code).toUpperCase(),
    },
    clientInfo: {
      firstName: order.customer?.first_name,
      lastName: order.customer?.last_name,
      email: order.customer?.email,
      phone: order.customer?.phone || "",
      fax: "",
    },
    cartId: cleanCartId,
    channel: channel,
  };
}
