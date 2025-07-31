import { Controller, Get } from '@nestjs/common';
import { LoggerService } from './logger.service';

@Controller('logger')
export class LoggerController {
  constructor(private readonly loggerService: LoggerService) {}

  @Get('/logs')
  getLogs(): any[] {
    return this.loggerService.getAllLogs();
  }
}
