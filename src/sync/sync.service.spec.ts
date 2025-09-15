import { Test, TestingModule } from "@nestjs/testing";
import { ShopifyStockSyncService } from "./sync.service";

describe("ShopifyStockSyncService", () => {
  let service: ShopifyStockSyncService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [ShopifyStockSyncService],
    }).compile();

    service = module.get<ShopifyStockSyncService>(ShopifyStockSyncService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });
});
