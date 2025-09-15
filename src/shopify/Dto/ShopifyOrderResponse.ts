export interface ShopifyOrderResponse {
  count: number;
  orders: ShopifyOrder[];
}

export interface ShopifyOrder {
  id: number;
  admin_graphql_api_id: string;
  app_id: number;
  browser_ip: string | null;
  buyer_accepts_marketing: boolean;
  cancel_reason: string | null;
  cancelled_at: string | null;
  cart_token: string | null;
  checkout_id: number | null;
  checkout_token: string | null;
  client_details: ClientDetails | null;
  closed_at: string | null;
  confirmation_number: string;
  confirmed: boolean;
  contact_email: string;
  created_at: string;
  currency: string;
  current_subtotal_price: string;
  current_subtotal_price_set: MoneySet;
  current_total_additional_fees_set: any; // not present in your sample (nullable)
  current_total_discounts: string;
  current_total_discounts_set: MoneySet;
  current_total_duties_set: any; // nullable
  current_total_price: string;
  current_total_price_set: MoneySet;
  current_total_tax: string;
  current_total_tax_set: MoneySet;
  customer_locale: string | null;
  device_id: number | null;
  discount_codes: any[];
  duties_included: boolean;
  email: string;
  estimated_taxes: boolean;
  financial_status: string;
  fulfillment_status: string | null;
  landing_site: string | null;
  landing_site_ref: string | null;
  location_id: number | null;
  merchant_business_entity_id: string;
  merchant_of_record_app_id: number | null;
  name: string;
  note: string | null;
  note_attributes: any[];
  number: number;
  order_number: number;
  order_status_url: string;
  original_total_additional_fees_set: any;
  original_total_duties_set: any;
  payment_gateway_names: string[];
  phone: string | null;
  po_number: string | null;
  presentment_currency: string;
  processed_at: string;
  reference: string | null;
  referring_site: string | null;
  source_identifier: string | null;
  source_name: string;
  source_url: string | null;
  subtotal_price: string;
  subtotal_price_set: MoneySet;
  tags: string;
  tax_exempt: boolean;
  tax_lines: any[];
  taxes_included: boolean;
  test: boolean;
  token: string;
  total_cash_rounding_payment_adjustment_set: MoneySet;
  total_cash_rounding_refund_adjustment_set: MoneySet;
  total_discounts: string;
  total_discounts_set: MoneySet;
  total_line_items_price: string;
  total_line_items_price_set: MoneySet;
  total_outstanding: string;
  total_price: string;
  total_price_set: MoneySet;
  total_shipping_price_set: MoneySet;
  total_tax: string;
  total_tax_set: MoneySet;
  total_tip_received: string;
  total_weight: number;
  updated_at: string;
  user_id: number;
  billing_address: Address;
  shipping_address: Address;
  customer: Customer;
  discount_applications: any[];
  fulfillments: any[];
  line_items: LineItem[];
  payment_terms: PaymentTerms;
  refunds: any[];
  shipping_lines: any[];
}

export interface ClientDetails {
  accept_language: string | null;
  browser_height: number | null;
  browser_ip: string | null;
  browser_width: number | null;
  session_hash: string | null;
  user_agent: string | null;
}

export interface MoneySet {
  shop_money: Money;
  presentment_money: Money;
}

export interface Money {
  amount: string;
  currency_code: string;
}

export interface Address {
  first_name: string;
  address1: string;
  phone: string | null;
  city: string;
  zip: string;
  province: string | null;
  country: string;
  last_name: string;
  address2: string | null;
  company: string | null;
  latitude: number;
  longitude: number;
  name: string;
  country_code: string;
  province_code: string | null;
}

export interface Customer {
  id: number;
  created_at: string;
  updated_at: string;
  first_name: string;
  last_name: string;
  state: string;
  note: string | null;
  verified_email: boolean;
  multipass_identifier: string | null;
  tax_exempt: boolean;
  email_marketing_consent: EmailMarketingConsent;
  sms_marketing_consent: any;
  tags: string;
  email: string;
  phone: string | null;
  currency: string;
  tax_exemptions: any[];
  admin_graphql_api_id: string;
  default_address: DefaultAddress;
}

export interface EmailMarketingConsent {
  state: string;
  opt_in_level: string;
  consent_updated_at: string | null;
}

export interface DefaultAddress {
  id: number;
  customer_id: number;
  first_name: string;
  last_name: string;
  company: string | null;
  address1: string;
  address2: string;
  city: string;
  province: string | null;
  country: string;
  zip: string;
  phone: string | null;
  name: string;
  province_code: string | null;
  country_code: string;
  country_name: string;
  default: boolean;
}

export interface LineItem {
  id: number;
  admin_graphql_api_id: string;
  attributed_staffs: any[];
  current_quantity: number;
  fulfillable_quantity: number;
  fulfillment_service: string;
  fulfillment_status: string | null;
  gift_card: boolean;
  grams: number;
  name: string;
  price: string;
  price_set: MoneySet;
  product_exists: boolean;
  product_id: number;
  properties: any[];
  quantity: number;
  requires_shipping: boolean;
  sku: string;
  taxable: boolean;
  title: string;
  total_discount: string;
  total_discount_set: MoneySet;
  variant_id: number;
  variant_inventory_management: string;
  variant_title: string | null;
  vendor: string;
  tax_lines: any[];
  duties: any[];
  discount_allocations: any[];
}

export interface PaymentTerms {
  id: number;
  created_at: string;
  due_in_days: number | null;
  payment_schedules: any[];
  payment_terms_name: string;
  payment_terms_type: string;
  updated_at: string;
}
