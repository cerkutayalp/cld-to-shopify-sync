export interface OrderPayload {
  orderId: string;
  customerId: string;
  shippingAddress: {
    address: string;
    houseNumber: string;
    postCode: string;
    city: string;
    countryIso2: string; // ISO 2-letter country code
  };
  clientInfo: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    fax: string;
  };
  cartId: string;
}

export interface PlaceOrderResponse {
  customerOrderId: string;
  orderId: string;
  docType: string;
  docNumber: string;
  status: boolean;
  message: string;
  pdfFile: string;
  error: string | null;
  code: number;
}