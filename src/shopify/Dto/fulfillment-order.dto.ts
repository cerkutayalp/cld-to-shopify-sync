export interface FulfillmentOrder {
  id: number;
  shop_id: number;
  order_id: number;
  assigned_location_id: number;
  request_status: string;
  status: string;
  supported_actions: string[];
  destination: {
    id: number;
    address1: string;
    address2?: string;
    city: string;
    province: string;
    province_code: string;
    country: string;
    country_code: string;
    zip: string;
    name: string;
    phone?: string;
    company?: string;
  };
  line_items: {
    id: number;
    shop_id: number;
    fulfillment_order_id: number;
    line_item_id: number;
    inventory_item_id: number;
    quantity: number;
    fulfillable_quantity: number;
    variant_id: number;
  }[];
  assigned_location: {
    address1: string;
    address2?: string;
    city: string;
    province: string;
    province_code: string;
    country: string;
    country_code: string;
    zip: string;
    name: string;
    phone?: string;
  };
  created_at: string;
  updated_at: string;
  delivery_method?: string;
  merchant_requests?: any[];
}
