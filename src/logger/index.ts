import winston from 'winston';
import path from 'node:path';
import fs from 'node:fs';
import { config } from '../config/index.js';

if (!fs.existsSync(config.logsDir)) {
  fs.mkdirSync(config.logsDir, { recursive: true });
}

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: () => new Date().toISOString() }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? 'info',
  format: logFormat,
  defaultMeta: { service: 'line-oa-monitor' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, module, ...meta }) => {
          const extra = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
          const mod = module ? `[${module}] ` : '';
          return `${timestamp} ${level}: ${mod}${message}${extra}`;
        })
      ),
    }),
    new winston.transports.File({
      filename: path.join(config.logsDir, 'app.log'),
      maxsize: 5_242_880,
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join(config.logsDir, 'error.log'),
      level: 'error',
      maxsize: 5_242_880,
      maxFiles: 5,
    }),
  ],
});

export function createModuleLogger(module: string) {
  return logger.child({ module });
}
