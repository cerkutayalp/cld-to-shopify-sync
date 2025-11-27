import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LoggerService {
  constructor(private prisma: PrismaService) {}

  // ---- NestJS built-in style ----
  async log(message: any, ...optionalParams: any[]) {
    console.log(message, ...optionalParams);
    await this.prisma.productLog.create({
      data: {
        action: 'LOG',
        sku: 'N/A',
        title: '',
        notes: message,
        data: optionalParams as any,
      },
    });
  }

  async error(message: any, trace?: string, ...optionalParams: any[]) {
    console.error(message, trace || '', ...optionalParams);
    await this.prisma.productLog.create({
      data: {
        action: 'ERROR',
        sku: 'N/A',
        title: '',
        notes: `${message} | ${trace || ''}`,
        data: optionalParams as any,
      },
    });
  }

  async warn(message: any, ...optionalParams: any[]) {
    console.warn(message, ...optionalParams);
    await this.prisma.productLog.create({
      data: {
        action: 'WARN',
        sku: 'N/A',
        title: '',
        notes: message,
        data: optionalParams as any,
      },
    });
  }

  // ---- Domain-specific loggers ----
  async logProductAction(
    action: 'CREATE' | 'UPDATE' | 'DELETE' | 'SKIPPED' | 'ERROR',
    productData: any,
    notes = ''
  ) {
    const sku = productData?.variants?.[0]?.sku || 'N/A';
    const title = productData?.title || '';

    await this.prisma.productLog.create({
      data: {
        action,
        sku,
        title,
        notes,
        data: productData,
      },
    });
  }

  async logStockSync(
    action: 'UPDATE' | 'SKIP' | 'ERROR',
    stockData: any,
    notes = ''
  ) {
    await this.prisma.stockLog.create({
      data: {
        action,
        sku: stockData?.sku || 'N/A',
        notes,
        data: stockData,
      },
    });
  }

  async logOrderAction(
    action:
      | 'RECEIVED'
      | 'MAPPED'
      | 'PLACED'
      | 'ERROR'
      | 'SKIPPED'
      | 'FULFILLED'
      | 'TRACKING_FETCHED'
      | 'TRACKING_FOUND'
      | 'FULFILLMENT_CREATED'
      | 'TRACKING_MISSING',

    shopifyOrder: any = null,
    cldResponse: any = null,
    notes = ''
  ) {
    await this.prisma.orderLog.create({
      data: {
        action,
        // Shopify
        shopifyOrderId: shopifyOrder?.id?.toString() ?? null,
        shopifyCustomerId: shopifyOrder?.customer?.id?.toString() ?? null,
        shopifyData: shopifyOrder,

        // CLD
        cldCustomerId: cldResponse?.customerId ?? null,
        cldOrderId: cldResponse?.orderId ?? null,
        cldData: cldResponse,

        notes,
      },
    });
  }

  // ---- Retrieve ----
  async getAllProductLogs() {
    return this.prisma.productLog.findMany({ orderBy: { timestamp: 'desc' } });
  }

  async getAllStockLogs() {
    return this.prisma.stockLog.findMany({ orderBy: { timestamp: 'desc' } });
  }

  async getAllOrderLogs() {
    return this.prisma.orderLog.findMany({ orderBy: { timestamp: 'desc' } });
  }
}
  
