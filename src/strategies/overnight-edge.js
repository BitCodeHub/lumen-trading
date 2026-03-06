/**
 * Overnight Edge Strategy
 * Win Rate: 62%+ on stocks
 * 
 * Buy at close (3:55 PM EST), sell at open (9:35 AM EST)
 * 70% of S&P 500 gains happen overnight
 * 
 * Enhanced: 5-day low overnight (buy at close when 5-day low)
 */

import { logger } from '../utils/logger.js';

export class OvernightEdgeStrategy {
  constructor() {
    this.name = 'Overnight Edge';
    this.winRate = 0.62;
  }

  /**
   * Check if current time is near market close
   */
  isNearMarketClose() {
    const now = new Date();
    const estHour = now.toLocaleString('en-US', { 
      timeZone: 'America/New_York', 
      hour: 'numeric', 
      hour12: false 
    });
    const estMinute = now.toLocaleString('en-US', { 
      timeZone: 'America/New_York', 
      minute: 'numeric' 
    });
    
    const hour = parseInt(estHour);
    const minute = parseInt(estMinute);
    
    // Between 3:30 PM and 4:00 PM EST
    return hour === 15 && minute >= 30;
  }

  /**
   * Check if current time is near market open
   */
  isNearMarketOpen() {
    const now = new Date();
    const estHour = now.toLocaleString('en-US', { 
      timeZone: 'America/New_York', 
      hour: 'numeric', 
      hour12: false 
    });
    const estMinute = now.toLocaleString('en-US', { 
      timeZone: 'America/New_York', 
      minute: 'numeric' 
    });
    
    const hour = parseInt(estHour);
    const minute = parseInt(estMinute);
    
    // Between 9:30 AM and 10:00 AM EST
    return hour === 9 && minute >= 30;
  }

  /**
   * Check for 5-day low
   */
  is5DayLow(prices) {
    if (prices.length < 5) return false;
    const currentPrice = prices[prices.length - 1];
    const past5Days = prices.slice(-6, -1); // Previous 5 days
    const min5Day = Math.min(...past5Days);
    return currentPrice <= min5Day * 1.002; // Within 0.2% of 5-day low
  }

  /**
   * Analyze for overnight edge
   */
  async analyze(asset, priceData) {
    // Only for stocks/ETFs
    const stockAssets = ['SPY', 'QQQ', 'IWM', 'DIA', 'AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA'];
    if (!stockAssets.includes(asset.toUpperCase())) {
      return { action: 'skip', confidence: 0, reason: 'Overnight strategy for stocks only' };
    }
    
    const closes = priceData?.map(d => d.close || d) || [];
    const currentPrice = closes[closes.length - 1];
    
    let action = 'skip';
    let confidence = 0.5;
    let reason = '';
    
    const nearClose = this.isNearMarketClose();
    const nearOpen = this.isNearMarketOpen();
    const is5DLow = this.is5DayLow(closes);
    
    // BUY: Near market close + 5-day low (strongest signal)
    if (nearClose && is5DLow) {
      action = 'long';
      confidence = 0.72;
      reason = `OVERNIGHT + 5-DAY LOW: Buy at close for overnight hold`;
      logger.info(`🌙 OVERNIGHT LONG: ${asset} at 5-day low near close`);
    }
    // BUY: Near market close (basic overnight)
    else if (nearClose) {
      action = 'long';
      confidence = 0.62;
      reason = `OVERNIGHT EDGE: Buy at close (3:55 PM EST), sell at open`;
    }
    // SELL: Near market open (exit overnight position)
    else if (nearOpen) {
      action = 'short'; // Actually means "close long"
      confidence = 0.60;
      reason = `OVERNIGHT EXIT: Sell at open (9:35 AM EST)`;
    }
    // Off-hours: no overnight signal
    else {
      reason = `Not near market open/close - overnight edge inactive`;
    }
    
    return {
      action,
      confidence: Math.min(confidence, 0.85),
      nearClose,
      nearOpen,
      is5DayLow: is5DLow,
      reason,
      strategy: this.name
    };
  }

  getStats() {
    return {
      name: this.name,
      expectedWinRate: this.winRate,
      entry: 'Market close (3:55 PM EST)',
      exit: 'Market open (9:35 AM EST)',
      enhancement: '5-day low boost'
    };
  }
}

export default OvernightEdgeStrategy;
