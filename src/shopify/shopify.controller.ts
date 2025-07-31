import { Controller, Get } from '@nestjs/common';
import { ShopifyService } from './shopify.service';

@Controller('shopify')
export class ShopifyController {
  constructor(private readonly shopifyService: ShopifyService) {}

  @Get('products')
  async fetchProducts() {
    return this.shopifyService.getProducts();
  }

  @Get('orders')
  async fetchOrders() {
    return this.shopifyService.getOrders();
  }
}
