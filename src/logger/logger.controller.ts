import { Controller, Get } from '@nestjs/common';
import { LoggerService } from './logger.service';

@Controller('logger')
export class LoggerController {
  constructor(private readonly loggerService: LoggerService) {}

  @Get('/products')
  getProductLogs() {
    return this.loggerService.getAllProductLogs();
  }

  @Get('/stocks')
  getStockLogs() {
    return this.loggerService.getAllStockLogs();
  }

  @Get('/orders')
  getOrderLogs() {
    return this.loggerService.getAllOrderLogs();
  }
}
