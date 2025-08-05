import { Module } from '@nestjs/common';
import { SyncController } from './sync.controller';
import { ShopifyStockSyncService } from './sync.service';
import { CldService } from '../cld/cld.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule],
  controllers: [SyncController],
  providers: [ShopifyStockSyncService, CldService],
})
export class SyncModule {}
