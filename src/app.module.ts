import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ShopifyModule } from './shopify/shopify.module';
import { CldModule } from './cld/cld.module';
import { ShopifyStockSyncService  } from './sync/sync.service';
import { SyncController } from './sync/sync.controller';
import { CronService } from './sync/cron/cron.service';
import { LoggerService } from './logger/logger.service';
import { ShipmentStatusService } from "../src/cld/Dto/shipment-status.service";
import { ShopifyService } from './shopify/shopify.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ShopifyModule,
    CldModule
  ],
  providers: [ShopifyStockSyncService, ShopifyService, CronService, LoggerService, ShipmentStatusService ],
  controllers: [SyncController],
})
export class AppModule {}
