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

  // @Get('test-shopify-mapping')
  // async testShopifyMapping() {
  //   try {
  //     const results = [];
  //     for await (const page of this.cldService.getStockList()) {
  //       for (const product of page) {
  //         results.push(this.cldService.mapCldToShopifyProduct(product));
  //       }
  //     }
  //     return results;
  //   } catch (error: any) {
  //     console.error('💥 Error in testShopifyMapping:', error);
  //     return {
  //       status: 'error',
  //       message: error?.message || 'Unknown error',
  //     };
  //   }
  // }
  
}
