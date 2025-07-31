import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class LoggerService {
  private readonly logDir = path.join(__dirname, '../../logs');
  private readonly logFilePath = path.join(this.logDir, 'shopify-actions.json');

  private ensureLogDirExists() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true }); //create logs/ if missing
    }
  }

  private writeJsonLog(entry: Record<string, any>) {
    this.ensureLogDirExists(); //ensure folder exists before write

    const existingLogs = this.readLogs();
    existingLogs.push(entry);
    fs.writeFileSync(this.logFilePath, JSON.stringify(existingLogs, null, 2));
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

  logProductAction(action: 'CREATE' | 'UPDATE' | 'DELETE' | 'SKIPPED', productData: any, notes = '') {
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

  getAllLogs(): any[] {
    return this.readLogs();
  }

  clearLogs() {
    this.ensureLogDirExists();
    fs.writeFileSync(this.logFilePath, '[]');
  }
}
