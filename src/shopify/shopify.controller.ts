import { Controller, Get, Query  } from '@nestjs/common';
import { ShopifyService } from './shopify.service';
import { ShopifyStockSyncService } from '../sync/sync.service';

@Controller('shopify')
export class ShopifyController {
  constructor(private readonly shopifyService: ShopifyService, private readonly shopifyStockSyncService: ShopifyStockSyncService) {}

  @Get('products')
  async fetchProducts() {
    return this.shopifyService.getProducts();
  }

  // @Get('orders')
  // async fetchOrders() {
  //   return this.shopifyService.getOrders();
  // }

  @Get('orders')
async getAllOrdersStreamed(@Query('limit') limit = 50) {
  const orders = [];

  for await (const order of this.shopifyService.getAllOrders(+limit)) {
    orders.push(order);
  }

  return { count: orders.length, orders };
}

}
