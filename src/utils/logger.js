/**
 * Logger for LUMEN ALPHA Trading Bot
 * All trades and decisions are logged for audit
 */

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

class Logger {
  constructor(level = 'info') {
    this.level = LOG_LEVELS[level] || LOG_LEVELS.info;
  }
  
  _log(level, message, data = {}) {
    if (LOG_LEVELS[level] < this.level) return;
    
    const entry = {
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      message,
      ...data
    };
    
    const color = {
      debug: '\x1b[36m',  // cyan
      info: '\x1b[32m',   // green
      warn: '\x1b[33m',   // yellow
      error: '\x1b[31m'   // red
    }[level] || '';
    
    console.log(`${color}[${entry.timestamp}] [${entry.level}] ${message}\x1b[0m`, 
      Object.keys(data).length ? JSON.stringify(data, null, 2) : '');
  }
  
  debug(message, data) { this._log('debug', message, data); }
  info(message, data) { this._log('info', message, data); }
  warn(message, data) { this._log('warn', message, data); }
  error(message, data) { this._log('error', message, data); }
}

export const logger = new Logger(process.env.LOG_LEVEL || 'info');
export default logger;
