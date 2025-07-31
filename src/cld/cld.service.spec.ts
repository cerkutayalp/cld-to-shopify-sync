import { Test, TestingModule } from '@nestjs/testing';
import { CldService } from './cld.service';

describe('CldService', () => {
  let service: CldService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CldService],
    }).compile();

    service = module.get<CldService>(CldService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
