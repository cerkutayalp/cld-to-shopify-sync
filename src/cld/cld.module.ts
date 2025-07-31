import { Module } from '@nestjs/common';
import { CldService } from './cld.service';
import { CldController } from './cld.controller';
import { ShopifyModule } from '../shopify/shopify.module';
import { LoggerModule } from '../logger/logger.module';

@Module({
  imports: [ShopifyModule, LoggerModule],
  providers: [CldService],
  controllers: [CldController],
  exports: [CldService],
})
export class CldModule {}