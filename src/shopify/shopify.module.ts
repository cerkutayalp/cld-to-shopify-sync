import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { ShopifyService } from './shopify.service';
import { ShopifyController } from './shopify.controller';

import { SyncController } from '../sync/sync.controller';
import { ShopifyStockSyncService } from '../sync/sync.service';
import { CldService } from '../cld/cld.service';
import { LoggerModule } from '../logger/logger.module';
import { ShipmentStatusService  } from '../cld/Dto/shipment-status.service';
import { LoggerService } from 'src/logger/logger.service';

@Module({
  imports: [ConfigModule, LoggerModule],
  controllers: [ShopifyController, SyncController], // Add SyncController
  providers: [
    ShopifyService,
    ShopifyStockSyncService,
    CldService,
    ShipmentStatusService ,
    LoggerService,
  ],
  exports: [ShopifyService],
})
export class ShopifyModule {}
