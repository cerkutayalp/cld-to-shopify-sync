import { Controller, Get, Post, Param, ParseIntPipe, BadRequestException } from '@nestjs/common';
import { CldService } from './cld.service';

@Controller('cld')
export class CldController {
  constructor(private readonly cldService: CldService) {}

  @Get('test-stock')
  async testStock() {
    try {
      const results = [];
      for await (const page of this.cldService.getStockList()) {
        results.push(...page);
      }
      return results;
    } catch (error: any) {
      console.error('💥 Error in testStock:', error);
      return {
        status: 'error',
        message: error?.message || 'Unknown error',
      };
    }
  }

  @Get('test-shopify-mapping')
  async testShopifyMapping() {
    try {
      const results = [];
      for await (const page of this.cldService.getStockList()) {
        for (const product of page) {
          results.push(this.cldService.mapCldToShopifyProduct(product));
        }
      }
      return results;
    } catch (error: any) {
      console.error('💥 Error in testShopifyMapping:', error);
      return {
        status: 'error',
        message: error?.message || 'Unknown error',
      };
    }
  }
  

  @Post('send-5-products')
  async sendFiveProducts() {
    try {
      await this.cldService.sendFirstFiveProductsToShopify();
      return { status: 'success', message: 'Sent 5 products to Shopify (as draft).' };
    } catch (error: any) {
      console.error('💥 Error in sendFiveProducts:', error);
      return {
        status: 'error',
        message: error?.message || 'Unknown error',
      };
    }
  }
  
// add product by id
  @Post('send-product/:identifier')
async sendProductByIdentifier(@Param('identifier') identifier: string) {
  if (!identifier || identifier.length < 3) {
    throw new BadRequestException('Invalid CLD product identifier.');
  }

  try {
    const result = await this.cldService.sendSpecificProductToShopify(identifier);
    return {
      status: 'success',
      message: `Product ${identifier} sent to Shopify.`,
      result,
    };
  } catch (error: any) {
    console.error(`💥 Error sending product ${identifier}:`, error);
    return {
      status: 'error',
      message: error?.message || `Failed to send product ${identifier}`,
    };
  }
}

@Post('send-all-products')
  async sendAllProducts() {
    try {
      await this.cldService.sendAllProductsToShopify();
      return { status: 'success', message: 'All products sent to Shopify (excluding existing ones).' };
    } catch (error: any) {
      console.error('💥 Error in sendAllProducts:', error);
      return {
        status: 'error',
        message: error?.message || 'Unknown error while sending all products',
      };
    }
  }

}
