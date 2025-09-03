console.log ('workinggggg')
import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class LoggerService {
  private readonly logDir = path.join(__dirname, '../../logs');
  private readonly logFilePath = path.join(this.logDir, 'shopify-actions.json');
constructor() {
    console.log('🧾 logFilePath:', this.logFilePath);
  }

  private ensureLogDirExists() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true }); //create logs/ if missing
    }
  }

  private writeJsonLog(entry: Record<string, any>) {
    this.ensureLogDirExists(); //ensure folder exists before write
   
    fs.appendFileSync(this.logFilePath, JSON.stringify(entry, null, 2));
  }
  

  private readLogs(): any[] {
    try {
      if (fs.existsSync(this.logFilePath)) {
        const data = fs.readFileSync(this.logFilePath, 'utf8');
        return JSON.parse(data || '[]');
      }
      return [];
    } catch {
      return [];
    }
  }

  // Required by NestJS LoggerService interface:
  log(message: any, ...optionalParams: any[]) {
    console.log(message, ...optionalParams);
  }

  error(message: any, trace?: string, ...optionalParams: any[]) {
    console.error(message, trace || '', ...optionalParams);
    // Optional: also write to file
    this.writeJsonLog({
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      message,
      trace,
      context: optionalParams,
    });
  }

  warn(message: any, ...optionalParams: any[]) {
    console.warn(message, ...optionalParams);
  }

  logProductAction(action: 'CREATE' | 'UPDATE' | 'DELETE' | 'SKIPPED', productData: any, notes = '') {
     console.log('🔍 logProductAction CALLED with', { action, sku: productData?.variants?.[0]?.sku });
    const logEntry = {
      timestamp: new Date().toISOString(),
      action,
      sku: productData?.variants?.[0]?.sku || 'N/A',
      title: productData?.title || '',
      notes,
      data: productData,
    };

    this.writeJsonLog(logEntry);
  }

  logStockSync(action: 'UPDATE' | 'SKIP' | 'ERROR', stockData: any, notes = '') {
  const logEntry = {
    timestamp: new Date().toISOString(),
    action,
    sku: stockData?.sku || 'N/A',
    notes,
    data: stockData,
  };

  const stockLogPath = path.join(this.logDir, 'stock-sync.json');
  this.ensureLogDirExists();

  const existingLogs = fs.existsSync(stockLogPath)
    ? JSON.parse(fs.readFileSync(stockLogPath, 'utf8') || '[]')
    : [];

  existingLogs.push(logEntry);
  fs.writeFileSync(stockLogPath, JSON.stringify(existingLogs, null, 2));
}

//logger for Orders
logOrderAction(action: 'RECEIVED' | 'MAPPED' | 'PLACED' | 'ERROR' | 'SKIPPED' | 'FULFILLED', orderData: any, notes = '') {
  const orderLogPath = path.join(this.logDir, 'shopify-orders.json');
  this.ensureLogDirExists();

  const logEntry = {
    timestamp: new Date().toISOString(),
    action,
    shopifyOrderId: orderData?.id || 'N/A',
    notes,
    data: orderData,
  };

  const existingLogs = fs.existsSync(orderLogPath)
    ? JSON.parse(fs.readFileSync(orderLogPath, 'utf8') || '[]')
    : [];

  existingLogs.push(logEntry);
  fs.writeFileSync(orderLogPath, JSON.stringify(existingLogs, null, 2));
}


  getAllLogs(): any[] {
    return this.readLogs();
  }

  clearLogs() {
    this.ensureLogDirExists();
    fs.writeFileSync(this.logFilePath, '[]');
  }
}
