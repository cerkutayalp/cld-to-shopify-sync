import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ShopifyStockSyncService } from '../src/sync/sync.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const syncService = app.get(ShopifyStockSyncService);

  await syncService.syncAllStockFromCLD(true); // true = dryRun
  await app.close();
}

bootstrap().catch((err) => {
  console.error('❌ Sync failed:', err);
  process.exit(1);
});
