import { Test, TestingModule } from '@nestjs/testing';
import { CldController } from './cld.controller';

describe('CldController', () => {
  let controller: CldController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CldController],
    }).compile();

    controller = module.get<CldController>(CldController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
