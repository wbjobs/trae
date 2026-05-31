import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

interface LogEntry {
  timestamp: number;
  level: LogLevel;
  module: string;
  message: string;
  data?: any;
  traceId?: string;
}

interface LogConfig {
  level: LogLevel;
  console: boolean;
  file: boolean;
  fileDir: string;
  maxFileSize: number;
  maxFiles: number;
  json: boolean;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4
};

export class Logger extends EventEmitter {
  private config: LogConfig;
  private currentFileSize = 0;
  private currentFileIndex = 0;
  private writeStream?: fs.WriteStream;

  constructor(config: Partial<LogConfig> = {}) {
    super();
    this.config = {
      level: 'info',
      console: true,
      file: true,
      fileDir: path.join(process.cwd(), 'logs'),
      maxFileSize: 10 * 1024 * 1024,
      maxFiles: 5,
      json: true,
      ...config
    };

    if (this.config.file) {
      this.ensureLogDir();
      this.openLogFile();
    }
  }

  private ensureLogDir(): void {
    if (!fs.existsSync(this.config.fileDir)) {
      fs.mkdirSync(this.config.fileDir, { recursive: true });
    }
  }

  private openLogFile(): void {
    const filePath = this.getLogFilePath();
    this.writeStream = fs.createWriteStream(filePath, { flags: 'a' });
    this.currentFileSize = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
  }

  private getLogFilePath(): string {
    return path.join(this.config.fileDir, `app.${this.currentFileIndex}.log`);
  }

  private rotateFile(): void {
    if (this.writeStream) {
      this.writeStream.end();
    }
    
    this.currentFileIndex = (this.currentFileIndex + 1) % this.config.maxFiles;
    this.currentFileSize = 0;
    
    const filePath = this.getLogFilePath();
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    
    this.openLogFile();
  }

  private formatMessage(entry: LogEntry): string {
    const time = new Date(entry.timestamp).toISOString();
    const levelUpper = entry.level.toUpperCase();
    
    if (this.config.json) {
      return JSON.stringify({
        timestamp: time,
        level: entry.level,
        module: entry.module,
        message: entry.message,
        data: entry.data,
        traceId: entry.traceId
      }) + '\n';
    }
    
    const parts = [
      `[${time}]`,
      `[${levelUpper}]`,
      `[${entry.module}]`,
      entry.message
    ];
    
    if (entry.traceId) {
      parts.push(`[traceId: ${entry.traceId}]`);
    }
    
    if (entry.data) {
      parts.push(JSON.stringify(entry.data));
    }
    
    return parts.join(' ') + '\n';
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.config.level];
  }

  log(level: LogLevel, module: string, message: string, data?: any, traceId?: string): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      module,
      message,
      data,
      traceId
    };

    const formatted = this.formatMessage(entry);

    if (this.config.console) {
      const consoleMethod = level === 'fatal' ? 'error' : level;
      (console as any)[consoleMethod](formatted.trim());
    }

    if (this.config.file && this.writeStream) {
      this.writeStream.write(formatted);
      this.currentFileSize += Buffer.byteLength(formatted);
      
      if (this.currentFileSize >= this.config.maxFileSize) {
        this.rotateFile();
      }
    }

    this.emit('log', entry);
  }

  debug(module: string, message: string, data?: any, traceId?: string): void {
    this.log('debug', module, message, data, traceId);
  }

  info(module: string, message: string, data?: any, traceId?: string): void {
    this.log('info', module, message, data, traceId);
  }

  warn(module: string, message: string, data?: any, traceId?: string): void {
    this.log('warn', module, message, data, traceId);
  }

  error(module: string, message: string, data?: any, traceId?: string): void {
    this.log('error', module, message, data, traceId);
  }

  fatal(module: string, message: string, data?: any, traceId?: string): void {
    this.log('fatal', module, message, data, traceId);
  }

  setLevel(level: LogLevel): void {
    this.config.level = level;
    this.info('Logger', `Log level changed to: ${level}`);
  }

  getLevel(): LogLevel {
    return this.config.level;
  }

  queryLogs(filters: {
    level?: LogLevel;
    module?: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
  }): LogEntry[] {
    const results: LogEntry[] = [];
    const limit = filters.limit || 100;

    for (let i = 0; i < this.config.maxFiles; i++) {
      const filePath = path.join(this.config.fileDir, `app.${i}.log`);
      if (!fs.existsSync(filePath)) continue;

      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n').filter(l => l.trim());

      for (const line of lines) {
        try {
          const entry: LogEntry = JSON.parse(line);
          
          if (filters.level && entry.level !== filters.level) continue;
          if (filters.module && !entry.module.includes(filters.module)) continue;
          if (filters.startTime && entry.timestamp < filters.startTime) continue;
          if (filters.endTime && entry.timestamp > filters.endTime) continue;
          
          results.push(entry);
          
          if (results.length >= limit) {
            return results;
          }
        } catch {
          continue;
        }
      }
    }

    return results;
  }

  close(): void {
    if (this.writeStream) {
      this.writeStream.end();
    }
  }
}

export const logger = new Logger();
