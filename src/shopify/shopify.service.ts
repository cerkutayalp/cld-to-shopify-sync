import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ShopifyService {
  private readonly store: string;
  private readonly token: string;

  constructor(private configService: ConfigService) {
    this.store = this.configService.get<string>('SHOPIFY_STORE')!;
    this.token = this.configService.get<string>('SHOPIFY_ACCESS_TOKEN')!;
  }

  async getProducts() {
    const url = `https://${this.store}/admin/api/2024-04/products.json`;
    const response = await axios.get(url, {
      headers: {
        'X-Shopify-Access-Token': this.token,
        'Content-Type': 'application/json'
      },
      params: {
        published_status: 'any',
        limit: 250,
      }
    });
    return response.data.products;
  }

  async getOrders() {
    const url = `https://${this.store}/admin/api/2024-04/orders.json?status=any`;
    const response = await axios.get(url, {
      headers: {
        'X-Shopify-Access-Token': this.token,
        'Content-Type': 'application/json'
      }
    });
    return response.data.orders;
  }
}

