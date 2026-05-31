const winston = require('winston');
const path = require('path');
const fs = require('fs');
const config = require('./config');

if (!fs.existsSync(config.logging.dir)) {
  fs.mkdirSync(config.logging.dir, { recursive: true });
}

const customFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
    return `${timestamp} [${level}] ${message} ${metaStr}`;
  })
);

const createLogger = (category) => {
  return winston.createLogger({
    level: config.logging.level,
    defaultMeta: {
      category,
      nodeId: config.server.nodeId,
      pid: process.pid
    },
    transports: [
      new winston.transports.File({
        filename: path.join(config.logging.dir, `${category}.log`),
        format: customFormat,
        maxsize: 20 * 1024 * 1024,
        maxFiles: 14
      })
    ]
  });
};

const loggers = {};
Object.keys(config.logging.categories).forEach(key => {
  loggers[key] = createLogger(config.logging.categories[key]);
});

const rootLogger = winston.createLogger({
  level: config.logging.level,
  format: customFormat,
  transports: [
    new winston.transports.Console({ format: consoleFormat }),
    new winston.transports.File({
      filename: path.join(config.logging.dir, 'combined.log'),
      maxsize: 20 * 1024 * 1024,
      maxFiles: 14
    })
  ]
});

module.exports = {
  ...loggers,
  info: (message, meta) => rootLogger.info(message, meta),
  error: (message, meta) => rootLogger.error(message, meta),
  warn: (message, meta) => rootLogger.warn(message, meta),
  debug: (message, meta) => rootLogger.debug(message, meta)
};
