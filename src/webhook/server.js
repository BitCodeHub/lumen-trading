/**
 * Webhook Server for LUMEN ALPHA Trading Bot
 * 
 * Receives signals from TradingView, custom alerts, etc.
 */

import { logger } from '../utils/logger.js';

export class WebhookServer {
  constructor(config = {}) {
    this.secret = config.secret || process.env.WEBHOOK_SECRET;
    this.maxSignalAge = config.maxSignalAge || 5 * 60 * 1000; // 5 minutes
    this.rateLimit = {
      maxSignals: config.maxSignals || 10,
      perMinute: config.perMinute || 1,
      signals: []
    };
    
    logger.info('Webhook Server initialized');
  }
  
  /**
   * Validate incoming webhook
   */
  validate(req) {
    const errors = [];
    
    // Check secret
    const providedSecret = req.query?.key || req.headers['x-webhook-secret'];
    if (providedSecret !== this.secret) {
      errors.push('Invalid webhook secret');
    }
    
    // Check body
    if (!req.body || typeof req.body !== 'object') {
      errors.push('Invalid request body');
    }
    
    // Check required fields
    const { asset, action, signal } = req.body || {};
    if (!asset) {
      errors.push('Missing asset');
    }
    if (!action && !signal) {
      errors.push('Missing action or signal');
    }
    
    // Check rate limit
    if (!this.checkRateLimit()) {
      errors.push('Rate limit exceeded');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  /**
   * Check rate limit
   */
  checkRateLimit() {
    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;
    
    // Clean old signals
    this.rateLimit.signals = this.rateLimit.signals.filter(t => t > oneMinuteAgo);
    
    // Check limit
    if (this.rateLimit.signals.length >= this.rateLimit.maxSignals) {
      return false;
    }
    
    // Add current signal
    this.rateLimit.signals.push(now);
    return true;
  }
  
  /**
   * Parse TradingView alert format
   */
  parseTradingViewAlert(body) {
    // TradingView can send various formats
    // Support multiple common formats
    
    // Format 1: { action: "buy", ticker: "BTCUSD", price: 67000 }
    // Format 2: { signal: "long", asset: "BTC-PERP", close: 67000 }
    // Format 3: Plain text parsing
    
    if (typeof body === 'string') {
      body = this.parseTextAlert(body);
    }
    
    return {
      asset: body.asset || body.ticker || body.symbol || 'UNKNOWN',
      action: body.action || body.signal || 'unknown',
      price: body.price || body.close || null,
      strength: body.strength || body.confidence || 'medium',
      timestamp: body.timestamp || body.time || new Date().toISOString(),
      strategy: body.strategy || 'tradingview',
      raw: body
    };
  }
  
  /**
   * Parse text alert (for simple TradingView alerts)
   */
  parseTextAlert(text) {
    const signal = {
      action: 'unknown',
      asset: 'UNKNOWN'
    };
    
    const lower = text.toLowerCase();
    
    // Detect action
    if (lower.includes('buy') || lower.includes('long')) {
      signal.action = 'long';
    } else if (lower.includes('sell') || lower.includes('short')) {
      signal.action = 'short';
    } else if (lower.includes('close')) {
      signal.action = 'close';
    }
    
    // Detect asset (common patterns)
    const assetPatterns = [
      /\b(BTC|ETH|SOL|XRP|DOGE|AVAX|LINK|ARB)(-?PERP|-?USD|-?USDT)?\b/i,
      /\b(AAPL|MSFT|NVDA|TSLA|AMZN|META|GOOGL|SPY|QQQ)\b/i
    ];
    
    for (const pattern of assetPatterns) {
      const match = text.match(pattern);
      if (match) {
        signal.asset = match[0].toUpperCase();
        break;
      }
    }
    
    // Extract price if present
    const priceMatch = text.match(/\$?([\d,]+\.?\d*)/);
    if (priceMatch) {
      signal.price = parseFloat(priceMatch[1].replace(',', ''));
    }
    
    return signal;
  }
}

export default WebhookServer;
